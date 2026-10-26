import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { packQuestionsFor } from "@/lib/pre-pack";
import {
  DEFAULT_PACK_QUESTIONS, PACK_Q_LIMITS, PRE_PACK_QUESTIONS_PREF, checkQuestions, isDefaultQuestions, tidyQuestions,
} from "@/lib/pre-pack-questions";

/**
 * A person's own pre-appraisal questions (Profile > Pre-appraisal, 26 Oct
 * 2026 team call; lib/pre-pack-questions).
 *
 *   GET     theirs (the defaults until they change them), the defaults, the limits
 *   PUT     { show, questions }  tidied and checked, then saved
 *   DELETE  back to the defaults, slide on
 *
 * Saved by the person it belongs to: refused while an owner is viewing as
 * them, the same line app/api/me/viewing-text draws.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BY_THEM = "Stop viewing as somebody first. Questions are set by the person they belong to.";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  const me = subject ?? actor;
  if (!actor || !me) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const setting = await packQuestionsFor(me.id);
  return NextResponse.json({ ok: true, ...setting, defaults: DEFAULT_PACK_QUESTIONS, limits: PACK_Q_LIMITS, readOnly: Boolean(subject && subject.id !== actor.id) });
}

export async function PUT(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: BY_THEM }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { show?: unknown; questions?: unknown };
  const show = body.show !== false;
  const questions = tidyQuestions(body.questions);
  const problems = checkQuestions(questions);
  if (problems.length) return NextResponse.json({ ok: false, error: problems.join(" ") }, { status: 400 });
  /* The defaults with the slide on is no change at all: no row, so a later
     change to the defaults reaches them (the viewing text does the same). */
  if (show && isDefaultQuestions(questions)) {
    await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [actor.id, PRE_PACK_QUESTIONS_PREF]);
  } else {
    /* On the defaults with the slide off: keep only the switch, so they still follow the defaults. */
    const value = { show, ...(isDefaultQuestions(questions) ? {} : { questions }), updatedAt: new Date().toISOString() };
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [actor.id, PRE_PACK_QUESTIONS_PREF, JSON.stringify(value)]
    );
  }
  return NextResponse.json({ ok: true, ...(await packQuestionsFor(actor.id)) });
}

export async function DELETE(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: BY_THEM }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [actor.id, PRE_PACK_QUESTIONS_PREF]);
  return NextResponse.json({ ok: true, ...(await packQuestionsFor(actor.id)) });
}
