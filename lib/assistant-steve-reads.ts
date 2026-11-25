import "server-only";
import type { AssistantTool, ToolContext } from "@/lib/assistant-tools";
import { findUserById, type OsUser } from "@/lib/users";
import { lookFor } from "@/lib/new-look-store";
import { can } from "@/lib/roles";
import { isOwner } from "@/lib/agent-words";
import { sameAgent } from "@/lib/agent-name";
import { noDashes } from "@/lib/no-dashes";
import { hasDb, q } from "@/lib/db";
import { searchEverything } from "@/lib/search";
import { searchMatches } from "@/lib/search-match";
import { isTestId } from "@/lib/test-overlay";
import { onTheirBook } from "@/lib/assistant-book";
import { managedBookFor } from "@/lib/managed-book-cache";
import { getApplicationById } from "@/lib/applications";
import { handoffFor } from "@/lib/deal-handoff";
import { handoverMode, handoversFor, type HandoverRun, type PropertyCandidate } from "@/lib/handover";
import { dealDraftFor } from "@/lib/handover-deal";
import { switchOn } from "@/lib/switches";
import { heldForTenantChanges } from "@/lib/tenant-swaps";
import { decisionsFor } from "@/lib/offer-decisions";
import { isIntroOnly } from "@/lib/intro-only";
import { rentStatusFor } from "@/lib/rent-status";
import { portalStatsFor } from "@/lib/rex-portal-stats";
import { marketFor } from "@/lib/portal-market";
import { readSend } from "@/lib/portal-send";
import { explainBlockers } from "@/lib/portal-blockers";
import { listingRead } from "@/lib/listing-details";
import { rtrForLet, rtrLet } from "@/lib/application-rtr";
import { keysFor } from "@/lib/home-keys";
import { recordFiles, type HomeContext } from "@/lib/home-send";
import { houseByListing, housesIn, MANAGED_READERS } from "@/lib/houses";
import { sittingLets } from "@/lib/tenant-logins";
import { overridesFor } from "@/lib/home-overrides";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { getTenancyRegister, tenancyRegisterError } from "@/lib/business/payprop-tenancy";
import { homeTenancies, payPropTenantRows } from "@/lib/business/payprop-tenant-contacts";
import { findsAnyHome } from "@/lib/steve-find";
import { DEMO_CONTACT_ID } from "@/lib/passport";
import { EMPTY_PASSPORT, answered, type PassportData } from "@/lib/passport-shape";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * STEVE: MORE HE CAN LOOK UP (James, 25 Nov 2026, Steve's big update).
 *
 * Six things agents kept asking him and he could not see: why a let won't
 * push to Propoly, whether the rent is up to date, how a listing is doing on
 * the portals (and why a portal refused it), a home's tenancy, documents and
 * keys, the right to rent dates on a let, and (office only) where a tenant
 * passport has got to by email.
 *
 * Every one READS ONLY, through the reader its screen already uses, so what
 * he says and what the screen shows cannot disagree. Nothing here writes to
 * the home's file, PayProp or Propoly, sends anything or moves money. Scoped
 * as the screens are: an agent their own book, the office the business.
 *
 * Behind the "stevereads" switch (lib/new-look), per person. Off, each says
 * it isn't switched on yet. The schemas are static: they sit in the cached
 * prompt, so nothing here varies by person.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }) : null;
