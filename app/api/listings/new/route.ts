import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/audit";
import { gateListingWrite } from "@/lib/listing-gate";
import { invalidateListingBook } from "@/lib/listings-cache";
import { createListing, currentListingOn, type NewListing } from "@/lib/rex-listing-create";
import { createProperty } from "@/lib/rex-properties";
import { rexConfigured } from "@/lib/rex";
import { isOwner } from "@/lib/agent-words";
import { putOwnerOnListing } from "@/lib/rex-listing-owner";
import { getContact } from "@/lib/contacts-store";
import { createAppraisal, recordValuation } from "@/lib/appraisal-store";
import { hasDb, q } from "@/lib/db";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import type { ServiceLevel } from "@/lib/market-appraisal";

/**
 * NEW LISTING, THE WHOLE WAY (James, 12 Oct 2026).
 *
 * "We can create a listing, but we can't attach [a landlord] ... they're
 * jumping some phases here. If they're making a listing, they're still going
 * to need to sign the terms of business as an absolute minimum ... so we
 * would still get the same information."
 *
 * The screens (components/listing/NewListingWizard) save the landlord first,
 * through the same POST /api/contacts every landlord goes through. This makes
 * the rest, in the order that loses least if a step is refused:
 *   1. the home in REX, if it is new, with the landlord as owner;
 *   2. the listing in REX, as a draft, and the landlord put on it
 *      (lib/rex-listing-owner, its own switch);
 *   3. the FILE behind it - an appraisal record on the landlord's lead, with
 *      the rent, service and fees - so the terms of business are drawn up,
 *      signed, sent, chased and filed by exactly the machinery an appraisal
 *      uses, and the signed contract puts the landlord in REX the same way.
 * Nothing is emailed here: the terms go when the agent presses Send.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SIGN_IN = new Set<string>(["no_rex_session", "rex_session_expired"]);
/* The file speaks Propoly's service levels; the listing speaks REX's. */
const LISTING_SERVICE: Record<ServiceLevel, string> = { full_managed: "managed", rent_collect: "rent_collect", tenant_find: "let_only" };

interface Body {
  contactId?: unknown;
  propertyId?: unknown;
  address?: { streetNumber?: unknown; streetName?: unknown; town?: unknown; postcode?: unknown; propertyTypeId?: unknown };
  /** The home as it reads on the file: "4 Williams Court, Cullompton". */
  homeLabel?: unknown;
  postcode?: unknown;
  typeId?: unknown;
  rent?: unknown;
  deposit?: unknown;
  availableFrom?: unknown;
  service?: unknown;
  feePct?: unknown;
  setupFee?: unknown;
  landlordAddress?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const money = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
};

/**
 * Before anything is typed twice: does the OS already have a file for this
 * home (an appraisal, booked or won), or is it already on Listings?
 *   GET ?q=4 williams     → files whose address matches
 *   GET ?property=<id>    → the current listing on that REX property, if any
 */
export async function GET(req: NextRequest) {
  const { whoIs } = await import("@/lib/admin");
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const property = req.nextUrl.searchParams.get("property");
  if (property) {
    if (!/^\d+$/.test(property)) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });
    const listingId = await currentListingOn(property).catch(() => null);
    const files = hasDb()
      ? await q<{ id: string; address: string; landlord: string; stage: string }>(
          `SELECT id, address, landlord, stage FROM os_market_appraisals WHERE rex_property_id = $1 AND stage <> 'lost' ORDER BY updated_at DESC NULLS LAST LIMIT 3`,
          [property]
        ).catch(() => [])
      : [];
    return NextResponse.json({ ok: true, listingId, files });
  }
  const text = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (text.length < 3 || !hasDb()) return NextResponse.json({ ok: true, files: [] });
  const words = text.split(/[\s,]+/).filter((w) => w.length > 1).slice(0, 4);
  const files = await q<{ id: string; address: string; landlord: string; stage: string }>(
    `SELECT id, address, landlord, stage FROM os_market_appraisals
      WHERE stage <> 'lost' AND ${words.map((_, i) => `(address || ' ' || postcode) ILIKE $${i + 1}`).join(" AND ")}
      ORDER BY updated_at DESC NULLS LAST LIMIT 5`,
    words.map((w) => `%${w}%`)
  ).catch(() => []);
  return NextResponse.json({ ok: true, files });
}

