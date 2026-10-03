import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor, searchScope } from "@/lib/scope";
import { bookPhoneProperties, searchPhoneProperties } from "@/lib/m-properties";

export type { PhoneProperty } from "@/lib/m-properties";

/**
 * GET /api/m/properties?q=… → a property (?all=1 → the agent's whole book), and the few facts an agent needs
 * standing outside it. The phone view (16 Sep 2026). READ ONLY, scoped the
 * same way as Listings: an agent sees their own stock (lib/m-properties).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (!all && needle.length < 2) return NextResponse.json({ ok: true, properties: [] });
  const scope = await scopeFor(req);
  const mine = await searchScope(req, scope);
  if (mine === false) return NextResponse.json({ ok: true, properties: [] });

  /* ?all=1 - the whole book for the app's Properties tab (3 Oct 2026). */
  if (all) {
    const book = await bookPhoneProperties(mine);
    if (!book) return NextResponse.json({ ok: false, error: "The property book did not load. Try again in a moment." }, { status: 502 });
    return NextResponse.json({ ok: true, properties: book });
  }
  const out = await searchPhoneProperties(mine, needle);
  if (!out) {
    return NextResponse.json({ ok: false, error: "The property book did not load. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, properties: out });
}
