import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";

/**
 * Notes on a home in Portfolio (20 Oct 2026). Sean McMahon: "if I've got an
 * email come from a tenant or I've got a query and I need to make notes, I
 * can't add any notes to the file."
 *
 * Kept in os_notes against the property (record_type 'property'), so they
 * stay with the home from one let to the next; /api/property/people already
 * reads an access note from the same place. The current listing's own notes
 * (the listing drawer, Steve's Save) are shown beside them, marked as such.
 * OS only: nothing is written to REX.
 *
 *   GET  ?property=<id>&listing=<id>   the notes, newest first
 *   POST { property, body }            add one
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { id: string; body: string; author_name: string; created_at: string | Date; record_type: string };

const isId = (v: string) => /^[A-Za-z0-9-]{1,80}$/.test(v);

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  const listing = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  if (!isId(property) && !isId(listing)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const rows = await q<Row>(
    `SELECT id, body, author_name, created_at, record_type FROM os_notes
      WHERE (record_type = 'property' AND record_id = $1) OR (record_type = 'listing' AND record_id = $2)
      ORDER BY created_at DESC LIMIT 200`,
    [isId(property) ? property : "", isId(listing) ? listing : ""]
  );
  return NextResponse.json({
    ok: true,
    notes: rows.map((r) => ({ id: r.id, body: r.body, author: r.author_name, at: new Date(r.created_at).toISOString(), onListing: r.record_type === "listing" })),
  });
}

export async function POST(req: NextRequest) {
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first, so the note is in your name." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { property?: unknown; body?: unknown };
  const property = typeof b.property === "string" ? b.property.trim() : "";
  if (!isId(property)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 5000) : "";
  if (!body) return NextResponse.json({ ok: false, error: "The note is empty." }, { status: 400 });
  const me = subject ?? actor;
  const row = { id: randomUUID(), at: new Date().toISOString() };
  await q(
    `INSERT INTO os_notes (id, record_type, record_id, body, author_id, author_name, created_at) VALUES ($1, 'property', $2, $3, $4, $5, $6)`,
    [row.id, property, body, me.id, me.name, row.at]
  );
  return NextResponse.json({ ok: true, note: { id: row.id, body, author: me.name, at: row.at, onListing: false } });
}
