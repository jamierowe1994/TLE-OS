import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { fromEnglish, toEnglish, TranslateError } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/translate (Amrit Bhogal, 14 Oct 2026, lib/translate).
 *
 *   { text }                 their message into English, with its language named
 *   { text, to: "Polish" }   the agent's English reply into that language
 *
 * Signed-in staff only. Nothing is sent and nothing is stored: the answer goes
 * back to the screen, where the agent reads it or checks it and sends it
 * themselves.
 */
export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; to?: unknown };
  const text = typeof body.text === "string" ? body.text : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  try {
    if (to) return NextResponse.json({ ok: true, language: to, translation: await fromEnglish(text, to) });
    return NextResponse.json({ ok: true, ...(await toEnglish(text)) });
  } catch (e) {
    if (e instanceof TranslateError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Translation isn't answering just now. Try again in a minute." }, { status: 503 });
  }
}
