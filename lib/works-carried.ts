import "server-only";
import { hasDb, q } from "@/lib/db";
import { londonDayOffset, londonTime } from "@/lib/london-time";
import { lastImport, openTasks, type RexpmTask } from "@/lib/rexpm-tasks";
import type { Kind, Urgency } from "@/lib/works-catalogue";
import type { WorksSummary } from "@/lib/works-orders";

/**
 * REX PM's open maintenance jobs on the OS Maintenance board (1 Oct 2026).
 *
 * The same stopgap as Inspections and Tenancy reviews (lib/rexpm-tasks): REX
 * PM's list is read off its screens, and until a job is taken on here it
 * sits on the board as a "carried" job, counted in the figures so the board
 * agrees with REX PM's dashboard - open, and overdue once its expected
 * completion date has passed.
 *
 * Taking one on raises a works order with the task's id, and the carried
 * row goes. No email goes when that happens: the job was reported weeks
 * ago and the people involved already know about it.
 */

export interface CarriedJob {
  taskId: string;
  kind: Kind;
  category: string;
  urgency: Urgency;
  title: string;
  description: string;
  propertyName: string;
  locality: string;
  address: string;
  propertyId: string | null;
  osPropertyId: string | null;
  tenant: string;
  landlord: string;
  reportedBy: string;
  reportedOn: string | null;
  followUpOn: string | null;
  /** The expected completion date REX PM holds, if any. */
  dueOn: string | null;
  dueAt: string | null;
  overdue: boolean;
  progress: string;
  managedBy: string;
}

/* REX PM's own test jobs at "123 Test Street". In its count, never on ours. */
const isTest = (t: RexpmTask) => /\b123 (test|fake) street\b/i.test(t.address);

/* Certificates and checks are planned work; everything else was reported broken. */
const PLANNED: [RegExp, string][] = [
  [/\b(gsc|gas safe|cp12)/i, "Gas safety (CP12)"],
  [/\beicr\b/i, "EICR"],
  [/\bpat\b/i, "PAT test"],
  [/\bepc\b/i, "EPC"],
  [/legionella/i, "Legionella risk assessment"],
  [/\b(fra|fire risk)\b/i, "Fire risk assessment"],
  [/\b(fac|ffe|elc|smoke|alarm)\b/i, "Smoke & CO alarms"],
  [/boiler service/i, "Boiler service"],
];
const REPAIR: [RegExp, string][] = [
  [/boiler|heating|radiator/i, "Heating & boiler"],
  [/leak|tap|toilet|sink|shower|bath|saniflo|pipe|water|plumb|drain/i, "Plumbing"],
  [/fuse|socket|light|electric|switch/i, "Electrical"],
  [/gas leak/i, "Gas"],
  [/fridge|freezer|washing|microwave|oven|white goods|appliance|extractor/i, "Appliance"],
  [/roof|gutter|loft/i, "Roof & gutters"],
  [/window|door/i, "Windows & doors"],
  [/lock|locksmith|key/i, "Locks & security"],
  [/damp|mou?ld|condensation/i, "Damp & mould"],
  [/paint|decorat|wallpaper|refurb/i, "Decoration"],
  [/carpet|floor/i, "Flooring"],
  [/garden|fenc|lawn|bush/i, "Garden & fences"],
  [/flea|beetle|beatle|pest|mice|rat/i, "Pests"],
  [/clean/i, "Cleaning"],
  [/ceiling|crack|structur/i, "Structural"],
];

function classify(t: RexpmTask): { kind: Kind; category: string } {
  const text = `${t.category} ${t.title}`;
  if (/^(gas safety|eicr)$/i.test(t.category)) return { kind: "planned", category: /eicr/i.test(t.category) ? "EICR" : "Gas safety (CP12)" };
  if (!/gas leak|boiler (not|is|f3|fault|leak)|remedial/i.test(text)) {
    for (const [re, cat] of PLANNED) if (re.test(t.title)) return { kind: "planned", category: cat };
  }
  for (const [re, cat] of REPAIR) if (re.test(`${t.title} ${t.description}`)) return { kind: "repair", category: cat };
  return { kind: "repair", category: "Other" };
}

const endOfDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(londonTime(y, m, d, 23, 59).getTime() + 59_999).toISOString();
};

function toCarried(t: RexpmTask, now: Date): CarriedJob {
  const [title, ...rest] = t.title.split(" | ");
  const { kind, category } = classify(t);
  const dueAt = t.dueOn ? endOfDay(t.dueOn) : null;
  const postcode = t.address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i)?.[0] ?? "";
  const street = t.address.replace(/,?\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i, "").split(",").slice(0, 2).join(",").trim().replace(/[\s,]+$/, "");
  return {
    taskId: t.id,
    kind,
    category,
    urgency: /urgent/i.test(t.priority) ? "urgent" : "routine",
    title: (title || rest.join(" ")).trim(),
    description: t.description,
    propertyName: street || t.address,
    locality: postcode,
    address: t.address,
    propertyId: t.rexPropertyId,
    osPropertyId: t.osPropertyId,
    tenant: t.tenancy,
    landlord: t.ownership,
    reportedBy: t.reportedBy,
    reportedOn: t.reportedOn,
    followUpOn: t.followUpOn,
    dueOn: t.dueOn,
    dueAt,
    overdue: !!dueAt && londonDayOffset(dueAt, now) < 0,
    progress: t.progress,
    managedBy: t.managedBy,
  };
}

/** The open REX PM jobs not yet taken on here. */
export async function carriedJobs(now: Date = new Date()): Promise<{ jobs: CarriedJob[]; readAt: string | null }> {
  if (!hasDb()) return { jobs: [], readAt: null };
  const read = await lastImport("maintenance");
  if (!read) return { jobs: [], readAt: null };
  const [tasks, taken] = await Promise.all([
    openTasks("maintenance"),
    q<{ rexpm_task_id: string }>(`SELECT rexpm_task_id FROM os_works_orders WHERE rexpm_task_id IS NOT NULL AND status <> 'cancelled'`),
  ]);
  const takenIds = new Set(taken.map((r) => r.rexpm_task_id));
  const jobs = tasks.filter((t) => !isTest(t) && !takenIds.has(t.id)).map((t) => toCarried(t, now));
  /* Late ones first, latest first by how late; then the rest by when they were reported, oldest first, undated last. */
  jobs.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || (a.overdue ? (a.dueAt ?? "").localeCompare(b.dueAt ?? "") : 0)
    || (a.reportedOn ?? "9999").localeCompare(b.reportedOn ?? "9999"));
  return { jobs, readAt: read.at };
}

/** The board's figures with the carried jobs counted in, the way REX PM counts them. */
export function withCarried(s: WorksSummary, jobs: CarriedJob[]): WorksSummary {
  const repairs = jobs.filter((j) => j.kind === "repair").length;
  return {
    ...s,
    open: s.open + jobs.length,
    overdue: s.overdue + jobs.filter((j) => j.overdue).length,
    byKind: { repair: s.byKind.repair + repairs, planned: s.byKind.planned + (jobs.length - repairs) },
  };
}

/** Whether a task is still waiting to be taken on - refuses a second take-on. */
export async function alreadyTakenOn(taskId: string): Promise<boolean> {
  const rows = await q<{ id: string }>(`SELECT id FROM os_works_orders WHERE rexpm_task_id = $1 AND status <> 'cancelled' LIMIT 1`, [taskId]);
  return rows.length > 0;
}

/** Stamp a new works order with the task it came from, REX PM's report date and its expected date. */
export async function markTakenOn(orderId: string, job: { taskId: string; reportedOn?: string | null; dueOn?: string | null }): Promise<void> {
  await q(
    `UPDATE os_works_orders SET rexpm_task_id = $2,
       reported_at = COALESCE($3::date::timestamptz, reported_at),
       due_at = COALESCE($4::timestamptz, due_at)
     WHERE id = $1`,
    [orderId, job.taskId, job.reportedOn ?? null, job.dueOn ? endOfDay(job.dueOn) : null]
  );
}
