import "server-only";
import { hashPassword } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { AREA_DEFS } from "@/lib/area-map";
import { READY_PREF } from "@/lib/launch";
import { connectDemoRex } from "@/lib/rex-user";
import { demoMode } from "./mode";
import { demoWorld, resetDemoWorld } from "./world";

/**
 * THE DEMO'S OWN DATABASE, SET UP (lib/demo/mode).
 *
 * The demo service starts on an empty database. lib/db builds the tables, as
 * it does anywhere; this adds the few rows a person needs to walk in:
 *
 *   - a sign-in for each invented member of staff (lib/demo/world-data STAFF),
 *     all on one shared password, DEMO_PASSWORD, which James sets on the demo
 *     service and gives to whoever is showing it. No DEMO_PASSWORD, no
 *     sign-ins: there is no built-in password to guess.
 *   - first-run set-up marked done, so nobody showing it meets the wizard
 *   - every area open, so the whole system is on show
 *
 * Idempotent: run at every boot and by the nightly reset. It never touches a
 * database unless DEMO_MODE=1, checked here as well as by its callers, so it
 * cannot run against live by being imported from the wrong place.
 */

const ROLE = { agent: "agent", office: "super_admin", owner: "owner" } as const;

export async function seedDemo(): Promise<{ users: number; homes: number; signIns: boolean }> {
  if (!demoMode() || !hasDb()) return { users: 0, homes: 0, signIns: false };
  const password = (process.env.DEMO_PASSWORD ?? "").trim();
  const world = demoWorld();
  const stamp = new Date().toISOString();
  const setup = { done: { password: stamp, rex: stamp, email: stamp, how: stamp, look: stamp }, emailSkipped: true, finishedAt: stamp, tour: "skipped", tourAt: stamp };

  for (const u of world.users) {
    const id = `demo-${u.id}`;
    await q(
      `INSERT INTO os_users (id, email, name, role, password_hash, rex_user_id, email_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash, rex_user_id = EXCLUDED.rex_user_id, locked_at = NULL`,
      [id, u.email, u.name, ROLE[u.role], password ? hashPassword(password) : "no-sign-in-until-DEMO_PASSWORD-is-set", u.id]
    );
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, 'os-setup', $2::jsonb, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [id, JSON.stringify(setup)]
    );
    /* The dashboard's get-set checklist is for a new starter, not a demo. */
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [id, READY_PREF, JSON.stringify({ tourAt: stamp, dismissedAt: stamp })]
    );
    await connectDemoRex(id, u.email);
    /* Steve has already met them: no "what should I call you?" over the first screen. */
    await q(
      `INSERT INTO os_assistant_log (id, user_id, user_email, role, text, kind) VALUES ($1, $2, $3, 'assistant', 'Introduced at demo set-up.', 'onboarding-help')
       ON CONFLICT (id) DO NOTHING`,
      [`demo-met-${u.id}`, id, u.email]
    );
  }
  /* Real people's own sign-ins (DEMO_EXTRA_LOGINS on the demo service, set by
     James: "Name <email>, Name <email>"). Kept in a setting, not in this
     file, because the repository is public. Each sees the whole business,
     and stands in one invented agent's shoes for the screens that are about
     "my" diary and "my" homes, so nothing they open is empty. Same shared
     password. */
  const agents = world.users.filter((u) => u.role === "agent");
  const extras = (process.env.DEMO_EXTRA_LOGINS ?? "")
    .split(",")
    .map((x) => /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(x))
    .filter((m): m is RegExpExecArray => Boolean(m));
  for (const [n, m] of extras.entries()) {
    const email = m[2].toLowerCase();
    const as = agents[n % agents.length];
    const id = `demo-extra-${email.replace(/[^a-z0-9]+/g, "-")}`;
    await q(
      `INSERT INTO os_users (id, email, name, role, password_hash, rex_user_id, email_checked_at)
       VALUES ($1, $2, $3, 'owner', $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, rex_user_id = EXCLUDED.rex_user_id, locked_at = NULL`,
      [id, email, m[1] || email.split("@")[0], password ? hashPassword(password) : "no-sign-in-until-DEMO_PASSWORD-is-set", as.id]
    );
    for (const [key, value] of [["os-setup", setup], [READY_PREF, { tourAt: stamp, dismissedAt: stamp }]] as const) {
      await q(
        `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [id, key, JSON.stringify(value)]
      );
    }
    /* Their diary is the invented agent's: the OS finds a person's calendar by their REX address. */
    await connectDemoRex(id, as.email);
    await q(
      `INSERT INTO os_assistant_log (id, user_id, user_email, role, text, kind) VALUES ($1, $2, $3, 'assistant', 'Introduced at demo set-up.', 'onboarding-help')
       ON CONFLICT (id) DO NOTHING`,
      [`demo-met-${id}`, id, email]
    );
  }

  /* The managed-homes list (os_properties): the OS's own record of which
     homes are ours, which Compliance, Inspections and Portfolio all read. On
     live it came across from the old property-management system; here it is
     every let home in the invented world, the same homes REX's side shows. */
  type Row = Record<string, unknown>;
  const lets = world.rows.listings.filter((l) => l.system_listing_state === "leased");
  for (const l of lets) {
    const p = l.property as Row;
    const relns = ((l.related as Row).contact_reln_listing as Row[]) ?? [];
    const owner = relns.find((r) => (r.reln_type as Row).id === "owner")?.contact as Row | undefined;
    const tenants = relns.filter((r) => (r.reln_type as Row).id === "purchtenant").map((r) => String((r.contact as Row).name));
    const service = String((l.lettings_service_type as Row).text);
    const line = [p.adr_unit_number, `${p.adr_street_number} ${p.adr_street_name}`].filter(Boolean).join(", ");
    const hasGas = world.rows.compliance.some((c) => String(c.parent_object_id) === String(p.id) && c.type_id === "gas_safety");
    await q(
      `INSERT INTO os_properties (id, source, ref, address, name, locality, postcode, town, bedrooms, management, rex_property_id, match_how, active,
          landlord_name, landlord_email, landlord_phone, agent_name, tenant_names, service_level, service_basis, pm_managed, pm_status, pm_service, pm_read_at, no_gas)
       VALUES ($1, 'rex-pm', $2, $3, $4, $5, $6, $7, $8, 'Active letting agreement', $9, 'confident: exact', TRUE,
          $10, $11, $12, $13, $14, $15, 'Demo set-up', TRUE, 'occupied', $16, NOW(), $17)
       ON CONFLICT (id) DO UPDATE SET address = EXCLUDED.address, name = EXCLUDED.name, locality = EXCLUDED.locality, postcode = EXCLUDED.postcode,
          landlord_name = EXCLUDED.landlord_name, landlord_email = EXCLUDED.landlord_email, landlord_phone = EXCLUDED.landlord_phone, agent_name = EXCLUDED.agent_name,
          tenant_names = EXCLUDED.tenant_names, service_level = EXCLUDED.service_level, pm_service = EXCLUDED.pm_service, pm_read_at = NOW(), active = TRUE, pm_managed = TRUE`,
      [
        `pm-demo-${p.id}`, `PRP${String(p.id).slice(-5)}`, String(p.system_search_key), line, `${p.adr_suburb_or_town} ${p.adr_postcode}`, p.adr_postcode, p.adr_suburb_or_town,
        Number(l._beds ?? 2), String(p.id), owner?.name ?? null, owner?.email_address ?? null, owner?.phone_number ?? null, (l.listing_agent_1 as Row).name,
        tenants.join(", ") || null, service === "Let Only" ? "market_only" : service === "Rent Collect" ? "rent_collect" : "managed",
        service === "Let Only" ? "Tenant Find Service" : service === "Rent Collect" ? "Rent Collect Service" : "Experts Managed Service", !hasGas,
      ]
    );
  }
  for (const a of AREA_DEFS) {
    await q(
      `INSERT INTO os_area_access (area, level, changed_by, changed_at) VALUES ($1, 'everyone', 'Demo set-up', NOW())
       ON CONFLICT (area) DO UPDATE SET level = 'everyone', changed_by = 'Demo set-up', changed_at = NOW()`,
      [a.id]
    );
  }
  return { users: world.users.length + extras.length, homes: lets.length, signIns: Boolean(password) };
}

/**
 * Back to this morning: the invented world rebuilt, and everything anybody
 * typed into the demo's own tables since cleared. Kept tables are the ones
 * set-up fills (users, their set-up, area access) and the bookkeeping the
 * server needs. DEMO_MODE only - this empties tables.
 */
export async function resetDemo(): Promise<{ cleared: number }> {
  if (!demoMode() || !hasDb()) return { cleared: 0 };
  const keep = new Set(["os_users", "os_user_prefs", "os_area_access", "os_switches", "os_sessions_revoked"]);
  const tables = await q<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'os\\_%'`);
  const clear = tables.map((t) => t.tablename).filter((t) => !keep.has(t) && /^[a-z0-9_]+$/.test(t));
  if (clear.length) await q(`TRUNCATE ${clear.map((t) => `"${t}"`).join(", ")}`);
  await q(`DELETE FROM os_user_prefs`);
  await q(`DELETE FROM os_switches`);
  resetDemoWorld();
  await seedDemo();
  return { cleared: clear.length };
}
