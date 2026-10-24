import { NextRequest, NextResponse } from "next/server";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId, publishTestListing } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { invalidateListingBook } from "@/lib/listings-cache";
import { forgetListing, listingRead, readListingDetails } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { stillOnPortalFeeds } from "@/lib/advert-offline";
import { publishGaps, TERMS_UNCHECKED } from "@/lib/listing-publish-check";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked, type RexResponse } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { forAgent, isOwner } from "@/lib/agent-words";
import { ensureRexLink, findUserByEmail, findUserByRexId, type OsUser } from "@/lib/users";

/** What an agent can do about missing terms, said the same way wherever it is found missing. */
const TERMS_SENTENCE =
  "The landlord's signed terms of business have to be on file before it can go live - send them from the Documents tab, or ask the office to add the signed copy.";
const TERMS_UNCHECKED_SENTENCE =
  "The listings system did not say in time whether the landlord's signed terms of business are on file, so it has not gone live. Try again in a minute.";

/**
 * Putting a listing on Rightmove, OnTheMarket and Zoopla, and taking it off.
 *
 *   GET  ?id=843312                      → where it is now, live from REX
 *   POST { id, action: "publish" }       → a draft goes live
 *   POST { id, action: "off" }           → off the portals, still published
 *   POST { id, action: "on" }            → back on the portals
 *   POST { id, action: "quiet" }         → a draft goes live WITHOUT the portals
 *
 * Live without Portals (James, 24 Oct 2026, Sean's 68 Main Street): "push a
 * property live without portals ... that would allow it to go to the next
 * stage. It technically shows live, but it'll be off portals." Published in
 * REX on the "general" channel only, the same place "off" leaves a listing,
 * so it moves on to viewings and offers and Put back on the market takes it
 * the rest of the way later. The channels go to "general" BEFORE the publish,
 * so no feed is ever sent it. The terms are still needed (REX refuses a
 * publish without them); the portals' own minimums are not.
 *
 * Built 15 Sep 2026 for the first real one, Rhiannon's relet at 4 Williams
 * Court. Until then "Push to the portals" was a ceremony with nothing behind it.
 *
 * ── What REX gives us, read off ListingPublication/describe ──────────────
 *
 *   publish(listing_id)                         draft → published
 *   setActivePublicationChannels(listing_id, channels)
 *       channels from "portals", "automatch", "external", "general"
 *       ('general' is reports, brochures, manual match and newsletters)
 *
 * There is NO way back to draft. So "off" drops every outward channel and
 * keeps "general", which leaves the listing published inside REX but on no
 * portal, no website feed and no applicant match. "on" puts all four back.
 * Withdrawing (Listings/changeState) is for a property that has gone, not a
 * pause, and is deliberately not offered here.
 *
 * ── The channel is a flag; the portals have to be TOLD (22 Oct 2026) ─────
 *
 * 6 Ruskin Place: Lianna took the advert offline, REX showed the portals
 * channel off, and Rightmove, Zoopla and OnTheMarket kept it for days with
 * enquiries still coming. setActivePublicationChannels sends nothing to the
 * feeds - each portal keeps the last upload, which said "current". Seven
 * listings were the same. So "off" first queues a "withdrawn" upload
 * (ListingPortalUploads/queue) and only then drops the channel, and "on"
 * queues a fresh "current" one after putting the channels back. A listing
 * counts as on the portals while any feed's last upload said "current",
 * whatever the channel says, so Take it offline can finish one of the seven.
 * For those, REX will only queue while the portals channel is on, so "off"
 * opens it for that one call and closes it again (see the POST).
 *
 * ── Three locks, all of which have to be open ────────────────────────────
 *
 *   1. REX_ALLOW_WRITES names ListingPublication/publish (and
 *      setActivePublicationChannels for off and on). lib/rex refuses otherwise.
 *   2. The "Push to the portals" switch on Admin, Switches (lib/area-map,
 *      id listing-publish), checked HERE as well as in the middleware,
 *      because the middleware fails open and this one reaches the public.
 *   3. The person is the owner, Susan, or an agent the switch lets through.
 *      Kirstie, marketing and support work from their own screens.
 *
 * ── It goes live as the listing's agent, never as whoever pressed it ─────
 *
 * REX stamps system_publication_user_id with the account that called publish,
 * and the Newman helper bot (HelperBot@newman.uk.com, "Orca Message") copies
 * every enquiry to that person. James pushed 843312 for Rhiannon on 15 Sep
 * and from then on her Williams Court enquiries also landed in his inbox.
 * REX has no way to change that stamp afterwards and no unpublish, so the
 * only fix is before the press: publish with listing_agent_1's own REX
 * sign-in. The office account is James too, so it is no fallback - with no
 * sign-in for the agent the push is refused and says who has to do it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALL_CHANNELS = ["portals", "automatch", "external", "general"];
const OFF_CHANNELS = ["general"];
const PUBLISH_AREA = AREA_DEFS.find((a) => a.id === "listing-publish")!;
/* For a portal message that names the system behind it: agents get these instead. */
const PORTAL_CHECK = "One of the portal checks has not passed yet.";
const PORTAL_WARNING = "One of the portal checks has a warning.";

