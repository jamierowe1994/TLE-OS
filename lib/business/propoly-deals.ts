import "server-only";
import { propolyConfigured, propolyGet } from "@/lib/business/propoly";
import { loadSnapshot, saveSnapshot } from "@/lib/business/propoly-snapshot";
import { hasDb, q } from "@/lib/business/db";
import { agentKeysForName } from "@/lib/business/roster";
import type {
  AgentApplication,
  ApplicationStage,
  ApplicationTenant,
} from "@/lib/business/rex-stats";

// Propoly deals → the agent's tenancy-progression pipeline, normalised into
// the same AgentApplication shape the Applications tab already renders (so
// the UI needed no changes when the source flipped from REX to Propoly).
//
// Shapes confirmed against the live API, 21 Jul 2026:
//   GET /deals?tenancy_status=X&per_page=25&page=N
//     → { deals: [...], total_entries, per_page (caps at 25) }
//   statuses: start_deal · holding_fee · references · tenancy_generation ·
//             signing_and_move_in_monies · complete · cancelled
//   GET /properties → rows carry managed_by_user_data { email, first/last }
//     — the per-agent key: matches the agent's portal login email.
//
// ── PROPOLY RESHAPED /deals, 6 Sep 2026 ───────────────────────────────────
//
// Kirstie's board showed "Address unavailable" on every property. Nothing
// here had changed: Propoly moved the deal payload from ~20 flat fields to 14
// keys of nested objects, so every read below missed and every value came
// back undefined. It reads as one broken field; it was the whole record.
//
//   property_address       → property.address   (and COMMA-separated now,
//                                                not one line per part)
//   property_uuid          → property.uuid      ← the manager join, so the
//                                                agent went null on every row
//   tenant_details[]       → tenants[]          (first_name/last_name)
//   landlord_details[]     → landlords[]        (+ is_lead)
//   guarantors_details[]   → guarantors[]
//   price_pcm_pence        → terms.price_pcm_pence
//   deposit_pence          → terms.deposit_pence
//   holding_fee_pence      → terms.holding_fee_pence
//   move_in_date           → terms.move_in_date
//
// Every read takes the new path first and falls back to the old one, so a
// rollback at their end costs us nothing.
//
// ── WHAT PROPOLY NO LONGER SENDS ──────────────────────────────────────────
//
// Not moved — GONE, from both /deals and /deals/{uuid}, and no include=,
// expand=, view= or /api/v2 brings them back (all probed 6 Sep):
//
//   tenant + landlord email and phone  — we can no longer contact a party
//                                        from a deal; only their name
//   extra_clauses_details              — backed the Flatfair deposit-
//                                        replacement flag, which now can
//                                        never be true. On those deals
//                                        deposit_pence is a liability cap,
//                                        not cash to register, so this is
//                                        the loss that MATTERS
//   standing_order_reference           — the "Standing order set up" tick
//   tenancy_service_level              — managed / tenant find / rent collect
//   pets                               — the Pets row on the drawer
//
// These are read as null/false rather than guessed at. Ask Propoly whether
// this was deliberate data-minimisation and whether a scope on our agent
// credential restores them; do not infer any of them from something else.
//
// The new payload does carry things we never had — referencing{}, agreements{},
// payments{} and a per-deal assigned_agent{} — which map onto Kirstie's
// checklist better than what they replaced. payments.holding_deposit and
// referencing{} are read since 2 Oct 2026, for the words under a stage only:
// they never move a deal (lib/business/stage-evidence).
//
// CONTRACT (as lib/rex-stats.ts): never throw into a page — return null so
// the caller can fall back; cache so a dashboard load doesn't hammer them.

const PER_PAGE = 25;
const OVERALL_DEADLINE_MS = 15_000; // cold cache is ~30 parallel calls
/** Pages of one list asked for at once. 23 at once is how a walk trips a rate limit. */
const PAGE_CONCURRENCY = 4;

/**
 * ONE READER OF PROPOLY, EVERY SCREEN READS ITS COPY (27 Sep 2026).
 *
 * Propoly caps our key (40,000 calls, the last they told us) and gives us no
 * webhooks, so we have to poll - and we were polling from everywhere. Every
 * screen that showed a deal walked Propoly itself when its own copy was a
 * minute old: the board, each drawer tab, applications, the portals, company
 * figures, and the TLE portal next door doing the same with the same key.
 * Around 10,000-15,000 calls on a working day, and the key ran dry on 21 Sep.
 *
 * Now the watcher cron is the one reader. Every five minutes in office hours
 * (every half hour otherwise) it walks the deals and saves them in
 * propoly_cache; the property->manager book once a day; completed deals once
 * an hour. Everything else reads the saved copy - which the TLE portal reads
 * too - and checks the database for a newer one every thirty seconds. That is
 * about 1,500 calls a day however many people have the board open.
 *
 * A screen walks Propoly itself only when the saved copy is well past due
 * (the cron has stopped), and then only one walk runs at a time across every
 * process of both products, because the walker claims a row first. A walk
 * that fails holds its claim, which is the back-off: nobody re-walks into a
 * rate limit straight away. "Refresh now" on the board asks for a walk out of
 * turn, at most once a minute.
 */
type Book = "deals" | "managers" | "completes";
const SNAPSHOT_KEY: Record<Book, string> = { deals: "deals_v3", managers: "managers", completes: "completes-v4" };
const CHECK_STORE_MS = 30_000;
const CLAIM_MS = 3 * 60_000;
const MIN = 60_000;
/** How often the cron re-reads each book: [in office hours, outside them]. */
const DUE_MS: Record<Book, [number, number]> = {
  deals: [4 * MIN, 30 * MIN],
  managers: [24 * 60 * MIN, 24 * 60 * MIN],
  completes: [60 * MIN, 3 * 60 * MIN],
};
/** How old a saved copy may get before a screen stops trusting the cron and reads Propoly itself. */
const FALLBACK_MS: Record<Book, [number, number]> = {
  deals: [20 * MIN, 90 * MIN],
  managers: [36 * 60 * MIN, 36 * 60 * MIN],
  completes: [3 * 60 * MIN, 6 * 60 * MIN],
};

