import "server-only";
import { isLondonMidnight, londonDayOffset, londonHHMM } from "@/lib/london-time";
import { rexCall, rexConfigured, RexError, rexRows } from "@/lib/rex";
import type { Appt, ApptKind } from "@/lib/diary";
import { feedbackByIds } from "@/lib/rex-feedback";
import { hasDb, q } from "@/lib/db";

/**
 * The lettings team's diary, live from REX.
 *
 * WHOSE DIARY IS IT? This REX account holds SIX businesses' calendars — of
 * 671 events in a fortnight, 482 belong to The Property Experts (sales) and
 * only 91 to The Letting Experts. The reliable divider is the calendar
 * OWNER'S EMAIL DOMAIN, not the title: filtering on the "TLE " title prefix
 * finds 20 events where the owner's domain finds 91, because most of an
 * agent's day (appointments, inventory prep, check-ins) carries no prefix
 * at all.
 *
 * WHAT IT SHOWS. Everything in their working day, not just viewings — a
 * diary that hides the training session and the inventory prep tells you an
 * agent is free when they are not, which is exactly how a double-booking
 * happens.
 *
 * PRIVACY. Real diaries contain "Tennis" and "Pie & Chips". Events REX marks
 * private show as "Busy" with no detail: the OS needs to know the slot is
 * taken, and has no business republishing what somebody is doing in it.
 */

/** Whose calendars count as ours. */
const OUR_DOMAIN = "thelettingexperts.co.uk";
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
/** How far either side of today to read. */
const DAYS_BACK = 14;
/* Three months ahead, not three weeks (15 Sep 2026): James, "otherwise
   they're going to have to restart their whole diary and flick between the two
   systems". A viewing booked in REX for five weeks' time has to be in the OS
   diary too. MAX_PAGES still bounds the read. */
const DAYS_FORWARD = 90;

interface RexEvent extends Record<string, unknown> {
  id?: string;
  appointment_type?: { name?: string | null } | null;
  title?: string | null;
  description?: string | null;
  is_private?: boolean | null;
  is_cancelled?: boolean | null;
  starts_at?: { time?: string } | null;
  ends_at?: { time?: string } | null;
  event_location?: { description?: string | null; latitude?: string | null; longitude?: string | null } | null;
  calendar?: { owner_user?: { name?: string; email_address?: string } | null } | null;
  organiser_user?: { name?: string; email_address?: string } | null;
  /** What the event is attached to: the listing, the property, the contacts
   *  and the feedback written up afterwards. */
  records?: { id?: string | number; service?: string; label?: string | null }[] | null;
}

function ownerOf(e: RexEvent): { name: string; email: string } {
  const u = e.calendar?.owner_user ?? e.organiser_user ?? null;
  return { name: u?.name ?? "—", email: (u?.email_address ?? "").toLowerCase() };
}

/**
 * EVERYBODY WITH AN ACCOUNT, WHATEVER THEIR ADDRESS (24 Sep 2026).
 *
 * The lettings domain was the only door, so Howard (theexpertsgroup.co.uk)
 * and James Crumpton (thepropertyexperts.co.uk) each saw an empty diary over
 * a full REX calendar. James: "it shouldn't be locked down to the Letting
 * Experts". The other businesses on this REX account stay out - only people
 * who have an OS account come in - and each still sees only their own
 * (app/api/diary). Keyed by address, with their OS name: REX may call the
 * calendar something else ("Automated System" is Howard's).
 */
async function accountPeople(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!hasDb()) return out;
  const rows = await q<{ email: string; name: string; rex_email: string | null }>(
    `SELECT u.email, u.name, t.rex_email FROM os_users u LEFT JOIN os_rex_tokens t ON t.user_id = u.id`
  ).catch(() => []);
  for (const r of rows) {
    const name = (r.name ?? "").trim();
    for (const e of [r.email, r.rex_email]) {
      const k = (e ?? "").trim().toLowerCase();
      if (k && !k.endsWith(`@${OUR_DOMAIN}`)) out.set(k, name);
    }
  }
  return out;
}

