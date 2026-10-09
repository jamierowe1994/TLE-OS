import type { NextRequest } from "next/server";
import type { Who } from "@/lib/admin";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { bookFor } from "@/lib/listings-cache";
import { assembled } from "@/lib/applications-board";
import { isTestId, testListingsFor } from "@/lib/test-overlay";

/**
 * Who may make, read and decide offers (9 Oct 2026).
 *
 * Every offer route used to ask for "staff:internal", which the agent role
 * does not carry - so the people who actually take offers were refused. On
 * 9 Oct Rhiannon picked a tenant on 12b Cliff Road's Make an Offer and the
 * form said "Sign in first." while she was signed in.
 *
 * The rule now: the office (staff:internal) works on any listing, as before;
 * an agent works on the listings on their own book, the same book the
 * Listings board shows them, and on their own test files.
 */

export const isOffice = (who: Who | null): boolean => Boolean(who?.actor && can(who.actor.role, "staff:internal"));

/** The listing ids an agent's offers may touch. Null means every listing (the office, an owner). */
export async function offerListingIds(req: NextRequest, who: Who | null): Promise<Set<string> | null> {
  if (!who?.actor) return new Set();
  if (isOffice(who)) return null;
  const scope = await scopeForWho(req, who);
  if (scope.everything) return null;
  const [book, tests] = await Promise.all([
    scope.unlinked ? Promise.resolve(null) : bookFor(scope.rexUserId).catch(() => null),
    testListingsFor(who.actor.email).catch(() => []),
  ]);
  const ids = new Set<string>();
  for (const l of book?.listings ?? []) ids.add(String(l.id));
  for (const l of tests) ids.add(String(l.id));
  return ids;
}

/** May this person put an offer on, read the offers of, or decide on this listing? */
export async function mayOfferOn(req: NextRequest, who: Who | null, listingId: unknown): Promise<boolean> {
  const id = String(listingId ?? "").trim();
  if (!who?.actor || !id) return false;
  if (isOffice(who)) return true;
  if (isTestId(id)) return (await testListingsFor(who.actor.email).catch(() => [])).some((l) => String(l.id) === id);
  const ids = await offerListingIds(req, who);
  return ids === null || ids.has(id);
}

/** Is this REX application in the agent's own scope? */
export async function mayDecideRexApp(req: NextRequest, who: Who | null, appId: string): Promise<boolean> {
  if (!who?.actor) return false;
  if (isOffice(who)) return true;
  const scope = await scopeForWho(req, who);
  if (scope.everything) return true;
  if (scope.unlinked) return false;
  const { held } = await assembled(scope.rexUserId);
  return held.value.applications.some((a) => String(a.id) === appId);
}

export const NOT_YOURS = "That listing isn't on your book, so you can't put an offer on it. Ask James if it should be.";
