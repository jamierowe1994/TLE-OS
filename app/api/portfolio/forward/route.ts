import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getOsProperty } from "@/lib/os-properties";

/**
 * GET /api/portfolio/forward?listing=pm-… - where an OS home record now lives
 * (James, 27 Oct 2026, 33 Eastfield Road: Lorna's tab held the home's REX PM
 * record, which has no tenancy, after the let itself had joined Portfolio).
 * Answers only which REX property the record is tied to; the home's page finds
 * the let for that property in the person's own book, so nothing outside it is
 * ever named here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  if (!/^pm-[\w-]{4,80}$/.test(id)) return NextResponse.json({ ok: true, rexPropertyId: null });
  const home = await getOsProperty(id).catch(() => null);
  return NextResponse.json({ ok: true, rexPropertyId: home?.rexPropertyId ?? null });
}
