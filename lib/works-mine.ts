import "server-only";
import type { NextRequest } from "next/server";
import type { Who } from "@/lib/admin";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { ensureRexLink } from "@/lib/users";
import { rexConfigured } from "@/lib/rex";
import { managedBookFor } from "@/lib/managed-book-cache";
import { worksLate } from "@/lib/london-clock";
import { withCarried, type CarriedJob } from "@/lib/works-carried";
import type { WorksOrder, WorksSummary } from "@/lib/works-orders";

/**
 * MY MAINTENANCE (Rhiannon, 15 Oct 2026: "maintenance shows everyone's
 * maintenance. Are we able to just see our own?").
 *
 * "Mine" is the jobs on the homes in the person's own book - the same book
 * Portfolio shows them (lib/managed-book-cache, scoped by lib/scope), REX PM
 * homes they own included - plus any job they raised themselves, and any job
 * the old system has with them by name. The board still holds everybody's:
 * this only says which of them are this person's, so Everyone is one press.
 *
 * Who starts where: anyone who sees the whole business for a living (owners,
 * Susan, the office - `see:everything`) opens on Everyone; an agent opens on
 * Mine. The page remembers whichever they last chose.
 */

export interface MineAnswer {
  /** Works order ids on this person's homes. */
  orders: string[];
  /** Old-system task ids on this person's homes, open and done-on-a-certificate. */
  carried: string[];
  /** The four tiles, counted over Mine alone. */
  summary: WorksSummary;
  /** Where the page opens when the person has not chosen. */
  startOn: "mine" | "everyone";
  /** Said under the toggle when Mine can only be partly worked out. */
  note: string | null;
}

/** "52 Moor Street" and "52 moor street " are the same front door. */
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Same person, allowing for a middle name: REX PM writes "Lianna Denholm",
 * the OS knows her as "Lianna Jane Denholm". First and last word must agree.
 */
function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a).split(" ").filter(Boolean);
  const y = norm(b).split(" ").filter(Boolean);
  if (x.length < 2 || y.length < 2) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/**
 * The SQL figures in worksSummary, counted over a list instead. Kept to the
 * same rules - open means reported to scheduled, late is worksLate, the week
 * starts Monday - so Mine and Everyone never disagree about what a tile means.
 */
export function summariseOrders(orders: WorksOrder[], now = new Date()): WorksSummary {
  const OPEN = new Set(["reported", "approval", "approved", "scheduled"]);
  const open = orders.filter((o) => !o.rehearsal && OPEN.has(o.status));
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const sunday = monday.getTime() + 7 * 86_400_000;
  return {
    open: open.length,
    overdue: open.filter((o) => worksLate(o)).length,
    emergencies: open.filter((o) => o.urgency === "emergency").length,
    awaitingLandlord: open.filter((o) => o.status === "approval").length,
    bookedThisWeek: open.filter((o) => o.status === "scheduled" && o.scheduledAt && Date.parse(o.scheduledAt) >= monday.getTime() && Date.parse(o.scheduledAt) < sunday).length,
    invoicedUnpaidPence: orders.filter((o) => !o.rehearsal && o.status === "invoiced").reduce((a, o) => a + (o.invoicePence ?? 0), 0),
    byKind: { repair: open.filter((o) => o.kind === "repair").length, planned: open.filter((o) => o.kind === "planned").length },
  };
}

export async function mineFor(
  req: NextRequest,
  who: Who,
  orders: WorksOrder[],
  carried: CarriedJob[] | null,
  done: CarriedJob[] = [],
): Promise<MineAnswer> {
  const me = who.subject ?? who.actor!;
  const viewer = who.viewingAs && who.subject ? who.subject : who.actor!;
  const startOn = can(viewer.role, "see:everything") ? "everyone" : "mine";

  /* The person's own REX id: their scope's, or for an owner (whose scope is
     the whole business) their own link, so Mine means their homes too. */
  const scope = await scopeForWho(req, who);
  const rexId = scope.rexUserId ?? (scope.everything ? await ensureRexLink(me).catch(() => null) : null);

  const ids = new Set<string>();
  const names = new Set<string>();
  let note: string | null = null;
  if (!rexId) {
    note = "We can't tell which homes are yours, so Mine shows the jobs you raised or look after.";
  } else if (!rexConfigured()) {
    note = "Your homes can't be read on this environment, so Mine shows the jobs you raised or look after.";
  } else {
    try {
      const { book } = await managedBookFor(rexId);
      for (const p of book.properties) {
        if (p.propertyId) ids.add(p.propertyId);
        const n = norm(p.name);
        if (n) names.add(n);
      }
    } catch {
      note = "Your homes couldn't be read just now, so Mine shows only the jobs you raised or look after. Try again in a minute.";
    }
  }

  const myName = me.name || "";
  const onMyHome = (propertyId: string | null | undefined, name: string) =>
    Boolean(propertyId && ids.has(propertyId)) || names.has(norm(name));

  const mineOrders = orders.filter((o) => onMyHome(o.propertyId, o.propertyName) || samePerson(o.raisedBy, myName));
  const mineJob = (j: CarriedJob) => onMyHome(j.propertyId, j.propertyName) || Boolean(j.osPropertyId && ids.has(j.osPropertyId)) || samePerson(j.managedBy, myName);
  const mineCarried = (carried ?? []).filter(mineJob);
  const mineDone = done.filter(mineJob);

  const own = summariseOrders(mineOrders);
  return {
    orders: mineOrders.map((o) => o.id),
    carried: [...mineCarried, ...mineDone].map((j) => j.taskId),
    summary: carried ? withCarried(own, mineCarried) : own,
    startOn,
    note,
  };
}
