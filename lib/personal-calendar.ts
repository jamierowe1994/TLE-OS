import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { hasDb, q } from "@/lib/db";
import type { Appt, ApptKind } from "@/lib/diary";
import { KIND_META } from "@/lib/diary";
import { busyTimes, looksLikeIcs } from "@/lib/ics-read";
import { isLondonMidnight, londonDayOffset, londonHHMM, londonParts, londonTime } from "@/lib/london-time";

/**
 * AN AGENT'S PERSONAL CALENDAR AND THEIR OS DIARY, SIDE BY SIDE (Amrit's
 * ticket, 14 Oct 2026: "please can we try to sync calendars... personal &
 * lettings").
 *
 * Work bookings already go into the agent's WORK Outlook (lib/outlook-
 * calendar) and their Outlook is read back in (lib/outlook-diary). What was
 * missing is the personal side, both ways, and both READ ONLY:
 *
 *   1. OUT - "Add my OS diary to my personal calendar". A private subscribe
 *      link (an iCal feed) that Google, Apple and Outlook.com calendars poll.
 *      Times, the address and the kind of appointment, and nothing else: no
 *      tenant or landlord names, phone numbers or emails, because a personal
 *      calendar is shared with family and synced to who knows where.
 *
 *   2. IN - "Show my personal calendar's busy times". They paste the secret
 *      iCal address their personal calendar gives them; the diary and the
 *      bookers draw those times as "Busy (personal)", with no titles.
 *
 * Nothing here ever writes to anybody's personal calendar - there is no way
 * to, by design: a subscribe link is read by the calendar, and a secret iCal
 * address can only be read.
 *
 * Both are opt-in, from Profile > Connections, and either can be switched off
 * there. The subscribe token is stored only as a hash (the same rule as
 * os_email_verifications), so it is shown once; Reset makes a new one and the
 * old link stops at once.
 */

/* ── Storage ────────────────────────────────────────────────────────────── */

type LinkRow = {
  user_id: string;
  feed_hash: string | null;
  feed_made_at: Date | null;
  feed_read_at: Date | null;
  busy_url: string | null;
  busy_set_at: Date | null;
  busy_read_at: Date | null;
  busy_error: string | null;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function linkRow(userId: string): Promise<LinkRow | null> {
  if (!hasDb()) return null;
  const rows = await q<LinkRow>(`SELECT * FROM os_calendar_links WHERE user_id = $1`, [userId]);
  return rows[0] ?? null;
}

export type CalendarLinks = {
  feed: { on: boolean; madeAt: string | null; lastCollected: string | null };
  busy: { on: boolean; host: string | null; setAt: string | null; lastRead: string | null; error: string | null; count: number | null };
};

/** What Profile shows. The subscribe link itself is never here: it is not stored. */
export async function calendarLinksFor(userId: string): Promise<CalendarLinks> {
  const r = await linkRow(userId);
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  let host: string | null = null;
  try {
    host = r?.busy_url ? new URL(r.busy_url).hostname : null;
  } catch {
    host = null;
  }
  const held = r?.busy_url ? hold.held.get(userId) : undefined;
  return {
    feed: { on: Boolean(r?.feed_hash), madeAt: iso(r?.feed_made_at), lastCollected: iso(r?.feed_read_at) },
    busy: {
      on: Boolean(r?.busy_url),
      host,
      setAt: iso(r?.busy_set_at),
      lastRead: iso(r?.busy_read_at),
      error: r?.busy_error ?? null,
      count: held && held.url === r?.busy_url && held.read.state === "connected" ? held.read.appts.length : null,
    },
  };
}

/** Make (or remake) the subscribe link. The token is returned once and never kept. */
export async function makeFeedToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q(
    `INSERT INTO os_calendar_links (user_id, feed_hash, feed_made_at, feed_read_at, updated_at)
     VALUES ($1, $2, NOW(), NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE SET feed_hash = $2, feed_made_at = NOW(), feed_read_at = NULL, updated_at = NOW()`,
    [userId, sha(token)]
  );
  return token;
}

export async function stopFeed(userId: string): Promise<void> {
  await q(`UPDATE os_calendar_links SET feed_hash = NULL, feed_made_at = NULL, feed_read_at = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
}

/** Whose feed this token opens: an account that exists and is not locked out. */
export async function feedOwner(token: string): Promise<{ id: string; name: string; email: string } | null> {
  if (!hasDb() || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const rows = await q<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email
       FROM os_calendar_links c JOIN os_users u ON u.id = c.user_id
      WHERE c.feed_hash = $1 AND u.locked_at IS NULL`,
    [sha(token)]
  );
  return rows[0] ?? null;
}

