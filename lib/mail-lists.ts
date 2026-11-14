import "server-only";
import { hasDb, q } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { currentLets } from "@/lib/current-lets";
import { nationOf } from "@/lib/property-flags";
import { isInternalAddress } from "@/lib/email-policy";
import { SANDBOX_EMAIL_DOMAIN } from "@/lib/sandbox";
import { NOT_SALES } from "@/lib/lead-ledger";
import { listAppraisals } from "@/lib/appraisal-store";
import { payPropTenancyCurrent, payPropTenantRows } from "@/lib/business/payprop-tenant-contacts";
import { optedOutSet } from "@/lib/mail-optout";

/**
 * THE MAILING LISTS (James, 14 Nov 2026; Francesca's ticket: "can I not send
 * a mail out to our landlords on here yet ... split between English and
 * Scottish landlords").
 *
 * "These should be active and dynamic lists, so they're not static. When a
 * new landlord signs a contract, they then get added to that flow. Same thing
 * applies with tenants. We'll do address checks based on the property that
 * they either own or rent to determine where they're based."
 *
 * ── Eight lists, none of them stored ──────────────────────────────────────
 *
 *   landlords   current           England and Wales / Scotland
 *   landlords   not on our books  England and Wales / Scotland
 *   tenants     current           England and Wales / Scotland
 *   tenants     not with us now   England and Wales / Scotland
 *
 * A list is a question asked of what the OS already holds, answered when a
 * mail-out is being put together and again when it sends. Nobody is added to
 * one or taken off one by hand: a landlord is on "current" because a home of
 * theirs is on Portfolio or their terms are signed, and comes off it the day
 * that stops being true.
 *
 * ── Where each one comes from ─────────────────────────────────────────────
 *
 *   current landlords   every landlord of a home on Portfolio (each home on
 *                       its latest let, test homes left out), and the
 *                       landlord of an appraisal that was won or is being
 *                       taken on - terms signed, home not let yet
 *   other landlords     landlord leads and valuation requests, landlords
 *                       added by hand, appraisals not won, and the landlords
 *                       of homes that have left Portfolio
 *   current tenants     the people living in a home on Portfolio today
 *   other tenants       letting enquiries from the last twelve months,
 *                       tenant passports, and tenants whose tenancy with us
 *                       has ended
 *
 * A person is only ever on one side of "current": anybody who is a current
 * landlord is left off the other landlord lists, and the same for tenants.
 *
 * ── England and Wales, or Scotland ────────────────────────────────────────
 *
 * By the postcode of the home they own, rent or asked about
 * (lib/property-flags nationOf: the border districts are handled, and Wales
 * goes with England because the split James asked for is Scotland or not).
 * A landlord with homes in both is on both lists and still gets one copy.
 * Where nothing on file names a home - most valuation requests arrive with no
 * address - the person is placed by the patch of the agent who has them, and
 * failing that is NOT on a list at all: counted as "country not known" on the
 * screen, never guessed.
 *
 * ── Who is never on a list ────────────────────────────────────────────────
 *
 * Anybody who has unsubscribed, bounced or complained (lib/mail-optout), our
 * own people (a tester's own address on a test file), sandbox records, and
 * anything that is not a whole email address.
 *
 * ── Cost ──────────────────────────────────────────────────────────────────
 *
 * The Portfolio book as it is already held (lib/managed-book-cache), PayProp's
 * tenant records as held, and five queries on our own tables. Nothing is
 * asked of an outside system for this, and nothing is written anywhere. The
 * answer is kept for five minutes.
 */

export type ListNation = "ew" | "sc";
export type ListGroup = "landlords" | "tenants";
export type ListWho = "current" | "other";
export type ListId = `${ListGroup}_${ListWho}_${ListNation}`;

export type MailList = { id: ListId; group: ListGroup; who: ListWho; nation: ListNation; label: string; short: string; blurb: string };

const NATION_LABEL: Record<ListNation, string> = { ew: "England and Wales", sc: "Scotland" };
const WHO_LABEL: Record<`${ListGroup}_${ListWho}`, { label: string; blurb: string }> = {
  landlords_current: { label: "Current Landlords", blurb: "Landlords with a home on Portfolio, or whose terms are signed." },
  landlords_other: { label: "Landlords Not on Our Books", blurb: "Landlord leads, valuation requests, appraisals not won, and landlords whose homes have left us." },
  tenants_current: { label: "Current Tenants", blurb: "People living in a home on Portfolio today." },
  tenants_other: { label: "Not a Tenant With Us", blurb: "Letting enquiries from the last twelve months, tenant passports, and past tenants." },
};

