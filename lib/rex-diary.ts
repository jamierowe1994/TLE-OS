import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import type { Appt, ApptKind } from "@/lib/diary";

/**
 * The lettings team's diary, live from REX.
 *
 * WHOSE DIARY IS IT? This REX account holds SIX businesses' calendars — of
 * 671 events in a fortnight, 482 belong to The Property Experts (sales) and
 * only 91 to The Lettings Experts. The reliable divider is the calendar
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
const MAX_PAGES = 15;
/** How far either side of today to read. */
const DAYS_BACK = 14;
const DAYS_FORWARD = 21;

interface RexEvent extends Record<string, unknown> {
  id?: string;
  title?: string | null;
  description?: string | null;
  is_private?: boolean | null;
  is_cancelled?: boolean | null;
  starts_at?: { time?: string } | null;
  ends_at?: { time?: string } | null;
  event_location?: { description?: string | null; latitude?: string | null; longitude?: string | null } | null;
  calendar?: { owner_user?: { name?: string; email_address?: string } | null } | null;
  organiser_user?: { name?: string; email_address?: string } | null;
}

function ownerOf(e: RexEvent): { name: string; email: string } {
  const u = e.calendar?.owner_user ?? e.organiser_user ?? null;
  return { name: u?.name ?? "—", email: (u?.email_address ?? "").toLowerCase() };
}

/** Ours if the calendar belongs to a lettings mailbox. */
export function isOurs(e: RexEvent): boolean {
  return ownerOf(e).email.endsWith(`@${OUR_DOMAIN}`);
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

/** Days from today, as the Appt type counts them. */
function dayOffset(iso: string): number {
  const start = new Date(iso);
  const today = new Date();
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toAppt(e: RexEvent): Appt | null {
  const startIso = e.starts_at?.time;
  if (!startIso) return null;
  const endIso = e.ends_at?.time;
  const mins = endIso
    ? Math.max(15, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000))
    : 30;

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
    mins: Math.min(mins, 8 * 60), // an all-day block shouldn't paint over the grid
    kind: priv ? "other" : kindOf(title),
    what: priv ? "Busy" : what || "(untitled)",
    where: priv ? "" : loc,
    who: priv ? "" : who,
    agent: owner.name,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    // We do NOT know from a calendar entry whether the confirmations went,
    // nor whether the property has a sitting tenant. Both are left undefined
    // so the screen can say "not known" — an empty comms list would render
    // as "all confirmed", which is a reassurance we have not earned.
    tenant: undefined,
    comms: [],
    fromRex: true,
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

  // Step one: which calendars are ours? 134 exist across the six businesses
  // sharing this REX account; 22 belong to lettings mailboxes. Asking REX for
  // only those turns a 6,459-event scan into ~533.
  const calIds: string[] = [];
  for (let page = 0; page < 3; page++) {
    const res = await rexCall("Calendars", "search", { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (!res.ok) break;
    const rows = rexRows(res.result) as { id?: string; owner_user?: { email_address?: string } }[];
    for (const c of rows) {
      if ((c.owner_user?.email_address ?? "").toLowerCase().endsWith(`@${OUR_DOMAIN}`) && c.id) {
        calIds.push(c.id);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }

  const rows: RexEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rexCall("CalendarEvents", "search", {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
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
    if (!res.ok) break;
    const batch = rexRows(res.result) as RexEvent[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1]?.starts_at?.time;
    if (last && new Date(last) > to) break;
  }

  const inWindow = rows.filter((e) => {
    const s = e.starts_at?.time;
    return s && new Date(s) <= to;
  });
  const ours = inWindow.filter((e) => isOurs(e) && !e.is_cancelled);
  const appts = ours.map(toAppt).filter((a): a is Appt => a !== null);

  return {
    appts,
    agents: [...new Set(ours.map((e) => ownerOf(e).name))].sort(),
    scanned: inWindow.length,
    ours: ours.length,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
