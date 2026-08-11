import { NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";

/**
 * The OS's own state on a record — the appraisal sub-case on a lead, the
 * landlord–property–tenant link on a listing.
 *
 * These are things REX has no field for, so they live here rather than being
 * squeezed into a note. Read one, write one; the key is (kind, record_id) and
 * a write is an upsert, so a record can never end up holding two versions of
 * itself.
 *
 * With no database configured this answers politely with nothing rather than
 * failing: the OS demos on machines that have never seen Postgres, and a
 * missing database should cost you persistence, not the page.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set(["appraisal", "tenancy-link"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!KINDS.has(kind) || !id) {
    return NextResponse.json({ error: "kind and id are required." }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ stored: false, payload: null });

  try {
    const rows = await q<{ payload: unknown; updated_at: Date }>(
      "SELECT payload, updated_at FROM os_case_state WHERE kind = $1 AND record_id = $2",
      [kind, id]
    );
    return NextResponse.json({
      stored: true,
      payload: rows[0]?.payload ?? null,
      updatedAt: rows[0]?.updated_at ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { stored: false, payload: null, error: e instanceof Error ? e.message : "read failed" },
      { status: 200 }
    );
  }
}

export async function POST(req: Request) {
  let body: { kind?: string; id?: string; payload?: unknown; by?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const kind = body.kind ?? "";
  const id = body.id ?? "";
  if (!KINDS.has(kind) || !id || body.payload == null) {
    return NextResponse.json({ error: "kind, id and payload are required." }, { status: 400 });
  }
  if (!hasDb()) {
    // Say so plainly. A screen that thinks it saved and didn't is worse than
    // one that knows it can't.
    return NextResponse.json({ saved: false, reason: "No database on this environment." });
  }

  try {
    await q(
      `INSERT INTO os_case_state (kind, record_id, payload, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (kind, record_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [kind, id, JSON.stringify(body.payload), body.by ?? ""]
    );
    return NextResponse.json({ saved: true });
  } catch (e) {
    return NextResponse.json(
      { saved: false, error: e instanceof Error ? e.message : "write failed" },
      { status: 500 }
    );
  }
}