type Where = { status: string | null; channels: string[]; onPortals: boolean };

/**
 * `feeds` is ListingPortalUploads/getStatuses: still on a portal when a feed
 * is running there and the last upload sent was "current" (see the header).
 */
function whereFrom(result: unknown, feeds?: unknown): Where {
  const r = (result ?? {}) as { status?: unknown; active_targets?: unknown };
  const status = typeof r.status === "string" ? r.status : null;
  const channels = Array.isArray(r.active_targets) ? r.active_targets.filter((c): c is string => typeof c === "string") : [];
  return { status, channels, onPortals: status === "published" && (channels.includes("portals") || stillOnPortalFeeds(feeds)) };
}

/** Tell the portal feeds what to show: "withdrawn" for off, the listing's own status for on. */
async function queueUpload(id: number, action: "off" | "on", token: string | null) {
  const res = await rexCall("ListingPortalUploads", "queue", { listing_id: id, ...(action === "off" ? { portal_listing_status: "withdrawn" } : {}) }, token);
  const r = (res.result ?? {}) as { queued?: unknown; detail?: unknown };
  return { ok: res.ok && r.queued === true, res, detail: res.ok ? String(r.detail ?? "") : String(res.error ?? `HTTP ${res.status}`) };
}

/** getErrorsPreventingUpload answers a list, or messages keyed by portal. */
function portalMessages(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap((x) => (Array.isArray(x) ? x.map(String) : [String(x)]));
  return [];
}

/**
 * The REX sign-in to publish with: the listing's agent's, whoever pressed it.
 * Answers an error sentence instead when the agent has none.
 */
async function agentToken(actor: OsUser, agent: { id: string | null; name: string | null; email: string | null }): Promise<{ token: string; asActor: boolean; name: string } | { error: string; signIn?: boolean }> {
  if (!agent.id) return { error: "The listing has no agent yet, so nobody would get its enquiries. Choose the agent first." };
  const first = agent.name?.split(" ")[0] ?? "The listing's agent";
  const same = (await ensureRexLink(actor)) === agent.id || (!!agent.email && agent.email.trim().toLowerCase() === actor.email.trim().toLowerCase());
  const owner = same ? actor : ((await findUserByRexId(agent.id)) ?? (agent.email ? await findUserByEmail(agent.email) : null));
  const token = owner ? await rexTokenFor(owner.id).catch(() => null) : null;
  if (token) return { token, asActor: same, name: agent.name ?? first };
  /* Their own sign-in has run out: the push card asks for it on the spot
     (components/SignInAgain) and tries again, 6 Oct 2026. */
  if (same) return { error: "Your REX sign-in has run out. Enquiries go to whoever puts a listing live, so it has to go out under your name - sign in again and it carries on.", signIn: true };
  return { error: `This one has to go live as ${first}, because enquiries go to whoever puts a listing live, and ${first}'s REX sign-in has run out. ${first} signs in again on their Profile (Connect to REX), then either of you can push it.` };
}

