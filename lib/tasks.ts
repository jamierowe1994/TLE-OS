import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * What an agent owes somebody.
 *
 * The lead drawer has had a Tasks tab since the wireframe, backed by rows in
 * `leads-sample.ts` held in React state - so ticking one off did nothing and
 * a task written on Monday was gone by Tuesday. This is the real thing.
 *
 * Deliberately small. A task is a line of text, optionally a date, and a link
 * to whatever it is about. It is NOT a workflow engine: the OS already has
 * reminders (generated, in the bell) and works orders (a job with money on
 * it), and a third thing that tried to be both would be used for neither.
 */

export interface Task {
  id: string;
  title: string;
  detail: string;
  dueAt: string | null;
  done: boolean;
  doneAt: string | null;
  leadId: string | null;
  propertyId: string | null;
  listingId: string | null;
  kind: string;
  createdBy: string;
  createdAt: string;
}

type Row = {
  id: string;
  title: string;
  detail: string;
  due_at: Date | null;
  done_at: Date | null;
  lead_id: string | null;
  property_id: string | null;
  listing_id: string | null;
  kind: string;
  created_by: string;
  created_at: Date;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

const rowTo = (r: Row): Task => ({
  id: r.id,
  title: r.title,
  detail: r.detail ?? "",
  dueAt: iso(r.due_at),
  done: r.done_at != null,
  doneAt: iso(r.done_at),
  leadId: r.lead_id,
  propertyId: r.property_id,
  listingId: r.listing_id,
  kind: r.kind,
  createdBy: r.created_by ?? "",
  createdAt: new Date(r.created_at).toISOString(),
});

export async function createTask(t: {
  userId: string;
  title: string;
  detail?: string;
  dueAt?: string | null;
  leadId?: string | null;
  propertyId?: string | null;
  listingId?: string | null;
  kind?: string;
  createdBy?: string;
}): Promise<Task | null> {
  if (!hasDb() || !t.title.trim()) return null;
  const id = `tsk_${randomUUID()}`;
  const rows = await q<Row>(
    `INSERT INTO os_tasks (id, user_id, title, detail, due_at, lead_id, property_id, listing_id, kind, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      t.userId,
      t.title.trim().slice(0, 300),
      (t.detail ?? "").slice(0, 2000),
      t.dueAt ?? null,
      t.leadId ?? null,
      t.propertyId ?? null,
      t.listingId ?? null,
      t.kind ?? "general",
      t.createdBy ?? "",
    ]
  ).catch(() => []);
  return rows[0] ? rowTo(rows[0]) : null;
}

/** One lead's tasks, newest first, done ones last. */
export async function tasksForLead(leadId: string): Promise<Task[]> {
  if (!hasDb() || !leadId) return [];
  const rows = await q<Row>(
    `SELECT * FROM os_tasks WHERE lead_id = $1
      ORDER BY done_at NULLS FIRST, due_at NULLS LAST, created_at DESC LIMIT 100`,
    [leadId]
  ).catch(() => []);
  return rows.map(rowTo);
}

/** Everything still open for one person - what the bell and the day plan read. */
export async function openTasksFor(userId: string, limit = 100): Promise<Task[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT * FROM os_tasks WHERE user_id = $1 AND done_at IS NULL
      ORDER BY due_at NULLS LAST, created_at DESC LIMIT $2`,
    [userId, limit]
  ).catch(() => []);
  return rows.map(rowTo);
}

/** Tick it off, or put it back. Only the person it belongs to may. */
export async function setTaskDone(id: string, userId: string, done: boolean): Promise<Task | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `UPDATE os_tasks SET done_at = ${done ? "NOW()" : "NULL"}
      WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  ).catch(() => []);
  return rows[0] ? rowTo(rows[0]) : null;
}
