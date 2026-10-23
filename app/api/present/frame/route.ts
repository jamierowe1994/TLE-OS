import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { savePhotoY } from "@/lib/pre-pack";

/**
 * Where the agent's headshot sits in the pre-appraisal pack's big box
 * (lib/pre-pack, 23 Oct 2026). Dragged on the pack itself by the agent who
 * sent it, or an owner; saved onto that pack and as the agent's default for
 * the next. Staff only - the landlord's page never shows the control.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId).catch(() => null) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not saved here." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { token?: string; y?: number } | null;
  const token = String(body?.token ?? "").slice(0, 200);
  const y = Number(body?.y);
  if (!token || !Number.isFinite(y)) return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
  const row = (await q<{ author_id: string | null }>(`SELECT author_id FROM os_presentations WHERE token = $1`, [token]).catch(() => []))[0];
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  if (!(me.id === row.author_id || me.role === "owner" || me.role === "super_admin")) {
    return NextResponse.json({ ok: false, error: "Only the agent who sent it can move the photo." }, { status: 403 });
  }
  await savePhotoY(token, row.author_id ?? me.id, Math.max(-10, Math.min(45, Math.round(y * 10) / 10)), me.email);
  return NextResponse.json({ ok: true });
}