export async function noteFeedCollected(userId: string): Promise<void> {
  await q(`UPDATE os_calendar_links SET feed_read_at = NOW() WHERE user_id = $1`, [userId]).catch(() => null);
}

/* ── The personal calendar's address ────────────────────────────────────── */

/* Locally, a sample calendar served from this machine is how it is tried
   (`next dev` only; never in production). */
const ALLOW_LOOPBACK = process.env.NODE_ENV !== "production";

/**
 * The address as pasted, made fetchable. webcal:// is how Apple and Google
 * hand these out; it is https underneath. Plain http is refused: a secret
 * address sent in the clear is not secret.
 */
export function cleanCalendarUrl(raw: string): string | null {
  const t = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  const localSample = ALLOW_LOOPBACK && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  if ((u.protocol !== "https:" && !localSample) || !u.hostname || u.username || u.password) return null;
  return u.toString().slice(0, 2000);
}

/**
 * Not somewhere inside our own network. The address is typed by a person and
 * fetched by the server, so it must not be a way to make the OS read its own
 * internals (Railway's private network, the metadata service). Checked on
 * every hop of a redirect.
 */
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function safeHost(host: string): Promise<boolean> {
  const bare = host.replace(/^\[|\]$/g, "");
  const addrs = isIP(bare) ? [bare] : (await lookup(bare, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) return false;
  if (ALLOW_LOOPBACK && addrs.every((a) => a === "127.0.0.1" || a === "::1")) return true;
  return addrs.every((a) => !privateAddress(a));
}

const MAX_BYTES = 5 * 1024 * 1024;

/** The file, or why not in words for the agent. */
async function fetchIcs(url: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(at);
    } catch {
      return { ok: false, reason: "That address isn't a calendar address." };
    }
    const local = ALLOW_LOOPBACK && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return { ok: false, reason: "Only https calendar addresses can be read." };
    if (!(await safeHost(u.hostname))) return { ok: false, reason: "That address can't be reached from TLE OS." };
    let res: Response;
    try {
      res = await fetch(at, {
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5", "User-Agent": "TLE-OS calendar reader" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, reason: "Your personal calendar didn't answer just now." };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { ok: false, reason: "Your personal calendar sent us somewhere without an address." };
      at = new URL(next, at).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { ok: false, reason: "That address was refused. It may have been reset - copy the secret address again and paste it in." };
    }
    if (!res.ok) return { ok: false, reason: `Your personal calendar didn't answer (${res.status}).` };
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return { ok: false, reason: "That calendar is too big to read." };
    /* Read to a ceiling rather than trusting the header. */
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, reason: "Your personal calendar sent nothing." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => null);
        return { ok: false, reason: "That calendar is too big to read." };
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    if (!looksLikeIcs(text)) {
      return { ok: false, reason: "That address isn't a calendar file. Use the secret address in iCal format (it ends in .ics)." };
    }
    return { ok: true, text };
  }
  return { ok: false, reason: "Your personal calendar kept redirecting." };
}

/* ── Busy times, held per person ────────────────────────────────────────── */

export type PersonalState = "off" | "connected" | "failed";
export interface PersonalRead {
  state: PersonalState;
  appts: Appt[];
  reason?: string;
  /** Still being read (or a newer read is running): the screen asks again shortly. */
  ageing?: boolean;
}

/** The same window as the Outlook read: two weeks back, three months on. */
const DAYS_BACK = 14;
const DAYS_FORWARD = 90;
/** Personal calendars change slowly and their hosts rate-limit secret addresses. */
const HOLD_MS = 10 * 60 * 1000;
const FAILED_HOLD_MS = 2 * 60 * 1000;
/** The longest a diary waits for a first read before going out without it. */
const FIRST_READ_WAIT_MS = 4000;

interface PersonalHold {
  held: Map<string, { at: number; url: string; read: PersonalRead }>;
  reading: Map<string, Promise<PersonalRead>>;
}
declare global {
  // eslint-disable-next-line no-var
  var __personalCalendar: PersonalHold | undefined;
}
/* On globalThis for the same reason as lib/outlook-diary: more than one copy of this module in the build. */
const hold: PersonalHold = (globalThis.__personalCalendar ??= { held: new Map(), reading: new Map() });

