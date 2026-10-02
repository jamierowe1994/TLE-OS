import "server-only";
import { RULES } from "@/lib/staleness";
import { createHash } from "node:crypto";
import type { Appt } from "@/lib/diary";
import { kindOf } from "@/lib/rex-diary";
import { isLondonMidnight, londonDayOffset, londonHHMM } from "@/lib/london-time";
import { MailboxNotConnected, msAccessTokenFor, msConnectionFor } from "@/lib/microsoft";

/**
 * THE OUTLOOK CALENDAR, READ IN - each person's own, and nobody else's.
 *
 * James, 24 Sep 2026: "If I'm booking some time to do some admin in my diary
 * in Outlook, that should then block that out in my diary when I go to book a
 * valuation in... I should be able to see what's in both my REX diary and my
 * Outlook as well, all at the same time." And: "Each person should not be able
 * to see the others' diaries."
 *
 * Until now the OS only WROTE to Outlook (lib/outlook-calendar). So an agent
 * who blocked out an afternoon in Outlook was shown as free in the booker,
 * which is how a double booking happens.
 *
 * ── Whose ─────────────────────────────────────────────────────────────────
 *
 * Only the signed-in person's, read with their own token from /me. There is no
 * shared-calendar permission (Calendars.ReadWrite.Shared is deliberately not
 * asked for - see lib/microsoft), so one person's Outlook can never reach
 * another's screen, owners included. The grant is already there: the connect
 * flow has asked for Calendars.ReadWrite since the bookings started going in.
 *
 * ── What counts ───────────────────────────────────────────────────────────
 *
 * Anything that makes them busy: cancelled entries and ones marked Free are
 * left out, because a free slot is free. Private and confidential entries say
 * "Busy" and nothing else, the same as REX's private events - the OS needs to
 * know the slot is taken, not what is in it.
 *
 * The OS's own bookings come back from Outlook too (tagged "TLE OS"). Where
 * the same booking is already in the diary from REX or the OS, the diary
 * route drops the Outlook copy; see `sameAs` there.
 *
 * ── Honest about failing ──────────────────────────────────────────────────
 *
 * Not connected, or Microsoft refusing, is said out loud (`state`), never
 * shown as an empty afternoon - an empty diary reads as a free one.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
/** The same window as the REX diary, near enough: two weeks back, three months on. */
const DAYS_BACK = 14;
const DAYS_FORWARD = 90;
/* 500 a page (was 250): Graph's pages come one after another, each waiting on
   the link in the last, so fewer and larger pages is the only way to make a
   long calendar quicker. Well inside Graph's ceiling for calendarView. */
const PAGE = 500;
const MAX_PAGES = 12;
/** Fresh this long per person: inside it, Microsoft is not asked at all. */
const HOLD_MS = 2 * 60 * 1000;
/**
 * Served this long while a newer read runs behind it (2 Oct 2026).
 *
 * The diary screen polls every five minutes and the hold above is two, so
 * nearly every diary request was a cold Graph read - a token check and one or
 * more calendar pages, one after another - and every response waited for it.
 * That was most of the diary's 2.4 s median. Now the last good read is
 * answered at once and the next one is fetched behind it, the same manners as
 * the REX book in lib/diary-cache.
 */
/* Never past the diary's own keep in lib/staleness - five minutes - and the
   answer says `ageing` so the screen reads again a few seconds later and is
   corrected by the read this one started. */
const KEEP_MS = RULES.diary.keepMs;
/**
 * The longest a diary waits for Outlook when there is nothing held to show.
 * Past this the diary goes out without it, said so in `reason`, and the read
 * carries on and is held for the next look.
 */
const FIRST_READ_WAIT_MS = 2500;
/** A failed read is held this long, so a Microsoft outage is not asked again on every request. */
const FAILED_HOLD_MS = 60 * 1000;

export type OutlookState = "connected" | "not_connected" | "failed";

export interface OutlookRead {
  state: OutlookState;
  appts: Appt[];
  /** Why not, in words for the screen. */
  reason?: string;
  /** Answered from a held read while a newer one runs behind it. */
  ageing?: boolean;
}

interface GraphEvent {
  id?: string;
  subject?: string | null;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string | null;
  sensitivity?: string | null;
  categories?: string[] | null;
  start?: { dateTime?: string; timeZone?: string } | null;
  end?: { dateTime?: string; timeZone?: string } | null;
  location?: { displayName?: string | null } | null;
}

