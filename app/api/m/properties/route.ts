import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { searchPhoneProperties } from "@/lib/m-properties";

export type { PhoneProperty } from "@/lib/m-properties";

/**
 * GET /api/m/properties?q=… → a property, and the few facts an agent needs
 * standing outside it. The phone view (16 Sep 2026). READ ONLY, scoped the
 * same way as Listings: an agent sees their own stock (lib/m-properties).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (needle.length < 2) return NextResponse.json({ ok: true, properties: [] });
  const scope = await scopeFor(req);
  const out = await searchPhoneProperties(scope.unlinked ? null : scope.rexUserId, needle);
  if (!out) {
    return NextResponse.json({ ok: false, error: "The property book did not load. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, properties: out });
}
