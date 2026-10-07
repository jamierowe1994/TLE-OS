import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { DRAFT_KINDS, draftsFor, dropDraft, saveDraft, type DraftKind } from "@/lib/property-drafts";

/**
 * Half-filled forms on a home's page (lib/property-drafts).
 *
 * GET    ?listing=<id>                                   the home's drafts, newest first
 * PUT    { id?, listingId, propertyId, kind, data }      save as it is typed
 * DELETE ?id=<draft id>                                  binned, or sent
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const listing = req.nextUrl.searchParams.get("listing")?.trim();
  if (!listing) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, drafts: [] });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, drafts: await draftsFor(listing) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the drafts." }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; listingId?: string; propertyId?: string | null; kind?: string; data?: unknown };
  if (!b.listingId || !DRAFT_KINDS.includes(b.kind as DraftKind) || !b.data || typeof b.data !== "object") {
    return NextResponse.json({ ok: false, error: "A draft needs a home, a kind and its answers." }, { status: 400 });
  }
  try {
    const draft = await saveDraft(
      { id: b.id ?? null, listingId: String(b.listingId), propertyId: b.propertyId ?? null, kind: b.kind as DraftKind, data: b.data as Record<string, unknown> },
      { id: actor.id, name: actor.name || actor.email }
    );
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not save the draft." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which draft?" }, { status: 400 });
  try {
    await dropDraft(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not bin the draft." }, { status: 502 });
  }
}
