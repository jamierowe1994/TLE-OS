import "server-only";
import { hasDb, q } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { saveSnapshotRun, setSnapshotRun, type SnapshotRunReport } from "@/lib/rex-outage";

/* ==========================================================================
   TAKING THE COPY (21 Oct 2026, lib/rex-outage).

   The copy has to answer the exact questions the screens will ask while REX
   is down, and the screens ask different questions for different people
   (Leads is "mine" for an agent). Guessing those bodies would miss. So the
   run asks the OS itself, the way the people did: every screen a member of
   staff opened in the last day and a half, from the read log, asked again
   as that person, over this server's own address. Every REX read those
   screens make on the way is kept (lib/rex-outage keeps everything while a
   run is going).

   - One request at a time, with a pause between, so REX sees an ordinary
     busy half hour and not a burst.
   - Boards first (what a person opens first thing), then the record pages
     they opened, most recent first, so a run stopped by its deadline still
     holds the parts that matter.
   - Only routes that read REX are walked: nothing that writes, sends,
     downloads or asks an AI. And the walk is neither written into the read
     log nor counted towards anyone's pace (middleware, x-os-rex-snapshot).
   ========================================================================== */

/** Paths that read REX for a screen (from the audit, 21 Oct 2026). Prefix match. */
const WALK = [
  "/api/diary",
  "/api/leads",
  "/api/contacts",
  "/api/listings",
  "/api/applications",
  "/api/appraisals",
  "/api/portfolio",
  "/api/property-file",
  "/api/compliance",
  "/api/compliance-desk",
  "/api/viewings",
  "/api/offers",
  "/api/case-state",
  "/api/guarantors",
  "/api/people",
  "/api/homes",
  "/api/m/",
  "/api/my/",
  "/api/tasks",
  "/api/works-orders",
  "/api/inspections",
  "/api/section-notices",
  "/api/tenancy-reviews",
  "/api/move-outs",
  "/api/take-ons",
  "/api/tenant-swaps",
  "/api/pretenancy",
  "/api/property-answers",
  "/api/customer-updates",
  "/api/agents",
  "/api/maintenance",
  "/api/contractors",
];
/** Never walked, whatever the prefix says: writes by GET, AI, files, search text. */
const NEVER = [
  /\/(export|exports|download|csv|pdf|print)(\/|$)/i,
  /\/(send|run|sweep|scan|warm|sync|publish|push|create|nudge|chase|remind)(\/|$)/i,
  /\/api\/(assistant|ai|steve|search|r2|bugs|auth|notifications|track|present|esign)(\/|$)/i,
  /\/api\/m\/(chats|rooms|face|focus|id-check)/i,
];

const PACE_MS = 600;
const STEP_TIMEOUT_MS = 90_000;
const MAX_STEPS = 4_000;

function walkable(path: string): boolean {
  if (!WALK.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path.startsWith(`${p}?`))) return false;
  return !NEVER.some((re) => re.test(path));
}

interface Step {
  userId: string;
  url: string;
  board: boolean;
}

interface Progress {
  running: boolean;
  by: string;
  startedAt: string | null;
  finishedAt: string | null;
  deadline: string | null;
  planned: number;
  done: number;
  failed: number;
  current: string | null;
  lastError: string | null;
}

const gp = globalThis as { __rexSnapshotProgress?: Progress; __rexSnapshotStop?: boolean };
function progress(): Progress {
  if (!gp.__rexSnapshotProgress) {
    gp.__rexSnapshotProgress = { running: false, by: "", startedAt: null, finishedAt: null, deadline: null, planned: 0, done: 0, failed: 0, current: null, lastError: null };
  }
  return gp.__rexSnapshotProgress;
}

export function snapshotProgress(): Progress {
  return { ...progress() };
}

export function stopSnapshotRun(): void {
  gp.__rexSnapshotStop = true;
}

