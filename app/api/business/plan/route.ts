import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getPlan, savePlan } from "@/lib/business/plan-store";
import { PLAN_LINES, type YearPlan } from "@/lib/business/plan-import";

/**
 * GET  /api/business/plan?year=2026 → Susan's uploaded plan, or null.
 * PUT  /api/business/plan            → replace it (body: the parsed plan).
 *
 * The browser parses and previews the sheet (lib/business/plan-import); this
 * checks the shape again before storing, because a body is not trusted for
 * having come from our own page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getUTCFullYear();
  return NextResponse.json({ plan: await getPlan(year) });
}

export async function PUT(req: NextRequest) {
  const me = await requireCapability(req, "see:business");
  if (!me) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Partial<YearPlan> | null;
  const year = Number(body?.year);
  const months = Array.isArray(body?.months) ? body!.months.filter((m) => typeof m === "string" && /^\d{4}-\d{2}$/.test(m)) : [];
  if (!year || months.length < 6 || !body?.lines || typeof body.lines !== "object") {
    return NextResponse.json({ error: "That isn't a plan this page can read." }, { status: 400 });
  }
  const known = new Set(PLAN_LINES.map((l) => l.key));
  const lines: YearPlan["lines"] = {};
  for (const [k, row] of Object.entries(body.lines)) {
    if (!known.has(k) || !row || typeof row !== "object") continue;
    lines[k] = Object.fromEntries(
      months.map((m) => {
        const v = (row as Record<string, unknown>)[m];
        return [m, typeof v === "number" && Number.isFinite(v) ? v : null];
      })
    );
  }
  if (!lines.totalIncome || !lines.totalExpenditure) {
    return NextResponse.json({ error: "The plan needs a Total Income and a Total Expenditure row." }, { status: 400 });
  }
  const basis = Object.fromEntries(
    months.map((m) => [m, body.basis?.[m] === "forecast" ? "forecast" : "actual"])
  ) as YearPlan["basis"];
  const plan: YearPlan = {
    year,
    months,
    basis,
    lines,
    fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null,
    accountsMonths: Array.isArray(body.accountsMonths) ? body.accountsMonths.filter((m) => months.includes(m)) : [],
    accountsFileName: typeof body.accountsFileName === "string" ? body.accountsFileName.slice(0, 200) : null,
    importedAt: new Date().toISOString(),
    importedBy: me.email ?? me.id,
  };
  await savePlan(plan);
  return NextResponse.json({ ok: true, plan });
}
