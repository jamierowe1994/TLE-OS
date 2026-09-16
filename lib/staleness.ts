/**
 * HOW LONG A COPY MAY BE BELIEVED.
 *
 * James, 13 Sep 2026, on the OS owning its own data: "the risk in owning the
 * data is somebody edits in REX and we keep showing our copy. Each type needs
 * its own answer - rent and availability are minutes, a landlord's phone
 * number is days." This is that answer, in one place.
 *
 * It exists because the answer was in nine places. The rental book believed a
 * copy for ten minutes and kept one for six hours; compliance for an hour and
 * a day; applications for a minute; geocodes for six months; and every one of
 * those numbers was chosen inside the file that happened to need it. Nobody
 * could read the list, so nobody could argue with it - which is how a screen
 * ends up showing yesterday's figure and nobody notices for a fortnight.
 *
 * ── The three states, and the one that matters ────────────────────────────
 *
 *   fresh    inside its window. Show it.
 *   ageing   past the window, still worth showing WHILE a fresh one is
 *            fetched - and only for the kinds where that is honest.
 *   gone     too old to show at all. The screen shows an error state and
 *            NEVER the old number. This is the live-figures rule from
 *            ~/.claude/CLAUDE.md, enforced rather than remembered.
 *
 * "Ageing" is the dangerous one, so it is opt-in per kind rather than a
 * default. A month's figures may be shown ageing because they are always
 * labelled as at a time; a diary may not, because a viewing booked into a slot
 * somebody else took ten seconds ago is a person standing outside a house.
 *
 * ── A DECISION NEVER READS A CACHE ────────────────────────────────────────
 *
 * Showing a figure and acting on one are different questions. Booking into a
 * diary, publishing a listing, approving a compliance pack, running a handover
 * - each of those writes somewhere on the strength of what it read, and being
 * a minute out of date is how two viewings land in one slot or a pack is
 * approved on a certificate that expired this morning. `forDecision` answers
 * zero: fetch it now, whatever the cache says.
 *
 * ── These numbers are arguable, and that is the point ─────────────────────
 *
 * Every one carries the cost of being wrong in its own words, so the next
 * person can disagree with the reason rather than guess at the number.
 */

export type RecordKind =
  | "listing-book"
  | "listing"
  | "retired-listings"
  | "property"
  | "contact"
  | "diary"
  | "application"
  | "compliance"
  | "feedback"
  | "figures"
  | "roster"
  | "geocode";

