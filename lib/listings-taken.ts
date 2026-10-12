import "server-only";
import { hasDb, q } from "@/lib/db";
import { sameHome } from "@/lib/address-parse";
import { assembled, type Assembled } from "@/lib/applications-board";
import { getAllPropolyDeals, getPropolyCompletes, type BusinessDeal, type CompletedDeal } from "@/lib/business/propoly-deals";

/**
 * TAKEN, WHATEVER REX SAYS (James, 12 Oct 2026).
 *
 * Listings said 65 available. About 28 of them were already let: an offer
 * accepted, a deal running in Propoly, a tenant moved in - and the advert
 * still published in REX because nobody marked it let agreed. "If we've had
 * that property go through applications at any point, or if it's on Propoly
 * and it's past [holding fee] paid, then the property isn't classed as live
 * anymore ... unless the deal gets cancelled off, [then] we should offer the
 * option to relist."
 *
 * So a published listing is TAKEN, and counts as let agreed on every screen
 * (lib/listing-stages), when since it went up:
 *   - an offer on it was accepted, here or in REX, and not turned down since;
 *   - Propoly has a deal on the home with the holding fee paid, or one that
 *     has got to referencing or later;
 *   - a tenant moved in through Propoly (one move-in, not a house that keeps
 *     letting rooms one after another).
 * And it FELL THROUGH when a Propoly deal on it that had got that far was
 * cancelled and nothing has taken it since: not available either, until an
 * agent presses Relist. Relisting is an OS fact; nothing is written to REX.
 *
 * Read at serve time, like the archive state, so a Relist shows at once.
 * Every source is best-effort: one that cannot be read adds no evidence, so
 * the listing reads as REX has it rather than being guessed at.
 */

export interface TakenState {
  /** Plain words: what took it, e.g. "Offer accepted for Sophie Hart". */
  why: string;
  at: string | null;
}

type L = { id: string; name: string; locality: string; publishedAt: string | null; createdAt: string | null; letAgreed: boolean; publicationStatus: string | null };

const PAST_FEE = new Set(["references", "tenancy_generation", "signing_and_move_in_monies"]);
const DAY = 86_400_000;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const minus = (iso: string, days: number) => new Date(Date.parse(iso) - days * DAY).toISOString().slice(0, 10);
const words = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) : "";

/* The relists. One row per listing, the latest press: evidence from before
   it no longer counts. */