const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : null;
const money = (n: number | null | undefined) => (n == null ? null : `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);

/** Words from elsewhere (a step's detail, a portal's refusal), made fit to repeat to an agent. */
function say(me: OsUser, s: string | null | undefined): string {
  const t = noDashes(String(s ?? "").trim());
  return isOwner(me) ? t : t.replace(/\bREX's\b/gi, "the home file's").replace(/\b(in|on|from) REX\b/gi, "$1 the home's file").replace(/\bREX\b/g, "the home's file");
}

/* ── the gate ─────────────────────────────────────────────────────────── */

type Gate = { me: OsUser } | { error: string };

/** Who is asking, and is the switch on for them. */
async function gate(ctx: ToolContext): Promise<Gate> {
  if (!ctx.me?.id) return { error: "I can't tell who you are, so I can't look that up." };
  const me = await findUserById(ctx.me.id).catch(() => null);
  if (!me) return { error: "I can't tell who you are, so I can't look that up." };
  if (!(await lookFor(me).catch(() => null))?.stevereads) return { error: "That isn't switched on for you yet." };
  return { me };
}

/** The office reads any let (the handoff route's rule); never while wearing somebody else's view. */
const officeForLets = (me: OsUser, ctx: ToolContext) => ctx.scope.everything || (!ctx.viewingAs && can(me.role, "staff:internal"));

/* ── which let ────────────────────────────────────────────────────────── */

function letIdOf(href: string): string | null {
  const m = /[?&](?:open|deal)=([^&]+)/.exec(href);
  return m && /^\/(applications|pre-tenancy)\b/.test(href) ? decodeURIComponent(m[1]) : null;
}

/** The let they mean: given, open on their screen, or found by words among the lets they can see. */
async function whichLet(input: Record<string, unknown>, ctx: ToolContext, wholeBusiness: boolean): Promise<{ id: string } | { candidates: { letId: string; what: string }[]; note: string } | { error: string }> {
  const given = str(input.letId);
  if (given) return { id: given };
  const find = str(input.find);
  const onScreen = /^\/applications\/([^/?#]+)/.exec(ctx.path ?? "") ?? /[?&](?:open|deal)=([^&]+)/.exec(/^\/(applications|pre-tenancy)\b/.test(ctx.path ?? "") ? ctx.path ?? "" : "");
  if (!find && onScreen) return { id: decodeURIComponent(onScreen[1]) };
  if (!find) return { error: "Which let? Give me the address or the tenant's name." };
  if (!wholeBusiness && (ctx.scope.unlinked || !ctx.scope.rexUserId)) return { error: "I can't tell which lets are yours, so I can't look one up. Ask James to link your account." };
  const hits = await searchEverything(find, wholeBusiness ? null : ctx.scope.rexUserId).catch(() => null);
  if (!hits) return { error: "The lets couldn't be searched just now. Try again in a minute." };
  const lets = new Map<string, string>();
  for (const h of hits) {
    if (h.kind !== "application" && h.kind !== "deal") continue;
    const id = letIdOf(h.href);
    if (id && !lets.has(id)) lets.set(id, `${h.title} - ${h.sub}`);
  }
  if (!lets.size) return { error: `I couldn't find a let matching "${find}". Try the tenant's full name, or the address as it is on the let.` };
  if (lets.size > 1) return { candidates: [...lets].slice(0, 6).map(([letId, what]) => ({ letId, what })), note: "More than one let matched. Ask which one they mean, then call again with its letId." };
  return { id: [...lets.keys()][0] };
}

const letInput = {
  type: "object" as const,
  properties: {
    letId: { type: "string", description: "The let's id, if you have it (the id in /applications/<id>)." },
    find: { type: "string", description: "Words to find the let by: the address or a tenant's name." },
  },
  required: [] as string[],
};

/* ── which managed home ───────────────────────────────────────────────── */

async function whichHome(input: Record<string, unknown>, ctx: ToolContext): Promise<{ home: ManagedProperty; book: ManagedProperty[]; stale: boolean } | { candidates: { listingId: string; address: string }[]; note: string } | { error: string }> {
  if (ctx.scope.unlinked) return { error: "I can't tell whose book is yours, so I can't open a home. Ask James to link your account." };
  const managed = await managedBookFor(ctx.scope.rexUserId).catch(() => null);
  if (!managed) return { error: "The book of homes couldn't be read just now. Try again in a minute." };
  const book = managed.book.properties;
  const onScreen = /^\/portfolio\/([^/?#]+)/.exec(ctx.path ?? "");
  const id = str(input.listingId) || (str(input.find) ? "" : (onScreen ? decodeURIComponent(onScreen[1]) : ctx.openListingId ?? ""));
  if (id) {
    const home = book.find((p) => String(p.listingId) === id);
    if (!home) return { error: ctx.scope.everything ? "That isn't one of the homes we look after, so there's no rent or tenancy record for it." : "That home isn't in your book, so I can't read it for you." };
    return { home, book, stale: managed.stale };
  }
  const find = str(input.find);
  if (!find) return { error: "Which home? Give me the address, or a listingId from find_property." };
  const hits = book.filter((p) => !p.test && searchMatches(find, p.name, p.locality, p.address));
  if (!hits.length) return { error: `None of ${ctx.scope.everything ? "the homes we look after" : "your homes"} matches "${find}".` };
  if (hits.length > 1) return { candidates: hits.slice(0, 6).map((p) => ({ listingId: String(p.listingId), address: `${p.name}, ${p.locality}` })), note: "More than one home matched. Ask which they mean, then call again with its listingId." };
  return { home: hits[0], book, stale: managed.stale };
}

const homeInput = {
  type: "object" as const,
  properties: {
    listingId: { type: "string", description: "The home's listingId from find_property (a managed home), or the one open on their screen." },
    find: { type: "string", description: "Or the address, to find it among the homes we look after." },
  },
  required: [] as string[],
};

/* ==========================================================================
   1. Why won't this let push to Propoly?
   ========================================================================== */

const letPushCheck: AssistantTool = {
  name: "let_push_check",
  description:
    "Why a let won't push to Propoly, or what is still needed before it can. Call it for 'why won't it push', 'why is Push to Propoly greyed out', 'what's missing before I can push', 'the push failed, why'. Give the let (letId, or `find` with the address or a tenant's name; the let open on their screen is used if neither). Returns what is missing (certificates, documents), what blocks it, the deal terms the button waits on (rent, move-in, term, service, deposit scheme, every tenant with an email), the last push's failed step and why, and whether Propoly offered possible matches for the home. Read only: it never pushes.",
  input_schema: letInput,
  label: () => "Checking why the let won't push…",
  async run(input, ctx) {
    const g = await gate(ctx);
    if ("error" in g) return g;
    const { me } = g;
    const office = officeForLets(me, ctx);
    const which = await whichLet(input, ctx, office);
    if (!("id" in which)) return which;
    const id = which.id;
    if (isTestId(id)) return { letId: id, test: true, note: "This is a test let. Its push is played inside the OS and nothing is checked against Propoly, so there is nothing to diagnose." };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return { letId: id, note: "This let is already a deal in Propoly (it was found on the deals board), so there is nothing left to push. Its progress is on the pre-tenancy board." };

    const app = await getApplicationById(id).catch(() => undefined);
    if (app === undefined) return { error: "The let couldn't be read just now, so I can't say why it won't push. Try again in a minute." };
    if (!app) return { error: `There's no let ${id}.` };
    if (!office && app.agent && !sameAgent(app.agent, me.name)) return { error: `That let is ${app.agent.split(/\s+/)[0]}'s, so I can't read it for you.` };

    const handoff = await handoffFor(id).catch(() => undefined);
    if (handoff === undefined) return { error: "The let's push details couldn't be read just now. Try again in a minute." };
    if (!handoff) return { error: `There's no let ${id}.` };

    const [switchMode, runs, dealOn, held, introOnly, decisions] = await Promise.all([
      handoverMode().catch(() => "shadow" as const),
      handoversFor(id, 5).catch(() => [] as HandoverRun[]),
      switchOn("handover_deal").catch(() => false),
      heldForTenantChanges(app).catch(() => false),
      isIntroOnly(app.listingId).catch(() => false),
      decisionsFor([`rex:${app.id}`]).catch(() => new Map()),
    ]);
    const mode = held ? "shadow" : switchMode;
    const accepted = app.status === "accepted" || decisions.get(`rex:${app.id}`)?.decision === "accepted";

    /* The deal terms the Next Step card greys the button on (components/NextStepCard). */
    const draft = mode === "live" && dealOn ? await dealDraftFor(handoff).catch(() => null) : null;
    const t = draft?.terms ?? null;
    const dealChecks = [
      ...(t && !t.rentPcm ? ["Add the agreed rent."] : []),
      ...(t && !t.moveIn ? ["Add the move-in date."] : []),
      ...(t && !t.termMonths ? ["Add the term."] : []),
      ...(t && !t.serviceLevel ? ["Pick the service."] : []),
      ...(t && !t.depositScheme ? ["Pick the deposit scheme."] : []),
      ...handoff.tenants.filter((x) => !x.email).map((x) => `${x.name} has no email, and Propoly needs one.`),
    ];

    /* The newest run: did it go, and if not, which step and why. */
    const last = runs[0] ?? null;
    const failed = last?.steps.find((s) => s.state === "failed" || s.state === "blocked") ?? null;
    const dealStarted = runs.some((r) => r.mode === "live" && r.steps.some((s) => s.id === "deal" && s.state === "ok"));
    const match = last?.steps.find((s) => s.id === "property-match") ?? null;
    const candidates = ((match?.response as { candidates?: PropertyCandidate[] } | undefined)?.candidates ?? []).slice(0, 8);

    const stops: string[] = [
      ...(introOnly ? ["This is marketing only, so nothing goes to Propoly - the landlord takes it from here."] : []),
      ...(!accepted ? ["The offer hasn't been accepted yet. Only an accepted offer goes to Propoly."] : []),
      ...handoff.blockers.map((b) => say(me, b)),
      ...(dealStarted ? [] : dealChecks),
    ];

    return {
      letId: id,
      address: `${handoff.property}${handoff.locality ? `, ${handoff.locality}` : ""}`,
      agent: handoff.agent ?? "not recorded",
      readyToPush: stops.length === 0,
      stops: stops.length ? stops : "Nothing stops it. The button should be live.",
      missingCertificates: handoff.missing.map((m) => `${m.label}: ${say(me, m.why)}`),
      unrecognisedDocuments: handoff.unrecognised,
      tenants: handoff.tenants.map((x) => ({ name: x.name, hasEmail: Boolean(x.email), hasMobile: Boolean(x.phone), referenced: x.reference !== false })),
      landlord: handoff.landlord ? { name: handoff.landlord.name, hasEmail: Boolean(handoff.landlord.email), hasMobile: Boolean(handoff.landlord.phone) } : "No landlord found on the let.",
      dealTerms: t
        ? { rent: money(t.rentPcm) ?? "missing", moveIn: day(t.moveIn) ?? "missing", termMonths: t.termMonths ?? "missing", service: t.serviceLevel ?? "missing", depositScheme: t.depositScheme ?? "missing", holdingFee: money(t.holdingFeePounds) ?? "none", scotland: t.scotland }
        : dealStarted
          ? "A deal was already started by an earlier push; pushing again finishes the rest."
          : mode === "live" && dealOn
            ? "The deal terms couldn't be read from the home's file just now."
            : "The push isn't starting deals yet, so there are no deal terms to check.",
      pushMode: mode === "live" ? "live: pressing Push to Propoly does the work" : held ? "rehearsal: a tenant add, re-reference or swap is held until tenant changes go live, so nothing is written" : "rehearsal: the push is switched to practice runs, so nothing is written",
      lastPush: last
        ? {
            when: stamp(last.startedAt),
            by: last.triggeredBy,
            result: last.status,
            ...(failed ? { failedStep: failed.label, why: say(me, failed.detail) } : {}),
            ...(last.error ? { error: say(me, last.error) } : {}),
          }
        : "It has never been pushed.",
      propolyMatch: match
        ? match.state === "ok"
          ? `Matched: ${say(me, match.detail)}`
          : candidates.length
            ? { note: "Propoly wasn't sure this home is already there and offered close matches. The agent picks one on the let, or says it's new.", possibleMatches: candidates.map((c) => `${c.address}${c.postcode ? `, ${c.postcode}` : ""}`) }
            : say(me, match.detail)
        : "Not checked yet - it is checked when the push runs.",
    };
  },
};

