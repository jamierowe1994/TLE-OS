import "server-only";
import { PORTAL_STATE_SWITCH, stillOnPortalFeeds } from "@/lib/advert-offline";
import { switchOn } from "@/lib/switches";
import { forgetListing } from "@/lib/listing-details";
import { invalidateListingBook } from "@/lib/listings-cache";
import { forgetMovedIn } from "@/lib/listings-moved-in";
import { rexCall, rexWritesLocked, type RexResponse } from "@/lib/rex";
import { hasDb, q } from "@/lib/db";

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
 * account. A step REX will not let the presser's own user make goes again
 * from the office's (notAllowedInRex, 23 Nov 2026). Who is told, and what is written to the audit log, is the caller's
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

/** What happened to the listing's own state on the way off: see withdrawInRex. */
export type Withdrawal = "withdrawn" | "already" | "locked" | "refused" | "unread";

/**
 * NOT ALLOWED IS NOT THE SAME AS NOT WORKING (Joe Patten, 23 Nov 2026, a room
 * of his that was let). The take-off is done as whoever pressed it, so REX says
 * who did it. But REX only lets some of its users tell the portals what to
 * show ("You do not have the privileges required to manage portal settings"),
 * and an agent without that could never take their own advert down: two
 * presses, both refused, the room still on all three portals, and no take-off
 * of his had ever gone through. So a step REX refuses FOR THAT REASON, and
 * only that one, is sent again from the office's sign-in, the same one the
 * automatic take-down uses every day (James's yes, 23 Nov 2026). Each step
 * is still tried as them first. Who pressed it stays in the OS's own log.
 */
export function notAllowedInRex(res: Pick<RexResponse, "error">): boolean {
  return /PermissionException|do not have the privileges/i.test(String(res.error ?? ""));
}

/** Which steps the office's sign-in had to send, and whether theirs was refused at all. */
export type SentBy = { office: string[]; notAllowed: boolean };

/** As them; a step REX will not let THEM do goes again from the office's sign-in. */
async function asThemOrOffice<T>(token: string | null, step: string, by: SentBy, run: (t: string | null) => Promise<T>, went: (r: T) => boolean, answer: (r: T) => RexResponse): Promise<T> {
  const first = await run(token);
  if (!token || went(first) || !notAllowedInRex(answer(first))) return first;
  by.notAllowed = true;
  const second = await run(null);
  if (went(second)) by.office.push(step);
  return second;
}
const rexOk = (r: RexResponse) => r.ok;
const itself = (r: RexResponse) => r;

export type TakeOffOutcome =
  /** `office`: the steps sent from the office's sign-in because theirs is not allowed to. */
  | { ok: true; was: Where; now: Where; withdrawal: Withdrawal; office: string[] }
  /** REX did not say where the listing is. Nothing was changed. */
  | { ok: false; step: "read"; was: null; error: string | null }
  /** Not published, so there is nothing to take off. Nothing was changed. */
  | { ok: false; step: "not-published"; was: Where; error: null }
  /** The portals channel would not open to send the withdrawal. Nothing was changed. */
  | { ok: false; step: "reopen"; was: Where; error: string | null; notAllowed: boolean }
  /** The withdrawal or the channel change was refused; `res` is REX's answer.
   *  `notAllowed`: theirs was refused as not allowed, and the office's did not get it through either. */
  | { ok: false; step: "refused"; was: Where; error: string; res: RexResponse; notAllowed: boolean };

/**
 * Off the portals, still published in REX. Throws RexWriteBlocked when
 * REX_ALLOW_WRITES does not name the writes, before anything reaches REX.
 */
/**
 * OFF THE MARKET MEANS WITHDRAWN IN REX (James, 16 Nov 2026: "properties
 * aren't coming off the systems or the portals").
 *
 * Telling the portals "withdrawn" and dropping the portals channel was not
 * enough. 18 Wilson Place was taken offline on 13 Nov, REX said the
 * withdrawal reached Rightmove, OnTheMarket and Zoopla, and three days later
 * Rightmove and OnTheMarket still showed it live - as did 7 more of the 40
 * homes marked Offline. All 8 were still "current" in REX. Every home REX
 * holds as leased or withdrawn was archived on Rightmove (the 40, and 10
 * withdrawn ones checked the same day). So the listing itself is withdrawn
 * too: Listings/changeState, which James allowed on 29 Oct for Keep it off
 * (lib/listing-withdrawn). Put Back Online makes it current again first.
 *
 * The answer is kept as that same "off" choice, so the withdrawn-home box
 * does not then ask the agent what to do about a withdrawal they made.
 */
export async function withdrawInRex(id: number, token: string | null, byName: string, by: SentBy = { office: [], notAllowed: false }): Promise<Withdrawal> {
  const read = await rexCall("Listings", "read", { id });
  if (!read.ok) return "unread";
  const state = String((read.result as { system_listing_state?: unknown } | null)?.system_listing_state ?? "");
  if (state !== "current") return "already";
  if (rexWritesLocked("Listings", "changeState")) return "locked";
  const today = new Date().toISOString().slice(0, 10);
  const res = await asThemOrOffice(
    token,
    "listing withdrawn",
    by,
    (t) => rexCall("Listings", "changeState", { id, state: "withdrawn", details: { date: today, reason_id: "other", reason_note: "Taken off the market from TLE OS" } }, t),
    rexOk,
    itself
  );
  if (!res.ok) {
    console.warn(`[listing-take-off] withdrawing ${id} was refused: ${res.error ?? res.status}`);
    return "refused";
  }
  if (hasDb()) {
    const kept = { choice: "off", event: `listing:${today}`, by: byName, at: new Date().toISOString() };
    await q(
      `INSERT INTO os_case_state (kind, record_id, payload, updated_by) VALUES ('withdrawn-choice', $1, $2::jsonb, $3)
       ON CONFLICT (kind, record_id) DO UPDATE SET payload = $2::jsonb, updated_at = NOW(), updated_by = $3`,
      [String(id), JSON.stringify(kept), byName]
    ).catch((e) => console.error("[listing-take-off] withdrawn choice not kept", id, e));
  }
  return "withdrawn";
}

