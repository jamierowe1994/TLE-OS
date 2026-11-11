import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { markNotice, pendingNotices, reopenFromSteve } from "@/lib/ticket-fixed";
import { publicOrigin } from "@/lib/origin";

/**
 * Steve's "we've fixed it" messages for the person signed in (lib/ticket-fixed,
 * 9 Nov 2026).
 *
 *   GET                              → { notices }  their fixed tickets Steve hasn't shown yet
 *   POST { id, action: "seen" }      → shown, nothing else
 *   POST { id, action: "sorted" }    → "Sorted, thanks"
 *   POST { id, action: "reopen", text } → "It's still happening": the ticket is open again with their words
 *
 * Only ever the signer's own tickets. Viewing as somebody else shows nothing,
 * so James never clears another person's message by looking.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor || viewingAs) return NextResponse.json({ ok: true, notices: [] });
  const notices = await pendingNotices(actor).catch(() => []);
  return NextResponse.json({ ok: true, notices }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as them first." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown; text?: unknown };
  const id = typeof b.id === "string" ? b.id : "";
  const action = typeof b.action === "string" ? b.action : "";
  if (!id) return NextResponse.json({ ok: false, error: "Which ticket?" }, { status: 400 });
  if (action === "seen" || action === "sorted") {
    const ok = await markNotice(id, actor, action).catch(() => false);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (action === "reopen") {
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) return NextResponse.json({ ok: false, error: "Say what's still happening." }, { status: 400 });
    const ok = await reopenFromSteve(id, actor, text, publicOrigin(req)).catch(() => false);
    return NextResponse.json({ ok, ...(ok ? {} : { error: "That didn't go. Try again in a minute." }) }, { status: ok ? 200 : 409 });
  }
  return NextResponse.json({ ok: false, error: "seen, sorted or reopen." }, { status: 400 });
}
