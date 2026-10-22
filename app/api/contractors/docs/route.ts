import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { getContractor } from "@/lib/works-orders";
import { isDocKind, type ContractorDoc } from "@/lib/contractor-docs-shared";

/**
 * A contractor's own paperwork (lib/contractor-docs-shared, 20 Oct 2026).
 * The file is uploaded first through /api/r2/upload (scope document, ref
 * contractor-<id>); this keeps what it is and when it runs out.
 *
 *   GET    ?contractor=<id>
 *   POST   { contractorId, kind, key, name, expires?, number? }
 *   DELETE ?id=<doc id>
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { id: string; kind: string; name: string; r2_key: string; expires: string | null; number: string; added_by: string; added_at: Date };
const shape = (r: Row): ContractorDoc => ({ id: r.id, kind: isDocKind(r.kind) ? r.kind : "other", name: r.name, key: r.r2_key, expires: r.expires ? String(r.expires).slice(0, 10) : null, number: r.number, by: r.added_by, at: new Date(r.added_at).toISOString() });

async function list(contractorId: string): Promise<ContractorDoc[]> {
  const rows = await q<Row>(
    `SELECT id, kind, name, r2_key, expires::text AS expires, number, added_by, added_at FROM os_contractor_docs
      WHERE contractor_id = $1 AND removed_at IS NULL ORDER BY added_at DESC`,
    [contractorId]
  );
  return rows.map(shape);
}

/** The company's contractors and your own, as the book shows them; the office sees everyone's. */
async function gate(req: NextRequest, contractorId: string) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return { error: "Sign in first.", status: 401 } as const;
  const me = subject ?? actor;
  const c = await getContractor(contractorId);
  if (!c) return { error: "That contractor isn't there.", status: 404 } as const;
  if (c.ownerId && c.ownerId !== me.id && !can(me.role, "see:everything")) return { error: "That contractor isn't in your book.", status: 403 } as const;
  return { me, c } as const;
}

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, docs: [] });
  const id = (req.nextUrl.searchParams.get("contractor") ?? "").trim();
  const g = await gate(req, id);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  return NextResponse.json({ ok: true, docs: await list(id) });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { contractorId?: unknown; kind?: unknown; key?: unknown; name?: unknown; expires?: unknown; number?: unknown };
  const id = typeof b.contractorId === "string" ? b.contractorId : "";
  const g = await gate(req, id);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  if (!isDocKind(b.kind)) return NextResponse.json({ ok: false, error: "What kind of document is it?" }, { status: 400 });
  const key = typeof b.key === "string" ? b.key : "";
  if (!key.startsWith(`documents/contractor-${id}/`)) return NextResponse.json({ ok: false, error: "Upload the file first." }, { status: 400 });
  const expires = typeof b.expires === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expires) ? b.expires : null;
  await q(
    `INSERT INTO os_contractor_docs (id, contractor_id, kind, name, r2_key, expires, number, added_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), id, b.kind, typeof b.name === "string" ? b.name.slice(0, 200) : "", key, expires, typeof b.number === "string" ? b.number.trim().slice(0, 60) : "", g.me.name || g.me.email]
  );
  return NextResponse.json({ ok: true, docs: await list(id) });
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  const docId = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const [row] = await q<{ contractor_id: string }>(`SELECT contractor_id FROM os_contractor_docs WHERE id = $1 AND removed_at IS NULL`, [docId]);
  if (!row) return NextResponse.json({ ok: false, error: "That document isn't there." }, { status: 404 });
  const g = await gate(req, row.contractor_id);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  await q(`UPDATE os_contractor_docs SET removed_at = NOW() WHERE id = $1`, [docId]);
  return NextResponse.json({ ok: true, docs: await list(row.contractor_id) });
}
