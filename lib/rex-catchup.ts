import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexIsDown } from "@/lib/rex-outage";
import { BY_HAND, CATCHUP_PHASES } from "@/lib/rex-catchup-phases";

/* ==========================================================================
   THE MORNING CATCH-UP (James, 21 Oct 2026).

   "We need a backlog to run through everything tomorrow ... go through every
   phase to then repush it onto REX if it hasn't been, to catch all of the
   files up."

   The write queue (lib/rex-queue) sends the simple updates on by itself. What
   it cannot send is anything REX has to answer with a new id - a contact, a
   diary entry, a listing, a certificate - because the OS keeps that id on its
   own record, and a raw replay would put the record in REX with the OS none
   the wiser (and the OS's own retry would then make it twice).

   So the catch-up goes phase by phase, in the order a file moves, and for
   each phase asks the OS's own records what should be in REX and is not -
   anything made or changed since REX went - and pushes it with the same
   function the screen would have used. That function stores the REX id, so
   running it again finds nothing left to do.

   Every phase can be looked at before anything is sent (Check), sends one
   record at a time a second and a half apart, and stops at the first refusal
   so the next record is never sent on top of a problem.
   ========================================================================== */

export interface CatchupItem {
  /** The OS's own id for the record, unique within the phase. */
  id: string;
  /** "Sophie Clark", "14 Moor Street - gas certificate". */
  label: string;
  /** Why it is here: "added 4.12pm by Lianna, not in REX". */
  detail: string;
  at: string | null;
  href?: string;
}

export interface Phase {
  key: string;
  label: string;
  /** What this phase covers, in a line for Admin. */
  what: string;
  /** Records since `since` that should be in REX and are not. */
  find: (since: Date) => Promise<CatchupItem[]>;
  /** Push one, with the OS's own function. Never throws. */
  push: (item: CatchupItem) => Promise<{ ok: boolean; error?: string }>;
  /** The REX writes this phase redoes: their turned-away rows in the backlog
   *  are closed once the phase has nothing left to send. */
  covers: string[];
}

const PHASES: Phase[] = CATCHUP_PHASES;

/* Records somebody chose to leave out of the catch-up (one REX keeps
   refusing, say): otherwise the first bad record stops every run. */
