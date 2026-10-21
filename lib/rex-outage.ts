import "server-only";
import { createHash } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/* ==========================================================================
   WHEN REX IS DOWN (21 Oct 2026).

   REX emailed at breakfast: every REX product offline from 2.45pm BST for a
   PHP security upgrade, back "approximately 8am" tomorrow. The OS reads
   almost everything live from REX, so without this every board would spin
   for twenty seconds a call and then show nothing - and every cron would
   keep knocking on a dead door all night.

   Three things, all hung off the one door every REX call already passes
   (rexCall in lib/rex):

   1. THE COPY. Every successful REX read is kept in os_rex_snapshot, keyed
      by exactly what was asked, so the question a screen asks at 4pm finds
      the answer REX gave at 2.25pm. A run before the outage (lib/rex-snapshot)
      walks the screens so the copy is whole and fresh.

   2. THE SWITCH. REX is "down" when James says so in Admin, inside the
      planned window, or when three calls in two minutes fail the way an
      outage fails. While down nothing goes to REX at all - reads come from
      the copy in milliseconds rather than after a twenty-second fuse - and
      once a minute one call is let through to see whether it is back.

   3. THE QUEUE. A write James has armed (REX_ALLOW_WRITES) that arrives
      while REX is down is kept in os_rex_write_queue, with who and when, and
      sent in order once REX answers again. The first refusal stops the run
      and says so: a later change built on an earlier one must not land
      without it.

   James's live-figures rule allows the copy only because it is labelled:
   every OS screen carries the band (components/RexOutageBar) while it is in
   use, with the time the copy was taken.
   ========================================================================== */

export type RexMode = "auto" | "down" | "up";

export interface RexStatusSetting {
  mode: RexMode;
  /** The planned window, ISO. Inside it REX counts as down without asking. */
  plannedFrom: string | null;
  plannedUntil: string | null;
  setBy: string;
  setAt: string | null;
}

const SETTING_KEY = "rex_status";
const SETTING_TTL_MS = 15_000;

/** Three outage-shaped failures inside two minutes and the switch trips. */
const TRIP_FAILS = 3;
const TRIP_WINDOW_MS = 120_000;
/** While tripped, one call a minute is let through to see if REX is back. */
const PROBE_EVERY_MS = 60_000;
/** A screen's read is kept again at most this often (a run keeps everything). */
const RECORD_EVERY_MS = 5 * 60_000;
/** Nothing older than this is ever served, however long REX is gone. */
const SERVE_MAX_AGE_H = 36;
/** One answer bigger than this is not kept - nothing a screen shows is. */
const RECORD_MAX_BYTES = 4_000_000;

interface OutageState {
  setting: RexStatusSetting | null;
  settingReadAt: number;
  fails: number[];
  trippedAt: number | null;
  lastProbeAt: number;
  probing: boolean;
  lastOkAt: number | null;
  lastFailAt: number | null;
  lastFailWhat: string | null;
  /** The oldest copy served since REX went down, for the band. */
  oldestServed: number | null;
  servedCount: number;
  missedCount: number;
  /** Which questions the copy could not answer, for Admin: "Listings/read" -> 12. */
  missed: Map<string, number>;
  queuedSinceDown: number;
  recordedAt: Map<string, number>;
  prunedAt: number;
  lastDown: boolean;
  onBack: Array<() => void>;
}

const g = globalThis as { __rexOutage?: OutageState };
function st(): OutageState {
  if (!g.__rexOutage) {
    g.__rexOutage = {
      setting: null,
      settingReadAt: 0,
      fails: [],
      trippedAt: null,
      lastProbeAt: 0,
      probing: false,
      lastOkAt: null,
      lastFailAt: null,
      lastFailWhat: null,
      oldestServed: null,
      servedCount: 0,
      missedCount: 0,
      missed: new Map(),
      queuedSinceDown: 0,
      recordedAt: new Map(),
      prunedAt: 0,
      lastDown: false,
      onBack: [],
    };
  }
  return g.__rexOutage;
}

const DEFAULT_SETTING: RexStatusSetting = { mode: "auto", plannedFrom: null, plannedUntil: null, setBy: "", setAt: null };

/* ───────────────────────── the switch ───────────────────────── */