/** Ours if the calendar belongs to a lettings mailbox, or to somebody with an account. */
export function isOurs(e: RexEvent, accounts?: Map<string, string>): boolean {
  const email = ownerOf(e).email;
  return email.endsWith(`@${OUR_DOMAIN}`) || Boolean(accounts?.has(email));
}

/**
 * What kind of appointment is this? REX has no event-type field populated
 * here, so the title is all there is — matched conservatively, with anything
 * unrecognised left as "other" rather than promoted to a viewing it isn't.
 */
export function kindOf(title: string): ApptKind {
  const t = title.toLowerCase();
  if (t.includes("viewing")) return "viewing";
  if (t.includes("appraisal") || t.includes("valuation")) return "appraisal";
  if (t.includes("inventory") || t.includes("inspection") || t.includes("check in") || t.includes("check-in"))
    return "inspection";
  if (t.includes("move in") || t.includes("move-in") || t.includes("check out")) return "movein";
  if (t.includes("take on") || t.includes("take-on") || t.includes("photos")) return "takeon";
  return "other";
}

/** "TLE Accompanied Viewing at 52 Sunflower Road, Bristol with Jack Ellis" */
function partsOf(title: string): { what: string; who: string } {
  // Strip the brand prefix — the OS already knows whose product it is.
  const clean = title.replace(/^(TLE|TPE|TEG)\s+/i, "").trim();
  const withMatch = /\s+with\s+(.+)$/i.exec(clean);
  const who = withMatch ? withMatch[1].trim() : "";
  let what = withMatch ? clean.slice(0, withMatch.index).trim() : clean;
  // "Accompanied Viewing at 80 Edward Street, Sheffield" → "Accompanied
  // Viewing". The address is carried separately in `where`, and printing it
  // twice in one row is how a list stops being readable.
  what = what.replace(/\s+at\s+.+$/i, "").trim();
  return { what: what || clean, who };
}

/** Days from today, as the Appt type counts them - on the LONDON calendar.
 *  See lib/london-time for why the server's own clock is the wrong one. */
function dayOffset(iso: string): number {
  return londonDayOffset(iso);
}

function hhmm(iso: string): string {
  return londonHHMM(iso);
}

/** The id of the feedback record REX has hung off this event, if any. */
function feedbackIdOf(e: RexEvent): string | null {
  const r = (e.records ?? []).find((x) => x?.service === "Feedback" && x.id != null);
  return r?.id != null ? String(r.id) : null;
}

/** One linked record of a given service. */
function linked(e: RexEvent, service: string): { id: string; label: string | null } | null {
  const r = (e.records ?? []).find((x) => x?.service === service && x.id != null);
  return r?.id != null ? { id: String(r.id), label: r.label ?? null } : null;
}