function listingId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  const testId = req.nextUrl.searchParams.get("id");
  if (isTestId(testId)) {
    const t = await testPublication(Number(testId));
    return t ? NextResponse.json(t) : NextResponse.json({ ok: false, error: "That test listing has gone." }, { status: 404 });
  }
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = listingId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  try {
    /* Two of REX's own checks, because they are not the same list: a
       listing REX will publish can still be refused by every portal feed
       for want of bedrooms, bathrooms or an available date (measured on 100
       rentals, 15 Sep 2026). */
    /* Through the per-listing read cache (lib/listing-details): this panel
       and the Marketing tab open together, and the portal check is the same
       call the details read makes - now asked once and shared. Showing only;
       the POST below reads REX fresh before it does anything. */
    const [status, issues, upload, feeds] = await Promise.all([
      listingRead(id, "ListingPublication", "getPublicationStatus", { listing_id: id }),
      listingRead(id, "ListingPublication", "getPublicationIssues", { listing_id: id }),
      listingRead(id, "ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: id }),
      listingRead(id, "ListingPortalUploads", "getStatuses", { listing_id: id, include_last_sent: false }),
    ]);
    if (!status.ok) {
      const plain = "The listings system did not say where the listing is. Try again in a minute.";
      return NextResponse.json({ ok: false, error: isOwner(actor) ? status.error ?? "REX did not say." : plain }, { status: 502 });
    }
    const iss = (issues.result ?? {}) as { errors?: unknown; warnings?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return NextResponse.json({
      ok: true,
      id,
      ...whereFrom(status.result, feeds.ok ? feeds.result : undefined),
      blockers: [...new Set([...list(iss.errors), ...(upload.ok ? portalMessages(upload.result) : [])].map((m) => forAgent(actor, m, PORTAL_CHECK)))],
      warnings: [...new Set(list(iss.warnings).map((m) => forAgent(actor, m, PORTAL_WARNING)))],
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) {
    return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to push a listing." }, { status: 403 });
  }
  if (!["owner", "super_admin", "agent"].includes(actor.role)) {
    return NextResponse.json({ ok: false, error: "Pushing to the portals is for the listing's agent." }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown };

  /* A TEST LISTING GOES LIVE HERE AND NOWHERE ELSE (James, 13 Oct 2026: a
     tester walks New listing to Push to the portals "without anything
     refusing or slowing them"). Asked before REX is even looked for, and
     before the switch: nothing reaches REX or a portal, so neither lock has
     anything to guard. The answer is the shape a real push gives, so the
     same ceremony plays - three portals, the tick, the confetti - and the
     listing then reads as live on Listings, for its tester alone. Off and on
     stay refused: a test listing has no portal feed to take it off. */
  if (isTestId(b.id)) {
    if (b.action !== "publish" && b.action !== "quiet") return NextResponse.json({ ok: false, error: TEST_REFUSAL, test: true }, { status: 409 });
    const done = await publishTestListing(Number(b.id), { email: actor.email, role: actor.role });
    if (!done.ok) return NextResponse.json({ ok: false, error: done.error, test: true }, { status: done.status });
    await record({
      kind: "listing_publication",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${b.id}: ${b.action} (test listing, nothing sent to REX or the portals)`,
    }).catch(() => {});
    const quiet = b.action === "quiet";
    return NextResponse.json({ ok: true, id: Number(b.id), action: b.action, status: "published", channels: quiet ? OFF_CHANNELS : ALL_CHANNELS, onPortals: !quiet, test: true });
  }

  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  const access = await accessFor(actor).catch(() => null);
  /* Fail CLOSED here, unlike the middleware: a switch that cannot be read
     must not become a listing on Rightmove. Owners and Susan are not gated. */
  if (actor.role === "agent" && (!access || !canAct(access, PUBLISH_AREA))) {
    return NextResponse.json(
      { ok: false, areaLocked: PUBLISH_AREA.id, error: lockedSentence(PUBLISH_AREA, levelOf(access, PUBLISH_AREA.id)) },
      { status: 423 }
    );
  }

  const id = listingId(b.id);
  const action = b.action === "publish" || b.action === "quiet" || b.action === "off" || b.action === "on" ? b.action : null;
  if (!id || !action) return NextResponse.json({ ok: false, error: "Which listing, and publish, off or on?" }, { status: 400 });
  /* Off and on as well as publish: taking a colleague's advert off Rightmove
     is the one that bites (18 Sep sweep, item 4). */
  const notTheirs = await listingIsTheirs(actor, id);
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });

  try {
    const before = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
    if (!before.ok) {
      const plain = "The listings system did not say where the listing is. Try again in a minute.";
      return NextResponse.json({ ok: false, error: isOwner(actor) ? before.error ?? "REX did not say where the listing is." : plain }, { status: 502 });
    }
    const was = whereFrom(before.result);
    /* Publish as the listing's agent (see the header); off and on as them. */
    let token: string | null = null;
    let as: { asActor: boolean; name: string } = { asActor: true, name: actor.name };

    if (action === "publish" || action === "quiet") {
      if (was.status === "published") {
        return NextResponse.json({ ok: false, error: "It is already published. Use Put back on the portals if it has been taken off." }, { status: 409 });
      }
      /* Our own required fields first (lib/listing-requirements) - the same
         rule the Marketing tab counts down - so a button pressed from a stale
         screen still cannot put a half-filled advert on Rightmove. */
      const details = await readListingDetails(id);
      /* Off the portals, only the terms stop it: the rest are the portals' own minimums. */
      const gaps = (await publishGaps(details)).filter((g) => action === "publish" || g.id === "terms" || g.id === TERMS_UNCHECKED);
      if (gaps.length) {
        return NextResponse.json(
          {
            ok: false,
            error: [
              gaps.some((g) => g.id !== "terms" && g.id !== TERMS_UNCHECKED) ? `Finish the Marketing tab first: ${gaps.filter((g) => g.id !== "terms" && g.id !== TERMS_UNCHECKED).map((g) => g.label.toLowerCase()).join(", ")}.` : "",
              gaps.some((g) => g.id === "terms") ? TERMS_SENTENCE : "",
              gaps.some((g) => g.id === TERMS_UNCHECKED) ? TERMS_UNCHECKED_SENTENCE : "",
            ].filter(Boolean).join(" "),
            missing: gaps.map((g) => g.id),
          },
          { status: 422 }
        );
      }
      /* Then the portals' own list, so the agent reads "needs a photo" rather
         than a refusal from deep in the feed. */
      const [errs, upload] = await Promise.all([
        rexCall("ListingPublication", "getErrorsPreventingPublication", { listing_id: id }),
        action === "quiet" ? Promise.resolve({ ok: false } as RexResponse) : rexCall("ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: id }),
      ]);
      const blockers = [...new Set([...(Array.isArray(errs.result) ? errs.result.map(String) : []), ...(upload.ok ? portalMessages(upload.result) : [])].map((m) => forAgent(actor, m, PORTAL_CHECK)))];
      if (blockers.length) {
        return NextResponse.json({ ok: false, error: `${action === "quiet" ? "It cannot go live yet" : "The portals will not take it yet"}: ${blockers.join("; ")}`, blockers }, { status: 422 });
      }
      /* Terms uploaded in the OS but not yet in REX go in now, or REX refuses. */
      if (details.propertyId) {
        const { ensureTermsInRex } = await import("@/lib/terms-to-rex");
        /* "unknown" is not a yes any more (15 Oct 2026): it went to REX
           without terms and came back refused. */
        const terms = await ensureTermsInRex(details.propertyId).catch(() => "unknown" as const);
        if (terms !== "yes") {
          const error =
            terms === "no" ? TERMS_SENTENCE
            : terms === "unknown" ? TERMS_UNCHECKED_SENTENCE
            : "The signed terms of business could not be filed in the listings system, so it cannot go live yet. Try again in a minute, or ask the office.";
          return NextResponse.json({ ok: false, error, missing: [terms === "unknown" ? TERMS_UNCHECKED : "terms"] }, { status: 422 });
        }
      }
      const who = await agentToken(actor, details.agent);
      if ("error" in who) return NextResponse.json({ ok: false, error: who.error, needsAgent: true, signIn: who.signIn || undefined }, { status: 409 });
      token = who.token;
      as = who;
      /* A MONTH'S RENT, NOT A WEEK'S (13 Oct 2026). The OS only takes a
         monthly rent, and a listing begun in REX is "per week" by default, so
         a figure typed here went to the portals as weekly: Dan's one-bed went
         live at about £3,320 a month. Whatever was saved, it is put right
         before it is published. */
      const raw = await rexCall("Listings", "read", { id });
      const period = String(((raw.result as { price_rent_period?: { id?: string } } | null)?.price_rent_period?.id) ?? "");
      const rent = Number((raw.result as { price_rent?: unknown } | null)?.price_rent ?? 0);
      if (raw.ok && rent > 0 && period !== "month") {
        const fixed = await rexCall("Listings", "update", { data: { id, price_rent_period: { id: "month" } } }, token);
        if (!fixed.ok) {
          return NextResponse.json({ ok: false, error: "The rent is set per week in the listings system and could not be changed to per month, so it has not gone live. Try again in a minute, or ask the office." }, { status: 409 });
        }
      }
    } else if (was.status !== "published") {
      return NextResponse.json({ ok: false, error: "It is not published yet, so there is nothing to take off." }, { status: 409 });
    } else {
      /* As THEM, so REX says who did it. No token falls to the office
         account, the same as the write-up. */
      token = await rexTokenFor(actor.id);
    }
    /* Off: the portals are told "withdrawn" BEFORE the channel goes, so a
       refusal leaves the listing exactly as it was rather than off in REX and
       still on Rightmove (the header, 22 Oct 2026). On: told after. */
    /* Already off the portals channel but a feed still shows it (the seven
       of 20-21 Oct): REX refuses the queue with "Not published to portals"
       while the channel is off. So the channel comes back for the moment the
       withdrawn upload is queued, and goes again just below - proven on 6
       Ruskin Place, 22 Oct 2026, with James's yes. A refusal puts the
       channels back as they were. */
    /* Live without Portals: the outward channels go BEFORE the publish, so no
       feed is ever sent it. Refused, nothing has changed. */
    if (action === "quiet") {
      const closed = await rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: OFF_CHANNELS }, token);
      if (!closed.ok) {
        if (token && isExpiredToken(closed)) {
          const whose = as.asActor ? "Your REX sign-in has run out. Sign in again" : `${as.name}'s REX sign-in has run out. They sign in again on their Profile (Connect to REX)`;
          return NextResponse.json({ ok: false, error: `${whose} and try again.`, reconnect: as.asActor, signIn: as.asActor || undefined }, { status: 401 });
        }
        return NextResponse.json({ ok: false, error: isOwner(actor) ? `The portals channel would not close before going live: ${closed.error ?? "REX did not say."}` : "It could not be kept off the portals, so it has not gone live. Try again in a minute." }, { status: 502 });
      }
    }
    const reopen = action === "off" && !was.channels.includes("portals");
    if (reopen) {
      const opened = await rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: [...was.channels, "portals"] }, token);
      if (!opened.ok) {
        return NextResponse.json({ ok: false, error: isOwner(actor) ? `The portals channel would not open to send the withdrawal: ${opened.error ?? "REX did not say."}` : "The portals did not take that change. Try again in a minute." }, { status: 502 });
      }
    }
    const told = action === "off" ? await queueUpload(id, "off", token) : null;
    if (reopen && told && !told.ok) {
      await rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: was.channels }, token).catch(() => null);
    }
    let res: RexResponse =
      told && !told.ok
        ? { status: told.res.status, ok: false, result: told.res.result, error: `The portals were not told to withdraw it: ${told.detail}` }
        : action === "publish" || action === "quiet"
          ? await rexCall("ListingPublication", "publish", { listing_id: id }, token)
          : await rexCall(
              "ListingPublication",
              "setActivePublicationChannels",
              { listing_id: id, channels: action === "off" ? OFF_CHANNELS : ALL_CHANNELS },
              token
            );
    if (res.ok && action === "on") {
      const back = await queueUpload(id, "on", token);
      if (!back.ok) res = { status: back.res.status, ok: false, result: back.res.result, error: `The channels are back on but the portals were not sent it again: ${back.detail}` };
    }
    if (!res.ok) {
      if (token && isExpiredToken(res)) {
        const whose = as.asActor ? "Your REX sign-in has run out. Sign in again" : `${as.name}'s REX sign-in has run out. They sign in again on their Profile (Connect to REX)`;
        return NextResponse.json({ ok: false, error: `${whose} and try again.`, reconnect: as.asActor, signIn: as.asActor || undefined }, { status: 401 });
      }
      const plain = "The portals did not take that change. Try again in a minute.";
      /* Kept (6 Oct 2026): 6 Ruskin Place was refused twice for Lianna and
         nothing said why - the agent saw the plain sentence and the reason
         went nowhere. REX's message goes in the audit log, with anything
         shaped like a session token taken out first. */
      const why = String(res.error ?? `HTTP ${res.status}`)
        .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[removed]"')
        .replace(/\b[0-9a-f]{4}(?:-[0-9a-f]{4}){4,}\b/gi, "[removed]")
        .slice(0, 400);
      console.error("[publish] REX refused", { id, action, status: res.status, why });
      await record({
        kind: "listing_publication",
        actorId: actor.id,
        actorEmail: actor.email,
        detail: `${id}: ${action} REFUSED${token ? (as.asActor ? "" : ` as ${as.name}`) : " as the office account"} - ${why}`,
      }).catch(() => {});
      /* REX's own terms rule (15 Oct 2026, bugs 2fb80600 and 718558c6):
         something the agent can do, so it is said as such - the same
         sentence as the go-live check - and not as the portals being down. */
      if ((action === "publish" || action === "quiet") && /terms of business is required/i.test(String(res.error ?? ""))) {
        return NextResponse.json({ ok: false, error: TERMS_SENTENCE, missing: ["terms"] }, { status: 422 });
      }
      return NextResponse.json({ ok: false, error: isOwner(actor) ? res.error ?? `REX refused it (${res.status}).` : plain }, { status: 502 });
    }

    /* Read it back rather than trusting the answer. */
    const [after, feeds] = await Promise.all([
      rexCall("ListingPublication", "getPublicationStatus", { listing_id: id }),
      rexCall("ListingPortalUploads", "getStatuses", { listing_id: id, include_last_sent: false }),
    ]);
    const now = whereFrom(after.ok ? after.result : res.result, feeds.ok ? feeds.result : undefined);

    await invalidateListingBook();
    forgetListing(id);
    await record({
      kind: "listing_publication",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: ${action} (${was.status ?? "?"} [${was.channels.join(",")}] -> ${now.status ?? "?"} [${now.channels.join(",")}])${token ? (as.asActor ? "" : ` as ${as.name}`) : " as the office account"}`,
    });

    return NextResponse.json({ ok: true, id, action, ...now });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      const method = e.message.match(/Refusing to call (\S+)/)?.[1] ?? (action === "publish" || action === "quiet" ? "ListingPublication/publish" : "ListingPublication/setActivePublicationChannels");
      return NextResponse.json(
        {
          ok: false,
          locked: true,
          error: isOwner(actor) ? `Pushing to the portals is locked on this environment. REX_ALLOW_WRITES needs ${method}.` : "Pushing to the portals is not switched on yet.",
        },
        { status: 423 }
      );
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." }, { status: 502 });
  }
}