/* On globalThis: lib/outlook-calendar calls forgetOutlookDiary from the
   booking routes, which carry their own copy of this module. A Map per copy
   meant the diary route's never heard that anything had been booked. */
interface OutlookHold {
  /** The last GOOD read per person (connected or not connected). */
  held: Map<string, { at: number; read: OutlookRead }>;
  /** The last failure per person, so it is not retried on every request. */
  failed: Map<string, { at: number; read: OutlookRead }>;
  /** When a person's held read stopped being trusted - they booked something then. */
  forgotten: Map<string, number>;
  reading: Map<string, { p: Promise<OutlookRead>; startedAt: number }>;
}
declare global {
  // eslint-disable-next-line no-var
  var __outlookDiary: OutlookHold | undefined;
}
const hold: OutlookHold = (globalThis.__outlookDiary ??= {
  held: new Map(),
  failed: new Map(),
  forgotten: new Map(),
  reading: new Map(),
});

/** Graph's dateTime with Prefer UTC comes back without a zone: it IS UTC. */
function utc(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toAppt(e: GraphEvent, who: { name: string; email: string }): Appt | null {
  if (!e.id || e.isCancelled) return null;
  /* Free is free: an unaccompanied viewing is put in Outlook as free on
     purpose, so the agent can book something else over it. */
  if ((e.showAs ?? "").toLowerCase() === "free") return null;
  const start = utc(e.start?.dateTime);
  if (!start) return null;
  const end = utc(e.end?.dateTime);
  const mins = end ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) : 30;
  const priv = ["private", "confidential"].includes((e.sensitivity ?? "").toLowerCase());
  const subject = (e.subject ?? "").trim();
  const ours = (e.categories ?? []).includes("TLE OS");
  const allDay = Boolean(e.isAllDay) || (isLondonMidnight(start) && mins >= 20 * 60);
  return {
    /* Hashed: Graph ids are long, and the id travels to the browser. */
    id: `ms-${createHash("sha1").update(e.id).digest("hex").slice(0, 16)}`,
    day: londonDayOffset(start),
    start: londonHHMM(start),
    mins: Math.min(mins, 8 * 60),
    ...(allDay ? { allDay: true } : {}),
    /* Only the OS's own entries are read for a kind: "Viewing at the dentist"
       in somebody's own calendar is not a viewing. */
    kind: !priv && ours ? kindOf(subject) : "other",
    what: priv ? "Busy" : subject || "(untitled)",
    where: priv ? "" : e.location?.displayName ?? "",
    who: "",
    agent: who.name,
    agentEmail: who.email || undefined,
    own: true,
    comms: [],
    fromOutlook: true,
    ...(ours ? { fromOs: true } : {}),
  };
}

async function readNow(user: { id: string; name: string; email: string }): Promise<OutlookRead> {
  const conn = await msConnectionFor(user.id).catch(() => null);
  if (!conn?.connected) {
    return { state: "not_connected", appts: [], reason: "Your Outlook calendar isn't connected, so anything put straight into Outlook doesn't show here." };
  }
  let token: string;
  try {
    token = await msAccessTokenFor(user.id);
  } catch (e) {
    return {
      state: e instanceof MailboxNotConnected ? "not_connected" : "failed",
      appts: [],
      reason: "Your Outlook calendar couldn't be read just now - reconnect it on your profile if this keeps happening.",
    };
  }

  const now = Date.now();
  const from = new Date(now - DAYS_BACK * 86_400_000).toISOString();
  const to = new Date(now + DAYS_FORWARD * 86_400_000).toISOString();
  const select = "id,subject,isAllDay,isCancelled,showAs,sensitivity,categories,start,end,location";
  let url: string | null =
    `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}` +
    `&$select=${select}&$orderby=start/dateTime&$top=${PAGE}`;

  const events: GraphEvent[] = [];
  for (let n = 0; url && n < MAX_PAGES; n++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
        cache: "no-store",
        /* A slow Outlook must not hold the whole diary up. */
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { state: "failed", appts: [], reason: "Outlook didn't answer just now, so your Outlook entries aren't shown." };
    }
    if (!res.ok) {
      return {
        state: "failed",
        appts: [],
        reason:
          res.status === 401 || res.status === 403
            ? "Outlook refused to share your calendar - reconnect it on your profile."
            : `Outlook didn't answer (${res.status}), so your Outlook entries aren't shown.`,
      };
    }
    const j = (await res.json().catch(() => ({}))) as { value?: GraphEvent[]; "@odata.nextLink"?: string };
    events.push(...(j.value ?? []));
    url = j["@odata.nextLink"] ?? null;
  }

  const who = { name: user.name, email: user.email.toLowerCase() };
  return { state: "connected", appts: events.map((e) => toAppt(e, who)).filter((a): a is Appt => a !== null) };
}

