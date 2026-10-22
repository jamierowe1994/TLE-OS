import { NextRequest, NextResponse } from "next/server";
import { statementFor } from "@/lib/commission-statement";

/**
 * A partner's commission statement for a period, line by line, for the
 * Finances screen.
 *
 * GET ?period=this-month|last-month|tax-year|calendar-year|custom
 *     [&from=YYYY-MM-DD&to=YYYY-MM-DD] [&agent=<os user id>]
 *
 * An agent always gets their own. Owners and the office may name any agent.
 * The PDF is the sibling route /pdf; both read the same answer.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* A cold year across two calendar years is a long PayProp walk. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const a = await statementFor(req, { read: true });
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  return NextResponse.json(a);
}
