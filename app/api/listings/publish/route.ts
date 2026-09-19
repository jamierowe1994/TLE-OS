import { NextRequest, NextResponse } from "next/server";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { invalidateListingBook } from "@/lib/listings-cache";
import { readListingDetails } from "@/lib/listing-details";
import { publishGaps } from "@/lib/listing-publish-check";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { forAgent, isOwner } from "@/lib/agent-words";
import { ensureRexLink, findUserByEmail, findUserByRexId, type OsUser } from "@/lib/users";

/**
 * Putting a listing on Rightmove, OnTheMarket and Zoopla, and taking it off.
 *
 *   GET  ?id=843312                      → where it is now, live from REX
 *   POST { id, action: "publish" }       → a draft goes live
 *   POST { id, action: "off" }           → off the portals, still published
 *   POST { id, action: "on" }            → back on the portals
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

function whereFrom(result: unknown): Where {
  const r = (result ?? {}) as { status?: unknown; active_targets?: unknown };
  const status = typeof r.status === "string" ? r.status : null;
  const channels = Array.isArray(r.active_targets) ? r.active_targets.filter((c): c is string => typeof c === "string") : [];
  return { status, channels, onPortals: status === "published" && channels.includes("portals") };
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
async function agentToken(actor: OsUser, agent: { id: string | null; name: string | null; email: string | null }): Promise<{ token: string; asActor: boolean; name: string } | { error: string }> {
  if (!agent.id) return { error: "The listing has no agent yet, so nobody would get its enquiries. Choose the agent first." };
  const first = agent.name?.split(" ")[0] ?? "The listing's agent";
  const same = (await ensureRexLink(actor)) === agent.id || (!!agent.email && agent.email.trim().toLowerCase() === actor.email.trim().toLowerCase());
  const owner = same ? actor : ((await findUserByRexId(agent.id)) ?? (agent.email ? await findUserByEmail(agent.email) : null));
  const token = owner ? await rexTokenFor(owner.id).catch(() => null) : null;
  if (token) return { token, asActor: same, name: agent.name ?? first };
  if (same) return { error: "Connect your sign-in to the listings system on your Profile first. Enquiries go to whoever puts a listing live, and without it they would go to the office." };
  return { error: `This one has to go live as ${first}, because enquiries go to whoever puts a listing live. ${first} needs to connect their sign-in to the listings system on their Profile, then either of you can push it.` };
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
    const [status, issues, upload] = await Promise.all([
      rexCall("ListingPublication", "getPublicationStatus", { listing_id: id }),
      rexCall("ListingPublication", "getPublicationIssues", { listing_id: id }),
      rexCall("ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: id }),
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
      ...whereFrom(status.result),
      blockers: [...new Set([...list(iss.errors), ...(upload.ok ? portalMessages(upload.result) : [])].map((m) => forAgent(actor, m, PORTAL_CHECK)))],
      warnings: [...new Set(list(iss.warnings).map((m) => forAgent(actor, m, PORTAL_WARNING)))],
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });

  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) {
    return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to push a listing." }, { status: 403 });
  }
  if (!["owner", "super_admin", "agent"].includes(actor.role)) {
    return NextResponse.json({ ok: false, error: "Pushing to the portals is for the listing's agent." }, { status: 403 });
  }
  const access = await accessFor(actor).catch(() => null);
  /* Fail CLOSED here, unlike the middleware: a switch that cannot be read
     must not become a listing on Rightmove. Owners and Susan are not gated. */
  if (actor.role === "agent" && (!access || !canAct(access, PUBLISH_AREA))) {
    return NextResponse.json(
      { ok: false, areaLocked: PUBLISH_AREA.id, error: lockedSentence(PUBLISH_AREA, levelOf(access, PUBLISH_AREA.id)) },
      { status: 423 }
    );
  }

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
  if (isTestId(b.id)) return NextResponse.json({ ok: false, error: TEST_REFUSAL, test: true }, { status: 409 });
  const id = listingId(b.id);
  const action = b.action === "publish" || b.action === "off" || b.action === "on" ? b.action : null;
  if (!id || !action) return NextResponse.json({ ok: false, error: "Which listing, and publish, off or on?" }, { status: 400 });

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

    if (action === "publish") {
      if (was.status === "published") {
        return NextResponse.json({ ok: false, error: "It is already published. Use Put back on the portals if it has been taken off." }, { status: 409 });
      }
      /* Our own required fields first (lib/listing-requirements) - the same
         rule the Marketing tab counts down - so a button pressed from a stale
         screen still cannot put a half-filled advert on Rightmove. */
      const details = await readListingDetails(id);
      const gaps = await publishGaps(details);
      if (gaps.length) {
        return NextResponse.json(
          { ok: false, error: `Finish the Marketing tab first: ${gaps.map((g) => g.label.toLowerCase()).join(", ")}.`, missing: gaps.map((g) => g.id) },
          { status: 422 }
        );
      }
      /* Then the portals' own list, so the agent reads "needs a photo" rather
         than a refusal from deep in the feed. */
      const [errs, upload] = await Promise.all([
        rexCall("ListingPublication", "getErrorsPreventingPublication", { listing_id: id }),
        rexCall("ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: id }),
      ]);
      const blockers = [...new Set([...(Array.isArray(errs.result) ? errs.result.map(String) : []), ...(upload.ok ? portalMessages(upload.result) : [])].map((m) => forAgent(actor, m, PORTAL_CHECK)))];
      if (blockers.length) {
        return NextResponse.json({ ok: false, error: `The portals will not take it yet: ${blockers.join("; ")}`, blockers }, { status: 422 });
      }
      const who = await agentToken(actor, details.agent);
      if ("error" in who) return NextResponse.json({ ok: false, error: who.error, needsAgent: true }, { status: 409 });
      token = who.token;
      as = who;
    } else if (was.status !== "published") {
      return NextResponse.json({ ok: false, error: "It is not published yet, so there is nothing to take off." }, { status: 409 });
    } else {
      /* As THEM, so REX says who did it. No token falls to the office
         account, the same as the write-up. */
      token = await rexTokenFor(actor.id);
    }
    const res =
      action === "publish"
        ? await rexCall("ListingPublication", "publish", { listing_id: id }, token)
        : await rexCall(
            "ListingPublication",
            "setActivePublicationChannels",
            { listing_id: id, channels: action === "off" ? OFF_CHANNELS : ALL_CHANNELS },
            token
          );
    if (!res.ok) {
      if (token && isExpiredToken(res)) {
        const whose = as.asActor ? "Your sign-in to the listings system has lapsed. Reconnect it on your Profile" : `${as.name}'s sign-in to the listings system has lapsed. They need to reconnect it on their Profile`;
        return NextResponse.json({ ok: false, error: `${whose} and try again.`, reconnect: as.asActor }, { status: 401 });
      }
      const plain = "The portals did not take that change. Try again in a minute.";
      return NextResponse.json({ ok: false, error: isOwner(actor) ? res.error ?? `REX refused it (${res.status}).` : plain }, { status: 502 });
    }

    /* Read it back rather than trusting the answer. */
    const after = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
    const now = whereFrom(after.ok ? after.result : res.result);

    await invalidateListingBook();
    await record({
      kind: "listing_publication",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: ${action} (${was.status ?? "?"} [${was.channels.join(",")}] -> ${now.status ?? "?"} [${now.channels.join(",")}])${token ? (as.asActor ? "" : ` as ${as.name}`) : " as the office account"}`,
    });

    return NextResponse.json({ ok: true, id, action, ...now });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      const method = action === "publish" ? "ListingPublication/publish" : "ListingPublication/setActivePublicationChannels";
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