/* ==========================================================================
   2. Is the rent up to date?
   ========================================================================== */

const rentStatus: AssistantTool = {
  name: "rent_status",
  description:
    "Is the rent paid, up to date or in arrears on a home we look after? What is owed, by whom, when each tenant last paid, and the last few months of rent in and paid out to the landlord. Call it for 'is the rent paid', 'are they behind', 'how much do they owe', 'when did they last pay'. Give the home (listingId from find_property, or `find` with the address; the home open on their screen is used if neither). From PayProp, checked at 10am and 4pm each day: always say when it was last checked. Read only.",
  input_schema: homeInput,
  label: () => "Checking the rent…",
  async run(input, ctx) {
    const g = await gate(ctx);
    if ("error" in g) return g;
    const w = await whichHome(input, ctx);
    if (!("home" in w)) return w;
    const { home } = w;
    const s = await rentStatusFor({ name: home.name, address: home.address, postcode: home.postcode }).catch(() => null);
    if (!s) return { error: "PayProp couldn't be read just now, so I can't say whether the rent is up to date." };
    const address = `${home.name}, ${home.locality}`;
    if (s.state === "unreachable") return { error: s.detail, address };
    if (s.state === "unmatched") return { address, matched: false, note: s.detail };
    return {
      address,
      checked: `${stamp(s.checkedAt)} (PayProp is read at 10am and 4pm)`,
      upToDate: s.upToDate,
      owed: s.owed >= 1 ? money(s.owed) : "nothing",
      tenants: s.tenants.map((x) => ({ name: x.name, owes: x.owed >= 1 ? money(x.owed) : "nothing", lastPaid: day(x.lastPayment) ?? "no payment recorded", rentLastDue: day(x.dueOn) ?? "not known", rent: x.rent != null ? `${money(x.rent)} pcm` : "no rent invoice" })),
      lastMonths: s.history.map((h) => ({ month: h.month, rentIn: h.in ? day(h.in) : "nothing recorded", toLandlord: h.amountToLandlord == null ? "not read" : money(h.amountToLandlord), paidOut: h.paidOut == null ? "not known" : h.paidOut })),
    };
  },
};

