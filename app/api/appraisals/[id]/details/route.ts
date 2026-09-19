import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getAppraisal } from "@/lib/appraisal-store";
import { readAnswers } from "@/lib/property-answers-store";
import { presentationsFor } from "@/lib/present-store";
import { epcForAddress } from "@/lib/epc";
import { landlordAccountByEmail, landlordDocuments, requiredDocKindsFor } from "@/lib/landlord-account";
import { DETAIL_FIELDS, saveTakeOnDetails, takeOnDetails } from "@/lib/takeon";

/**
 * What the file holds about the property after the visit, and what it still
 * wants (James, 17 Sep 2026: "fill in any gaps ... provide all the
 * information that we've got and then just ask it to fill in the ones that
 * it's missing"). The compliance side is said here too, so the last screen of
 * the take-on can hand straight on to it.
 *
 *   GET  → known, missing, and where their compliance has got to
 *   POST → save the filled-in fields and the advert
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const say = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const answers: Record<string, unknown> = await readAnswers(id).catch(() => ({}));
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const decks = (await Promise.all(refs.map((r) => presentationsFor(r).catch(() => [])))).flat();
  const property = decks.find((d) => d.deck.property?.beds != null)?.deck.property ?? decks[0]?.deck.property ?? null;
  const [registerEpc, saved] = await Promise.all([epcForAddress(ma.address, ma.postcode ?? "").catch(() => null), takeOnDetails(id)]);

  /* What we hold, whoever told us: the landlord's answers, the dossier on the
     deck, the register, and anything the agent has already filled in. */
  const known: Record<string, string> = {
    propertyType: property?.propertyType ?? "",
    beds: property?.beds != null ? String(property.beds) : "",
    baths: property?.baths != null ? String(property.baths) : "",
    receptions: "",
    furnishing: say(answers.furnishing),
    heating: say(answers.heating).replace(/-/g, " "),
    parking: say(answers.parking),
    garden: say(answers.garden),
    councilTax: say(answers["council-tax-band"]),
    epc: property?.epc ?? registerEpc?.band ?? "",
    availableFrom: say(answers["available-from"]) || (say(answers.occupancy) === "empty" ? "Now" : ""),
    floorArea: property?.sqft != null ? `${property.sqft} sq ft` : "",
    ...(saved?.fields ?? {}),
  };

  /* Their compliance, so the last screen can hand on to it. */
  const email = (ma.landlordEmail ?? "").trim().toLowerCase();
  const account = email ? await landlordAccountByEmail(email).catch(() => null) : null;
  const docs = account ? await landlordDocuments(account.id).catch(() => []) : [];
  const missingDocs = (await requiredDocKindsFor(ma.id)).filter((k) => !docs.some((d) => d.kind === k.id) && !(k.id === "epc" && (property?.epc || registerEpc))).map((k) => k.label);

  return NextResponse.json({
    ok: true,
    fields: DETAIL_FIELDS,
    known,
    advert: saved?.advert ?? null,
    compliance: { has: docs.length, missing: missingDocs, landlord: ma.landlord, email: email || null },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { fields?: Record<string, string>; advert?: { heading: string; body: string } | null };
  const fields: Record<string, string> = {};
  for (const f of DETAIL_FIELDS) {
    const v = say(body.fields?.[f.id]);
    if (v) fields[f.id] = v.slice(0, 200);
  }
  const before = await takeOnDetails(id);
  await saveTakeOnDetails(
    id,
    {
      fields,
      advert: body.advert ? { heading: body.advert.heading.slice(0, 200), body: body.advert.body.slice(0, 6000), at: new Date().toISOString() } : (before?.advert ?? null),
      at: new Date().toISOString(),
    },
    actor.name || actor.email
  );
  return NextResponse.json({ ok: true });
}