/** Office hours in London: Monday to Friday 8 till 7, Saturday 9 till 5. */
export function propolyOfficeHours(at = new Date()): boolean {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", hour12: false })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const h = Number(parts.hour) % 24;
  if (parts.weekday === "Sun") return false;
  if (parts.weekday === "Sat") return h >= 9 && h < 17;
  return h >= 8 && h < 19;
}
const pick = (pair: [number, number]) => pair[propolyOfficeHours() ? 0 : 1];

// Progression order (order asc = earliest stage). complete is excluded —
// those are move-ins, not pipeline; cancelled feeds the page's hidden
// "unsuccessful" section.
const STATUS_INFO: Record<string, { label: string; stage: ApplicationStage; order: number }> = {
  start_deal: { label: "Deal started", stage: "received", order: 0 },
  holding_fee: { label: "Holding fee taken", stage: "received", order: 1 },
  references: { label: "Awaiting references", stage: "communicated", order: 2 },
  tenancy_generation: { label: "Tenancy generation", stage: "communicated", order: 3 },
  signing_and_move_in_monies: { label: "Signing & move-in monies", stage: "accepted", order: 4 },
  cancelled: { label: "Cancelled", stage: "unsuccessful", order: 99 },
};
/** Propoly's status key in the words a person would use. */
export const dealStatusLabel = (key: string): string =>
  STATUS_INFO[key]?.label ?? key.replace(/_/g, " ");

const ACTIVE_STATUSES = [
  "start_deal",
  "holding_fee",
  "references",
  "tenancy_generation",
  "signing_and_move_in_monies",
] as const;

const SERVICE_LABELS: Record<string, string> = {
  full_managed: "Fully managed",
  tenant_find: "Tenant find",
  rent_collect: "Rent collect",
};

/* ------------------------------------------------------------------------ */
/* Paged fetching                                                            */
/* ------------------------------------------------------------------------ */

function rowsOf(body: unknown): Array<Record<string, unknown>> | null {
  if (!body || typeof body !== "object") return null;
  const arr = Object.values(body as Record<string, unknown>).find(Array.isArray);
  return arr ? (arr as Array<Record<string, unknown>>) : null;
}

/**
 * Fetch every page of a list endpoint (page 1 first, the rest in parallel).
 * NEVER throws — a token failure (e.g. Propoly's 429 backoff) must surface
 * as null so callers fall back to their last-good snapshot, not as an
 * exception that skips the fallback entirely.
 */
async function listAll(
  basePath: string,
  maxPages: number
): Promise<Array<Record<string, unknown>> | null> {
  try {
    return await listAllInner(basePath, maxPages);
  } catch {
    return null;
  }
}

async function listAllInner(
  basePath: string,
  maxPages: number
): Promise<Array<Record<string, unknown>> | null> {
  const sep = basePath.includes("?") ? "&" : "?";
  const first = await propolyGet(`${basePath}${sep}per_page=${PER_PAGE}&page=1`);
  if (first.status !== 200) return null;
  const env = first.body as Record<string, unknown>;
  let rows = rowsOf(env);
  if (!rows) return null;
  rows = [...rows];

  const total = typeof env.total_entries === "number" ? env.total_entries : rows.length;
  const perPage =
    typeof env.per_page === "number" && env.per_page > 0 ? env.per_page : PER_PAGE;
  const pages = Math.min(Math.ceil(total / perPage), maxPages);
  if (pages > 1) {
    /* A few pages at a time, and the first refusal stops the walk: the rest
       would only be refused too, and each refusal still counts against the quota. */
    for (let from = 2; from <= pages; from += PAGE_CONCURRENCY) {
      const batch = Array.from({ length: Math.min(PAGE_CONCURRENCY, pages - from + 1) }, (_, i) => from + i);
      const rest = await Promise.all(batch.map((n) => propolyGet(`${basePath}${sep}per_page=${PER_PAGE}&page=${n}`)));
      for (const res of rest) {
        const more = res.status === 200 ? rowsOf(res.body) : null;
        if (!more) return null;
        rows.push(...more);
      }
    }
  }
  // A silently-dropped page must fail the whole fetch — callers CACHE these
  // lists, and a partial one reads as "fewer move-ins/deals than reality"
  // for the next 10 minutes (we watched YTD show 112 instead of 146).
  const expected = Math.min(total, pages * perPage);
  if (rows.length < expected) return null;
  return rows;
}

/* ------------------------------------------------------------------------ */
/* Property → manager map                                                    */
/* ------------------------------------------------------------------------ */

interface Manager {
  email: string | null;
  name: string;
}

/* Every copy of this module in the build shares one set of books (the build
   carries it several times over; see lib/business/propoly.ts on the token). */
interface Held<T> {
  at: number; // when this copy was read from Propoly
  checkedAt: number; // when we last asked the database for a newer one
  data: T;
}
interface Books {
  deals: Held<CachedDeal[]> | null;
  managers: Held<Map<string, Manager>> | null;
  completes: Held<CompletedDeal[]> | null;
  inflight: Map<string, Promise<unknown>>;
}
declare global {
  // eslint-disable-next-line no-var
  var __propolyBooks: Books | undefined;
}
const books: Books = (globalThis.__propolyBooks ??= { deals: null, managers: null, completes: null, inflight: new Map() });

