import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import { rexIsDown } from "@/lib/rex-outage";

/* ==========================================================================
   SCHEDULED JOBS WHILE REX IS DOWN (21 Oct 2026, lib/rex-outage).

   Nothing reaches REX while it is down anyway - rexCall answers from the
   copy in milliseconds - so no job can hammer it. These are the jobs where
   the copy would do harm rather than good: the sweeps that file REX's answers
   into the OS as today's truth (the lead ledger, the viewings ledger, the
   day's portal figures) and the daily chases that would decide who to email
   from a copy, or half a copy.

   They step aside with a 200 while REX is down. The five-minute ones simply
   run again on their next turn. A daily one is written down and run once
   more when REX is back (lib/rex-queue runs it after the waiting changes), so
   the 7am chases still happen today rather than tomorrow.
   ========================================================================== */

const KEY = "rex_skipped_jobs";

type Skipped = Record<string, { method: string; url: string; skippedAt: string }>;

export async function heldForRex(req: NextRequest, opts: { rerunWhenBack: boolean }): Promise<NextResponse | null> {
  if (!(await rexIsDown())) return null;
  const path = req.nextUrl.pathname;
  if (opts.rerunWhenBack && hasDb()) {
    const entry = { method: req.method, url: path + req.nextUrl.search, skippedAt: new Date().toISOString() };
    await q(
      `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, jsonb_build_object($2::text, $3::jsonb), NOW(), 'rex-jobs')
       ON CONFLICT (key) DO UPDATE SET value = os_settings.value || jsonb_build_object($2::text, $3::jsonb), updated_at = NOW()`,
      [KEY, path, JSON.stringify(entry)]
    ).catch((e) => console.warn("[rex-jobs] could not note a skipped job", path, e));
  }
  if (opts.rerunWhenBack) await import("@/lib/rex-queue").then((m) => m.markWaiting()).catch(() => {});
  console.log(`[rex-jobs] ${path} stepped aside: REX is down${opts.rerunWhenBack ? " (runs again when it is back)" : ""}`);
  return NextResponse.json({ ok: true, skipped: "REX is down for maintenance", rerunWhenBack: opts.rerunWhenBack });
}

export async function skippedJobs(): Promise<Skipped> {
  if (!hasDb()) return {};
  const rows = await q<{ value: Skipped }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  return rows[0]?.value ?? {};
}

/** Run each skipped daily job once, a minute apart, over this server's own address. */
export async function rerunSkippedJobs(base: string): Promise<string[]> {
  const jobs = await skippedJobs();
  const done: string[] = [];
  for (const [path, job] of Object.entries(jobs)) {
    if (await rexIsDown()) break;
    /* Taken off the list before it runs: a job that fails is not retried in
       a loop, and the next scheduled run is there either way. */
    await q(`UPDATE os_settings SET value = value - $2::text WHERE key = $1`, [KEY, path]).catch(() => {});
    try {
      const res = await fetch(`${base}${job.url}`, {
        method: job.method,
        headers: { "x-cron-key": process.env.CRON_SECRET ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(300_000),
      });
      console.log(`[rex-jobs] ran ${job.url} again after REX came back: ${res.status}`);
      done.push(`${job.url} ${res.status}`);
    } catch (e) {
      console.warn(`[rex-jobs] ${job.url} failed when run again`, e instanceof Error ? e.message : e);
      done.push(`${job.url} failed`);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
  return done;
}