const SKIP_KEY = "rex_catchup_skipped";
async function skipped(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ value: string[] }>(`SELECT value FROM os_settings WHERE key = $1`, [SKIP_KEY]).catch(() => []);
  return new Set(Array.isArray(rows[0]?.value) ? rows[0].value : []);
}
export async function skipItem(phase: string, id: string, by: string): Promise<void> {
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, jsonb_build_array($2::text), NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = os_settings.value || jsonb_build_array($2::text), updated_at = NOW(), updated_by = $3`,
    [SKIP_KEY, `${phase}:${id}`, by]
  );
}
async function findLeft(p: Phase, since: Date): Promise<CatchupItem[]> {
  const skip = await skipped();
  return (await p.find(since)).filter((it) => !skip.has(`${p.key}:${it.id}`));
}

export interface PhaseCheck {
  key: string;
  label: string;
  what: string;
  items: CatchupItem[];
  error: string | null;
}

/** Every phase, looked at, nothing sent. */
export async function checkAll(since: Date): Promise<PhaseCheck[]> {
  const out: PhaseCheck[] = [];
  for (const p of PHASES) {
    try {
      out.push({ key: p.key, label: p.label, what: p.what, items: await findLeft(p, since), error: null });
    } catch (e) {
      out.push({ key: p.key, label: p.label, what: p.what, items: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export interface PhaseRun {
  key: string;
  sent: number;
  stopped: { id: string; label: string; error: string } | null;
  skippedBecause?: string;
}

const PACE_MS = 1_500;

/** Send one phase, in order, stopping at the first refusal. */
export async function runPhase(key: string, since: Date, by: string): Promise<PhaseRun> {
  const p = PHASES.find((x) => x.key === key);
  if (!p) return { key, sent: 0, stopped: null, skippedBecause: "no such phase" };
  if (await rexIsDown()) return { key, sent: 0, stopped: null, skippedBecause: "REX is still down" };
  const items = await findLeft(p, since);
  const run: PhaseRun = { key, sent: 0, stopped: null };
  for (const item of items) {
    const r = await p.push(item).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    if (!r.ok) {
      run.stopped = { id: item.id, label: item.label, error: r.error ?? "REX refused it" };
      break;
    }
    run.sent += 1;
    await new Promise((res) => setTimeout(res, PACE_MS));
  }
  /* Nothing left in this phase: the backlog's turned-away rows for it are
     done too (uploads only where they were not listing photos - those stay
     on the by-hand list). */
  if (!run.stopped && !(await findLeft(p, since)).length && p.covers.length) {
    await q(
      `UPDATE os_rex_write_queue SET state = 'caught_up', sent_at = NOW(), error = $3
        WHERE state = 'turned_away' AND queued_at > $1 AND (service || '/' || method) = ANY($2::text[])
          AND NOT (service = 'Upload' AND body::text ~ 'listing-[0-9]+')`,
      [since.toISOString(), p.covers, `Caught up by the ${p.label} phase`]
    ).catch(() => {});
  }
  if (run.sent || run.stopped) {
    const { record } = await import("@/lib/audit");
    await record({
      kind: run.stopped ? "rex_queue_stopped" : "rex_queue_sent",
      actorEmail: by,
      detail: `Catch-up, ${p.label}: ${run.sent} sent to REX${run.stopped ? `, stopped at ${run.stopped.label}: ${run.stopped.error}` : ""}.`,
    });
  }
  return run;
}

/** When REX went: the planned window's start, else the first thing kept, else the morning before. */
export async function outageStart(): Promise<Date> {
  if (hasDb()) {
    const rows = await q<{ from: string | null; first: Date | null }>(
      `SELECT (SELECT value->>'plannedFrom' FROM os_settings WHERE key = 'rex_status') AS from,
              (SELECT MIN(queued_at) FROM os_rex_write_queue WHERE queued_at > NOW() - INTERVAL '3 days') AS first`
    ).catch(() => []);
    const planned = rows[0]?.from ? new Date(rows[0].from) : null;
    const first = rows[0]?.first ? new Date(rows[0].first) : null;
    const candidates = [planned, first].filter((d): d is Date => !!d && Number.isFinite(d.getTime()));
    if (candidates.length) {
      /* Half an hour before, for anything done in the last minutes before REX
         went that did not land. */
      return new Date(Math.min(...candidates.map((d) => d.getTime())) - 30 * 60_000);
    }
  }
  return new Date(Date.now() - 24 * 3_600_000);
}

/* ───────────────────────── by hand ───────────────────────── */

export interface HandRow {
  id: string;
  what: string;
  summary: string;
  who: string;
  at: string;
  recordKind: string | null;
  recordId: string | null;
  href: string | null;
}

/**
 * What only a person can redo: the creates REX turned away whose screens
 * kept nothing (a new listing, photos, publishing, an application, an
 * REX e-sign request on the old route - not DocuSeal terms, which never need
 * REX), from the backlog the write queue wrote down overnight.
 * Uploads are listed only for listing photos and plans - the others are a
 * lead's document or a certificate, which the phases above redo.
 */
export async function handList(since: Date): Promise<HandRow[]> {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; service: string; method: string; summary: string; actor_name: string; queued_at: Date; record_kind: string | null; record_id: string | null; body: unknown }>(
    `SELECT id::text, service, method, summary, actor_name, queued_at, record_kind, record_id, body
       FROM os_rex_write_queue WHERE state = 'turned_away' AND queued_at > $1 ORDER BY id`,
    [since.toISOString()]
  );
  const out: HandRow[] = [];
  for (const r of rows) {
    const what = `${r.service}/${r.method}`;
    if (!BY_HAND.has(what)) continue;
    const text = JSON.stringify(r.body ?? {});
    if (what === "Upload/uploadFileFromUrl" && !/listing-\d+/.test(text)) continue;
    const listing = r.record_kind === "listing" ? r.record_id : (/listing-(\d+)/.exec(text)?.[1] ?? null);
    out.push({
      id: r.id,
      what,
      summary: what === "Upload/uploadFileFromUrl" ? "Photo or floor plan" : r.summary,
      who: r.actor_name || "the office",
      at: new Date(r.queued_at).toISOString(),
      recordKind: listing ? "listing" : r.record_kind,
      recordId: listing ?? r.record_id,
      href: listing ? `/listings/${listing}` : null,
    });
  }
  return out;
}

/** Somebody redid it by hand: off the list. */
export async function markHandDone(id: string, by: string): Promise<void> {
  await q(
    `UPDATE os_rex_write_queue SET state = 'caught_up', sent_at = NOW(), error = $2 WHERE id = $1 AND state = 'turned_away'`,
    [id, `Redone by hand, ticked by ${by}`]
  );
}

/* ───────────────────────── run in the background ───────────────────────── */

/* A morning's catch-up can be a few hundred records at a second and a half
   each - longer than a browser request lives behind Cloudflare. So it runs
   here, and Admin asks how far it has got. */
export interface CatchupProgress {
  running: boolean;
  by: string;
  startedAt: string | null;
  finishedAt: string | null;
  phase: string | null;
  results: PhaseRun[];
}
const gc = globalThis as { __rexCatchup?: CatchupProgress };
function prog(): CatchupProgress {
  if (!gc.__rexCatchup) gc.__rexCatchup = { running: false, by: "", startedAt: null, finishedAt: null, phase: null, results: [] };
  return gc.__rexCatchup;
}
export function catchupProgress(): CatchupProgress {
  return { ...prog(), results: [...prog().results] };
}

/** One phase, or every phase in order (stopping at the first that stops). */
export function startCatchup(by: string, since: Date, only?: string): { ok: boolean; error?: string } {
  const p = prog();
  if (p.running) return { ok: false, error: "The catch-up is already running." };
  const keys = only ? [only] : PHASES.map((x) => x.key);
  Object.assign(p, { running: true, by, startedAt: new Date().toISOString(), finishedAt: null, phase: null, results: [] });
  void (async () => {
    for (const key of keys) {
      p.phase = key;
      const r: PhaseRun = await runPhase(key, since, by).catch((e): PhaseRun => ({ key, sent: 0, stopped: { id: "", label: key, error: e instanceof Error ? e.message : String(e) } }));
      p.results.push(r);
      if (r.stopped || r.skippedBecause) break;
    }
  })().finally(() => {
    p.running = false;
    p.phase = null;
    p.finishedAt = new Date().toISOString();
  });
  return { ok: true };
}