/** When the saved copy of a book was written, or null if there is none. */
async function storedAt(book: Book): Promise<number | null> {
  if (!hasDb()) return books[book]?.at ?? null;
  const rows = await q<{ updated_at: string | Date }>(`SELECT updated_at FROM propoly_cache WHERE key = $1`, [SNAPSHOT_KEY[book]]).catch(() => []);
  return rows[0] ? new Date(rows[0].updated_at).getTime() : null;
}

/** Take this book's saved copy into memory if it is newer than ours. */
async function adoptStored(book: Book): Promise<void> {
  const held = books[book] as Held<unknown> | null;
  const at = await storedAt(book);
  if (at != null && (!held || at > held.at)) {
    const snap = await loadSnapshot<unknown>(SNAPSHOT_KEY[book]);
    if (snap) {
      const data = book === "managers" ? new Map(snap.data as [string, Manager][]) : snap.data;
      (books as unknown as Record<Book, Held<unknown>>)[book] = { at: snap.savedAt, checkedAt: Date.now(), data };
      return;
    }
  }
  if (held) held.checkedAt = Date.now();
}

/**
 * The claim that makes one walker across every process of both products: a
 * row in propoly_cache that only one of them can take in any CLAIM_MS. It is
 * not given back when a walk fails - that is the back-off.
 */
async function claimWalk(book: Book, holdMs = CLAIM_MS): Promise<boolean> {
  if (!hasDb()) return true;
  const rows = await q<{ key: string }>(
    `INSERT INTO propoly_cache (key, data, updated_at) VALUES ($1, '{}', NOW())
     ON CONFLICT (key) DO UPDATE SET updated_at = NOW()
       WHERE propoly_cache.updated_at < NOW() - ($2::int * INTERVAL '1 millisecond')
     RETURNING key`,
    [`claim:${book}`, holdMs]
  ).catch(() => undefined);
  /* The database not answering must not stop Propoly being read at all:
     fail open, and the in-process guard still keeps it to one walk here. */
  if (rows === undefined) return true;
  return rows.length > 0;
}

const WALKERS: Record<Book, () => Promise<unknown>> = {
  deals: () => runDealsFetch(),
  managers: () => refreshManagers(),
  completes: () => refreshCompletes(),
};

/** Read one book from Propoly now, if nobody else is. Null when we did not walk or it failed. */
async function walkBook<T>(book: Book, holdMs?: number): Promise<T | null> {
  return oneWalk(`walk:${book}`, async () => {
    if (!(await claimWalk(book, holdMs))) return null;
    return (await WALKERS[book]()) as T | null;
  });
}

/**
 * A book as a screen sees it: the saved copy, re-checked against the database
 * every thirty seconds. Propoly itself only when that copy is long overdue.
 */
async function readBook<T>(book: Book): Promise<T | null> {
  const now = Date.now();
  let held = books[book] as Held<T> | null;
  if (!held || now - held.checkedAt >= CHECK_STORE_MS) {
    await adoptStored(book);
    held = books[book] as Held<T> | null;
  }
  if (held && Date.now() - held.at <= pick(FALLBACK_MS[book])) return held.data;
  const fresh = await walkBook<T>(book);
  return fresh ?? (books[book] as Held<T> | null)?.data ?? null;
}

/**
 * The cron's turn: re-read whichever books are due, then hand back what was
 * done. Deals every five minutes in office hours and half-hourly outside,
 * managers daily, completed deals hourly.
 */
export async function refreshPropolyBooks(): Promise<Record<Book, string>> {
  const out = {} as Record<Book, string>;
  for (const book of ["managers", "deals", "completes"] as Book[]) {
    const at = await storedAt(book);
    const age = at == null ? Infinity : Date.now() - at;
    if (age < pick(DUE_MS[book])) {
      out[book] = `fresh (${Math.round(age / MIN)} min old)`;
      continue;
    }
    const got = await walkBook(book);
    out[book] = got ? "read from Propoly" : "not read (someone else is reading it, or Propoly refused)";
    await adoptStored(book);
  }
  return out;
}

/** "Refresh now" on the board: a walk of the deals out of turn, at most once a minute. */
export async function refreshPropolyDealsNow(): Promise<{ savedAt: number | null; walked: boolean }> {
  const at = await storedAt("deals");
  let walked = false;
  if (at == null || Date.now() - at >= MIN) walked = Boolean(await walkBook("deals", MIN));
  await adoptStored("deals");
  return { savedAt: books.deals?.at ?? null, walked };
}

/** When the deals the screens are showing were read from Propoly. */
export async function propolyDealsSavedAt(): Promise<number | null> {
  return storedAt("deals");
}

async function propertyManagers(): Promise<Map<string, Manager> | null> {
  return readBook<Map<string, Manager>>("managers");
}

/**
 * ONE WALK OF A BIG LIST AT A TIME (16 Sep 2026).
 *
 * The deals board got its inflight guard; the two lists underneath it did not.
 * The pre-tenancy board asks for the pipeline and the move-in forecast in the
 * same breath, the business page asks for its stats and its RLP together, and
 * both of those reach the property book and the completed deals. On a cold
 * cache each caller fired its own walk - 23 pages of properties, 20-odd of
 * completes, all in parallel - so one screen was 80-plus calls in a second and
 * Propoly answered with 429s: 37 in one minute on the morning of 16 Sep. The
 * second caller now waits for the first walk instead of starting its own.
 */
const inflight = books.inflight;

function oneWalk<T>(key: string, walk: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const work = walk();
  inflight.set(key, work);
  void work
    .catch(() => null)
    .finally(() => {
      if (inflight.get(key) === work) inflight.delete(key);
    });
  return work;
}

