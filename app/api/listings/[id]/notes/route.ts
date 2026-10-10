import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";

/**
 * Notes on a listing (10 Oct 2026). James: "we don't have a notes column,
 * which isn't great on listings". The team's own notes, kept in os_notes
 * (record_type 'listing'), newest first. They stay in the OS: nothing is
 * written to REX.
 *
 *   GET          the notes
 *   POST { body } add one
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { id: string; body: string; author_name: string; created_at: string | Date };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const rows = await q<Row>(
    `SELECT id, body, author_name, created_at FROM os_notes WHERE record_type = 'listing' AND record_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [id]
  );
  return NextResponse.json({ ok: true, notes: rows.map((r) => ({ id: r.id, body: r.body, author: r.author_name, at: new Date(r.created_at).toISOString() })) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first, so the note is in your name." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { body?: unknown };
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 5000) : "";
  if (!body) return NextResponse.json({ ok: false, error: "The note is empty." }, { status: 400 });
  const me = subject ?? actor;
  const row = { id: randomUUID(), at: new Date().toISOString() };
  await q(
    `INSERT INTO os_notes (id, record_type, record_id, body, author_id, author_name, created_at) VALUES ($1, 'listing', $2, $3, $4, $5, $6)`,
    [row.id, id, body, me.id, me.name, row.at]
  );
  return NextResponse.json({ ok: true, note: { id: row.id, body, author: me.name, at: row.at } });
}
