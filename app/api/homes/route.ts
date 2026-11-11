import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { bookScope } from "@/lib/scope";
import { rexConfigured } from "@/lib/rex";
import { homesToPick } from "@/lib/homes-to-pick";

/**
 * GET /api/homes → every home this person may act on, for a "which home?"
 * search (lib/homes-to-pick): their listings, their managed homes, and for
 * the office the compliance list with its certificates.
 *
 * Scoped as Portfolio is (lib/scope bookScope): an owner and the office get
 * the business, an agent their own, and somebody whose account is not linked
 * to an agent record is told so rather than shown everybody's or nothing.
 * The compliance list goes only to those /api/compliance/book answers, and
 * never while an owner is viewing as somebody.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (hasDb() && !who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, homes: [], error: "The listings system isn't connected here, so there are no homes to search. Enter the address manually." });
  const scope = await bookScope(req, who);
  if (scope.unlinked) {
    return NextResponse.json({ ok: false, homes: [], unlinked: true, error: "We can't tell which agent you are, so we can't list your homes. Ask James to link your account, or enter the address manually." });
  }
  const actor = who?.actor ?? null;
  const office = Boolean(actor && scope.everything && !who?.viewingAs && (can(actor.role, "manage:switches") || can(actor.role, "see:agent-compliance")));
  const { homes, missing } = await homesToPick(scope.rexUserId, office);
  return NextResponse.json({
    ok: true,
    scope: scope.label,
    homes,
    /* Said on the picker: a list that didn't load is why a home may be missing. */
    ...(missing.length ? { missing, note: `Couldn't read ${missing.join(" or ")} just now, so some homes may be missing. Try again in a minute, or enter the address manually.` } : {}),
  });
}
