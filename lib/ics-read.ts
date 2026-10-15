/**
 * READING SOMEBODY'S PERSONAL CALENDAR, AS BUSY TIMES (14 Oct 2026).
 *
 * Amrit: "sync calendars... personal & lettings". An agent pastes the secret
 * iCal address of their own Google, Apple or Outlook.com calendar, and the
 * diary and the bookers draw those times as "Busy (personal)" so nobody books
 * a viewing over the school run. lib/personal-calendar fetches the file; this
 * turns it into plain start/end times and nothing else. Titles, places and
 * attendees are never read out of it - the OS has no business knowing them.
 *
 * Pure (no server-only) so it can be tried against a real file from a script.
 *
 * What a real personal calendar needs, and so what this handles:
 *   - times in UTC, in a named zone (TZID), or floating (read as London)
 *   - all-day entries, one or several days long
 *   - repeating entries (RRULE: daily, weekly by day, monthly by date or by
 *     "second Tuesday", yearly), with INTERVAL, COUNT and UNTIL
 *   - one instance moved (RECURRENCE-ID) or deleted (EXDATE)
 *   - cancelled entries and ones marked free (TRANSP:TRANSPARENT) left out,
 *     because a free slot is free
 * Anything it cannot make sense of is skipped rather than guessed at.
 */

export type BusyTime = { start: Date; end: Date; allDay: boolean };

type Prop = { value: string; params: Record<string, string> };
type RawEvent = Record<string, Prop[]>;

/** Lines as the file means them: a line starting with a space or tab continues the one before. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): { name: string; prop: Prop } | null {
  /* The value starts at the first colon that is not inside a quoted parameter. */
  let quoted = false;
  let at = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) { at = i; break; }
  }
  if (at <= 0) return null;
  const head = line.slice(0, at).split(";");
  const params: Record<string, string> = {};
  for (const p of head.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: head[0].toUpperCase(), prop: { value: line.slice(at + 1).trim(), params } };
}

function events(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let depth = 0; // inside a VALARM or similar within the event
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN") {
      if (p.prop.value.toUpperCase() === "VEVENT") { cur = {}; depth = 0; }
      else if (cur) depth++;
      continue;
    }
    if (p.name === "END") {
      if (p.prop.value.toUpperCase() === "VEVENT") { if (cur) out.push(cur); cur = null; }
      else if (cur && depth > 0) depth--;
      continue;
    }
    if (cur && depth === 0) (cur[p.name] ??= []).push(p.prop);
  }
  return out;
}

/* ── Time zones ─────────────────────────────────────────────────────────── */

/** Outlook writes Windows zone names. The ones a UK agent's calendar is likely to carry. */
const WINDOWS_ZONES: Record<string, string> = {
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "UTC": "UTC",
  "Coordinated Universal Time": "UTC",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "GTB Standard Time": "Europe/Bucharest",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "India Standard Time": "Asia/Kolkata",
  "AUS Eastern Standard Time": "Australia/Sydney",
};

const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>();
function formatterFor(tz: string): Intl.DateTimeFormat | null {
  if (!zoneFormatters.has(tz)) {
    try {
      zoneFormatters.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }));
    } catch {
      zoneFormatters.set(tz, null);
    }
  }
  return zoneFormatters.get(tz) ?? null;
}

/** A TZID as the file gives it, as a zone this runtime knows. Unknown = London, where the agents are. */
function zoneOf(tzid: string | undefined): string {
  if (!tzid) return "Europe/London";
  const t = tzid.replace(/^\/+/, "").trim();
  if (WINDOWS_ZONES[t]) return WINDOWS_ZONES[t];
  /* Some exporters prefix a path, e.g. "/mozilla.org/20050126_1/Europe/London". */
  const iana = t.match(/[A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/)?.[0] ?? t;
  return formatterFor(iana) ? iana : "Europe/London";
}

/** The instant that reads y-m-d h:mi:s on a clock in `tz`. Corrects itself across a change of the clocks. */
function zoneTime(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const want = Date.UTC(y, mo - 1, d, h, mi, s);
  const f = formatterFor(tz);
  if (!f || tz === "UTC") return new Date(want);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const parts: Record<string, number> = {};
    for (const p of f.formatToParts(new Date(guess))) if (p.type !== "literal") parts[p.type] = Number(p.value);
    const read = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += want - read;
  }
  return new Date(guess);
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

/** A wall-clock moment in a zone, or a whole day. Repeats are counted on the wall clock so 9am stays 9am across the clocks changing. */
type Local = { y: number; mo: number; d: number; h: number; mi: number; s: number; tz: string; allDay: boolean };

function parseDate(p: Prop | undefined): Local | null {
  if (!p) return null;
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const allDay = p.params.VALUE?.toUpperCase() === "DATE" || !m[4];
  return {
    y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]),
    h: allDay ? 0 : Number(m[4]), mi: allDay ? 0 : Number(m[5]), s: allDay ? 0 : Number(m[6] ?? 0),
    tz: m[7] ? "UTC" : zoneOf(p.params.TZID),
    allDay,
  };
}