export async function readRexSetting(fresh = false): Promise<RexStatusSetting> {
  const s = st();
  if (!fresh && s.setting && Date.now() - s.settingReadAt < SETTING_TTL_MS) return s.setting;
  if (!hasDb()) return (s.setting = s.setting ?? DEFAULT_SETTING);
  try {
    const rows = await q<{ value: Partial<RexStatusSetting> }>(`SELECT value FROM os_settings WHERE key = $1`, [SETTING_KEY]);
    const v = rows[0]?.value ?? {};
    s.setting = {
      mode: v.mode === "down" || v.mode === "up" ? v.mode : "auto",
      plannedFrom: v.plannedFrom ?? null,
      plannedUntil: v.plannedUntil ?? null,
      setBy: v.setBy ?? "",
      setAt: v.setAt ?? null,
    };
  } catch {
    /* The database being unreachable is no reason to stop asking REX. */
    s.setting = s.setting ?? DEFAULT_SETTING;
  }
  s.settingReadAt = Date.now();
  return s.setting;
}

export async function writeRexSetting(next: Partial<RexStatusSetting>, by: string): Promise<RexStatusSetting> {
  const cur = await readRexSetting(true);
  const value: RexStatusSetting = { ...cur, ...next, setBy: by, setAt: new Date().toISOString() };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [SETTING_KEY, JSON.stringify(value), by]
  );
  const s = st();
  const wasDown = rexDownNow(s.setting);
  s.setting = value;
  s.settingReadAt = Date.now();
  /* Forced back up: forget the trip too, or the next call would still be
     held back for a probe that is no longer needed. */
  if (value.mode === "up") { s.trippedAt = null; s.fails = []; }
  if (wasDown && !rexDownNow(value)) backAgain();
  return value;
}

function inPlannedWindow(setting: RexStatusSetting | null, now = Date.now()): boolean {
  if (!setting?.plannedFrom || !setting.plannedUntil) return false;
  const from = Date.parse(setting.plannedFrom);
  const until = Date.parse(setting.plannedUntil);
  return Number.isFinite(from) && Number.isFinite(until) && now >= from && now < until;
}

function rexDownNow(setting: RexStatusSetting | null): boolean {
  if (setting?.mode === "down") return true;
  if (setting?.mode === "up") return false;
  return inPlannedWindow(setting) || st().trippedAt != null;
}

/** Is REX down right now, by any of the three ways of knowing? */
export async function rexIsDown(): Promise<boolean> {
  return rexDownNow(await readRexSetting());
}

/** Why it counts as down, in words for the Admin card. */
export type DownReason = "forced" | "planned" | "detected" | null;
export async function rexDownReason(): Promise<DownReason> {
  const setting = await readRexSetting();
  if (setting.mode === "down") return "forced";
  if (setting.mode === "up") return null;
  if (inPlannedWindow(setting)) return "planned";
  return st().trippedAt != null ? "detected" : null;
}

/**
 * May this call go to REX? `probe` means it is the one call a minute let
 * through while tripped: its answer decides whether REX is back.
 */
export async function mayAskRex(opts: { write?: boolean } = {}): Promise<{ live: boolean; probe: boolean }> {
  const setting = await readRexSetting();
  /* The planned window ending, or a setting changed on another server,
     moves the state without anybody calling writeRexSetting here: notice
     the change from down to up, so the waiting changes still go. */
  const s0 = st();
  const downNow = rexDownNow(setting);
  if (s0.lastDown && !downNow) backAgain();
  s0.lastDown = downNow;
  if (setting.mode === "down") return { live: false, probe: false };
  if (setting.mode === "up") return { live: true, probe: false };
  if (inPlannedWindow(setting)) return { live: false, probe: false };
  const s = st();
  if (s.trippedAt == null) return { live: true, probe: false };
  /* A write is never the probe: if REX is still down it would be lost
     rather than kept. Reads find out, and the queue follows. */
  if (opts.write) return { live: false, probe: false };
  if (!s.probing && Date.now() - s.lastProbeAt >= PROBE_EVERY_MS) {
    s.probing = true;
    s.lastProbeAt = Date.now();
    return { live: true, probe: true };
  }
  return { live: false, probe: false };
}

