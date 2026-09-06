import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { fetchListingBook } from "@/lib/rex-listings";
import type { CertKey, CompProperty } from "@/lib/compliance";
import { activeOsProperties, factsByRexId } from "@/lib/os-properties";
import { osCertsFor } from "@/lib/os-certs";
import { houseKeyOf, isRoomAddress } from "@/lib/address-parse";

/**
 * The compliance book, live from REX.
 *
 * ⚠️ QUERY BY PROPERTY ID, NOT LISTING ID — but not for the reason this
 * comment used to give. It claimed certificates hang off the property only,
 * and that a listing query "returns almost nothing". That was wrong. A census
 * of all 6,657 compliance entries (18 Aug 2026) found:
 *
 *     property 2,715 | listing 1,916 | contact 2,026
 *
 * and EVERY safety type on BOTH parents — epc 1,986/1,071, gas 74/73,
 * eicr 77/59, pat 41/29, legionella 46/28, the HMO licences, the alarms.
 * REX stores the managed book's certificates twice.
 *
 * Property ids are still the right query, because the listing copy is always a
 * DUPLICATE and never the only copy: of 103 listing-held certificates checked
 * across gas, eicr and epc, zero lacked a property-record copy. So a property
 * query loses nothing, and a merged query would just have to de-duplicate.
 *
 * The real trap is the opposite of the old warning: do NOT "fix" this by
 * merging both parents without collapsing to one record per type, or every
 * certificate is counted twice. (The TLE portal merges and de-dupes; this
 * reads one parent. Both are correct, by different routes.)
 *
 * Worth knowing when reading REX PM's own compliance screen: its requirement
 * banners and its certificate table disagree — it will say a certificate "has
 * not been added" directly above that certificate. That is REX's display bug,
 * not ours, and it is where the phantom renewal tasks come from.
 *
 * Expiry lives at `details.<type_id>.expiry_date`, and the certificate
 * itself at `file.url` — though `file.url` is frequently absent: EPC had no
 * document on any of 100 sampled entries, legionella 33%, pat 44%, gas 74%,
 * while eicr and terms of business are at 100%. A date without a document
 * means we cannot produce the certificate on request.
 *
 * WHAT WE DO NOT KNOW is left unknown. A property with no gas record might
 * have no gas, or might have gas nobody has certified — those are opposite
 * situations and the OS refuses to merge them.
 */

/** REX's type vocabulary → ours. Several REX types collapse into one of ours. */
const TYPE_MAP: Record<string, CertKey> = {
  eicr: "eicr",
  gas_safety: "gas",
  epc: "epc",
  mandatory_hmo_license: "licence",
  additional_hmo_license: "licence",
  selective_hmo_license: "licence",
  emergency_lighting_fire_exit: "fire",
  portable_appliance_testing: "pat",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
  legionella_risk_assessment: "legionella",
};

const HMO_TYPES = ["mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license"];
/** Ten ids per query: this service is superlinear-slow and hard-caps at 100 rows. */
const CHUNK = 10;
const CONCURRENCY = 6;

interface RexEntry extends Record<string, unknown> {
  parent_object_id?: number | string;
  type_id?: string;
  details?: Record<string, { expiry_date?: string | null; issue_date?: string | null; not_required?: boolean }> | null;
  file?: { url?: string } | null;
}

/** Months a certificate usually runs, used only when REX holds an issue date and no expiry. */
const LIFE_MONTHS: Record<string, number> = { portable_appliance_testing: 12, gas_safety: 12, eicr: 60, epc: 120, legionella_risk_assessment: 24 };
function plusMonths(iso: string | null | undefined, months: number | undefined): string | null {
  if (!iso || !months) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const MIN_DATE = new Date("2000-01-01T00:00:00").getTime();
const MAX_DATE = new Date("2045-12-31T23:59:59").getTime();

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(then)) return null;
  /* A date outside 2000-2045 is a typo in REX (8 Swarbourn Close's EICR
     said 1905 and showed as 44,393 days over), not a certificate. Same
     window the intake refuses, so nothing can be filed the tracker then
     cannot read. It counts as no valid date. */
  if (then < MIN_DATE || then > MAX_DATE) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then - today.getTime()) / 86400000);
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export interface ComplianceBook {
  properties: CompProperty[];
  counts: {
    properties: number;
    withAnyRecord: number;
    entries: number;
    withCertificate: number;
    gasUnknown: number;
  };
}

