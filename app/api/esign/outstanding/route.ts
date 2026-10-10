import { NextResponse, type NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { rexConfigured } from "@/lib/rex";
import { outstandingTerms } from "@/lib/rex-esign";

/**
 * Every set of terms still waiting on a signature, across TLE's whole book.
 *
 * Scoped to TLE by template — see outstandingTerms for why the sender's email
 * domain is the wrong divider. Measured 14 Aug 2026: 32 outstanding on TLE's
 * three templates against 73 across the shared account, so the scoping is
 * doing real work rather than decorating the query.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
  }
  /* WHOSE TERMS (Rig run 2, P-007, 10 Oct 2026). This answered every signed-in
     person with every unsigned contract in the business - 42 landlords' names,
     personal emails and addresses, and which colleague sent each. Owners and
     the office see the business; anybody else sees the ones they sent. */
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  let mineOnly: string | null = null;
  if (!(can(who.actor.role, "see:everything") && !who.viewingAs)) {
    const scope = await scopeForWho(req, who);
    if (!scope.everything) {
      if (scope.unlinked || !scope.rexUserId) {
        return NextResponse.json({ ok: false, error: "We can't tell which REX user you are, so we can't show your terms. Ask James to link your account." }, { status: 403 });
      }
      mineOnly = scope.rexUserId;
    }
  }
  const all = await outstandingTerms().catch(() => []);
  const rows = mineOnly ? all.filter((r) => r.sentById === mineOnly) : all;
  return NextResponse.json({
    ok: true,
    count: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      address: r.address,
      templateName: r.templateName,
      sentBy: r.sentBy,
      sentAt: r.sentAt,
      age: r.age,
      listingId: r.listingId,
      // Only the landlord — the Agent role is one of ours and is not who
      // anybody is waiting on.
      signers: r.signers.filter((s) => s.role.toLowerCase() !== "agent"),
    })),
  });
}
