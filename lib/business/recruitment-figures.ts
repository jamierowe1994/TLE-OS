import "server-only";
import { hasDb, q } from "@/lib/db";
import { readCache, writeCache } from "@/lib/business/integration-cache";
import { attr, attrStr, relId, relIds, teamtailorConfigured, teamtailorList, teamtailorOne, type TtResource } from "@/lib/teamtailor";

/**
 * Company Figures > Recruitment: the hiring figures, counted from Teamtailor.
 *
 * James, 26 Nov 2026: "pull through all of the Team Tailor figures" for Susan.
 * His answers at intake were the defaults: The Letting Experts' own vacancies,
 * refreshed hourly, this month plus the twelve before it, counts only.
 *
 * COUNTS ONLY. An Admin key can read every candidate's name, email and CV, so
 * this file never asks for a candidate and never stores one. What is kept is
 * one line per VACANCY with how many applied, were hired or were turned down
 * in each month. This repository is public; nothing personal belongs here or
 * in the cache.
 *
 * Teamtailor has no report endpoint, so the definitions are ours:
 *   applied   - an application created in the month
 *   hired     - an application sitting in a Hired stage, not rejected, that
 *               reached it in the month (a rejected application keeps its
 *               stage, so the stage alone is not enough)
 *   rejected  - an application with a rejected date in the month
 *   time to   - days from the application to the day it reached Hired
 *     hire
 *   pipeline  - Teamtailor's own count of active applications in each stage of
 *               every live vacancy before Hired, as of the last read (not
 *               month-scoped)
 * Months are London months and are worked out from now(), never typed in.
 *
 * It is slow to read (30 a page, 50 requests every 10 seconds), so the walk
 * runs on a timer and when the tab is opened with figures over an hour old.
 * A read that fails, or figures older than MAX_AGE_MS, are shown as an error -
 * never as an old number.
 */

const SNAP_KEY = "recruitment:v1";
const STATUS_KEY = "recruitment:status";
const SCOPE_KEY = "recruitment_scope";
/** Refresh once the figures are this old. */
const STALE_MS = 60 * 60_000;
/** Older than this and the tab shows an error instead of the figures. */
const MAX_AGE_MS = 3 * 60 * 60_000;
/** A walk that has run this long is taken to have died with its container. */
const RUN_LIMIT_MS = 20 * 60_000;
/** This month and the twelve before it. */
const MONTHS_BACK = 12;
/** 30 a page: 45,000 applications. Past it the read fails rather than undercounts. */
const MAX_APPLICATION_PAGES = 1500;

export type StageKind = "inbox" | "screening" | "interview" | "offer" | "hired" | "process";
const STAGE_KINDS: StageKind[] = ["inbox", "screening", "interview", "offer", "hired", "process"];

interface MonthCounts {
  applied: number;
  sourced: number;
  hired: number;
  hireDays: number;
  rejected: number;
  byUs: number;
  byThem: number;
  offersSent: number;
  offersAccepted: number;
  offersDeclined: number;
  sources: Record<string, number>;
  reasons: Record<string, number>;
}

interface JobSnap {
  id: string;
  title: string;
  status: string;
  live: boolean;
  openings: number | null;
  department: string | null;
  division: string | null;
  locations: string[];
  /** Active applications in each kind of stage, as Teamtailor counts them now. */
  stages: Record<StageKind, number>;
  months: Record<string, MonthCounts>;
}

interface Snapshot {
  v: 1;
  syncedAt: string;
  /** The oldest month held, "YYYY-MM". */
  from: string;
  company: string | null;
  jobs: JobSnap[];
  /** Applications and offers whose vacancy Teamtailor no longer lists. */
  unplaced: Record<string, MonthCounts>;
  /** reject reason -> who said no. */
  reasonBy: Record<string, "us" | "them">;
  read: { applications: number; requests: number; seconds: number };
}

interface RunStatus {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  error: string | null;
}

export type ScopeKind = "all" | "division" | "department" | "location";
export interface RecruitmentScope {
  kind: ScopeKind;
  name: string;
}

/** One part of the account: how many vacancies it has ever had, and how many are live now. */
export interface Group {
  name: string;
  jobs: number;
  live: number;
}

