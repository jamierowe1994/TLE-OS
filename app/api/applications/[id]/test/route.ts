import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getCase } from "@/lib/plc-store";
import { caseIdFor } from "@/lib/plc";
import { acceptTestOffer, advanceTestDeal, isTestId } from "@/lib/test-overlay";

/**
 * POST /api/applications/{id}/test { action: "accept" | "advance" }
 *
 * The two steps a TEST application takes that a real one takes in REX or
 * Propoly - the agent accepting it, and the deal moving on - played by the
 * tester (lib/test-overlay testJourney). A positive id is refused: this route
 * never touches a real application.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!isTestId(id)) return NextResponse.json({ ok: false, error: "Only a test application can be moved on from here." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "accept") {
      await acceptTestOffer(id, { name: me.name ?? "", email: me.email });
    } else if (body.action === "advance") {
      await advanceTestDeal(id, { email: me.email }, await getCase(caseIdFor(id)).catch(() => null));
    } else {
      return NextResponse.json({ ok: false, error: "Accept or advance." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status: 409 });
  }
}
