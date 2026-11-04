import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { ClaudeRefused, maySendToClaude, pushClaudeFix } from "@/lib/claude-tickets";

/**
 * Push It Live on Tickets (lib/claude-tickets pushClaudeFix, 4 Nov 2026).
 *
 * POST { id }   merges the pull request Claude opened for that ticket into
 *               main. The same person as Send to Claude, and nobody else:
 *               this puts code live.
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
    const out = await pushClaudeFix(id, actor.name || actor.email);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const status = e instanceof ClaudeRefused ? 409 : 500;
    return NextResponse.json({ ok: false, error: e instanceof ClaudeRefused ? e.message : publicError(e, "Couldn't push it.") }, { status });
  }
}
