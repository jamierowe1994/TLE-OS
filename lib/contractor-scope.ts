import "server-only";
import type { NextRequest } from "next/server";
import type { Who } from "@/lib/admin";
import { can } from "@/lib/roles";
import { mineFor } from "@/lib/works-mine";
import type { ContractorStats, WorksOrder } from "@/lib/works-orders";

/**
 * WHOSE JOBS ON CONTRACTORS (James, 21 Oct 2026: "Any works orders going out
 * at the moment, I would like people to only see their own, so we can't see
 * each other's").
 *
 * The company's contractors are shared, so their jobs were everybody's: an
 * agent opening a company plumber saw every colleague's job with them. Now
 * an agent sees only their own - the same "mine" Maintenance uses
 * (lib/works-mine): jobs on the homes in their own book, plus any job they
 * raised. The office (see:everything) still sees everyone's, and is told
 * which are its own so it can narrow to Mine.
 *
 * If "mine" cannot be worked out at all, an agent gets the jobs they raised
 * and nothing more - never everybody's.
 */

export interface ScopedJobs {
  /** The jobs this person may see. */
  orders: WorksOrder[];
  /** True when they see everyone's (the office). */
  everyone: boolean;
  /** Which of the jobs are their own, for the office's Mine / Everyone. Null when it could not be read. */
  mine: string[] | null;
  /** Said on the page when Mine is only partly known. */
  note: string | null;
}

export async function scopeJobs(req: NextRequest, who: Who, orders: WorksOrder[]): Promise<ScopedJobs> {
  const me = who.subject ?? who.actor!;
  const everyone = can(me.role, "see:everything");
  const answer = await mineFor(req, who, orders, null).catch(() => null);
  if (everyone) return { orders, everyone, mine: answer?.orders ?? null, note: answer?.note ?? null };
  if (answer) {
    const ids = new Set(answer.orders);
    /* Maintenance's note talks about its Mine toggle; an agent has no toggle here. */
    return { orders: orders.filter((o) => ids.has(o.id)), everyone, mine: answer.orders, note: answer.note?.replace(/Mine shows/g, "this shows") ?? null };
  }
  const names = new Set([me.name, me.email].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean));
  const raised = orders.filter((o) => names.has((o.raisedBy ?? "").trim().toLowerCase()));
  return {
    orders: raised,
    everyone,
    mine: raised.map((o) => o.id),
    note: "Your homes couldn't be read just now, so this shows only the jobs you raised. Try again in a minute.",
  };
}

/** contractorStats, counted over the jobs this person may see. Same rules as the SQL. */
export function statsOf(orders: WorksOrder[]): ContractorStats {
  const OPEN = new Set(["reported", "approval", "approved", "scheduled"]);
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  const last = orders.map((o) => o.createdAt).filter(Boolean).sort().pop() ?? null;
  return {
    jobs: orders.length,
    open: orders.filter((o) => OPEN.has(o.status)).length,
    quotedPence: sum(orders.map((o) => o.quotePence)),
    invoicedPence: sum(orders.map((o) => o.invoicePence)),
    paidPence: sum(orders.filter((o) => o.status === "paid").map((o) => o.invoicePence)),
    outstandingPence: sum(orders.filter((o) => o.status === "invoiced").map((o) => o.invoicePence)),
    lastJobAt: last,
  };
}