let ready: Promise<void> | null = null;
async function rq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_listing_relists (
      listing_id TEXT PRIMARY KEY,
      relisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      by_user TEXT
    )`).then(() => undefined).catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

async function relists(): Promise<Map<string, string>> {
  if (!hasDb()) return new Map();
  const rows = await rq<{ listing_id: string; relisted_at: Date }>(`SELECT listing_id, relisted_at FROM os_listing_relists`).catch(() => []);
  return new Map(rows.map((r) => [r.listing_id, new Date(r.relisted_at).toISOString()]));
}

export async function relist(listingId: string, by: string | null): Promise<void> {
  if (!hasDb()) throw new Error("No database on this environment - a relist can't be remembered.");
  await rq(
    `INSERT INTO os_listing_relists (listing_id, relisted_at, by_user) VALUES ($1, NOW(), $2)
     ON CONFLICT (listing_id) DO UPDATE SET relisted_at = NOW(), by_user = EXCLUDED.by_user`,
    [listingId, by]
  );
}

/** The applications board's held copy, if it comes within a few seconds; never the reason the listings wait. */
async function applications() {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 6000));
  const got = await Promise.race([assembled(null).then((x) => x.held.value).catch(() => null), timeout]);
  return got;
}

/** Each listing's state: taken, fallen through, or neither (absent). */
export async function takenStates(listings: L[]): Promise<{ taken: Map<string, TakenState>; fellThrough: Map<string, TakenState> }> {
  const taken = new Map<string, TakenState>();
  const fellThrough = new Map<string, TakenState>();
  const live = listings.filter((l) => l.publicationStatus === "published" && !l.letAgreed);
  if (!live.length) return { taken, fellThrough };

  const [apps, deals, completes, relisted] = await Promise.all([
    applications(),
    getAllPropolyDeals().catch(() => null) as Promise<BusinessDeal[] | null>,
    getPropolyCompletes().catch(() => null) as Promise<CompletedDeal[] | null>,
    relists(),
  ]);
  return decideTaken(live, apps, deals, completes, relisted);
}

/** The rule itself, on what was read - kept apart so it can be run on a day's real data. */
export function decideTaken(
  live: L[],
  apps: Pick<Assembled, "applications" | "closed"> | null,
  deals: BusinessDeal[] | null,
  completes: CompletedDeal[] | null,
  relisted: Map<string, string>
): { taken: Map<string, TakenState>; fellThrough: Map<string, TakenState> } {
  const taken = new Map<string, TakenState>();
  const fellThrough = new Map<string, TakenState>();
  for (const l of live) {
    const address = [l.name, l.locality].filter(Boolean).join(", ");
    const listedOn = day(l.publishedAt ?? l.createdAt);
    /* Evidence counts from when it went up, or from the last relist. */
    const relistedAt = relisted.get(String(l.id)) ?? null;
    const since = [listedOn, day(relistedAt)].filter(Boolean).sort().pop() ?? null;
    const after = (at: string | null, slack = 0) => !since || (at != null && at.slice(0, 10) >= (slack ? minus(since, slack) : since));
    const found: TakenState[] = [];

    /* An offer accepted on this listing. Its own listing id, so it is this
       marketing round; turned down since means it no longer holds. */
    for (const a of apps?.applications ?? []) {
      if (String(a.listingId ?? "") !== String(l.id)) continue;
      const acceptedHere = a.status === "accepted" || a.osDecision?.decision === "accepted";
      if (!acceptedHere || a.status === "unsuccessful") continue;
      if (apps?.closed.get(a.id) === "Listing withdrawn") continue;
      const at = a.dateAccepted ?? a.osDecision?.at ?? a.dateReceived ?? null;
      if (relistedAt && at && at < relistedAt) continue;
      const tenant = a.applicants.find((p) => p.isPrimary)?.name ?? a.applicants[0]?.name ?? null;
      found.push({ why: `Offer accepted${tenant ? ` for ${tenant}` : ""}${at ? ` on ${words(at)}` : ""}`, at });
    }

    /* Propoly: a deal on the home, started since it was listed (a fortnight's
       slack - an offer agreed just before the advert went up still took it). */
    for (const d of deals ?? []) {
      if (!sameHome(address, [d.app.propertyName, d.app.locality].filter(Boolean).join(", "))) continue;
      if (!after(d.app.dateReceived, 14)) continue;
      const paid = d.app.propoly?.holdingPaid?.status === "paid";
      if (d.statusKey === "cancelled") {
        /* Only a deal that had got as far as taking it: fee paid, or referencing begun. */
        if (paid || d.app.propoly?.referencing?.startedAt) {
          fellThrough.set(String(l.id), { why: `Deal cancelled in Propoly (started ${words(d.app.dateReceived)})`, at: d.app.dateReceived });
        }
        continue;
      }
      if (paid || PAST_FEE.has(d.statusKey)) {
        found.push({ why: paid ? `Holding fee paid in Propoly${d.app.propoly?.holdingPaid?.paidAt ? ` on ${words(d.app.propoly.holdingPaid.paidAt)}` : ""}` : `${d.app.status} in Propoly`, at: d.app.propoly?.holdingPaid?.paidAt ?? d.app.dateReceived });
      }
    }

    /* Moved in through Propoly since it went up. A house letting room after
       room on one advert shows move-ins weeks apart and stays live; one let,
       or a houseful moving in together, takes it. */
    const ins = (completes ?? []).filter((c) => c.address && c.date && after(c.date) && sameHome(address, c.address)).map((c) => c.date!).sort();
    if (ins.length && Date.parse(ins[ins.length - 1]) - Date.parse(ins[0]) <= 10 * DAY) {
      found.push({ why: `Moved in through Propoly on ${words(ins[0])}`, at: ins[0] });
    }

    if (found.length) {
      found.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
      taken.set(String(l.id), found[0]);
      fellThrough.delete(String(l.id));
    } else if (fellThrough.has(String(l.id)) && relistedAt && (fellThrough.get(String(l.id))!.at ?? "") < relistedAt) {
      fellThrough.delete(String(l.id));
    }
  }
  return { taken, fellThrough };
}

/** The book with each listing stamped: taken, fellThrough, or both null. */
export async function withTakenState<T extends { listings: L[] }>(payload: T): Promise<T & { listings: Array<T["listings"][number] & { taken: TakenState | null; fellThrough: TakenState | null }> }> {
  const { taken, fellThrough } = await takenStates(payload.listings).catch(() => ({ taken: new Map<string, TakenState>(), fellThrough: new Map<string, TakenState>() }));
  return {
    ...payload,
    listings: payload.listings.map((l) => ({ ...l, taken: taken.get(String(l.id)) ?? null, fellThrough: fellThrough.get(String(l.id)) ?? null })),
  };
}
