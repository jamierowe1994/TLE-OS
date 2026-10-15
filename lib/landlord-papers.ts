import "server-only";
import { hasDb, q } from "@/lib/db";
import { parseAddress, sameHome } from "@/lib/address-parse";
import { londonToday } from "@/lib/london-clock";

/**
 * A LANDLORD'S ID AND AML, ONCE (Jade Grewal, 14 Oct 2026: "A landlord with
 * multiple properties, will he have to upload ID each time?").
 *
 * No. The PLC pack has filled them from a landlord's other homes since
 * 8 Oct (lib/plc-from-file, b04974c5); this is the same idea for the portal
 * and the appraisal file, without re-reading anything. A paper is on file
 * when one of these holds it for the same person:
 *   - their own portal upload on another of their properties
 *   - another home's PLC pack (by the landlord's name), filed as their ID or AML
 *   - the Documents tab of another home the property record says is theirs
 * An ID must not have expired (when the reader found an expiry); an AML
 * check counts for twelve months.
 */

export interface PaperOnFile {
  at: string;
  /** The other home it came from, first line only. */
  from: string | null;
}

export interface PapersOnFile {
  id: PaperOnFile | null;
  aml: PaperOnFile | null;
}

const AML_DAYS = 365;
const firstLine = (s: string | null | undefined) => (s ?? "").split(",")[0].trim() || null;
const iso = (v: string | Date) => new Date(v).toISOString();

type PackDoc = { checkId?: string; addedAt?: string; placeholder?: boolean; read?: { expiryDate?: string | null; issueDate?: string | null } | null };

/**
 * Their ID and AML from anywhere but `notAt` (the home being asked about).
 * Matched by name for packs and homes - the same key the PLC uses - and by
 * email for their own portal uploads.
 */
export async function landlordPapersOnFile(p: { name?: string | null; email?: string | null; notAt?: string | null; notAppraisal?: string | null }): Promise<PapersOnFile> {
  const out: PapersOnFile = { id: null, aml: null };
  if (!hasDb()) return out;
  const name = (p.name ?? "").trim().toLowerCase();
  const email = (p.email ?? "").trim().toLowerCase();
  const today = londonToday();
  const amlFrom = new Date(Date.now() - AML_DAYS * 86_400_000).toISOString();
  const elsewhere = (address: string | null | undefined) => !p.notAt || !address || !sameHome(address, p.notAt);
  const better = (have: PaperOnFile | null, next: PaperOnFile) => (!have || next.at > have.at ? next : have);

  const [portal, packs, homes] = await Promise.all([
    email
      ? q<{ kind: string; uploaded_at: string | Date; appraisal_id: string | null; address: string | null }>(
          `SELECT d.kind, d.uploaded_at, d.appraisal_id, m.address
             FROM os_portal_accounts a
             JOIN os_landlord_documents d ON d.account_id = a.id
             LEFT JOIN os_market_appraisals m ON m.id = d.appraisal_id
            WHERE a.kind = 'landlord' AND a.email = $1 AND d.kind = 'id'`,
          [email]
        ).catch(() => [])
      : Promise.resolve([]),
    name.length > 3
      ? q<{ address: string; documents: PackDoc[] | null }>(
          `SELECT address, documents FROM os_plc_cases WHERE lower(trim(landlord_name)) = $1`,
          [name]
        ).catch(() => [])
      : Promise.resolve([]),
    name.length > 3 || email
      ? q<{ id: string; rex_property_id: string | null; address: string }>(
          `SELECT id, rex_property_id, address FROM os_properties
            WHERE active AND ((length($1) > 3 AND lower(trim(landlord_name)) = $1) OR ($2 <> '' AND lower(trim(landlord_email)) = $2))`,
          [name, email]
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const d of portal) {
    if (p.notAppraisal && d.appraisal_id === p.notAppraisal) continue;
    out.id = better(out.id, { at: iso(d.uploaded_at), from: firstLine(d.address) });
  }

  for (const pack of packs) {
    if (!elsewhere(pack.address)) continue;
    for (const d of pack.documents ?? []) {
      if (d.placeholder || !d.addedAt) continue;
      if (d.checkId === "landlord-id-aml") {
        if (d.read?.expiryDate && d.read.expiryDate < today) continue;
        out.id = better(out.id, { at: d.addedAt, from: firstLine(pack.address) });
      } else if (d.checkId === "landlord-aml") {
        if ((d.read?.issueDate ?? d.addedAt.slice(0, 10)) < amlFrom.slice(0, 10)) continue;
        out.aml = better(out.aml, { at: d.addedAt, from: firstLine(pack.address) });
      }
    }
  }

  const others = homes.filter((h) => elsewhere(h.address));
  if (others.length) {
    const ids = others.flatMap((h) => [h.id, h.rex_property_id].filter(Boolean) as string[]);
    const tabs = await q<{ address: string; rex_property_id: string | null; type: string; at: string | Date }>(
      `SELECT address, rex_property_id, type, at FROM os_file_documents
        WHERE removed_at IS NULL AND NOT is_test AND type IN ('landlord_id', 'landlord_aml')
          AND (rex_property_id = ANY($1) OR street = ANY($2))`,
      [ids, others.map((h) => parseAddress(h.address).street).filter(Boolean)]
    ).catch(() => []);
    for (const t of tabs) {
      if (!(t.rex_property_id && ids.includes(t.rex_property_id)) && !others.some((h) => sameHome(h.address, t.address))) continue;
      if (t.type === "landlord_id") out.id = better(out.id, { at: iso(t.at), from: firstLine(t.address) });
      else if (iso(t.at) >= amlFrom) out.aml = better(out.aml, { at: iso(t.at), from: firstLine(t.address) });
    }
  }
  return out;
}
