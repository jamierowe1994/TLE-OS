import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { uid } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";

/**
 * The other homes a landlord lead has, typed in on the Properties tab
 * (Howard, 24 Sep 2026). The home they enquired about is the lead's own
 * address and is not stored here. OS only: nothing is created in REX.
 */

export const dynamic = "force-dynamic";

type Row = { id: string; address: string; postcode: string; by_name: string; at: Date };
const toHome = (r: Row) => ({ id: r.id, address: r.address, postcode: r.postcode, byName: r.by_name, at: new Date(r.at).toISOString() });

async function list(leadId: string) {
  const rows = await q<Row>(
    `SELECT id, address, postcode, by_name, at FROM os_lead_properties WHERE lead_id = $1 ORDER BY at`,
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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so this cannot be saved." }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { address?: string; postcode?: string };
  const address = (body.address ?? "").trim().slice(0, 300);
  if (address.length < 6) return NextResponse.json({ ok: false, error: "Type the address of the home first." }, { status: 400 });
  const postcode =
    (body.postcode ?? "").trim().toUpperCase().slice(0, 10) ||
    (address.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0] ?? "").toUpperCase();
  const existing = await list(id);
  if (existing.some((h) => h.address.toLowerCase() === address.toLowerCase())) {
    return NextResponse.json({ ok: true, homes: existing, already: true });
  }
  const who = subject ?? actor;
  await q(
    `INSERT INTO os_lead_properties (id, lead_id, address, postcode, by_id, by_name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [uid(), id, address, postcode, who.id, who.name || who.email]
  );
  return NextResponse.json({ ok: true, homes: await list(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  const { id } = await ctx.params;
  const home = req.nextUrl.searchParams.get("home") ?? "";
  await q(`DELETE FROM os_lead_properties WHERE lead_id = $1 AND id = $2`, [id, home]);
  return NextResponse.json({ ok: true, homes: await list(id) });
}
