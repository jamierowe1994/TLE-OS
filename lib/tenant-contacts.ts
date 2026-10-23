import "server-only";
import { hasDb, q } from "@/lib/db";

/*
 * TENANTS' EMAIL AND MOBILE, HELD BY THE OS (James, 9 Oct 2026): "we need
 * email and mobile number". REX PM gives the book tenants' names only; its
 * Tenancies report (Reporting > Table reports > Tenancies, exported 9 Oct)
 * carries each tenancy contact's phone and email. Imported here once, keyed
 * by the OS home and the tenant's name exactly as REX PM spells it, so the
 * book can put them on the home's tenants. The OS owns the data from here
 * (REX PM goes at launch): nothing is written back to REX PM.
 */

export type TenantContact = { email: string | null; phone: string | null };

let ready: Promise<void> | null = null;
export function ensureTenantContacts(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_tenant_contacts (
      os_property_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      source TEXT NOT NULL,
      source_ref TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (os_property_id, name_key)
    )`).then(() => undefined).catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

/** "Keanne  Joccoaa Galloway" and "keanne joccoaa galloway" are one key. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Every held contact, by OS home id then name key. Empty without a database. */
export async function tenantContacts(): Promise<Map<string, Map<string, TenantContact>>> {
  const out = new Map<string, Map<string, TenantContact>>();
  if (!hasDb()) return out;
  await ensureTenantContacts();
  const rows = await q<{ os_property_id: string; name_key: string; email: string | null; phone: string | null }>(
    `SELECT os_property_id, name_key, email, phone FROM os_tenant_contacts`,
    []
  );
  for (const r of rows) {
    const home = out.get(r.os_property_id) ?? new Map<string, TenantContact>();
    home.set(r.name_key, { email: r.email, phone: r.phone });
    out.set(r.os_property_id, home);
  }
  return out;
}

/**
 * Changed by hand on the home's page (Sean McMahon, 21 Oct 2026: "change a
 * tenant's email address from the Portfolio home page", 3 Oak Place). A REX
 * PM tenant has no REX contact, so the OS's own row is the record. Both
 * values are written, as the card holds them, so a number that came from
 * PayProp is not lost when only the email is changed.
 */
export async function saveTenantContact(osPropertyId: string, name: string, c: TenantContact, by: string): Promise<void> {
  await ensureTenantContacts();
  await q(
    `INSERT INTO os_tenant_contacts (os_property_id, name, name_key, email, phone, source, source_ref, imported_at)
     VALUES ($1, $2, $3, $4, $5, 'os-edit', $6, NOW())
     ON CONFLICT (os_property_id, name_key) DO UPDATE
       SET email = EXCLUDED.email, phone = EXCLUDED.phone, source = 'os-edit', source_ref = EXCLUDED.source_ref, imported_at = NOW()`,
    [osPropertyId, name, nameKey(name), c.email, c.phone, by]
  );
}