/* ==========================================================================
   3. How is the advert doing on the portals, and why was it refused?
   ========================================================================== */

const listingPortalStats: AssistantTool = {
  name: "listing_portal_stats",
  description:
    "How a listing is doing on Rightmove, Zoopla and OnTheMarket: how often it appeared in search results, how often people clicked into it, the click rate, how it ranks against our other live homes per day, and whether the last send to the portals went, or a portal refused it and why (with what stops it going, in plain words). Call it for 'how many views', 'is my advert working', 'why isn't it on Rightmove', 'why did the portals refuse it', 'did the put-back work'. Needs a listingId from find_property. Read only.",
  input_schema: {
    type: "object",
    properties: { listingId: { type: "string", description: "The listingId from find_property, or the listing open on their screen." } },
    required: ["listingId"],
  },
  label: () => "Reading the portal figures…",
  async run(input, ctx) {
    const g = await gate(ctx);
    if ("error" in g) return g;
    const { me } = g;
    if (ctx.scope.unlinked) return { error: "I can't tell whose book is yours, so I can't read a listing. Ask James to link your account." };
    const id = str(input.listingId) || ctx.openListingId || "";
    if (!id) return { error: "I need a listingId - use find_property first." };
    if (isTestId(id)) return { listingId: id, test: true, note: "This is a test listing. It never goes to the portals, so there are no figures." };
    if (!/^\d+$/.test(id)) return { error: "That isn't a listing id I can read portal figures for." };
    const { listing, home, address } = await onTheirBook(ctx.scope.rexUserId, id);
    if (!listing && !home && !ctx.scope.everything) return { error: "That listing isn't on your book, so I can't read its portal figures." };

    const [stats, market, send, issues, upload] = await Promise.all([
      portalStatsFor(id).catch(() => null),
      marketFor(id).catch(() => null),
      readSend(Number(id), 0).catch(() => null),
      listingRead(id, "ListingPublication", "getPublicationIssues", { listing_id: Number(id) }).catch(() => null),
      listingRead(id, "ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: Number(id) }).catch(() => null),
    ]);
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String) : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).flatMap((x) => (Array.isArray(x) ? x.map(String) : [String(x)])) : [];
    const checksRead = Boolean(issues?.ok || upload?.ok);
    const blocks = explainBlockers([
      ...(issues?.ok ? list((issues.result as { errors?: unknown } | null)?.errors) : []),
      ...(upload?.ok ? list(upload.result) : []),
    ]);

    return {
      listingId: id,
      address: address ?? `listing ${id}`,
      figures: !stats
        ? "The portal figures couldn't be read just now."
        : stats.empty
          ? "No portal figures recorded for this listing yet. A new advert usually shows figures a day or two after it goes up."
          : {
              note: "Appearances = shown in a search result. Clicks = somebody opened the advert. Whole campaign to date.",
              total: { appearances: stats.totals.summary ?? "none", clicks: stats.totals.detail ?? "none", clickRate: stats.totals.ctr != null ? `${stats.totals.ctr}%` : "not known" },
              byPortal: stats.portals.map((p) => ({ portal: p.portal, appearances: p.summary.total ?? "none", clicks: p.detail.total ?? "none", clickRate: p.ctr != null ? `${p.ctr}%` : "not known", lastUpdated: day(p.lastUpdated) ?? "not known", ...(p.isStale ? { warning: `No new figures for ${p.staleDays} days - the feed may have stopped.` } : {}) })),
            },
      comparedWithOurOtherHomes: market?.me
        ? {
            asOf: day(market.asOf),
            rank: market.rank ? `${market.rank} of ${market.homes} live homes for clicks a day` : "not ranked",
            thisOne: { clicksPerDay: market.me.viewsPerDay, appearancesPerDay: market.me.appearancesPerDay ?? "not known", clickRate: market.me.ctr != null ? `${market.me.ctr}%` : "not known", daysLive: market.me.daysLive },
            average: { clicksPerDay: market.average.viewsPerDay, clickRate: market.average.ctr != null ? `${market.average.ctr}%` : "not known" },
            ...(market.similarRent ? { similarRent: { homes: market.similarRent.homes, clicksPerDay: market.similarRent.viewsPerDay, clickRate: market.similarRent.ctr != null ? `${market.similarRent.ctr}%` : "not known" } } : {}),
          }
        : "Not in the daily comparison (it isn't live, or hasn't a day's figures yet).",
      lastSendToPortals: !send
        ? "The last send couldn't be read just now."
        : send.state === "none"
          ? "No send to the portals on record."
          : {
              state: send.state === "live" ? "went: every portal took it" : send.state === "failed" ? "a portal refused it" : send.state === "withdrawn" ? "the last send told the portals to take it down" : "still sending",
              when: send.doneAt ? stamp(new Date(send.doneAt).toISOString()) : send.jobAt ? stamp(new Date(send.jobAt).toISOString()) : "not known",
              reached: send.portals,
              refused: send.refused.map((r) => ({ portal: r.portal, why: say(me, explainBlockers([r.why])[0]?.says ?? r.why) })),
            },
      whatStopsItGoing: !checksRead
        ? "The portals' checks couldn't be read just now."
        : blocks.length
          ? blocks.map((b) => (b.key === "hidden" || b.key.startsWith("raw:") ? say(me, b.says) : b.says))
          : "Nothing - the portals' own checks all pass.",
    };
  },
};

