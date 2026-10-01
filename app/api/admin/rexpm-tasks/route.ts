import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { requireCapability } from "@/lib/admin";
import { importTasks, lastImport, TASK_KINDS, type ScreenTab, type TaskKind } from "@/lib/rexpm-tasks";

/**
 * REX PM's task lists, landed in the OS (1 Oct 2026). See lib/rexpm-tasks.
 *
 *   GET  ?kind=inspection
 *        → when it was last read, the counts by state, and the open tasks
 *          that could not be tied to a home.
 *   POST { kind, open: {columns, rows}, closed: {columns, rows}, complete }
 *        → land a read. `rows` are { id, c } - the task id from its link and
 *          each cell's text in column order, as read off REX PM's list
 *          screen. `complete: true` only when both tabs were read in full.
 *
 * Owners only. Nothing here talks to REX PM: the reading is done in James's
 * browser, on REX PM's own screens, and this only receives what was read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const kindOf = (v: unknown): TaskKind | null => (TASK_KINDS as string[]).includes(String(v)) ? (v as TaskKind) : null;

const tabOf = (v: unknown): ScreenTab | undefined => {
  const t = v as ScreenTab | null;
  if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return undefined;
  return {
    columns: t.columns.map(String),
    rows: t.rows.filter((r) => r && typeof r.id === "string" && Array.isArray(r.c)).map((r) => ({ id: r.id, c: r.c.map(String) })),
  };
};

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const kind = kindOf(req.nextUrl.searchParams.get("kind") ?? "inspection");
  if (!kind) return NextResponse.json({ ok: false, error: "Unknown list." }, { status: 400 });
  const [read, counts, unmatched] = await Promise.all([
    lastImport(kind),
    q<{ state: string; n: string }>(`SELECT state, COUNT(*)::text AS n FROM os_rexpm_tasks WHERE kind = $1 GROUP BY state`, [kind]),
    q<{ id: string; address: string; managed_by: string; due_on: string | null }>(
      `SELECT id, address, managed_by, to_char(due_on, 'YYYY-MM-DD') AS due_on FROM os_rexpm_tasks WHERE kind = $1 AND state = 'open' AND os_property_id IS NULL ORDER BY address`,
      [kind]
    ),
  ]);
  return NextResponse.json({ ok: true, kind, read, counts: Object.fromEntries(counts.map((c) => [c.state, Number(c.n)])), unmatched });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { kind?: unknown; open?: unknown; closed?: unknown; complete?: unknown } | null;
  const kind = kindOf(b?.kind);
  if (!b || !kind) return NextResponse.json({ ok: false, error: "Say which list this is." }, { status: 400 });
  const open = tabOf(b.open);
  const closed = tabOf(b.closed);
  if (!open && !closed) return NextResponse.json({ ok: false, error: "Nothing to land." }, { status: 400 });
  try {
    const result = await importTasks(kind, { open, closed }, b.complete === true);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not land it." }, { status: 500 });
  }
}
