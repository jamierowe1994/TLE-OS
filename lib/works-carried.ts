import "server-only";
import { hasDb, q } from "@/lib/db";
import { londonDayOffset, londonTime } from "@/lib/london-time";
import { lastImport, openTasks, type RexpmTask } from "@/lib/rexpm-tasks";
import type { Kind, Urgency } from "@/lib/works-catalogue";
import type { WorksSummary } from "@/lib/works-orders";
import { heldComplianceBook } from "@/lib/compliance-cache";
import type { CertKey } from "@/lib/compliance";

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

/* ── DONE ON THE CERTIFICATES (James, 5 Oct 2026) ──────────────────────────
 *
 * "We've got 'planned' still in the old system... a 158-day work order issued
 * with Aliana. It needed a fire risk assessment done, but it's still showing
 * as not done... if we have up-to-date fire safety on there, then we can
 * remove the job." The certificate came in and nobody closed the task in REX
 * PM. So a planned job whose certificate is now on file - in date, and done
 * after the job was raised - is finished, whatever REX PM still says.
 *
 * We never write to REX PM, so nothing is closed there. The job leaves the
 * board and its figures, and is listed apart with the certificate that
 * finished it, so anybody can see why it went. Worked out on every read and
 * never stored: a certificate that is removed puts the job straight back. */

export interface CarriedDone extends CarriedJob {
  /** The certificate that finished it, in words. */
  evidence: string;
}

/** Which certificate finishes which planned job, and how long one usually lasts. */
const CERT_FOR: Record<string, { key: CertKey; types: string[]; months: number; label: string }> = {
  "Gas safety (CP12)": { key: "gas", types: ["gas_safety"], months: 12, label: "Gas safety certificate" },
  EICR: { key: "eicr", types: ["eicr"], months: 60, label: "EICR" },
  EPC: { key: "epc", types: ["epc"], months: 120, label: "EPC" },
  "PAT test": { key: "pat", types: ["portable_appliance_testing"], months: 12, label: "PAT test" },
  "Legionella risk assessment": { key: "legionella", types: ["legionella_risk_assessment"], months: 24, label: "Legionella risk assessment" },
  "Fire risk assessment": { key: "fire", types: ["emergency_lighting_fire_exit"], months: 12, label: "Fire safety certificate" },
  "Smoke & CO alarms": { key: "alarms", types: ["smoke_alarms", "co_alarms"], months: 12, label: "Smoke and CO alarm check" },
};

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (ymd: string, months: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return ymdOf(d);
};
const addDays = (ymd: string, days: number) => ymdOf(new Date(new Date(`${ymd}T12:00:00Z`).getTime() + days * 86_400_000));
const words = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The jobs a certificate on file has finished, out of the carried list.
 *
 * A certificate counts when it is in date today AND it was done after the job
 * was raised (a month's grace, for an engineer booked before the task was
 * typed in). Its date of issue is the certificate's own where the OS holds
 * one; from the compliance book, which keeps only the expiry, it is the expiry
 * less the certificate's usual life. A job with no date at all to measure
 * against is left alone - "a certificate exists" is not the same as "this
 * job was done".
 */
