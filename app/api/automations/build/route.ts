import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { buildFromChat, type ChatTurn } from "@/lib/automations/builder";
import { clean } from "@/lib/automations/catalogue";
import { caller } from "@/lib/automations/http";

/**
 * The chat builder: { turns, current? } → a draft for the editor. Saves
 * nothing and switches nothing on (lib/automations/builder).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { turns?: ChatTurn[]; current?: unknown };
  const turns = (Array.isArray(b.turns) ? b.turns : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
    .map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }));
  if (!turns.some((t) => t.role === "user")) return NextResponse.json({ error: "Say what you'd like it to do." }, { status: 400 });
  try {
    const r = await buildFromChat({ me: who.me, turns, current: b.current ? clean(b.current) : null });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, "Steve couldn't build that just now.") }, { status: 502 });
  }
}
