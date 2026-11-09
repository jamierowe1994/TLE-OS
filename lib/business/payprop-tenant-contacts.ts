import "server-only";
import { londonToday } from "@/lib/london-clock";
import { payPropAccounts, payPropGetAll, type PayPropAccountId } from "@/lib/business/payprop";
import { readCache, writeCache } from "@/lib/business/integration-cache";
import { rentKey } from "@/lib/business/payprop-portfolio";

/*
 * TENANTS' EMAIL AND MOBILE FROM PAYPROP (James, 9 Oct 2026): "the contact
 * details for all of these tenants are missing ... we need email and mobile."
 * 613 of the book's 834 tenants are REX PM names with no contact behind them.
 * PayProp's tenant records carry email_address and mobile_number, tied to the
 * property the tenancy is on, so they are read live and joined by address.
 *
 * Who an email belongs to is the careful part. A joint tenancy is ONE PayProp
 * record with one email: "Josh Bradbury & Kacey-leigh Howe" names Josh as the
 * lead in first_name/last_name, so it is Josh's. "A George, O Kibble, K
 * Fraser, J Turner, P Chan" names no lead, so it is nobody's - unless the home
 * has only one tenant. A detail is never copied onto a co-tenant.
 *
 * Shares payprop:tenants:v1:<account> with lib/business/deposit-match (same
 * raw rows). Serves what is held, refreshes behind every half hour, and a copy
 * over two days old is not used.
 */

const FRESH_MS = 30 * 60_000;
const TOO_OLD_MS = 48 * 3_600_000;
const refreshing = new Set<PayPropAccountId>();

export type PayPropContact = { lead: string; email: string | null; phone: string | null };

const str = (v: unknown): string => String(v ?? "").trim();

/** 447552399818 → 07552 399818; anything else as PayProp holds it. */
export function ukPhone(v: unknown): string | null {
  const d = str(v).replace(/\D/g, "");
  if (!d) return null;
  const local = d.startsWith("44") && d.length === 12 ? `0${d.slice(2)}` : d.length === 11 && d.startsWith("0") ? d : null;
  return local ? `${local.slice(0, 5)} ${local.slice(5)}` : str(v);
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
const JOINT = /,|&|\band\b/i;

/** The one person a PayProp tenant record's email and mobile belong to, or null. */
function leadOf(t: Record<string, unknown>): { first: string; last: string } | null {
  const last = str(t.last_name);
  if (last) return { first: str(t.first_name), last };
  const display = str(t.display_name) || str(t.business_name);
  if (!display || JOINT.test(display)) return null;
  const w = display.split(/\s+/);
  return w.length >= 2 ? { first: w.slice(0, -1).join(" "), last: w[w.length - 1] } : null;
}

/** Current PayProp tenancies by rentKey, with their contact and named lead. */
/**
 * Still living there on `today`, by one of PayProp's tenant records on one
 * home. An end date decides it when there is one: PayProp marks a tenant
 * Inactive the moment their tenancy is given an end date, before they have
 * left (Flat 11, 24 Ashley Place, 27 Oct 2026: Inactive, ending 31 Oct, and
 * shown as past tenants with the flat empty). With no end date, Active is
 * current and Inactive is not.
 */
export function payPropTenancyCurrent(status: unknown, endDate: unknown, today = londonToday()): boolean {
  const end = str(endDate).slice(0, 10);
  if (end) return end >= today;
  return !str(status) || str(status) === "Active";
}

export type ContactsByKey = Map<string, Array<{ lead: { first: string; last: string } | null; display: string; email: string | null; phone: string | null }>>;

export function contactsByKey(rows: Array<Record<string, unknown>>, today = londonToday()): ContactsByKey {
  const out: ContactsByKey = new Map();
  for (const t of rows) {
    const email = str(t.email_address) ? str(t.email_address).toLowerCase() : null;
    const phone = ukPhone(t.mobile_number);
    if (!email && !phone) continue;
    const entry = { lead: leadOf(t), display: str(t.display_name), email, phone };
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      if (!payPropTenancyCurrent(t.status, (pr.tenant as Record<string, unknown> | undefined)?.end_date, today)) continue;
      const addr = pr.address as Record<string, unknown> | undefined;
      const keys = new Set([rentKey(str(pr.property_name), str(addr?.postal_code)), rentKey(str(addr?.first_line), str(addr?.postal_code))].filter(Boolean));
      for (const k of keys) out.set(k, [...(out.get(k) ?? []), entry]);
    }
  }
  return out;
}

