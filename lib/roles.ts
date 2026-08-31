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
 *   super_admin  Susan. The whole business — every figure, unscoped.
 *   developer    The wiring: connections, health, diagnostics. NOT the money.
 *                A contractor debugging REX has no business reading GCI.
 *   support      People and reported problems; no business figures.
 *   pretenancy   Kirstie. The run-up to a move-in, across every agent.
 *   marketing    Francesca. Campaigns, paid leads, templates, the file store.
 *   agent        The default. Their own book and nothing else.
 *
 * ── The admin area belongs to ONE person ──────────────────────────────────
 *
 * James, 30 Aug, after signing in as Susan: "no one should ever see my admin
 * section. That's not designed for anyone else to see, just me."
 *
 * So `admin:open` is owner-only, full stop. It used to be held by five of the
 * six roles, which meant Susan's rail offered her Overview, People, Pre-launch,
 * Activity, PLC checks, To do, Emails and Steve — eight screens of plumbing for
 * somebody who wanted her figures — and Kirstie's offered a door marked Admin
 * that existed to bounce her somewhere else.
 *
 * What replaces it is not a smaller admin. Everybody who needs a screen beyond
 * an agent's day now has their OWN, at its own address, named after the work
 * rather than after the permission: Susan opens Company figures, Kirstie opens
 * Pre-tenancy, Francesca opens Marketing. See `workspacesFor()` in lib/nav.ts.
 *
 * `staff:internal` is the gate that `admin:open` was doing a second job as —
 * "an internal person rather than a partner agent". Two API routes were using
 * admin:open to mean that, and would have silently narrowed to James alone.
 *
 * ── What developer and support are left with ──────────────────────────────
 *
 * `developer` opens NOTHING. Its one screen is Wiring, which is inside the
 * owner's admin area. Lift it out — the same way Susan's, Kirstie's and
 * Francesca's were — BEFORE handing the role to a contractor, or they will
 * sign in to an OS that grants them nothing. The Permissions screen says so.
 *
 * `support` still reaches the pre-tenancy board through `see:pretenancy`, so
 * anybody carrying that role today keeps working. But its other two
 * capabilities (People, Pre-launch) now open nothing, which leaves it a
 * strictly worse `pretenancy`. Use `pretenancy` for new people.
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
  "marketing",
  "agent",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  super_admin: "Super admin",
  developer: "Developer",
  support: "Support",
  pretenancy: "Pre-tenancy",
  marketing: "Marketing",
  agent: "Agent",
};

export const ROLE_BLURB: Record<Role, string> = {
  owner: "Everything, including who gets which role. The admin area is theirs alone.",
  super_admin: "Company figures — the whole business, unscoped. Not the admin area.",
  developer: "The wiring: connections, health, diagnostics. Not the money.",
  support: "The pre-tenancy board only. Superseded by Pre-tenancy — use that instead.",
  pretenancy: "The run-up to a move-in, across every agent's deals. Nothing else.",
  marketing: "Campaigns, paid leads, templates and the file store. No business figures.",
  agent: "Their own book and nothing else.",
};

/** What a screen actually asks about. */
export type Capability =
  | "admin:open"        // the OWNER'S admin area. James, and nobody else, ever.
  | "staff:internal"    // an internal person rather than a partner agent
  | "see:people"        // the staff list and their files
  | "see:business"      // Susan's stats — GCI, forecasts, arrears, income
  | "see:marketing"     // Francesca's campaigns, paid leads, templates, files
  | "see:wiring"        // connections, health, environment state
  | "see:reports"       // bugs and faults from the pilot
  | "see:pretenancy"    // Kirstie's run-up to a move-in
  | "see:everything"    // unscoped data rather than only your own book
  | "manage:people"     // invite, reset, view-as
  | "manage:roles";     // hand out the roles above

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    "admin:open", "staff:internal", "see:people", "see:business", "see:marketing",
    "see:wiring", "see:reports", "see:pretenancy", "see:everything",
    "manage:people", "manage:roles",
  ],
  /* Susan runs the business, so she sees all of it, unscoped — and that is the
     WHOLE of what she sees. She had `admin:open`, `see:people`, `see:reports`
     and `manage:people` too, which between them handed her the staff census,
     the pilot bug list, view-as and eight screens of plumbing. Every figure she
     actually asks for is a tab inside Company figures, Agents among them.

     Not `see:pretenancy` either. She could look into Kirstie's board and never
     had cause to; the move-in numbers she wants are on her own Move-ins tab. */
  super_admin: ["staff:internal", "see:business", "see:everything"],
  /* The mirror image. A contractor brought in to debug REX needs the
     connections page and has no business reading anybody's earnings. */
  developer: ["staff:internal", "see:wiring", "see:reports"],
  support: ["staff:internal", "see:people", "see:reports", "see:pretenancy"],
  /* Kirstie. Her whole job is the run-up to a move-in, and until now there was
     no role that granted it: the only way to give her the pre-tenancy board was
     `support`, which also hands over the staff list and every pilot bug report.
     Somebody needing one screen should not be given three.

     `see:everything` is not a generosity here, it is the job — she works every
     agent's deals, not her own book, and without it her board would be empty. */
  pretenancy: ["staff:internal", "see:pretenancy", "see:everything"],
  /* Francesca. Deliberately NOT `see:business`, which is what her view used to
     demand: /admin/marketing asked for the capability that also opens GCI,
     arrears and every partner's earnings, so there was no way to give her
     marketing without giving her Susan's money. Now there is. */
  marketing: ["staff:internal", "see:marketing"],
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
