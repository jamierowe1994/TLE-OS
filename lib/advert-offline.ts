import "server-only";
import { hasDb, q } from "@/lib/db";
import { listingRead } from "@/lib/listing-details";

/**
 * TAKE THE ADVERT OFFLINE (James, 19 Oct 2026).
 *
 * Lianna, 6 Ruskin Place: the offer was accepted in the OS on 12 Oct, so the
 * OS has called it Let agreed ever since - but the portals are fed from the
 * listing system, which still had it published, so Rightmove and OnTheMarket
 * were showing it a week later. Five more homes were the same.
 *
 * James: from the moment there's an application the agent can take the
 * advert offline, whenever they choose - straight away, once the money's in,
 * once referencing is done, or simply when they see fit. It is the agent's
 * call every time: the OS reminds them at the stage they picked and never
 * takes anything down by itself. Taking it offline then offers to let the
 * other applicants go and to call off the viewings, each confirmed first.
 *
 * Off the portals is the same call as "Take off the portals" on the
 * listing's Portals tab (/api/listings/publish, action "off"); this file
 * keeps the agent's plan and the Offline marker the rest of the OS shows.
 */

/** When the agent wants to be asked to take it offline. */
export type OfflineWhen = "fee" | "references" | "manual";

export const WHEN_WORDS: Record<OfflineWhen, string> = {
  fee: "When the holding fee is in",
  references: "When referencing is done",
  manual: "I'll decide myself",
};

export function isOfflineWhen(v: unknown): v is OfflineWhen {
  return v === "fee" || v === "references" || v === "manual";
}

export interface AdvertState {
  listingId: string;
  applicationId: string | null;
  when: OfflineWhen | null;
  offlineAt: string | null;
  offlineBy: string | null;
  /** Put back online after it was taken off (a let that fell through). */
  onlineAgainAt: string | null;
}

let ready: Promise<void> | null = null;
async function aq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_advert_offline (
      listing_id      TEXT PRIMARY KEY,
      application_id  TEXT,
      take_off_when   TEXT,
      plan_by_name    TEXT NOT NULL DEFAULT '',
      offline_at      TIMESTAMPTZ,
      offline_by_name TEXT NOT NULL DEFAULT '',
      offline_by_email TEXT NOT NULL DEFAULT '',
      online_again_at TIMESTAMPTZ,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q<T>(text, params);
}