/**
 * Which of a home's tenants each PayProp contact belongs to. A tenant gets a
 * contact when the record's lead has their surname (and, if two of the
 * home's tenants share it, their first name or initial), or when the home has
 * one tenant and one PayProp record. Returns tenant index → contact.
 */
export function attach(tenantNames: string[], records: ContactsByKey extends Map<string, infer V> ? V : never): Map<number, PayPropContact> {
  const out = new Map<number, PayPropContact>();
  if (!records.length) return out;
  if (tenantNames.length === 1 && records.length === 1) {
    const r = records[0];
    out.set(0, { lead: r.display, email: r.email, phone: r.phone });
    return out;
  }
  for (const r of records) {
    if (!r.lead) continue;
    const last = words(r.lead.last).join(" ");
    const first = words(r.lead.first)[0] ?? "";
    const bySurname = tenantNames.map((n, i) => ({ i, w: words(n) })).filter(({ w }) => w.length && w.join(" ").endsWith(last));
    const hits = bySurname.length > 1 ? bySurname.filter(({ w }) => first && (w[0] === first || (w[0].length === 1 && w[0] === first[0]))) : bySurname;
    if (hits.length !== 1 || out.has(hits[0].i)) continue;
    out.set(hits[0].i, { lead: r.display, email: r.email, phone: r.phone });
  }
  return out;
}

async function refresh(account: PayPropAccountId): Promise<void> {
  if (refreshing.has(account)) return;
  refreshing.add(account);
  try {
    const rows = await payPropGetAll<Record<string, unknown>>(account, "export/tenants");
    if (rows.length) await writeCache(`payprop:tenants:v1:${account}`, rows);
  } catch {
    /* the held copy stands until it is too old */
  } finally {
    refreshing.delete(account);
  }
}

async function heldRows(): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const account of payPropAccounts()) {
    const held = await readCache<Array<Record<string, unknown>>>(`payprop:tenants:v1:${account}`).catch(() => null);
    if (!held || Date.now() - held.at > FRESH_MS) void refresh(account);
    if (held && Date.now() - held.at < TOO_OLD_MS && Array.isArray(held.data)) rows.push(...held.data);
  }
  return rows;
}

/** PayProp's tenant records as held, every agency. Never waits on PayProp. */
export async function payPropTenantRows(): Promise<Array<Record<string, unknown>>> {
  return heldRows();
}

/** Every agency's current tenancies with a contact, by rentKey. Never waits on PayProp. */
export async function payPropContacts(): Promise<ContactsByKey> {
  return contactsByKey(await heldRows());
}

/** A person by their first and last word: "Michael  Blackmore", "Elizabeth Jane Aspden-Mansfield". */
export function personKey(name: string): string {
  const w = words(name);
  return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : "";
}

/**
 * PEOPLE PAYPROP HOLDS ONLY AS PAST TENANTS (Rhiannon Dodge, 16 Oct 2026).
 *
 * Room 2, 66 Fore Street showed Michael Blackmore as its tenant, with a
 * property visit owed for him, and his tenancy never went ahead. REX PM still
 * names him on the room; PayProp has him as an Inactive tenant on no home at
 * all, and nobody on the room. Of the 607 tenants the book takes from REX PM,
 * 15 are like him (30 Violet Crescent named Stephanie Russell, who left in
 * 2022; PayProp has Niomi Richer and Aaron Clark there now).
 *
 * A name is here when PayProp holds somebody by that first and last name and
 * NONE of their records is an Active tenancy on a home today. Every name on
 * a joint record counts: "Marcia Sanders & Michael Gallagher" is Active at 77
 * Rushmoor Drive, so Michael Gallagher is current. Somebody PayProp has never
 * heard of is not here - no record is not a moved-out record. Nothing is held
 * (PayProp not read), nothing is here.
 */
