import "server-only";
import { hasDb, q } from "@/lib/db";
import { offerPhones, personKeys } from "@/lib/offer-repeat";

/**
 * ONE ENQUIRY PER PERSON PER HOME, AND A REPEAT SAID AS ONE (29 Oct 2026).
 *
 * Sean: "I've got one guy who's applied to a few properties about 12, 13
 * times. It opens up a different enquiry form every single time ... I've
 * declined him and said I don't want him as a tenant, but he's applying."
 * Every portal enquiry is its own REX lead, so the same person asking about
 * the same home three times was three rows on the board. In the ledger on
 * 29 Oct: 9,225 leads with an email and a home, 7,674 people-and-homes - one
 * in six a repeat. Lakshita Ahir: eight leads on four of Sean's homes, four
 * of them on Flat 1, 5 Riverview Gardens; all closed on 5 Oct, then two new
 * ones on 26 Oct.
 *
 * REX keeps making the leads (it is read-only to us), so they are folded
 * where the OS shows them: one row per person per home - the newest, which
 * is the one that wants an answer - carrying how many times they asked and
 * since when. And a person whose offer was declined here, on any home, has
 * that said on every enquiry they make after it, rather than arriving fresh.
 *
 * The same person: the same email, or the same phone number (last ten
 * digits). Leads not about one home are left as they are.
 */

export type LeadRepeat = {
  /** Enquiries from them about this home, this one included. */
  times: number;
  /** When they first asked about it. */
  firstAt: string | null;
  /** Ids of the earlier enquiries folded into this one, newest first. */
  earlier: string[];
  /** An earlier enquiry about this home was closed. */
  closedBefore: boolean;
};

export type LeadDeclined = { at: string; by: string; home: string };

type Foldable = { id: string; email?: string | null; phone?: string | null; listingId?: number | string | null; receivedAt?: string | null; stage?: string | null };

const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);

/** One row per person per home, newest kept, with how often they asked. Order kept. */
export function foldLeads<T extends Foldable>(leads: T[]): Array<T & { repeat?: LeadRepeat }> {
  const groupOf = new Map<string, number>();
  const groups: number[][] = [];
  leads.forEach((l, i) => {
    const home = l.listingId != null && String(l.listingId) !== "" && String(l.listingId) !== "0" ? String(l.listingId) : "";
    const keys = home ? personKeys(l.email, l.phone).map((k) => `${home}|${k}`) : [];
    const found = keys.map((k) => groupOf.get(k)).find((g) => g != null);
    const g = found ?? groups.push([]) - 1;
    groups[g].push(i);
    for (const k of keys) if (!groupOf.has(k)) groupOf.set(k, g);
  });
  const drop = new Set<number>();
  const extra = new Map<number, LeadRepeat>();
  for (const members of groups) {
    if (members.length < 2) continue;
    const byNewest = [...members].sort((a, b) => t(leads[b].receivedAt) - t(leads[a].receivedAt));
    const [keep, ...rest] = byNewest;
    for (const i of rest) drop.add(i);
    const oldest = byNewest[byNewest.length - 1];
    extra.set(keep, {
      times: members.length,
      firstAt: leads[oldest].receivedAt ?? null,
      earlier: rest.map((i) => leads[i].id),
      closedBefore: rest.some((i) => /closed/i.test(String(leads[i].stage ?? ""))),
    });
  }
  return leads.flatMap((l, i) => (drop.has(i) ? [] : [extra.has(i) ? { ...l, repeat: extra.get(i) } : l]));
}

/**
 * The people among these whose offer was declined here, on any home, by
 * person key: the latest decline. Read from the OS's own decisions on offers
 * made in the OS; a REX application declined only in REX is not seen.
 */
export async function declinedPeople(leads: Foldable[]): Promise<Map<string, LeadDeclined>> {
  const out = new Map<string, LeadDeclined>();
  const keys = new Set(leads.flatMap((l) => personKeys(l.email, l.phone)));
  if (!hasDb() || !keys.size) return out;
  const rows = await q<{ email: string; payload: Record<string, unknown>; address: string; by_name: string; by_email: string; decided_at: Date }>(
    `SELECT r.email, r.payload, r.address, d.by_name, d.by_email, d.decided_at
       FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
      WHERE d.decision = 'declined' ORDER BY d.decided_at ASC`
  ).catch(() => []);
  for (const r of rows) {
    const theirs = [...personKeys(r.email, null), ...offerPhones(r.payload).map((p) => `p:${p}`)];
    const d = { at: new Date(r.decided_at).toISOString(), by: r.by_name || r.by_email, home: r.address };
    for (const k of theirs) if (keys.has(k)) out.set(k, d);
  }
  return out;
}

/** Folded, and each one marked with a decline the person had before it came in. */
export async function withRepeats<T extends Foldable>(leads: T[]): Promise<Array<T & { repeat?: LeadRepeat; declinedBefore?: LeadDeclined }>> {
  const folded = foldLeads(leads);
  const declined = await declinedPeople(folded).catch(() => new Map<string, LeadDeclined>());
  if (!declined.size) return folded;
  return folded.map((l) => {
    const d = personKeys(l.email, l.phone).map((k) => declined.get(k)).find(Boolean);
    /* Only a decline before this enquiry came in: one after it is the answer to it. */
    return d && (!l.receivedAt || t(d.at) < t(l.receivedAt)) ? { ...l, declinedBefore: d } : l;
  });
}
