import type { Application } from "@/lib/applications";
import type { PreTenancyDeal } from "@/app/api/pretenancy/deals/route";
import { isLet } from "@/lib/application-record";

/**
 * LETS IN PROGRESS - the one rule (Susan Liles, 20 Nov 2026, ticket 0573c824).
 *
 * "On the PM Dashboard - On their way to a tenant shows 78 properties under
 * application which is wrong?" The PM Dashboard's Let agreed tile counted the
 * LISTINGS marked let agreed (lib/listing-stages), and opened Applications,
 * which counts something else: the lets still working through to a move-in.
 * A home that has moved in drops off Applications but stays let agreed on its
 * listing until somebody marks it let, so the two drifted apart (78 against
 * 17 when Susan looked).
 *
 * This is what the Applications board's All tab counts, lifted out of the
 * board so the server can count it too (lib/lets-in-progress) and the PM
 * Dashboard's Lets in Progress tile and the board can never disagree:
 *
 *   - every Propoly deal on the person's board that is still moving - not
 *     archived (move-in slipped 30+ days), not cancelled, not one of the old
 *     lingering records, not cancelled from its own page (lib/let-cancel);
 *   - plus every let accepted (in REX or the OS) that is not in Propoly yet,
 *     "To push to Propoly".
 *
 * No server-only imports: the board's page uses the same helpers.
 */

type Deal = PreTenancyDeal;

/** An accepted let with no deal in Propoly yet (James, 12 Oct 2026). */
export type WaitingLet = { id: string; property: string; locality: string; image: string | null; tenant: string; agent: string | null; moveIn: string | null; swap: boolean };

/** Lets cancelled from their own page: the let's ref, and its Propoly deal. */
export type CancelledLets = { refs: ReadonlySet<string>; deals: ReadonlySet<string> };

/* Kirstie's board hides deals that should have finished before 2026 (stale
   records still open in Propoly); the agents' board has always done the
   same. A fixed cut, not a month: it is the date the clean-up starts from. */
const STALE_BEFORE = "2026-01-01";
export const isStale = (d: Deal) => {
  const ref = d.app.startDate ?? d.app.dateReceived;
  return ref != null && ref < STALE_BEFORE;
};

/** The application behind a deal, if the book has one: by the deal it was pushed as, else by its home. */
export function letApplicationFor(d: Deal, apps: readonly Application[]): string | null {
  const lid = d.app.listingId ? Number(d.app.listingId) : null;
  const name = d.app.propertyName.trim().toLowerCase();
  const hit =
    apps.find((a) => a.propolyDealId === d.app.id) ??
    apps.find((a) => isLet(a) && ((lid != null && a.listingId === lid) || a.property.trim().toLowerCase() === name));
  return hit ? String(hit.id) : null;
}

/** Accepted, still open, and not in Propoly yet: the board's To push to Propoly. */
export function waitingLets(apps: readonly Application[]): WaitingLet[] {
  return apps
    .filter((a) => isLet(a) && !a.closed && (a.stageLabel === "Handover due" || a.stageLabel === "Accepted"))
    .map((a) => ({
      id: String(a.id),
      property: a.property,
      locality: a.locality,
      image: a.image,
      tenant: a.applicants.find((p) => p.isPrimary)?.name ?? a.applicants[0]?.name ?? "No tenant recorded",
      agent: a.agent,
      moveIn: a.startDate,
      swap: Boolean(a.swap),
    }));
}

/** A deal still moving on the board. */
export function dealInProgress(d: Deal, apps: readonly Application[], cancelled: CancelledLets): boolean {
  return (
    !d.archived &&
    d.statusKey !== "cancelled" &&
    !isStale(d) &&
    !cancelled.deals.has(d.app.id) &&
    !cancelled.refs.has(d.app.id) &&
    !cancelled.refs.has(letApplicationFor(d, apps) ?? "")
  );
}

/** Every let in progress on one person's board, and how many. */
export function letsInProgress(deals: readonly Deal[], apps: readonly Application[], cancelled: CancelledLets): { deals: Deal[]; waiting: WaitingLet[]; count: number } {
  const moving = deals.filter((d) => dealInProgress(d, apps, cancelled));
  const waiting = waitingLets(apps);
  return { deals: moving, waiting, count: moving.length + waiting.length };
}
