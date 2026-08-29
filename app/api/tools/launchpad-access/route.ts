import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getLaunchPadAccess } from "@/lib/launchpad";

/**
 * Can the signed-in person open Launch Pad?
 *
 * GET /api/tools/launchpad-access → { entitled, reason, hasAccount, ... }
 *
 * ── Asked about the SUBJECT, not the actor ────────────────────────────────
 *
 * Everywhere else in the OS, permission is decided on the actor and data on
 * the subject. Entitlement is data about a person, so it follows the subject:
 * an owner viewing as an agent should see the Tools page that agent sees,
 * including whether Launch Pad is open to them. Deciding it on the actor would
 * show James his own access while wearing somebody else's account, which is
 * exactly the question view-as exists to answer and would answer wrongly.
 *
 * ── The gate is here, not in the browser ──────────────────────────────────
 *
 * This route is what the Tools card reads, but it is not the enforcement. When
 * the Launch Pad screen itself is built, that screen must call
 * `getLaunchPadAccess` again server-side before rendering anything. A card that
 * declines to render is a hint; a route that declines to answer is a gate, and
 * a paid product needs the second one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { subject } = await whoIs(req);
  if (!subject) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await getLaunchPadAccess(subject.email, subject.name));
}