export async function POST(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system is not connected here." }, { status: 503 });
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const gate = await gateListingWrite(req, "listing-edit");
  if ("refuse" in gate) return gate.refuse;
  const { actor } = gate;
  const b = (await req.json().catch(() => ({}))) as Body;

  /* Everything checked before anything is written. */
  const contact = str(b.contactId) ? await getContact(str(b.contactId)).catch(() => null) : null;
  if (!contact || contact.kind !== "landlord") return NextResponse.json({ ok: false, step: "landlord", error: "Save the landlord first - every listing has one." }, { status: 400 });
  if (!contact.email?.includes("@")) return NextResponse.json({ ok: false, step: "landlord", error: "The landlord needs an email address - the terms of business go to it." }, { status: 400 });
  const rent = money(b.rent);
  if (!rent) return NextResponse.json({ ok: false, step: "let", error: "A rent is needed before a listing can exist." }, { status: 400 });
  const typeId = str(b.typeId);
  if (!typeId) return NextResponse.json({ ok: false, step: "let", error: "Choose what kind of property it is." }, { status: 400 });
  const service = (["full_managed", "tenant_find", "rent_collect"] as const).find((s) => s === str(b.service));
  if (!service) return NextResponse.json({ ok: false, step: "let", error: "Choose the service." }, { status: 400 });
  const feePct = money(b.feePct);
  if (feePct == null || feePct > 100) return NextResponse.json({ ok: false, step: "let", error: "Put in the fee, as a percentage of the rent." }, { status: 400 });
  const setupFee = money(b.setupFee);
  if (setupFee == null) return NextResponse.json({ ok: false, step: "let", error: "Put in the set-up fee (0 if there isn't one)." }, { status: 400 });
  const homeLabel = str(b.homeLabel);
  if (!homeLabel) return NextResponse.json({ ok: false, step: "home", error: "Which home is it?" }, { status: 400 });
  const availableFrom = /^\d{4}-\d{2}-\d{2}$/.test(str(b.availableFrom)) ? str(b.availableFrom) : null;

  /* 1. The home: one already in REX, or a new one with the landlord as owner. */
  let propertyId = str(b.propertyId);
  let madeProperty = false;
  if (!propertyId) {
    const a = b.address ?? {};
    const outcome = await createProperty(
      {
        streetNumber: str(a.streetNumber),
        streetName: str(a.streetName),
        town: str(a.town),
        postcode: str(a.postcode),
        subcategoryId: str(a.propertyTypeId) || null,
        ownerContactId: contact.rexId ?? null,
      },
      actor.id
    );
    if (!outcome.ok) return NextResponse.json({ ok: false, step: "home", error: isOwner(actor) ? outcome.ownerDetail ?? outcome.detail : outcome.detail, signIn: SIGN_IN.has(outcome.reason) || undefined }, { status: 422 });
    propertyId = outcome.propertyId;
    madeProperty = true;
  } else {
    const existing = await currentListingOn(propertyId);
    if (existing) return NextResponse.json({ ok: false, step: "home", error: "This home is already on Listings, so a second one was not made.", existingListingId: existing }, { status: 409 });
  }

  /* 2. The listing, a draft, and the landlord on it. */
  const listing: NewListing = {
    propertyId,
    subcategoryId: typeId,
    rent: Math.round(rent),
    deposit: money(b.deposit) == null ? null : Math.round(money(b.deposit)!),
    availableFrom,
    letType: "long_term",
    serviceLevel: LISTING_SERVICE[service],
  };
  const made = await createListing(listing, actor.id);
  if (!made.ok) {
    return NextResponse.json(
      { ok: false, step: "listing", error: isOwner(actor) ? made.ownerDetail ?? made.detail : made.detail, signIn: SIGN_IN.has(made.reason) || undefined, propertyId: madeProperty ? propertyId : undefined },
      { status: 422 }
    );
  }
  const owner = await putOwnerOnListing(made.listingId, { contactId: contact.rexId ?? null, propertyId });

  /* 3. The file behind it, so the terms run exactly as an appraisal's do. */
  const leadId = `os-${contact.id}`;
  const postcode = str(b.postcode) || str(b.address?.postcode);
  let appraisalId: string | null = null;
  let fileNote: string | null = null;
  try {
    const ma = await createAppraisal({ leadId, landlord: contact.name, address: homeLabel, postcode, agent: actor.name || null, appointmentAt: null });
    appraisalId = ma.id;
    await recordValuation(ma.id, { valuation: rent, serviceLevel: service, feePct, setupFee, rexPropertyId: propertyId }, actor.email);
    if (hasDb()) {
      await q(
        `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
         VALUES ('direct-listing', $1, $2::jsonb, NOW(), $3)
         ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [ma.id, JSON.stringify({ listingId: made.listingId, propertyId, landlordAddress: str(b.landlordAddress) || null, by: actor.email, at: new Date().toISOString() }), actor.email]
      );
    }
  } catch (e) {
    /* The listing is real; say the file did not save rather than pretend. */
    fileNote = e instanceof Error ? e.message : "The file behind the listing did not save.";
  }

  await invalidateListingBook();
  await record({
    kind: "listing_edited",
    actorId: actor.id,
    actorEmail: actor.email,
    detail: `New listing ${made.listingId} on property ${propertyId}${madeProperty ? " (new address)" : ""} for landlord ${contact.name} (${contact.id}), £${rent} pcm, file ${appraisalId ?? "not saved"}, owner on listing: ${owner.state}`,
  });
  return NextResponse.json({ ok: true, listingId: made.listingId, propertyId, madeProperty, appraisalId, owner, fileNote });
}
