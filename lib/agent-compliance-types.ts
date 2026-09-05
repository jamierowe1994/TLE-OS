/**
 * The agent's own compliance - the shapes the screens and the server share.
 * Client-safe. The server half is lib/agent-compliance.ts.
 */

export type RequirementKind = "document" | "training" | "declaration" | "check";

export const KIND_LABEL: Record<RequirementKind, string> = {
  document: "Document",
  training: "Training",
  declaration: "Declaration",
  check: "Check",
};

export interface Requirement {
  id: string;
  title: string;
  what: string;
  kind: RequirementKind;
  howLink: string;
  /** Null: done once and it stands. Otherwise it runs out this many months on. */
  renewsMonths: number | null;
  required: boolean;
  active: boolean;
  position: number;
  /** "starter" until somebody edits it. */
  updatedBy: string;
}

/** Where one agent stands on one requirement. */
export type ItemState = "missing" | "expired" | "due" | "held" | "verified";

export interface ComplianceItem {
  requirement: Requirement;
  state: ItemState;
  /** ISO date, when the agent says they got it. */
  doneAt: string | null;
  /** ISO date. */
  expiresAt: string | null;
  /** Days until it runs out; negative once it has. Null when it never does or is not held. */
  daysLeft: number | null;
  note: string;
  link: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export const STATE_WORDS: Record<ItemState, string> = {
  missing: "Not on file",
  expired: "Expired",
  due: "Running out",
  held: "Held - not yet checked",
  verified: "Checked",
};

/** Days before expiry at which a reminder goes. */
export const REMIND_BANDS = [30, 14, 7] as const;

export function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function stateOf(
  r: Pick<Requirement, "renewsMonths">,
  row: { doneAt: string | null; expiresAt: string | null; verifiedAt: string | null } | null,
  now = new Date()
): { state: ItemState; daysLeft: number | null } {
  if (!row?.doneAt) return { state: "missing", daysLeft: null };
  const daysLeft = r.renewsMonths ? daysUntil(row.expiresAt, now) : null;
  if (daysLeft != null && daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft != null && daysLeft <= 30) return { state: "due", daysLeft };
  return { state: row.verifiedAt ? "verified" : "held", daysLeft };
}

/** The expiry a done date implies, as an ISO date, or null when it never runs out. */
export function expiryFor(doneAt: string, renewsMonths: number | null): string | null {
  if (!renewsMonths) return null;
  const d = new Date(`${doneAt}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setMonth(d.getMonth() + renewsMonths);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
