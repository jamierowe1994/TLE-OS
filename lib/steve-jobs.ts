import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { londonParts, londonTime } from "@/lib/london-time";
import { findUserById, ensureRexLink, type OsUser } from "@/lib/users";
import type { Scope } from "@/lib/scope";

/**
 * STEVE'S STANDING JOBS (James, 2 Oct 2026: "build the standing jobs").
 *
 * "Every Monday at nine, tell me which of my listings have no photos." Steve
 * drafts it as a card; their press keeps it here. The scheduled-sends cron
 * (every five minutes) runs whatever is due: Steve answers the job's question
 * AS THAT PERSON, with their scope and their memory, exactly as if they had
 * asked him then, and the answer goes into their Steve chat and their bell.
 *
 * A job only ever reads and reports. It runs with nobody watching, so nothing
 * it says can press a button: any card he drafts on the way is dropped, and
 * the report says what he would do so they can say yes when they next open him.
 *
 * Kept in its own two tables, made here on first use, so this does not touch
 * the shared schema file other sessions edit.
 */

export type Every = "day" | "weekday" | "week" | "month" | "once";

export interface SteveJob {
  id: string;
  userId: string;
  title: string;
  ask: string;
  every: Every;
  /** 0 Sunday .. 6 Saturday, for "week". Day of the month for "month". */
  on: number | null;
  /** "09:00", London. */
  at: string;
  nextAt: string | null;
  lastAt: string | null;
  paused: boolean;
  createdAt: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  userId: string;
  title: string;
  at: string;
  text: string;
  ok: boolean;
}

/** Ten each is plenty, and a ceiling on what one person can schedule against the shared budget. */
export const MAX_JOBS_EACH = 10;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= q(`
    CREATE TABLE IF NOT EXISTS os_steve_jobs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      title       TEXT NOT NULL,
      ask         TEXT NOT NULL,
      every       TEXT NOT NULL,
      on_day      INTEGER,
      at_hhmm     TEXT NOT NULL DEFAULT '09:00',
      next_at     TIMESTAMPTZ,
      last_at     TIMESTAMPTZ,
      paused      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS os_steve_jobs_due ON os_steve_jobs (next_at) WHERE NOT paused;
    CREATE TABLE IF NOT EXISTS os_steve_job_runs (
      id          TEXT PRIMARY KEY,
      job_id      TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      title       TEXT NOT NULL,
      at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      text        TEXT NOT NULL,
      ok          BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE INDEX IF NOT EXISTS os_steve_job_runs_user ON os_steve_job_runs (user_id, at DESC);
  `).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** "Every Monday at 09:00", in words. */
export function scheduleWords(j: Pick<SteveJob, "every" | "on" | "at" | "nextAt">): string {
  switch (j.every) {
    case "day":
      return `Every day at ${j.at}`;
    case "weekday":
      return `Every weekday at ${j.at}`;
    case "week":
      return `Every ${DAYS[j.on ?? 1]} at ${j.at}`;
    case "month": {
      const d = j.on ?? 1;
      const th = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
      return `On the ${d}${th} of every month at ${j.at}`;
    }
    case "once":
      return j.nextAt
        ? `Once, on ${new Date(j.nextAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })} at ${j.at}`
        : `Once, at ${j.at}`;
  }
}

/**
 * The next time it is due after `from`, on the London clock. "once" is given
 * its date by the caller (on = days from today); repeats walk forward a day at
 * a time until the rule matches, which is never more than 31 steps.
 */
