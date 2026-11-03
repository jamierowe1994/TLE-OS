import "server-only";
import { hasDb, q } from "@/lib/db";
import { londonToday } from "@/lib/london-clock";
import { currentMonth } from "@/lib/business/format";
import { getPortfolioBook, type PortfolioBook } from "@/lib/business/payprop-portfolio";
import { BOOK_REGIONS, type BookRegionOrUnknown } from "@/lib/business/book-regions";

/**
 * GROWTH AND LOSS BY REGION (Susan Liles, 3 Nov 2026): "be good to track the
 * portfolio growth/loss over the same period of time".
 *
 * - Joined: PayProp's own listed_from day on each home, so it is right for any
 *   month, back to the start of the book.
 * - Left: PayProp archives a home with no date on it, so a loss is a home that
 *   was in the daily book record (os_portfolio_book_daily) and is no longer on
 *   the book. That record starts on the day this shipped; a month before it
 *   says so rather than showing a nought.
 */

type Homes = NonNullable<PortfolioBook["homes"]>;

/** Today's line in the record. Called after each successful walk of the book. */
export async function recordBook(book: PortfolioBook): Promise<void> {
  if (!hasDb() || !book.homes || Object.keys(book.homes).length === 0) return;
  await q(
    `INSERT INTO os_portfolio_book_daily (day, homes, taken_at) VALUES ($1, $2, NOW())
     ON CONFLICT (day) DO UPDATE SET homes = EXCLUDED.homes, taken_at = NOW()`,
    [londonToday(), JSON.stringify(book.homes)]
  );
}

export interface RegionGrowth {
  key: BookRegionOrUnknown;
  /** Homes on the book today. */
  now: number;
  /** Homes PayProp lists from a day in the month. */
  joined: number;
  /** Homes that left the book in the month; null when the record doesn't reach it. */
  left: number | null;
}

export interface PortfolioGrowth {
  month: string;
  regions: RegionGrowth[];
  total: { now: number; joined: number; left: number | null };
  /** Set when the record starts part-way through the month: losses are counted from this day. */
  leftFrom: string | null;
  /** The first day the record holds at all, for the "not recorded" note. */
  recordStarted: string | null;
  /** Homes still on the book whose region changed in the month (a postcode put right, or Margo's homes moving to Sean). */
  moved: number;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const KEYS: BookRegionOrUnknown[] = [...BOOK_REGIONS.map((r) => r.key), "unknown"];

/**
 * Growth and loss by region for a month ("YYYY-MM"). Null while the book with
 * regions hasn't been walked yet - the caller asks again.
 */
export async function getPortfolioGrowth(month: string): Promise<PortfolioGrowth | null> {
  const book = await getPortfolioBook();
  if (!book?.homes || !book.byRegion) return null;

  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const isCurrent = month === currentMonth();

  /* The line from the day before the month opened, through its last day. */
  const rows = hasDb()
    ? await q<{ day: string; homes: Homes }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, homes FROM os_portfolio_book_daily
          WHERE day >= $1 AND day <= $2 ORDER BY day`,
        [addDays(monthStart, -1), monthEnd]
      )
    : [];
  const first = hasDb()
    ? (await q<{ day: string | null }>(`SELECT to_char(MIN(day), 'YYYY-MM-DD') AS day FROM os_portfolio_book_daily`))[0]?.day ?? null
    : null;
  return growthFrom(month, isCurrent, book, rows, first);
}

/** The arithmetic, apart from the reads, so it can be checked against the live book on its own. */
export function growthFrom(
  month: string,
  isCurrent: boolean,
  book: PortfolioBook,
  rows: Array<{ day: string; homes: Homes }>,
  first: string | null
): PortfolioGrowth | null {
  if (!book.homes || !book.byRegion) return null;
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  /* The book at the month's end: today's for this month, else its last line. */
  const inMonth = rows.filter((r) => r.day >= monthStart);
  const end: Homes | null = isCurrent ? book.homes : inMonth.length ? inMonth[inMonth.length - 1].homes : null;

  const blank = () => Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<BookRegionOrUnknown, number>;
  const joined = blank();
  const left = blank();

  /* Every home the record saw in the month, with the region it last had. */
  const seen = new Map<string, [BookRegionOrUnknown, string | null]>();
  for (const r of rows) for (const [id, v] of Object.entries(r.homes)) seen.set(id, v);
  for (const [id, v] of Object.entries(book.homes)) seen.set(id, v);

  const homesNow = book.homes;
  for (const [id, [region, listedFrom]] of seen) {
    if (listedFrom && listedFrom >= monthStart && listedFrom <= monthEnd) {
      /* A home still on the book counts in its region today. */
      const now = homesNow[id]?.[0] ?? region;
      joined[now] = (joined[now] ?? 0) + 1;
    }
  }

  /* A home in any line of the month and not on the book at its end has left,
     counted once, in the region it last had. */
  const leftKnown = Boolean(end && rows.length);
  if (leftKnown && end) {
    const gone = new Set<string>();
    for (const r of rows) for (const id of Object.keys(r.homes)) if (!end[id]) gone.add(id);
    for (const id of gone) left[seen.get(id)?.[0] ?? "unknown"]++;
  }

  let moved = 0;
  if (rows.length && end) {
    for (const [id, [region]] of Object.entries(rows[0].homes)) {
      if (end[id] && end[id][0] !== region) moved++;
    }
  }

  const earliest = rows[0]?.day ?? null;
  const regions: RegionGrowth[] = KEYS.map((key) => ({
    key,
    now: book.byRegion?.[key]?.properties ?? 0,
    joined: joined[key],
    left: leftKnown ? left[key] : null,
  }));
  return {
    month,
    regions,
    total: {
      now: book.totalProperties,
      joined: regions.reduce((n, r) => n + r.joined, 0),
      left: leftKnown ? regions.reduce((n, r) => n + (r.left ?? 0), 0) : null,
    },
    leftFrom: leftKnown && earliest && earliest > monthStart ? earliest : null,
    recordStarted: first,
    moved,
  };
}