/* ==========================================================================
   4. A home's record: tenancy, who lives there, rent source, documents, keys.
   ========================================================================== */

const DAY_MS = 86_400_000;

/** The tenancy dates the home's page shows (app/api/portfolio/tenancy, the same reads in the same order). */
async function tenancyOf(home: ManagedProperty): Promise<{ start: string | null; end: string | null; endKnown: boolean; startSetBy: string | null; endSetBy: string | null; depositRef: string | null; rentProtection: string | null } | { error: string }> {
  const set = await overridesFor(home).catch(() => ({}) as Awaited<ReturnType<typeof overridesFor>>);
  const startSet = set.tenancyStart && typeof set.tenancyStart.value === "string" ? set.tenancyStart : null;
  const endSet = set.tenancyEnd && typeof set.tenancyEnd.value === "string" ? set.tenancyEnd : null;
  const register = await getTenancyRegister().catch(() => null);
  if (!register && !startSet && !endSet) return { error: tenancyRegisterError() ? "The tenancy dates couldn't be read from PayProp just now." : "PayProp holds no tenancy dates for this home yet." };
  const key = propertyKey(home.name);
  const t = key && register ? register.tenancyByKey[key] ?? null : null;
  const rlp = key && register ? register.rlpByKey[key] ?? null : null;
  const letSince = home.overridden?.tenancyStart ? null : home.letSince;
  const off = t?.startDate && letSince ? Math.abs(new Date(t.startDate).getTime() - new Date(letSince).getTime()) / DAY_MS > 120 : false;
  const shown = home.tenants.map((x) => x.name);
  const fromBook = home.tenantsFromPayProp?.replaced && home.tenantsFromPayProp.startDate ? home.tenantsFromPayProp : null;
  const own = fromBook
    ? { startDate: fromBook.startDate, endDate: fromBook.endDate, depositId: fromBook.depositId }
    : shown.length ? homeTenancies(await payPropTenantRows().catch(() => []), home, shown).theirs : null;
  const paid = own ?? (t && !off ? t : null);
  return {
    start: startSet ? String(startSet.value) : paid?.startDate ?? null,
    end: endSet ? (endSet.value === "rolling" ? null : String(endSet.value)) : paid?.endDate ?? null,
    endKnown: Boolean(endSet || paid),
    startSetBy: startSet ? startSet.by : null,
    endSetBy: endSet ? endSet.by : null,
    depositRef: paid?.depositId ?? null,
    rentProtection: rlp && !off ? String(rlp.status) : null,
  };
}

