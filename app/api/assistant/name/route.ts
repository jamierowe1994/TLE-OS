import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { assistantNameFor, cleanAssistantName, setAssistantName } from "@/lib/assistant-name";

/**
 * What you call the assistant (lib/assistant-name).
 *
 *   GET                 { name }
 *   POST { name }       blank or "Steve" puts him back to Steve
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  return NextResponse.json({ ok: true, name: await assistantNameFor((subject ?? actor)?.id) });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "That's their choice, not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved here." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown };
  const raw = typeof b.name === "string" ? b.name.trim() : "";
  if (raw && !cleanAssistantName(raw)) return NextResponse.json({ ok: false, error: "Letters only, up to 20." }, { status: 400 });
  return NextResponse.json({ ok: true, name: await setAssistantName(actor.id, raw || null) });
}
