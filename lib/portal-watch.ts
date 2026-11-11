/**
 * Listings on their way to the portals (James, 6 Nov 2026).
 *
 * When REX takes longer than usual to send a listing to Rightmove,
 * OnTheMarket and Zoopla, the agent is told it hasn't failed and carries on.
 * The listing is remembered here, in this browser, and the watcher
 * (components/PortalSendWatcher, on every page) keeps asking
 * /api/listings/portal-send until it is through, then says so in a toast.
 */

export type PortalWatch = {
  id: string;
  name: string;
  /** When they pressed (ms), from the server, so the send is judged from then. */
  since: number;
  /** Sent again this many times by the server. */
  tries: number;
  /** Half an hour without getting through has been reported. */
  late?: boolean;
};

const KEY = "os-portal-sends-v1";
export const PORTAL_WATCH_EVENT = "os-portal-sends";
/** Said with { id, state } when a watched listing is through, refused or taken off. */
export const PORTAL_SENT_EVENT = "os-portal-sent";

export function watchedPortalSends(): PortalWatch[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && Number.isFinite(x.since)) : [];
  } catch {
    return [];
  }
}

function save(list: PortalWatch[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage refused: the listing's own page still shows where it is */
  }
  window.dispatchEvent(new Event(PORTAL_WATCH_EVENT));
}

export function watchPortalSend(w: { id: string | number; name: string; since: number }): void {
  const id = String(w.id);
  save([...watchedPortalSends().filter((x) => x.id !== id), { id, name: w.name, since: w.since, tries: 0 }]);
}

export function updatePortalWatch(id: string, patch: Partial<PortalWatch>): void {
  save(watchedPortalSends().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function unwatchPortalSend(id: string, state?: string): void {
  save(watchedPortalSends().filter((x) => x.id !== id));
  if (state) window.dispatchEvent(new CustomEvent(PORTAL_SENT_EVENT, { detail: { id, state } }));
}

export function isWatched(id: string | number): boolean {
  return watchedPortalSends().some((x) => x.id === String(id));
}

/** "Rightmove, OnTheMarket and Zoopla", in their order. */
export function portalList(names: string[] = []): string {
  const order = ["Rightmove", "OnTheMarket", "Zoopla"];
  const n = names.length ? [...names].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : order;
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** What the agent reads when the send is slower than usual: not a failure. */
export const TAKING_A_WHILE =
  "It hasn't failed - it's just taking longer than normal to reach Rightmove, OnTheMarket and Zoopla. Carry on with something else. We're keeping an eye on it and will tell you the moment it's live.";
