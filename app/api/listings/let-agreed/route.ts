import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { invalidateListingBook } from "@/lib/listings-cache";
import { forgetListing, listingRead } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { isTestId } from "@/lib/test-overlay";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { forAgent, isOwner } from "@/lib/agent-words";
import { switchOn } from "@/lib/switches";

/**
 * MARK AS LET AGREED, AND BACK (Lorna, ticket 015e31a5, 22 Oct 2026, on
 * 846033: "Need a button adding to change a property status online to LET
 * AGREED, not just take it straight offline").
 *
 *   GET  ?id=846033                         → { letAgreed, onPortals, armed, rehearse }
 *   POST { id, action: "let_agreed" }       → ticked, the advert stays up with the banner
 *   POST { id, action: "available" }        → unticked, a let that fell through
 *
 * ── How the portals show it, read off REX on 27 Oct 2026 ─────────────────
 *
 * Let Agreed is a plain tick on the REX listing, `let_agreed` ("whether an
 * offer by a prospective tenant has been accepted in principle"). The listing
 * stays published and "current"; the portal feeds read the tick and send it
 * as Let Agreed. 846033 itself proves it: let_agreed true, published on all
 * four channels, last upload "current", and Rightmove (94175937) and
 * OnTheMarket (20521193) both showing it with a LET AGREED banner.
 *
 * The OS's own "Let agreed" is wider - an offer accepted here counts too
 * (app/(os)/listings/[listingId]) - but that never reaches REX, so the
 * advert kept saying available until somebody ticked it in REX by hand. This
 * reads and writes REX's tick alone.
 *
 * ── The write ────────────────────────────────────────────────────────────
 *
 *   Listings/update { data: { id, let_agreed: true|false } }   as the person
 *   Listings/read   { id }                                      read it back
 *   ListingPortalUploads/queue { listing_id }                   the feeds told
 *
 * The queue is the one Put back on the market already sends: no status, so
 * REX sends the listing's own, which now carries the tick. A tick REX ignored
 * silently is caught by the read-back (the electricity and broadband fields
 * did exactly that on 15 Sep 2026). Asked only while the portals channel is
 * on: a home off the market has nothing on the portals to change.
 *
 * ── Locks ────────────────────────────────────────────────────────────────
 *
 *   1. The "Mark as Let Agreed on the portals" switch (lib/switches,
 *      listing_let_agreed). Off, agents don't see the button and an owner's
 *      press is a rehearsal: everything checked, nothing written, said so.
 *   2. REX_ALLOW_WRITES must name Listings/update and ListingPortalUploads/queue.
 *   3. Push to the portals (lib/area-map, listing-publish) for agents, failing
 *      closed, and only on their own listing - the same people who may take
 *      it off the market.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLISH_AREA = AREA_DEFS.find((a) => a.id === "listing-publish")!;
const SWITCH = "listing_let_agreed";

function listingId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const ticked = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

type Now = { published: boolean; onPortals: boolean; letAgreed: boolean };

/** Where the listing is, from REX: published, on the portals channel, and its tick. */
async function readNow(id: number, fresh: boolean): Promise<Now | null> {
  const [l, p] = fresh
    ? await Promise.all([rexCall("Listings", "read", { id }), rexCall("ListingPublication", "getPublicationStatus", { listing_id: id })])
    : await Promise.all([listingRead(id, "Listings", "read", { id }), listingRead(id, "ListingPublication", "getPublicationStatus", { listing_id: id })]);
  if (!l.ok || !p.ok) return null;
  const listing = (l.result ?? {}) as { let_agreed?: unknown };
  const pub = (p.result ?? {}) as { status?: unknown; active_targets?: unknown };
  const channels = Array.isArray(pub.active_targets) ? pub.active_targets : [];
  return { published: pub.status === "published", onPortals: pub.status === "published" && channels.includes("portals"), letAgreed: ticked(listing.let_agreed) };
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = listingId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  const armed = await switchOn(SWITCH);
  try {
    const now = await readNow(id, false);
    if (!now) return NextResponse.json({ ok: false, error: "The listings system did not say whether it is let agreed." }, { status: 502 });
    return NextResponse.json({ ok: true, id, ...now, armed, rehearse: !armed && isOwner(actor) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer.") : "The listings system did not answer." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them first." }, { status: 403 });
  if (!["owner", "super_admin", "agent"].includes(actor.role)) {
    return NextResponse.json({ ok: false, error: "This is for the listing's agent." }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
  if (isTestId(b.id)) return NextResponse.json({ ok: false, error: "A test listing has no advert on the portals." }, { status: 409 });
  const id = listingId(b.id);
  const action = b.action === "let_agreed" || b.action === "available" ? b.action : null;
  if (!id || !action) return NextResponse.json({ ok: false, error: "Which listing, and let agreed or available?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });

  const armed = await switchOn(SWITCH);
  const owner = isOwner(actor);
  if (!armed && !owner) {
    return NextResponse.json({ ok: false, locked: true, error: "Mark as Let Agreed isn't switched on yet." }, { status: 423 });
  }
  /* Fail CLOSED, as Push to the portals does: this changes what the public sees. */
  if (actor.role === "agent") {
    const access = await accessFor(actor).catch(() => null);
    if (!access || !canAct(access, PUBLISH_AREA)) {
      return NextResponse.json({ ok: false, areaLocked: PUBLISH_AREA.id, error: lockedSentence(PUBLISH_AREA, levelOf(access, PUBLISH_AREA.id)) }, { status: 423 });
    }
    const notTheirs = await listingIsTheirs(actor, id);
    if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  }

  const want = action === "let_agreed";
  const words = want ? "let agreed" : "back to available";
  try {
    const was = await readNow(id, true);
    if (!was) return NextResponse.json({ ok: false, error: "The listings system did not say where the listing is. Try again in a minute." }, { status: 502 });
    if (!was.published) return NextResponse.json({ ok: false, error: "It isn't live yet, so there is no advert to mark." }, { status: 409 });
    if (was.letAgreed === want) return NextResponse.json({ ok: true, id, ...was, unchanged: true });

    /* The rehearsal: everything above was real, nothing below is sent. */
    if (!armed) {
      await record({
        kind: "listing_let_agreed",
        actorId: actor.id,
        actorEmail: actor.email,
        detail: `${id}: ${words} REHEARSED, nothing written (switch off). Would send Listings/update let_agreed=${want}${was.onPortals ? " then ListingPortalUploads/queue" : ""}`,
      }).catch(() => {});
      return NextResponse.json({ ok: true, id, ...was, rehearsed: true, would: [`Listings/update { data: { id: ${id}, let_agreed: ${want} } }`, ...(was.onPortals ? [`ListingPortalUploads/queue { listing_id: ${id} }`] : [])] });
    }

    /* As THEM, so REX says who did it. No token falls to the office account. */
    const token = await rexTokenFor(actor.id);
    const res = await rexCall("Listings", "update", { data: { id, let_agreed: want } }, token);
    if (!res.ok) {
      if (token && isExpiredToken(res)) return NextResponse.json({ ok: false, error: "Your REX sign-in has run out. Sign in again and try again.", reconnect: true, signIn: true }, { status: 401 });
      await record({ kind: "listing_let_agreed", actorId: actor.id, actorEmail: actor.email, detail: `${id}: ${words} REFUSED - ${String(res.error ?? `HTTP ${res.status}`).slice(0, 300)}` }).catch(() => {});
      return NextResponse.json({ ok: false, error: owner ? res.error ?? `REX refused it (${res.status}).` : "The listings system did not take that. Try again in a minute." }, { status: 502 });
    }
    /* Read it back rather than trusting the answer. */
    const now = await readNow(id, true);
    if (!now || now.letAgreed !== want) {
      await record({ kind: "listing_let_agreed", actorId: actor.id, actorEmail: actor.email, detail: `${id}: ${words} NOT KEPT - REX answered ok but let_agreed reads ${now ? now.letAgreed : "unknown"}` }).catch(() => {});
      return NextResponse.json({ ok: false, error: owner ? "REX said yes but the let agreed tick did not change." : "The listings system did not keep that. Nothing has changed on the portals." }, { status: 502 });
    }
    /* Then the feeds, so the banner shows without waiting for the next upload. */
    let told: boolean | null = null;
    if (now.onPortals) {
      const q = await rexCall("ListingPortalUploads", "queue", { listing_id: id }, token).catch(() => null);
      told = Boolean(q?.ok && (q.result as { queued?: unknown } | undefined)?.queued === true);
    }
    await invalidateListingBook();
    forgetListing(id);
    await record({
      kind: "listing_let_agreed",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: ${words} (let_agreed ${was.letAgreed} -> ${now.letAgreed})${told === null ? ", not on the portals channel" : told ? ", portals sent it" : ", portal upload NOT queued"}${token ? "" : " as the office account"}`,
    });
    return NextResponse.json({ ok: true, id, ...now, portalsTold: told });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      const method = e.message.match(/Refusing to call (\S+)/)?.[1] ?? "Listings/update";
      return NextResponse.json({ ok: false, locked: true, error: owner ? `Locked on this environment. REX_ALLOW_WRITES needs ${method}.` : "Mark as Let Agreed isn't switched on yet." }, { status: 423 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." }, { status: 502 });
  }
}
