import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { assembled } from "@/lib/applications-board";
import { rexConfigured } from "@/lib/rex";
import { decisionsFor } from "@/lib/offer-decisions";
import { dealForApplication, dealsReadable } from "@/lib/application-journey";
import { feeOf } from "@/lib/offer-hold";

/**
 * GET /api/listings/held -> { held: { [listingId]: { tenant, words } } }
 *
 * Homes with an accepted offer whose holding fee is not paid yet (9 Oct
 * 2026). James: "we would technically still do viewings on the property ...
 * until the deposit's paid, you need to show people around". So these stay
 * bookable in the viewing booker even once REX marks them let agreed, and
 * say why. In the caller's own scope; read only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_MS = 60 * 86_400_000;

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (hasDb() && !who?.actor) return NextResponse.json({ ok: false, error: "Sign in first.", held: {} }, { status: 401 });
  if (!rexConfigured()) return NextResponse.json({ ok: true, held: {} });
  try {
    /* No Propoly, no answer: a deal that couldn't be read is not a fee
       unpaid, and saying so would put every let-agreed home back in the
       booker. The booker carries on without the held homes instead. */
    if (!(await dealsReadable())) {
      return NextResponse.json({ ok: false, error: "Propoly couldn't be read, so the held homes aren't known just now.", held: {} }, { status: 503 });
    }
    const scope = await scopeForWho(req, who);
    if (scope.unlinked) return NextResponse.json({ ok: true, held: {} });
    const { held } = await assembled(scope.rexUserId);
    const { applications, closed } = held.value;
    const live = applications.filter((a) => a.listingId != null && !closed.get(a.id) && a.status !== "unsuccessful");
    const decided = await decisionsFor(live.filter((a) => a.status !== "accepted").map((a) => `rex:${a.id}`));
    const accepted = live.filter((a) => {
      if (a.status === "accepted") return !a.dateAccepted || Date.now() - new Date(a.dateAccepted).getTime() < RECENT_MS;
      return decided.get(`rex:${a.id}`)?.decision === "accepted";
    });
    const out: Record<string, { tenant: string; words: string }> = {};
    await Promise.all(
      accepted.map(async (a) => {
        const fee = feeOf(await dealForApplication(a).catch(() => null));
        if (fee.settled) return;
        out[String(a.listingId)] = {
          tenant: a.applicants.map((p) => p.name).filter(Boolean).join(" & ") || "an applicant",
          words: "Application in progress - holding fee not paid",
        };
      })
    );
    return NextResponse.json({ ok: true, held: out });
  } catch (e) {
    console.error("held listings failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't read the held homes.", held: {} }, { status: 500 });
  }
}
