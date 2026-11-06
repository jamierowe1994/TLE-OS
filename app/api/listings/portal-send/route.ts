import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct } from "@/lib/area-map";
import { record } from "@/lib/audit";
import { logFailure } from "@/lib/auto-bugs";
import { forAgent } from "@/lib/agent-words";
import { forgetListing } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { queueUpload } from "@/lib/listing-take-off";
import { invalidateListingBook } from "@/lib/listings-cache";
import { readSend } from "@/lib/portal-send";
import { rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";

/**
 * Is it on the portals yet? Asked every so often by the watcher
 * (components/PortalSendWatcher) after a Go live or Put back on the market
 * that REX had not finished sending (James, 6 Nov 2026: "say REX is taking a
 * while, let them carry on, poll, then give them a toast saying it's live").
 *
 *   POST { id, since, tries?, late? }
 *     → { state: "live", portals }          through: the toast says so
 *     → { state: "failed", refused }        a portal said no, in its words
 *     → { state: "sending" }                still going, ask again later
 *     → { state: "off" }                    taken off meanwhile: stop asking
 *
 * POST, not GET, because it may send again: when the send that ran after the
 * press was an older "take it off" one (a withdrawn upload still queued from
 * before), or when nothing at all has run a minute and a half after the
 * press, the listing is queued once more as the person - up to three times.
 * After that it only watches. `late` (half an hour without getting through)
 * raises one ticket so the office sees it; the agent is told the same.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLISH_AREA = AREA_DEFS.find((a) => a.id === "listing-publish")!;
const RESEND_AFTER_MS = 90_000;
const MAX_TRIES = 3;

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: true, state: "off" });
  if (!["owner", "super_admin", "agent"].includes(actor.role)) return NextResponse.json({ ok: true, state: "off" });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; since?: unknown; tries?: unknown; late?: unknown };
  const id = Number(b.id);
  const since = Number(b.since);
  const tries = Math.max(0, Math.min(10, Number(b.tries) || 0));
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(since) || since <= 0) {
    return NextResponse.json({ ok: false, error: "Which listing, and since when?" }, { status: 400 });
  }
  if (actor.role === "agent") {
    const access = await accessFor(actor).catch(() => null);
    if (!access || !canAct(access, PUBLISH_AREA)) return NextResponse.json({ ok: true, state: "off" });
    const notTheirs = await listingIsTheirs(actor, id);
    if (notTheirs) return NextResponse.json({ ok: true, state: "off" });
  }

  try {
    /* Taken off (or never put on) meanwhile: nothing to wait for. */
    const pub = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
    if (!pub.ok) return NextResponse.json({ ok: true, state: "sending", unread: true });
    const p = (pub.result ?? {}) as { status?: unknown; active_targets?: unknown };
    const channels = Array.isArray(p.active_targets) ? p.active_targets.map(String) : [];
    if (p.status !== "published" || !channels.includes("portals")) return NextResponse.json({ ok: true, state: "off" });

    const send = await readSend(id, since);
    if (!send) return NextResponse.json({ ok: true, state: "sending", unread: true });

    if (send.state === "live") {
      await invalidateListingBook().catch(() => {});
      forgetListing(id);
      await record({ kind: "listing_publication", actorId: actor.id, actorEmail: actor.email, detail: `${id}: reached the portals (${send.portals.join(", ")}) ${Math.round((Date.now() - since) / 1000)}s after the press` }).catch(() => {});
      return NextResponse.json({ ok: true, state: "live", portals: send.portals });
    }
    if (send.state === "failed") {
      await record({ kind: "listing_publication", actorId: actor.id, actorEmail: actor.email, detail: `${id}: a portal refused it - ${send.refused.map((r) => `${r.portal}: ${r.why}`).join("; ").slice(0, 300)}` }).catch(() => {});
      return NextResponse.json({
        ok: true,
        state: "failed",
        portals: send.portals,
        refused: send.refused.map((r) => ({ portal: r.portal, why: forAgent(actor, r.why, "It did not pass that portal's checks.") })),
      });
    }

    /* An older take-off ran after the press, or nothing has run at all: send it again. */
    const stalled = send.state === "withdrawn" || (send.state === "none" && Date.now() - since > RESEND_AFTER_MS);
    let resent = false;
    if (stalled && tries < MAX_TRIES) {
      const token = await rexTokenFor(actor.id).catch(() => null);
      const q = await queueUpload(id, "on", token).catch((e) => {
        if (e instanceof RexWriteBlocked) return null;
        throw e;
      });
      resent = Boolean(q?.ok);
      await record({ kind: "listing_publication", actorId: actor.id, actorEmail: actor.email, detail: `${id}: sent to the portals again (${send.state === "withdrawn" ? "an older take-off ran first" : "nothing had run"}), try ${tries + 1} - ${q ? (q.ok ? "queued" : q.detail) : "locked"}` }).catch(() => {});
    }

    if (b.late === true) {
      await logFailure({
        source: "REX",
        what: "ListingPortalUploads/queue",
        message: `Listing ${id} has not reached the portals half an hour after it was put live (last send: ${send.state}). The agent was told it hasn't failed and the office would look.`,
        who: actor.email,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, state: "sending", resent, tries: tries + (stalled && tries < MAX_TRIES ? 1 : 0) });
  } catch (e) {
    return NextResponse.json({ ok: true, state: "sending", unread: true, why: e instanceof Error ? forAgent(actor, e.message, "") : "" });
  }
}
