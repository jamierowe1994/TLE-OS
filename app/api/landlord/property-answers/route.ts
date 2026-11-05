import { NextRequest, NextResponse } from "next/server";
import { asText, jsonObject } from "@/lib/json-body";
import { currentLandlord, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { getAppraisal } from "@/lib/appraisal-store";
import { cleanPatch, forForm, readHome, saveHome } from "@/lib/home-answers";

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

/* The home behind the appraisal, so answers given on terms sent from the listing count here too
   (lib/home-answers, 5 Nov 2026). Codes are sealed on the way in and never sent back. */
const homeOf = async (appraisalId: string) => ({ appraisalId, propertyId: (await getAppraisal(appraisalId).catch(() => null))?.rexPropertyId ?? null });

export async function GET(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const id = (req.nextUrl.searchParams.get("appraisalId") ?? "").trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, answers: forForm((await readHome(await homeOf(id))).answers) });
}

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await jsonObject(req)) as { appraisalId?: string; answers?: unknown };
  const id = asText(body.appraisalId).trim();
  if (!id || !(await landlordOwnsAppraisal(me, id))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  const patch = cleanPatch(body.answers, "landlord");
  const home = await homeOf(id);
  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: true, answers: forForm((await readHome(home)).answers) });
  }
  /* Written against the appraisal, as it always was: the most specific key the home has. */
  await saveHome({ appraisalId: id }, patch, `landlord:${me.email}`);
  return NextResponse.json({ ok: true, answers: forForm((await readHome(home)).answers) });
}
