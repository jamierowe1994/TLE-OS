import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { mayOfferOn, NOT_YOURS } from "@/lib/offer-access";
import { offerContext, OfferRefused, saveAgentOffer } from "@/lib/agent-offer";

/**
 * GET  /api/offers/agent?listing=&email=&name=  -> the home and the tenant's passport
 * POST /api/offers/agent                         -> put the offer forward
 *
 * The office on any listing, an agent on their own (lib/offer-access). The
 * offer is the agent's word on the tenant's behalf, so it
 * carries the agent's name, and the server re-checks the rent cap and the
 * tenant's agreement rather than trusting the page (lib/agent-offer).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  if (!(await mayOfferOn(req, who, sp.get("listing")))) return NextResponse.json({ ok: false, error: NOT_YOURS }, { status: 403 });
  const ctx = await offerContext({ listingId: sp.get("listing") ?? "", email: (sp.get("email") ?? "").trim(), name: (sp.get("name") ?? "").trim() });
  return NextResponse.json({ ok: true, ...ctx });
}

export async function POST(req: NextRequest) {
  const who = await whoIs(req);
  const me = who.actor;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  if (!(await mayOfferOn(req, who, body.listingId))) return NextResponse.json({ ok: false, error: NOT_YOURS }, { status: 403 });
  try {
    const saved = await saveAgentOffer(me, body);
    return NextResponse.json({ ok: true, ...saved });
  } catch (e) {
    if (e instanceof OfferRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    console.error("agent offer failed", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