const EMPTY: ComplianceBook = {
  properties: [],
  counts: { properties: 0, withAnyRecord: 0, entries: 0, withCertificate: 0, gasUnknown: 0 },
};

/** What a certificate read needs to know about a property: enough to name the row. */
export interface CertSubject {
  propertyId: string;
  name: string;
  locality: string;
  epcExpiry: string | null;
}

/** The current rental book's certificates — the Compliance screen. */
export async function fetchComplianceBook(): Promise<ComplianceBook> {
  if (!rexConfigured()) return EMPTY;
  const book = await fetchListingBook();
  return certificatesFor(
    book.listings
      .filter((l) => l.propertyId)
      .map((l) => ({ propertyId: l.propertyId as string, name: l.name, locality: l.locality, epcExpiry: l.epcExpiry }))
  );
}

/**
 * Certificates for ANY set of properties. Split out of fetchComplianceBook so
 * the Portfolio screen can read the managed (leased) book's certificates with
 * the same rules — latest expiry wins, EPC falls back to the listing field,
 * "no gas record" stays unknown — rather than a second copy of them.
 */
export async function certificatesFor(subjects: CertSubject[]): Promise<ComplianceBook> {
  if (!rexConfigured() || !subjects.length) return EMPTY;

  /* Every home REX PM manages joins the book (6 Sep 2026): one REX holds a
     property for but does not mark as let comes in under its REX property,
     so its REX certificates are read like any other. */
  const osProps = await activeOsProperties().catch(() => []);
  const listings = [...subjects];
  const present = new Set(subjects.map((l) => String(l.propertyId)));
  for (const o of osProps) {
    const id = o.rexPropertyId ?? o.id;
    if (present.has(id)) continue;
    present.add(id);
    listings.push({ propertyId: id, name: o.name || o.address, locality: o.locality, epcExpiry: null });
  }

  const ids = listings.map((l) => l.propertyId).filter((id) => /^\d+$/.test(id));
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await inBatches(chunks, CONCURRENCY, async (chunk) => {
    const res = await rexCall("ComplianceEntries", "search", {
      criteria: [{ name: "parent_object_id", type: "in", value: chunk }],
      limit: 100,
    });
    return res.ok ? (rexRows(res.result) as RexEntry[]) : [];
  });
  const entries = results.flat();

  // Group by property, keeping the LATEST expiry per certificate type — a
  // property with a renewed gas certificate has two entries, and the old one
  // must not be the one that decides whether it's compliant.
  const byProperty = new Map<string, RexEntry[]>();
  for (const e of entries) {
    const key = String(e.parent_object_id ?? "");
    if (!key) continue;
    const list = byProperty.get(key);
    if (list) list.push(e);
    else byProperty.set(key, [e]);
  }

  let withCertificate = 0;
  let gasUnknown = 0;

  const properties: CompProperty[] = listings.map((l) => {
    const mine = byProperty.get(l.propertyId) ?? [];
    const certs: CompProperty["certs"] = {};

    for (const e of mine) {
      const key = TYPE_MAP[e.type_id ?? ""];
      if (!key) continue;
      const detail = e.details?.[e.type_id!];
      /* A PAT entry holds only the tested date (REX's own schema, 6 Sep 2026):
         its next test is a year on. Any type with an issue date and no expiry
         gets the certificate's usual life, so it is not counted as no record. */
      const expires = daysUntil(detail?.expiry_date) ?? daysUntil(plusMonths(detail?.issue_date, LIFE_MONTHS[e.type_id ?? ""]));
      const attached = Boolean(e.file?.url);
      if (attached) withCertificate++;
      const held = certs[key];
      const notRequired = Boolean(detail?.not_required);
      // Latest expiry wins; a record with no date never displaces one with.
      if (!held || (expires != null && (held.expires == null || expires > held.expires))) {
        certs[key] = { expires, attached, fileUrl: e.file?.url ?? null, ...(notRequired ? { notRequired: true } : {}) };
      }
    }

    // EPC also lives on the listing record itself, and is better populated
    // there than in compliance entries — use it when there's no entry.
    if (!certs.epc && l.epcExpiry) {
      certs.epc = { expires: daysUntil(l.epcExpiry), attached: false };
    }

    /* A gas entry marked not required is the landlord saying there is no gas
       (from the signed terms of business, 6 Sep 2026): the home has no gas
       duty, so it is not counted as missing one. */
    const hasGasRecord = mine.some((e) => e.type_id === "gas_safety" || e.type_id === "oil_safety");
    const gasNotRequired = Boolean(certs.gas?.notRequired) && certs.gas?.expires == null;
    if (!hasGasRecord) gasUnknown++;

    return {
      id: l.propertyId,
      name: l.name,
      locality: l.locality,
      // REX's listing projection carries neither the landlord's name nor the
      // sitting tenant's, so neither is invented here.
      landlord: "—",
      // REX's listing projection carries no tenant, and `tenancy_id` is
      // populated on 0% of the book — so this is genuinely unknown, not empty.
      tenant: undefined,
      hmo: mine.some((e) => HMO_TYPES.includes(e.type_id ?? "")),
      hasGas: hasGasRecord && !gasNotRequired,
      certs,
    };
  });

  /* What the OS knows on its own record (6 Sep 2026): REX PM's categories
     make a home an HMO or a no-gas home even where REX CRM holds no licence
     entry or no not-required gas entry. */
  const facts = await factsByRexId().catch(() => new Map());
  for (const p of properties) {
    const f = facts.get(p.id);
    if (!f) continue;
    if (f.hmo) p.hmo = true;
    if (f.noGas && p.certs.gas?.expires == null) p.hasGas = false;
  }

  /* Homes REX CRM has no property for. The OS is their record: its own
     certificates are their compliance, and they count in every figure so
     the OS matches REX PM's managed book, not REX CRM's. */
  const extra = osProps.filter((o) => !o.rexPropertyId);
  const extraCerts = await osCertsFor([...new Set([...extra.map((p) => p.id), ...listings.map((l) => l.propertyId).filter((id) => /^pm-/i.test(id))])]).catch(() => new Map());
  /* The managed book may already list these homes (Portfolio does): REX
     answered nothing for them, so their certificates come from the OS. */
  for (const p of properties) {
    if (!/^pm-/i.test(p.id)) continue;
    p.certs = extraCerts.get(p.id) ?? {};
    p.onRex = false;
    const o = extra.find((x) => x.id === p.id);
    if (o) { p.hmo = o.hmo; p.hasGas = !o.noGas; }
  }
  for (const o of extra) {
    if (listings.some((l) => l.propertyId === o.id)) continue;
    const certs = extraCerts.get(o.id) ?? {};
    properties.push({
      id: o.id,
      name: o.name || o.address,
      locality: o.locality,
      landlord: "—",
      tenant: undefined,
      hmo: o.hmo,
      hasGas: !o.noGas,
      certs,
      onRex: false,
    });
  }

  /* A shared house's certificates are the house's (James, 6 Sep): gas, EICR,
     EPC and the licence are done for the building. Every room inherits the
     best the house or any of its rooms holds, per type, so a room REX never
     had a certificate written on still reads in date. Flats are not rooms
     and are left alone. */
  const houses = new Map<string, CompProperty[]>();
  for (const p of properties) {
    const addr = `${p.name}, ${p.locality}`;
    if (!isRoomAddress(addr) && !properties.some((o) => o !== p && isRoomAddress(`${o.name}, ${o.locality}`) && houseKeyOf(`${o.name}, ${o.locality}`) === houseKeyOf(addr))) continue;
    const key = houseKeyOf(addr);
    if (!key) continue;
    (houses.get(key) ?? houses.set(key, []).get(key)!).push(p);
  }
  for (const members of houses.values()) {
    if (members.length < 2) continue;
    const best: CompProperty["certs"] = {};
    for (const m of members) for (const [k, c] of Object.entries(m.certs) as [CertKey, NonNullable<CompProperty["certs"][CertKey]>][]) {
      const held = best[k];
      if (!held || (c.expires != null && (held.expires == null || c.expires > held.expires))) best[k] = c;
    }
    const anyGas = members.some((m) => m.hasGas);
    const anyHmo = members.some((m) => m.hmo);
    for (const m of members) {
      for (const [k, c] of Object.entries(best) as [CertKey, NonNullable<CompProperty["certs"][CertKey]>][]) {
        const own = m.certs[k];
        if (!own || (c.expires != null && (own.expires == null || c.expires > own.expires))) m.certs[k] = { ...c, inherited: true };
      }
      m.hasGas = anyGas && !(m.certs.gas?.notRequired && m.certs.gas?.expires == null);
      m.hmo = anyHmo;
    }
  }

  return {
    properties,
    counts: {
      properties: properties.length,
      withAnyRecord: properties.filter((p) => Object.keys(p.certs).length > 0).length,
      entries: entries.length,
      withCertificate,
      gasUnknown,
    },
  };
}
