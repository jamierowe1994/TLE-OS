import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { invalidateListingBook } from "@/lib/listings-cache";
import { readListingDetails } from "@/lib/listing-details";
import { inputFromDetails, missing } from "@/lib/listing-requirements";
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

/**
 * Is there an EPC? On the listing itself (where REX keeps one entered with
 * the advert) or as a compliance entry on the property. "Not required" counts:
 * a handful of homes are genuinely exempt.
 */
async function hasEpc(details: Awaited<ReturnType<typeof readListingDetails>>): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  if (details.epc.rating || (details.epc.expiry && details.epc.expiry >= today)) return true;
  if (!details.propertyId) return false;
  try {
    const { certificatesFor } = await import("@/lib/rex-compliance");
    const book = await certificatesFor([
      { propertyId: details.propertyId, name: details.address, locality: details.town, epcExpiry: details.epc.expiry, service: details.service },
    ]);
    const state = book.properties[0]?.certs?.epc;
    return Boolean(state && (state.expires == null ? state.attached : state.expires >= 0 || state.notRequired));
  } catch {
    /* A check that cannot be made must not stop a legitimate publish: the
       screen has already shown the agent what is missing. */
    return true;
  }
}

/** getErrorsPreventingUpload answers a list, or messages keyed by portal. */
function portalMessages(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap((x) => (Array.isArray(x) ? x.map(String) : [String(x)]));
  return [];
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
    /* Two of REX's own checks, because they are not the same list: a
       listing REX will publish can still be refused by every portal feed
       for want of bedrooms, bathrooms or an available date (measured on 100
       rentals, 15 Sep 2026). */
    const [status, issues, upload] = await Promise.all([
      rexCall("ListingPublication", "getPublicationStatus", { listing_id: id }),
      rexCall("ListingPublication", "getPublicationIssues", { listing_id: id }),
      rexCall("ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: id }),
    ]);
    if (!status.ok) return NextResponse.json({ ok: false, error: status.error ?? "REX did not say." }, { status: 502 });
    const iss = (issues.result ?? {}) as { errors?: unknown; warnings?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return NextResponse.json({
      ok: true,
      id,
      ...whereFrom(status.result),
      blockers: [...new Set([...list(iss.errors), ...(upload.ok ? portalMessages(upload.result) : [])])],
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
      /* Our own required fields first (lib/listing-requirements) - the same
         rule the Marketing tab counts down - so a button pressed from a stale
         screen still cannot put a half-filled advert on Rightmove. */
      const details = await readListingDetails(id);
      /* The EPC, and only the EPC (James, 16 Sep 2026): it is what the law
         needs to ADVERTISE. Gas and the EICR are needed before anyone moves
         in and block the handover instead (lib/deal-handoff). */
      const gaps = missing(inputFromDetails(details));
      if (!(await hasEpc(details))) gaps.push({ id: "epc" as never, label: "EPC", ok: () => false });
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
      const blockers = [...new Set([...(Array.isArray(errs.result) ? errs.result.map(String) : []), ...(upload.ok ? portalMessages(upload.result) : [])])];
      if (blockers.length) {
        return NextResponse.json({ ok: false, error: `The portals will not take it yet: ${blockers.join("; ")}`, blockers }, { status: 422 });
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
