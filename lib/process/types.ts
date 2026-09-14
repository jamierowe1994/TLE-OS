/**
 * A process map: what happens to a person, in order, with the branches off
 * it. James, 12 Sep 2026: "a process map that will show how the flow works
 * ... click into each individual, which will pop out a modal ... open up
 * the links and see what they would see ... see the emails that would go
 * out ... edit the emails ... add steps in ... attach an email ... triggers".
 *
 * Nodes are the steps; edges join them. The spine is the happy path left
 * to right; nurture and side lanes hang beneath it. A node can point at a
 * live screen (href, with {token} for the preview's share token), at an
 * email in the catalogue (emailId), or at nothing yet - a step we mean to
 * build, said plainly with status "planned".
 */

export type ProcessKind = "trigger" | "screen" | "email" | "decision" | "note";
export type ProcessLane = "spine" | "nurture" | "side";

/**
 * HOW FAR ALONG ONE STEP IS - added 14 Sep 2026, James:
 *
 *   "at each stage I need to be able to see what has and hasn't been done for
 *    each thing ... whether it's been built or not, whether it's been checked
 *    and edited by me, whether it's been redesigned, and whether it's then
 *    live and not tested or live and tested."
 *
 * Three states (live / draft / planned) could not answer that. An email that
 * exists but looks wrong, one that looks right but has never been seen by
 * James, and one he has sent notes back on were all "draft" - so the board
 * said "not done" for three completely different pieces of work, and nothing
 * said whose turn it was.
 *
 * It is one ladder rather than a grid on purpose: a step is at exactly one
 * rung, the rungs run in order, and "how close is this to finished" is the
 * distance up it. Two rungs - With James and Notes in - are the only ones
 * where the work is not ours, which is what makes the "waiting on you" count
 * on the board possible.
 *
 * The last rung is the only one that counts as done. Live and untested is not
 * done: it is the state everything reaches the day before a pilot and the
 * state nobody has proved.
 */
export type ProcessStatus =
  | "planned"
  | "written"
  | "built"
  | "designed"
  | "with-james"
  | "notes"
  | "reworked"
  | "live"
  | "tested";

export type ProcessStage = {
  key: ProcessStatus;
  /** On the step itself, where there is room for two words. */
  badge: string;
  /** In the panel and the legend. */
  label: string;
  /** What being at this rung actually means. */
  blurb: string;
  /** True when the next move is James's, not ours. */
  yours?: boolean;
};

export const PROCESS_STAGES: ProcessStage[] = [
  { key: "planned", badge: "Planned", label: "Planned", blurb: "The intent, and nothing behind it. Nobody has written or built anything." },
  { key: "written", badge: "Written", label: "Written", blurb: "The words or the spec exist. Nothing sends it and nothing serves it yet." },
  { key: "built", badge: "Built", label: "Built", blurb: "It exists and it works. It has not had its look, and it is not out in the world." },
  { key: "designed", badge: "Designed", label: "Designed", blurb: "It has had its look. Ready for James to see." },
  { key: "with-james", badge: "With James", label: "With James", blurb: "Sent over. Waiting on his eye - nothing moves until he has looked.", yours: true },
  { key: "notes", badge: "Notes in", label: "James's notes in", blurb: "He has looked and sent changes back. They are not applied yet.", yours: true },
  { key: "reworked", badge: "Reworked", label: "Reworked and pushed", blurb: "His changes are in and pushed. Not switched on for real people yet." },
  { key: "live", badge: "Live", label: "Live, not tested", blurb: "Out in the world. Nobody has driven it end to end, so nobody knows it works." },
  { key: "tested", badge: "Tested", label: "Live and tested", blurb: "Driven end to end on a real record and proved. The only rung that counts as done." },
];

export const STATUS_RANK: Record<ProcessStatus, number> = Object.fromEntries(
  PROCESS_STAGES.map((s, i) => [s.key, i])
) as Record<ProcessStatus, number>;

export const stageOf = (s: ProcessStatus): ProcessStage => PROCESS_STAGES[STATUS_RANK[s] ?? 0];

/**
 * Anything that is not one of the nine, made into one of the nine.
 *
 * Maps the three old names as well as the odd hand-typed value, because a
 * map saved before 14 Sep is sitting in os_process_maps with "draft" on it
 * and must not come back as a blank badge.
 */
export function normaliseStatus(s: unknown): ProcessStatus {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "draft") return "written";
  if (v in STATUS_RANK) return v as ProcessStatus;
  return "planned";
}

export type ProcessNode = {
  id: string;
  kind: ProcessKind;
  title: string;
  blurb?: string;
  lane: ProcessLane;
  x: number;
  y: number;
  status: ProcessStatus;
  /** A live screen. {token} is filled with the preview share token. */
  href?: string;
  /** An id in lib/email/tle-emails.ts. */
  emailId?: string;
  /**
   * The portal stage this step belongs to (a TenantStageKey, for the tenant
   * map). Added 14 Sep 2026 so the two cannot drift: open a step and it says
   * what the tenant's own portal is telling them at that moment, in the
   * words from lib/tenant-journey STAGE_UPDATE. A step with no stage is one
   * the tenant never sees a change for.
   */
  stage?: string;
  /** When it fires: an event name, and optionally a delay after it. */
  trigger?: { on: string; after?: string };
};

export type ProcessEdge = {
  from: string;
  to: string;
  label?: string;
  kind: "main" | "branch" | "return";
};

export type ProcessMap = {
  audience: string;
  title: string;
  blurb: string;
  version: number;
  updatedAt?: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
};
