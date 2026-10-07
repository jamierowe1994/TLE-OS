import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";

/**
 * ONE LISTING'S OFFERS (7 Oct 2026, Howard: "I still can't find how to make
 * an offer").
 *
 * Every offer saved against this listing - the ones an agent put forward
 * (lib/agent-offer) and the ones a tenant made themselves - newest first, so
 * the listing's Applications tab shows the offer the moment it is in. Each
 * opens on /offers/<id>. Staff only, read only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { id: string; name: string; email: string; payload: { amount?: number; moveIn?: string; recordedBy?: { name?: string } }; created_at: Date };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!/^-?\d+$/.test(listingId)) return NextResponse.json({ ok: false, error: "Which listing?", offers: [] }, { status: 400 });

  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  if (!actor || !can(actor.role, "staff:internal")) return NextResponse.json({ ok: false, error: "Sign in first.", offers: [] }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, offers: [] });

  try {
    const rows = await q<Row>(
      `SELECT id, name, email, payload, created_at FROM os_tenant_viewing_responses
        WHERE listing_id = $1 AND kind = 'offer' ORDER BY created_at DESC LIMIT 50`,
      [listingId]
    );
    const offers = rows.map((r) => ({
      id: r.id,
      name: r.name || r.email,
      amount: typeof r.payload?.amount === "number" ? r.payload.amount : null,
      moveIn: r.payload?.moveIn ?? null,
      by: r.payload?.recordedBy?.name ?? null,
      at: new Date(r.created_at).toISOString(),
    }));
    return NextResponse.json({ ok: true, offers });
  } catch (e) {
    console.error("listing offers failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't read the offers.", offers: [] }, { status: 500 });
  }
}