export interface Rule {
  /** Believe a stored copy for this long without asking again. */
  freshMs: number;
  /** Past this it is not shown at all, however it is labelled. */
  keepMs: number;
  /** May an ageing copy be shown while a fresh one is fetched behind it? */
  showWhileRefreshing: boolean;
  /** What it costs to be wrong. The reason to argue with, not the number. */
  why: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RULES: Record<RecordKind, Rule> = {
  /* The whole rental book behind the Listings board. Ten minutes is what it
     has always used and it has held up: the board is a list to scan, and a
     listing somebody edited two minutes ago still appears - just without that
     edit, which the listing's own screen corrects the moment it is opened. */
  "listing-book": { freshMs: 10 * MINUTE, keepMs: 6 * HOUR, showWhileRefreshing: true, why: "A board to scan. A ten-minute-old list is still the right list; a board that will not load is not." },

  /* ONE listing, with its rent, its availability and its status. Two minutes,
     because these are the numbers an agent repeats to a tenant on the phone.
     A rent that is £50 out is a promise we cannot keep, and "still available"
     about a property let this morning is worse. */
  listing: { freshMs: 2 * MINUTE, keepMs: 10 * MINUTE, showWhileRefreshing: false, why: "The rent and the availability get said out loud to a tenant. Wrong by £50, or let this morning, is a promise broken." },

  /* Withdrawn and archived listings: nothing about them changes by the hour,
     and they are only ever looked at deliberately. */
  "retired-listings": { freshMs: 12 * HOUR, keepMs: 7 * DAY, showWhileRefreshing: true, why: "Nothing about a withdrawn listing changes by the hour." },

  /* The property itself - address, type, bedrooms, the physical facts. These
     change when somebody corrects a typo, not when the market moves. */
  property: { freshMs: DAY, keepMs: 7 * DAY, showWhileRefreshing: true, why: "Bricks do not move. A day-old address is the address." },

  /* A person's phone number and email. James's own example of the slow end:
     days, not minutes. The cost of being stale is ringing an old mobile; the
     cost of refusing to show it is not being able to ring at all. */
  contact: { freshMs: 3 * DAY, keepMs: 14 * DAY, showWhileRefreshing: true, why: "A number changes about once a year. Having an old one beats having none - but not for a fortnight." },

  /* The diary. Sixty seconds, and never shown ageing: two agents booking into
     one slot ends with somebody standing outside a house. */
  diary: { freshMs: MINUTE, keepMs: 5 * MINUTE, showWhileRefreshing: false, why: "Two people booking the same slot ends with somebody standing outside a house." },

  /* Applications and where they are in the pipeline. A minute, as they always
     have been: fast enough that two people working the same deal do not
     disagree, slow enough that a board does not hammer REX on every keystroke. */
  application: { freshMs: MINUTE, keepMs: 10 * MINUTE, showWhileRefreshing: false, why: "Two people work the same deal. A minute keeps them agreeing without hammering the source." },

  /* Certificates and their expiry dates. An hour to LOOK at; never for a
     decision - see forDecision. A pack approved on a certificate that expired
     this morning is a compliance failure with our name on it. */
  compliance: { freshMs: HOUR, keepMs: DAY, showWhileRefreshing: true, why: "Fine to read an hour old; never to approve on. An expiry that passed this morning is a legal failure, not a stale number." },

  /* Viewing feedback. Nobody is harmed by reading it a quarter of an hour late. */
  feedback: { freshMs: 15 * MINUTE, keepMs: 2 * HOUR, showWhileRefreshing: true, why: "Nobody is harmed by reading a comment fifteen minutes late." },

  /* The month's figures on the dashboard. The one kind that is allowed to show
     while it refreshes, because it is ALWAYS drawn with the time it was read
     beside it - a labelled figure as at 14:13 is a fact, not a stale number.
     Kept for a week so a quiet month still has something to draw. */
  figures: { freshMs: 15 * MINUTE, keepMs: 7 * DAY, showWhileRefreshing: true, why: "Always drawn with the time it was read. A figure as at 14:13 is a fact; the same figure with no time on it is a lie." },

  /* Who works here and what they hold. Changes when somebody joins. */
  roster: { freshMs: HOUR, keepMs: DAY, showWhileRefreshing: true, why: "Changes when somebody joins or leaves, which is not this hour." },

  /* Where an address is on a map. Six months, because it is a fact about the
     world and each lookup is somebody else's rate limit. */
  geocode: { freshMs: 180 * DAY, keepMs: 365 * DAY, showWhileRefreshing: true, why: "A street does not move, and each lookup spends somebody else's quota." },
};

export type FreshnessState = "fresh" | "ageing" | "gone";

export interface Freshness {
  state: FreshnessState;
  ageMs: number;
  /** Show this copy to a person? False means an error state, never the number. */
  show: boolean;
  /** Go and get a new one, now or behind the screen? */
  refresh: boolean;
  /** "read 4 minutes ago" - for the line beside an ageing figure. */
  asAt: string;
}

/** "just now", "4 minutes ago", "yesterday" - said the way a person would. */
export function ageWords(ms: number): string {
  if (ms < 45_000) return "just now";
  const mins = Math.round(ms / MINUTE);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(ms / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Where a stored copy stands, and what to do about it.
 *
 * `at` is when it was READ FROM THE SOURCE, not when it was written to our
 * table - the two drift apart the moment anything is copied between rows, and
 * the question here is always "how old is this fact", never "how old is this
 * row". Null (we never read it) is treated as gone, which is the safe end.
 */
export function freshnessOf(kind: RecordKind, at: number | Date | string | null | undefined, now = Date.now()): Freshness {
  const rule = RULES[kind];
  const read = at == null ? null : typeof at === "number" ? at : new Date(at).getTime();
  if (read == null || Number.isNaN(read)) {
    return { state: "gone", ageMs: Infinity, show: false, refresh: true, asAt: "never read" };
  }
  const ageMs = Math.max(0, now - read);
  const asAt = ageWords(ageMs);
  if (ageMs < rule.freshMs) return { state: "fresh", ageMs, show: true, refresh: false, asAt };
  if (ageMs < rule.keepMs) {
    return { state: "ageing", ageMs, show: rule.showWhileRefreshing, refresh: true, asAt };
  }
  return { state: "gone", ageMs, show: false, refresh: true, asAt };
}

/**
 * Acting on it, not showing it.
 *
 * Booking into a diary, publishing a listing, approving a pack, running a
 * handover: read it now. Returns zero rather than a short window on purpose -
 * "nearly fresh" is the reasoning that puts two viewings in one slot.
 */
export function forDecision(): number {
  return 0;
}

/** Is this copy good enough to act on? Only if it was read this second. */
export function freshEnoughToActOn(at: number | Date | string | null | undefined, now = Date.now()): boolean {
  const read = at == null ? null : typeof at === "number" ? at : new Date(at).getTime();
  return read != null && !Number.isNaN(read) && now - read <= 2_000;
}

/** The whole rule as a table, for the wiring sheet and for arguing with. */
export function ruleTable(): { kind: RecordKind; fresh: string; kept: string; ageing: string; why: string }[] {
  return (Object.keys(RULES) as RecordKind[]).map((kind) => {
    const r = RULES[kind];
    const span = (ms: number) =>
      ms >= DAY ? `${Math.round(ms / DAY)} day${ms >= 2 * DAY ? "s" : ""}` : ms >= HOUR ? `${Math.round(ms / HOUR)} hour${ms >= 2 * HOUR ? "s" : ""}` : `${Math.round(ms / MINUTE)} minute${ms >= 2 * MINUTE ? "s" : ""}`;
    return { kind, fresh: span(r.freshMs), kept: span(r.keepMs), ageing: r.showWhileRefreshing ? "shown while it refreshes" : "hidden, never shown old", why: r.why };
  });
}
