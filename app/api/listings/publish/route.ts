import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { invalidateListingBook } from "@/lib/listings-cache";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";

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
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALL_CHANNELS = ["portals", "automatch", "external", "general"];
const OFF_CHANNELS = ["general"];
const PUBLISH_AREA = AREA_DEFS.find((a) => a.id === "listing-publish")!;

type Where = { status: string | null; channels: string[]; onPortals: boolean };

function whereFrom(result: unknown): Where {
  const r = (result ?? {}) as { status?: unknown; active_targets?: unknown };
  const status = typeof r.status === "string" ? r.status : null;
  const channels = Array.isArray(r.active_targets) ? r.active_targets.filter((c): c is string => typeof c === "string") : [];
  return { status, channels, onPortals: status === "published" && channels.includes("portals") };
}

function listingId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = listingId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  try {
    const [status, issues] = await Promise.all([
      rexCall("ListingPublication", "getPublicationStatus", { listing_id: id }),
      rexCall("ListingPublication", "getPublicationIssues", { listing_id: id }),
    ]);
    if (!status.ok) return NextResponse.json({ ok: false, error: status.error ?? "REX did not say." }, { status: 502 });
    const iss = (issues.result ?? {}) as { errors?: unknown; warnings?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return NextResponse.json({
      ok: true,
      id,
      ...whereFrom(status.result),
      blockers: list(iss.errors),
      warnings: list(iss.warnings),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "REX did not answer." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });

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
  const id = listingId(b.id);
  const action = b.action === "publish" || b.action === "off" || b.action === "on" ? b.action : null;
  if (!id || !action) return NextResponse.json({ ok: false, error: "Which listing, and publish, off or on?" }, { status: 400 });

  try {
    const before = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
    if (!before.ok) return NextResponse.json({ ok: false, error: before.error ?? "REX did not say where the listing is." }, { status: 502 });
    const was = whereFrom(before.result);

    if (action === "publish") {
      if (was.status === "published") {
        return NextResponse.json({ ok: false, error: "It is already published. Use Put back on the portals if it has been taken off." }, { status: 409 });
      }
      /* REX's own list of what stops it, asked first, so the agent reads
         "needs a photo" rather than a refusal from deep in REX. */
      const errs = await rexCall("ListingPublication", "getErrorsPreventingPublication", { listing_id: id });
      const blockers = Array.isArray(errs.result) ? errs.result.map(String) : [];
      if (blockers.length) {
        return NextResponse.json({ ok: false, error: `REX will not publish it yet: ${blockers.join("; ")}`, blockers }, { status: 422 });
      }
    } else if (was.status !== "published") {
      return NextResponse.json({ ok: false, error: "It is not published yet, so there is nothing to take off." }, { status: 409 });
    }

    /* As THEM, so REX says who pushed it. No token falls to the office
       account, the same as the write-up. */
    const token = await rexTokenFor(actor.id);
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
        return NextResponse.json({ ok: false, error: "Your REX sign-in has lapsed - reconnect it in your profile and try again.", reconnect: true }, { status: 401 });
      }
      return NextResponse.json({ ok: false, error: res.error ?? `REX refused it (${res.status}).` }, { status: 502 });
    }

    /* Read it back rather than trusting the answer. */
    const after = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
    const now = whereFrom(after.ok ? after.result : res.result);

    await invalidateListingBook();
    await record({
      kind: "listing_publication",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: ${action} (${was.status ?? "?"} [${was.channels.join(",")}] -> ${now.status ?? "?"} [${now.channels.join(",")}])${token ? "" : " as the office account"}`,
    });

    return NextResponse.json({ ok: true, id, action, ...now });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      const method = action === "publish" ? "ListingPublication/publish" : "ListingPublication/setActivePublicationChannels";
      return NextResponse.json(
        { ok: false, locked: true, error: `Pushing to the portals is locked on this environment. REX_ALLOW_WRITES needs ${method}.` },
        { status: 423 }
      );
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "REX did not answer." }, { status: 502 });
  }
}