/** A REX answer came back, or did not. Trips and un-trips the switch. */
export function noteRexOutcome(ok: boolean, what: string, opts: { probe?: boolean; outage?: boolean } = {}): void {
  const s = st();
  const now = Date.now();
  if (opts.probe) s.probing = false;
  if (ok) {
    s.lastOkAt = now;
    s.fails = [];
    if (s.trippedAt != null) {
      console.log(`[rex-outage] REX answered again after ${Math.round((now - s.trippedAt) / 60000)} min`);
      s.trippedAt = null;
      backAgain();
    }
    return;
  }
  if (!opts.outage) return;
  s.lastFailAt = now;
  s.lastFailWhat = what;
  s.fails = s.fails.filter((t) => now - t < TRIP_WINDOW_MS);
  s.fails.push(now);
  if (s.trippedAt == null && s.fails.length >= TRIP_FAILS) {
    s.trippedAt = now;
    s.lastProbeAt = now;
    s.oldestServed = null;
    s.servedCount = 0;
    s.missedCount = 0;
    s.missed.clear();
    s.queuedSinceDown = 0;
    console.warn(`[rex-outage] REX looks down (${s.fails.length} failures in 2 min, last ${what}) - serving the copy`);
  }
}

/** Run when REX comes back: the write queue's replay hangs off this. */
export function onRexBack(fn: () => void): void {
  st().onBack.push(fn);
}

function backAgain(): void {
  const s = st();
  s.lastDown = false;
  s.oldestServed = null;
  s.servedCount = 0;
  s.missedCount = 0;
  s.queuedSinceDown = 0;
  for (const fn of s.onBack) {
    try { fn(); } catch (e) { console.error("[rex-outage] on-back hook failed", e); }
  }
}

/* ───────────────────────── the copy ───────────────────────── */

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function snapshotKey(service: string, method: string, body: unknown): string {
  return createHash("sha256").update(`${service}/${method}\n${JSON.stringify(canonical(body ?? {}))}`).digest("hex");
}

/* A time of day inside a question ("modified since 14:03:27") would make
   every ask a new key. The loose key rounds those to the day, so a screen
   that puts "now" in its question still finds the answer kept earlier that
   day. Only used when the exact question has no answer. */
