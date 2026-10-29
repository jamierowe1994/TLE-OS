import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { isFresh, rentBook } from "@/lib/rent-status";
import { skyListShell } from "@/lib/email/shell-sky";
import { sendEmail } from "@/lib/resend";
import { withR2 } from "@/lib/r2";
import { checkLinks, isLink, LINKS } from "@/lib/link-watch";

/* ==========================================================================
   WHEN A TIMER STOPS (28 Oct 2026, every timer and by email 29 Oct).

   From 07:15 on 27 Oct the scheduled-sends timer on Railway started every
   five minutes and never reached the OS. Nothing said so. The rent box sat
   on "last checked on Monday 26 October at 16:02" for 28 hours, passport
   reminders queued up unsent, and James found it from a screenshot.

   The first watch (28 Oct) covered that one timer and the rent read, rang the
   bell only, and ran from the push scan - itself a Railway timer. James,
   29 Oct: "I need to know if something is to go down."

   So now:
     - EVERY Railway timer that calls the OS is listed below (TIMERS), with
       how late it may be before it counts as stopped.
     - The middleware notes each call that carries the cron key (a beat per
       address, handed over with the read log's batch). Two addresses the
       middleware never sees (/api/present, /api/landlord) note their own.
     - The check runs inside the web server itself every five minutes
       (instrumentation-node), so it needs no timer to run it. The push scan
       still asks too; whichever gets there first writes it down.
     - A stoppage is written once in os_cron_watch. Opening it EMAILS James
       and Howard (WATCHERS) and rings their bell; coming back emails again.
     - Two jobs are judged by what they leave behind rather than by a call:
       the PayProp rent read, and the nightly database backup in R2.

   What it cannot see: a timer that reaches the OS and then fails inside the
   job. Those still show on the screens they feed. And if the web server
   itself is down, nothing here runs - but then the site is down for
   everybody, which is noticed.
   ========================================================================== */

/** Who hears about it (James, 28 Oct 2026: "warn me and Howard"). */
export const WATCHERS = ["james@therecruitmentexperts.co.uk", "howard.russell@theexpertsgroup.co.uk"];

const MIN = 60_000;
const HOUR = 60 * MIN;

type Timer = {
  id: string;
  /** The Railway service, in the TLE - Portal project. */
  service: string;
  label: string;
  every: string;
  /** What stops when it does, in plain words. */
  does: string;
  paths: string[];
  /** Late after this long without a call: a few missed runs, never one. */
  lateMs: number;
};

/* Read off Railway on 29 Oct 2026. A new timer goes here too, or it is not watched. */
export const TIMERS: Timer[] = [
  { id: "scheduled-sends", service: "os-cron-scheduled-sends", label: "Scheduled emails and the rent read", every: "every 5 minutes", does: "Queued emails, pre-presentations, passport reminders, deck chases and the PayProp rent read", paths: ["/api/scheduled-sends/run"], lateMs: 20 * MIN },
  { id: "push-scan", service: "os-cron-push-scan", label: "Phone alerts", every: "every 5 minutes", does: "The bell's alerts to the iPhone app", paths: ["/api/push/scan"], lateMs: 20 * MIN },
  { id: "leads-scan", service: "os-cron-leads-scan", label: "New leads", every: "every 5 minutes", does: "New leads into Leads and the lead ledger", paths: ["/api/leads/scan"], lateMs: 20 * MIN },
  { id: "propoly-watch", service: "os-cron-propoly-watch", label: "Propoly watcher", every: "every 5 minutes", does: "Propoly deal changes into Applications, handover and the PLC email replies", paths: ["/api/pretenancy/watch"], lateMs: 20 * MIN },
  { id: "viewing-texts", service: "os-cron-viewing-texts", label: "Viewing reminder texts", every: "every 5 minutes", does: "The text an hour before each viewing", paths: ["/api/viewings/texts/run"], lateMs: 20 * MIN },
  { id: "flatfair-sync", service: "os-cron-flatfair-sync", label: "Flatfair", every: "every 30 minutes", does: "Flatfair deposit replacements read back into the OS", paths: ["/api/flatfair/sync"], lateMs: 2 * HOUR },
  { id: "reminders", service: "os-cron-reminders", label: "Reminders", every: "hourly", does: "Everybody's reminders, the works day-after sweep and tenant reminders", paths: ["/api/reminders/run", "/api/tenant/reminders/run"], lateMs: 3 * HOUR },
  { id: "viewings-sweep", service: "os-cron-viewings-sweep", label: "Viewings ledger", every: "every 4 hours", does: "Viewings from the diary into the ledger and the listing pages", paths: ["/api/viewings/sweep"], lateMs: 9 * HOUR },
  {
    id: "daily",
    service: "os-cron-daily",
    label: "The early morning run",
    every: "daily, early morning",
    does: "Handover scan, pre-tenancy digest, certificate chases, campaigns, agent compliance, the maintenance figures, deck reminders and the landlord questions chase",
    paths: ["/api/handover/scan", "/api/pretenancy/alerts/run", "/api/compliance/reminders/run", "/api/campaigns/run", "/api/agent-compliance/remind", "/api/maintenance/snapshot", "/api/present/sweep", "/api/landlord/property-answers/chase"],
    lateMs: 27 * HOUR,
  },
  { id: "compliance-warm", service: "os-cron-compliance-warm", label: "The late morning run", every: "daily, late morning", does: "The compliance book warmed and the day's portal figures for every live home", paths: ["/api/compliance/warm", "/api/listings/stats/sweep"], lateMs: 27 * HOUR },
  { id: "book-health", service: "os-cron-book-health", label: "Book health check", every: "Mondays, early morning", does: "The weekly book health email", paths: ["/api/book-health/run"], lateMs: 8 * 24 * HOUR },
];