export interface RecruitmentFigures {
  month: string;
  asOf: string;
  from: string;
  company: string | null;
  scope: RecruitmentScope;
  /** What the account is split into, so the scope can be picked. */
  groups: { divisions: Group[]; departments: Group[]; locations: Group[] };
  tiles: {
    openVacancies: number;
    openings: number | null;
    applied: number;
    appliedPrev: number;
    sourced: number;
    offersSent: number;
    offersAccepted: number;
    offersDeclined: number;
    hired: number;
    hiredPrev: number;
    hireDays: number | null;
    hireDaysPrev: number | null;
    rejected: number;
    byUs: number;
    byThem: number;
  };
  pipeline: { kind: StageKind; n: number }[];
  sources: { name: string; n: number }[];
  reasons: { reason: string; n: number; by: "us" | "them" | null }[];
  trend: { month: string; applied: number; hired: number }[];
  vacancies: {
    id: string;
    title: string;
    where: string | null;
    status: string;
    live: boolean;
    openings: number | null;
    applied: number;
    inProcess: number;
    hired: number;
  }[];
  /** Counted but not in any vacancy Teamtailor still lists (whole account only). */
  unplacedApplied: number;
}

export type RecruitmentResult =
  | { state: "not-connected" }
  | { state: "loading"; startedAt: string | null }
  | { state: "error"; error: string; lastGoodAt: string | null }
  | { state: "ready"; figures: RecruitmentFigures; refreshing: boolean };

/* ------------------------------- months ------------------------------- */

const londonMonthOf = (iso: string): string => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" }).slice(0, 7);

function monthShift(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthNow = (): string => londonMonthOf(new Date().toISOString());

const emptyMonth = (): MonthCounts => ({
  applied: 0,
  sourced: 0,
  hired: 0,
  hireDays: 0,
  rejected: 0,
  byUs: 0,
  byThem: 0,
  offersSent: 0,
  offersAccepted: 0,
  offersDeclined: 0,
  sources: {},
  reasons: {},
});

const emptyStages = (): Record<StageKind, number> => ({ inbox: 0, screening: 0, interview: 0, offer: 0, hired: 0, process: 0 });

/* ------------------------------- storage ------------------------------- */

/* The process's own copy: a container with no database (a local preview)
   still works, and a read never waits on Postgres twice in a row. */
const mem: { snap: { data: Snapshot; at: number } | null; status: RunStatus | null; scope: RecruitmentScope | null } = { snap: null, status: null, scope: null };

async function loadSnap(): Promise<{ data: Snapshot; at: number } | null> {
  const stored = await readCache<Snapshot>(SNAP_KEY);
  if (stored && stored.data?.v === 1 && (!mem.snap || stored.at >= mem.snap.at)) mem.snap = stored;
  return mem.snap;
}

async function loadStatus(): Promise<RunStatus | null> {
  const stored = await readCache<RunStatus>(STATUS_KEY);
  if (stored?.data && (!mem.status || stored.data.startedAt >= mem.status.startedAt)) mem.status = stored.data;
  return mem.status;
}

async function saveStatus(s: RunStatus): Promise<void> {
  mem.status = s;
  await writeCache(STATUS_KEY, s);
}

const ALL: RecruitmentScope = { kind: "all", name: "" };

export async function recruitmentScope(): Promise<RecruitmentScope> {
  if (!hasDb()) return mem.scope ?? ALL;
  const rows = await q<{ value: RecruitmentScope | null }>(`SELECT value FROM os_settings WHERE key = $1`, [SCOPE_KEY]).catch(() => []);
  const v = rows[0]?.value;
  return v && (v.kind === "division" || v.kind === "department" || v.kind === "location") && typeof v.name === "string" && v.name ? { kind: v.kind, name: v.name } : ALL;
}

export async function setRecruitmentScope(scope: RecruitmentScope, by: string): Promise<void> {
  const clean: RecruitmentScope = scope.kind === "all" ? ALL : { kind: scope.kind, name: scope.name.slice(0, 200) };
  mem.scope = clean;
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [SCOPE_KEY, JSON.stringify(clean), by]
  );
}

