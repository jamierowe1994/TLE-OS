import { NextRequest, NextResponse } from "next/server";
import { FRONT_PARTS, type FrontAnswer, type FrontPart } from "@/lib/front-dash";
import {
  frontCtx,
  readAppraisals,
  readLeads,
  readLets,
  readPassports,
  readTerms,
  readViewings,
  settle,
} from "@/lib/front-dash-reads";

/**
 * GET /api/dashboard/front - the front dashboard's figures, chart and
 * pipeline (new look, 24 Oct 2026), over the last 180 London days, so the page
 * can show 7, 30 or 90 days and the change against the same length before
 * without asking again.
 *
 * ?parts=leads,appraisals (25 Oct 2026): just those parts. The page asks for
 * the quick ones (the ledger, the appraisals, passports, viewings) apart from
 * the two that wait on REX (lets, terms), so a figure shows the moment its own
 * part is read rather than when the slowest one is. No parts: all of them.
 *
 * Why its own route rather than the shared reads: the lead board carries the
 * newest 500 leads, which is about ten days of the whole business (Rig P-010),
 * and the applications board drops a let once its move-in has passed. Neither
 * can count 90 days, let alone the 90 before. So the leads are counted from
 * the ledger (os_leads, every lead on file) and lets from REX by the date they
 * were accepted - the definition Susan's June finals were checked against
 * (lib/business/rex-stats). The appraisals are counted here too (25 Oct 2026),
 * from the list the Market Appraisals screen reads, so the dashboard no longer
 * downloads that whole list to count it.
 *
 * The reads, their scoping and the rules are in lib/front-dash-reads, shared
 * with GET /api/dashboard/front/records, the list behind each figure. Each part
 * answers on its own. One that can't be read says why and carries no figure -
 * never a held or invented one. Nothing is written anywhere.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await frontCtx(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const asked = (req.nextUrl.searchParams.get("parts") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const want = new Set<FrontPart>(asked.length ? FRONT_PARTS.filter((p) => asked.includes(p)) : FRONT_PARTS);

  const [leads, appraisals, lets, terms, passports, viewings] = await Promise.all([
    want.has("leads") ? settle(readLeads(ctx), "Leads couldn't be read just now.") : undefined,
    want.has("appraisals") ? settle(readAppraisals(ctx), "Appraisals couldn't be read just now.") : undefined,
    want.has("lets") ? settle(readLets(ctx), "Lets couldn't be read just now.") : undefined,
    want.has("terms") ? settle(readTerms(ctx), "Terms couldn't be read just now.") : undefined,
    want.has("passports") ? settle(readPassports(ctx), "Passports couldn't be read just now.") : undefined,
    want.has("viewings") ? settle(readViewings(ctx), "Viewings couldn't be read just now.") : undefined,
  ]);

  const body: FrontAnswer = {
    ok: true,
    days: ctx.days,
    everything: ctx.lScope.everything,
    scopeLabel: ctx.lScope.label,
    ...(leads && { leads }),
    ...(appraisals && { appraisals }),
    ...(lets && { lets }),
    ...(terms && { terms }),
    ...(passports && { passports }),
    ...(viewings && { viewings }),
  };
  return NextResponse.json(body);
}