const WATCHED_PATHS = new Set(TIMERS.flatMap((t) => t.paths));
export const isWatchedPath = (path: string) => WATCHED_PATHS.has(path);

/** The two judged by what they leave behind. */
const EFFECTS = {
  "rent-read": { service: "os-cron-scheduled-sends", label: "PayProp rent read", every: "10am and 4pm", does: "Every home's rent box" },
  backup: { service: "os-cron-db-backup", label: "Nightly database backup", every: "nightly, small hours", does: "The copy of the database in R2 that a restore would come from" },
} as const;
const BACKUP_LATE_MS = 27 * HOUR;

type WatchId = string;

let ready: Promise<void> | null = null;
async function wq<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_cron_beats (
      name TEXT PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS os_cron_watch (
      id BIGSERIAL PRIMARY KEY,
      watch TEXT NOT NULL,
      since TIMESTAMPTZ NOT NULL,
      noticed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      back_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS os_cron_watch_open ON os_cron_watch (watch) WHERE back_at IS NULL;
    ALTER TABLE os_cron_watch ADD COLUMN IF NOT EXISTS detail TEXT NOT NULL DEFAULT ''`)
    .then(() => undefined)
    .catch(() => { ready = null; });
  await ready;
  return q<T>(text, params);
}

/** The timer reached the OS. Called at the top of each scheduled-sends run. */
export async function beat(name: string): Promise<void> {
  if (!hasDb()) return;
  await wq(`INSERT INTO os_cron_beats (name, at) VALUES ($1, NOW()) ON CONFLICT (name) DO UPDATE SET at = NOW()`, [name]).catch(() => {});
}

/** Calls the middleware saw carrying the cron key: { path, at } in ms. */
export async function recordBeats(list: unknown): Promise<number> {
  if (!hasDb() || !Array.isArray(list)) return 0;
  const latest = new Map<string, number>();
  for (const b of list.slice(0, 200)) {
    const path = typeof (b as { path?: unknown })?.path === "string" ? (b as { path: string }).path : "";
    const at = Number((b as { at?: unknown })?.at);
    if (!isWatchedPath(path) || !Number.isFinite(at) || at > Date.now() + MIN) continue;
    latest.set(path, Math.max(latest.get(path) ?? 0, at));
  }
  for (const [path, at] of latest) {
    await wq(
      `INSERT INTO os_cron_beats (name, at) VALUES ($1, to_timestamp($2 / 1000.0))
         ON CONFLICT (name) DO UPDATE SET at = GREATEST(os_cron_beats.at, EXCLUDED.at)`,
      [path, at]
    ).catch(() => {});
  }
  return latest.size;
}

/** The newest nightly backup in R2 (os-cron-db-backup writes db-backups/tleos-<day>.dump). */
async function newestBackup(): Promise<Date | null | "unknown"> {
  if (!process.env.R2_BUCKET) return "unknown";
  try {
    return await withR2(async (c) => {
      let newest: Date | null = null;
      let token: string | undefined;
      do {
        const r = await c.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: "db-backups/", ContinuationToken: token }));
        for (const o of r.Contents ?? []) if (o.LastModified && (o.Size ?? 0) > 0 && (!newest || o.LastModified > newest)) newest = o.LastModified;
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return newest;
    });
  } catch {
    return "unknown";
  }
}

/**
 * Opens a stoppage when one starts and closes it when it ends, emailing
 * the watchers each time. Safe to run from two places at once: the open
 * index lets one insert win, and only the winner emails.
 */
export async function checkCronWatch(): Promise<{ stopped: WatchId[] }> {
  if (!hasDb()) return { stopped: [] };
  const stopped: WatchId[] = [];
  const now = Date.now();

  /* A watched address with no beat yet starts its clock now: a timer that
     was already dead when the watch began is still caught, a grace later. */
  await wq(
    `INSERT INTO os_cron_beats (name, at) SELECT p, NOW() FROM unnest($1::text[]) AS p ON CONFLICT (name) DO NOTHING`,
    [[...WATCHED_PATHS]]
  ).catch(() => {});
  const beats = new Map(
    (await wq<{ name: string; at: Date }>(`SELECT name, at FROM os_cron_beats`).catch(() => [])).map((r) => [r.name, new Date(r.at).getTime()])
  );

  for (const t of TIMERS) {
    const late = t.paths.filter((p) => now - (beats.get(p) ?? now) > t.lateMs);
    const since = late.length ? Math.min(...late.map((p) => beats.get(p) ?? now)) : null;
    const detail = late.length && late.length < t.paths.length ? `Not reached: ${late.join(", ")}` : "";
    await settle(t.id, since ? new Date(since) : null, detail);
    if (since) stopped.push(t.id);
  }

  const book = await rentBook().catch(() => null);
  if (book) {
    const late = !isFresh(book);
    await settle("rent-read", late ? new Date(book.at) : null);
    if (late) stopped.push("rent-read");
  }

  const backup = await newestBackup();
  if (backup !== "unknown") {
    const late = !backup || now - backup.getTime() > BACKUP_LATE_MS;
    await settle("backup", late ? backup ?? new Date(now - BACKUP_LATE_MS) : null, backup ? "" : "No backup found in R2 at all.");
    if (late) stopped.push("backup");
  }

  /* The links to REX, PayProp, Propoly and Flatfair (lib/link-watch). */
  for (const l of await checkLinks().catch(() => [])) {
    await settle(l.id, l.down ? l.since : null, l.report);
    if (l.down) stopped.push(l.id);
  }
  return { stopped };
}

/** since = when it was last fine, or null if it's fine now. */
async function settle(watch: WatchId, since: Date | null, detail = ""): Promise<void> {
  if (since) {
    const opened = await wq<{ id: string }>(
      `INSERT INTO os_cron_watch (watch, since, detail) VALUES ($1, $2, $3) ON CONFLICT (watch) WHERE back_at IS NULL DO NOTHING RETURNING id`,
      [watch, since, detail]
    ).catch(() => []);
    if (opened[0]) await tell(watch, { open: true, since, detail });
  } else {
    const closed = await wq<{ since: Date; back_at: Date; detail: string }>(
      `UPDATE os_cron_watch SET back_at = NOW() WHERE watch = $1 AND back_at IS NULL RETURNING since, back_at, detail`,
      [watch]
    ).catch(() => []);
    if (closed[0]) await tell(watch, { open: false, since: closed[0].since, back: closed[0].back_at, detail: closed[0].detail });
  }
}

const when = (d: Date) =>
  new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

type Words = { title: string; body: string };

/** What a stoppage is called and what to do about it, for the bell and the email alike. */
function words(watch: WatchId, s: { open: boolean; since: Date; back?: Date | null; detail?: string }): Words {
  const t = TIMERS.find((x) => x.id === watch);
  const since = when(s.since);
  const back = s.back ? when(s.back) : "";
  if (t) {
    const which = s.detail ? ` ${s.detail}.` : "";
    return s.open
      ? {
          title: `${t.label} has stopped`,
          body: `The Railway timer ${t.service} (${t.every}) hasn't reached the OS since ${since}.${which} Waiting behind it: ${t.does}. On Railway, open the TLE - Portal project, then ${t.service}, and redeploy it; if it is still quiet after its next run, ask Claude to look.`,
        }
      : { title: `${t.label} is running again`, body: `The Railway timer ${t.service} didn't reach the OS from ${since} until ${back}. It's running again, and anything it held back goes on its next run.` };
  }
  if (isLink(watch)) {
    const l = LINKS[watch];
    return s.open
      ? { title: `The link to ${l.label} is broken`, body: `The OS hasn't been able to reach ${l.label} since ${since}. The report below says what it answered, what that means and what to check.` }
      : { title: `The link to ${l.label} is working again`, body: `${l.label} couldn't be reached from ${since} until ${back}. It's answering again.` };
  }
  if (watch === "rent-read") {
    return s.open
      ? { title: "The rent isn't being read from PayProp", body: `The last rent read from PayProp was ${since}, so every home's rent box says the rent can't be shown. Check os-cron-scheduled-sends on Railway, and Admin > Connections for PayProp.` }
      : { title: "The rent is being read again", body: `The rent went unread from ${since} until ${back}. It's reading again.` };
  }
  if (watch === "backup") {
    return s.open
      ? { title: "The nightly database backup has stopped", body: `${s.detail ? `${s.detail} ` : ""}The newest backup in R2 is from ${since}. On Railway, open the TLE - Portal project, then os-cron-db-backup, and read its last run's log. Railway's own daily backups of the database carry on regardless.` }
      : { title: "The nightly database backup is back", body: `No new backup was made from ${since} until ${back}. Tonight's is in R2.` };
  }
  return { title: s.open ? `${watch} has stopped` : `${watch} is running again`, body: "" };
}