type Row = {
  listing_id: string;
  application_id: string | null;
  take_off_when: string | null;
  offline_at: Date | null;
  offline_by_name: string;
  online_again_at: Date | null;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const shape = (r: Row): AdvertState => ({
  listingId: r.listing_id,
  applicationId: r.application_id,
  when: isOfflineWhen(r.take_off_when) ? r.take_off_when : null,
  offlineAt: iso(r.offline_at),
  offlineBy: r.offline_by_name || null,
  onlineAgainAt: iso(r.online_again_at),
});

export async function advertFor(listingId: string): Promise<AdvertState | null> {
  if (!hasDb()) return null;
  const rows = await aq<Row>(`SELECT * FROM os_advert_offline WHERE listing_id = $1`, [listingId]);
  return rows[0] ? shape(rows[0]) : null;
}

/** Every listing the OS has taken offline, for the boards. */
export async function offlineListings(): Promise<Map<string, AdvertState>> {
  const out = new Map<string, AdvertState>();
  if (!hasDb()) return out;
  const rows = await aq<Row>(`SELECT * FROM os_advert_offline WHERE offline_at IS NOT NULL`).catch(() => [] as Row[]);
  for (const r of rows) out.set(r.listing_id, shape(r));
  return out;
}

export async function setPlan(listingId: string, applicationId: string | null, when: OfflineWhen, byName: string): Promise<AdvertState | null> {
  await aq(
    `INSERT INTO os_advert_offline (listing_id, application_id, take_off_when, plan_by_name, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (listing_id) DO UPDATE
       SET application_id = COALESCE(EXCLUDED.application_id, os_advert_offline.application_id),
           take_off_when = EXCLUDED.take_off_when, plan_by_name = EXCLUDED.plan_by_name, updated_at = NOW()`,
    [listingId, applicationId, when, byName]
  );
  return advertFor(listingId);
}

export async function markOffline(listingId: string, applicationId: string | null, by: { name: string; email: string }): Promise<AdvertState | null> {
  await aq(
    `INSERT INTO os_advert_offline (listing_id, application_id, offline_at, offline_by_name, offline_by_email, online_again_at, updated_at)
     VALUES ($1,$2,NOW(),$3,$4,NULL,NOW())
     ON CONFLICT (listing_id) DO UPDATE
       SET application_id = COALESCE(EXCLUDED.application_id, os_advert_offline.application_id),
           offline_at = NOW(), offline_by_name = EXCLUDED.offline_by_name, offline_by_email = EXCLUDED.offline_by_email,
           online_again_at = NULL, updated_at = NOW()`,
    [listingId, applicationId, by.name, by.email]
  );
  return advertFor(listingId);
}

/** Back on the portals: the marker goes, the plan is kept for the next let. */
export async function markOnline(listingId: string): Promise<AdvertState | null> {
  await aq(`UPDATE os_advert_offline SET offline_at = NULL, online_again_at = NOW(), updated_at = NOW() WHERE listing_id = $1`, [listingId]);
  return advertFor(listingId);
}

/**
 * STILL ON THE PORTALS, WHATEVER THE MARKER SAYS (22 Oct 2026).
 *
 * Lianna, 6 Ruskin Place: she pressed Take Offline on 20 Oct, the OS said
 * Offline everywhere, and Rightmove, Zoopla and OnTheMarket kept showing it
 * as available - six more enquiries in two days, and marking it let agreed in
 * REX changed nothing, because with the portals channel off REX sends the
 * feeds nothing at all. Seven listings were the same. The marker records what
 * the agent pressed; only the feeds say where the advert is.
 *
 * `feeds` is ListingPortalUploads/getStatuses. On a portal while a feed is
 * running there with the home on it and the last upload sent said "current".
 */
export function stillOnPortalFeeds(feeds: unknown): boolean {
  const f = (feeds ?? {}) as { portals?: unknown; most_recent_queue?: { listing_status_to_send?: unknown } | null };
  const running = Array.isArray(f.portals) && f.portals.some((p) => (p as { feed_status?: unknown }).feed_status === "feeding" && Boolean((p as { remote_id_on_portal?: unknown }).remote_id_on_portal));
  return running && f.most_recent_queue?.listing_status_to_send === "current";
}

/**
 * Of the listings marked Offline, the ones the portals still show, for the
 * Listings board. A feed that can't be read in time adds nothing: the board
 * never waits on it, and the listing's own page reads it again.
 */
export async function offlineButStillShowing(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const numeric = ids.filter((id) => /^\d+$/.test(id));
  if (!numeric.length) return out;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2500));
  await Promise.all(
    numeric.map((id) =>
      Promise.race([listingRead(id, "ListingPortalUploads", "getStatuses", { listing_id: Number(id), include_last_sent: false }), timeout])
        .then((res) => {
          if (res?.ok && stillOnPortalFeeds(res.result)) out.add(id);
        })
        .catch(() => {})
    )
  );
  return out;
}

/**
 * Has the let reached the stage the agent picked? `feeSettled` is the
 * holding fee paid or not required (lib/offer-hold feeOf); `pastReferencing`
 * is the Propoly deal beyond its referencing stop.
 */
export function stageReached(when: OfflineWhen | null, p: { feeSettled: boolean; pastReferencing: boolean }): boolean {
  if (when === "fee") return p.feeSettled;
  if (when === "references") return p.pastReferencing;
  return false;
}