export const BUSY_TITLE = "Busy (personal)";

/** One busy time as a diary entry: a time, nothing more. */
function toAppts(start: Date, end: Date, allDay: boolean, who: { name: string; email: string }): Appt[] {
  const base = {
    kind: "other" as ApptKind,
    what: BUSY_TITLE,
    where: "",
    who: "",
    agent: who.name,
    agentEmail: who.email || undefined,
    own: true,
    comms: [],
    fromPersonal: true,
  };
  const id = (t: Date, extra = "") => `pc-${createHash("sha1").update(`${t.getTime()}|${end.getTime()}|${extra}`).digest("hex").slice(0, 16)}`;
  if (allDay || (isLondonMidnight(start) && end.getTime() - start.getTime() >= 20 * 3600_000)) {
    /* A day off or a trip: one chip per day, the way the diary draws all-day entries. */
    const out: Appt[] = [];
    const first = londonDayOffset(start);
    const days = Math.max(1, Math.min(31, Math.round((end.getTime() - start.getTime()) / 86_400_000)));
    for (let k = 0; k < days; k++) out.push({ ...base, id: id(start, String(k)), day: first + k, start: "00:00", mins: 24 * 60, allDay: true });
    return out;
  }
  const mins = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
  return [{ ...base, id: id(start), day: londonDayOffset(start), start: londonHHMM(start), mins: Math.min(mins, 8 * 60) }];
}

async function readNow(user: { id: string; name: string; email: string }, url: string): Promise<PersonalRead> {
  const got = await fetchIcs(url);
  if (!got.ok) {
    await q(`UPDATE os_calendar_links SET busy_error = $2 WHERE user_id = $1`, [user.id, got.reason]).catch(() => null);
    return { state: "failed", appts: [], reason: got.reason };
  }
  const now = Date.now();
  const times = busyTimes(got.text, new Date(now - DAYS_BACK * 86_400_000), new Date(now + DAYS_FORWARD * 86_400_000));
  const who = { name: user.name, email: (user.email || "").toLowerCase() };
  await q(`UPDATE os_calendar_links SET busy_read_at = NOW(), busy_error = NULL WHERE user_id = $1`, [user.id]).catch(() => null);
  return { state: "connected", appts: times.flatMap((t) => toAppts(t.start, t.end, t.allDay, who)) };
}

function readShared(user: { id: string; name: string; email: string }, url: string): Promise<PersonalRead> {
  const going = hold.reading.get(user.id);
  if (going) return going;
  const p = readNow(user, url)
    .catch((): PersonalRead => ({ state: "failed", appts: [], reason: "Your personal calendar couldn't be read just now." }))
    .then((read) => {
      hold.held.set(user.id, { at: Date.now(), url, read });
      return read;
    })
    .finally(() => hold.reading.delete(user.id));
  hold.reading.set(user.id, p);
  return p;
}

/**
 * This person's personal busy times as diary entries, or "off" when they have
 * not set it up. A held read is only good on the day it was made (`day` is an
 * offset from that day), and a failure is said, never drawn as a free week.
 */
export async function personalBusyFor(user: { id: string; name: string; email: string }): Promise<PersonalRead> {
  const row = await linkRow(user.id).catch(() => null);
  const url = row?.busy_url;
  if (!url) return { state: "off", appts: [] };
  const now = Date.now();
  const h = hold.held.get(user.id);
  const sameDay = h && h.url === url && londonDayOffset(h.at) === 0;
  if (sameDay && now - h.at < (h.read.state === "failed" ? FAILED_HOLD_MS : HOLD_MS)) return h.read;
  const p = readShared(user, url);
  /* Something to show while a newer read runs: the last good one from today. */
  if (sameDay && h.read.state === "connected") return { ...h.read, ageing: true };
  const timeout = new Promise<PersonalRead>((res) =>
    setTimeout(() => res({ state: "failed", appts: [], reason: "Your personal calendar is still being read - it will show in a moment.", ageing: true }), FIRST_READ_WAIT_MS)
  );
  return Promise.race([p, timeout]);
}

