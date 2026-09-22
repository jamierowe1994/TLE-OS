import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { viewingsForPerson } from "@/lib/person-viewings";

/**
 * GET /api/viewings/person?contact=<rex contact id>&email=<address>
 *   → { ok, upcoming, past } - every viewing this person has, or has been to.
 *
 * The lead drawer's Viewings tab and its At a glance (James, 20 Sep 2026).
 * Read-only, signed in, and answers with nothing rather than everything when
 * neither a contact nor an email is given.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const contactId = req.nextUrl.searchParams.get("contact");
  const email = req.nextUrl.searchParams.get("email");
  const leadId = req.nextUrl.searchParams.get("lead");
  const { upcoming, past } = await viewingsForPerson({ contactId, email, leadId }).catch(() => ({ upcoming: [], past: [] }));
  return NextResponse.json({ ok: true, upcoming, past });
}