async function doneOnCertificates(jobs: CarriedJob[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const planned = jobs
    .filter((j) => j.kind === "planned")
    .map((j) => ({ j, parts: certificateParts(j) }))
    .filter((x): x is { j: CarriedJob; parts: string[] } => x.parts !== null && x.parts.length > 0);
  if (!planned.length) return out;
  const today = ymdOf(now);
  const ids = [...new Set(planned.flatMap(({ j }) => [j.propertyId, j.osPropertyId]).filter((v): v is string => Boolean(v)))];
  const [rows, held] = await Promise.all([
    ids.length
      ? q<{ property_id: string; type_id: string; expiry: string; issue: string | null; added_at: Date }>(
          `SELECT property_id, type_id, expiry::text AS expiry, issue::text AS issue, added_at FROM os_certificates WHERE property_id = ANY($1)`,
          [ids]
        ).catch(() => [])
      : Promise.resolve([]),
    heldComplianceBook().catch(() => null),
  ]);
  const homes = new Map((held?.book.properties ?? []).map((p) => [String(p.id), p]));

  /* One certificate's say on one part of a job: the sentence, or null. */
  const finishes = (j: CarriedJob, part: string, from: string): string | null => {
    const rule = CERT_FOR[part];
    /* The OS's own certificates first: they carry their issue date. */
    const own = rows
      .filter((r) => (r.property_id === j.propertyId || r.property_id === j.osPropertyId) && rule.types.includes(r.type_id))
      .map((r) => ({ expiry: r.expiry.slice(0, 10), issued: (r.issue ?? ymdOf(new Date(r.added_at))).slice(0, 10) }))
      .filter((c) => c.expiry >= today && c.issued >= from)
      .sort((a, b) => b.expiry.localeCompare(a.expiry))[0];
    if (own) return `${rule.label} on file, done ${words(own.issued)}, in date to ${words(own.expiry)}.`;
    /* Then the compliance book, which holds the expiry alone. */
    const home = j.propertyId ? homes.get(j.propertyId) : undefined;
    const cert = home?.certs?.[rule.key];
    if (cert?.expires != null && cert.expires >= 0 && !cert.notRequired) {
      const expiry = addDays(today, cert.expires);
      /* A Scottish PAT that is not an HMO's lasts five years (lib/rex-compliance),
         so its test was five years before the expiry, not one. */
      const life = rule.key === "pat" && home && !home.hmo && SCOTTISH.test(home.locality ?? "") ? 60 : rule.months;
      if (addMonths(expiry, -life) >= from) return `${rule.label} on file, in date to ${words(expiry)} - renewed after this job was raised.`;
    }
    return null;
  };

  for (const { j, parts } of planned) {
    const since = j.reportedOn ?? (j.dueOn ? addDays(j.dueOn, -60) : null);
    /* No date on the job at all: nothing to say the certificate came after it. Left alone. */
    if (!since) continue;
    const from = addDays(since, -30);
    const said = parts.map((part) => finishes(j, part, from));
    /* Every part of the job, or none of it: "EICR & PAT" is not done on an EICR. */
    if (said.every(Boolean)) out.set(j.taskId, said.join(" "));
  }
  return out;
}

/**
 * The certificates a job asks for, read off its title - or null when it asks
 * for something else as well. "EICR / PAT" is two; "Gas safety & boiler
 * service" and "Replace shower, EICR & PAT" also need work no certificate
 * proves, so a certificate never closes them. Nothing named at all falls back
 * to the job's own category.
 */
function certificateParts(j: CarriedJob): string[] | null {
  const text = `${j.title}`;
  if (OTHER_WORK.test(text)) return null;
  const parts = PARTS.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (parts.length) return [...new Set(parts)];
  return CERT_FOR[j.category] ? [j.category] : null;
}

const PARTS: [RegExp, string][] = [
  [/(gsc|gas safe|gas safety|cp12)|gas(?!\s*leak)/i, "Gas safety (CP12)"],
  [/eicr/i, "EICR"],
  [/pat/i, "PAT test"],
  [/epc/i, "EPC"],
  [/legionella/i, "Legionella risk assessment"],
  [/(fra|fire risk|fire safety)/i, "Fire risk assessment"],
  [/(fac|ffe|elc|smoke|alarms?)/i, "Smoke & CO alarms"],
];
/** A Scottish postcode in the address, or one of the two cities by name - the same areas as lib/rex-compliance. */
const SCOTTISH = /\b(AB|DD|DG|EH|FK|G|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b|\b(edinburgh|glasgow)\b/i;
/** Work a certificate does not prove was done. */
const OTHER_WORK = /(replace|repair|install|fix|fit|service|servicing|shower|fridge|freezer|socket|battery|leak|remedial|quote|boiler (?!cert))/i;

/** The open REX PM jobs not yet taken on here, and the ones a certificate has since finished. */
export async function carriedJobs(now: Date = new Date()): Promise<{ jobs: CarriedJob[]; done: CarriedDone[]; readAt: string | null }> {
  if (!hasDb()) return { jobs: [], done: [], readAt: null };
  const read = await lastImport("maintenance");
  if (!read) return { jobs: [], done: [], readAt: null };
  const [tasks, taken] = await Promise.all([
    openTasks("maintenance"),
    q<{ rexpm_task_id: string }>(`SELECT rexpm_task_id FROM os_works_orders WHERE rexpm_task_id IS NOT NULL AND status <> 'cancelled'`),
  ]);
  const takenIds = new Set(taken.map((r) => r.rexpm_task_id));
  const all = tasks.filter((t) => !isTest(t) && !takenIds.has(t.id)).map((t) => toCarried(t, now));
  const finished = await doneOnCertificates(all, now).catch(() => new Map<string, string>());
  const jobs = all.filter((j) => !finished.has(j.taskId));
  const done: CarriedDone[] = all.filter((j) => finished.has(j.taskId)).map((j) => ({ ...j, evidence: finished.get(j.taskId)! }));
  /* Late ones first, latest first by how late; then the rest by when they were reported, oldest first, undated last. */
  jobs.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || (a.overdue ? (a.dueAt ?? "").localeCompare(b.dueAt ?? "") : 0)
    || (a.reportedOn ?? "9999").localeCompare(b.reportedOn ?? "9999"));
  return { jobs, done, readAt: read.at };
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
