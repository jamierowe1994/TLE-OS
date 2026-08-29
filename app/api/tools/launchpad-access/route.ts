import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { getLaunchPadAccessForPerson } from "@/lib/launchpad";
import { allAgents } from "@/lib/rex-agents";
import { getTegPerson } from "@/lib/teg-people";

/**
 * Can the signed-in person open Launch Pad?
 *
 * GET /api/tools/launchpad-access → { entitled, reason, hasAccount, ... }
 *
 * ── Asked about the SUBJECT, not the actor ────────────────────────────────
 *
 * Everywhere else in the OS, permission is decided on the actor and data on
 * the subject. Entitlement is data about a person, so it follows the subject:
 * an owner viewing as an agent should see the Tools page that agent sees.
 * Deciding it on the actor would show James his own access while wearing
 * somebody else's account, which is the question view-as exists to answer and
 * would answer wrongly.
 *
 * ── Every address we hold, not just the one they sign in with ─────────────
 *
 * Kayleigh Wright is on Susan's launch list and Pro in the Hub, and this route
 * told her she was not covered — because it asked about her OS sign-in address
 * and nothing else. Her REX AccountUser and her Team Hub record both carry the
 * address that IS on the list.
 *
 * So the REX id does the work, as it does everywhere else in the OS. From
 * `os_users.rex_user_id` we reach the email on their REX record and the Team
 * Hub row filed under the same id — the exact join the People screen uses to
 * show a licence tier, which is why that screen said Pro while this one said
 * no. See lib/launchpad.ts for why this cannot over-admit.
 *
 * Neither lookup may break the answer: both are wrapped, and a failure simply
 * means one fewer address to try rather than an error on a tools page.
 *
 * ── The diagnostic is owner-only ──────────────────────────────────────────
 *
 * `askedAbout` and `triedAddresses` are returned only to somebody who can
 * already see the staff list. They are internal plumbing, and an agent has no
 * use for a list of their own mailboxes on a page about tools.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor || !subject) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const alsoTry: Array<string | null | undefined> = [];
  if (subject.rexUserId) {
    /* Their REX AccountUser address. allAgents() is cached in-process, so this
       is not a REX round trip on every page load. */
    const agent = await allAgents()
      .then((rows) => rows.find((a) => a.id === subject.rexUserId) ?? null)
      .catch(() => null);
    if (agent?.email) alsoTry.push(agent.email);
  }
  /* Their Team Hub record, found by REX id first — the same strong key the
     People screen uses, and the reason it can show Pro for somebody this route
     could not place. */
  const teg = await getTegPerson({
    rexId: subject.rexUserId,
    email: subject.email,
  }).catch(() => null);
  if (teg?.email) alsoTry.push(teg.email);

  const access = await getLaunchPadAccessForPerson({
    email: subject.email,
    name: subject.name,
    rexUserId: subject.rexUserId,
    alsoTry,
  });

  if (can(actor.role, "see:people")) return NextResponse.json(access);
  const { askedAbout: _a, triedAddresses: _t, ...forAgent } = access;
  return NextResponse.json(forAgent);
}
