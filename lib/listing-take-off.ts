import "server-only";
import { stillOnPortalFeeds } from "@/lib/advert-offline";
import { forgetListing } from "@/lib/listing-details";
import { invalidateListingBook } from "@/lib/listings-cache";
import { forgetMovedIn } from "@/lib/listings-moved-in";
import { rexCall, type RexResponse } from "@/lib/rex";

/**
 * TAKING AN ADVERT OFF THE PORTALS, IN ONE PLACE (Susan Liles, 3 Nov 2026).
 *
 * The "off" steps of /api/listings/publish, moved here so the button and the
 * once-a-day automatic take-down (lib/listings-auto-takedown) run exactly the
 * same calls and cannot drift apart. The why of each step is in the header of
 * app/api/listings/publish; in short:
 *
 *   1. read where the listing is; not published means nothing to take off;
 *   2. a listing already off the portals channel but still on a feed has the
 *      channel opened for a moment, because REX will only queue an upload
 *      while it is on (6 Ruskin Place, 22 Oct 2026);
 *   3. the portals are TOLD: a "withdrawn" upload is queued, BEFORE the
 *      channel goes, so a refusal leaves it exactly as it was;
 *   4. the outward channels go, "general" kept, so it stays published in REX;
 *   5. read back, and the OS's held copies forgotten.
 *
 * Who it is done as is the caller's: the button passes the presser's own REX
 * sign-in (none falls to the office account), the automatic run the office
 * account. Who is told, and what is written to the audit log, is the caller's
 * too, because a person and a job say it differently.
 */

export const ALL_CHANNELS = ["portals", "automatch", "external", "general"];
export const OFF_CHANNELS = ["general"];

export type Where = { status: string | null; channels: string[]; onPortals: boolean };

/**
 * `feeds` is ListingPortalUploads/getStatuses: still on a portal when a feed
 * is running there and the last upload sent was "current".
 */
export function whereFrom(result: unknown, feeds?: unknown): Where {
  const r = (result ?? {}) as { status?: unknown; active_targets?: unknown };
  const status = typeof r.status === "string" ? r.status : null;
  const channels = Array.isArray(r.active_targets) ? r.active_targets.filter((c): c is string => typeof c === "string") : [];
  return { status, channels, onPortals: status === "published" && (channels.includes("portals") || stillOnPortalFeeds(feeds)) };
}

/** Tell the portal feeds what to show: "withdrawn" for off, the listing's own status for on. */
export async function queueUpload(id: number, action: "off" | "on", token: string | null) {
  const res = await rexCall("ListingPortalUploads", "queue", { listing_id: id, ...(action === "off" ? { portal_listing_status: "withdrawn" } : {}) }, token);
  const r = (res.result ?? {}) as { queued?: unknown; detail?: unknown };
  const detail = res.ok ? String(r.detail ?? "") : String(res.error ?? `HTTP ${res.status}`);
  /* "Already queued" on the way back on is a send already waiting to go,
     not a refusal (Sean, 2 Nov 2026: 285 Leith Walk was feeding all three
     portals while the screen told him it had failed). */
  const waiting = action === "on" && /already queued/i.test(detail);
  return { ok: (res.ok && r.queued === true) || waiting, res, detail };
}

export type TakeOffOutcome =
  | { ok: true; was: Where; now: Where }
  /** REX did not say where the listing is. Nothing was changed. */
  | { ok: false; step: "read"; was: null; error: string | null }
  /** Not published, so there is nothing to take off. Nothing was changed. */
  | { ok: false; step: "not-published"; was: Where; error: null }
  /** The portals channel would not open to send the withdrawal. Nothing was changed. */
  | { ok: false; step: "reopen"; was: Where; error: string | null }
  /** The withdrawal or the channel change was refused; `res` is REX's answer. */
  | { ok: false; step: "refused"; was: Where; error: string; res: RexResponse };

/**
 * Off the portals, still published in REX. Throws RexWriteBlocked when
 * REX_ALLOW_WRITES does not name the writes, before anything reaches REX.
 */
export async function takeAdvertOff(id: number, token: string | null): Promise<TakeOffOutcome> {
  const before = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
  if (!before.ok) return { ok: false, step: "read", was: null, error: before.error ?? null };
  const was = whereFrom(before.result);
  if (was.status !== "published") return { ok: false, step: "not-published", was, error: null };

  const reopen = !was.channels.includes("portals");
  if (reopen) {
    const opened = await rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: [...was.channels, "portals"] }, token);
    if (!opened.ok) return { ok: false, step: "reopen", was, error: opened.error ?? null };
  }
  /* A refusal, or a lock that throws, puts the channels back as they were. */
  const putBack = () => (reopen ? rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: was.channels }, token).catch(() => null) : null);
  const told = await queueUpload(id, "off", token).catch(async (e) => {
    await putBack();
    throw e;
  });
  if (!told.ok) {
    await putBack();
    const res: RexResponse = { status: told.res.status, ok: false, result: told.res.result, error: `The portals were not told to withdraw it: ${told.detail}` };
    return { ok: false, step: "refused", was, error: res.error!, res };
  }
  const res = await rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: OFF_CHANNELS }, token);
  if (!res.ok) return { ok: false, step: "refused", was, error: String(res.error ?? `HTTP ${res.status}`), res };

  /* Read it back rather than trusting the answer. */
  const [after, feeds] = await Promise.all([
    rexCall("ListingPublication", "getPublicationStatus", { listing_id: id }),
    rexCall("ListingPortalUploads", "getStatuses", { listing_id: id, include_last_sent: false }),
  ]);
  const now = whereFrom(after.ok ? after.result : res.result, feeds.ok ? feeds.result : undefined);

  await invalidateListingBook();
  forgetListing(id);
  /* Off the owners' moved-in list at once (lib/listings-moved-in, 3 Nov 2026). */
  forgetMovedIn(String(id));
  return { ok: true, was, now };
}
