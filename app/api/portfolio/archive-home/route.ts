import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { record } from "@/lib/audit";
import { managedBookFor } from "@/lib/managed-book-cache";
import { archiveHome, archiveOf, archivedHomes, keysFor, putBack } from "@/lib/archived-homes";
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
 * For whoever holds archive:homes (Michael, the owners), as themselves.
 * Nothing is written to REX or REX PM: lib/archived-homes takes the homes off
 * every read. Every change is audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function allowed(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  return { actor, ok: Boolean(actor && can(actor.role, "archive:homes") && !who?.viewingAs) };
}

export async function GET(req: NextRequest) {
  const { actor, ok } = await allowed(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!ok) return NextResponse.json({ ok: true, canArchive: false, homes: [], archived: null });
  const listing = req.nextUrl.searchParams.get("listing")?.trim();
  try {
    if (listing) return NextResponse.json({ ok: true, canArchive: true, archived: await archiveOf(listing) }, { headers: { "cache-control": "private, no-store" } });
    return NextResponse.json({ ok: true, canArchive: true, homes: await archivedHomes() }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The archive couldn't be read just now.") }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, ok } = await allowed(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!ok) return NextResponse.json({ ok: false, error: "Archiving a home is for Michael and the owners." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { listingIds?: unknown; label?: unknown; reason?: unknown; putBack?: unknown } | null;
  const who = actor.name || actor.email;

  try {
    if (typeof b?.putBack === "string" && b.putBack) {
      const back = await putBack(b.putBack, who);
      if (!back) return NextResponse.json({ ok: false, error: "That home isn't archived any more." }, { status: 404 });
      await record({ kind: "home_archived", actorId: actor.id, actorEmail: actor.email, detail: `Put back: ${back.label}. OS only, not REX.` }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    const asked = Array.isArray(b?.listingIds) ? [...new Set(b.listingIds.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 60) : [];
    if (!asked.length) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
    const { book } = await managedBookFor(null);
    const homes = book.properties.filter((p) => asked.includes(String(p.listingId)));
    if (!homes.length) return NextResponse.json({ ok: false, error: "That home isn't in the book." }, { status: 404 });
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
