import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { record } from "@/lib/audit";
import { isTestId } from "@/lib/test-overlay";
import { listingIsTheirs } from "@/lib/listing-gate";
import { closedReasons, getApplicationById, getApplications } from "@/lib/applications";
import { decisionsFor } from "@/lib/offer-decisions";
import { otherOpenOffers } from "@/lib/offer-hold";
import { invalidateListingBook } from "@/lib/listings-cache";
import { advertFor, isOfflineWhen, markOffline, markOnline, setPlan } from "@/lib/advert-offline";

/**
 * The advert's Offline marker and the agent's plan for it (lib/advert-offline).
 *
 * GET  ?listing=<id>&application=<id>
 *        -> { advert, offers, acceptedId }  the plan, whether the OS has it
 *           offline, the other offers still open on the home (for the confirm
 *           screen) and the let in progress
 * POST { listingId, applicationId?, action: "plan", when }   remind me then
 * POST { listingId, applicationId?, action: "offline" }      mark it offline
 * POST { listingId, action: "online" }                       back online
 *
 * Off and on the portals themselves are /api/listings/publish ("off"/"on"),
 * which the screen calls first with all of its own checks; this only keeps
 * the OS's record of it. Nothing here writes to the listing system, declines
 * an offer or emails anyone.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listingId = req.nextUrl.searchParams.get("listing") ?? "";
  const applicationId = req.nextUrl.searchParams.get("application") ?? "";
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  const advert = await advertFor(listingId).catch(() => null);

  /* The other offers on the home, everyone but the accepted one. */
  let offers: { ref: string; name: string; amount: number | null; people: number }[] = [];
  /* The let in progress on this home, when the screen didn't come from it. */
  let acceptedId: string | null = applicationId || null;
  try {
    const here = (await getApplications(300).catch(() => [])).filter((a) => String(a.listingId ?? "") === listingId);
    const closed = await closedReasons(here).catch(() => new Map<string, string>());
    const except = applicationId ? `rex:${applicationId}` : "";
    const open = await otherOpenOffers(listingId, except, here, closed);
    /* Leave out any application that is itself accepted (the let in progress). */
    const acceptedApps = here.filter((a) => a.status === "accepted" || a.osDecision?.decision === "accepted");
    const accepted = new Set(acceptedApps.map((a) => `rex:${a.id}`));
    acceptedId ??= acceptedApps[0]?.id ?? null;
    const decided = await decisionsFor(open.map((o) => o.ref)).catch(() => new Map());
    offers = open
      .filter((o) => !accepted.has(o.ref) && decided.get(o.ref)?.decision !== "accepted")
      .map((o) => ({ ref: o.ref, name: o.name, amount: o.amount, people: o.people.length }));
  } catch {
    offers = [];
  }
  return NextResponse.json({ ok: true, advert, offers, acceptedId });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them first." }, { status: 403 });
  if (actor.role !== "agent" && !can(actor.role, "staff:internal")) {
    return NextResponse.json({ ok: false, error: "This is for the listing's agent." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { listingId?: unknown; applicationId?: unknown; action?: unknown; when?: unknown };
  const listingId = typeof b.listingId === "string" || typeof b.listingId === "number" ? String(b.listingId) : "";
  const applicationId = typeof b.applicationId === "string" && b.applicationId ? b.applicationId : null;
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (isTestId(listingId)) return NextResponse.json({ ok: false, error: "A test listing has no advert on the portals to take down." }, { status: 409 });

  /* An agent acts on their own listing, as Take off the portals does. */
  if (/^\d+$/.test(listingId)) {
    const notTheirs = await listingIsTheirs(actor, Number(listingId)).catch(() => "That listing could not be read just now. Try again in a minute.");
    if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  }
  if (applicationId && !(await getApplicationById(applicationId).catch(() => null))) {
    return NextResponse.json({ ok: false, error: "That application isn't there." }, { status: 404 });
  }
  const by = { name: actor.name || actor.email, email: actor.email };

  try {
    if (b.action === "plan") {
      if (!isOfflineWhen(b.when)) return NextResponse.json({ ok: false, error: "When should we ask you?" }, { status: 400 });
      const advert = await setPlan(listingId, applicationId, b.when, by.name);
      return NextResponse.json({ ok: true, advert });
    }
    if (b.action === "offline" || b.action === "online") {
      const advert = b.action === "offline" ? await markOffline(listingId, applicationId, by) : await markOnline(listingId);
      invalidateListingBook();
      await record({
        kind: "listing_publication",
        actorId: actor.id,
        actorEmail: actor.email,
        detail: `${listingId}: advert marked ${b.action}${applicationId ? ` (let ${applicationId})` : ""}`,
      }).catch(() => {});
      return NextResponse.json({ ok: true, advert });
    }
    return NextResponse.json({ ok: false, error: "Offline, online or a plan?" }, { status: 400 });
  } catch (e) {
    console.error("[listings/offline]", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
