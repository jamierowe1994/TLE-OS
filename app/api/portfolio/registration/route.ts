import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { isScottish } from "@/lib/property-flags";
import { recordFact } from "@/lib/property-facts";
import { forgetRecord, recordForProperty, type ListingRecord } from "@/lib/listing-record";
import { forgetListing } from "@/lib/listing-details";
import { MAX_REG_NUMBERS, isRealDay, joinRegExpiries, joinRegNumbers, joinRegOwners, regNumbers, regOwnerName } from "@/lib/reg-numbers";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * THE LANDLORD REGISTRATION ON A MANAGED HOME'S PAGE (Lianna Denholm, ticket
 * 678d4606; James, 10 Nov 2026: "Scottish properties can have a registration
 * box on managed homes on the landlord card").
 *
 *   GET   ?listing=<id>        the home's numbers, whose each is and when each runs out
 *   PATCH { listingId, landlordRegistration?, landlordRegistrationExpiry?, landlordRegistrationOwner? }
 *
 * The same box as a listing's Landlord section (components/listing/
 * LandlordRegistration), saved on the same home record (os_property_facts:
 * landlord_registration, _expiry, _owner), so the Terms and the listing's
 * Compliance read what is typed here. A landlord with several homes owned by
 * different businesses: each home keeps the number of whoever owns it.
 *
 * Why its own route: the listing's (app/api/listings/details) takes a REX
 * listing number only, and puts the number on the advert in REX. A managed
 * home may have no REX listing at all - a REX PM home is "pm-link-<REX
 * property>" or the OS's own record ("pm-...") - and a let home's advert is
 * not to be touched. So this keeps the number in the OS and writes nothing to
 * REX, PayProp or Propoly.
 *
 * The home must be in the person's own book (the office's is everybody's), as
 * the home's right to rent dates are. Scottish homes only. Audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Who = Awaited<ReturnType<typeof whoIs>>;

/* As the listing's Landlord section takes them (app/api/listings/details). */
const NUMBER_OK = /^[A-Za-z0-9/ -]{3,40}$/;
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

async function homeFor(req: NextRequest, who: Who, listingId: string) {
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return { error: "We can't tell which agent you are." as const };
  const { book } = await managedBookFor(scope.rexUserId);
  const p = book.properties.find((x) => String(x.listingId) === listingId);
  if (!p) return { error: "This home isn't in your book." as const };
  if (p.test) return { error: "A test home keeps its own details." as const };
  if (!p.propertyId) return { error: "This home has no record to keep the number on yet." as const };
  /* The same reading of the address as the page's (it decides whether the box shows). */
  const scotland = isScottish(p.postcode, p.address, p.town, p.locality);
  return { p, propertyId: p.propertyId, scotland };
}

/** What the box reads: the home's record, with Scotland as the page decides it. */
const forBox = (rec: ListingRecord, scotland: boolean) => ({
  scotland,
  factsKey: rec.factsKey,
  landlordRegistration: rec.landlordRegistration,
  landlordRegistrationExpiry: rec.landlordRegistrationExpiry ?? {},
  landlordRegistrationOwner: rec.landlordRegistrationOwner ?? {},
});

async function signedIn(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  return who?.actor ? who : null;
}