async function refreshManagers(): Promise<Map<string, Manager> | null> {
  const rows = await listAll("/api/v1/properties", 40); // 574 props ≈ 23 pages
  if (!rows) return null;
  const map = new Map<string, Manager>();
  for (const p of rows) {
    const uuid = typeof p.uuid === "string" ? p.uuid : null;
    const mgr = p.managed_by_user_data as Record<string, unknown> | null | undefined;
    if (!uuid || !mgr || typeof mgr !== "object") continue;
    const email = typeof mgr.email === "string" ? mgr.email.trim().toLowerCase() : null;
    const name = [mgr.first_name, mgr.last_name]
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .join(" ")
      .trim();
    map.set(uuid, { email, name });
  }
  books.managers = { at: Date.now(), checkedAt: Date.now(), data: map };
  await saveSnapshot("managers", [...map.entries()]);
  return map;
}

/* ------------------------------------------------------------------------ */
/* Deals                                                                     */
/* ------------------------------------------------------------------------ */

interface CachedDeal {
  app: AgentApplication;
  statusKey: string;
  managerEmail: string | null;
  managerName: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** A nested object, or an empty one — so `obj(d.terms).price_pcm_pence` is safe. */
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];

/** "Ada" + "Lovelace" → "Ada Lovelace", or null if neither is there. */
function personName(r: Record<string, unknown>): string | null {
  const joined = [r.first_name, r.last_name]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" ")
    .trim();
  return str(r.name) ?? (joined || null);
}

/**
 * The deal's address, however Propoly is spelling it this week.
 *
 * It used to be `property_address`, a single string with a line per part:
 * "4 Staddon Gardens,\nTorquay,\nDevon,\nTQ2 8DP". On 6 Sep 2026 it became
 * `property.address` on a nested object, comma-separated on one line:
 * "29/9 Springfield Street, Edinburgh, Midlothian, EH6 5DU".
 *
 * Splitting on newlines OR commas reads both, so a rollback at their end
 * doesn't break us a second time.
 */
function splitAddress(raw: unknown): { name: string; locality: string } {
  const lines = (typeof raw === "string" ? raw : "")
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { name: "Address unavailable", locality: "" };
  /* A sub-building on its own isn't a name — take the building line with it.
     Named forms ("Flat 1") and the Scottish numeric ones the Edinburgh book is
     full of ("2f1", "3/2"), which carry no keyword to match on. */
  const sub =
    /^(flat|apartment|apt|unit|room|studio)\b/i.test(lines[0]) ||
    /^\d+[a-z]?(\/\d+[a-z]?)?$/i.test(lines[0]) ||
    lines[0].length <= 4;
  const nameLines = sub && lines.length > 2 ? 2 : 1;
  const name = lines.slice(0, nameLines).join(", ");
  const town = lines[nameLines] ?? "";
  const last = lines[lines.length - 1] ?? "";
  const postcode = last !== town && /\d/.test(last) ? last : "";
  return { name, locality: [town, postcode].filter(Boolean).join(" ") };
}

/** The property leg of a deal: `property.uuid` now, `property_uuid` before. */
function propertyUuidOf(d: Record<string, unknown>): string | null {
  return str(obj(d.property).uuid) ?? str(d.property_uuid);
}

