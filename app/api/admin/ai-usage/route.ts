import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { AI_FEATURES, aiEffort, aiModel, costOf, priceFor, type AiFeature } from "@/lib/ai";

/**
 * What each AI feature has cost, this month and last, from os_ai_usage.
 *
 * GET /api/admin/ai-usage → { features, month, lastMonth, since }
 *
 * Months are London months from date_trunc, so the page rolls over on the 1st
 * by itself. Costs are worked out here from the tokens and the price list in
 * lib/ai.ts; nothing about price is in the page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { feature: string; model: string; calls: string; in_t: string; out_t: string; cr: string; cw: string; refused: string };

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "There is no database on this environment, so nothing has been recorded." }, { status: 503 });

  try {
    const month = `date_trunc('month', NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'`;
    const sum = (where: string) =>
      q<Row>(
        `SELECT feature, model, COUNT(*)::text calls, SUM(in_tokens)::text in_t, SUM(out_tokens)::text out_t,
                SUM(cache_read)::text cr, SUM(cache_write)::text cw,
                COUNT(*) FILTER (WHERE stop_reason = 'refusal')::text refused
           FROM os_ai_usage WHERE ${where} GROUP BY feature, model`
      );
    const [now, last, first] = await Promise.all([
      sum(`created_at >= ${month}`),
      sum(`created_at >= ${month} - INTERVAL '1 month' AND created_at < ${month}`),
      q<{ at: Date | null }>(`SELECT MIN(created_at) AS at FROM os_ai_usage`),
    ]);

    const shape = (rows: Row[]) =>
      rows.map((r) => {
        const u = { in: Number(r.in_t), out: Number(r.out_t), cacheRead: Number(r.cr), cacheWrite: Number(r.cw) };
        return { feature: r.feature, model: r.model, calls: Number(r.calls), refused: Number(r.refused), ...u, cost: costOf(r.model, u) };
      });

    return NextResponse.json({
      ok: true,
      features: (Object.keys(AI_FEATURES) as AiFeature[]).map((f) => {
        const model = aiModel(f);
        const p = priceFor(model);
        return { id: f, label: AI_FEATURES[f].label, model, effort: aiEffort(f), chosen: AI_FEATURES[f].model, perMillion: p ? { in: p.in, out: p.out } : null };
      }),
      month: shape(now),
      lastMonth: shape(last),
      since: first[0]?.at ?? null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't read the usage." }, { status: 500 });
  }
}
