/**
 * The checks made on every visit, beside the rooms (James, 3 Oct 2026: "book
 * inspections, confirm it with the tenant, and then record it afterwards").
 *
 * Each is phrased so that "Yes" is the good answer - "No damp or mould", not
 * "Damp or mould" - so a report reads as a list of ticks with the problems
 * standing out, and nobody has to work out which way round a question was
 * asked. "Not checked" is its own answer: a blank would read as a pass.
 *
 * Shared by the screen and the server (no "server-only"), so the labels on the
 * page, the printed report and the landlord's email are the same words.
 */

export type CheckAnswer = "ok" | "issue" | "na";

export interface CheckDef {
  id: string;
  label: string;
  /** Who it applies to, where not every home. */
  hint?: string;
}

export const CHECKS: CheckDef[] = [
  { id: "smoke", label: "Smoke alarms tested and working", hint: "One on every floor." },
  { id: "co", label: "Carbon monoxide alarm tested", hint: "Where there is a gas, oil or solid fuel appliance." },
  { id: "heating", label: "Heating and hot water working" },
  { id: "damp", label: "No damp or mould" },
  { id: "leaks", label: "No leaks or water damage" },
  { id: "safety", label: "No safety hazards seen", hint: "Trailing cables, broken glass, blocked exits." },
  { id: "occupants", label: "Only the people on the tenancy living there" },
  { id: "pets", label: "No pets that are not allowed" },
  { id: "outside", label: "Garden and outside kept tidy" },
];

/** Readings and words, beside the ticks. */
export const READINGS = [
  { id: "meter_gas", label: "Gas meter" },
  { id: "meter_electric", label: "Electric meter" },
  { id: "meter_water", label: "Water meter" },
];

export interface Checks {
  /** check id -> answer and a note. */
  answers: Record<string, { answer: CheckAnswer; note?: string }>;
  /** reading id -> what the meter said. */
  readings: Record<string, string>;
  /** What the tenant raised on the day, in their words. */
  tenantSays: string;
}

export const emptyChecks = (): Checks => ({ answers: {}, readings: {}, tenantSays: "" });

export function asChecks(v: unknown): Checks {
  const c = (v && typeof v === "object" ? v : {}) as Partial<Checks>;
  return {
    answers: c.answers && typeof c.answers === "object" ? c.answers : {},
    readings: c.readings && typeof c.readings === "object" ? c.readings : {},
    tenantSays: typeof c.tenantSays === "string" ? c.tenantSays : "",
  };
}

export const ANSWER_WORD: Record<CheckAnswer, string> = { ok: "Yes", issue: "No", na: "Not checked" };

/** The checks as lines for an email or a timeline: problems first, then the rest. */
export function checkLines(c: Checks): string[] {
  const out: string[] = [];
  const answered = CHECKS.filter((d) => c.answers[d.id]);
  const issues = answered.filter((d) => c.answers[d.id]!.answer === "issue");
  const fine = answered.filter((d) => c.answers[d.id]!.answer === "ok");
  for (const d of issues) out.push(`${d.label}: NO${c.answers[d.id]!.note ? ` - ${c.answers[d.id]!.note}` : ""}`);
  for (const d of fine) out.push(`${d.label}: yes${c.answers[d.id]!.note ? ` - ${c.answers[d.id]!.note}` : ""}`);
  const readings = READINGS.filter((r) => (c.readings[r.id] ?? "").trim());
  for (const r of readings) out.push(`${r.label} reading: ${c.readings[r.id]!.trim()}`);
  if (c.tenantSays.trim()) out.push(`The tenant raised: ${c.tenantSays.trim()}`);
  return out;
}

/** How many checks are answered, out of all of them. */
export const checksDone = (c: Checks) => CHECKS.filter((d) => c.answers[d.id]).length;
