import "server-only";
import { hasDb, q } from "@/lib/db";
import { homeFactsFor } from "@/lib/home-facts";
import { keysFor } from "@/lib/home-keys";
import { readHome, type HomeIds } from "@/lib/home-answers";
import type { Answers } from "@/lib/property-questions";

/**
 * WHAT THE OS ALREADY KNOWS, PULLED THROUGH (James, 5 Nov 2026).
 *
 * "If the questions are already answered, we should always allow the answers
 * to pull through ... especially if it's a relisted property." So before the
 * agent sends, every answer the OS can stand behind is put in front of them,
 * with where it came from, for them to confirm, change, or send to the
 * landlord to check anyway (components/terms/TermsSendScreen):
 *
 *   earlier answers     what a landlord or agent said about this home before
 *                       (lib/home-answers), a previous let's included
 *   the managed book    os_properties: on our book means a re-list; its
 *                       no-gas and HMO flags
 *   the home's facts    os_home_facts: gas or no gas, HMO
 *   certificates        os_certificates: a gas safety certificate means gas,
 *                       and in date or not; the EICR, the EPC, an HMO licence
 *   our key register    keys we hold, and how many sets
 *   Land Registry       os_sales: freehold or leasehold, where we hold the
 *                       sales for that postcode
 *
 * Read-only, every source on its own: one that fails costs only its own
 * answers. Nothing here is saved; the agent's choice decides what is.
 */

export interface Pulled {
  /** Suggested answers not already kept for the home. */
  answers: Answers;
  /** Where each answer came from, said plainly: "the gas safety certificate on file, to 3 March 2027". */
  from: Record<string, string>;
  /** Already let or managed through us: the agent is told it is a re-list. */
  relist: boolean;
  relistWhy: string | null;
  /** The first landlord's licensing declaration, where the file shows an HMO or a licence. */
  licensing: { value: "yes" | "no"; from: string } | null;
}

