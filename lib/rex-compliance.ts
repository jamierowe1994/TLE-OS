import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { fetchListingBook } from "@/lib/rex-listings";
import type { CertKey, CompProperty } from "@/lib/compliance";

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
  details?: Record<string, { expiry_date?: string | null; not_required?: boolean }> | null;
  file?: { url?: string } | null;
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(then)) return null;
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

export async function fetchComplianceBook(): Promise<ComplianceBook> {
  const empty: ComplianceBook = {
    properties: [],
    counts: { properties: 0, withAnyRecord: 0, entries: 0, withCertificate: 0, gasUnknown: 0 },
  };
  if (!rexConfigured()) return empty;

  const book = await fetchListingBook();
  const listings = book.listings.filter((l) => l.propertyId);
  if (!listings.length) return empty;

  const ids = listings.map((l) => l.propertyId!) as string[];
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
    const mine = byProperty.get(l.propertyId!) ?? [];
    const certs: CompProperty["certs"] = {};

    for (const e of mine) {
      const key = TYPE_MAP[e.type_id ?? ""];
      if (!key) continue;
      const detail = e.details?.[e.type_id!];
      const expires = daysUntil(detail?.expiry_date);
      const attached = Boolean(e.file?.url);
      if (attached) withCertificate++;
      const held = certs[key];
      // Latest expiry wins; a record with no date never displaces one with.
      if (!held || (expires != null && (held.expires == null || expires > held.expires))) {
        certs[key] = { expires, attached };
      }
    }

    // EPC also lives on the listing record itself, and is better populated
    // there than in compliance entries — use it when there's no entry.
    if (!certs.epc && l.epcExpiry) {
      certs.epc = { expires: daysUntil(l.epcExpiry), attached: false };
    }

    const hasGasRecord = mine.some((e) => e.type_id === "gas_safety" || e.type_id === "oil_safety");
    if (!hasGasRecord) gasUnknown++;

    return {
      id: l.propertyId!,
      name: l.name,
      locality: l.locality,
      // REX's listing projection carries neither the landlord's name nor the
      // sitting tenant's, so neither is invented here.
      landlord: "—",
      // REX's listing projection carries no tenant, and `tenancy_id` is
      // populated on 0% of the book — so this is genuinely unknown, not empty.
      tenant: undefined,
      hmo: mine.some((e) => HMO_TYPES.includes(e.type_id ?? "")),
      hasGas: hasGasRecord,
      certs,
    };
  });

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