export const MAIL_LISTS: MailList[] = (["landlords", "tenants"] as const).flatMap((group) =>
  (["current", "other"] as const).flatMap((who) =>
    (["ew", "sc"] as const).map((nation) => ({
      id: `${group}_${who}_${nation}` as ListId,
      group,
      who,
      nation,
      label: `${WHO_LABEL[`${group}_${who}`].label}, ${NATION_LABEL[nation]}`,
      short: NATION_LABEL[nation],
      blurb: WHO_LABEL[`${group}_${who}`].blurb,
    }))
  )
);

const LIST_IDS = new Set<string>(MAIL_LISTS.map((l) => l.id));
export const isListId = (s: unknown): s is ListId => typeof s === "string" && LIST_IDS.has(s);
export const listLabel = (id: string) => MAIL_LISTS.find((l) => l.id === id)?.label ?? id;

export type ListPerson = { email: string; name: string; home: string };

export type ResolvedLists = {
  at: number;
  lists: Record<ListId, ListPerson[]>;
  /** People with a usable address who could not be placed in either country. */
  unplaced: Record<`${ListGroup}_${ListWho}`, number>;
  /** People left off because they unsubscribed, bounced or complained. */
  optedOut: number;
};

/* ── Small parts ─────────────────────────────────────────────────────────── */

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

/** A usable customer address, lower-cased, or null. */
function usable(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!EMAIL.test(e)) return null;
  if (e.endsWith(`@${SANDBOX_EMAIL_DOMAIN}`) || isInternalAddress(e)) return null;
  return e;
}

const toNation = (n: ReturnType<typeof nationOf>): ListNation | null => (n === "scotland" ? "sc" : n ? "ew" : null);

/** "Lianna Jane Denholm" and "Lianna Denholm" are the same agent. */
const agentKey = (name: string | null | undefined) => {
  const w = String(name ?? "").toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
  return w.length ? `${w[0]} ${w[w.length - 1]}` : "";
};

type Bucket = Map<string, ListPerson>;
type Buckets = Record<ListNation, Bucket>;
const emptyBuckets = (): Buckets => ({ ew: new Map(), sc: new Map() });

function put(b: Buckets, nation: ListNation, email: string, name: string, home: string) {
  if (!b[nation].has(email)) b[nation].set(email, { email, name: name.trim() || email.split("@")[0], home: home.trim() });
}

/* ── The answer ──────────────────────────────────────────────────────────── */