export async function GET(req: NextRequest) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listingId = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  if (!listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const h = await homeFor(req, who, listingId);
    if ("error" in h) return NextResponse.json({ ok: false, error: h.error }, { status: 403 });
    if (!h.scotland) return NextResponse.json({ ok: true, record: null });
    /* Strict: a record that won't read says so, never shows as "no number yet". */
    const rec = await recordForProperty(h.propertyId, { postcode: h.p.postcode, town: h.p.town, address: h.p.address }, { strict: true });
    return NextResponse.json({ ok: true, record: forBox(rec, true) }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The landlord registration couldn't be read just now.") }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const actor = who.actor!;
  if (who.subject && who.subject.id !== actor.id) return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const listingId = String(b.listingId ?? "").trim();
  if (!listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });

  /* Checked exactly as the listing's Landlord section checks them. */
  const bad: string[] = [];
  let larn: string | null | undefined;
  if (b.landlordRegistration !== undefined) {
    if (b.landlordRegistration === null || b.landlordRegistration === "") larn = null;
    else {
      const list = typeof b.landlordRegistration === "string" ? regNumbers(b.landlordRegistration) : [];
      if (list.length && list.length <= MAX_REG_NUMBERS && list.every((n) => NUMBER_OK.test(n))) larn = joinRegNumbers(list);
      else bad.push("landlord registration number (numbers and slashes, as the council gives it)");
    }
  }
  let regExpiry: Record<string, string | null> | undefined;
  if (b.landlordRegistrationExpiry !== undefined) {
    const v = b.landlordRegistrationExpiry;
    const entries = v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>) : null;
    const latest = `${new Date().getUTCFullYear() + 10}-12-31`;
    if (entries && entries.length <= MAX_REG_NUMBERS && entries.every(([n, d]) => NUMBER_OK.test(n) && (d === null || d === "" || (isRealDay(d) && String(d) >= "2000-01-01" && String(d) <= latest)))) {
      regExpiry = Object.fromEntries(entries.map(([n, d]) => [flat(n), d ? String(d) : null]));
    } else bad.push("landlord registration expiry date (a real date)");
  }
  let regOwner: Record<string, string | null> | undefined;
  if (b.landlordRegistrationOwner !== undefined) {
    const v = b.landlordRegistrationOwner;
    const entries = v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>) : null;
    if (entries && entries.length <= MAX_REG_NUMBERS && entries.every(([n, o]) => NUMBER_OK.test(n) && (o === null || typeof o === "string"))) {
      regOwner = Object.fromEntries(entries.map(([n, o]) => [flat(n), regOwnerName(o) || null]));
    } else bad.push("whose landlord registration number it is");
  }
  if (bad.length) return NextResponse.json({ ok: false, error: `These did not look right: ${bad.join(", ")}.` }, { status: 400 });
  if (larn === undefined && regExpiry === undefined && regOwner === undefined) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });

  try {
    const h = await homeFor(req, who, listingId);
    if ("error" in h) return NextResponse.json({ ok: false, error: h.error }, { status: 403 });
    if (!h.scotland) return NextResponse.json({ ok: false, error: "A landlord registration number is for a Scottish home." }, { status: 400 });
    const place = { postcode: h.p.postcode, town: h.p.town, address: h.p.address };
    /* Read now and in full: what is laid over has to be what is there now, and a read that fails writes nothing. */
    const current = await recordForProperty(h.propertyId, place, { fresh: true, strict: true }).catch(() => null);
    const key = current?.factsKey ?? null;
    if (!current || !key) return NextResponse.json({ ok: false, error: "This home's record didn't answer, so nothing was kept. Try again in a minute." }, { status: 503 });

    const by = actor.email;
    const sourceRef = `home ${listingId}`;
    const numbers = regNumbers(larn !== undefined ? larn : current.landlordRegistration);
    if (larn !== undefined && larn !== (joinRegNumbers(regNumbers(current.landlordRegistration)) ?? null)) {
      await recordFact({ propertyId: key, field: "landlord_registration", value: larn, source: "manual", sourceRef, by });
    }
    if (regExpiry !== undefined) {
      const value = joinRegExpiries({ ...current.landlordRegistrationExpiry, ...regExpiry }, numbers);
      await recordFact({ propertyId: key, field: "landlord_registration_expiry", value, source: "manual", sourceRef, by });
    }
    if (regOwner !== undefined) {
      const value = joinRegOwners({ ...current.landlordRegistrationOwner, ...regOwner }, numbers);
      await recordFact({ propertyId: key, field: "landlord_registration_owner", value, source: "manual", sourceRef, by });
    }
    /* The listing's Landlord section and Compliance read the same record, so neither keeps the old copy. */
    forgetRecord(h.propertyId);
    if (/^\d+$/.test(listingId)) forgetListing(listingId);
    await record({
      kind: "home_registration_saved",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${listingId} (record ${key}): ${numbers.length} landlord registration number${numbers.length === 1 ? "" : "s"} kept`,
    }).catch(() => undefined);

    const after = await recordForProperty(h.propertyId, place, { fresh: true, strict: true });
    return NextResponse.json({ ok: true, record: forBox(after, true) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save. Try again in a minute.") }, { status: 500 });
  }
}
