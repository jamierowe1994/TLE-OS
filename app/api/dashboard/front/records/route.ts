import { NextRequest, NextResponse } from "next/server";
import { RANGES, RECORD_KINDS, SOURCE_BUCKETS, type FrontRecord, type FrontRecords, type RecordKind, type SourceBucket } from "@/lib/front-dash";
import {
  Say,
  appraisalRecords,
  frontCtx,
  leadRecords,
  letRecords,
  passportRecords,
  termRecords,
  viewingRecords,
} from "@/lib/front-dash-reads";

/**
 * GET /api/dashboard/front/records - the records behind a front dashboard
 * figure (new look, 25 Oct 2026). James: "if I click into a new lead, I
 * should be able to click into that... click into the terms and then see
 * which ones are outstanding."
 *
 *   kind     leads | tenant | appraisals | terms | lets | applied | passports | viewings
 *   days     7 | 30 | 90: the last that many London days, today included
 *   day      YYYY-MM-DD: one London day instead (a bar on the leads chart)
 *   source   rightmove | zoopla | otm | website | other (leads and tenant only)
 *   offset   paging, 200 at a time
 *
 * Read by the same functions, with the same scoping, as the figures
 * (lib/front-dash-reads): `total` is always the figure the dashboard shows for
 * the same kind and days. Terms are "now", not a range: every set still out.
 * Never a phone number or an email in a row.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = 200;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error } satisfies FrontRecords, { status });

export async function GET(req: NextRequest) {
  const ctx = await frontCtx(req);
  if (!ctx) return bad("Sign in first.", 401);
  const sp = req.nextUrl.searchParams;

  const kind = sp.get("kind") as RecordKind | null;
  if (!kind || !RECORD_KINDS.includes(kind)) return bad("Which list? kind is missing.");

  /* The days: one London day of the window, or the last 7, 30 or 90. */
  const { days } = ctx;
  let from: string;
  let to: string;
  const day = sp.get("day");
  if (day) {
    if (!days.includes(day)) return bad("That day is outside the last 180.");
    from = to = day;
  } else {
    const n = Number(sp.get("days") ?? 30);
    if (!(RANGES as readonly number[]).includes(n)) return bad("days is 7, 30 or 90.");
    from = days[days.length - n];
    to = days[days.length - 1];
  }
  const rawSource = sp.get("source");
  const source = rawSource && SOURCE_BUCKETS.some((b) => b.id === rawSource) ? (rawSource as SourceBucket) : null;
  const offset = Math.max(0, Math.floor(Number(sp.get("offset") ?? 0)) || 0);

  let rows: FrontRecord[];
  let lateAfterDays: number | undefined;
  try {
    switch (kind) {
      case "leads":
        rows = await leadRecords(ctx, from, to, { source });
        break;
      case "tenant":
        rows = await leadRecords(ctx, from, to, { tenant: true, source });
        break;
      case "appraisals":
        rows = await appraisalRecords(ctx, from, to);
        break;
      case "terms": {
        const t = await termRecords(ctx);
        rows = t.rows;
        lateAfterDays = t.lateAfterDays;
        break;
      }
      case "lets":
        rows = await letRecords(ctx, "agreed", from, to);
        break;
      case "applied":
        rows = await letRecords(ctx, "applied", from, to);
        break;
      case "passports":
        rows = await passportRecords(ctx, from, to);
        break;
      case "viewings":
        rows = await viewingRecords(ctx, from, to);
        break;
    }
  } catch (e) {
    /* The part's own plain reason, never a system's error text (agent screens
       never name the system behind them). */
    return NextResponse.json({ ok: false, error: e instanceof Say ? e.message : "That list couldn't be read just now." } satisfies FrontRecords);
  }

  const body: FrontRecords = {
    ok: true,
    kind,
    from: kind === "terms" ? null : from,
    to: kind === "terms" ? null : to,
    total: rows.length,
    rows: rows.slice(offset, offset + PAGE),
    offset,
    more: offset + PAGE < rows.length,
    everything: kind === "appraisals" ? true : ctx.lScope.everything,
    ...(lateAfterDays != null && { lateAfterDays }),
  };
  return NextResponse.json(body);
}
