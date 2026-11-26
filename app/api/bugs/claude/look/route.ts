import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { ticketTokenOk } from "@/lib/claude-tickets";
import { LookRefused, lookUp, lookUpMenu, LOOK_CAP } from "@/lib/claude-ticket-look";

/**
 * Live look-ups for a Claude ticket run (lib/claude-ticket-look, 26 Nov 2026).
 *
 * GET  ?id=&t=<ticket token>          which look-ups there are and what each takes
 * POST { id, t, tool, input }         ask one; read only, as the person who sent it
 *
 * The same per-ticket token as /api/bugs/claude, and only while the ticket is
 * with Claude. scripts/claude-ticket.mjs `look` calls it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ticketTokenOk(id, req.nextUrl.searchParams.get("t"))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, cap: LOOK_CAP, lookUps: lookUpMenu() });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; t?: unknown; tool?: unknown; input?: unknown };
  const id = typeof b.id === "string" ? b.id : "";
  if (!ticketTokenOk(id, typeof b.t === "string" ? b.t : "")) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const tool = typeof b.tool === "string" ? b.tool.trim() : "";
  const input = b.input && typeof b.input === "object" && !Array.isArray(b.input) ? (b.input as Record<string, unknown>) : {};
  try {
    return NextResponse.json({ ok: true, tool, answer: await lookUp(id, tool, input) });
  } catch (e) {
    const refused = e instanceof LookRefused;
    return NextResponse.json({ ok: false, error: refused ? e.message : publicError(e, "That look-up failed.") }, { status: refused ? 409 : 500 });
  }
}
