import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexCall } from "@/lib/rex";
import { liveBook } from "@/lib/tenant-matching";
import type { OsListing } from "@/lib/rex-listings";
import type { HomesAnswer, MarketHome, MarketHomeDetail } from "@/lib/market-homes";

/**
 * FIND A HOME, INSIDE THE PORTAL (James, 18 Sep 2026: "they should be able to
 * do it in their platform rather than us trying to send them to the Letting
 * Experts page").
 *
 * Every home on the market: published, not let agreed, with a rent - the same
 * cut as lib/tenant-matching's liveBook, read from the shared listing cache so
 * a tenant browsing costs REX nothing.
 *
 * ── What a tenant sees, and what they never do ──────────────────────────
 *
 * The public facts only: address, rent, beds, type, photos, the portal
 * write-up, the available date and where it is. Never the landlord, the
 * service level, the agent's notes or anything else the board carries.
 * MarketHome is built field by field for that reason, not spread from the
 * listing.
 *
 * ── Bedrooms ────────────────────────────────────────────────────────────
 *
 * REX keeps bedrooms on the PROPERTY, not the listing, and neither the
 * listing search nor a batched property search will return them (measured
 * 18 Sep 2026: extra_fields is ignored, attr_* absent). Only Properties/read
 * has them, one home at a time. So they are read once per property and kept
 * in os_cache: a house does not grow a bedroom, and a week is plenty to pick
 * up the rare correction. A home whose beds could not be read shows no
 * figure and is never hidden by a beds filter it cannot answer.
 */

export type { MarketHome, MarketHomeDetail, HomesAnswer } from "@/lib/market-homes";

/* ── Bedrooms, kept ─────────────────────────────────────────────────────── */

type Rooms = { beds: number | null; baths: number | null; at: number };
const ROOMS_KEY = "tenant-homes:rooms:v1";
const ROOMS_KEEP_MS = 7 * 24 * 3600 * 1000;
/** First read after a deploy fills this; later requests answer from memory. */
let rooms: Record<string, Rooms> | null = null;

async function loadRooms(): Promise<Record<string, Rooms>> {
  if (rooms) return rooms;
  rooms = {};
  if (hasDb()) {
    const rows = await q<{ payload: Record<string, Rooms> }>(`SELECT payload FROM os_cache WHERE key = $1`, [ROOMS_KEY]).catch(() => []);
    if (rows[0]?.payload) rooms = rows[0].payload;
  }
  return rooms;
}

async function saveRooms(): Promise<void> {
  if (!hasDb() || !rooms) return;
  await q(
    `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
    [ROOMS_KEY, JSON.stringify(rooms)]
  ).catch(() => null);
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** One in flight at a time: two tenants arriving together read REX once. */
let filling: Promise<void> | null = null;

async function fillRooms(propertyIds: string[]): Promise<void> {
  const held = await loadRooms();
  const now = Date.now();
  const wanted = propertyIds.filter((id) => !held[id] || now - held[id].at > ROOMS_KEEP_MS);
  if (!wanted.length) return;
  if (filling) return filling;
  filling = (async () => {
    /* Six at a time: the whole book (~130 homes) in a few seconds the first
       time, without leaning on REX. */
    const queue = [...wanted];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const r = await rexCall("Properties", "read", { id: Number(id) }).catch(() => null);
        const p = (r && r.ok ? r.result : null) as Record<string, unknown> | null;
        if (p) held[id] = { beds: num(p.attr_bedrooms), baths: num(p.attr_bathrooms), at: Date.now() };
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await saveRooms();
  })().finally(() => {
    filling = null;
  });
  return filling;
}

/* ── The homes ──────────────────────────────────────────────────────────── */

function toHome(l: OsListing, r: Rooms | undefined): MarketHome {
  return {
    id: l.id,
    /* REX's unit name and the building both say what it is, so some come
       out "Apartment Apartment 30" or "Apartment Flat 28". Say it once. */
    name: l.name.replace(/^(apartment|flat)\s+(?=(apartment|flat)\b)/i, ""),
    locality: l.locality,
    postcode: l.postcode,
    lat: l.lat,
    lng: l.lng,
    rent: l.rent ?? l.rentMonthly ?? 0,
    rentPeriod: l.rentPeriod === "week" ? "week" : "month",
    rentPcm: l.rentMonthly ?? 0,
    beds: r?.beds ?? null,
    baths: r?.baths ?? null,
    propertyType: l.propertyType,
    photo: l.image,
    photoCount: l.images.length || l.imageCount,
    availableFrom: l.availableFrom,
    publishedAt: l.publishedAt,
    heading: l.advertHeading,
  };
}

/** Every home on the market, newest first. An error, never an empty list,
 *  when the book cannot be read - "nothing to rent" would be a lie. */
export async function homesOnMarket(): Promise<HomesAnswer> {
  let book: OsListing[];
  try {
    book = await liveBook();
  } catch {
    return { ok: false, error: "We couldn't load the homes on the market just now." };
  }
  if (!book.length) return { ok: false, error: "We couldn't load the homes on the market just now." };
  const ids = book.map((l) => l.propertyId).filter((id): id is string => Boolean(id));
  await fillRooms(ids).catch(() => null);
  const held = await loadRooms();
  const homes = book
    .map((l) => toHome(l, l.propertyId ? held[l.propertyId] : undefined))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return { ok: true, homes };
}

/** One home, with every photo and the full write-up. Null when it is not on
 *  the market any more - the page says so rather than showing a let home. */
export async function homeOnMarket(id: string): Promise<MarketHomeDetail | null> {
  const book = await liveBook().catch(() => [] as OsListing[]);
  const l = book.find((x) => x.id === String(id));
  if (!l) return null;
  if (l.propertyId) await fillRooms([l.propertyId]).catch(() => null);
  const held = await loadRooms();
  return { ...toHome(l, l.propertyId ? held[l.propertyId] : undefined), images: l.images.length ? l.images : l.image ? [l.image] : [], body: l.advertBody };
}