/** Read now, once at a time per person; the result is held as it lands. */
function readShared(user: { id: string; name: string; email: string }): Promise<OutlookRead> {
  const going = hold.reading.get(user.id);
  if (going) return going.p;
  const startedAt = Date.now();
  const p = readNow(user)
    .catch((): OutlookRead => ({ state: "failed", appts: [], reason: "Your Outlook calendar couldn't be read just now." }))
    .then((read) => {
      /* A read that began before their last booking cannot clear it: it may
         not have the booking in it. */
      const forgotAt = hold.forgotten.get(user.id) ?? 0;
      if (read.state === "failed") {
        hold.failed.set(user.id, { at: Date.now(), read });
      } else {
        /* Never over a newer read that landed first. */
        if ((hold.held.get(user.id)?.at ?? 0) <= startedAt) hold.held.set(user.id, { at: startedAt, read });
        hold.failed.delete(user.id);
        if (startedAt > forgotAt) hold.forgotten.delete(user.id);
      }
      return read;
    })
    .finally(() => {
      if (hold.reading.get(user.id)?.p === p) hold.reading.delete(user.id);
    });
  hold.reading.set(user.id, { p, startedAt });
  return p;
}

/**
 * This person's Outlook, as diary entries.
 *
 *   fresh (under two minutes)      answered from the hold, Microsoft not asked
 *   older, up to ten minutes       answered from the hold, a new read started
 *   nothing held, or just booked   a new read, waited on for 2.5 s at most
 *
 * A held read is only good on the day it was made: `day` on every entry is an
 * offset from THAT day, the same rule as the REX book. And a read is never
 * invented - past the wait, with nothing real to show, the answer is "failed"
 * with the reason, which the booker already says out loud.
 */
export async function outlookDiaryFor(user: { id: string; name: string; email: string }): Promise<OutlookRead> {
  const now = Date.now();
  const h = hold.held.get(user.id);
  const usable = h && londonDayOffset(h.at) === 0 && now - h.at < KEEP_MS ? h : null;
  const forgotten = hold.forgotten.has(user.id);
  if (usable && !forgotten && now - usable.at < HOLD_MS) return usable.read;

  /* Failed a moment ago: answer with what is held, or say so again, rather
     than queue another read behind a Microsoft that is not answering. (A
     booking since clears this - see forgetOutlookDiary.) */
  const f = hold.failed.get(user.id);
  if (f && now - f.at < FAILED_HOLD_MS) return usable?.read ?? f.read;

  /* Not awaited when there is something to show: this is a long-running
     `next start` server, so the read finishes behind the response and is held
     for the next look (readShared catches its own failure). */
  const next = readShared(user);
  /* Stale but real, and nothing booked since: answer with it, the new read
     lands for the next look. */
  if (usable && !forgotten) return { ...usable.read, ageing: true };

  /* Nothing to show, or they have just booked something and the held copy
     would hide it: wait for the new read, but not for ever. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((done) => { timer = setTimeout(() => done(null), FIRST_READ_WAIT_MS); });
  const read = await Promise.race([next, late]).finally(() => clearTimeout(timer));
  if (read) return read;
  if (usable) return usable.read;
  return {
    state: "failed",
    appts: [],
    reason: "Outlook is slow to answer, so your Outlook entries aren't shown yet - they will be on the next look.",
  };
}

/**
 * The held read is out of date - they have just booked something. Kept, not
 * dropped: the next diary waits briefly for a new read, and only if Outlook is
 * slow does it fall back to this one rather than to nothing.
 */
export function forgetOutlookDiary(userId: string): void {
  hold.forgotten.set(userId, Date.now());
  hold.failed.delete(userId);
  /* A read already running may have missed the booking: the next look starts its own. */
  hold.reading.delete(userId);
}