/** Whole days are London days: that is the diary they are drawn in. */
const instant = (l: Local): Date => zoneTime(l.y, l.mo, l.d, l.h, l.mi, l.s, l.allDay ? "Europe/London" : l.tz);

/** "P1D", "PT1H30M", "P2W" in milliseconds (sign ignored - a negative length is nonsense here). */
function durationMs(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.trim().match(/^[+-]?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [w, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  return ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

/** Add whole days to a wall-clock date, staying on the wall clock. */
function addDays(l: Local, n: number): Local {
  const t = new Date(Date.UTC(l.y, l.mo - 1, l.d + n));
  return { ...l, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
const weekday = (l: Local) => new Date(Date.UTC(l.y, l.mo - 1, l.d)).getUTCDay(); // 0 = Sunday
const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/* ── Repeats ────────────────────────────────────────────────────────────── */

/**
 * Every start of a repeating entry, in order, up to `until`. Only the parts
 * of RRULE that personal calendars actually write; an unknown FREQ gives the
 * first instance alone rather than an invented pattern.
 */
function* repeats(start: Local, rule: string, until: Date): Generator<Local> {
  const r: Record<string, string> = {};
  for (const part of rule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) r[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Math.max(0, Number(r.COUNT)) : Infinity;
  const ruleUntil = r.UNTIL ? parseDate({ value: r.UNTIL, params: {} }) : null;
  const stop = Math.min(until.getTime(), ruleUntil ? instant(ruleUntil.tz === "Europe/London" && !/Z$/.test(r.UNTIL) ? { ...ruleUntil, tz: start.tz } : ruleUntil).getTime() + (ruleUntil.allDay ? 86_399_000 : 0) : Infinity);
  const byDay = (r.BYDAY ?? "").split(",").filter(Boolean).map((x) => {
    const m = x.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
    return m ? { n: m[1] ? Number(m[1]) : 0, wd: DAY_CODES.indexOf(m[2]) } : null;
  }).filter((x): x is { n: number; wd: number } => x !== null);
  const byMonthDay = (r.BYMONTHDAY ?? "").split(",").filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n !== 0);
  const startMs = instant(start).getTime();

  let made = 0;
  const emit = function* (cands: Local[]): Generator<Local, boolean> {
    for (const c of cands.sort((a, b) => instant(a).getTime() - instant(b).getTime())) {
      const t = instant(c).getTime();
      if (t < startMs) continue;
      if (t > stop || made >= count) return false;
      made++;
      yield c;
    }
    return true;
  };

  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    yield start;
    return;
  }
  /* A hard ceiling on periods walked, so a broken rule cannot spin. */
  for (let i = 0; i < 20000; i++) {
    let cands: Local[] = [];
    if (freq === "DAILY") {
      cands = [addDays(start, i * interval)];
    } else if (freq === "WEEKLY") {
      /* The week of the first instance, Monday first, then every `interval` weeks. */
      const monday = addDays(start, -((weekday(start) + 6) % 7) + i * 7 * interval);
      const days = byDay.length ? byDay.map((b) => b.wd) : [weekday(start)];
      cands = days.map((wd) => addDays(monday, (wd + 6) % 7));
    } else if (freq === "MONTHLY") {
      const t = new Date(Date.UTC(start.y, start.mo - 1 + i * interval, 1));
      const y = t.getUTCFullYear();
      const mo = t.getUTCMonth() + 1;
      const n = daysIn(y, mo);
      if (byDay.length) {
        for (const b of byDay) {
          const all = Array.from({ length: n }, (_, k) => k + 1).filter((d) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === b.wd);
          const picked = b.n === 0 ? all : [b.n > 0 ? all[b.n - 1] : all[all.length + b.n]];
          for (const d of picked) if (d) cands.push({ ...start, y, mo, d });
        }
      } else {
        const days = byMonthDay.length ? byMonthDay : [start.d];
        for (const md of days) {
          const d = md > 0 ? md : n + md + 1;
          if (d >= 1 && d <= n) cands.push({ ...start, y, mo, d });
        }
      }
    } else {
      const y = start.y + i * interval;
      if (start.d <= daysIn(y, start.mo)) cands = [{ ...start, y }];
    }
    const more = yield* emit(cands);
    if (!more) return;
    /* Past the end of the window with nothing more to give. */
    if (cands.length && Math.min(...cands.map((c) => instant(c).getTime())) > stop) return;
  }
}

/* ── The whole file ─────────────────────────────────────────────────────── */

/**
 * Busy times in [from, to), from an iCalendar file. Never throws on a bad
 * file: what can be read is returned, the rest skipped.
 */
export function busyTimes(text: string, from: Date, to: Date): BusyTime[] {
  const raw = events(text);
  const first = (e: RawEvent, k: string) => e[k]?.[0];
  const cancelled = (e: RawEvent) => first(e, "STATUS")?.value.toUpperCase() === "CANCELLED";
  const free = (e: RawEvent) => first(e, "TRANSP")?.value.toUpperCase() === "TRANSPARENT";

  /* Moved or changed single instances, by series and original start. */
  const moved = new Map<string, Set<number>>();
  for (const e of raw) {
    const rid = parseDate(first(e, "RECURRENCE-ID"));
    const uid = first(e, "UID")?.value;
    if (rid && uid) {
      const set = moved.get(uid) ?? new Set<number>();
      set.add(instant(rid).getTime());
      moved.set(uid, set);
    }
  }

  const out: BusyTime[] = [];
  const keep = (start: Date, end: Date, allDay: boolean) => {
    if (end.getTime() <= from.getTime() || start.getTime() >= to.getTime()) return;
    if (out.length < 5000) out.push({ start, end, allDay });
  };

  for (const e of raw) {
    if (cancelled(e) || free(e)) continue;
    const start = parseDate(first(e, "DTSTART"));
    if (!start) continue;
    const endProp = parseDate(first(e, "DTEND"));
    const startAt = instant(start).getTime();
    let length = endProp ? instant(endProp).getTime() - startAt : durationMs(first(e, "DURATION")?.value);
    if (length === null || !Number.isFinite(length) || length < 0) length = start.allDay ? 86_400_000 : 0;
    if (length === 0 && !start.allDay) continue; // a reminder at a moment, not time taken
    const lengthDays = start.allDay ? Math.max(1, Math.round(length / 86_400_000)) : 0;
    const endOf = (l: Local) => (l.allDay ? instant(addDays(l, lengthDays)) : new Date(instant(l).getTime() + length!));

    const rule = first(e, "RRULE")?.value;
    if (!rule || first(e, "RECURRENCE-ID")) {
      keep(instant(start), endOf(start), start.allDay);
      continue;
    }
    const uid = first(e, "UID")?.value ?? "";
    const skip = new Set<number>(moved.get(uid) ?? []);
    for (const ex of e.EXDATE ?? []) {
      for (const v of ex.value.split(",")) {
        const l = parseDate({ value: v.trim(), params: ex.params });
        if (l) skip.add(instant(l.tz === "Europe/London" && !ex.params.TZID && !/Z$/.test(v.trim()) ? { ...l, tz: start.tz } : l).getTime());
      }
    }
    for (const l of repeats(start, rule, to)) {
      const t = instant(l);
      if (skip.has(t.getTime())) continue;
      keep(t, endOf(l), l.allDay);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** True when the text is plainly an iCalendar file at all. */
export const looksLikeIcs = (text: string) => /BEGIN:VCALENDAR/i.test(text.slice(0, 2000));
