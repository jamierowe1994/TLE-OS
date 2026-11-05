import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { listingIsTheirs } from "@/lib/listing-gate";
import { cleanPatch, forForm, readHome, saveHome } from "@/lib/home-answers";
import { bankOnFile } from "@/lib/landlord-bank";
import { pullThrough } from "@/lib/terms/pull-through";

/**
 * The questions about a home, from the agent's side (James, 5 Nov 2026: "when
 * we go to send a contract we need a pre-screen for the agent to confirm what
 * questions still need to be answered").
 *
 *   GET ?listingId=&propertyId=&appraisalId=&email=  -> what the home's answers say so far, who gave
 *                                                     each, and whether the landlord has a bank
 *                                                     account on file (its last four only)
 *   PUT { listingId?, propertyId?, appraisalId?, answers } -> the agent's answers, merged in
 *
 * Never the Gas screen (lib/home-answers cleanPatch drops it: "always has to
 * be the landlord"), and never a code sent back: a code is shown as kept.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ids = (o: Record<string, unknown>) => ({
  listingId: typeof o.listingId === "string" && o.listingId.trim() ? o.listingId.trim() : null,
  propertyId: typeof o.propertyId === "string" && o.propertyId.trim() ? o.propertyId.trim() : null,
  appraisalId: typeof o.appraisalId === "string" && o.appraisalId.trim() ? o.appraisalId.trim() : null,
});

const whoFor = (who: Record<string, { by: string; at: string }>) =>
  Object.fromEntries(Object.entries(who).map(([k, w]) => [k, { by: w.by.startsWith("landlord:") ? "landlord" : "agent", at: w.at }]));

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const home = ids(Object.fromEntries(sp.entries()));
  if (!home.listingId && !home.propertyId && !home.appraisalId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const email = (sp.get("email") ?? "").trim();
  const [got, bank, pulled] = await Promise.all([
    readHome(home),
    email ? bankOnFile(email).catch(() => null) : Promise.resolve(null),
    /* What the OS already knows, for the agent to confirm (James, 5 Nov 2026). */
    pullThrough({ ...home, address: sp.get("address") }).catch(() => null),
  ]);
  return NextResponse.json(
    { ok: true, answers: forForm(got.answers), who: whoFor(got.who), bankOnFile: bank ? { last4: bank.last4, at: bank.updatedAt } : null, pulled },
    { headers: { "cache-control": "private, no-store" } }
  );
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const home = ids(b);
  if (!home.listingId && !home.propertyId && !home.appraisalId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (home.listingId && /^\d+$/.test(home.listingId)) {
    const notTheirs = await listingIsTheirs(actor, Number(home.listingId));
    if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  }
  const saved = await saveHome(home, cleanPatch(b.answers, "agent"), actor.email);
  return NextResponse.json({ ok: true, answers: forForm(saved.answers), who: whoFor(saved.who) });
}
