import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { whoIs } from "@/lib/admin";
import { readListingDetails } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { appraisalDossierForHome } from "@/lib/appraisal-for-home";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/**
 * WHAT THE APPRAISAL LEARNED, ON ITS LISTING (James, 10 Nov 2026).
 *
 *   GET ?id=<listing>              -> { appraisal: {...} | null }
 *   GET ?id=<listing>&paper=<key>  -> 302 to a five-minute signed link
 *
 * The valuation, the fee, the service, the landlord's notes, the lead's notes,
 * the property facts and every paper on the appraisal and its lead, read where
 * they already live (lib/appraisal-for-home). Papers open through here rather
 * than /api/r2/file, which refuses a lead's and a portal's keys to anybody
 * the lead is not theirs - and the listing's agent may not be the appraiser.
 *
 * The same rule as the property record's papers on the listing
 * (/api/listings/record-files): an agent sees only a listing that is theirs,
 * and the landlord's ID, proof of ownership and AML stay with the office.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STAFF = new Set(["owner", "super_admin", "developer", "support", "pretenancy", "compliance", "marketing"]);
const OFFICE_ONLY = new Set(["landlord_id", "landlord_proof_of_ownership", "landlord_aml"]);

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  /* A test listing (negative id) has no appraisal of its own here. */
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: true, appraisal: null });
  const notTheirs = await listingIsTheirs(actor, id, { cached: true });
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });

  try {
    const details = await readListingDetails(id, { cached: true });
    const dossier = await appraisalDossierForHome({ propertyId: details.propertyId, address: details.address });
    if (!dossier) return NextResponse.json({ ok: true, appraisal: null }, { headers: { "cache-control": "private, no-store" } });
    const staff = STAFF.has(actor.role);

    const wanted = req.nextUrl.searchParams.get("paper");
    if (wanted) {
      const paper = dossier.papers.find((p) => p.key === wanted);
      if (!paper) return NextResponse.json({ ok: false, error: "That paper is not on this home's appraisal." }, { status: 404 });
      if (!staff && OFFICE_ONLY.has(paper.type)) return NextResponse.json({ ok: false, error: "That paper is held by the office." }, { status: 403 });
      if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured." }, { status: 503 });
      const url = await withR2((c) => getSignedUrl(c, new GetObjectCommand({ Bucket: R2_BUCKET, Key: paper.r2Key }), { expiresIn: 300 }));
      return NextResponse.redirect(url, 302);
    }

    const { papers, ...rest } = dossier;
    return NextResponse.json(
      {
        ok: true,
        appraisal: {
          ...rest,
          papers: papers.map(({ r2Key: _key, ...p }) => ({
            ...p,
            /* Held, but not for an agent to open: the row still says it is on file. */
            url: staff || !OFFICE_ONLY.has(p.type) ? `/api/listings/appraisal?id=${id}&paper=${encodeURIComponent(p.key)}` : null,
          })),
        },
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "The appraisal behind this listing did not load. Try again in a minute." }, { status: 502 });
  }
}