/** Each stoppage, once as it opens and once as it closes, to James and Howard. */
async function tell(watch: WatchId, s: { open: boolean; since: Date; back?: Date | null; detail?: string }): Promise<void> {
  const w = words(watch, s);
  const t = TIMERS.find((x) => x.id === watch) ?? (EFFECTS as Record<string, { service: string; every: string; does: string }>)[watch];
  const link = `${(process.env.OS_PUBLIC_URL || process.env.OS_ORIGIN || "https://tle-os.co.uk").replace(/\/+$/, "")}/admin/connections`;
  const subject = `TLE OS: ${w.title}`;
  /* A broken link's report, one row per line (lib/link-watch). */
  const reportRows = isLink(watch) && s.open && s.detail
    ? s.detail.split("\n").map((line) => {
        const at = line.indexOf(": ");
        const title = at > 0 ? line.slice(0, at) : line;
        return { title, detail: at > 0 ? line.slice(at + 2) : "", tone: (title === "What it said" ? "attention" : "neutral") as "attention" | "neutral" };
      })
    : null;
  const rows = reportRows ?? (t
    ? [
        { title: "Railway timer", detail: `${t.service}, ${t.every}`, tone: "neutral" as const },
        { title: s.open ? "Last reached the OS" : "Was stopped", detail: s.open ? when(s.since) : `${when(s.since)} until ${when(s.back ?? new Date())}`, tone: s.open ? ("attention" as const) : ("good" as const) },
        { title: "What it does", detail: t.does, tone: "neutral" as const },
      ]
    : []);
  const html = skyListShell({ heading: w.title, intro: w.body, rows, rowStyle: "bare", button: "Open Connections", link });
  const text = [w.title, "", w.body, ...(reportRows ? ["", s.detail ?? ""] : []), "", link].join("\n");
  for (const to of WATCHERS) {
    await sendEmail({ to, subject, html, text }).catch((e) => console.error(`[cron-watch] ${watch} email to ${to} failed:`, e instanceof Error ? e.message : e));
  }
  console.warn(`[cron-watch] ${subject}`);
}