const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export async function pullThrough(h: HomeIds & { address?: string | null }): Promise<Pulled> {
  const out: Pulled = { answers: {}, from: {}, relist: false, relistWhy: null, licensing: null };
  if (!hasDb()) return out;
  const put = (id: string, v: string, from: string) => {
    if (out.answers[id] == null) {
      out.answers[id] = v;
      out.from[id] = from;
    }
  };
  const pid = String(h.propertyId ?? "").trim();

  /* The managed book: a re-list, and its own flags. */
  let osId: string | null = null;
  if (pid) {
    const r = await q<{ id: string; active: boolean; no_gas: boolean; hmo: boolean; management: string | null }>(
      `SELECT id, active, no_gas, hmo, management FROM os_properties WHERE id = $1 OR rex_property_id = $1 ORDER BY active DESC LIMIT 1`,
      [pid]
    ).catch(() => []);
    if (r[0]) {
      osId = r[0].id;
      out.relist = true;
      out.relistWhy = r[0].active ? "It's on our managed book." : "We've managed it before.";
      if (r[0].active) put("occupancy", "tenant", "our managed book: a tenant is living there");
      if (r[0].no_gas) put("gas-supply", "no", "our managed book, which has it as no gas");
      if (r[0].hmo) out.licensing = { value: "yes", from: "our managed book, which has it as an HMO" };
    }
  }
  const homeKeys = [...new Set([pid, osId].filter((x): x is string => Boolean(x)))];

  /* Earlier signed terms on the home: a re-list too. */
  if (!out.relist && (pid || h.listingId)) {
    const t = await q<{ completed_at: Date }>(
      `SELECT completed_at FROM os_terms WHERE status = 'signed' AND (($1::text <> '' AND property_id = $1) OR ($2::text IS NOT NULL AND listing_id = $2)) ORDER BY completed_at DESC LIMIT 1`,
      [pid, h.listingId ?? null]
    ).catch(() => []);
    if (t[0]) {
      out.relist = true;
      out.relistWhy = `Terms were signed with us on ${day(t[0].completed_at)}.`;
    }
  }

  /* The home's facts. */
  for (const k of homeKeys) {
    const f = await homeFactsFor(k).catch(() => null);
    if (!f) continue;
    if (f.gasSupply) put("gas-supply", f.gasSupply === "gas" ? "yes" : "no", "the home's facts in the OS");
    if (f.homeType === "hmo" && !out.licensing) out.licensing = { value: "yes", from: "the home's facts in the OS, which have it as an HMO" };
  }

  /* Certificates on file. */
  if (homeKeys.length) {
    const certs = await q<{ type_id: string; expiry: Date }>(
      `SELECT type_id, max(expiry) AS expiry FROM os_certificates WHERE property_id = ANY($1) GROUP BY type_id`,
      [homeKeys]
    ).catch(() => []);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const by = new Map(certs.map((c) => [c.type_id, new Date(c.expiry)]));
    const cert = (type: string, id: string, label: string) => {
      const e = by.get(type);
      if (!e) return false;
      const current = e >= today;
      put(id, current ? "have" : "expired", `the ${label} on file, ${current ? "in date to" : "ran out on"} ${day(e)}`);
      return true;
    };
    if (cert("gas_safety", "gas", "gas safety certificate")) put("gas-supply", "yes", "the gas safety certificate on file");
    const any = [cert("eicr", "eicr", "EICR"), cert("epc", "epc", "EPC")].some(Boolean) || by.has("gas_safety");
    if (any) put("certs-held-by", "you", "the certificates already on the home's file");
    const lic = ["mandatory_hmo_license", "selective_hmo_license"].find((t) => by.has(t));
    if (lic && !out.licensing) out.licensing = { value: "yes", from: `the ${lic.startsWith("selective") ? "selective" : "HMO"} licence on file` };
  }

  /* Our key register. */
  if (pid) {
    const k = await Promise.race([keysFor(pid), new Promise<null>((r) => setTimeout(() => r(null), 4000))]).catch(() => null);
    const n = k?.keys.length ?? 0;
    if (n) {
      put("keys", "we-hold", `our key register (${k!.keys.map((x) => x.label).filter(Boolean).slice(0, 3).join(", ") || `${n} ${n === 1 ? "key" : "keys"}`})`);
      put("key-sets", n >= 3 ? "3+" : String(n), "our key register");
    }
  }

  /* Land Registry: freehold or leasehold, where we hold the sales for that postcode. */
  const addr = String(h.address ?? "");
  const pc = addr.match(POSTCODE);
  if (pc) {
    const postcode = `${pc[1]} ${pc[2]}`.toUpperCase();
    const head = addr.replace(POSTCODE, "").split(",")[0]?.trim() ?? "";
    const flat = head.match(/^(?:flat|apartment|apt)\s+([\w-]+)/i)?.[1] ?? null;
    const num = (flat ? addr.split(",")[1] ?? "" : head).match(/^\s*(\d+[A-Z]?)\b/i)?.[1] ?? null;
    if (num) {
      const s = await q<{ tenure: string | null; sold_on: Date }>(
        `SELECT tenure, sold_on FROM os_sales WHERE postcode = $1 AND (house_number = $2 OR upper(paon) = upper($2))
           AND ($3::text IS NULL OR upper(saon) LIKE '%' || upper($3) || '%') ORDER BY sold_on DESC LIMIT 3`,
        [postcode, num, flat]
      ).catch(() => []);
      const t = s[0]?.tenure?.toUpperCase();
      if (t === "F" || t === "L") put("tenure", t === "F" ? "freehold" : "leasehold", `Land Registry (sold ${day(s[0].sold_on)})`);
    }
  }

  /* Anything already kept for the home is not suggested again: it is pulled through as it stands. */
  const kept = await readHome(h).catch(() => ({ answers: {} as Answers, who: {} }));
  for (const k of Object.keys(out.answers)) {
    if (kept.answers[k] != null && String(kept.answers[k]).trim() !== "") {
      delete out.answers[k];
      delete out.from[k];
    }
  }
  if (!out.relist && Object.keys(kept.answers).length) {
    const at = Object.values(kept.who).map((w) => w.at).sort()[0];
    out.relist = Boolean(at && at.slice(0, 10) < new Date().toISOString().slice(0, 10));
    out.relistWhy = out.relist ? `We have answers about it from ${day(at!)}.` : null;
  }
  return out;
}