/** Back on the market: a listing withdrawn in REX is made current again before its channels go back on. */
export async function currentInRex(id: number, token: string | null): Promise<"current" | "already" | "locked" | "refused" | "unread"> {
  const read = await rexCall("Listings", "read", { id });
  if (!read.ok) return "unread";
  const state = String((read.result as { system_listing_state?: unknown } | null)?.system_listing_state ?? "");
  if (state !== "withdrawn") return "already";
  if (rexWritesLocked("Listings", "changeState")) return "locked";
  const res = await rexCall("Listings", "changeState", { id, state: "current", details: { date: new Date().toISOString().slice(0, 10) } }, token);
  return res.ok ? "current" : "refused";
}

export async function takeAdvertOff(id: number, token: string | null, byName = "TLE OS"): Promise<TakeOffOutcome> {
  const before = await rexCall("ListingPublication", "getPublicationStatus", { listing_id: id });
  if (!before.ok) return { ok: false, step: "read", was: null, error: before.error ?? null };
  const was = whereFrom(before.result);
  if (was.status !== "published") return { ok: false, step: "not-published", was, error: null };

  /* As them, and from the office's sign-in for a step theirs is not allowed
     to make (see notAllowedInRex). The automatic run passes no sign-in, so it
     is the office's throughout and nothing here changes for it. */
  const by: SentBy = { office: [], notAllowed: false };
  const channels = (step: string, to: string[]) =>
    asThemOrOffice(token, step, by, (t) => rexCall("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: to }, t), rexOk, itself);

  const reopen = !was.channels.includes("portals");
  if (reopen) {
    const opened = await channels("portals channel opened", [...was.channels, "portals"]);
    if (!opened.ok) return { ok: false, step: "reopen", was, error: opened.error ?? null, notAllowed: by.notAllowed };
  }
  /* A refusal, or a lock that throws, puts the channels back as they were. */
  const putBack = () => (reopen ? channels("portals channel closed again", was.channels).catch(() => null) : null);
  const told = await asThemOrOffice(token, "portals told", by, (t) => queueUpload(id, "off", t), (r) => r.ok, (r) => ({ ...r.res, ok: r.ok, error: r.ok ? null : r.detail })).catch(async (e) => {
    await putBack();
    throw e;
  });
  if (!told.ok) {
    await putBack();
    const res: RexResponse = { status: told.res.status, ok: false, result: told.res.result, error: `The portals were not told to withdraw it: ${told.detail}` };
    return { ok: false, step: "refused", was, error: res.error!, res, notAllowed: by.notAllowed };
  }
  /* WITHDRAWN, THEN TOLD AGAIN, BEFORE THE CHANNEL GOES (ticket 5474011a, 24
     Nov 2026). The upload above can finish before the withdrawal lands: one
     take-off on 17 Nov finished 3 seconds early and that home was still live
     on Rightmove and OnTheMarket a week later, while every home whose last
     upload finished after REX's change was gone (lib/advert-offline
     portalsNeverToldOff). So with the switch on, the listing is withdrawn
     while the portals channel is still open and a second upload follows,
     which is the one the portals act on. "Already queued" is one still
     waiting, which now goes after the change as well. A refused second upload
     is logged and does not undo the take-off. Off, the old order. */
  const tellAgain = await switchOn(PORTAL_STATE_SWITCH).catch(() => false);
  let withdrawal: Withdrawal | null = null;
  if (tellAgain) {
    withdrawal = await withdrawInRex(id, token, byName, by).catch((): Withdrawal => "refused");
    if (withdrawal === "withdrawn") {
      const again = await asThemOrOffice(token, "portals told again", by, (t) => queueUpload(id, "off", t), (r) => r.ok || /already queued/i.test(r.detail), (r) => ({ ...r.res, ok: r.ok, error: r.ok ? null : r.detail })).catch(() => null);
      if (!again || !(again.ok || /already queued/i.test(again.detail))) console.warn(`[listing-take-off] ${id}: the second upload after withdrawing was not sent: ${again?.detail ?? "no answer"}`);
    }
  }

  const res = await channels("portals channel closed", OFF_CHANNELS);
  if (!res.ok) return { ok: false, step: "refused", was, error: String(res.error ?? `HTTP ${res.status}`), res, notAllowed: by.notAllowed };

  /* Read it back rather than trusting the answer. */
  const [after, feeds] = await Promise.all([
    rexCall("ListingPublication", "getPublicationStatus", { listing_id: id }),
    rexCall("ListingPortalUploads", "getStatuses", { listing_id: id, include_last_sent: false }),
  ]);
  const now = whereFrom(after.ok ? after.result : res.result, feeds.ok ? feeds.result : undefined);

  /* Then off the market in REX itself (16 Nov 2026, see withdrawInRex). A
     refusal here leaves the take-off as done and says so in the outcome. */
  withdrawal ??= await withdrawInRex(id, token, byName, by).catch((): Withdrawal => "refused");

  await invalidateListingBook();
  forgetListing(id);
  /* Off the owners' moved-in list at once (lib/listings-moved-in, 3 Nov 2026). */
  forgetMovedIn(String(id));
  return { ok: true, was, now, withdrawal, office: by.office };
}