/** What to walk, boards per person first, then records most recent first. */
async function plan(hours: number): Promise<Step[]> {
  const rows = await q<{ user_id: string; path: string; query: string; last: Date; n: string }>(
    `SELECT r.user_id, r.path, r.query, MAX(r.at) AS last, COUNT(*)::text AS n
       FROM os_read_log r JOIN os_users u ON u.id = r.user_id
      WHERE r.method = 'GET' AND r.at > NOW() - make_interval(hours => $1)
        AND r.viewing_as IS NULL AND u.locked_at IS NULL
      GROUP BY r.user_id, r.path, r.query`,
    [hours]
  );
  /* A path more than two people open with no query is a board: its answer
     can depend on who asks, so it is walked once per person. Anything else
     is a record, and once is enough, as whoever opened it last. */
  const byUrl = new Map<string, { users: Map<string, number>; path: string }>();
  for (const r of rows) {
    if (!walkable(r.path)) continue;
    const url = r.query ? `${r.path}?${r.query}` : r.path;
    if (r.query.includes("…")) continue; // a secret the read log blanked: cannot be asked again
    const e = byUrl.get(url) ?? { users: new Map(), path: r.path };
    e.users.set(r.user_id, Math.max(e.users.get(r.user_id) ?? 0, new Date(r.last).getTime()));
    byUrl.set(url, e);
  }
  const boards: Step[] = [];
  const records: Array<Step & { last: number }> = [];
  for (const [url, e] of byUrl) {
    if (e.users.size >= 3 && !url.includes("?") && !/\/[0-9a-f-]{6,}|\/\d{3,}/i.test(e.path)) {
      for (const userId of e.users.keys()) boards.push({ userId, url, board: true });
    } else {
      const [userId, last] = [...e.users.entries()].sort((a, b) => b[1] - a[1])[0];
      records.push({ userId, url, board: false, last });
    }
  }
  records.sort((a, b) => b.last - a.last);
  return [...boards, ...records].slice(0, MAX_STEPS);
}

function selfBase(origin?: string): string {
  if (process.env.REX_SNAPSHOT_BASE) return process.env.REX_SNAPSHOT_BASE;
  if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}`;
  return origin ?? "http://127.0.0.1:3000";
}

/**
 * Start a run in the background. `deadline` stops it at a time (the refresh
 * before 2.30pm must not still be asking when REX goes).
 */
export function startSnapshotRun(by: string, opts: { origin?: string; deadline?: Date; hours?: number } = {}): { ok: boolean; error?: string } {
  if (!hasDb()) return { ok: false, error: "No database here." };
  if (!process.env.CRON_SECRET) return { ok: false, error: "CRON_SECRET is not set, so the walk cannot pass the door quietly." };
  const p = progress();
  if (p.running) return { ok: false, error: "A copy is already being taken." };
  gp.__rexSnapshotStop = false;
  Object.assign(p, {
    running: true,
    by,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    deadline: opts.deadline?.toISOString() ?? null,
    planned: 0,
    done: 0,
    failed: 0,
    current: null,
    lastError: null,
  });
  void walk(by, selfBase(opts.origin), opts.deadline ?? null, opts.hours ?? 36).catch((e) => {
    p.lastError = e instanceof Error ? e.message : String(e);
    console.error("[rex-snapshot] run failed", e);
  }).finally(() => {
    p.running = false;
    p.current = null;
    p.finishedAt = new Date().toISOString();
    setSnapshotRun(false);
  });
  return { ok: true };
}

async function walk(by: string, base: string, deadline: Date | null, hours: number): Promise<void> {
  const p = progress();
  const steps = await plan(hours);
  p.planned = steps.length;
  const startedAt = new Date();
  setSnapshotRun(true);
  console.log(`[rex-snapshot] ${by} started: ${steps.length} screens to ask again via ${base}`);
  const cookies = new Map<string, string>();
  let stoppedEarly: string | undefined;
  for (const s of steps) {
    if (gp.__rexSnapshotStop) { stoppedEarly = "stopped by hand"; break; }
    if (deadline && Date.now() > deadline.getTime()) { stoppedEarly = `stopped at the deadline, ${p.done} of ${steps.length} asked`; break; }
    p.current = s.url;
    let cookie = cookies.get(s.userId);
    if (!cookie) {
      cookie = createSessionToken(s.userId);
      cookies.set(s.userId, cookie);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), STEP_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${s.url}`, {
        headers: { cookie: `os_session=${cookie}`, "x-os-rex-snapshot": process.env.CRON_SECRET ?? "", accept: "application/json" },
        cache: "no-store",
        signal: ac.signal,
        redirect: "manual",
      });
      await res.arrayBuffer().catch(() => null);
      if (!res.ok) p.failed += 1;
    } catch (e) {
      p.failed += 1;
      p.lastError = `${s.url}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timer);
    }
    p.done += 1;
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  const kept = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM os_rex_snapshot WHERE taken_at >= $1`,
    [startedAt.toISOString()]
  ).catch(() => []);
  const report: SnapshotRunReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    by,
    steps: p.done,
    failed: p.failed,
    kept: Number(kept[0]?.n ?? 0),
    note: stoppedEarly,
  };
  await saveSnapshotRun(report);
  const { record } = await import("@/lib/audit");
  await record({
    kind: "rex_snapshot_taken",
    actorEmail: by,
    detail: `Copy of REX taken: ${report.steps} screens asked again, ${report.kept} REX answers kept${report.failed ? `, ${report.failed} screens failed` : ""}${stoppedEarly ? ` (${stoppedEarly})` : ""}.`,
  });
  console.log(`[rex-snapshot] done: ${report.steps} screens, ${report.kept} answers kept, ${report.failed} failed${stoppedEarly ? `, ${stoppedEarly}` : ""}`);
}
