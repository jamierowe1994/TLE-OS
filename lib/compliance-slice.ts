import type { CertKey, CompProperty } from "@/lib/compliance";
import { houseKeyOf } from "@/lib/address-parse";

/**
 * One person's homes, cut out of the shared compliance book (1 Nov 2026).
 *
 * The landlord portal and every agent's Portfolio each used to build their
 * own copy of the book with certificatesFor, and certificatesFor always adds
 * every home the OS manages - so each of them was a full sweep of REX: about
 * sixty ComplianceEntries searches and sixty Listings searches, six at a
 * time. One landlord on an iPhone, 1 Nov 07:35, made nineteen page loads that
 * each took 37 to 125 seconds, and the "ComplianceEntries/search was slow or
 * busy" tickets (475 of them) fired inside that burst. Portfolio did the same
 * once per agent, eighteen of them.
 *
 * The book Compliance already holds (lib/compliance-cache) answers all of
 * them: it is built once, kept warm by the cron, and patched at once when a
 * certificate is filed in the OS (patchHeldHome). This is the cut. Pure, so a
 * script can run it against a made-up book.
 */

/** What a reader asks for: the home's REX property (or OS id), and the listing's own EPC date where it has one. */
export interface SliceSubject {
  propertyId: string;
  epcExpiry?: string | null;
}

export interface Slice {
  /** One per home asked for that the book holds, in the order asked. */
  properties: CompProperty[];
  /** Asked for, not in the book. Never "no certificates": nobody has read them. */
  missing: string[];
}

/**
 * The homes asked for, out of the book, one row per property.
 *
 * Copies, never the book's own objects: the held book is shared by every
 * reader in the process, and a caller that patched its slice would patch
 * everybody's.
 *
 * The listing's EPC date fills in where the book has no EPC at all, as
 * certificatesFor does for the subjects it is handed - the book is built from
 * the rental book's listings, and a managed home not on the market has no
 * listing date in it. `daysUntil` turns that date into the book's day count
 * (from today; the book read through compliance-cache is moved on to today).
 */
export function sliceBook(
  book: { properties: CompProperty[] },
  subjects: SliceSubject[],
  daysUntil: (iso: string) => number | null
): Slice {
  const byId = new Map<string, CompProperty>();
  for (const p of book.properties) if (!byId.has(String(p.id))) byId.set(String(p.id), p);
  const properties: CompProperty[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const epcOf = new Map<string, string>();
  for (const s of subjects) if (s.epcExpiry && !epcOf.has(String(s.propertyId))) epcOf.set(String(s.propertyId), s.epcExpiry);
  for (const s of subjects) {
    const id = String(s.propertyId ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const held = byId.get(id);
    if (!held) { missing.push(id); continue; }
    const copy: CompProperty = { ...held, certs: { ...held.certs } };
    const epc = epcOf.get(id);
    if (!copy.certs.epc && epc) {
      const expires = daysUntil(epc);
      if (expires != null) copy.certs.epc = { expires, attached: false };
    }
    properties.push(copy);
  }
  return { properties, missing };
}

/**
 * A room the book does not hold, read on its own, takes the house's
 * certificates from the book: the same rule the build applies (gas, EICR,
 * EPC and the licence are done for the building, the best per type wins),
 * against the rooms and the house the book does hold.
 */
export function inheritFromHouse(home: CompProperty, book: { properties: CompProperty[] }): CompProperty {
  const key = houseKeyOf(`${home.name}, ${home.locality}`);
  if (!key) return home;
  const members = book.properties.filter((o) => String(o.id) !== String(home.id) && houseKeyOf(`${o.name}, ${o.locality}`) === key);
  if (!members.length) return home;
  const certs = { ...home.certs };
  for (const m of members) {
    for (const [k, c] of Object.entries(m.certs) as [CertKey, NonNullable<CompProperty["certs"][CertKey]>][]) {
      const own = certs[k];
      if (!own || (c.expires != null && (own.expires == null || c.expires > own.expires))) certs[k] = { ...c, inherited: true };
    }
  }
  return { ...home, certs };
}

/** The book's counts, taken again over a slice. */
export function sliceCounts(properties: CompProperty[]) {
  let withCertificate = 0;
  let entries = 0;
  for (const p of properties) for (const c of Object.values(p.certs)) {
    if (!c) continue;
    entries++;
    if (c.attached) withCertificate++;
  }
  return {
    properties: properties.length,
    withAnyRecord: properties.filter((p) => Object.keys(p.certs).length > 0).length,
    entries,
    withCertificate,
    gasUnknown: properties.filter((p) => !p.gasAnswered).length,
  };
}
