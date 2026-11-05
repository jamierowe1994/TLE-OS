import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { listingIsTheirs } from "@/lib/listing-gate";
import { createTerms, inPreview, TermsRefused } from "@/lib/terms/flow";
import { termsForHome } from "@/lib/terms/store";
import { forStaff } from "@/lib/terms/staff";
import { editionFor } from "@/lib/terms/catalogue";
import { homeRegistration } from "@/lib/terms/registration";
import type { Country } from "@/lib/terms/types";
import { lookFor } from "@/lib/new-look-store";

/**
 * Terms of Business sent from the OS (lib/terms).
 *
 *   GET  ?listingId=&propertyId=&appraisalId=  -> this home's terms, newest first,
 *                                                 and its landlord registration on file
 *   POST { country, listingId?, propertyId?, appraisalId?, propertyAddress,
 *          agentLarn?, serviceLevel, setUpFee, managementFee, additionalFees?,
 *          people: [{ name, email, phone? }] }      -> made; the agent signs next
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const home = { listingId: sp.get("listingId"), propertyId: sp.get("propertyId"), appraisalId: sp.get("appraisalId") };
  const [rows, reg] = await Promise.all([
    termsForHome(home).catch(() => []),
    /* The home's landlord registration (Lianna Denholm, 4 Nov 2026), so the send
       screen draws each landlord's number on the contract as it will go. */
    homeRegistration(home).catch(() => null),
  ]);
  const origin = publicOrigin(req);
  return NextResponse.json(
    {
      ok: true,
      preview: inPreview(),
      editions: { scotland: editionFor("scotland")?.edition ?? null, england: editionFor("england")?.edition ?? null },
      /* What goes out with the "Questions before signing" switch on. */
      nextEditions: { scotland: editionFor("scotland", true)?.edition ?? null, england: editionFor("england", true)?.edition ?? null },
      terms: rows.map((t) => forStaff(t, origin)),
      registration: reg ? { numbers: reg.numbers, expiry: reg.expiry, owners: reg.owners } : null,
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const country = (str("country") === "england" ? "england" : "scotland") as Country;
  const listingId = str("listingId") || null;
  if (listingId && /^\d+$/.test(listingId)) {
    const notTheirs = await listingIsTheirs(actor, Number(listingId));
    if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  }
  /* The November terms with the questions first, for whoever has that switch on (James, 5 Nov 2026). */
  const next = b.next === true && Boolean((await lookFor(actor).catch(() => null))?.termsqs);
  const pre = (b.prefill && typeof b.prefill === "object" ? b.prefill : {}) as Record<string, unknown>;
  try {
    const made = await createTerms({
      me: actor,
      country,
      listingId,
      propertyId: str("propertyId") || null,
      appraisalId: str("appraisalId") || null,
      propertyAddress: str("propertyAddress"),
      agentLarn: str("agentLarn") || null,
      serviceLevel: str("serviceLevel"),
      setUpFee: str("setUpFee"),
      managementFee: str("managementFee"),
      additionalFees: str("additionalFees") || null,
      people: Array.isArray(b.people) ? (b.people as Array<{ name: string; email: string; phone?: string; address?: string }>) : [],
      replaces: str("replaces") || null,
      next,
      prefill: next
        ? {
            licensing: typeof pre.licensing === "string" ? pre.licensing : undefined,
            rentalPropertyNumber: typeof pre.rentalPropertyNumber === "string" ? pre.rentalPropertyNumber : undefined,
          }
        : undefined,
    });
    return NextResponse.json({ ok: true, terms: forStaff(made.terms, publicOrigin(req)), agentEmbedSrc: made.agentEmbedSrc });
  } catch (e) {
    const status = e instanceof TermsRefused ? 400 : 502;
    return NextResponse.json({ ok: false, error: publicError(e, "The terms couldn't be made.") }, { status });
  }
}
