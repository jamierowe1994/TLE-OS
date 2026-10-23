import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { readPresentation } from "@/lib/present-store";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * "Send to <agent>" on the pre-appraisal pack (lib/pre-pack, 23 Oct 2026):
 * the landlord's four answers, saved against their presentation so the agent
 * sees them in the bell before the visit.
 *
 * Public, like /api/present/opened: the token is the credential and must
 * already exist. It only ever writes this one row; nothing can be read back.
 * A member of staff trying the pack out (their session cookie comes along on
 * the same origin) gets a thank-you and nothing saved, so a test never lands
 * in an agent's bell as a landlord's answer.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: string; answers?: { q?: string; a?: string }[] } | null;
  const token = clip(body?.token, 200);
  const answers = (Array.isArray(body?.answers) ? body!.answers : [])
    .slice(0, 8)
    .map((x) => ({ q: clip(x?.q, 120), a: clip(x?.a, 120) }))
    .filter((x) => x.q && x.a);
  if (!token || !answers.length) return NextResponse.json({ ok: false, error: "Nothing to send." }, { status: 400 });
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.json({ ok: true, staff: true });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not saved here." }, { status: 503 });
  const row = await readPresentation(token);
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  await q(
    `INSERT INTO os_present_answers (token, answers, answered_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (token) DO UPDATE SET answers = EXCLUDED.answers, answered_at = NOW()`,
    [token, JSON.stringify(answers)]
  );
  return NextResponse.json({ ok: true });
}