const ISO_TIME = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
function loosen(v: unknown): unknown {
  if (typeof v === "string") {
    const m = ISO_TIME.exec(v);
    return m ? m[1] : v;
  }
  if (typeof v === "number" && v > 1e12 && v < 3e12) return Math.floor(v / 86_400_000);
  if (typeof v === "number" && v > 1e9 && v < 3e9) return Math.floor(v / 86_400);
  if (Array.isArray(v)) return v.map(loosen);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = loosen((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
export function looseKey(service: string, method: string, body: unknown): string {
  return createHash("sha256").update(`${service}/${method}\n${JSON.stringify(loosen(body ?? {}))}`).digest("hex");
}

/* Looser still, for the morning after: the diary asks "from a fortnight ago
   to three months on", counted from today, so at 7am tomorrow every date in
   the question has moved and neither key above finds it. The shape key drops
   dates altogether and serves the latest answer to the same question asked
   on another day. The screens work out "today" from each appointment's own
   time, so yesterday's answer still files tomorrow's viewings correctly. */
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
function shapeOf(v: unknown): unknown {
  if (typeof v === "string") return DATE_LIKE.test(v) ? "<date>" : v;
  if (typeof v === "number" && ((v > 1e12 && v < 3e12) || (v > 1e9 && v < 3e9))) return "<time>";
  if (Array.isArray(v)) return v.map(shapeOf);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = shapeOf((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
export function shapeKey(service: string, method: string, body: unknown): string {
  return createHash("sha256").update(`${service}/${method}\n${JSON.stringify(shapeOf(body ?? {}))}`).digest("hex");
}

/**
 * Is this request the copy's own walk, and if so when did the run start?
 * A cache holding something older than the run reads REX again rather than
 * answering from what it holds - otherwise the walk would find every board
 * warm and keep none of the REX answers the boards will need overnight.
 * Request-scoped (the walk's header), so nobody else's screen slows down.
 */
export async function walkRunStart(): Promise<number | null> {
  const run = gr.__rexSnapshotRun;
  if (!run || !process.env.CRON_SECRET) return null;
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get("x-os-rex-snapshot") === process.env.CRON_SECRET ? run.startedAt : null;
  } catch {
    return null;
  }
}

/** True when a held copy from `at` must be read again for the walk. */
export async function staleForWalk(at: number | null | undefined): Promise<boolean> {
  const start = await walkRunStart();
  return start != null && (at ?? 0) < start;
}

const gr = globalThis as { __rexSnapshotRun?: { startedAt: number } | null };
/** A snapshot run is going: keep every answer, however recently it was kept. */
export function snapshotRunActive(): boolean {
  return !!gr.__rexSnapshotRun;
}
export function setSnapshotRun(on: boolean): void {
  gr.__rexSnapshotRun = on ? { startedAt: Date.now() } : null;
}

/** Keep a good REX read. Never awaited by the caller, never throws. */
export function recordRead(service: string, method: string, body: unknown, result: unknown): void {
  if (!hasDb() || result === undefined) return;
  const s = st();
  const key = snapshotKey(service, method, body);
  const now = Date.now();
  const last = s.recordedAt.get(key) ?? 0;
  if (!snapshotRunActive() && now - last < RECORD_EVERY_MS) return;
  s.recordedAt.set(key, now);
  let json: string;
  try {
    json = JSON.stringify(result);
  } catch {
    return;
  }
  if (json.length > RECORD_MAX_BYTES) return;
  void q(
    `INSERT INTO os_rex_snapshot (key, service, method, body, result, taken_at, bytes, loose_key, shape_key)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW(), $6, $7, $8)
     ON CONFLICT (key) DO UPDATE SET result = EXCLUDED.result, taken_at = NOW(), bytes = EXCLUDED.bytes,
       loose_key = EXCLUDED.loose_key, shape_key = EXCLUDED.shape_key`,
    [key, service, method, JSON.stringify(body ?? {}), json, json.length, looseKey(service, method, body), shapeKey(service, method, body)]
  ).catch((e) => {
    /* Not kept, so not "kept five minutes ago" either: the next ask tries again. */
    s.recordedAt.delete(key);
    console.warn("[rex-outage] could not keep a read", `${service}/${method}`, e instanceof Error ? e.message : e);
  });
  /* A week is plenty: the copy is for an overnight outage, not an archive. */
  if (now - s.prunedAt > 3_600_000) {
    s.prunedAt = now;
    void q(`DELETE FROM os_rex_snapshot WHERE taken_at < NOW() - INTERVAL '7 days'`).catch(() => {});
    if (s.recordedAt.size > 50_000) s.recordedAt.clear();
  }
}

/** The kept answer to exactly this question, if there is one young enough. */
export async function readSnapshot(
  service: string,
  method: string,
  body: unknown
): Promise<{ result: unknown; takenAt: string } | null> {
  if (!hasDb()) return null;
  const key = snapshotKey(service, method, body);
  let rows = await q<{ result: unknown; taken_at: Date }>(
    `UPDATE os_rex_snapshot SET hits = hits + 1, last_served_at = NOW()
      WHERE key = $1 AND taken_at > NOW() - make_interval(hours => $2)
      RETURNING result, taken_at`,
    [key, SERVE_MAX_AGE_H]
  ).catch(() => []);
  if (!rows[0]) {
    rows = await q<{ result: unknown; taken_at: Date }>(
      `UPDATE os_rex_snapshot SET hits = hits + 1, last_served_at = NOW()
        WHERE key = (SELECT key FROM os_rex_snapshot WHERE loose_key = $1 AND taken_at > NOW() - make_interval(hours => $2)
                      ORDER BY taken_at DESC LIMIT 1)
        RETURNING result, taken_at`,
      [looseKey(service, method, body), SERVE_MAX_AGE_H]
    ).catch(() => []);
  }
  if (!rows[0]) {
    rows = await q<{ result: unknown; taken_at: Date }>(
      `UPDATE os_rex_snapshot SET hits = hits + 1, last_served_at = NOW()
        WHERE key = (SELECT key FROM os_rex_snapshot WHERE shape_key = $1 AND taken_at > NOW() - make_interval(hours => $2)
                      ORDER BY taken_at DESC LIMIT 1)
        RETURNING result, taken_at`,
      [shapeKey(service, method, body), SERVE_MAX_AGE_H]
    ).catch(() => []);
  }
  const s = st();
  const row = rows[0];
  if (!row) {
    s.missedCount += 1;
    const what = `${service}/${method}`;
    s.missed.set(what, (s.missed.get(what) ?? 0) + 1);
    return null;
  }
  const at = new Date(row.taken_at).getTime();
  s.servedCount += 1;
  if (s.oldestServed == null || at < s.oldestServed) s.oldestServed = at;
  return { result: row.result, takenAt: new Date(at).toISOString() };
}

/** The last full run that finished, for the band ("the copy taken at 2.25pm"). */
const RUN_KEY = "rex_snapshot_run";
export interface SnapshotRunReport {
  startedAt: string;
  finishedAt: string | null;
  by: string;
  steps: number;
  failed: number;
  kept: number;
  note?: string;
}
export async function lastSnapshotRun(): Promise<SnapshotRunReport | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: SnapshotRunReport }>(`SELECT value FROM os_settings WHERE key = $1`, [RUN_KEY]).catch(() => []);
  return rows[0]?.value ?? null;
}
export async function saveSnapshotRun(r: SnapshotRunReport): Promise<void> {
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [RUN_KEY, JSON.stringify(r), r.by || "rex-snapshot"]
  );
}

/* ───────────────────────── for the band and Admin ───────────────────────── */

export interface RexStatusView {
  down: boolean;
  reason: DownReason;
  setting: RexStatusSetting;
  copyTakenAt: string | null;
  oldestServedAt: string | null;
  servedCount: number;
  missedCount: number;
  missedWhat: Array<{ what: string; n: number }>;
  waiting: number;
  lastOkAt: string | null;
  lastFailAt: string | null;
  lastFailWhat: string | null;
  trippedAt: string | null;
  snapshot: { rows: number; newest: string | null; oldest: string | null; mb: number } | null;
  lastRun: SnapshotRunReport | null;
}

const iso = (n: number | null) => (n == null ? null : new Date(n).toISOString());

export async function rexStatusView(opts: { detail?: boolean } = {}): Promise<RexStatusView> {
  const setting = await readRexSetting();
  const reason = await rexDownReason();
  const s = st();
  const lastRun = await lastSnapshotRun();
  let waiting = 0;
  let snapshot: RexStatusView["snapshot"] = null;
  if (hasDb()) {
    const w = await q<{ n: string }>(`SELECT COUNT(*)::text AS n FROM os_rex_write_queue WHERE state IN ('waiting','failed')`).catch(() => []);
    waiting = Number(w[0]?.n ?? 0);
    if (opts.detail) {
      const r = await q<{ n: string; newest: Date | null; oldest: Date | null; bytes: string | null }>(
        `SELECT COUNT(*)::text AS n, MAX(taken_at) AS newest, MIN(taken_at) AS oldest, SUM(bytes)::text AS bytes FROM os_rex_snapshot`
      ).catch(() => []);
      if (r[0]) snapshot = {
        rows: Number(r[0].n),
        newest: r[0].newest ? new Date(r[0].newest).toISOString() : null,
        oldest: r[0].oldest ? new Date(r[0].oldest).toISOString() : null,
        mb: Math.round(Number(r[0].bytes ?? 0) / 100_000) / 10,
      };
    }
  }
  return {
    down: reason != null,
    reason,
    setting,
    /* When the run STARTED: everything it kept is at least that fresh, and
       anything older shows on the band as "some of it from". */
    copyTakenAt: lastRun?.startedAt ?? null,
    oldestServedAt: iso(s.oldestServed),
    servedCount: s.servedCount,
    missedCount: s.missedCount,
    missedWhat: [...s.missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([what, n]) => ({ what, n })),
    waiting,
    lastOkAt: iso(s.lastOkAt),
    lastFailAt: iso(s.lastFailAt),
    lastFailWhat: s.lastFailWhat,
    trippedAt: iso(s.trippedAt),
    snapshot,
    lastRun,
  };
}

export function noteQueued(): void {
  st().queuedSinceDown += 1;
}