const homeRecord: AssistantTool = {
  name: "home_record",
  description:
    "The record for a home we look after, as its Portfolio page has it: who lives there, when the tenancy started and ends (or that it rolls on), the rent and where that figure comes from, the papers on its Documents tab, and its key numbers and where they are kept. Call it for 'who lives at', 'when does the tenancy end', 'when did they move in', 'where does the rent figure come from', 'is the tenancy agreement on file', 'what's the key number for'. Give the home (listingId from find_property, or `find` with the address; the home open on their screen is used if neither). Read only.",
  input_schema: homeInput,
  label: () => "Reading the home's record…",
  async run(input, ctx) {
    const g = await gate(ctx);
    if ("error" in g) return g;
    const { me } = g;
    const w = await whichHome(input, ctx);
    if (!("home" in w)) return w;
    const { home, book, stale } = w;

    /* The Documents tab's context, as homeContext builds it for the page. */
    const house = houseByListing(housesIn(book, MANAGED_READERS), MANAGED_READERS).get(String(home.listingId)) ?? null;
    const all = house ? [...(house.house ? [house.house] : []), ...house.rooms] : [home];
    const hc: HomeContext = { me, office: !ctx.viewingAs && can(me.role, "see:everything"), viewingAs: Boolean(ctx.viewingAs), home, lets: sittingLets([home]), all, title: house && all.length > 1 ? house.name : home.name };

    const [tenancy, files, keys] = await Promise.all([
      tenancyOf(home).catch(() => ({ error: "The tenancy dates couldn't be read just now." })),
      hasDb() ? recordFiles(hc).catch(() => null) : Promise.resolve(null),
      home.propertyId ? keysFor(home.propertyId).catch(() => null) : Promise.resolve({ keys: [], rexFailed: false }),
    ]);

    const rent = home.rent
      ? `${money(home.rent)} ${home.rentPeriod === "week" ? "pw" : "pcm"}`
      : home.rentUnread
        ? "not known - PayProp couldn't be read at the last check"
        : "none billed today";
    const rentFrom =
      home.rentSource === "payprop"
        ? `PayProp's rent invoice, billed today. It wins over the agreed rent on the home's file${home.rentRex != null && home.rentRex !== home.rent ? ` (which says ${money(home.rentRex)})` : ""}.`
        : home.rentUnread
          ? "PayProp couldn't be read, so this is the agreed rent on the home's file."
          : "The agreed rent on the home's file - PayProp bills no different rent for it today.";

    return {
      listingId: String(home.listingId),
      address: `${home.name}, ${home.locality}`,
      agent: home.agent?.name ?? "not recorded",
      service: home.service ?? "not recorded",
      ...(stale ? { warning: "The book of homes is more than an hour old." } : {}),
      livesThere: home.vacantSince
        ? `Nobody - the tenancy ended on ${day(home.vacantSince)} and none on the home is current.`
        : home.tenants.length
          ? home.tenants.map((x) => x.name)
          : "No tenants recorded on the home.",
      ...(home.tenantsFromPayProp && (home.tenantsFromPayProp.added.length || home.tenantsFromPayProp.dropped.length)
        ? { tenantsNote: "Who lives there follows PayProp's running tenancy, over the let's own names." }
        : {}),
      ...(home.notice ? { notice: `${home.notice.tenant} has given notice${home.notice.leavingOn ? `, leaving on ${day(home.notice.leavingOn)}` : ""}.` } : {}),
      tenancy:
        "error" in tenancy
          ? tenancy.error
          : {
              started: day(tenancy.start) ?? "not known",
              ends: tenancy.end ? day(tenancy.end) : tenancy.endKnown ? "no end date - it rolls on" : "not known",
              ...(tenancy.startSetBy ? { startPutRightBy: tenancy.startSetBy } : {}),
              ...(tenancy.endSetBy ? { endPutRightBy: tenancy.endSetBy } : {}),
              ...(tenancy.depositRef ? { depositReference: tenancy.depositRef } : {}),
              ...(tenancy.rentProtection ? { rentAndLegalProtection: tenancy.rentProtection } : {}),
            },
      rent,
      rentComesFrom: rentFrom,
      ...(home.rentStarts ? { nextRent: `${money(home.rentStarts.monthly)} pcm from ${day(home.rentStarts.from)}` } : {}),
      documents:
        files === null
          ? "The Documents tab couldn't be read just now."
          : files.length
            ? files.slice(0, 40).map((f) => ({ what: f.label, file: f.name, added: day(f.at) ?? "not known", ...(f.where ? { room: f.where } : {}) }))
            : hc.office
              ? "No papers on the Documents tab yet."
              : "No tenancy papers on the Documents tab that agents can open.",
      keys: !keys
        ? "The keys couldn't be read just now."
        : {
            ...(keys.rexFailed ? { warning: "The key register on the home's file couldn't be read, so only keys recorded in the OS are listed." } : {}),
            list: keys.keys.length
              ? keys.keys.map((k) => ({ number: k.label, ...(k.description ? { what: k.description } : {}), keptAt: k.location ?? "not recorded", ...(k.heldBy ? { outWith: k.heldBy } : {}), ...(k.source === "os" ? { recordedInOsBy: k.by ?? "" } : {}) }))
              : "No keys recorded for this home.",
          },
    };
  },
};