/** Save the address after reading it once, so a bad paste is said at once rather than on the diary later. */
export async function setBusyUrl(user: { id: string; name: string; email: string }, raw: string): Promise<{ ok: true; count: number } | { ok: false; reason: string }> {
  const url = cleanCalendarUrl(raw);
  if (!url) return { ok: false, reason: "That doesn't look like a calendar address. It should start https:// or webcal://." };
  const got = await fetchIcs(url);
  if (!got.ok) return got;
  await q(
    `INSERT INTO os_calendar_links (user_id, busy_url, busy_set_at, busy_read_at, busy_error, updated_at)
     VALUES ($1, $2, NOW(), NOW(), NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE SET busy_url = $2, busy_set_at = NOW(), busy_read_at = NOW(), busy_error = NULL, updated_at = NOW()`,
    [user.id, url]
  );
  const now = Date.now();
  const times = busyTimes(got.text, new Date(now - DAYS_BACK * 86_400_000), new Date(now + DAYS_FORWARD * 86_400_000));
  const who = { name: user.name, email: (user.email || "").toLowerCase() };
  hold.held.set(user.id, { at: now, url, read: { state: "connected", appts: times.flatMap((t) => toAppts(t.start, t.end, t.allDay, who)) } });
  return { ok: true, count: times.filter((t) => t.end.getTime() > now).length };
}

export async function stopBusy(userId: string): Promise<void> {
  await q(`UPDATE os_calendar_links SET busy_url = NULL, busy_set_at = NULL, busy_read_at = NULL, busy_error = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
  hold.held.delete(userId);
}

/* ── The subscribe feed ─────────────────────────────────────────────────── */

/** What goes out, by kind. Travel buffers stay home: they are the OS's arithmetic, not appointments. */
const FEED_KINDS = new Set<ApptKind>(["viewing", "appraisal", "takeon", "movein", "inspection", "other", "slot"]);

const FEED_LABEL: Partial<Record<ApptKind, string>> = {
  other: "Appointment",
  slot: "Viewing slot",
};

export type FeedEntry = { uid: string; start: Date; end: Date; allDay: boolean; kind: ApptKind; where: string };

/**
 * A diary entry as a feed entry: when, where and what kind, nothing else.
 * `bookAt` is when the book the entry came from was read - REX entries carry
 * their day as an offset from it.
 */
export function feedEntry(a: Appt, bookAt: number): FeedEntry | null {
  if (!FEED_KINDS.has(a.kind) || a.fromOutlook || a.fromPersonal) return null;
  const base = londonParts(bookAt);
  const [h, m] = (a.start || "00:00").split(":").map(Number);
  const start = londonTime(base.year, base.month, base.day + a.day, a.allDay ? 0 : h || 0, a.allDay ? 0 : m || 0);
  const end = a.allDay ? londonTime(base.year, base.month, base.day + a.day + 1, 0, 0) : new Date(start.getTime() + Math.max(5, a.mins || 30) * 60000);
  return { uid: a.id, start, end, allDay: Boolean(a.allDay), kind: a.kind, where: (a.where || "").trim() };
}

/** The iCalendar text (RFC 5545): UTC times, CRLF, lines folded at 75 octets. */
export function feedIcs(entries: FeedEntry[], who: string): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = (d: Date) => {
    const p = londonParts(d);
    return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
  };
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line: string) => {
    const bytes = Buffer.from(line, "utf8");
    if (bytes.length <= 75) return line;
    const parts: string[] = [];
    let cur = "";
    for (const ch of line) {
      if (Buffer.byteLength(cur + ch, "utf8") > (parts.length ? 74 : 75)) {
        parts.push(cur);
        cur = "";
      }
      cur += ch;
    }
    parts.push(cur);
    return parts.join("\r\n ");
  };
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Letting Experts//TLE OS diary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`TLE OS - ${who}`)}`,
    "X-WR-TIMEZONE:Europe/London",
    /* How often to come back. Google ignores it and polls on its own clock. */
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of entries) {
    const label = FEED_LABEL[e.kind] ?? KIND_META[e.kind]?.label ?? "Appointment";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid.replace(/[^A-Za-z0-9._-]/g, "")}@tle-os-diary`,
      `DTSTAMP:${now}`,
      ...(e.allDay ? [`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(e.end)}`] : [`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`]),
      `SUMMARY:${esc(e.where ? `${label} - ${e.where}` : label)}`,
      ...(e.where ? [`LOCATION:${esc(e.where)}`] : []),
      `CATEGORIES:${esc(label)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