export function pastOnlyPeople(rows: Array<Record<string, unknown>>, today = londonToday()): Set<string> {
  const now = new Set<string>();
  const past = new Set<string>();
  for (const t of rows) {
    const props = (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>;
    const current = props.some((pr) => payPropTenancyCurrent(t.status, (pr.tenant as Record<string, unknown> | undefined)?.end_date, today));
    const names = new Set<string>();
    for (const part of (str(t.display_name) || str(t.business_name)).split(/\s*(?:,|&|\band\b)\s*/i)) {
      const k = personKey(part);
      if (k) names.add(k);
    }
    const lead = leadOf(t);
    if (lead) { const k = personKey(`${lead.first} ${lead.last}`); if (k) names.add(k); }
    for (const k of names) (current ? now : past).add(k);
  }
  for (const k of now) past.delete(k);
  return past;
}

/** Current tenancies by rentKey, and the people PayProp holds only as past tenants. */
export async function payPropPeople(): Promise<{ current: ContactsByKey; pastOnly: Set<string> }> {
  const rows = await heldRows();
  return { current: contactsByKey(rows), pastOnly: pastOnlyPeople(rows) };
}

export type TenancyDates = { startDate: string | null; endDate: string | null; depositId: string | null };
export type NextTenancyPerson = { name: string; email: string | null; phone: string | null };
export type HomeTenancies = {
  /** The tenancy the home's shown tenants are on, or null when PayProp has none for them. */
  theirs: TenancyDates | null;
  /** Somebody else's tenancy on the home, begun after theirs and not ended. */
  next: { startDate: string; people: NextTenancyPerson[] } | null;
};

const SIX_WEEKS = 42 * 86_400_000;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const surnameOf = (n: string) => words(n).pop() ?? "";

/**
 * WHO IS IN, AND WHO IS COMING (Lianna Denholm, 2 Nov 2026). 6 Ruskin Place
 * showed Keanne Galloway beside "Started 1 Nov": PayProp had his tenancy
 * ending 2 Nov and Anne McMillan-Clyne's beginning 1 Nov, and the register
 * keeps one tenancy a home, Active first, so his name sat on her dates.
 * James: the tenant in the tenancy stands until their move-out date, and the
 * new one is said beside them, "New tenancy starting" and the date.
 *
 * From PayProp's tenant records on one home: the dates of the tenancy the
 * shown tenants are on, and the newest tenancy on it for other people that
 * began after theirs and has not ended. Somebody else's tenancy that began
 * more than six weeks ago is not news - it is a name spelt another way.
 */
export function homeTenancies(
  rows: Array<Record<string, unknown>>,
  home: { address?: string | null; name: string; postcode?: string | null },
  shown: string[],
  today = londonToday()
): HomeTenancies {
  const key = rentKey(home.address || home.name, home.postcode);
  if (!key) return { theirs: null, next: null };
  const shownPeople = new Set(shown.map(personKey).filter(Boolean));
  const shownSurnames = new Set(shown.map(surnameOf).filter(Boolean));

  type Entry = { names: string[]; lead: string | null; email: string | null; phone: string | null; start: string; end: string; deposit: string; current: boolean };
  const entries: Entry[] = [];
  for (const t of rows) {
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      const addr = pr.address as Record<string, unknown> | undefined;
      const keys = [rentKey(str(pr.property_name), str(addr?.postal_code)), rentKey(str(addr?.first_line), str(addr?.postal_code))];
      if (!keys.includes(key)) continue;
      const tn = (pr.tenant ?? {}) as Record<string, unknown>;
      const lead = leadOf(t);
      const display = tidy(str(t.display_name) || str(t.business_name));
      const names = display.split(/\s*(?:,|&|\band\b)\s*/i).map(tidy).filter(Boolean);
      entries.push({
        names: names.length ? names : lead ? [tidy(`${lead.first} ${lead.last}`)] : [],
        lead: lead ? tidy(`${lead.first} ${lead.last}`) : names.length === 1 ? names[0] : null,
        email: str(t.email_address) ? str(t.email_address).toLowerCase() : null,
        phone: ukPhone(t.mobile_number),
        start: str(tn.start_date).slice(0, 10),
        end: str(tn.end_date).slice(0, 10),
        deposit: str(tn.deposit_id),
        current: payPropTenancyCurrent(t.status, tn.end_date, today),
      });
    }
  }
  const isShown = (e: Entry) => e.names.some((n) => shownPeople.has(personKey(n)) || shownSurnames.has(surnameOf(n)));

  const mine = entries.filter((e) => e.current && isShown(e)).sort((a, b) => b.start.localeCompare(a.start))[0];
  const theirs = mine ? { startDate: mine.start || null, endDate: mine.end || null, depositId: mine.deposit || null } : null;

  const after = mine?.start ?? "";
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - SIX_WEEKS).toISOString().slice(0, 10);
  const newer = entries.filter((e) => e.current && !isShown(e) && e.start && e.start > after && e.start >= since);
  const start = newer.map((e) => e.start).sort().pop();
  if (!start || !shown.length) return { theirs, next: null };
  const people: NextTenancyPerson[] = [];
  for (const e of newer.filter((x) => x.start === start)) {
    for (const name of e.names) {
      if (people.some((p) => personKey(p.name) === personKey(name))) continue;
      /* A joint record's email and mobile are its lead's, never a co-tenant's. */
      const own = e.lead != null && personKey(e.lead) === personKey(name);
      people.push({ name, email: own ? e.email : null, phone: own ? e.phone : null });
    }
  }
  return { theirs, next: people.length ? { startDate: start, people } : null };
}