/* -------------------------------- the walk -------------------------------- */

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const bump = (o: Record<string, number>, k: string, by = 1) => {
  o[k] = (o[k] ?? 0) + by;
};

async function walk(): Promise<Snapshot> {
  const t0 = Date.now();
  let requests = 0;
  const from = monthShift(monthNow(), -MONTHS_BACK);
  /* A day early, so a London-midnight application is never cut by the UTC edge;
     anything that lands before `from` is dropped when it is bucketed. */
  const since = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1) - 86_400_000).toISOString();
  const inWindow = (m: string) => m >= from;

  /* 1. Which kind each stage is: inbox, screening, interview, offer, hired. */
  const types = await teamtailorList("stage-types");
  requests += types.pages;
  const stageKind = new Map<string, StageKind>();
  const stageActive = new Map<string, number>();
  const noteStage = (s: TtResource, kind?: StageKind) => {
    if (kind) stageKind.set(s.id, kind);
    else if (!stageKind.has(s.id)) {
      const legacy = attrStr(s, "legacy-stage-type-name");
      stageKind.set(s.id, legacy === "Inbox" ? "inbox" : legacy === "Hired" ? "hired" : "process");
    }
    stageActive.set(s.id, num(attr(s, "active-job-applications-count")));
  };
  for (const t of types.rows) {
    const category = attrStr(t, "category");
    if (!category || !(STAGE_KINDS as string[]).includes(category)) continue;
    const stages = await teamtailorList("stages", { "filter[stage-type]": t.id });
    requests += stages.pages;
    if (!stages.complete) throw new Error("Teamtailor has more stages than one read allows.");
    for (const s of stages.rows) noteStage(s, category as StageKind);
  }

  /* 2. Every vacancy, with where it sits and which stages are its own. */
  const jobsList = await teamtailorList("jobs", { "filter[status]": "all", include: "department,division,locations,stages" });
  requests += jobsList.pages;
  if (!jobsList.complete) throw new Error("Teamtailor has more vacancies than one read allows.");
  const jobs = new Map<string, JobSnap>();
  const jobOfStage = new Map<string, string>();
  for (const j of jobsList.rows) {
    const human = attrStr(j, "human-status") ?? attrStr(j, "status") ?? "";
    const dep = relId(j, "department");
    const div = relId(j, "division");
    const openings = attr(j, "number-of-openings");
    const snap: JobSnap = {
      id: j.id,
      title: attrStr(j, "title") ?? "Untitled vacancy",
      status: human,
      live: human === "published" || human === "unlisted",
      openings: typeof openings === "number" ? openings : null,
      department: dep ? attrStr(jobsList.included.get(`departments:${dep}`), "name") : null,
      division: div ? attrStr(jobsList.included.get(`divisions:${div}`), "name") : null,
      locations: relIds(j, "locations")
        .map((id) => {
          const l = jobsList.included.get(`locations:${id}`);
          return attrStr(l, "name") ?? attrStr(l, "city");
        })
        .filter((x): x is string => Boolean(x)),
      stages: emptyStages(),
      months: {},
    };
    for (const sid of relIds(j, "stages")) {
      jobOfStage.set(sid, j.id);
      const s = jobsList.included.get(`stages:${sid}`);
      if (s) noteStage(s);
      snap.stages[stageKind.get(sid) ?? "process"] += stageActive.get(sid) ?? 0;
    }
    jobs.set(j.id, snap);
  }

  /* 3. Why people were turned down, and by whom. */
  const reasonsList = await teamtailorList("reject-reasons");
  requests += reasonsList.pages;
  const reasonName = new Map<string, string>();
  const reasonBy: Record<string, "us" | "them"> = {};
  for (const r of reasonsList.rows) {
    const name = attrStr(r, "reason") ?? "No Reason Given";
    reasonName.set(r.id, name);
    reasonBy[name] = attr(r, "rejected-by-company") === false ? "them" : "us";
  }

  /* 4. Every application touched in the window. No candidate is asked for. */
  const unplaced: Record<string, MonthCounts> = {};
  const monthOf = (jobId: string | null, m: string): MonthCounts => {
    const job = jobId ? jobs.get(jobId) : undefined;
    const home = job ? job.months : unplaced;
    return (home[m] ??= emptyMonth());
  };
  const apps = await teamtailorList("job-applications", { "filter[updated-at][from]": since, include: "stage,reject-reason" }, MAX_APPLICATION_PAGES);
  requests += apps.pages;
  if (!apps.complete) throw new Error("Teamtailor has more applications than one read allows. Nothing was counted.");
  const jobOfApp = new Map<string, string | null>();
  let linked = 0;
  for (const a of apps.rows) {
    const stageId = relId(a, "stage");
    if (stageId) linked++;
    const jobId = stageId ? jobOfStage.get(stageId) ?? null : null;
    jobOfApp.set(a.id, jobId);
    const created = attrStr(a, "created-at");
    const moved = attrStr(a, "changed-stage-at");
    const rejectedAt = attrStr(a, "rejected-at");
    if (created && inWindow(londonMonthOf(created))) {
      const mc = monthOf(jobId, londonMonthOf(created));
      mc.applied++;
      const sourced = attr(a, "sourced") === true;
      if (sourced) mc.sourced++;
      bump(mc.sources, attrStr(a, "referring-site") ?? (sourced ? "Added by a Recruiter" : "Not Recorded"));
    }
    if (rejectedAt) {
      const m = londonMonthOf(rejectedAt);
      if (inWindow(m)) {
        const mc = monthOf(jobId, m);
        mc.rejected++;
        const rid = relId(a, "reject-reason");
        const name = (rid && reasonName.get(rid)) || "No Reason Given";
        bump(mc.reasons, name);
        if (reasonBy[name] === "them") mc.byThem++;
        else mc.byUs++;
      }
    } else if (stageId && stageKind.get(stageId) === "hired" && moved) {
      const m = londonMonthOf(moved);
      if (inWindow(m)) {
        const mc = monthOf(jobId, m);
        mc.hired++;
        if (created) mc.hireDays += Math.max(0, (new Date(moved).getTime() - new Date(created).getTime()) / 86_400_000);
      }
    }
  }
  /* Without the stage link every application would be "unplaced" and no hire
     could be told from an applicant: that is a failed read, not a zero. */
  if (apps.rows.length && !linked) throw new Error("Teamtailor did not say which stage each application is in.");

  /* 5. Offers. An offer made on an application older than the window is looked up, a few at most. */
  const offers = await teamtailorList("job-offers", { include: "job-application" });
  requests += offers.pages;
  if (!offers.complete) throw new Error("Teamtailor has more offers than one read allows.");
  let lookups = 0;
  for (const o of offers.rows) {
    const sent = attrStr(o, "sent-at") ?? attrStr(o, "sent_at");
    const answered = attrStr(o, "answered-at") ?? attrStr(o, "answered_at");
    const status = attrStr(o, "status");
    const sentIn = sent && inWindow(londonMonthOf(sent));
    const answeredIn = answered && inWindow(londonMonthOf(answered)) && (status === "accepted" || status === "declined");
    if (!sentIn && !answeredIn) continue;
    const appId = relId(o, "job-application");
    let jobId: string | null = null;
    if (appId && jobOfApp.has(appId)) jobId = jobOfApp.get(appId) ?? null;
    else if (appId && lookups < 40) {
      lookups++;
      requests++;
      const one = await teamtailorOne(`job-applications/${encodeURIComponent(appId)}`, { include: "stage" });
      const sid = one.row ? relId(one.row, "stage") : null;
      jobId = sid ? jobOfStage.get(sid) ?? null : null;
      jobOfApp.set(appId, jobId);
    }
    if (sentIn) monthOf(jobId, londonMonthOf(sent!)).offersSent++;
    if (answeredIn) {
      const mc = monthOf(jobId, londonMonthOf(answered!));
      if (status === "accepted") mc.offersAccepted++;
      else mc.offersDeclined++;
    }
  }

  /* 6. Whose account this is, for the heading. Not worth failing the read over. */
  let company: string | null = null;
  try {
    requests++;
    company = attrStr((await teamtailorOne("company")).row, "name");
  } catch {
    company = null;
  }

  return {
    v: 1,
    syncedAt: new Date().toISOString(),
    from,
    company,
    jobs: [...jobs.values()],
    unplaced,
    reasonBy,
    read: { applications: apps.rows.length, requests, seconds: Math.round((Date.now() - t0) / 1000) },
  };
}

