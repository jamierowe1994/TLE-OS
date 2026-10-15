import { NextResponse, type NextRequest } from "next/server";
import { whoIs, type Who } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { contactIdOf, isOsContactLead } from "@/lib/contact-leads";
import { ownedBySql } from "@/lib/contacts-store";
import { heldBy, ownerOf } from "@/lib/lead-owner";

/**
 * May this person open this lead?
 *
 * Every route under /api/leads/[id] only asked "is somebody signed in" until
 * 10 Oct 2026 (Rig P-006). Lead ids run in sequence, so any agent could step
 * through rex-4428273, rex-4428274... and read every enquirer's name, phone,
 * email and home address - members of the public, in somebody else's book.
 *
 * The rule is the board's own, so a lead opens exactly when it would be on
 * your Leads screen (app/api/leads leadScope):
 *   - an owner, or a role that sees the whole business, opens any lead;
 *   - anybody else opens the REX leads assigned to their REX user, the
 *     contacts they typed in by hand, and the tenant-area people who asked
 *     about their homes;
 *   - an owner viewing as an agent sees what that agent sees.
 * A lead the ledger has never held is refused for a scoped person rather than
 * guessed at: the board records every lead before it shows it.
 *
 * Returns the who (so the route need not ask again) or the response to send.
 */
export async function leadAccess(
  req: NextRequest,
  id: string
): Promise<{ who: Who & { actor: NonNullable<Who["actor"]> }; denied: null } | { who: null; denied: NextResponse }> {
  const who = await whoIs(req);
  if (!who.actor) {
    return { who: null, denied: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  }
  const allowed = { who: who as Who & { actor: NonNullable<Who["actor"]> }, denied: null } as const;
  const no = (error: string, status = 403) => ({ who: null, denied: NextResponse.json({ ok: false, error }, { status }) });

  const scope = await scopeForWho(req, who);
  /* The same widening leadScope gives the office: a role that sees the whole
     business sees every lead, unless an owner is viewing as somebody. */
  const everything =
    scope.everything ||
    (!who.viewingAs && who.actor.role !== "owner" && can(who.actor.role, "see:everything"));
  if (everything || !hasDb()) return allowed;
  if (scope.unlinked) {
    return no("We can't tell which REX user you are, so we can't open leads for you. Ask James to link your account.");
  }

  /* Passed on in the OS ("Not my lead", lib/lead-owner): the holder opens
     it and nobody else does - not the agent who passed it on, and not
     anybody while it is back with the office. */
  const me = (who.viewingAs ? who.subject?.email : who.actor.email)?.trim().toLowerCase() ?? "";
  const moved = await ownerOf(id).catch(() => undefined);
  if (moved === undefined) return no("We couldn't check that lead just now. Try again in a minute.", 503);
  if (moved) return heldBy(moved, { rexUserId: scope.rexUserId, email: me }) ? allowed : no("That lead isn't in your book.");

  if (isOsContactLead(id)) {
    /* Theirs when they typed it in, or when it is a tenant-area person who
       asked about one of their homes (lib/contacts-store ownedBySql). */
    if (!me) return no("That lead isn't in your book.");
    const rows = await q<{ id: string }>(
      `SELECT c.id FROM os_contacts c WHERE c.id = $1 AND ${ownedBySql("c", "$2")}`,
      [contactIdOf(id), me]
    ).catch(() => null);
    if (rows === null) return no("We couldn't check that lead just now. Try again in a minute.", 503);
    return rows.length ? allowed : no("That lead isn't in your book.");
  }

  const rows = await q<{ assignee_id: string | null }>(`SELECT assignee_id FROM os_leads WHERE id = $1`, [id]).catch(() => null);
  if (rows === null) return no("We couldn't check that lead just now. Try again in a minute.", 503);
  const lead = rows[0];
  if (!lead) return no("That lead isn't in your book.", 404);
  return lead.assignee_id && String(lead.assignee_id) === String(scope.rexUserId) ? allowed : no("That lead isn't in your book.");
}