/* ==========================================================================
   5. The right to rent dates on a let.
   ========================================================================== */

const rtrOnLet: AssistantTool = {
  name: "rtr_on_let",
  description:
    "Each tenant on a let with their recorded right to rent: the date it runs out, 'no time limit', or nothing recorded yet, plus when the follow-up check is due and whether it was checked. Call it for 'when does their right to rent expire', 'have we got right to rent dates for', 'is right to rent done on'. Give the let (letId, or `find` with the address or a tenant's name; the let open on their screen is used if neither). Read only - to record a date use propose_rtr_expiry.",
  input_schema: letInput,
  label: () => "Reading the right to rent dates…",
  async run(input, ctx) {
    const g = await gate(ctx);
    if ("error" in g) return g;
    const { me } = g;
    const wholeBusiness = ctx.scope.everything || (!ctx.viewingAs && can(me.role, "see:pretenancy"));
    const which = await whichLet(input, ctx, wholeBusiness);
    if (!("id" in which)) return which;
    /* The let's own rule decides who may open it (lib/let-people). */
    const got = await rtrLet(which.id, me).catch(() => null);
    if (!got) return { error: "The let couldn't be read just now. Try again in a minute." };
    if (!got.ok) return { error: got.error };
    const l = got.let;
    const address = `${l.property}${l.locality ? `, ${l.locality}` : ""}`;
    if (got.scottish) return { letId: which.id, address, scottish: true, note: "This is a Scottish let. Right to rent doesn't apply in Scotland, so there are no dates to hold." };
    if (!hasDb()) return { error: "There's no database on this environment, so the dates can't be read." };
    const records = await rtrForLet(l).catch(() => null);
    if (!records) return { error: "The right to rent dates couldn't be read just now." };
    const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
    return {
      letId: which.id,
      address,
      tenants: l.tenants.map((t) => {
        const r = records.find((x) => same(x.tenant, t.name) || (t.email && x.tenantEmail && same(x.tenantEmail, t.email))) ?? null;
        if (!r) return { name: t.name, rightToRent: "none recorded" };
        return {
          name: t.name,
          rightToRent: r.noTimeLimit ? "no time limit" : r.rightUntil ? `until ${day(r.rightUntil)}` : "none recorded",
          ...(r.followUpOn ? { followUpCheckDue: day(r.followUpOn) } : {}),
          recordedBy: r.by,
          recordedOn: day(r.at),
          checked: r.verifiedAt ? `checked by ${r.verifiedBy ?? "the office"} on ${day(r.verifiedAt)}` : "not checked yet",
        };
      }),
    };
  },
};

