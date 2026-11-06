import "server-only";
import { rexCall } from "@/lib/rex";

/**
 * HAS IT REACHED THE PORTALS YET? (Sean McMahon, 5 Nov 2026.)
 *
 * Going live, or back on the market, ends with REX sending the listing to
 * Rightmove, OnTheMarket and Zoopla. That send is a queued job on REX's side
 * (ListingPortalUploads), usually done in a few seconds, sometimes not for a
 * while. When a send was already waiting REX answers "Already queued", and
 * until 3 Nov the OS called that a failure: Sean pressed Go live five times on
 * one re-let and was told it had failed each time, while REX was
 * sending it. Then, with the refusal gone, the OS said "live" before the
 * portals had it.
 *
 * James, 6 Nov 2026: a queued send is not a failure. Say REX is taking a
 * while, let them carry on, keep checking, and tell them when it is live.
 *
 * So this reads REX's most recent upload job for a listing
 * (ListingPortalUploads/getStatuses -> most_recent_queue) and says, relative
 * to the moment the agent pressed:
 *
 *   live      a job that finished after the press sent "current" and every
 *             portal took it;
 *   failed    that job finished but a portal refused it (its own words kept);
 *   withdrawn the job that finished after the press was an older "take it off"
 *             send - the portals were told to drop it, so it has to go again;
 *   sending   a job is waiting or running, or none has finished since;
 *   none      nothing at all has happened since the press (no job ran).
 *
 * Read only. Sending again is the caller's (app/api/listings/portal-send).
 */

export type SendState = "live" | "sending" | "failed" | "withdrawn" | "none";

export interface PortalSend {
  state: SendState;
  /** The portals the job reached, by their own names: "Rightmove", "OnTheMarket", "Zoopla". */
  portals: string[];
  /** Portals that refused, with what they said. */
  refused: { portal: string; why: string }[];
  /** When REX made the most recent job, and when it finished (ms). */
  jobAt: number | null;
  doneAt: number | null;
}

type Target = {
  dispatch_status?: unknown;
  error_details?: unknown;
  portal_profile?: { profile_name?: unknown; portal_definition?: { portal_name?: unknown } };
};
type Queue = {
  job_status?: unknown;
  system_ctime?: unknown;
  completion_time?: unknown;
  listing_status_to_send?: unknown;
  error_details?: unknown;
  targets?: Target[];
};

const ms = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
};

function portalName(t: Target): string {
  const n = t.portal_profile?.portal_definition?.portal_name ?? t.portal_profile?.profile_name;
  const s = String(n ?? "").trim();
  if (/rightmove/i.test(s)) return "Rightmove";
  if (/zoopla/i.test(s)) return "Zoopla";
  if (/onthemarket/i.test(s)) return "OnTheMarket";
  return s || "A portal";
}

function said(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 200);
  try {
    return JSON.stringify(v).slice(0, 200);
  } catch {
    return "";
  }
}

/** The rule, on what getStatuses answered. `since` is when the agent pressed (ms). */
export function sendFrom(result: unknown, since: number): PortalSend {
  const q = ((result ?? {}) as { most_recent_queue?: Queue | null }).most_recent_queue ?? null;
  const out: PortalSend = { state: "none", portals: [], refused: [], jobAt: q ? ms(q.system_ctime) : null, doneAt: q ? ms(q.completion_time) : null };
  if (!q) return out;
  const status = String(q.job_status ?? "").toLowerCase();
  /* A couple of seconds' grace: REX's clock and ours are not the same clock. */
  const afterPress = (t: number | null) => t != null && t >= since - 5000;
  const complete = status === "complete" || status === "completed" || status === "failed" || status === "error";

  if (!complete) {
    /* Waiting or running. A take-off still waiting from before the press goes
       first; the caller sends it again once it has run. */
    out.state = "sending";
    return out;
  }
  if (!afterPress(out.doneAt)) return out; // finished before the press: nothing since
  if (String(q.listing_status_to_send ?? "") === "withdrawn") {
    out.state = "withdrawn";
    return out;
  }
  const targets = Array.isArray(q.targets) ? q.targets : [];
  for (const t of targets) {
    const d = String(t.dispatch_status ?? "");
    if (/succeeded|success|sent/i.test(d)) out.portals.push(portalName(t));
    else if (/fail|error|reject/i.test(d)) out.refused.push({ portal: portalName(t), why: said(t.error_details) || d.replace(/_/g, " ") });
  }
  if (status === "failed" || status === "error") {
    if (!out.refused.length) out.refused.push({ portal: "The portals", why: said(q.error_details) || "The send did not finish." });
  }
  out.portals = [...new Set(out.portals)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  out.state = out.refused.length ? "failed" : out.portals.length ? "live" : "sending";
  return out;
}
const ORDER = ["Rightmove", "OnTheMarket", "Zoopla"];

/** Read REX now. Null when REX did not answer. */
export async function readSend(id: number, since: number): Promise<PortalSend | null> {
  const r = await rexCall("ListingPortalUploads", "getStatuses", { listing_id: id, include_last_sent: false }).catch(() => null);
  if (!r?.ok) return null;
  return sendFrom(r.result, since);
}

/**
 * Wait a few seconds for the send to land, so the usual quick one is answered
 * as live straight away and only a slow one is handed to the watcher.
 */
export async function waitForSend(id: number, since: number, forMs = 8000): Promise<PortalSend | null> {
  const end = Date.now() + forMs;
  let last: PortalSend | null = null;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    last = (await readSend(id, since)) ?? last;
    if (last && (last.state === "live" || last.state === "failed")) return last;
    if (Date.now() >= end) return last;
  }
}

/** In words an agent reads: "Rightmove, OnTheMarket and Zoopla". */
export function portalWords(names: string[]): string {
  const n = names.length ? names : ORDER;
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}