export function nextRun(every: Every, on: number | null, at: string, from = new Date(), onceDate?: string | null): Date | null {
  const [hh, mm] = at.split(":").map(Number);
  if (every === "once") {
    if (!onceDate) return null;
    const [y, m, d] = onceDate.split("-").map(Number);
    const t = londonTime(y, m, d, hh || 9, mm || 0);
    return t.getTime() > from.getTime() ? t : null;
  }
  const p = londonParts(from);
  for (let i = 0; i < 40; i++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const t = londonTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh || 9, mm || 0);
    if (t.getTime() <= from.getTime()) continue;
    const dow = day.getUTCDay();
    if (every === "day") return t;
    if (every === "weekday" && dow >= 1 && dow <= 5) return t;
    if (every === "week" && dow === (on ?? 1)) return t;
    if (every === "month") {
      /* The 31st in a short month is its last day. */
      const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
      if (day.getUTCDate() === Math.min(on ?? 1, last)) return t;
    }
  }
  return null;
}

type Row = { id: string; user_id: string; title: string; ask: string; every: Every; on_day: number | null; at_hhmm: string; next_at: Date | null; last_at: Date | null; paused: boolean; created_at: Date };
const toJob = (r: Row): SteveJob => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  ask: r.ask,
  every: r.every,
  on: r.on_day,
  at: r.at_hhmm,
  nextAt: r.next_at ? new Date(r.next_at).toISOString() : null,
  lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
  paused: r.paused,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function jobsFor(userId: string): Promise<SteveJob[]> {
  if (!hasDb()) return [];
  await ensure();
  const rows = await q<Row>(`SELECT * FROM os_steve_jobs WHERE user_id = $1 ORDER BY created_at`, [userId]);
  return rows.map(toJob);
}

