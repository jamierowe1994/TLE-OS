import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { listingIsTheirs } from "@/lib/listing-gate";
import { introKeys, isIntroOnly, setIntroKeys } from "@/lib/intro-only";
import { putInOutlook } from "@/lib/outlook-calendar";

/**
 * The keys on a marketing-only let (lib/intro-only, Sean McMahon 20 Oct 2026).
 *
 *   GET  ?listing=<id>
 *   POST { listingId, on, at, note, done, address }   a date goes in the agent's own Outlook (nobody invited)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listingId = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  return NextResponse.json({ ok: true, keys: await introKeys(listingId).catch(() => null) });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them first." }, { status: 403 });
  if (actor.role !== "agent" && !can(actor.role, "staff:internal")) return NextResponse.json({ ok: false, error: "This is for the listing's agent." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { listingId?: unknown; on?: unknown; at?: unknown; note?: unknown; done?: unknown; address?: unknown };
  const listingId = typeof b.listingId === "string" || typeof b.listingId === "number" ? String(b.listingId) : "";
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (/^\d+$/.test(listingId)) {
    const notTheirs = await listingIsTheirs(actor, Number(listingId)).catch(() => "That listing could not be read just now. Try again in a minute.");
    if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  }
  if (!(await isIntroOnly(listingId))) return NextResponse.json({ ok: false, error: "This home isn't marketing only." }, { status: 409 });
  const on = b.on === true;
  const before = await introKeys(listingId).catch(() => null);
  /* Anything not sent is kept as it was: "Keys handed over" sends no date. */
  const given = typeof b.at === "string" && b.at ? new Date(b.at) : null;
  if (given && Number.isNaN(given.valueOf())) return NextResponse.json({ ok: false, error: "That date didn't make sense." }, { status: 400 });
  const at = b.at === undefined ? before?.at ?? null : given ? given.toISOString() : null;
  const note = typeof b.note === "string" ? b.note.trim() : before?.note ?? "";
  const done = b.done === undefined ? Boolean(before?.doneAt) : b.done === true;
  const keys = await setIntroKeys(listingId, { on, at, note, done, by: actor.name || actor.email });

  /* The date in their own diary, so they're there to hand them over. */
  let diary: string | null = null;
  if (on && at && at !== before?.at && !keys?.doneAt) {
    const address = typeof b.address === "string" ? b.address.trim().slice(0, 200) : "";
    const put = await putInOutlook({
      userId: actor.id,
      key: `intro-keys|${listingId}`,
      subject: `Key handover${address ? ` - ${address}` : ""}`,
      body: `Hand over the keys for ${address || "the home"} (marketing only).${keys?.note ? ` ${keys.note}` : ""}`,
      location: address,
      startsAt: at,
      minutes: 30,
    }).catch(() => null);
    diary = put?.ok ? "In your Outlook diary." : put ? `Not in your Outlook diary: ${put.detail}` : "Not in your Outlook diary.";
  }
  return NextResponse.json({ ok: true, keys, diary });
}