/** The bell lines: open stoppages, and ones that ended in the last three days. */
export async function watchNotices(): Promise<Array<{ id: string; at: string; title: string; body: string; tone: "warn" | "none" }>> {
  if (!hasDb()) return [];
  const rows = await wq<{ id: string; watch: WatchId; since: Date; noticed_at: Date; back_at: Date | null; detail: string }>(
    `SELECT id, watch, since, noticed_at, back_at, detail FROM os_cron_watch
      WHERE back_at IS NULL OR back_at > NOW() - INTERVAL '3 days'
      ORDER BY noticed_at DESC LIMIT 10`
  ).catch(() => []);
  return rows.map((r) => {
    const open = !r.back_at;
    const w = words(r.watch, { open, since: r.since, back: r.back_at, detail: r.detail });
    return { id: `cron-watch:${r.id}:${open ? "open" : "back"}`, at: new Date(open ? r.noticed_at : r.back_at!).toISOString(), title: w.title, body: w.body, tone: open ? "warn" : "none" };
  });
}

/**
 * The check, every five minutes, from inside the web server (instrumentation-
 * node), so no Railway timer has to be running for a stopped one to be seen.
 * Production only: a laptop with a database copy must not email James.
 */
export function startCronWatch(): void {
  const g = globalThis as { __osCronWatch?: boolean };
  if (g.__osCronWatch || !hasDb()) return;
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "production" && process.env.CRON_WATCH_LOCAL !== "1") return;
  g.__osCronWatch = true;
  const run = () => void checkCronWatch().catch((e) => console.error("[cron-watch] check failed:", e instanceof Error ? e.message : e));
  /* The first after two minutes, once a fresh deploy has had its timers' calls. */
  const first = setTimeout(run, Number(process.env.CRON_WATCH_FIRST_MS) || 2 * MIN);
  const t = setInterval(run, 5 * MIN);
  (first as { unref?: () => void }).unref?.();
  (t as { unref?: () => void }).unref?.();
}