function toApplication(d: Record<string, unknown>, statusKey: string): AgentApplication {
  const info = STATUS_INFO[statusKey] ?? {
    label: statusKey.replace(/_/g, " "),
    stage: "received" as ApplicationStage,
    order: 50,
  };
  const { name, locality } = splitAddress(obj(d.property).address ?? d.property_address);

  /* Tenants moved from `tenant_details` to `tenants`, and lost their email and
     phone on the way — see the CONTACT DETAILS note at the top of the file.
     Read both shapes; whichever one answers, contact is null when absent
     rather than an empty string, so nothing renders a blank mailto. */
  const rawTenants = arr(d.tenants).length ? arr(d.tenants) : arr(d.tenant_details);
  const tenants: ApplicationTenant[] = rawTenants.map((t, i) => ({
    name: personName(t) ?? "Unnamed tenant",
    email: str(t.email),
    phone: str(t.phone),
    isPrimary: typeof t.is_lead === "boolean" ? t.is_lead : i === 0,
  }));

  const terms = obj(d.terms);
  const pencePcm = num(terms.price_pcm_pence) ?? num(d.price_pcm_pence);
  const depositPence = num(terms.deposit_pence) ?? num(d.deposit_pence);
  const holdingPence = num(terms.holding_fee_pence) ?? num(d.holding_fee_pence);
  const service = SERVICE_LABELS[String(d.tenancy_service_level ?? "")] ?? null;
  const pets = d.pets;
  const hasPets =
    pets === true || (typeof pets === "string" && /^(y|yes|true)/i.test(pets.trim()));

  return {
    id: String(d.uuid ?? ""),
    stage: info.stage,
    status: info.label,
    // The offer timeline is a REX concept and Propoly holds no equivalent:
    // Propoly picks a deal up at "accepted" and knows nothing about how long
    // the offer sat first. Null rather than 0 so nothing averages these in as
    // same-day decisions — a deal we can't time must not read as instant.
    dateCommunicated: null,
    dateAccepted: null,
    dateUnsuccessful: null,
    daysToLandlord: null,
    daysToDecision: null,
    endDate: null,
    leaseType: null,
    agreementType: null,
    propertyName: name,
    locality,
    image: null, // Propoly has no listing photos
    offer: pencePcm != null ? Math.round(pencePcm / 100) : null,
    offerPeriod: "month",
    affordability: null,
    dateReceived: str(d.created_at)?.slice(0, 10) ?? null,
    startDate: str(terms.move_in_date) ?? str(d.move_in_date),
    agreementMonths: null,
    occupants: tenants.length || null,
    hasPets,
    tenants,
    notes: null,
    conditions: null,
    // The progression board on the Applications drawer runs off this.
    propoly: {
      statusKey,
      holdingFee: holdingPence != null ? Math.round(holdingPence / 100) : null,
      deposit: depositPence != null ? Math.round(depositPence / 100) : null,
      service,
      // Populated on 10 of 10 sampled deals, so it can be relied on — unlike
      // property_type next to it, which was populated on 3 of 10 and only ever
      // said "flat". Backs the "Standing order set up" checklist tick.
      standingOrderRef: str(d.standing_order_reference) ?? null,
      // extra_clauses_details carries a verbatim Flatfair "DEPOSIT
      // REPLACEMENT" clause on ~44% of deals (probe, 2 Aug 2026). On those
      // deals deposit_pence is a liability cap, not cash to register — so the
      // flag matters more than the figure.
      // Tightened after review: a clause merely MENTIONING deposit
      // replacement must not flag the deal. Either the Flatfair name appears,
      // or the clause IS the deposit-replacement clause (heading position).
      depositReplacement: (Array.isArray(d.extra_clauses_details)
        ? (d.extra_clauses_details as unknown[])
        : []
      ).some((c) => {
        const t = String(c ?? "");
        return /flatfair/i.test(t) || /^\s*deposit\s+replacement\b/i.test(t);
      }),
      landlord: firstParty(arr(d.landlords).length ? d.landlords : d.landlord_details),
      propertyUuid: propertyUuidOf(d),
      landlordUuids: (arr(d.landlords).length ? arr(d.landlords) : arr(d.landlord_details))
        .map((l) => (typeof l.uuid === "string" ? l.uuid : null))
        .filter((u): u is string => Boolean(u)),
      guarantors: partyList(arr(d.guarantors).length ? d.guarantors : d.guarantors_details),
      /* Wired in 2 Oct 2026 (James, checking 4 Williams Court): the holding
         fee is paid by card inside Propoly, and referencing is tracked there,
         so these are the receipts the stage lines were missing. Read only. */
      holdingPaid: (() => {
        const h = obj(obj(d.payments).holding_deposit);
        return str(h.status) ? { status: String(h.status), paidAt: str(h.paid_at), method: str(h.method) } : null;
      })(),
      tenantRefs: arr(d.tenants).length
        ? arr(d.tenants).map((t) => ({
            name: [str(t.first_name), str(t.last_name)].filter(Boolean).join(" ") || "A tenant",
            required: t.reference_required !== false,
            decision: str(obj(t.reference).decision),
          }))
        : undefined,
      agreement: (() => {
        const ag = obj(d.agreements);
        const ta = obj(ag.tenancy_agreement);
        if (!str(ta.signing_status)) return null;
        const g = obj(ag.guarantor_agreements);
        const signedBy = (list: Record<string, unknown>[]) =>
          list.filter((x) => Boolean(obj(x.signatures).tenancy_agreement)).length;
        const tenants = arr(d.tenants);
        const landlords = arr(d.landlords);
        return {
          status: String(ta.signing_status),
          tenants: tenants.length,
          tenantsSigned: signedBy(tenants),
          landlords: landlords.length,
          landlordsSigned: signedBy(landlords),
          guarantorStatus: str(g.signing_status),
          guarantorsRequired: num(g.required) ?? 0,
          guarantorsDone: num(g.completed) ?? 0,
        };
      })(),
      moveInMonies: (() => {
        const m = obj(obj(d.payments).move_in_monies);
        return str(m.status) ? { status: String(m.status), paidAt: str(m.paid_at) } : null;
      })(),
      executedAt: str(d.tenancy_executed_at),
      referencing: (() => {
        const r = obj(d.referencing);
        return str(r.status)
          ? {
              status: String(r.status),
              outcome: str(r.outcome),
              startedAt: str(r.started_at),
              required: num(r.references_required) ?? 0,
              decided: num(r.references_decided) ?? 0,
            }
          : null;
      })(),
    },
  };
}

/** {uuid,name,email,phone} rows arrive as an array OR a bare object. */
function partyList(
  v: unknown
): Array<{ name: string | null; email: string | null; phone: string | null }> {
  const rows = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
  return (rows as Array<Record<string, unknown>>)
    .map((r) => ({
      name: personName(r),
      email: str(r.email) ?? null,
      phone: str(r.phone) ?? null,
    }))
    .filter((p) => p.name || p.email || p.phone);
}

/** The lead landlord where Propoly flags one, else the first listed. */
function firstParty(
  v: unknown
): { name: string | null; email: string | null; phone: string | null } | null {
  const rows = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  const leadAt = rows.findIndex((r) => r.is_lead === true);
  const list = partyList(v);
  return (leadAt >= 0 ? list[leadAt] : list[0]) ?? null;
}

async function fetchAllDeals(): Promise<CachedDeal[] | null> {
  return readBook<CachedDeal[]>("deals");
}

async function runDealsFetch(): Promise<CachedDeal[] | null> {
  const [managerMap, ...statusLists] = await Promise.all([
    propertyManagers(),
    ...ACTIVE_STATUSES.map((s) => listAll(`/api/v1/deals?tenancy_status=${s}`, 8)),
    // Cancelled outnumber live 191:120 — one page feeds the hidden section.
    listAll("/api/v1/deals?tenancy_status=cancelled", 1),
  ]);
  const keys = [...ACTIVE_STATUSES, "cancelled"];
  // Any missing status list would under-count that stage — keep the previous
  // complete copy (the readers fall back to it) rather than save a short one.
  if (statusLists.some((l) => l == null)) return null;

  const deals: CachedDeal[] = [];
  statusLists.forEach((rows, i) => {
    for (const d of rows ?? []) {
      /* The join that decides WHOSE board a deal lands on. When this silently
         went undefined nobody lost a row - they lost the agent on every row. */
      const propertyUuid = propertyUuidOf(d);
      const mgr = propertyUuid ? managerMap?.get(propertyUuid) : undefined;
      deals.push({
        app: toApplication(d, keys[i]),
        statusKey: keys[i],
        managerEmail: mgr?.email ?? null,
        managerName: mgr?.name ?? null,
      });
    }
  });

  books.deals = { at: Date.now(), checkedAt: Date.now(), data: deals };
  await saveSnapshot("deals_v3", deals);
  return deals;
}

