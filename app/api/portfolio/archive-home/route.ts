import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { record } from "@/lib/audit";
import { managedBookFor } from "@/lib/managed-book-cache";
import { archiveHome, archiveOf, archivedHomes, keysFor, mayArchiveOwn, putBack } from "@/lib/archived-homes";
import { bookScope } from "@/lib/scope";
import { publicError } from "@/lib/public-error";

/**
 * Archive an old home, in the OS only (James, 27 Oct 2026: Michael clears
 * the homes that are not ours any more but still come through).
 *
 *   GET                         → { canArchive, homes } every archived home
 *   GET  ?listing=<listing id>  → { canArchive, archived } this home's archive
 *   POST { listingIds, label, reason }  → those homes come off the OS
 *   POST { putBack: <archive id> }      → back on, as they were
 *
 * For whoever holds archive:homes (Michael, Susan, the owners), as themselves,
 * and since 2 Nov 2026 the home's own agent on their own book (mayArchiveOwn).
 * Nothing is written to REX or REX PM: lib/archived-homes takes the homes off
 * every read. Every change is audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* James, 2 Nov 2026: the home's own agent may archive it too, on their own
   book only (mayArchiveOwn), and put back a home they archived themselves. */
async function allowed(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  const ok = Boolean(actor && can(actor.role, "archive:homes") && !who?.viewingAs);
  const scope = actor && !ok && !who?.viewingAs ? await bookScope(req, who).catch(() => null) : null;
  const own = Boolean(actor && scope && mayArchiveOwn(actor.role, scope));
  return { actor, ok, own, rexUserId: scope?.rexUserId ?? null };
}

export async function GET(req: NextRequest) {
  const { actor, ok, own } = await allowed(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listing = req.nextUrl.searchParams.get("listing")?.trim();
  /* The agent sees the archive of a home they archived themselves, to put it back. */
  if (!ok && own && listing) {
    const a = await archiveOf(listing).catch(() => null);
    return NextResponse.json({ ok: true, canArchive: false, archived: a && a.byEmail?.toLowerCase() === actor.email.toLowerCase() ? a : null }, { headers: { "cache-control": "private, no-store" } });
  }
  if (!ok) return NextResponse.json({ ok: true, canArchive: false, homes: [], archived: null });
  try {
    if (listing) return NextResponse.json({ ok: true, canArchive: true, archived: await archiveOf(listing) }, { headers: { "cache-control": "private, no-store" } });
    return NextResponse.json({ ok: true, canArchive: true, homes: await archivedHomes() }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The archive couldn't be read just now.") }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, ok, own, rexUserId } = await allowed(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!ok && !own) return NextResponse.json({ ok: false, error: "Taking a home off is for the home's own agent, Michael, Susan and the owners." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { listingIds?: unknown; label?: unknown; reason?: unknown; putBack?: unknown } | null;
  const who = actor.name || actor.email;

  try {
    if (typeof b?.putBack === "string" && b.putBack) {
      if (!ok) {
        const mine = (await archivedHomes()).find((a) => a.id === b.putBack);
        if (!mine || mine.byEmail?.toLowerCase() !== actor.email.toLowerCase()) {
          return NextResponse.json({ ok: false, error: "Only whoever took it off, Michael, Susan or the owners can put it back." }, { status: 403 });
        }
      }
      const back = await putBack(b.putBack, who);
      if (!back) return NextResponse.json({ ok: false, error: "That home isn't archived any more." }, { status: 404 });
      await record({ kind: "home_archived", actorId: actor.id, actorEmail: actor.email, detail: `Put back: ${back.label}. OS only, not REX.` }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    const asked = Array.isArray(b?.listingIds) ? [...new Set(b.listingIds.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 60) : [];
    if (!asked.length) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
    /* The agent's own book, so they can only take off their own homes, every one of them. */
    const { book } = await managedBookFor(ok ? null : rexUserId);
    const homes = book.properties.filter((p) => asked.includes(String(p.listingId)));
    if (!homes.length) return NextResponse.json({ ok: false, error: ok ? "That home isn't in the book." : "That home isn't in your book." }, { status: 404 });
    if (!ok && homes.length !== asked.length) return NextResponse.json({ ok: false, error: "Some of those homes aren't in your book." }, { status: 403 });
    const label = String(b?.label ?? "").trim().slice(0, 200) || `${homes[0].name}, ${homes[0].locality}`;
    const reason = String(b?.reason ?? "").trim().slice(0, 500);
    const listingIds = homes.map((p) => String(p.listingId));
    const keys = await keysFor([...listingIds, ...homes.map((p) => String(p.propertyId ?? "")).filter(Boolean)]);
    await archiveHome({ label, keys, listingIds, reason, byName: who, byEmail: actor.email });
    await record({
      kind: "home_archived",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Archived: ${label} (${listingIds.join(", ")})${reason ? ` - ${reason}` : ""}. OS only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The home couldn't be archived just now.") }, { status: 503 });
  }
}
