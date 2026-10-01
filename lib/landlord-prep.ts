import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { ViewPrep } from "@/lib/landlord-view";

/**
 * BEFORE MOVING DAY (1 Oct 2026, James).
 *
 * A tenant can ask for works with their offer - "fix the shower", "a new
 * carpet in the second bedroom". When the landlord approves the offer they
 * agree to those too, and they land here: a short list on the landlord's
 * portal, due on the tenant's move-in day, that the landlord ticks off.
 *
 * Its own table rather than works orders, because these are the landlord's
 * promises before a tenancy exists - the maintenance side only opens once a
 * tenant has moved in, and a works order is a job we run, not one they do.
 */

type Row = { id: string; title: string; due_on: string | Date | null; done_at: string | Date | null };

const ymd = (v: string | Date | null) => {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
};

/** The jobs agreed with one approved offer. Re-approving the same offer adds nothing twice. */
export async function addPrep(p: { accountId: string; offerId: string; property: string; works: string[]; dueOn: string | null }): Promise<void> {
  if (!hasDb() || !p.works.length) return;
  const have = await q<{ title: string }>(`SELECT title FROM os_landlord_prep WHERE account_id = $1 AND offer_id = $2`, [p.accountId, p.offerId]);
  const known = new Set(have.map((r) => r.title));
  for (const title of p.works.map((w) => w.trim()).filter(Boolean)) {
    if (known.has(title)) continue;
    await q(
      `INSERT INTO os_landlord_prep (id, account_id, offer_id, property, title, due_on) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), p.accountId, p.offerId, p.property, title.slice(0, 200), p.dueOn && /^\d{4}-\d{2}-\d{2}/.test(p.dueOn) ? p.dueOn.slice(0, 10) : null]
    );
  }
}

/** Their list for one property, oldest first so it reads in the order agreed. */
export async function listPrep(accountId: string, property: string): Promise<ViewPrep[]> {
  if (!hasDb() || !property) return [];
  const rows = await q<Row>(
    `SELECT id, title, due_on, done_at FROM os_landlord_prep WHERE account_id = $1 AND property = $2 ORDER BY created_at, title`,
    [accountId, property]
  ).catch(() => [] as Row[]);
  return rows.map((r) => ({ id: r.id, title: r.title, dueOn: ymd(r.due_on), done: Boolean(r.done_at) }));
}

/** Ticked or unticked, only on their own list. */
export async function tickPrep(accountId: string, id: string, done: boolean): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ id: string }>(
    `UPDATE os_landlord_prep SET done_at = ${done ? "NOW()" : "NULL"} WHERE id = $1 AND account_id = $2 RETURNING id`,
    [id, accountId]
  );
  return rows.length > 0;
}