/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */

export interface PropolyUserRef {
  email: string;
  agentKey: string | null;
}

/** One deal as the pre-tenancy dashboard sees it: app shape + who runs it. */
export interface BusinessDeal {
  app: AgentApplication;
  statusKey: string;
  managerEmail: string | null;
  managerName: string | null;
}

/**
 * Every deal in the book (active + one page of cancelled), all agents —
 * powers Kirstie's /pretenancy dashboard. null = unconfigured/unreachable.
 */
export async function getAllPropolyDeals(): Promise<BusinessDeal[] | null> {
  if (!propolyConfigured()) return null;
  const work = fetchAllDeals();
  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)
  );
  try {
    return await Promise.race([work, deadline]);
  } catch {
    return null;
  }
}

/** Find one deal by Propoly uuid (from the same cache as the lists). */
export async function findPropolyDeal(id: string): Promise<BusinessDeal | null> {
  const deals = await getAllPropolyDeals();
  return deals?.find((d) => d.app.id === id) ?? null;
}

/** Note/read authorization: does this deal belong to this portal user? */
export function dealBelongsToUser(deal: BusinessDeal, user: PropolyUserRef): boolean {
  return belongsTo(deal, user);
}

function belongsTo(deal: CachedDeal, user: PropolyUserRef): boolean {
  if (deal.managerEmail && deal.managerEmail === user.email.trim().toLowerCase()) {
    return true;
  }
  // Fallback: the property manager's name resolves to this partner's roster
  // slug (covers portal accounts registered under a different email).
  if (user.agentKey && deal.managerName) {
    return agentKeysForName(deal.managerName).includes(user.agentKey);
  }
  return false;
}

/**
 * The signed-in agent's live tenancy progression from Propoly, as
 * AgentApplication rows: nearest-to-completion first, cancelled last.
 * null = not configured / couldn't reach Propoly (caller falls back).
 */
export async function getPropolyAgentDeals(
  user: PropolyUserRef
): Promise<AgentApplication[] | null> {
  if (!propolyConfigured()) return null;

  const work = (async () => {
    const deals = await fetchAllDeals();
    if (!deals) return null;
    return deals
      .filter((d) => belongsTo(d, user))
      .sort((a, b) => {
        // Closest-to-keys first (signing → … → deal started), cancelled
        // sinks to the end, ties broken by soonest move-in.
        const oa = STATUS_INFO[a.statusKey]?.order ?? 50;
        const ob = STATUS_INFO[b.statusKey]?.order ?? 50;
        const ka = oa === 99 ? -1 : oa;
        const kb = ob === 99 ? -1 : ob;
        if (ka !== kb) return kb - ka;
        return (a.app.startDate ?? "9999").localeCompare(b.app.startDate ?? "9999");
      })
      .map((d) => d.app);
  })();

  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)
  );
  try {
    return await Promise.race([work, deadline]);
  } catch {
    return null;
  }
}

// (A getPropolyPipelineCount helper lived here. Callers now take the deals
// themselves and count `stage !== "unsuccessful"` off the array they render,
// so the pipeline figure and the list behind it can't disagree.)

/* ------------------------------------------------------------------------ */
/* Business-wide stats (admin dashboard)                                     */
/* ------------------------------------------------------------------------ */

export interface PropolyBusinessStats {
  month: string;
  pipelineTotal: number; // every deal in progression, whole business
  pipelineByStage: { key: string; label: string; count: number }[];
  moveInsThisMonth: number; // completed deals whose move-in falls in `month`
  generatedAt: string;
}

// Completed deals are the big list (500+) — cached separately and longer.
// propertyUuid lets us resolve the managing agent (via propertyManagers)
// for per-agent move-in reporting (ramp time).
interface CompletedDeal {
  date: string | null; // move_in_date
  service: string | null; // full_managed | tenant_find | rent_collect
  propertyUuid: string | null;
  /* Kept from 18 Aug 2026 so the move-ins TABLE can be live rather than a
     hand-captured snapshot. The projection was three fields because all
     anyone asked of it was a count. */
  address: string | null;
  rentPcm: number | null;
  uuid: string | null;
}

// Saved as "completes-v4". v2 lacked address/rent; v3 was written by the
// mapper that read Propoly's pre-6-Sep field names, so a stored v3 blob has a
// null date and null agent on every row — the silent-zero shape.
async function ensureCompletes(): Promise<CompletedDeal[] | null> {
  return readBook<CompletedDeal[]>("completes");
}

