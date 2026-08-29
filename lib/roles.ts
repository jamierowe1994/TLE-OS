/**
 * Who can see what.
 *
 * ── Roles, and why capabilities sit underneath them ───────────────────────
 *
 * A role is what a person IS; a capability is what they may DO. Screens ask
 * about capabilities, never about roles — `can(role, "see:wiring")` rather
 * than `role === "developer"`.
 *
 * That indirection earns its keep the first time a role changes shape. When
 * support staff need the compliance tab, that is one line in the table below.
 * With `role === "developer"` scattered through twenty components it is twenty
 * edits, nineteen of which get made and one of which does not — and the one
 * that does not is a permission bug nobody notices until it matters.
 *
 * ── The roles, as James described them on 27 Aug ──────────────────────────
 *
 *   owner        James. Everything, including handing out roles.
 *   super_admin  Susan. Runs the business — every figure, every person, no
 *                environment switches. She should not be able to arm a send.
 *   developer    The wiring: connections, health, diagnostics. NOT the money.
 *                A contractor debugging REX has no business reading GCI.
 *   support      Their own view. Sees people and reports; no business figures.
 *   agent        The default. Their own book and nothing else.
 *
 * ── The two rules that stop this becoming a footgun ───────────────────────
 *
 * 1. Only an owner may CHANGE a role. A super_admin who could promote
 *    themselves is not a lesser role, it is the same role with an extra step.
 * 2. An owner cannot be demoted through the UI, and the last owner cannot be
 *    removed at all. A permissions screen whose worst outcome is "nobody can
 *    administer this system any more" is a trap, not a feature.
 */

export const ROLES = [
  "owner",
  "super_admin",
  "developer",
  "support",
  "pretenancy",
  "agent",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  super_admin: "Super admin",
  developer: "Developer",
  support: "Support",
  pretenancy: "Pre-tenancy",
  agent: "Agent",
};

export const ROLE_BLURB: Record<Role, string> = {
  owner: "Everything, including who gets which role.",
  super_admin: "The whole business — every figure, every person. No environment switches.",
  developer: "The wiring: connections, health, diagnostics. Not the money.",
  support: "People and reported problems. No business figures.",
  pretenancy: "The run-up to a move-in, across every agent's deals. Nothing else.",
  agent: "Their own book and nothing else.",
};

/** What a screen actually asks about. */
export type Capability =
  | "admin:open"        // reach the admin area at all
  | "see:people"        // the staff list and their files
  | "see:business"      // Susan's stats — GCI, forecasts, arrears, income
  | "see:wiring"        // connections, health, environment state
  | "see:reports"       // bugs and faults from the pilot
  | "see:pretenancy"    // Kirstie's run-up to a move-in
  | "see:everything"    // unscoped data rather than only your own book
  | "manage:people"     // invite, reset, view-as
  | "manage:roles";     // hand out the roles above

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    "admin:open", "see:people", "see:business", "see:wiring",
    "see:reports", "see:pretenancy", "see:everything", "manage:people", "manage:roles",
  ],
  /* Susan runs the business, so she sees all of it and all of the people — but
     NOT the wiring. Not a slight: those screens are where sending is armed and
     write locks are read, and that is a developer's console, not an MD's. */
  super_admin: [
    "admin:open", "see:people", "see:business", "see:reports",
    "see:pretenancy", "see:everything", "manage:people",
  ],
  /* The mirror image. A contractor brought in to debug REX needs the
     connections page and has no business reading anybody's earnings. */
  developer: ["admin:open", "see:wiring", "see:reports"],
  support: ["admin:open", "see:people", "see:reports", "see:pretenancy"],
  /* Kirstie. Her whole job is the run-up to a move-in, and until now there was
     no role that granted it: the only way to give her the pre-tenancy board was
     `support`, which also hands over the staff list and every pilot bug report.
     Somebody needing one screen should not be given three.

     `see:everything` is not a generosity here, it is the job — she works every
     agent's deals, not her own book, and without it her board would be empty.
     `admin:open` only gets her through the door; the admin rail shows her the
     one entry she can use. */
  pretenancy: ["admin:open", "see:pretenancy", "see:everything"],
  agent: [],
};

export function asRole(value: string | null | undefined): Role {
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "agent";
}

export function can(role: string | null | undefined, capability: Capability): boolean {
  return MATRIX[asRole(role)].includes(capability);
}

/** Every capability a role holds — for showing somebody what they've been given. */
export function capabilitiesOf(role: string | null | undefined): Capability[] {
  return MATRIX[asRole(role)];
}