function toAppt(e: RexEvent, accounts?: Map<string, string>): Appt | null {
  const startIso = e.starts_at?.time;
  if (!startIso) return null;
  const endIso = e.ends_at?.time;
  const mins = endIso
    ? Math.max(15, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000))
    : 30;

  /**
   * All-day, inferred — REX gives us no flag for it.
   *
   * The RexEvent shape carries no `is_all_day` (checked against the live
   * payload), so it has to be read off the times: an entry that starts at
   * local midnight and runs a full day or longer is a day off, a course or a
   * block, not something booked for 00:00. The old code kept these at
   * `start: "00:00"` and only capped their HEIGHT — which is the wrong axis.
   * The height never mattered; the midnight START is what dragged the grid's
   * window open and squeezed the working day into half the screen.
   *
   * A 22-hour span with a 00:15 start is not caught, and shouldn't be: that
   * is a genuinely odd entry and seeing it is the right outcome.
   */
  const allDay = isLondonMidnight(startIso) && (!endIso || mins >= 20 * 60);

  const owner = ownerOf(e);
  const priv = Boolean(e.is_private);
  const title = (e.title ?? "").trim();
  const { what, who } = partsOf(title);
  const loc = e.event_location?.description ?? "";
  const lat = e.event_location?.latitude ? Number(e.event_location.latitude) : undefined;
  const lng = e.event_location?.longitude ? Number(e.event_location.longitude) : undefined;

  return {
    id: `rex-${e.id}`,
    day: dayOffset(startIso),
    start: hhmm(startIso),
    mins: Math.min(mins, 8 * 60), // a long block shouldn't paint over the grid
    ...(allDay ? { allDay: true } : {}),
    kind: priv ? "other" : kindOf(title),
    ...(!priv && kindOf(title) === "viewing" && /unaccompanied/i.test(`${e.appointment_type?.name ?? ""} ${title}`)
      ? { unaccompanied: true }
      : {}),
    what: priv ? "Busy" : what || "(untitled)",
    where: priv ? "" : loc,
    who: priv ? "" : who,
    /* Their OS name for anybody let in by account: the booker narrows on
       the name, and "Automated System" would never match "Howard Russell". */
    agent: accounts?.get(owner.email) || owner.name,
    agentEmail: owner.email || undefined,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    // We do NOT know from a calendar entry whether the confirmations went,
    // nor whether the property has a sitting tenant. Both are left undefined
    // so the screen can say "not known" — an empty comms list would render
    // as "all confirmed", which is a reassurance we have not earned.
    tenant: undefined,
    comms: [],
    fromRex: true,
    /* The record, by id rather than by parsing the address out of the title.
       Private entries keep none of it: the point of "Busy" is that we do not
       republish what somebody is doing. */
    ...(priv
      ? null
      : (() => {
          const listing = linked(e, "Listings");
          const property = linked(e, "Properties");
          return {
            listingId: listing?.id ?? null,
            propertyId: property?.id ?? null,
            ...(listing
              ? { link: { href: `/listings?open=${listing.id}`, label: listing.label ?? loc ?? "The listing" } }
              : null),
          };
        })()),
  };
}

export interface DiaryBook {
  appts: Appt[];
  /** So the screen can be honest about whose diary this is. */
  agents: string[];
  scanned: number;
  ours: number;
  from: string;
  to: string;
}