async function refreshCompletes(): Promise<CompletedDeal[] | null> {
  const rows = await listAll("/api/v1/deals?tenancy_status=complete", 40);
  if (!rows) return null;
  /* Same reshape as the pipeline above (see the header note) — these are
     /deals rows too, just the completed ones. Worth spelling out why this
     mattered more than the board did: `date` feeds a [start, end] window and
     `propertyUuid` feeds the agent join, and BOTH of those fail closed. A
     null date is skipped by the window test and a null uuid is skipped by
     `if (!mgr) continue`, so a shape change here does not error and does not
     blank a screen — it quietly reports every agent as having moved nobody
     in. Zero is a plausible-looking figure, which is exactly what makes it
     the dangerous kind of wrong. */
  const completes: CompletedDeal[] = rows.map((r) => {
    const terms = obj(r.terms);
    const address = str(obj(r.property).address) ?? str(r.property_address);
    return {
      date: str(terms.move_in_date) ?? str(r.move_in_date),
      // Propoly stopped sending this on 6 Sep; null until they say otherwise.
      service: str(r.tenancy_service_level),
      propertyUuid: propertyUuidOf(r),
      // Multi-line in the old shape, comma-separated in the new. Flattened
      // either way so a table cell does not have to care.
      address: address
        ? address.replace(/\s*\n\s*/g, ", ").replace(/,\s*,/g, ",").trim()
        : null,
      rentPcm: (() => {
        const pence = num(terms.price_pcm_pence) ?? num(r.price_pcm_pence);
        return pence == null ? null : Math.round(pence) / 100;
      })(),
      uuid: str(r.uuid),
    };
  });
  books.completes = { at: Date.now(), checkedAt: Date.now(), data: completes };
  await saveSnapshot("completes-v4", completes);
  return completes;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Count of completed move-ins for one agent with a move-in date in
 * [start, end] (inclusive ISO dates) — powers ramp-time reporting. Matches
 * the deal's property manager by email, then by normalised name (new
 * starters aren't in the static roster, so we compare names directly rather
 * than via a roster slug). null = Propoly unconfigured/unreachable.
 */
export async function getAgentMoveInsInWindow(
  ref: { email?: string | null; name?: string | null },
  start: string,
  end: string
): Promise<number | null> {
  if (!propolyConfigured()) return null;
  const email = ref.email?.trim().toLowerCase() || null;
  const name = ref.name ? normName(ref.name) : null;
  if (!email && !name) return 0;
  const work = (async () => {
    const [completes, managerMap] = await Promise.all([
      ensureCompletes(),
      propertyManagers(),
    ]);
    if (!completes) return null;
    let count = 0;
    for (const c of completes) {
      if (!c.date || c.date < start || c.date > end) continue;
      const mgr = c.propertyUuid ? managerMap?.get(c.propertyUuid) : undefined;
      if (!mgr) continue;
      const byEmail = email != null && mgr.email === email;
      const byName = !byEmail && name != null && mgr.name != null && normName(mgr.name) === name;
      if (byEmail || byName) count += 1;
    }
    return count;
  })();
  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)
  );
  try {
    return await Promise.race([work, deadline]);
  } catch {
    return null;
  }
}

/**
 * RLP conversion input: this month's completed move-ins split by service
 * level. RLP = fully-managed share of move-ins (Susan's "x of y EFM managed").
 */
export async function getPropolyRlpMtd(
  month: string
): Promise<{ total: number; fullyManaged: number } | null> {
  if (!propolyConfigured()) return null;
  const completes = await ensureCompletes().catch(() => null);
  if (!completes) return null;
  const inMonth = completes.filter((c) => c.date?.startsWith(month));
  /* Propoly stopped sending tenancy_service_level on 6 Sep 2026, and this
     figure is ENTIRELY a split by it. With the field gone every row fails the
     full_managed test, so the honest answer and the broken one look identical
     on screen: "0 of 13 move-ins are fully managed", labelled live.
     A share we cannot compute is not a share of zero. Return null so the tile
     shows its unavailable state, per the live-figures rule — never a plausible
     number we did not actually measure. The test is whether ANY row in the
     month carries a service level, so a real zero still reports as zero. */
  if (inMonth.length > 0 && !inMonth.some((c) => c.service)) return null;
  return {
    total: inMonth.length,
    fullyManaged: inMonth.filter((c) => c.service === "full_managed").length,
  };
}

/**
 * Completed move-ins with a move-in date inside [start, end] (ISO dates,
 * inclusive). Powers historic months and the like-for-like YoY comparison —
 * Propoly's history reaches back to 2023. null when unreachable.
 *
 * Definition note: counts deals that ran through Propoly. Susan's Move-In
 * Report also counts managed transfers + marketing-only move-ins, so her
 * months run higher (June 2026: Propoly 21 vs her 30, of which ~10 were
 * transfers/marketing-only per her own notes).
 */
export interface MoveInRow {
  id: string;
  agent: string | null;
  address: string;
  moveIn: string;
  service: string | null;
  rentPcm: number | null;
}

/**
 * Completed move-ins for ONE month, as rows rather than a count.
 *
 * The tab has shown a hand-captured table since July, and the capture was taken
 * on the 11th — so it held ten rows while Propoly's own answer for the month
 * was thirty-five. Two numbers, both labelled July, twenty-five apart.
 *
 * Agent comes from the property→manager map, because a Propoly deal carries no
 * agent of its own. A property we cannot map keeps the row and leaves the agent
 * blank: losing a real move-in to a missing manager would be a worse lie than
 * an empty cell.
 */
export async function getPropolyMoveInRows(month: string): Promise<MoveInRow[] | null> {
  if (!propolyConfigured()) return null;
  const [completes, managerMap] = await Promise.all([
    ensureCompletes(),
    propertyManagers(),
  ]);
  if (!completes) return null;
  return completes
    .filter((c: CompletedDeal) => (c.date ?? "").slice(0, 7) === month)
    .map((c: CompletedDeal) => {
      const mgr = c.propertyUuid ? managerMap?.get(c.propertyUuid) : undefined;
      return {
        id: c.uuid ?? `${c.propertyUuid ?? "?"}-${c.date ?? "?"}`,
        agent: mgr?.name ?? null,
        address: c.address ?? "—",
        moveIn: c.date ?? "",
        service: c.service,
        rentPcm: c.rentPcm,
      };
    })
    .sort((a: MoveInRow, b: MoveInRow) => a.moveIn.localeCompare(b.moveIn));
}

