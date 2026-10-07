import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { currentLets } from "@/lib/current-lets";
import { londonDayOffset, londonParts, londonTime } from "@/lib/london-time";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { isTestTask, type Review } from "@/lib/tenancy-reviews";
import type { RexpmTask } from "@/lib/rexpm-tasks";

/**
 * Move-outs (2 Oct 2026).
 *
 * Every tenancy that is ending: the day the tenants go, and the jobs that
 * close it off - the check-out, the keys, the meters, the deposit, and the
 * home back on the market. The team kept this list in REX PM, which REX
 * will not let us read through an API, so it works the way Tenancy Reviews
 * does:
 *
 *   - REX PM's open move-outs, read off its screens (lib/rexpm-tasks), one
 *     row per task, so the figures match its dashboard to the number. A
 *     move-out is late once its move-out date has passed - REX PM's Overdue
 *     tab held exactly those (11 of 39 on 2 Oct 2026).
 *   - Plus every tenancy review recorded here as "Tenancy is ending" that
 *     has not been closed off yet, so the OS starts feeding its own list the
 *     day the team stops using REX PM's.
 *
 * Closing a move-out here takes it off the board. Nothing is ever written
 * back to REX PM.
 */

export const OUTCOMES = [
  { id: "moved_out", label: "Moved out", blurb: "The tenants have gone. Say the day." },
  { id: "staying", label: "Staying after all", blurb: "Notice withdrawn. The tenancy carries on." },
  { id: "other", label: "Something else", blurb: "Say what in the note." },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["id"];
export const OUTCOME_IDS = OUTCOMES.map((o) => o.id) as readonly Outcome[];

/** The end-of-tenancy jobs, ticked off as they are done. */
export const STEPS = [
  { id: "checkout", label: "Check-out done" },
  { id: "keys", label: "Keys back" },
  { id: "meters", label: "Meters read" },
  { id: "deposit", label: "Deposit settled" },
  { id: "relet", label: "Back on the market" },
] as const;
export type Step = (typeof STEPS)[number]["id"];
export const STEP_IDS = STEPS.map((x) => x.id) as readonly Step[];

/* ── a move-out closed in the OS ─────────────────────────────────────────── */

export interface MoveOut {
  id: string;
  rexpmTaskId: string | null;
  osPropertyId: string | null;
  rexPropertyId: string | null;
  propertyName: string;
  tenant: string;
  landlord: string;
  plannedOn: string | null;
  outcome: Outcome;
  movedOutOn: string | null;
  steps: Step[];
  note: string;
  doneBy: string;
  doneAt: string;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
/* A DATE comes back from pg as local midnight; take its calendar day, never toISOString(). */
const day = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};

function toMoveOut(r: Row): MoveOut {
  return {
    id: s(r.id),
    rexpmTaskId: r.rexpm_task_id ? s(r.rexpm_task_id) : null,
    osPropertyId: r.os_property_id ? s(r.os_property_id) : null,
    rexPropertyId: r.rex_property_id ? s(r.rex_property_id) : null,
    propertyName: s(r.property_name),
    tenant: s(r.tenant),
    landlord: s(r.landlord),
    plannedOn: day(r.planned_on),
    outcome: s(r.outcome) as Outcome,
    movedOutOn: day(r.moved_out_on),
    steps: (Array.isArray(r.steps) ? r.steps : []).filter((x): x is Step => (STEP_IDS as readonly string[]).includes(String(x))),
    note: s(r.note),
    doneBy: s(r.done_by),
    doneAt: r.done_at ? new Date(r.done_at as string).toISOString() : "",
  };
}

/** Every move-out closed here, newest first. Throws on a database error - a
 *  failed read must not look like "nothing has been closed". */
export async function listMoveOuts(): Promise<MoveOut[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_move_outs ORDER BY done_at DESC LIMIT 1000`);
  return rows.map(toMoveOut);
}

export interface NewMoveOut {
  rexpmTaskId?: string | null;
  reviewId?: string | null;
  osPropertyId?: string | null;
  rexPropertyId?: string | null;
  propertyName: string;
  tenant?: string;
  landlord?: string;
  plannedOn?: string | null;
  outcome: Outcome;
  movedOutOn?: string | null;
  steps?: string[];
  note?: string;
}

export async function recordMoveOut(input: NewMoveOut, by: string): Promise<MoveOut> {
  if (!hasDb()) throw new Error("No database on this environment.");
  if (!OUTCOME_IDS.includes(input.outcome)) throw new Error("Say what happened.");
  if (input.outcome === "moved_out" && !input.movedOutOn) throw new Error("Say the day they moved out.");
  if (input.outcome === "other" && !input.note?.trim()) throw new Error("Say what happened in the note.");
  /* A move-out that came from a review here is keyed by that review, so it
     cannot be closed twice either. */
  const taskId = input.rexpmTaskId ?? (input.reviewId ? `review:${input.reviewId}` : null);
  if (taskId) {
    const held = await q<{ id: string }>(`SELECT id FROM os_move_outs WHERE rexpm_task_id = $1 LIMIT 1`, [taskId]);
    if (held.length) throw new Error("This move-out has already been closed.");
  }
  const steps = (input.steps ?? []).filter((x) => (STEP_IDS as readonly string[]).includes(x));
  const [r] = await q<Row>(
    `INSERT INTO os_move_outs
       (id, rexpm_task_id, os_property_id, rex_property_id, property_name, tenant, landlord, planned_on, outcome,
        moved_out_on, steps, note, done_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13) RETURNING *`,
    [
      uid(), taskId, input.osPropertyId ?? null, input.rexPropertyId ?? null, input.propertyName.trim(),
      (input.tenant ?? "").trim(), (input.landlord ?? "").trim(), input.plannedOn ?? null, input.outcome,
      input.outcome === "moved_out" ? input.movedOutOn ?? null : null,
      JSON.stringify(input.outcome === "moved_out" ? steps : []), (input.note ?? "").trim(), by,
    ]
  );
  return toMoveOut(r);
}

/* ── what is open ────────────────────────────────────────────────────────── */

export interface OpenMoveOut {
  key: string;
  taskId?: string;
  reviewId?: string;
  propertyId: string | null;
  osPropertyId: string | null;
  listingId: string | null;
  propertyName: string;
  locality: string;
  tenant: string;
  landlord: string;
  service: string;
  /** The move-out day, YYYY-MM-DD; null when none is set yet. */
  moveOutOn: string | null;
  /** The end of that day, London time. */
  moveOutAt: string | null;
  /** Negative once the day has passed; null with no date. */
  daysAway: number | null;
  followUpOn: string | null;
  progress: string;
  priority: string;
  managedBy?: string;
  /** Where it came from: the old system's list, or a review recorded here. */
  from: "rex-pm" | "review";
}

/** The last instant of a London calendar day: a move-out today is not late until tomorrow. */
const endOfDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(londonTime(y, m, d, 23, 59).getTime() + 59_999).toISOString();
};

/**
 * A short name for the home. REX PM titles most move-outs "24 Elm Grove
 * Drive + the tenants"; older ones are just the tenants, so fall back to the
 * address, keeping the room or flat with its street.
 */
function nameOf(t: RexpmTask): string {
  const m = t.title.match(/^(.*?)\s\+\s/);
  if (m && /\d/.test(m[1])) return m[1].replace(/[\s,]+$/, "").trim();
  const parts = t.address.split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return t.address;
  return /^(room|flat|apartment|unit|\d+f\d)\b/i.test(parts[0]) && parts[1] ? `${parts[0]}, ${parts[1]}` : parts[0];
}

/**
 * The board: REX PM's open move-outs, less any closed here, plus every review
 * recorded here as "Tenancy is ending" that has not been closed off.
 */
export function openMoveOuts(tasks: RexpmTask[], reviews: Review[], done: MoveOut[], book: ManagedProperty[], now: Date = new Date()): OpenMoveOut[] {
  const taken = new Set(done.map((r) => r.rexpmTaskId).filter(Boolean) as string[]);
  const byProperty = new Map<string, ManagedProperty>();
  for (const p of currentLets(book)) if (p.propertyId) byProperty.set(p.propertyId, p);
  const out: OpenMoveOut[] = [];
  const onList = new Set<string>();

  for (const t of tasks) {
    if (taken.has(t.id) || isTestTask(t)) continue;
    const p = t.rexPropertyId ? byProperty.get(t.rexPropertyId) ?? null : null;
    const at = t.dueOn ? endOfDay(t.dueOn) : null;
    if (t.rexPropertyId) onList.add(t.rexPropertyId);
    out.push({
      key: `rexpm:${t.id}`,
      taskId: t.id,
      propertyId: t.rexPropertyId,
      osPropertyId: t.osPropertyId,
      listingId: p?.listingId ?? null,
      propertyName: p?.name ?? nameOf(t),
      locality: p?.locality ?? t.address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i)?.[0] ?? "",
      tenant: t.tenancy || p?.tenants?.map((x) => x.name).filter(Boolean).join(" & ") || "",
      landlord: t.ownership || p?.landlord?.name || "",
      service: t.service,
      moveOutOn: t.dueOn,
      moveOutAt: at,
      daysAway: at ? londonDayOffset(at, now) : null,
      followUpOn: t.followUpOn,
      progress: t.progress || "Not started",
      priority: t.priority,
      managedBy: t.managedBy,
      from: "rex-pm",
    });
  }

  /* A review recorded as ending, for a home not already on the list. Its
     date is the review's own, the best guess at the day until one is set. */
  for (const r of reviews) {
    if (r.outcome !== "ending" || taken.has(`review:${r.id}`)) continue;
    if (r.rexPropertyId && onList.has(r.rexPropertyId)) continue;
    const p = r.rexPropertyId ? byProperty.get(r.rexPropertyId) ?? null : null;
    /* Notice recorded from the property's own page (7 Oct 2026) carries the
       day they leave as its date, so the board counts down to it. */
    const at = r.dueOn ? endOfDay(r.dueOn) : null;
    out.push({
      key: `review:${r.id}`,
      reviewId: r.id,
      propertyId: r.rexPropertyId,
      osPropertyId: r.osPropertyId,
      listingId: p?.listingId ?? null,
      propertyName: r.propertyName,
      locality: p?.locality ?? "",
      tenant: r.tenant,
      landlord: r.landlord,
      service: "",
      moveOutOn: r.dueOn,
      moveOutAt: at,
      daysAway: at ? londonDayOffset(at, now) : null,
      followUpOn: null,
      progress: r.note.startsWith("Notice given") ? "Notice recorded" : "Notice recorded at review",
      priority: "",
      managedBy: r.doneBy,
      from: "review",
    });
  }

  /* Late first, then the soonest, then the ones with no day set. */
  return out.sort((a, b) => (a.moveOutAt ?? "9999").localeCompare(b.moveOutAt ?? "9999") || a.propertyName.localeCompare(b.propertyName));
}

/** The figures at the top, measured against the clock at the call so they roll over on their own. */
export function summarise(open: OpenMoveOut[], done: MoveOut[], now: Date = new Date()) {
  const p = londonParts(now);
  const month = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const inMonth = (iso: string) => {
    const x = londonParts(iso);
    return `${x.year}-${String(x.month).padStart(2, "0")}` === month;
  };
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return {
    open: open.length,
    overdue: open.filter((m) => m.daysAway !== null && m.daysAway < 0).length,
    next30: open.filter((m) => m.daysAway !== null && m.daysAway >= 0 && m.daysAway <= 30).length,
    noDate: open.filter((m) => m.moveOutOn === null).length,
    followUp: open.filter((m) => m.followUpOn && m.followUpOn <= today).length,
    inProgress: open.filter((m) => /progress/i.test(m.progress)).length,
    doneThisMonth: done.filter((r) => r.doneAt && inMonth(r.doneAt)).length,
  };
}
