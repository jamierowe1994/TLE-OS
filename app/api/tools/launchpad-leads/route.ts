import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { fetchLaunchPadLeads, getLaunchPadAccessForPerson } from "@/lib/launchpad";
import { allAgents } from "@/lib/rex-agents";
import { getTegPerson } from "@/lib/teg-people";

/**
 * The signed-in person's Launch Pad funnel, mirrored.
 *
 * GET /api/tools/launchpad-leads → { entitled, funnel }
 *
 * ── This is the gate, not the card ────────────────────────────────────────
 *
 * Launch Pad is paid. The Tools card declining to render is a hint that any
 * browser can ignore; this route declining to answer is the gate, and it is
 * why entitlement is re-checked here rather than trusted from the page that
 * linked in. A paid product has to fail shut on the request.
 *
 * Entitlement is resolved exactly as the card does — every address the OS
 * holds for that person, keyed off their REX id — so the two can never give
 * different answers about the same human.
 *
 * ── Which address the funnel is fetched FOR ───────────────────────────────
 *
 * The one entitlement matched on, not the sign-in address. Launch Pad files a
 * funnel against the mailbox its account uses, and for the dual-brand partners
 * that is a TPE or Prestige address rather than the one they use here. Asking
 * with the wrong one returns `found: false` and an empty screen for somebody
 * who has leads — which is the bug the card had, one layer along.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { subject } = await whoIs(req);
  if (!subject) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const alsoTry: Array<string | null | undefined> = [];
  if (subject.rexUserId) {
    const agent = await allAgents()
      .then((rows) => rows.find((a) => a.id === subject.rexUserId) ?? null)
      .catch(() => null);
    if (agent?.email) alsoTry.push(agent.email);
  }
  const teg = await getTegPerson({ rexId: subject.rexUserId, email: subject.email }).catch(
    () => null
  );
  if (teg?.email) alsoTry.push(teg.email);

  const access = await getLaunchPadAccessForPerson({
    email: subject.email,
    name: subject.name,
    rexUserId: subject.rexUserId,
    alsoTry,
  });

  if (!access.entitled) {
    /* 403 with the reason, so the screen can say the same true sentence the
       card does rather than a generic refusal. */
    return NextResponse.json(
      { entitled: false, reason: access.reason, funnel: null },
      { status: 403 }
    );
  }

  const funnel = await fetchLaunchPadLeads(access.askedAbout ?? subject.email);
  return NextResponse.json({ entitled: true, reason: access.reason, funnel });
}
