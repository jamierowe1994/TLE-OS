import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { currentLets } from "@/lib/current-lets";
import { londonDayOffset, londonParts, londonTime } from "@/lib/london-time";
import type { ManagedProperty } from "@/lib/portfolio-types";
import type { RexpmTask } from "@/lib/rexpm-tasks";

/**
 * Tenancy reviews (1 Oct 2026).
 *
 * The decision taken around a tenancy's anniversary: put the rent up, leave
 * it, renew the agreement, or let it end. Until today nothing in the OS
 * watched for it - the process map said so in capitals - and the team kept
 * the list in REX PM, which REX will not let us read through an API.
 *
 * So the board works the way Inspections does:
 *
 *   source "rex-pm"  REX PM's open review tasks, read off its screens
 *                    (lib/rexpm-tasks), one row per task, so the figures
 *                    match REX PM's dashboard to the number.
 *   source "os"      the OS's own schedule: every `everyMonths` from the last
 *                    review (ours, or REX PM's newest closed one), or from
 *                    the tenancy start when there has never been one.
 *
 * Recording a review here takes its task off the board. Nothing is ever
 * written back to REX PM.
 */

export const OUTCOMES = [
  { id: "increase", label: "Rent goes up", blurb: "A new rent is agreed, from a date." },
  { id: "renewed", label: "Renewed, same rent", blurb: "A new agreement at the rent they pay now." },
  { id: "no_change", label: "Left as it is", blurb: "No change this year. The tenancy carries on." },
  { id: "ending", label: "Tenancy is ending", blurb: "Notice given by either side." },
  { id: "other", label: "Something else", blurb: "Say what in the note." },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["id"];
export const OUTCOME_IDS = OUTCOMES.map((o) => o.id) as readonly Outcome[];
export const outcomeLabel = (id: string) => OUTCOMES.find((o) => o.id === id)?.label ?? "Reviewed";

/* ── the rules ───────────────────────────────────────────────────────────── */

export interface ReviewRules {
  /** "rex-pm" while the team still works REX PM's list; "os" once they work here. */
  source: "rex-pm" | "os";
  /** Months between reviews on the OS's own schedule. */
  everyMonths: number;
  /** Days before it is due that a review appears on the OS's own schedule. */
  leadDays: number;
}

export const DEFAULT_REVIEW_RULES: ReviewRules = { source: "rex-pm", everyMonths: 12, leadDays: 60 };
const RULES_KEY = "tenancy_reviews";

export async function reviewRules(): Promise<ReviewRules> {
  if (!hasDb()) return DEFAULT_REVIEW_RULES;
  const rows = await q<{ value: Partial<ReviewRules> | null }>(`SELECT value FROM os_settings WHERE key = $1`, [RULES_KEY]).catch(() => []);
  return { ...DEFAULT_REVIEW_RULES, ...(rows[0]?.value ?? {}) };
}

export async function saveReviewRules(patch: Partial<ReviewRules>, by: string): Promise<ReviewRules> {
  const next = { ...(await reviewRules()), ...patch };
  await q(
    `INSERT INTO os_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
    [RULES_KEY, JSON.stringify(next), by]
  );
  return next;
}

/* ── a review done in the OS ─────────────────────────────────────────────── */

export interface Review {
  id: string;
  rexpmTaskId: string | null;
  osPropertyId: string | null;
  rexPropertyId: string | null;
  propertyName: string;
  tenant: string;
  landlord: string;
  dueOn: string | null;
  outcome: Outcome;
  rentBefore: string;
  newRent: number | null;
  newRentPeriod: "month" | "week" | null;
  newRentFrom: string | null;
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

function toReview(r: Row): Review {
  return {
    id: s(r.id),
    rexpmTaskId: r.rexpm_task_id ? s(r.rexpm_task_id) : null,
    osPropertyId: r.os_property_id ? s(r.os_property_id) : null,
    rexPropertyId: r.rex_property_id ? s(r.rex_property_id) : null,
    propertyName: s(r.property_name),
    tenant: s(r.tenant),
    landlord: s(r.landlord),
    dueOn: day(r.due_on),
    outcome: s(r.outcome) as Outcome,
    rentBefore: s(r.rent_before),
    newRent: r.new_rent == null ? null : Number(r.new_rent),
    newRentPeriod: r.new_rent_period === "week" ? "week" : r.new_rent_period === "month" ? "month" : null,
    newRentFrom: day(r.new_rent_from),
    note: s(r.note),
    doneBy: s(r.done_by),
    doneAt: r.done_at ? new Date(r.done_at as string).toISOString() : "",
  };
}

/** Every review recorded here, newest first. Throws on a database error - a
 *  failed read must not look like "nothing has been reviewed". */
export async function listReviews(): Promise<Review[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_tenancy_reviews ORDER BY done_at DESC LIMIT 1000`);
  return rows.map(toReview);
}

export interface NewReview {
  rexpmTaskId?: string | null;
  osPropertyId?: string | null;
  rexPropertyId?: string | null;
  propertyName: string;
  tenant?: string;
  landlord?: string;
  dueOn?: string | null;
  outcome: Outcome;
  rentBefore?: string;
  newRent?: number | null;
  newRentPeriod?: "month" | "week" | null;
  newRentFrom?: string | null;
  note?: string;
}

export async function recordReview(input: NewReview, by: string): Promise<Review> {
  if (!hasDb()) throw new Error("No database on this environment.");
  if (!OUTCOME_IDS.includes(input.outcome)) throw new Error("Say what was decided.");
  if (input.outcome === "increase" && !(input.newRent && input.newRent > 0)) throw new Error("Put in the new rent.");
  if (input.outcome === "other" && !input.note?.trim()) throw new Error("Say what was decided in the note.");
  if (input.rexpmTaskId) {
    const held = await q<{ id: string }>(`SELECT id FROM os_tenancy_reviews WHERE rexpm_task_id = $1 LIMIT 1`, [input.rexpmTaskId]);
    if (held.length) throw new Error("This review has already been recorded.");
  }
  const [r] = await q<Row>(
    `INSERT INTO os_tenancy_reviews
       (id, rexpm_task_id, os_property_id, rex_property_id, property_name, tenant, landlord, due_on, outcome,
        rent_before, new_rent, new_rent_period, new_rent_from, note, done_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      uid(), input.rexpmTaskId ?? null, input.osPropertyId ?? null, input.rexPropertyId ?? null, input.propertyName.trim(),
      (input.tenant ?? "").trim(), (input.landlord ?? "").trim(), input.dueOn ?? null, input.outcome, (input.rentBefore ?? "").trim(),
      input.outcome === "increase" ? input.newRent ?? null : null,
      input.outcome === "increase" ? input.newRentPeriod ?? "month" : null,
      input.outcome === "increase" ? input.newRentFrom ?? null : null,
      (input.note ?? "").trim(), by,
    ]
  );
  return toReview(r);
}

/* ── what is due ─────────────────────────────────────────────────────────── */

export interface DueReview {
  key: string;
  taskId?: string;
  propertyId: string | null;
  osPropertyId: string | null;
  listingId: string | null;
  propertyName: string;
  locality: string;
  tenant: string;
  landlord: string;
  /** "Fixed Term | expires 1 Jun 2026", "Periodic". */
  agreement: string;
  /** As REX PM prints it, or the OS's own monthly figure. */
  rent: string;
  /** The due day, YYYY-MM-DD; null when REX PM holds no date. */
  dueOn: string | null;
  /** The end of the due day, London time; null when REX PM holds no date. */
  dueAt: string | null;
  /** Negative when it is already late; null with no date. */
  daysAway: number | null;
  why: string;
  managedBy?: string;
}

/** The last instant of a London calendar day: a review due today is not late until tomorrow. */
const endOfDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(londonTime(y, m, d, 23, 59).getTime() + 59_999).toISOString();
};

/** "Tenancy Review 9 Stanshaws Close, Bradley Stoke + …" → "9 Stanshaws Close, Bradley Stoke". */
function nameOf(t: RexpmTask): string {
  const m = t.title.match(/^tenancy review\s+(.*?)(?:\s\+\s.*)?$/i);
  const short = (m ? m[1] : t.address).replace(/\s*\(\d+\)\s*$/, "").replace(/^let only\s+/i, "");
  return short.trim().replace(/[\s,]+$/, "") || t.address;
}

/* REX PM's own test records: a fake tenant at "123 Test Street". They are in
   its count, but nobody can review a tenancy that does not exist, and an
   agent's board is no place for them. */
export const isTestTask = (t: RexpmTask) => /\b123 (test|fake) street\b/i.test(t.address) || /^test tenant$/i.test(t.title.trim());

/**
 * The board while the source is "rex-pm": REX PM's open review tasks, one row
 * each, less any already recorded here. A task REX PM holds no due date for
 * stays on the board (it is open) but is never counted late.
 */
export function dueFromTasks(tasks: RexpmTask[], done: Review[], book: ManagedProperty[], now: Date = new Date()): DueReview[] {
  const taken = new Set(done.map((r) => r.rexpmTaskId).filter(Boolean) as string[]);
  const byProperty = new Map<string, ManagedProperty>();
  for (const p of currentLets(book)) if (p.propertyId) byProperty.set(p.propertyId, p);
  const out: DueReview[] = [];
  for (const t of tasks) {
    if (taken.has(t.id) || isTestTask(t)) continue;
    const p = t.rexPropertyId ? byProperty.get(t.rexPropertyId) ?? null : null;
    const dueAt = t.dueOn ? endOfDay(t.dueOn) : null;
    const postcode = t.address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i)?.[0] ?? "";
    out.push({
      key: `rexpm:${t.id}`,
      taskId: t.id,
      propertyId: t.rexPropertyId,
      osPropertyId: t.osPropertyId,
      listingId: p?.listingId ?? null,
      propertyName: p?.name ?? nameOf(t),
      locality: p?.locality ?? postcode,
      tenant: t.tenancy || p?.tenants?.[0]?.name || "",
      landlord: t.ownership || p?.landlord?.name || "",
      agreement: t.agreement,
      /* REX PM leaves the rent blank on most reviews; the managed book has it. */
      rent: t.currentRent || (p?.rent ? `£${p.rent.toLocaleString("en-GB")} | ${p.rentPeriod === "week" ? "Weekly" : "Monthly"}` : ""),
      dueOn: t.dueOn,
      dueAt,
      daysAway: dueAt ? londonDayOffset(dueAt, now) : null,
      why: t.progress || "Pending review",
      managedBy: t.managedBy,
    });
  }
  return out.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.propertyName.localeCompare(b.propertyName));
}

const addMonths = (ymd: string, months: number): string => {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, d));
  return t.toISOString().slice(0, 10);
};

/**
 * The board once the source is "os": every home we manage on its current
 * let, due `everyMonths` after its last review - one recorded here, or REX
 * PM's newest closed task before we had any - or after the tenancy started.
 * Measured against the clock at the call, so it rolls over on its own.
 */
export function dueFromCadence(
  book: ManagedProperty[],
  done: Review[],
  priorReviews: Map<string, string>,
  rules: ReviewRules,
  now: Date = new Date()
): DueReview[] {
  const last = new Map(priorReviews);
  for (const r of done) {
    const at = r.doneAt.slice(0, 10);
    for (const k of [r.rexPropertyId, r.osPropertyId]) if (k && (!last.has(k) || at > last.get(k)!)) last.set(k, at);
  }
  const out: DueReview[] = [];
  for (const p of currentLets(book)) {
    const key = p.propertyId ?? p.listingId;
    const from = last.get(key) ?? p.letSince?.slice(0, 10) ?? null;
    if (!from) continue;
    const dueOn = addMonths(from, rules.everyMonths);
    const dueAt = endOfDay(dueOn);
    const daysAway = londonDayOffset(dueAt, now);
    if (daysAway > rules.leadDays) continue;
    out.push({
      key, propertyId: p.propertyId, osPropertyId: null, listingId: p.listingId,
      propertyName: p.name, locality: p.locality,
      tenant: p.tenants?.map((t) => t.name).filter(Boolean).join(" & ") ?? "",
      landlord: p.landlord?.name ?? "",
      agreement: "",
      rent: p.rent ? `£${p.rent.toLocaleString("en-GB")} | ${p.rentPeriod === "week" ? "Weekly" : "Monthly"}` : "",
      dueOn, dueAt, daysAway,
      why: last.has(key) ? `${rules.everyMonths} months since the last review` : `${rules.everyMonths} months since the tenancy started`,
      managedBy: p.agent?.name,
    });
  }
  return out.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
}

/** The figures at the top: open, late, and done in the London month we are in. */
export function summarise(due: DueReview[], done: Review[], now: Date = new Date()) {
  const p = londonParts(now);
  const month = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const inMonth = (iso: string) => {
    const q = londonParts(iso);
    return `${q.year}-${String(q.month).padStart(2, "0")}` === month;
  };
  return {
    due: due.length,
    overdue: due.filter((d) => d.daysAway !== null && d.daysAway < 0).length,
    noDate: due.filter((d) => d.dueAt === null).length,
    doneThisMonth: done.filter((r) => r.doneAt && inMonth(r.doneAt)).length,
    risesThisMonth: done.filter((r) => r.outcome === "increase" && r.doneAt && inMonth(r.doneAt)).length,
  };
}
