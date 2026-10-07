import "server-only";
import { hasDb, q } from "@/lib/db";
import { getApplications } from "@/lib/applications";

/**
 * When somebody last did something on a listing or an application.
 *
 * James, 6 Oct 2026: "Room 2 has the most recent activity on there, and
 * therefore that one should be shown at the top ... we should be able to
 * click the Activity button and show the most recent work we've been doing."
 * The boards were in REX's order - last edited in REX for listings, newest
 * created for applications - and an offer accepted this morning does not
 * touch the listing's REX record at all.
 *
 * So activity is the latest of everything the OS can see happen to the file:
 *
 *   application  REX's own last change, comments, the PLC pack moving, the
 *                handover running, an update put with the agent
 *   listing      REX's own last change (the board has it), every
 *                application on it, viewings booked or held, archiving
 *
 * Only dates already written by something real. Nothing here is a guess,
 * and a source that fails to read is skipped rather than failing the board.
 */

const ms = (v: string | Date | number | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
};

function bump(map: Map<string, number>, id: string | number | null | undefined, at: number) {
  if (id == null || id === "" || !at) return;
  const k = String(id);
  if (at > (map.get(k) ?? 0)) map.set(k, at);
}

async function rows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!hasDb()) return [];
  return q<T>(sql).catch(() => [] as T[]);
}

export interface Activity {
  /** Application id → ISO time of the latest thing that happened to it. */
  applications: Record<string, string>;
  /** Listing id → ISO time of the latest thing that happened to it. */
  listings: Record<string, string>;
  /**
   * Listings with an accepted offer that is still on its way in (6 Oct 2026:
   * "it's weird that it pushes it to applications, but then it still shows
   * in listings"). The board treats these as let agreed: the work is in
   * Applications now.
   */
  accepted: string[];
}

/* An accepted application counts only while its tenancy is still arriving:
   a listing used for the same room again carries the last tenant's accepted
   offer, and that must not take the new advert off the board. */
const ARRIVING_DAYS = 14;

export async function activity(): Promise<Activity> {
  const now = Date.now();
  const app = new Map<string, number>();
  const listing = new Map<string, number>();

  const [book, comments, plc, handovers, updates, viewings, archived, decided] = await Promise.all([
    getApplications(300).catch(() => []),
    rows<{ id: string; at: string }>(
      `SELECT application_id AS id, MAX(created_at) AS at FROM os_application_comments GROUP BY 1`
    ),
    rows<{ id: string; at: string }>(`SELECT application_ref AS id, MAX(updated_at) AS at FROM os_plc_cases GROUP BY 1`),
    rows<{ id: string; at: string }>(
      `SELECT application_id AS id, MAX(COALESCE(finished_at, started_at)) AS at FROM os_handovers GROUP BY 1`
    ),
    rows<{ id: string; at: string }>(
      `SELECT application_id AS id, MAX(created_at) AS at FROM os_customer_updates WHERE application_id IS NOT NULL GROUP BY 1`
    ),
    /* A viewing counts when it was booked, and again when it happens - but
       never from the future, or a viewing next week would sit on top today. */
    rows<{ id: string; booked: string; held: string | null }>(
      `SELECT listing_id AS id, MAX(first_seen) AS booked,
              MAX(starts_at) FILTER (WHERE starts_at <= NOW() AND NOT COALESCE(cancelled, false)) AS held
         FROM os_viewings WHERE listing_id IS NOT NULL GROUP BY 1`
    ),
    rows<{ id: string; at: string }>(`SELECT listing_id AS id, MAX(at) AS at FROM os_listing_archive GROUP BY 1`),
    /* Offers accepted by the agent in the OS (lib/offer-decisions, 7 Oct
       2026): the home is let agreed from then, as it is when REX accepts. */
    rows<{ ref: string; listing_id: string | null; at: string }>(
      `SELECT ref, listing_id, decided_at AS at FROM os_offer_decisions WHERE decision = 'accepted' AND decided_at > NOW() - INTERVAL '60 days'`
    ),
  ]);

  for (const a of book) bump(app, a.id, Math.max(ms(a.updatedAt), ms(a.createdAt)));
  for (const r of comments) bump(app, r.id, ms(r.at));
  for (const r of plc) bump(app, r.id, ms(r.at));
  for (const r of handovers) bump(app, r.id, ms(r.at));
  for (const r of updates) bump(app, r.id, ms(r.at));

  /* A listing carries the activity of every application on it. */
  for (const a of book) if (a.listingId != null) bump(listing, a.listingId, app.get(String(a.id)) ?? 0);
  for (const r of viewings) bump(listing, r.id, Math.max(ms(r.booked), ms(r.held)));
  for (const r of archived) bump(listing, r.id, ms(r.at));

  const since = new Date(now - ARRIVING_DAYS * 86400000).toISOString().slice(0, 10);
  const accepted = [
    ...new Set(
      book
        .filter(
          (a) =>
            a.status === "accepted" &&
            a.listingId != null &&
            (a.startDate ? a.startDate.slice(0, 10) >= since : ms(a.createdAt) > now - 60 * 86400000)
        )
        .map((a) => String(a.listingId))
    ),
  ];
  const byApp = new Map(book.map((a) => [`rex:${a.id}`, a]));
  for (const d of decided) {
    const a = byApp.get(d.ref);
    if (a && a.status === "unsuccessful") continue;
    const id = d.listing_id ?? (a?.listingId != null ? String(a.listingId) : null);
    if (id && !accepted.includes(id)) accepted.push(id);
    if (id) bump(listing, id, ms(d.at));
  }

  const out = (m: Map<string, number>) =>
    Object.fromEntries([...m].filter(([, t]) => t <= now + 60_000).map(([k, t]) => [k, new Date(t).toISOString()]));
  return { applications: out(app), listings: out(listing), accepted };
}