/**
 * THE HOME'S LAST TENANCY, WHEN NOBODY IS IN IT NOW (Sean McMahon, 6 Nov
 * 2026). From PayProp's tenant records on one home, joined by its address as
 * homeTenancies is: the start and end of the tenancy that ended last, or null
 * while any tenancy on the home is current, or when PayProp holds none there
 * with an end date. A record PayProp holds as Inactive with no end date is
 * over, but says nothing about when, so it is not the last.
 */
export function homeLastTenancy(
  rows: Array<Record<string, unknown>>,
  home: { address?: string | null; name: string; postcode?: string | null },
  today = londonToday()
): { startDate: string | null; endDate: string } | null {
  const key = rentKey(home.address || home.name, home.postcode);
  if (!key) return null;
  let last: { startDate: string | null; endDate: string } | null = null;
  for (const t of rows) {
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      const addr = pr.address as Record<string, unknown> | undefined;
      const keys = [rentKey(str(pr.property_name), str(addr?.postal_code)), rentKey(str(addr?.first_line), str(addr?.postal_code))];
      if (!keys.includes(key)) continue;
      const tn = (pr.tenant ?? {}) as Record<string, unknown>;
      if (payPropTenancyCurrent(t.status, tn.end_date, today)) return null;
      const end = str(tn.end_date).slice(0, 10);
      if (end && (!last || end > last.endDate)) last = { startDate: str(tn.start_date).slice(0, 10) || null, endDate: end };
    }
  }
  return last;
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "mx"]);
/** "HSmith" is "H Smith"; titles and hyphens are not names. */
const nameWords = (s: string) =>
  words(s.replace(/\b([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/-/g, " ")).filter((w) => !TITLES.has(w.replace(/\.$/, "")));
/** One letter out, for a surname of five letters or more. */
function nearly(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Two spellings of one person: "K Smith" is "Kate Smith", "R Ward-Hall" is
 * "Rob Ward Hall", "Dr Hall" is "Ann Hall", "Ward-Hall Rob" is "Rob Ward-Hall",
 * "Rob" is "Rob Hall", "Mitchel" is "Mitchell".
 */
export function samePerson(a: string, b: string): boolean {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (!wa.length || !wb.length) return false;
  if (wa.length === 1 || wb.length === 1) {
    const [one, other] = wa.length === 1 ? [wa[0], wb] : [wb[0], wa];
    return other.some((w) => w === one || (one.length >= 3 && w.startsWith(one)) || nearly(w, one));
  }
  /* Every word of one is in the other: "Rory Power", "Rory Brian Power". */
  if (wa.every((w) => wb.includes(w)) || wb.every((w) => wa.includes(w))) return true;
  const la = wa[wa.length - 1];
  const lb = wb[wb.length - 1];
  if (wa[0] === lb && wb[0] === la) return true;
  if (!nearly(la, lb) && !wa.includes(lb) && !wb.includes(la)) return false;
  return wa[0][0] === wb[0][0];
}

/** A shown tenant can be a pair in one name: "Ann Hall & Rob Ward", "Ann & Rob Hall". */
const partsOf = (s: string) => s.split(/\s*(?:,|&|\band\b)\s*/i).map(tidy).filter(Boolean);
const isShownAs = (shownName: string, n: string) => partsOf(shownName).some((part) => samePerson(part, n));
const surnamesOf = (s: string) => partsOf(s).map((x) => nameWords(x).pop() ?? "").filter((x) => x.length > 1);

export type SittingPerson = { name: string; email: string | null; phone: string | null; contactId?: string };
export type Sitting = { tenants: SittingPerson[]; added: string[]; dropped: string[]; replaced: boolean; startDate: string | null; endDate: string | null; depositId: string | null };

/**
 * WHO LIVES THERE, AS PAYPROP HAS IT TODAY (Lianna Denholm, 9 Nov 2026,
 * tickets 1851a5b1, 4f9b7b74, bde77666).
 *
 * Three of her homes showed the wrong people. Two shared flats began new
 * joint tenancies on 1 Oct with one flatmate changed; the book named them
 * from REX PM's record, last read 2 Oct and never updated, so the new
 * flatmate was missing and the one who left in June was still there. The
 * third showed two people REX put on the listing when it was marked let in
 * September; PayProp, which takes the rent, has had somebody else there since
 * June and never heard of them.
 *
 * PayProp takes the rent from whoever lives there, so its tenancy running
 * today is who lives there. Joined by PayProp's own property id (the home's
 * sure address match, lib/rent-status matchHome), never by the loose address
 * key: "Flat 5, 50 X Road" and PayProp's "X Road, 50/5" key apart.
 *
 *   - Someone on the same running tenancy as a shown tenant, and not shown,
 *     is added.
 *   - A shown tenant PayProp holds on this home only on a tenancy that has
 *     ended or been replaced is taken off. Never on absence alone: PayProp's
 *     joint record can name the lead only.
 *   - Where nobody shown is on the running tenancy, its people replace them -
 *     unless the let began in the last six weeks and before PayProp's
 *     tenancy, which is PayProp not caught up with a new let yet.
 *
 * Measured on the live book, 9 Nov 2026: 34 of 533 current lets change.
 * Null when PayProp has no running tenancy on the home (a let only home after
 * its first month) or nothing changes.
 */
export function sittingFromPayProp(
  rows: Array<Record<string, unknown>>,
  payPropId: string,
  shown: SittingPerson[],
  letSince: string | null | undefined,
  today = londonToday(),
  livingElsewhere?: (name: string) => boolean
): Sitting | null {
  type Entry = { names: string[]; lead: string | null; email: string | null; phone: string | null; start: string; end: string; deposit: string; current: boolean; business: boolean };
  const entries: Entry[] = [];
  for (const t of rows) {
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      if (str(pr.id) !== payPropId) continue;
      const tn = (pr.tenant ?? {}) as Record<string, unknown>;
      const lead = leadOf(t);
      const display = tidy(str(t.display_name) || str(t.business_name));
      const names = display.split(/\s*(?:,|&|\band\b)\s*/i).map(tidy).filter(Boolean);
      entries.push({
        names: names.length ? names : lead ? [tidy(`${lead.first} ${lead.last}`)] : [],
        lead: lead ? tidy(`${lead.first} ${lead.last}`) : names.length === 1 ? names[0] : null,
        email: str(t.email_address) ? str(t.email_address).toLowerCase() : null,
        phone: ukPhone(t.mobile_number),
        start: str(tn.start_date).slice(0, 10),
        end: str(tn.end_date).slice(0, 10),
        deposit: str(tn.deposit_id),
        current: payPropTenancyCurrent(t.status, tn.end_date, today),
        /* A company paying the rent - a rent-to-rent firm, a housing provider -
           is not who lives there; nor is one record renting several homes at
           once (one couple held as renting four homes, 9 Nov 2026). Not PayProp's business_name:
           it is filled for most people. */
        business:
          /\b(ltd|limited|group|plc|llp|housing|council|network|services|suites)\b/i.test(display) ||
          ((Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>).filter((x) =>
            payPropTenancyCurrent(t.status, ((x.tenant ?? {}) as Record<string, unknown>).end_date, today)).length > 1,
      });
    }
  }
  /* Running today: begun, not ended, and not one on its way out once a newer one has begun. */
  const begun = entries.filter((e) => e.current && (!e.start || e.start <= today));
  const latest = begun.map((e) => e.start).sort().pop() ?? "";
  const running = begun.filter((e) => !e.end || e.start === latest);
  if (!running.length) return null;
  const over = entries.filter((e) => !running.includes(e));

  /* A joint record with no lead named ("S Hall, K Ward & J Lee") is its
     email's owner's: the one whose surname the email carries, where only one
     does - sam.hall@ is S Hall. And "S Hall" is "Sam Hall" when the email
     spells it out first.last. */
  const local = (e: Entry) => (e.email ?? "").split("@")[0].toLowerCase();
  const ownerOf = (e: Entry): string | null => {
    if (e.lead) return e.lead;
    if (e.names.length === 1) return e.names[0];
    const hits = e.names.filter((n) => { const last = nameWords(n).pop() ?? ""; return last.length > 2 && local(e).replace(/[^a-z]/g, "").includes(last.replace(/[^a-z]/g, "")); });
    return hits.length === 1 ? hits[0] : null;
  };
  const personOf = (e: Entry, name: string): SittingPerson => {
    /* A joint record's email and mobile are its lead's, never a co-tenant's. */
    const owner = ownerOf(e);
    const own = owner != null && samePerson(owner, name);
    const w = nameWords(name);
    const m = /^([a-z]{2,})[._]([a-z'-]{2,})$/.exec(local(e));
    const full = own && w.length === 2 && w[0].length === 1 && m && m[1][0] === w[0] && m[2] === w[1]
      ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${name.split(/\s+/).pop()}`
      : name;
    return { name: full, email: own ? e.email : null, phone: own ? e.phone : null };
  };
  if (running.some((e) => e.business)) return null;
  const people: SittingPerson[] = [];
  for (const e of running) for (const n of e.names) if (!people.some((p) => samePerson(p.name, n))) people.push(personOf(e, n));
  const first = [...running].sort((a, b) => (a.start || "9").localeCompare(b.start || "9"))[0];
  const dates = { startDate: first.start || null, endDate: first.end || null, depositId: first.deposit || null };
  const shownHas = (n: string) => shown.some((s) => isShownAs(s.name, n));
  const onRunning = (s: SittingPerson) => people.some((p) => isShownAs(s.name, p.name));

  /* The same family counts as the same household: a parent on the tenancy beside their child adds, never replaces. */
  const shownSurnames = new Set(shown.flatMap((s) => surnamesOf(s.name)));
  const kin = people.some((p) => surnamesOf(p.name).some((x) => shownSurnames.has(x)));
  if (shown.some(onRunning) || kin) {
    const theirs = running.filter((e) => e.names.some((n) => shownHas(n) || surnamesOf(n).some((x) => shownSurnames.has(x))));
    const added: SittingPerson[] = [];
    for (const e of theirs) {
      for (const n of e.names) {
        if (shownHas(n) || added.some((a) => samePerson(a.name, n))) continue;
        added.push(personOf(e, n));
      }
    }
    const gone = shown.filter((s) => !onRunning(s) && over.some((e) => e.names.some((n) => isShownAs(s.name, n))));
    if (!added.length && !gone.length) return null;
    return {
      tenants: [...shown.filter((s) => !gone.includes(s)), ...added],
      added: added.map((a) => a.name),
      dropped: gone.map((g) => g.name),
      replaced: false,
      ...dates,
    };
  }

  /* Nobody shown is on it. REX marked a let PayProp never took rent on, or PayProp has a newer tenancy than the let REX knows. Not in a
     new let's first six weeks while PayProp's tenancy is the older one: that
     is PayProp not set up for the new tenants yet. Not where PayProp holds a
     shown tenant as living anywhere today - they are somebody's real tenant. */
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - SIX_WEEKS).toISOString().slice(0, 10);
  if (shown.length && letSince && letSince.slice(0, 10) > since && latest < letSince.slice(0, 10)) return null;
  if (shown.some((s) => livingElsewhere?.(s.name))) return null;
  return { tenants: people, added: people.map((p) => p.name), dropped: shown.map((s) => s.name), replaced: true, ...dates };
}

/** Everybody on a PayProp tenancy running today, with the PayProp property it is on. */
export function livingNow(rows: Array<Record<string, unknown>>, today = londonToday()): Array<{ name: string; propertyId: string }> {
  const out: Array<{ name: string; propertyId: string }> = [];
  for (const t of rows) {
    const display = tidy(str(t.display_name) || str(t.business_name));
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      const tn = (pr.tenant ?? {}) as Record<string, unknown>;
      if (!payPropTenancyCurrent(t.status, tn.end_date, today) || str(tn.start_date).slice(0, 10) > today) continue;
      for (const name of partsOf(display)) out.push({ name, propertyId: str(pr.id) });
    }
  }
  return out;
}
