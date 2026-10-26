import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import type { ChaseNext, WorksChase } from "@/lib/works-chase-rules";

/**
 * The chase on a job, read and stopped (os_works_chases, Sean McMahon, 26 Oct
 * 2026). Only the database here, so lib/works-orders can stop a chase the
 * moment a move says the contractor has come back without importing the
 * sending half (lib/works-chase), which imports lib/works-orders.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export function toChase(r: Row): WorksChase {
  const next = String(r.next_kind ?? "");
  return {
    contractorId: String(r.contractor_id ?? ""),
    contractorName: String(r.contractor_name ?? ""),
    firstDays: r.first_days == null ? null : Number(r.first_days),
    finalDays: r.final_days == null ? null : Number(r.final_days),
    setAt: iso(r.set_at) ?? new Date().toISOString(),
    setBy: String(r.set_by ?? ""),
    nextKind: next === "reminder" || next === "final" || next === "silent" ? (next as ChaseNext) : null,
    nextAt: iso(r.next_at),
    remindedAt: iso(r.reminded_at),
    finalAt: iso(r.final_at),
    silentAt: iso(r.silent_at),
    stoppedAt: iso(r.stopped_at),
    stoppedWhy: String(r.stopped_why ?? ""),
  };
}

export async function chaseOf(orderId: string): Promise<WorksChase | null> {
  if (!hasDb()) return null;
  const [r] = await q<Row>(`SELECT * FROM os_works_chases WHERE order_id = $1`, [orderId]).catch(() => []);
  return r ? toChase(r) : null;
}

/** Stop a running chase, and say so on the job's timeline. Nothing if none is running. */
export async function stopChase(orderId: string, why: string, by = "TLE OS"): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ contractor_name: string }>(
    `UPDATE os_works_chases SET stopped_at = NOW(), stopped_why = $2, next_kind = NULL, next_at = NULL
      WHERE order_id = $1 AND stopped_at IS NULL RETURNING contractor_name`,
    [orderId, why]
  ).catch(() => []);
  if (!rows.length) return false;
  await q(`INSERT INTO os_works_order_events (id, order_id, by_name, kind, text) VALUES ($1, $2, $3, 'chase', $4)`, [
    uid(), orderId, by, `Stopped chasing ${rows[0].contractor_name || "the contractor"}: ${why.replace(/\.+$/, "")}.`,
  ]).catch(() => null);
  return true;
}

/**
 * The contractor has come back, or the job has moved on without them: the
 * chase stops on its own (Sean, 26 Oct 2026). Called by moveOrder after every
 * move, with the job as it was and as it is now. `by` is the contractor's own
 * name when the move came from their page.
 */
export async function stopChaseOnMove(
  before: { id: string; contractorName: string },
  after: { contractorId: string | null; contractorName: string; status: string },
  action: string,
  file: { kind?: string } | null,
  by: string
): Promise<void> {
  const c = await chaseOf(before.id);
  if (!c || c.stoppedAt) return;
  const name = c.contractorName || before.contractorName || "The contractor";
  const fromThem = !!by && (by === c.contractorName || by === before.contractorName);
  let why: string | null = null;
  switch (action) {
    case "schedule": why = fromThem ? "they gave a date" : "a date was set"; break;
    case "done": why = fromThem ? "they marked it done" : "it was marked done"; break;
    case "invoice": why = "their invoice is in"; break;
    case "contractor_confirmed": why = "they confirmed"; break;
    case "cancel": why = "the job was cancelled"; break;
    case "file": why = file?.kind === "invoice" ? "their invoice is in" : fromThem ? "they sent a file" : null; break;
    case "quote": case "ask_quote_in": why = fromThem ? "they sent a price" : null; break;
  }
  if (!why && after.contractorId !== c.contractorId) why = `the job moved to ${after.contractorName || "another contractor"}`;
  if (!why && !["reported", "approved", "scheduled"].includes(after.status)) why = "the job is no longer open";
  if (why) await stopChase(before.id, why, fromThem ? name : "TLE OS");
}
