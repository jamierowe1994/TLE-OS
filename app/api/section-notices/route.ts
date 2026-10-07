import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { noticesForHome, startNotice } from "@/lib/section-notices";
import { asAnswers, isKind } from "@/lib/section-notices-spec";

/**
 * A home's Section 13 and Section 8 notices (lib/section-notices).
 *
 * GET  ?listing=<id>   → every notice on the home, newest first.
 * POST { kind, listingId, propertyId, propertyLabel, answers, test }
 *                      → a new draft, or the one already open on the home
 *                        (`existing: true`), so a second press never makes
 *                        a second copy.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listing = req.nextUrl.searchParams.get("listing") ?? "";
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, notices: [] });
  try {
    return NextResponse.json({ ok: true, stored: true, notices: await noticesForHome(listing) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the notices." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (subject && subject.id !== actor.id) {
    return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Switch back to start one in your own name." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be kept." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as {
    kind?: string; listingId?: string; propertyId?: string | null; propertyLabel?: string; answers?: unknown; test?: boolean;
  };
  if (!isKind(b.kind)) return NextResponse.json({ ok: false, error: "Section 13 or Section 8?" }, { status: 400 });
  const listingId = String(b.listingId ?? "").trim();
  if (!listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const { notice, existing } = await startNotice({
      kind: b.kind,
      listingId,
      propertyId: b.propertyId ? String(b.propertyId) : null,
      propertyLabel: String(b.propertyLabel ?? "").trim() || "Unnamed home",
      answers: asAnswers(b.answers),
      test: b.test === true,
      by: { id: actor.id, name: actor.name || actor.email, email: actor.email },
    });
    return NextResponse.json({ ok: true, notice, existing });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not start it." }, { status: 502 });
  }
}