let running: Promise<void> | null = null;

/**
 * Start a read unless one is already running here or, by the stored status, in
 * another container. Never throws and never waits for the read.
 */
export async function kickRecruitmentSync(): Promise<boolean> {
  if (!teamtailorConfigured() || running) return false;
  const status = await loadStatus();
  if (status && !status.finishedAt && Date.now() - new Date(status.startedAt).getTime() < RUN_LIMIT_MS) return false;
  const startedAt = new Date().toISOString();
  await saveStatus({ startedAt, finishedAt: null, ok: null, error: null });
  running = (async () => {
    try {
      const snap = await walk();
      mem.snap = { data: snap, at: Date.now() };
      await writeCache(SNAP_KEY, snap);
      await saveStatus({ startedAt, finishedAt: new Date().toISOString(), ok: true, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Teamtailor could not be read.";
      await saveStatus({ startedAt, finishedAt: new Date().toISOString(), ok: false, error: msg.slice(0, 300) });
    } finally {
      running = null;
    }
  })();
  return true;
}

/** For the hourly timer: refresh when the figures are over an hour old. */
export async function refreshRecruitmentIfStale(): Promise<"off" | "fresh" | "started" | "running"> {
  if (!teamtailorConfigured()) return "off";
  const snap = await loadSnap();
  if (snap && Date.now() - snap.at < STALE_MS) return "fresh";
  return (await kickRecruitmentSync()) ? "started" : "running";
}

/* ------------------------------- the figures ------------------------------- */

function inScope(j: JobSnap, scope: RecruitmentScope): boolean {
  if (scope.kind === "division") return j.division === scope.name;
  if (scope.kind === "department") return j.department === scope.name;
  if (scope.kind === "location") return j.locations.includes(scope.name);
  return true;
}

function tally(list: { name: string | null; live: boolean }[]): Group[] {
  const m = new Map<string, Group>();
  for (const { name, live } of list) {
    if (!name) continue;
    const g = m.get(name) ?? { name, jobs: 0, live: 0 };
    g.jobs++;
    if (live) g.live++;
    m.set(name, g);
  }
  return [...m.values()].sort((a, b) => b.live - a.live || b.jobs - a.jobs || a.name.localeCompare(b.name));
}

function build(snap: Snapshot, month: string, scope: RecruitmentScope): RecruitmentFigures {
  const jobs = snap.jobs.filter((j) => inScope(j, scope));
  const whole = scope.kind === "all";
  const months = (m: string): MonthCounts[] => [...jobs.map((j) => j.months[m]), whole ? snap.unplaced[m] : undefined].filter((x): x is MonthCounts => Boolean(x));
  const sum = (m: string, pick: (c: MonthCounts) => number) => months(m).reduce((t, c) => t + pick(c), 0);
  const prev = monthShift(month, -1);
  const hired = sum(month, (c) => c.hired);
  const hireDays = sum(month, (c) => c.hireDays);
  const hiredPrev = sum(prev, (c) => c.hired);
  const hireDaysPrev = sum(prev, (c) => c.hireDays);

  const sources: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  for (const c of months(month)) {
    for (const [k, v] of Object.entries(c.sources)) bump(sources, k, v);
    for (const [k, v] of Object.entries(c.reasons)) bump(reasons, k, v);
  }

  const live = jobs.filter((j) => j.live);
  const openingsKnown = live.filter((j) => j.openings != null);
  const pipeline = emptyStages();
  for (const j of live) for (const k of STAGE_KINDS) pipeline[k] += j.stages[k];

  const trend: RecruitmentFigures["trend"] = [];
  for (let m = snap.from; m <= monthNow(); m = monthShift(m, 1)) trend.push({ month: m, applied: sum(m, (c) => c.applied), hired: sum(m, (c) => c.hired) });

  const vacancies = jobs
    .map((j) => {
      const c = j.months[month];
      return {
        id: j.id,
        title: j.title,
        where: [j.department, j.locations[0]].filter(Boolean).join(" · ") || null,
        status: j.status,
        live: j.live,
        openings: j.openings,
        applied: c?.applied ?? 0,
        inProcess: j.stages.inbox + j.stages.screening + j.stages.interview + j.stages.offer + j.stages.process,
        hired: c?.hired ?? 0,
      };
    })
    .filter((v) => v.live || v.applied || v.hired)
    .sort((a, b) => Number(b.live) - Number(a.live) || b.applied - a.applied || a.title.localeCompare(b.title));

  return {
    month,
    asOf: snap.syncedAt,
    from: snap.from,
    company: snap.company,
    scope,
    groups: {
      divisions: tally(snap.jobs.map((j) => ({ name: j.division, live: j.live }))),
      departments: tally(snap.jobs.map((j) => ({ name: j.department, live: j.live }))),
      locations: tally(snap.jobs.flatMap((j) => j.locations.map((name) => ({ name, live: j.live })))),
    },
    tiles: {
      openVacancies: live.length,
      openings: openingsKnown.length ? openingsKnown.reduce((t, j) => t + (j.openings ?? 0), 0) : null,
      applied: sum(month, (c) => c.applied),
      appliedPrev: sum(prev, (c) => c.applied),
      sourced: sum(month, (c) => c.sourced),
      offersSent: sum(month, (c) => c.offersSent),
      offersAccepted: sum(month, (c) => c.offersAccepted),
      offersDeclined: sum(month, (c) => c.offersDeclined),
      hired,
      hiredPrev,
      hireDays: hired ? Math.round((hireDays / hired) * 10) / 10 : null,
      hireDaysPrev: hiredPrev ? Math.round((hireDaysPrev / hiredPrev) * 10) / 10 : null,
      rejected: sum(month, (c) => c.rejected),
      byUs: sum(month, (c) => c.byUs),
      byThem: sum(month, (c) => c.byThem),
    },
    /* People still being considered. A hire has left the pipeline, and Teamtailor's Hired
       stage counts every hire the vacancy ever made, which is no month's figure. */
    pipeline: STAGE_KINDS.filter((k) => k !== "hired" && (k !== "process" || pipeline.process > 0)).map((kind) => ({ kind, n: pipeline[kind] })),
    sources: Object.entries(sources).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    reasons: Object.entries(reasons).map(([reason, n]) => ({ reason, n, by: snap.reasonBy[reason] ?? null })).sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason)),
    trend,
    vacancies,
    unplacedApplied: whole ? snap.unplaced[month]?.applied ?? 0 : 0,
  };
}