export async function fetchDiary(): Promise<DiaryBook> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - DAYS_BACK);
  const to = new Date(now);
  to.setDate(now.getDate() + DAYS_FORWARD);

  if (!rexConfigured()) {
    return { appts: [], agents: [], scanned: 0, ours: 0, from: from.toISOString(), to: to.toISOString() };
  }

  const iso = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  const accounts = await accountPeople();

  // Step one: which calendars are ours? 134 exist across the six businesses
  // sharing this REX account; 22 belong to lettings mailboxes. Asking REX for
  // only those turns a 6,459-event scan into ~533.
  const calIds: string[] = [];
  for (let page = 0; page < 3; page++) {
    const res = await rexCall("Calendars", "search", { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    /* Thrown, not skipped: with no calendar ids the search below runs across
       all six businesses and stops, silently, a couple of days out. */
    if (!res.ok) throw new RexError("Calendars/search", res);
    const rows = rexRows(res.result) as { id?: string; owner_user?: { email_address?: string } }[];
    for (const c of rows) {
      const owner = (c.owner_user?.email_address ?? "").toLowerCase();
      if ((owner.endsWith(`@${OUR_DOMAIN}`) || accounts.has(owner)) && c.id) {
        calIds.push(c.id);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }

  /* PAGES SIDE BY SIDE (19 Sep 2026). This walked the book one page at a
     time, each waiting for the last - ten or so REX calls end to end, which is
     most of the half-minute a cold diary took. Page one says how many there
     are; the rest go four at a time. Still oldest first, still stopping once a
     page runs past the window, still refusing a refused page. */
  const page = async (n: number) => {
    const res = await rexCall("CalendarEvents", "search", {
      limit: PAGE_SIZE,
      offset: n * PAGE_SIZE,
      criteria: [
        // Only ">=" is supported for dates here — "between" 500s.
        { name: "starts_at", type: ">=", value: iso(from) },
        // NOTE: the field is `calendar_id`. `calendar.id` is accepted and
        // then SILENTLY IGNORED, returning the unfiltered book — so the
        // owner-domain check below stays as a second line of defence rather
        // than trusting this filter to have applied.
        ...(calIds.length ? [{ name: "calendar_id", type: "in", value: calIds }] : []),
      ],
      order_by: { starts_at: "asc" },
    });
    /* A refusal is not an empty diary (18 Sep 2026). `break` on page one gave
       "nothing booked" and every slot free, cached as live; part-way through
       it dropped the rest of the book - the FUTURE, since this reads oldest
       first. Thrown, the route serves the last true book or says it failed. */
    if (!res.ok) throw new RexError("CalendarEvents/search", res);
    const total = Number((res.result as { total?: number | string } | null)?.total ?? NaN);
    return { batch: rexRows(res.result) as RexEvent[], total };
  };
  const pastWindow = (batch: RexEvent[]) => {
    const last = batch[batch.length - 1]?.starts_at?.time;
    return Boolean(last && new Date(last) > to);
  };

  const rows: RexEvent[] = [];
  const first = await page(0);
  rows.push(...first.batch);
  if (first.batch.length === PAGE_SIZE && !pastWindow(first.batch)) {
    /* No total from REX means we cannot know how far to go, so walk it. */
    const pages = Number.isFinite(first.total) ? Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE)) : MAX_PAGES;
    const ABREAST = Number.isFinite(first.total) ? 4 : 1;
    walk: for (let n = 1; n < pages; n += ABREAST) {
      const wave = await Promise.all(
        Array.from({ length: Math.min(ABREAST, pages - n) }, (_, k) => page(n + k))
      );
      for (const w of wave) {
        rows.push(...w.batch);
        if (w.batch.length < PAGE_SIZE || pastWindow(w.batch)) break walk;
      }
    }
  }

  const inWindow = rows.filter((e) => {
    const s = e.starts_at?.time;
    return s && new Date(s) <= to;
  });
  const ours = inWindow.filter((e) => isOurs(e, accounts) && !e.is_cancelled);
  const appts = ours.map((e) => toAppt(e, accounts)).filter((a): a is Appt => a !== null);

  /* ── WHAT WAS SAID AFTERWARDS ────────────────────────────────────────────
     REX puts feedback in its own service and hangs only an id off the event,
     so the words cost one more call - batched, for every event in the book at
     once, because REX takes ~15s a call and sixty separate reads would be
     twenty minutes.

     Only PAST viewings are asked about. A viewing that has not happened
     cannot have feedback, and `undefined` on those is the right answer: the
     screen distinguishes "not looked" from "looked, nothing there". */
  const wants = new Map<string, string>(); // appt id -> feedback id
  for (const e of ours) {
    const a = toAppt(e, accounts);
    if (!a || a.kind !== "viewing" || a.day >= 0) continue;
    const fid = feedbackIdOf(e);
    if (fid) wants.set(a.id, fid);
  }
  const found = await feedbackByIds([...wants.values()]);
  const past = new Set(appts.filter((a) => a.kind === "viewing" && a.day < 0).map((a) => a.id));
  for (const a of appts) {
    if (!past.has(a.id)) continue;
    const fid = wants.get(a.id);
    /* null, not undefined: we looked and REX holds nothing. That is what puts
       the viewing in "Feedback due" rather than in "we never checked". */
    a.feedback = (fid ? found.get(fid) : null) ?? null;
  }

  return {
    appts,
    agents: [...new Set(ours.map((e) => accounts.get(ownerOf(e).email) || ownerOf(e).name))].sort(),
    scanned: inWindow.length,
    ours: ours.length,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
