import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";

/**
 * The homes a tenant lead is interested in (Howard, 24 Sep 2026). Picked on
 * the new-lead screen or shortlisted from the lead's Properties tab; before
 * this the new-lead picks were dropped on save and the drawer's list lived
 * only until it closed. OS only: nothing is written to REX.
 */

export const dynamic = "force-dynamic";

type Row = { listing_id: string; name: string; locality: string; postcode: string; rent: string | null; image: string | null };
type Home = { id: string; name: string; locality: string; postcode?: string | null; rent: number | null; image: string | null };
const toHome = (r: Row): Home => ({
  id: r.listing_id, name: r.name, locality: r.locality, postcode: r.postcode || null,
  rent: r.rent == null ? null : Number(r.rent), image: r.image,
});

async function list(leadId: string): Promise<Home[]> {
  const rows = await q<Row>(
    `SELECT listing_id, name, locality, postcode, rent::text AS rent, image FROM os_lead_shortlist WHERE lead_id = $1 ORDER BY at`,
    [leadId]
  );
  return rows.map(toHome);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) return NextResponse.json({ ok: true, homes: [] });
  return NextResponse.json({ ok: true, homes: await list(id) });
}

/** Add one or more homes. Adding one already on the list changes nothing. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so this cannot be saved." }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { homes?: Partial<Home>[] };
  const homes = (body.homes ?? []).filter((h) => h && typeof h.id === "string" && h.id.trim()).slice(0, 50);
  if (!homes.length) return NextResponse.json({ ok: false, error: "No home to add." }, { status: 400 });
  const who = subject ?? actor;
  for (const h of homes) {
    const rent = typeof h.rent === "number" && Number.isFinite(h.rent) ? h.rent : null;
    await q(
      `INSERT INTO os_lead_shortlist (lead_id, listing_id, name, locality, postcode, rent, image, by_id, by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (lead_id, listing_id) DO NOTHING`,
      [id, String(h.id).slice(0, 40), String(h.name ?? "").slice(0, 300), String(h.locality ?? "").slice(0, 120),
        String(h.postcode ?? "").slice(0, 10), rent, h.image ? String(h.image).slice(0, 1000) : null, who.id, who.name || who.email]
    );
  }
  return NextResponse.json({ ok: true, homes: await list(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  const { id } = await ctx.params;
  const listing = req.nextUrl.searchParams.get("listing") ?? "";
  await q(`DELETE FROM os_lead_shortlist WHERE lead_id = $1 AND listing_id = $2`, [id, listing]);
  return NextResponse.json({ ok: true, homes: await list(id) });
}