/** The tab's read. Starts a refresh when one is due; never waits for it. */
export async function readRecruitment(month: string): Promise<RecruitmentResult> {
  if (!teamtailorConfigured()) return { state: "not-connected" };
  const [snap, status, scope] = await Promise.all([loadSnap(), loadStatus(), recruitmentScope()]);
  const age = snap ? Date.now() - snap.at : Infinity;
  const inFlight = Boolean(running) || Boolean(status && !status.finishedAt && Date.now() - new Date(status.startedAt).getTime() < RUN_LIMIT_MS);
  const lastFailed = status?.finishedAt && status.ok === false ? status.error ?? "Teamtailor could not be read." : null;
  /* After a failure, try again no sooner than five minutes later, so a refused
     key is not asked on every poll of an open tab. */
  const backOff = Boolean(lastFailed && status?.finishedAt && Date.now() - new Date(status.finishedAt).getTime() < 5 * 60_000);
  let started = false;
  if (age > STALE_MS && !inFlight && !backOff) started = await kickRecruitmentSync();

  if (!snap) {
    if (lastFailed && !started && !inFlight) return { state: "error", error: lastFailed, lastGoodAt: null };
    return { state: "loading", startedAt: mem.status?.startedAt ?? null };
  }
  if (age > MAX_AGE_MS) {
    if (inFlight || started) return { state: "loading", startedAt: mem.status?.startedAt ?? null };
    return { state: "error", error: lastFailed ?? "Teamtailor has not been read for over three hours.", lastGoodAt: snap.data.syncedAt };
  }
  return { state: "ready", figures: build(snap.data, month, scope), refreshing: inFlight || started };
}
