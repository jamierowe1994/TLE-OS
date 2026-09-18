import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { record } from "@/lib/audit";
import { gateListingWrite } from "@/lib/listing-gate";
import { invalidateListingBook } from "@/lib/listings-cache";
import { createListing, findAddresses, listingSubcategories, type NewListing } from "@/lib/rex-listing-create";
import { createProperty, propertySubcategories } from "@/lib/rex-properties";
import { rexConfigured } from "@/lib/rex";
import { isOwner } from "@/lib/agent-words";

/**
 * "+ Add new listing".
 *
 *   GET  ?q=4 williams      → addresses already on file, so a second record
 *                             for the same home is never made by accident
 *   GET  ?lists=1           → the property types to choose from
 *   POST { ... }            → the listing, and the property first when the
 *                             address is new
 *
 * The property half needs "Create properties" armed on Admin → Switches; the
 * listing half needs Listings/create on the write allowlist. Either can be
 * closed without the other, so each is reported in its own words.
 *
 * Switch: "Edit the advert" under Listings, the same one that guards saving.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system is not connected here." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  if (req.nextUrl.searchParams.get("lists")) {
    const [types, propertyTypes] = await Promise.all([
      listingSubcategories().catch(() => []),
      propertySubcategories().catch(() => []),
    ]);
    return NextResponse.json({ ok: true, types, propertyTypes: propertyTypes.map((p) => ({ id: p.id, label: p.text })) });
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ ok: true, addresses: await findAddresses(q) });
  } catch {
    return NextResponse.json({ ok: false, error: "The address lookup did not answer." }, { status: 502 });
  }
}

interface Body {
  propertyId?: unknown;
  address?: { streetNumber?: unknown; streetName?: unknown; town?: unknown; postcode?: unknown; propertyTypeId?: unknown; ownerContactId?: unknown };
  typeId?: unknown;
  rent?: unknown;
  deposit?: unknown;
  availableFrom?: unknown;
  letType?: unknown;
  serviceLevel?: unknown;
  dryRun?: unknown;
}

const money = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n) : null;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system is not connected here." }, { status: 503 });
  const gate = await gateListingWrite(req, "listing-edit");
  if ("refuse" in gate) return gate.refuse;
  const { actor } = gate;

  const b = (await req.json().catch(() => ({}))) as Body;
  const rent = money(b.rent);
  if (rent == null || rent === 0) return NextResponse.json({ ok: false, error: "A rent is needed before a listing can exist." }, { status: 400 });
  const typeId = str(b.typeId);
  if (!typeId) return NextResponse.json({ ok: false, error: "Choose what kind of property it is." }, { status: 400 });
  const availableFrom = /^\d{4}-\d{2}-\d{2}$/.test(str(b.availableFrom)) ? str(b.availableFrom) : null;
  const dryRun = b.dryRun === true && actor.role === "owner";

  /* The address: one already on file, or a new one. A new one is a record in
     the live system, so it goes through lib/rex-properties with its own
     switch and its own refusals. */
  let propertyId = str(b.propertyId);
  let madeProperty = false;
  if (!propertyId && dryRun) {
    return NextResponse.json({ ok: false, error: "A dry run needs an address that already exists - it must not create one." }, { status: 400 });
  }
  if (!propertyId) {
    const a = b.address ?? {};
    const outcome = await createProperty(
      {
        streetNumber: str(a.streetNumber),
        streetName: str(a.streetName),
        town: str(a.town),
        postcode: str(a.postcode),
        subcategoryId: str(a.propertyTypeId) || null,
        ownerContactId: str(a.ownerContactId) || null,
      },
      actor.id
    );
    if (!outcome.ok) return NextResponse.json({ ok: false, step: "address", error: isOwner(actor) ? outcome.ownerDetail ?? outcome.detail : outcome.detail }, { status: 422 });
    propertyId = outcome.propertyId;
    madeProperty = true;
  }

  const listing: NewListing = {
    propertyId,
    subcategoryId: typeId,
    rent,
    deposit: money(b.deposit),
    availableFrom,
    letType: str(b.letType) || "long_term",
    serviceLevel: str(b.serviceLevel) || "managed",
  };
  const made = await createListing(listing, actor.id, dryRun);
  if (!made.ok) {
    return NextResponse.json(
      {
        ok: false,
        step: "listing",
        error: isOwner(actor) ? made.ownerDetail ?? made.detail : made.detail,
        /* The property is real even when the listing is refused: say so, or
           the next attempt makes a second one at the same address. */
        propertyId: madeProperty ? propertyId : undefined,
        payload: actor.role === "owner" ? made.payload : undefined,
      },
      { status: made.reason === "dry_run" ? 200 : 422 }
    );
  }

  await invalidateListingBook();
  /* The signed terms from the appraisal that won this home go onto the new
     listing (they wait in R2 until there is one - lib/signed-documents). */
  const contracts = await attachSignedTerms(propertyId, made.listingId).catch(() => 0);
  await record({
    kind: "listing_edited",
    actorId: actor.id,
    actorEmail: actor.email,
    detail: `created listing ${made.listingId} on property ${propertyId}${madeProperty ? " (new address)" : ""}, £${rent} pcm`,
  });
  return NextResponse.json({ ok: true, listingId: made.listingId, propertyId, madeProperty, contracts });
}

/** Signed terms on any appraisal linked to this property, copied to the listing. */
async function attachSignedTerms(propertyId: string, listingId: string): Promise<number> {
  const { hasDb, q } = await import("@/lib/db");
  if (!hasDb()) return 0;
  const { pushToRex } = await import("@/lib/signed-documents");
  const rows = await q<{ submitter_id: string }>(
    `SELECT d.submitter_id FROM os_signed_documents d
       JOIN os_market_appraisals a ON a.id = d.appraisal_id
      WHERE a.rex_property_id = $1 AND d.completed_at IS NOT NULL AND d.submitter_id > 0 AND d.rex_pushed_at IS NULL`,
    [propertyId]
  );
  let n = 0;
  for (const r of rows) if ((await pushToRex(Number(r.submitter_id), { listingId: Number(listingId) })).pushed) n++;
  return n;
}
