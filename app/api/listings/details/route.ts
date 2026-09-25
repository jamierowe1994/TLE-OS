import { noDashes } from "@/lib/no-dashes";
import { NextRequest, NextResponse } from "next/server";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";
import { record } from "@/lib/audit";
import { MAX_HIGHLIGHTS, planListingWrite, readListingDetails, type ListingEdit } from "@/lib/listing-details";
import { gateListingWrite, listingIsTheirs } from "@/lib/listing-gate";
import { invalidateListingBook } from "@/lib/listings-cache";
import { saveMarketingFacts, type MarketingFacts } from "@/lib/listing-marketing-store";
import { OPTIONS } from "@/lib/listing-requirements";
import { isExpiredToken, rexCall, rexConfigured, rexWritesLocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { isOwner } from "@/lib/agent-words";

/**
 * The advert, live from REX, and saved back to it.
 *
 *   GET   ?id=843312        → everything the Marketing tab and the portal
 *                             preview show, with REX's own blockers
 *   PATCH { id, ...edit }   → rent, deposit, available date, heading, body,
 *                             key features, photo order, bedrooms, bathrooms,
 *                             receptions. Anything left out is left alone.
 *
 * The listing half needs Listings/update on REX_ALLOW_WRITES (open since 29
 * Aug for the write-up); the rooms half needs Properties/update, because REX
 * keeps bedrooms on the property, not the listing. A save that touches both
 * reports each half on its own, so a locked property write never loses the
 * listing half.
 *
 * Switch: "Edit the advert into REX" under Listings (lib/area-map).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listingId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(req: NextRequest) {
  const testId = req.nextUrl.searchParams.get("id");
  if (isTestId(testId)) {
    const t = await testDetails(Number(testId));
    return t ? NextResponse.json(t) : NextResponse.json({ ok: false, error: "That test listing has gone." }, { status: 404 });
  }
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = listingId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  try {
    const details = await readListingDetails(id);
    return NextResponse.json(
      { ok: true, details, locks: { listing: rexWritesLocked("Listings", "update"), rooms: rexWritesLocked("Properties", "update"), media: rexWritesLocked("Upload", "uploadFileFromUrl") || rexWritesLocked("Listings", "update") } },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: "The listing did not answer. Try again in a minute." }, { status: 502 });
  }
}

const count = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 50 ? n : undefined;
};
const money = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n) : undefined;
};

export async function PATCH(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });
  const gate = await gateListingWrite(req, "listing-edit");
  if ("refuse" in gate) return gate.refuse;
  const { actor } = gate;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (isTestId(b.id)) return NextResponse.json({ ok: false, error: TEST_REFUSAL, test: true }, { status: 409 });
  const id = listingId(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  const notTheirs = await listingIsTheirs(actor, id);
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });

  const edit: ListingEdit = {};
  const bad: string[] = [];
  const take = <K extends keyof ListingEdit>(key: K, value: ListingEdit[K] | undefined, raw: unknown) => {
    if (raw === undefined) return;
    if (value === undefined) bad.push(key);
    else edit[key] = value;
  };
  take("rent", money(b.rent), b.rent);
  take("deposit", money(b.deposit), b.deposit);
  take("beds", count(b.beds), b.beds);
  take("baths", count(b.baths), b.baths);
  take("receptions", count(b.receptions), b.receptions);
  if (b.availableFrom !== undefined) {
    if (b.availableFrom === null || b.availableFrom === "") edit.availableFrom = null;
    else if (typeof b.availableFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.availableFrom)) edit.availableFrom = b.availableFrom;
    else bad.push("availableFrom");
  }
  if (b.heading !== undefined) {
    /* No em dashes reach a portal, whoever typed them (24 Sep 2026). */
    if (typeof b.heading === "string" && b.heading.length <= 255) edit.heading = noDashes(b.heading).trim();
    else bad.push("heading (255 characters at most - Zoopla refuses longer)");
  }
  if (b.body !== undefined) {
    if (typeof b.body === "string" && b.body.length <= 20_000) edit.body = noDashes(b.body);
    else bad.push("body");
  }
  if (b.highlights !== undefined) {
    if (Array.isArray(b.highlights) && b.highlights.every((h) => typeof h === "string" && h.length <= 200) && b.highlights.length <= MAX_HIGHLIGHTS) {
      edit.highlights = (b.highlights as string[]).map(noDashes);
    } else bad.push(`key features (${MAX_HIGHLIGHTS} at most, 200 characters each)`);
  }
  if (b.imageOrder !== undefined) {
    if (Array.isArray(b.imageOrder) && b.imageOrder.every((x) => typeof x === "string" || typeof x === "number")) edit.imageOrder = (b.imageOrder as unknown[]).map(String);
    else bad.push("imageOrder");
  }
  /* The material information: each one must be a value off its list. All
     of them are kept by the OS; the ones the listing has a field for are
     sent on as well (planListingWrite). */
  const facts: MarketingFacts = {};
  for (const key of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) {
    const raw = b[key];
    if (raw === undefined) continue;
    if (raw === null || raw === "") facts[key] = null;
    else if (typeof raw === "string" && (OPTIONS[key] as readonly string[]).includes(raw)) facts[key] = raw;
    else bad.push(key);
  }
  if (b.floorAreaSqft !== undefined) {
    const n = Number(b.floorAreaSqft);
    if (b.floorAreaSqft === null || (Number.isFinite(n) && n > 0 && n < 100_000)) facts.floorAreaSqft = b.floorAreaSqft === null ? null : Math.round(n);
    else bad.push("floorAreaSqft");
  }
  if (b.sources && typeof b.sources === "object") facts.sources = b.sources as MarketingFacts["sources"];
  for (const key of ["councilTaxBand", "parking", "electricity", "water", "sewerage", "broadband"] as const) {
    if (facts[key] !== undefined) edit[key] = facts[key];
  }
  if (bad.length) return NextResponse.json({ ok: false, error: `These did not look right: ${bad.join(", ")}.` }, { status: 400 });

  try {
    /* The OS's own copy first, so nothing typed is lost to a refused write. */
    const factKeys = Object.keys(facts).filter((k) => k !== "sources");
    if (factKeys.length) await saveMarketingFacts(String(id), facts, actor.email);
    const plan = await planListingWrite(id, edit);
    if (!plan.listing && !plan.property) {
      const details = factKeys.length ? await readListingDetails(id).catch(() => null) : null;
      return NextResponse.json({ ok: true, id, note: factKeys.length ? "Saved." : "Nothing to change.", details });
    }

    const token = await rexTokenFor(actor.id);
    const outcome: { listing?: string; rooms?: string } = {};
    let failed = false;

    /* The property FIRST. REX sends a listing to the portals when the
       listing changes, reading the property as it stands at that moment: on
       the first live save the rooms went in a few seconds after the listing,
       and the portals never heard about them. */
    if (plan.property) {
      if (rexWritesLocked("Properties", "update")) {
        /* Owner-only diagnostics say which permission; nobody else needs to. */
        outcome.rooms = isOwner(actor) ? "Rooms and utilities are kept here; sending them on needs Properties/update on REX_ALLOW_WRITES." : "Kept here; they will reach the portals once switched on.";
      } else {
        const r = await rexCall("Properties", "update", { data: plan.property }, token);
        outcome.rooms = r.ok ? "Saved." : isOwner(actor) ? `REX refused the property half: ${r.error ?? r.status}` : "The rooms and services are kept here, and did not reach the portals yet.";
        failed ||= !r.ok;
      }
    }

    if (plan.listing) {
      if (rexWritesLocked("Listings", "update")) {
        outcome.listing = isOwner(actor) ? "Locked here: REX_ALLOW_WRITES needs Listings/update." : "Saving the advert is not switched on yet.";
        failed = true;
      } else {
        const r = await rexCall("Listings", "update", { data: plan.listing }, token);
        if (!r.ok && token && isExpiredToken(r)) {
          return NextResponse.json({ ok: false, error: "Your sign-in to the listings system has lapsed. Reconnect it on your Profile and try again.", reconnect: true }, { status: 401 });
        }
        outcome.listing = r.ok ? "Saved." : isOwner(actor) ? `REX refused it: ${r.error ?? r.status}` : "The advert did not save. Try again in a minute.";
        failed ||= !r.ok;
      }
    }
    await invalidateListingBook();
    await record({
      kind: "listing_edited",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: ${Object.keys(edit).join(", ")} - listing ${outcome.listing ?? "untouched"}; rooms ${outcome.rooms ?? "untouched"}${token ? "" : " (office account)"}`,
    });

    /* Read back rather than trusting the write: REX trims and normalises. */
    const details = await readListingDetails(id).catch(() => null);
    return NextResponse.json({ ok: !failed, id, outcome, details, error: failed ? [outcome.listing, outcome.rooms].filter((x) => x && x !== "Saved.").join(" ") : undefined });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "The listing did not answer. Try again in a minute." }, { status: 502 });
  }
}