async function work(): Promise<ResolvedLists> {
  const out = optedOutSet();
  const { book } = await managedBookFor(null);
  const homes = currentLets(book.properties.filter((p) => !p.test));

  const landlordsNow = emptyBuckets();
  const tenantsNow = emptyBuckets();
  const landlordsOther = emptyBuckets();
  const tenantsOther = emptyBuckets();
  const unplaced = { landlords_current: new Set<string>(), landlords_other: new Set<string>(), tenants_current: new Set<string>(), tenants_other: new Set<string>() };

  /* Each agent's patch, from the homes they look after: where a lead names no
     home, the agent who has it says which side of the border it is. */
  const patch = new Map<string, { ew: number; sc: number }>();

  /* 1. Portfolio: who owns it, who lives in it. */
  const onBook = new Set<string>();
  for (const p of homes) {
    onBook.add(p.listingId);
    const nation = toNation(nationOf(p.postcode, p.address, p.locality, p.town));
    const home = p.name || p.address;
    if (nation && p.agent?.name) {
      const k = agentKey(p.agent.name);
      const c = patch.get(k) ?? { ew: 0, sc: 0 };
      c[nation] += 1;
      patch.set(k, c);
    }
    for (const l of [p.landlord, ...(p.otherLandlords ?? [])]) {
      const e = usable(l?.email);
      if (!e || !l) continue;
      if (nation) put(landlordsNow, nation, e, l.name, home);
      else unplaced.landlords_current.add(e);
    }
    if (p.vacantSince) continue;
    for (const t of p.tenants) {
      const e = usable(t.email);
      if (!e) continue;
      if (nation) put(tenantsNow, nation, e, t.name, home);
      else unplaced.tenants_current.add(e);
    }
  }
  const nationOfAgent = (name: string | null | undefined): ListNation | null => {
    const c = patch.get(agentKey(name));
    if (!c || c.ew === c.sc) return null;
    return c.sc > c.ew ? "sc" : "ew";
  };

  /* 2. Appraisals: won or being taken on is a landlord of ours already; any
        other is a landlord we have met. Their address places a lead that
        arrived with none. */
  const appraisals = await listAppraisals().catch(() => []);
  const leadHome = new Map<string, { address: string; postcode: string }>();
  for (const a of appraisals) {
    if (a.leadId && (a.postcode || a.address)) leadHome.set(a.leadId, { address: a.address, postcode: a.postcode });
    const e = usable(a.landlordEmail);
    if (!e) continue;
    const nation = toNation(nationOf(a.postcode, a.address)) ?? nationOfAgent(a.agent);
    const signed = a.stage === "won" || a.stage === "takeon";
    if (!nation) (signed ? unplaced.landlords_current : unplaced.landlords_other).add(e);
    else put(signed ? landlordsNow : landlordsOther, nation, e, a.landlord, a.address);
  }

  if (hasDb()) {
    /* 3. Landlord leads and valuation requests, two years back. */
    const leads = await q<{ id: string; name: string | null; email: string | null; address: string | null; agent: string | null }>(
      `select id, name, email, address, agent from os_leads
        where enquiry in ('Landlord','Valuation') and email like '%@%'
          and received_at > now() - interval '24 months' and ${NOT_SALES}`
    ).catch(() => []);
    const more = await q<{ lead_id: string; address: string | null; postcode: string | null }>(`select lead_id, address, postcode from os_lead_properties`).catch(() => []);
    for (const m of more) if (!leadHome.has(m.lead_id)) leadHome.set(m.lead_id, { address: m.address ?? "", postcode: m.postcode ?? "" });
    for (const l of leads) {
      const e = usable(l.email);
      if (!e) continue;
      const h = leadHome.get(l.id);
      const nation = toNation(nationOf(h?.postcode ?? null, h?.address, l.address)) ?? nationOfAgent(l.agent);
      if (nation) put(landlordsOther, nation, e, l.name ?? "", h?.address || l.address || "");
      else unplaced.landlords_other.add(e);
    }

    /* 4. Landlords added by hand. */
    const byHand = await q<{ name: string | null; email: string | null; address: string | null; postcode: string | null }>(
      `select name, email, address, postcode from os_contacts where kind = 'landlord' and not coalesce(is_test, false) and email like '%@%'`
    ).catch(() => []);
    for (const c of byHand) {
      const e = usable(c.email);
      if (!e) continue;
      const nation = toNation(nationOf(c.postcode, c.address));
      if (nation) put(landlordsOther, nation, e, c.name ?? "", c.address ?? "");
      else unplaced.landlords_other.add(e);
    }

    /* 5. Homes that have left Portfolio: their landlord, and whoever lived there. */
    type Snap = { name?: string; address?: string; postcode?: string | null; locality?: string; landlord?: { name?: string; email?: string | null } | null; otherLandlords?: { name?: string; email?: string | null }[]; tenants?: { name?: string; email?: string | null }[]; test?: boolean };
    const left = await q<{ listing_id: string; snapshot: Snap }>(`select listing_id, snapshot from os_tenancy_archive`).catch(() => []);
    for (const g of left) {
      const s = g.snapshot ?? {};
      if (s.test) continue;
      const nation = toNation(nationOf(s.postcode ?? null, s.address, s.locality));
      const home = s.name || s.address || "";
      /* Tenants a home has had before count as past whether or not the home is
         still ours; the landlord only once the home itself has gone. */
      for (const t of s.tenants ?? []) {
        const e = usable(t?.email);
        if (!e) continue;
        if (nation) put(tenantsOther, nation, e, t.name ?? "", home);
        else unplaced.tenants_other.add(e);
      }
      if (onBook.has(g.listing_id)) continue;
      for (const l of [s.landlord, ...(s.otherLandlords ?? [])]) {
        const e = usable(l?.email);
        if (!e || !l) continue;
        if (nation) put(landlordsOther, nation, e, l.name ?? "", home);
        else unplaced.landlords_other.add(e);
      }
    }

    /* 6. Letting enquiries, a year back: the address is the home asked about. */
    const enquiries = await q<{ name: string | null; email: string | null; address: string | null; agent: string | null }>(
      `select distinct on (lower(email)) name, email, address, agent from os_leads
        where enquiry = 'Letting' and email like '%@%' and received_at > now() - interval '12 months'
        order by lower(email), received_at desc`
    ).catch(() => []);
    for (const l of enquiries) {
      const e = usable(l.email);
      if (!e) continue;
      const nation = toNation(nationOf(null, l.address)) ?? nationOfAgent(l.agent);
      if (nation) put(tenantsOther, nation, e, l.name ?? "", l.address ?? "");
      else unplaced.tenants_other.add(e);
    }

    /* 7. Tenant passports: the home they were sent for says the country. */
    const passports = await q<{ name: string | null; email: string | null; scottish_home: boolean | null }>(
      `select name, email, scottish_home from os_tenant_passports where email like '%@%'`
    ).catch(() => []);
    for (const p of passports) {
      const e = usable(p.email);
      if (!e || tenantsOther.ew.has(e) || tenantsOther.sc.has(e)) continue;
      if (p.scottish_home === null) unplaced.tenants_other.add(e);
      else put(tenantsOther, p.scottish_home ? "sc" : "ew", e, p.name ?? "", "");
    }
  }

  /* 8. PayProp's own record of tenancies that have ended. */
  for (const t of await payPropTenantRows().catch(() => [])) {
    const e = usable(typeof t.email_address === "string" ? t.email_address : null);
    if (!e) continue;
    const props = Array.isArray(t.properties) ? (t.properties as Array<{ address?: { first_line?: string; postal_code?: string }; tenant?: { end_date?: string } }>) : [];
    if (!props.length || props.some((p) => payPropTenancyCurrent(t.status, p?.tenant?.end_date))) continue;
    const name = [t.first_name, t.last_name].filter((x) => typeof x === "string" && x).join(" ") || (typeof t.display_name === "string" ? t.display_name : "");
    const first = props[0]?.address;
    const nation = toNation(nationOf(first?.postal_code ?? null, first?.first_line));
    if (nation) put(tenantsOther, nation, e, name, first?.first_line ?? "");
    else unplaced.tenants_other.add(e);
  }

  /* One side of "current" only, and nobody who has said no. */
  const gone = await out;
  let optedOut = 0;
  const seenOut = new Set<string>();
  const finish = (b: Buckets, not?: Buckets): Record<ListNation, ListPerson[]> => {
    const res = { ew: [] as ListPerson[], sc: [] as ListPerson[] };
    for (const n of ["ew", "sc"] as const) {
      for (const p of b[n].values()) {
        if (not && (not.ew.has(p.email) || not.sc.has(p.email))) continue;
        if (gone.has(p.email)) {
          if (!seenOut.has(p.email)) optedOut += 1;
          seenOut.add(p.email);
          continue;
        }
        res[n].push(p);
      }
      res[n].sort((a, z) => a.name.localeCompare(z.name));
    }
    return res;
  };
  const a = finish(landlordsNow);
  const b = finish(landlordsOther, landlordsNow);
  const c = finish(tenantsNow);
  const d = finish(tenantsOther, tenantsNow);
  const placed = (x: Buckets, y?: Buckets) => (e: string) => x.ew.has(e) || x.sc.has(e) || Boolean(y && (y.ew.has(e) || y.sc.has(e)));
  const count = (s: Set<string>, isPlaced: (e: string) => boolean) => [...s].filter((e) => !isPlaced(e) && !gone.has(e)).length;

  return {
    at: Date.now(),
    lists: {
      landlords_current_ew: a.ew, landlords_current_sc: a.sc,
      landlords_other_ew: b.ew, landlords_other_sc: b.sc,
      tenants_current_ew: c.ew, tenants_current_sc: c.sc,
      tenants_other_ew: d.ew, tenants_other_sc: d.sc,
    },
    unplaced: {
      landlords_current: count(unplaced.landlords_current, placed(landlordsNow)),
      landlords_other: count(unplaced.landlords_other, placed(landlordsOther, landlordsNow)),
      tenants_current: count(unplaced.tenants_current, placed(tenantsNow)),
      tenants_other: count(unplaced.tenants_other, placed(tenantsOther, tenantsNow)),
    },
    optedOut,
  };
}

const FRESH_MS = 5 * 60 * 1000;
let heldLists: ResolvedLists | null = null;
let inFlight: Promise<ResolvedLists> | null = null;

/** Every list as it stands now. `fresh` skips the five-minute copy: the sender uses it. */
export async function resolveLists(fresh = false): Promise<ResolvedLists> {
  if (!fresh && heldLists && Date.now() - heldLists.at < FRESH_MS) return heldLists;
  inFlight ??= work()
    .then((r) => (heldLists = r))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Everybody on the lists picked, one row a person, with the first list that named them. */
export async function peopleOn(ids: string[], fresh = false): Promise<Array<ListPerson & { list: ListId }>> {
  const picked = MAIL_LISTS.filter((l) => ids.includes(l.id));
  if (!picked.length) return [];
  const all = await resolveLists(fresh);
  const seen = new Map<string, ListPerson & { list: ListId }>();
  for (const l of picked) for (const p of all.lists[l.id]) if (!seen.has(p.email)) seen.set(p.email, { ...p, list: l.id });
  return [...seen.values()];
}
