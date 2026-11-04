import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicOrigin } from "@/lib/origin";
import { publicError } from "@/lib/public-error";
import { BotRefused, record } from "@/lib/bug-bot";
import { q } from "@/lib/db";
import { ClaudeRefused, claudeDoFrom, maySendToClaude, sendToClaude, ticketForClaude, ticketTokenOk } from "@/lib/claude-tickets";

/**
 * Send to Claude (lib/claude-tickets, 4 Nov 2026).
 *
 * POST { id }                     James presses Send to Claude on Tickets
 * GET  ?id=&t=<ticket token>      the routine's session reads the ticket
 * PUT  { id, t, state, note, pr, branch, reply, do }
 *                                 the session says how it went: fix_ready
 *                                 (with the pull request), needs_you, or
 *                                 not_a_bug (with the reply for the person);
 *                                 do { path, point, label } names the button
 *                                 its answer is about (Do It on Tickets)
 *
 * GET and PUT take the token minted for that one ticket, never a session or
 * the cron key: the routine runs on claude.ai and holds nothing else of ours.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor || actor.role !== "owner" || !maySendToClaude(actor.email)) return new NextResponse(null, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "Which ticket?" }, { status: 400 });
  try {
    const out = await sendToClaude(id, actor.name || actor.email, publicOrigin(req));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const status = e instanceof ClaudeRefused ? 409 : 500;
    return NextResponse.json({ ok: false, error: e instanceof ClaudeRefused ? e.message : publicError(e, "Couldn't send it to Claude.") }, { status });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ticketTokenOk(id, req.nextUrl.searchParams.get("t"))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const ticket = await ticketForClaude(id);
  if (!ticket) return NextResponse.json({ ok: false, error: "No such ticket." }, { status: 404 });
  return NextResponse.json({ ok: true, ticket });
}

export async function PUT(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    id?: unknown; t?: unknown; state?: unknown; note?: unknown; pr?: unknown; branch?: unknown; reply?: unknown; do?: unknown;
  };
  const id = typeof b.id === "string" ? b.id : "";
  if (!ticketTokenOk(id, typeof b.t === "string" ? b.t : "")) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const state = typeof b.state === "string" ? b.state : "";
  if (!["fix_ready", "needs_you", "not_a_bug"].includes(state)) {
    return NextResponse.json({ ok: false, error: "state is fix_ready, needs_you or not_a_bug." }, { status: 400 });
  }
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  try {
    const out = await record(
      id,
      { state: state as "fix_ready" | "needs_you" | "not_a_bug", note: text(b.note, 4000), pr: text(b.pr, 300), branch: text(b.branch, 200) },
      publicOrigin(req)
    );
    /* The answer for the person who asked, kept for James to send with one
       press (Send Claude's Answer on Tickets). Never sent from here: the
       person is staff, but the words are Claude's until James has read them. */
    const reply = text(b.reply, 4000);
    if (reply) await q(`UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || jsonb_build_object('claudeReply', $2::text) WHERE id = $1`, [id, reply]);
    /* The button the answer is about, or none: a later report never keeps an earlier one's. */
    const doIt = claudeDoFrom(b.do);
    await q(
      `UPDATE os_bugs SET context = CASE WHEN $2::jsonb IS NULL THEN coalesce(context, '{}'::jsonb) - 'claudeDo' ELSE coalesce(context, '{}'::jsonb) || jsonb_build_object('claudeDo', $2::jsonb) END WHERE id = $1`,
      [id, doIt ? JSON.stringify(doIt) : null]
    );
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const status = e instanceof BotRefused ? 400 : 500;
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't record that.") }, { status });
  }
}
