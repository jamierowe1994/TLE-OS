import "server-only";
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
const PAGE = 250;
const MAX_PAGES = 12;
/** Held this long per person, so the diary's polling does not ask Microsoft every time. */
const HOLD_MS = 2 * 60 * 1000;

export type OutlookState = "connected" | "not_connected" | "failed";

export interface OutlookRead {
  state: OutlookState;
  appts: Appt[];
  /** Why not, in words for the screen. */
  reason?: string;
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

const held = new Map<string, { at: number; read: OutlookRead }>();
const reading = new Map<string, Promise<OutlookRead>>();

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

/**
 * This person's Outlook, as diary entries. Held briefly per person; a failed
 * read is not held, so the next look tries again.
 */
export async function outlookDiaryFor(user: { id: string; name: string; email: string }): Promise<OutlookRead> {
  const h = held.get(user.id);
  if (h && Date.now() - h.at < HOLD_MS) return h.read;
  const going = reading.get(user.id);
  if (going) return going;
  const p = readNow(user)
    .then((read) => {
      if (read.state !== "failed") held.set(user.id, { at: Date.now(), read });
      return read;
    })
    .finally(() => reading.delete(user.id));
  reading.set(user.id, p);
  return p;
}

/** Forget what is held for this person - after they book something, say. */
export function forgetOutlookDiary(userId: string): void {
  held.delete(userId);
}