export async function createJob(p: { userId: string; title: string; ask: string; every: Every; on: number | null; at: string; onceDate?: string | null }): Promise<SteveJob> {
  await ensure();
  const mine = await jobsFor(p.userId);
  if (mine.length >= MAX_JOBS_EACH) throw new Error(`You already have ${MAX_JOBS_EACH} standing jobs. Stop one first.`);
  const next = nextRun(p.every, p.on, p.at, new Date(), p.onceDate);
  if (!next) throw new Error("That time has already gone. Pick one in the future.");
  const id = randomUUID();
  const rows = await q<Row>(
    `INSERT INTO os_steve_jobs (id, user_id, title, ask, every, on_day, at_hhmm, next_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, p.userId, p.title, p.ask, p.every, p.on, p.at, next]
  );
  return toJob(rows[0]);
}

/** Pause, carry on, or stop for good - their own jobs only. */
export async function changeJob(userId: string, id: string, change: "pause" | "resume" | "delete"): Promise<boolean> {
  if (!hasDb()) return false;
  await ensure();
  if (change === "delete") {
    const r = await q<{ id: string }>(`DELETE FROM os_steve_jobs WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
    return r.length > 0;
  }
  const rows = await q<Row>(`SELECT * FROM os_steve_jobs WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rows[0]) return false;
  const j = toJob(rows[0]);
  /* Carrying on picks up from now, not from the slot that was missed. */
  const next = change === "resume" && j.every !== "once" ? nextRun(j.every, j.on, j.at) : rows[0].next_at;
  await q(`UPDATE os_steve_jobs SET paused = $3, next_at = $4 WHERE id = $1 AND user_id = $2`, [id, userId, change === "pause", next]);
  return true;
}

export async function runsFor(userId: string, days = 3): Promise<JobRun[]> {
  if (!hasDb()) return [];
  await ensure();
  const rows = await q<{ id: string; job_id: string; user_id: string; title: string; at: Date; text: string; ok: boolean }>(
    `SELECT * FROM os_steve_job_runs WHERE user_id = $1 AND at > NOW() - make_interval(days => $2) ORDER BY at DESC LIMIT 20`,
    [userId, days]
  );
  return rows.map((r) => ({ id: r.id, jobId: r.job_id, userId: r.user_id, title: r.title, at: new Date(r.at).toISOString(), text: r.text, ok: r.ok }));
}

/** Their scope, worked out without a request: the same answer scopeFor gives them signed in. */
export async function scopeOf(user: OsUser): Promise<Scope> {
  if (user.role === "owner") return { rexUserId: null, everything: true, unlinked: false, label: "the whole business" };
  const rexId = await ensureRexLink(user).catch(() => null);
  return { rexUserId: rexId, everything: false, unlinked: !rexId, label: user.name || user.email };
}

/**
 * Run what is due. Each job is CLAIMED by moving its next_at on in the same
 * statement that picks it, so two overlapping cron runs never run one twice.
 * Five a tick at most, each a model call: the rest wait five minutes.
 */
export async function runDueJobs(): Promise<{ ran: number; failed: string[] }> {
  if (!hasDb()) return { ran: 0, failed: [] };
  await ensure();
  const due = await q<Row>(
    `SELECT * FROM os_steve_jobs WHERE NOT paused AND next_at IS NOT NULL AND next_at <= NOW() ORDER BY next_at LIMIT 5`
  );
  const failed: string[] = [];
  let ran = 0;
  for (const r of due) {
    const j = toJob(r);
    const next = j.every === "once" ? null : nextRun(j.every, j.on, j.at);
    const claimed = await q<{ id: string }>(
      /* Still due is the claim: the first run moves next_at into the future,
         so a second run's update finds nothing. (Not an equality on next_at -
         Postgres keeps microseconds that a JS Date has already dropped.) */
      `UPDATE os_steve_jobs SET next_at = $2, last_at = NOW(), paused = (paused OR $3) WHERE id = $1 AND NOT paused AND next_at <= NOW() RETURNING id`,
      [j.id, next, j.every === "once"]
    );
    if (!claimed.length) continue;
    try {
      const text = await runOne(j);
      await q(`INSERT INTO os_steve_job_runs (id, job_id, user_id, title, text, ok) VALUES ($1,$2,$3,$4,$5,TRUE)`, [randomUUID(), j.id, j.userId, j.title, text]);
      ran++;
    } catch (e) {
      const why = e instanceof Error ? e.message : "it failed";
      failed.push(`${j.id}: ${why}`);
      await q(`INSERT INTO os_steve_job_runs (id, job_id, user_id, title, text, ok) VALUES ($1,$2,$3,$4,$5,FALSE)`, [
        randomUUID(), j.id, j.userId, j.title, `I couldn't do "${j.title}" this time: ${why}. I'll try again at the next slot.`,
      ]).catch(() => []);
    }
  }
  return { ran, failed };
}

async function runOne(j: SteveJob): Promise<string> {
  const user = await findUserById(j.userId);
  if (!user) throw new Error("the person it belongs to has no account any more");
  const [{ ask }, { logLine }, { memoryFor }] = await Promise.all([
    import("@/lib/assistant-brain"),
    import("@/lib/assistant-log"),
    import("@/lib/assistant-steve-more"),
  ]);
  const scope = await scopeOf(user);
  const memory = (await memoryFor(user.id).catch(() => ({ notes: [] as { text: string }[] }))).notes.map((n) => n.text);
  const framed =
    `[A standing job ${user.name?.split(" ")[0] || "they"} set up: "${j.title}", ${scheduleWords(j).toLowerCase()}. ` +
    `Nobody is watching. Do it with your tools and write the result as a short message to them, headline first. ` +
    `Do not draft cards or ask them anything - if something needs doing, say what, and that you can do it when they next open you. ` +
    `If there is nothing to report, say so in one line.]\n\n${j.ask}`;
  const answer = await ask([], framed, { scope, path: null, openListingId: null, me: { id: user.id, name: user.name ?? "", email: user.email }, memory });
  const text = `${j.title}\n\n${answer.text}`;
  /* Into their chat, so it is there the next time they open him - with the
     spend on it, because the daily cap is counted from this table. */
  await logLine({ userId: user.id, userEmail: user.email, thread: "job", role: "assistant", text, kind: "ask", inTokens: answer.inTokens, outTokens: answer.outTokens });
  return answer.text;
}
