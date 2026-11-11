import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { createCaseStudy, listCaseStudies, websiteUrlFor } from "@/lib/case-studies";
import { caseActor, mayStart } from "@/lib/case-study-access";

/**
 * GET  /api/case-studies           - the signed-in person's case studies (everyone's for the whole-business desks)
 * POST /api/case-studies {listingId} - "Use as a case study": starts one from the listing, or opens the one already started
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const a = await caseActor(req);
  if (!a) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!a.scope.everything && !a.scope.rexUserId) return NextResponse.json({ ok: true, caseStudies: [] });
  try {
    const all = await listCaseStudies({ agentRexId: a.scope.everything ? null : a.scope.rexUserId });
    return NextResponse.json({ ok: true, caseStudies: all.map((c) => ({ ...c, websiteUrl: websiteUrlFor(c) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { listingId?: unknown };
  const listingId = body.listingId != null ? String(body.listingId).trim() : "";
  if (!/^\d+$/.test(listingId)) return NextResponse.json({ ok: false, error: "This home has no listing to start a case study from." }, { status: 400 });
  const may = await mayStart(req, listingId);
  if (!may.ok) return NextResponse.json({ ok: false, error: may.error }, { status: may.status });
  try {
    const { study, existed } = await createCaseStudy(listingId, may.by);
    return NextResponse.json({ ok: true, id: study.id, existed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 502 });
  }
}
