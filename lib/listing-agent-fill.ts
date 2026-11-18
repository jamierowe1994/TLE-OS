import "server-only";
import { record } from "@/lib/audit";
import { forgetListing, readListingDetails } from "@/lib/listing-details";
import { invalidateListingBook } from "@/lib/listings-cache";
import { rexCall, rexWritesLocked } from "@/lib/rex";
import { rexUserIdFor } from "@/lib/rex-listing-create";

/**
 * A relet that lands on a listing already there, with nobody named as its
 * agent (James, 18 Nov 2026, a home of Tony Poon's).
 *
 * Relet on a managed home makes a listing with the agent's name on it
 * (lib/rex-listing-create). When the home already has a current listing the
 * OS makes no second one and sends the agent to that one - and that home's
 * had been made outside the OS with no agent, so it sat on nobody's
 * board and the portals refused it ("A primary listing agent must be
 * specified"). Now the agent who pressed Relet goes on it as the agent.
 *
 * Only when nobody is named: an agent already on it is never replaced. The
 * agent only, as Change on the listing does it; the owners stay where they
 * are (moving those is James and Susan's, app/api/listings/owner). Written as
 * the office account, as that route does. Never holds the relet up.
 */

export type AgentFill = { state: "added"; name: string | null } | { state: "had" | "locked" | "no-rex-user" | "failed" };

export async function nameAgentIfNone(listingId: string, actor: { id: string; email: string; name?: string | null }): Promise<AgentFill> {
  const id = Number(listingId);
  if (!Number.isInteger(id) || id <= 0) return { state: "failed" };
  const details = await readListingDetails(id).catch(() => null);
  if (!details) return { state: "failed" };
  if (details.agent.id) return { state: "had" };
  if (rexWritesLocked("Listings", "update")) return { state: "locked" };
  const rexId = await rexUserIdFor(actor.id).catch(() => null);
  if (!rexId) return { state: "no-rex-user" };

  const res = await rexCall("Listings", "update", { data: { id: String(id), listing_agent_1: { id: rexId } } });
  if (!res.ok) {
    console.error("[relet] naming the agent refused", { id, why: String(res.error ?? res.status).slice(0, 300) });
    return { state: "failed" };
  }
  forgetListing(id);
  await invalidateListingBook().catch(() => {});
  await record({
    kind: "listing_owner_changed",
    actorId: actor.id,
    actorEmail: actor.email,
    detail: `${id}: nobody -> ${actor.name || actor.email} (relet landed on a listing with no agent); owners untouched`,
  }).catch(() => {});
  return { state: "added", name: actor.name ?? null };
}
