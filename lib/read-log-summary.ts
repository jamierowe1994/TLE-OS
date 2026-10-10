import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Reading the read log (lib/read-log) back for Admin.
 *
 * "Opened" counts the different things somebody asked to read - a lead, a
 * landlord's file, a page of the board - not every call, because one screen
 * makes several. That is the number a copy job cannot keep down: to take the
 * book it has to open the book, record by record.
 *
 * The flags are starting points, set on 10 Oct 2026 before there was a week
 * of real use to measure against; tune them once there is. They raise a hand
 * on the screen and nothing else - locking somebody out is always a person's
 * decision.
 */
export const FLAG = {
  /** Different things opened in one hour. A busy agent opens tens. */
  openedHour: 150,
  /** Different things opened in a day. */
  openedDay: 800,
  /** Different things opened between 10pm and 6am, London time, in a day. */
  afterHours: 60,
};

export interface Reader {
  userId: string;
  name: string;
  email: string;
  role: string | null;
  locked: boolean;
  callsHour: number;
  openedHour: number;
  callsDay: number;
  openedDay: number;
  afterHours: number;
  lastAt: string;
  flags: string[];
  /** When the pace cap last paused them, in the last 24 hours. */
  pausedAt: string | null;
}

const LONDON_NIGHT = `(EXTRACT(HOUR FROM r.at AT TIME ZONE 'Europe/London') >= 22 OR EXTRACT(HOUR FROM r.at AT TIME ZONE 'Europe/London') < 6)`;

function flagsOf(r: { openedHour: number; openedDay: number; afterHours: number }): string[] {
  const out: string[] = [];
  if (r.openedHour >= FLAG.openedHour) out.push(`${r.openedHour} things opened in the last hour`);
  if (r.openedDay >= FLAG.openedDay) out.push(`${r.openedDay} things opened today`);
  if (r.afterHours >= FLAG.afterHours) out.push(`${r.afterHours} things opened between 10pm and 6am`);
  return out;
}

/** Everybody who has read anything in the last 24 hours, most first. */
export async function readersToday(): Promise<Reader[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    user_id: string; name: string | null; email: string | null; role: string | null; locked: boolean;
    calls_hour: string; opened_hour: string; calls_day: string; opened_day: string; after_hours: string; last_at: Date | string;
    paused_at: Date | string | null;
  }>(
    `SELECT r.user_id, u.name, u.email, u.role, (u.locked_at IS NOT NULL) AS locked,
            COUNT(*) FILTER (WHERE r.at > NOW() - INTERVAL '1 hour')::text AS calls_hour,
            COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET' AND r.at > NOW() - INTERVAL '1 hour')::text AS opened_hour,
            COUNT(*)::text AS calls_day,
            COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET')::text AS opened_day,
            COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET' AND ${LONDON_NIGHT})::text AS after_hours,
            MAX(r.at) AS last_at,
            (SELECT MAX(a.at) FROM os_audit a
              WHERE a.kind = 'reading_paused' AND a.actor_id = r.user_id AND a.at > NOW() - INTERVAL '24 hours') AS paused_at
       FROM os_read_log r
       LEFT JOIN os_users u ON u.id = r.user_id
      WHERE r.at > NOW() - INTERVAL '24 hours'
      GROUP BY r.user_id, u.name, u.email, u.role, u.locked_at
      ORDER BY COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET') DESC
      LIMIT 100`
  );
  return rows.map((r) => {
    const n = {
      callsHour: Number(r.calls_hour),
      openedHour: Number(r.opened_hour),
      callsDay: Number(r.calls_day),
      openedDay: Number(r.opened_day),
      afterHours: Number(r.after_hours),
    };
    return {
      userId: r.user_id,
      name: r.name || r.email || "Unknown account",
      email: r.email ?? "",
      role: r.role,
      locked: Boolean(r.locked),
      ...n,
      lastAt: new Date(r.last_at).toISOString(),
      flags: flagsOf(n),
      pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
    };
  });
}

export interface ReadEntry {
  at: string;
  method: string;
  path: string;
  query: string;
  ip: string;
}

export interface PersonReading {
  openedHour: number;
  openedDay: number;
  openedWeek: number;
  callsWeek: number;
  afterHoursWeek: number;
  flags: string[];
  recent: ReadEntry[];
}

/** One person: their counts, and the last things they opened. */
export async function readingOf(userId: string, limit = 150): Promise<PersonReading> {
  const empty: PersonReading = { openedHour: 0, openedDay: 0, openedWeek: 0, callsWeek: 0, afterHoursWeek: 0, flags: [], recent: [] };
  if (!hasDb() || !userId) return empty;
  const [counts, recent] = await Promise.all([
    q<{ opened_hour: string; opened_day: string; opened_week: string; calls_week: string; after_week: string; after_day: string }>(
      `SELECT COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET' AND r.at > NOW() - INTERVAL '1 hour')::text AS opened_hour,
              COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET' AND r.at > NOW() - INTERVAL '24 hours')::text AS opened_day,
              COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET')::text AS opened_week,
              COUNT(*)::text AS calls_week,
              COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET' AND ${LONDON_NIGHT})::text AS after_week,
              COUNT(DISTINCT r.path || '?' || r.query) FILTER (WHERE r.method = 'GET' AND ${LONDON_NIGHT} AND r.at > NOW() - INTERVAL '24 hours')::text AS after_day
         FROM os_read_log r
        WHERE r.user_id = $1 AND r.at > NOW() - INTERVAL '7 days'`,
      [userId]
    ),
    q<{ at: Date | string; method: string; path: string; query: string; ip: string }>(
      `SELECT at, method, path, query, ip FROM os_read_log WHERE user_id = $1 ORDER BY at DESC LIMIT $2`,
      [userId, limit]
    ),
  ]);
  const c = counts[0];
  const n = {
    openedHour: Number(c?.opened_hour ?? 0),
    openedDay: Number(c?.opened_day ?? 0),
    afterHours: Number(c?.after_day ?? 0),
  };
  return {
    openedHour: n.openedHour,
    openedDay: n.openedDay,
    openedWeek: Number(c?.opened_week ?? 0),
    callsWeek: Number(c?.calls_week ?? 0),
    afterHoursWeek: Number(c?.after_week ?? 0),
    flags: flagsOf(n),
    recent: recent.map((r) => ({ at: new Date(r.at).toISOString(), method: r.method, path: r.path, query: r.query, ip: r.ip })),
  };
}