/* ==========================================================================
   6. A tenant passport, by email. Office only.
   ========================================================================== */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const findPassport: AssistantTool = {
  name: "find_passport",
  description:
    "Find a tenant passport by the tenant's email: whether it was sent, started or completed and when, who sent it, whether it was for a Scottish home, the home they enquired about and whether a lead exists for them. Never the passport's answers. Call it for 'has X done their passport', 'did the passport go to', 'where is the passport for'. Office only (the admin team, pre-tenancy, compliance); for anyone else it refuses. Needs the email address.",
  input_schema: {
    type: "object",
    properties: { email: { type: "string", description: "The tenant's email address, exactly." } },
    required: ["email"],
  },
  label: () => "Looking for the passport…",
  async run(input, ctx) {
    const g = await gate(ctx);
    if ("error" in g) return g;
    const { me } = g;
    if (ctx.viewingAs || !(await findsAnyHome(me).catch(() => false))) return { error: "Passports by email are for the office only, so I can't look that up for you." };
    const email = str(input.email).toLowerCase();
    if (!EMAIL.test(email)) return { error: "Give me the tenant's full email address." };
    if (!hasDb()) return { error: "There's no database on this environment, so passports can't be read." };

    const rows = await q<{
      name: string; data: Partial<PassportData> | null; agent: string | null; created_at: Date; updated_at: Date;
      invited_at: Date | null; invited_by: string | null; submitted_at: Date | null; opened_at: Date | null; last_opened_at: Date | null; opens: number; scottish_home: boolean;
    }>(
      `SELECT p.name, CASE WHEN p.submitted_at IS NULL THEN p.data END AS data, u.name AS agent,
              p.created_at, p.updated_at, p.invited_at, p.invited_by, p.submitted_at, p.opened_at, p.last_opened_at, p.opens, p.scottish_home
         FROM os_tenant_passports p LEFT JOIN os_users u ON u.id = p.agent_id
        WHERE lower(trim(p.email)) = $1 AND COALESCE(p.contact_id, '') <> $2
        ORDER BY p.created_at DESC LIMIT 5`,
      [email, DEMO_CONTACT_ID]
    ).catch(() => null);
    const leads = await q<{ id: string; name: string | null; address: string | null; listing_id: string | null; agent: string | null; stage: string | null; at: Date | null }>(
      `SELECT id, name, address, listing_id, agent, stage, COALESCE(received_at, first_seen) AS at
         FROM os_leads WHERE lower(trim(email)) = $1 AND id NOT IN (SELECT id FROM os_hidden_leads)
        ORDER BY COALESCE(received_at, first_seen) DESC LIMIT 5`,
      [email]
    ).catch(() => null);
    if (!rows || !leads) return { error: "The passports couldn't be read just now." };

    const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
    const stateOf = (r: (typeof rows)[number]) => {
      if (r.submitted_at) return "completed";
      const d = { ...EMPTY_PASSPORT, ...(r.data ?? {}) } as PassportData;
      const seeded = answered({ ...EMPTY_PASSPORT, legalName: d.legalName, email: d.email }).done;
      if (answered(d).done > seeded) return "started";
      return r.invited_at ? "sent, nothing filled in yet" : "made but never sent";
    };
    return {
      email,
      passports: rows.length
        ? rows.map((r) => ({
            name: r.name || "no name given",
            status: stateOf(r),
            agent: r.agent ?? "not recorded",
            made: day(iso(r.created_at)),
            sent: r.invited_at ? `${day(iso(r.invited_at))}${r.invited_by ? ` by ${r.invited_by}` : ""}` : "never",
            opened: r.opened_at ? `${r.opens} time${r.opens === 1 ? "" : "s"}, last ${day(iso(r.last_opened_at ?? r.opened_at))}` : "never",
            lastChanged: day(iso(r.updated_at)),
            completed: r.submitted_at ? day(iso(r.submitted_at)) : "not yet",
            ...(r.scottish_home ? { scottishHome: true } : {}),
          }))
        : "No passport for that email.",
      lead: leads.length
        ? leads.map((l) => ({ leadId: l.id, name: l.name ?? "no name", home: l.address || "no home named", ...(l.listing_id ? { listingId: l.listing_id } : {}), agent: l.agent ?? "not recorded", stage: l.stage ?? "not recorded", received: day(iso(l.at)) }))
        : "No lead with that email.",
      note: "Status and dates only. The passport's answers are on the lead's Passport tab, not here.",
    };
  },
};

export const READ_TOOLS: AssistantTool[] = [letPushCheck, rentStatus, listingPortalStats, homeRecord, rtrOnLet, findPassport];
