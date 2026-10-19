import { mediaFor } from "@/lib/bug-media";
import { publicError } from "@/lib/public-error";
import { NextRequest, NextResponse } from "next/server";
import { bugShot } from "@/lib/pilot";
import { BotRefused, cronAuthorised, listToFix, record, takeQueue, tellReporter, type BotState } from "@/lib/bug-bot";
import { setBugState } from "@/lib/pilot";
import { publicOrigin } from "@/lib/origin";

/**
 * The bug bot's door (lib/bug-bot, 15 Sep 2026). Cron key only.
 *
 * GET  ?limit=3     → takes up to that many open bugs off the queue
 * GET  ?shot=<id>   → the screenshot for one, as a data URL
 * GET  ?list=to_fix → the bot's list: diagnosed, not yet fixed
 * GET  ?media=<id>  → what the person added to one: five-minute links to a recording or pictures
 * POST { id, state, note, branch, pr } → what the bot concluded
 * PUT  { id }      → marks it Fixed and tells the person who reported it, as Admin does
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const shot = req.nextUrl.searchParams.get("shot");
  if (shot) return NextResponse.json({ ok: true, shot: await bugShot(shot) });
  const media = req.nextUrl.searchParams.get("media");
  if (media) return NextResponse.json({ ok: true, media: await mediaFor(media) });
  if (req.nextUrl.searchParams.get("list") === "to_fix") return NextResponse.json({ ok: true, bugs: await listToFix() });
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 3) || 3;
  return NextResponse.json({ ok: true, bugs: await takeQueue(limit) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; state?: string; note?: string; branch?: string; pr?: string };
  if (!b.id) return NextResponse.json({ ok: false, error: "Which bug?" }, { status: 400 });
  try {
    const out = await record(b.id, { state: (b.state ?? "") as BotState, note: b.note, branch: b.branch, pr: b.pr }, publicOrigin(req));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const status = e instanceof BotRefused ? 400 : 500;
    return NextResponse.json({ ok: false, error: publicError(e, "Could not record.") }, { status });
  }
}

/* Marking a ticket Fixed from a working session (19 Oct 2026, James: "tick
   off all of the ones that have been built"). The same two steps as Admin >
   System > Tickets, so a person who reported it still gets the Fixed email;
   an SQL update would have skipped it. */
export async function PUT(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  if (!b.id) return NextResponse.json({ ok: false, error: "Which bug?" }, { status: 400 });
  try {
    await setBugState(b.id, "fixed");
    const told = await tellReporter(b.id, publicOrigin(req)).catch(() => false);
    return NextResponse.json({ ok: true, told });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not mark it fixed.") }, { status: 500 });
  }
}