export async function getPropolyMoveInsInRange(
  start: string,
  end: string
): Promise<number | null> {
  if (!propolyConfigured()) return null;
  const work = (async () => {
    const completes = await ensureCompletes();
    if (!completes) return null;
    return completes.filter((c) => c.date != null && c.date >= start && c.date <= end)
      .length;
  })();
  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)
  );
  try {
    return await Promise.race([work, deadline]);
  } catch {
    return null;
  }
}

/**
 * Whole-business Propoly aggregates for Susan's dashboard: the live
 * progression pipeline broken down by stage, and completed move-ins for a
 * month. null when unconfigured/unreachable so callers keep the snapshot.
 */
export async function getPropolyBusinessStats(
  month: string
): Promise<PropolyBusinessStats | null> {
  if (!propolyConfigured()) return null;

  const work = (async (): Promise<PropolyBusinessStats | null> => {
    const deals = await fetchAllDeals();
    if (!deals) return null;

    const completes = await ensureCompletes();

    const active = deals.filter((d) => d.statusKey !== "cancelled");
    return {
      month,
      pipelineTotal: active.length,
      pipelineByStage: ACTIVE_STATUSES.map((key) => ({
        key,
        label: STATUS_INFO[key].label,
        count: active.filter((d) => d.statusKey === key).length,
      })),
      moveInsThisMonth: (completes ?? []).filter((c) =>
        c.date?.startsWith(month)
      ).length,
      generatedAt: new Date().toISOString(),
    };
  })();

  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)
  );
  try {
    return await Promise.race([work, deadline]);
  } catch {
    return null;
  }
}

/* ------------------------- move-in tracker (admin) ------------------------ */

export interface PropolyMoveInForecast {
  /** Completed move-ins, 1st of this month → today. */
  completedMtd: number;
  /** Completed move-ins, same day-window last month (for the trend arrow). */
  completedPrevMtd: number;
  /** ACTIVE deals (not complete/cancelled) by move-in month, this month +3. */
  forecastByMonth: Record<string, number>;
  /** Active deals with a move-in date already passed — slipping, need a chase. */
  forecastOverdue: number;
  /** Active deals with no move-in date set yet. */
  forecastUndated: number;
  pipelineTotal: number;
  /** Completed per calendar month, every year, keyed YYYY-MM (fuels quarter sums, incl. last year's Q4 in January). */
  completedByMonth: Record<string, number>;
  ytd: number;
  prevYtd: number; // same window last year
  generatedAt: string;
}

export async function getPropolyMoveInForecast(): Promise<PropolyMoveInForecast | null> {
  if (!propolyConfigured()) return null;

  const work = (async (): Promise<PropolyMoveInForecast | null> => {
    const [completes, deals] = await Promise.all([ensureCompletes(), fetchAllDeals()]);
    if (!completes && !deals) return null;

    /* London's date, not UTC's: between midnight and 1am BST on the 1st the
       UTC date is still last month. And last month from the year and month
       NUMBERS (Rig P-019): setUTCMonth(-1) on 31 Oct asks for 31 Sep, which
       rolls over to 1 Oct, so "same point last month" was October again and
       the trend arrow sat flat on every 29th-31st that overflowed. */
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    const year = today.slice(0, 4);
    const month = today.slice(0, 7);
    const day = today.slice(8, 10);
    const y = Number(year);
    const mo = Number(today.slice(5, 7));
    const prevMonth = mo === 1 ? `${y - 1}-12` : `${year}-${String(mo - 1).padStart(2, "0")}`;

    const completed = (completes ?? [])
      .map((c) => c.date)
      .filter((d): d is string => d != null);
    /* Every year, not just this one: in January-March the Move-ins tab's
       "last quarter" is last year's Q4, and it read 0 when only this year's
       months were kept. */
    const completedByMonth: Record<string, number> = {};
    for (const d of completed) {
      const m = d.slice(0, 7);
      completedByMonth[m] = (completedByMonth[m] ?? 0) + 1;
    }

    // Forecast: active deals by move-in month, this month → +3.
    const horizon: string[] = [];
    const cursor = new Date(`${month}-01T00:00:00Z`);
    for (let i = 0; i < 4; i++) {
      horizon.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const forecastByMonth: Record<string, number> = Object.fromEntries(
      horizon.map((m) => [m, 0])
    );
    let forecastOverdue = 0;
    let forecastUndated = 0;
    const active = (deals ?? []).filter(
      (d) => d.statusKey !== "cancelled" && d.statusKey !== "complete"
    );
    for (const d of active) {
      const mi = d.app.startDate;
      if (!mi) {
        forecastUndated += 1;
      } else if (mi < today) {
        forecastOverdue += 1;
      } else {
        const m = mi.slice(0, 7);
        if (m in forecastByMonth) forecastByMonth[m] += 1;
      }
    }

    return {
      completedMtd: completed.filter((d) => d >= `${month}-01` && d <= today).length,
      completedPrevMtd: completed.filter(
        (d) => d >= `${prevMonth}-01` && d <= `${prevMonth}-${day}`
      ).length,
      forecastByMonth,
      forecastOverdue,
      forecastUndated,
      pipelineTotal: active.length,
      completedByMonth,
      ytd: completed.filter((d) => d >= `${year}-01-01` && d <= today).length,
      prevYtd: completed.filter(
        (d) => d >= `${Number(year) - 1}-01-01` && d <= `${Number(year) - 1}${today.slice(4)}`
      ).length,
      generatedAt: new Date().toISOString(),
    };
  })();

  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), OVERALL_DEADLINE_MS)
  );
  try {
    return await Promise.race([work, deadline]);
  } catch {
    return null;
  }
}
