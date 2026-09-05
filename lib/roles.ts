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
 * ── The admin area, and who it belongs to ────────────────────────────────
 *
 * James, 30 Aug, after signing in as Susan: "no one should ever see my admin
 * section. That's not designed for anyone else to see, just me." So
 * `admin:open` became owner-only, and everybody else got their OWN workspace
 * at its own address, named after the work rather than the permission: Susan
 * opens Company figures, Kirstie opens Pre-tenancy, Francesca opens Marketing.
 * See `workspacesFor()` in lib/nav.ts.
 *
 * James, 4 Sep, relaying Susan: she "doesn't have an admin section" and needs
 * one — Overview, People, Permissions, Pre-launch, and the three views.
 *
 * Those two instructions are not in conflict, and the difference is the whole
 * design here. Susan is NOT being given James's admin. She is given a SHORTER
 * one: seven entries out of his sixteen, with the wiring, the switches, the
 * audit log, the pilot reports, the email catalogue, Steve and the guides all
 * still his alone. "No one should ever see my admin section" survives, because
 * what she opens is not it.
 *
 * Making that true needed two capabilities SPLIT, because both were doing
 * double duty and would have leaked James's screens into Susan's rail:
 *
 *   `manage:roles` gated both the Permissions screen and Switches — the page
 *   that arms live sends. Those are not the same authority. Switches now wants
 *   `manage:switches`, which is owner-only and says what it means.
 *
 *   `see:reports` gated Pre-launch alongside Portals, PLC checks, To do, Steve
 *   and Guides. Susan needs the first and none of the rest, so Pre-launch now
 *   wants `see:prelaunch`.
 *
 * And one capability was ADDED rather than split: `see:roles` reads the map of
 * who holds what; `manage:roles` still changes it. Susan can open Permissions
 * and see where the power sits. She cannot hand it out, which keeps rule 1
 * below intact.
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
 *    themselves is not a lesser role, it is the same role with an extra step —
 *    which is exactly why Susan's Permissions tab reads and does not write.
 *    She holds `see:roles`; `manage:roles` stays James's.
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
  owner: "Everything, including who gets which role. The wiring and the switches are theirs alone.",
  super_admin: "Company figures, plus a short admin: people, permissions (read-only) and pre-launch.",
  developer: "The wiring: connections, health, diagnostics. Not the money.",
  support: "The pre-tenancy board only. Superseded by Pre-tenancy — use that instead.",
  pretenancy: "The run-up to a move-in, across every agent's deals. Nothing else.",
  marketing: "Campaigns, paid leads, templates and the file store. No business figures.",
  agent: "Their own book and nothing else.",
};

/** What a screen actually asks about. */
export type Capability =
  | "admin:open"        // an admin area at all. The RAIL decides which entries.
  | "staff:internal"    // an internal person rather than a partner agent
  | "see:people"        // the staff list and their files
  | "see:business"      // Susan's stats — GCI, forecasts, arrears, income
  | "see:marketing"     // Francesca's campaigns, paid leads, templates, files
  | "see:wiring"        // connections, health, environment state
  | "see:reports"       // bugs, the pilot, Steve, the guides, the portals
  | "see:prelaunch"     // the pre-launch readiness report, and only that
  | "see:pretenancy"    // Kirstie's run-up to a move-in
  | "see:everything"    // unscoped data rather than only your own book
  | "see:roles"         // READ who holds what
  | "manage:people"     // invite, reset, view-as, the audit log
  | "manage:roles"      // CHANGE who holds what
  | "manage:switches"   // arm a live send. Owner only, deliberately.
  | "edit:knowledge";   // feed Steve and the Guides shelf - Susan, Francesca, Michael, Kirstie

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    "admin:open", "staff:internal", "see:people", "see:business", "see:marketing",
    "see:wiring", "see:reports", "see:prelaunch", "see:pretenancy", "see:everything",
    "see:roles", "manage:people", "manage:roles", "manage:switches", "edit:knowledge",
  ],
  /* Susan runs the business, so she sees all of it, unscoped — and since
     4 Sep she also has a short admin of her own. Seven entries, and the list
     is worth reading as a whole, because each is here for a reason:

       Overview + People    who works here, and their files
       Permissions          WHERE the power sits. Read-only: `see:roles`
                            without `manage:roles`, so she can audit the map
                            and cannot redraw it.
       Pre-launch           what is and is not ready for 14 October
       the three views      her own figures, Francesca's, Kirstie's

     What she deliberately does NOT hold, each one line away if that changes:
     see:wiring (connections), manage:switches (arming live sends),
     manage:people (the audit log, invites, view-as), see:reports (portals,
     PLC checks, to-do, Steve, guides, the email catalogue).

     `see:pretenancy` is not here for the DATA — she has see:everything
     already. It is here so the rail can offer her Kirstie's board. */
  super_admin: [
    "admin:open", "staff:internal", "see:people", "see:business", "see:marketing",
    "see:prelaunch", "see:pretenancy", "see:everything", "see:roles", "edit:knowledge",
  ],
  /* The mirror image. A contractor brought in to debug REX needs the
     connections page and has no business reading anybody's earnings. */
  developer: ["staff:internal", "see:wiring", "see:reports"],
  support: ["staff:internal", "see:people", "see:reports", "see:pretenancy", "edit:knowledge"],
  /* Kirstie. Her whole job is the run-up to a move-in, and until now there was
     no role that granted it: the only way to give her the pre-tenancy board was
     `support`, which also hands over the staff list and every pilot bug report.
     Somebody needing one screen should not be given three.

     `see:everything` is not a generosity here, it is the job — she works every
     agent's deals, not her own book, and without it her board would be empty. */
  pretenancy: ["staff:internal", "see:pretenancy", "see:everything", "edit:knowledge"],
  /* Francesca. Deliberately NOT `see:business`, which is what her view used to
     demand: /admin/marketing asked for the capability that also opens GCI,
     arrears and every partner's earnings, so there was no way to give her
     marketing without giving her Susan's money. Now there is. */
  marketing: ["staff:internal", "see:marketing", "edit:knowledge"],
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
