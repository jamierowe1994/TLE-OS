import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { readAnswers, saveAnswers } from "@/lib/property-answers-store";
import { PROPERTY_QUESTIONS, type Answers } from "@/lib/property-questions";

/**
 * The landlord's answers about their own property.
 *
 *   GET  ?appraisalId=… → what they have said so far
 *   POST { appraisalId, answers } → merges a few more in
 *
 * ── Only their own file, checked on every verb ────────────────────────────
 *
 * `landlordOwnsAppraisal` is asked on both. A landlord with a valid session
 * and somebody else's appraisal id would otherwise be reading - and writing -
 * a stranger's stopcock, their spare-key arrangement and who to ring when they
 * are away. That is a burglary kit, not a form.
 *
 * ── Only keys the questionnaire actually has ──────────────────────────────
 *
 * The payload is filtered against PROPERTY_QUESTIONS before it is stored, so a
 * crafted request cannot stuff arbitrary JSON into the case state that the
 * agent's own screens read from.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KNOWN = new Set(PROPERTY_QUESTIONS.flatMap((s) => s.questions.map((question) => question.id)));

export async function GET(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const id = (req.nextUrl.searchParams.get("appraisalId") ?? "").trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, answers: await readAnswers(id) });
}

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { appraisalId?: string; answers?: Answers };
  const id = (body.appraisalId ?? "").trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  const patch: Answers = {};
  for (const [k, v] of Object.entries(body.answers ?? {})) {
    if (!KNOWN.has(k)) continue;
    if (typeof v === "string") patch[k] = v.slice(0, 2000);
    else if (Array.isArray(v)) patch[k] = v.filter((x): x is string => typeof x === "string").slice(0, 20);
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: true, answers: await readAnswers(id) });
  }

  return NextResponse.json({ ok: true, answers: await saveAnswers(id, patch, `landlord:${me.email}`) });
}
