import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";

/**
 * GET /api/m/properties?q=… → a property, and the few facts an agent needs
 * standing outside it. The phone view (16 Sep 2026).
 *
 * READ ONLY. Answers from the two books the Listings and Portfolio screens
 * already fill, so a keystroke never walks REX, and scoped the same way: an
 * agent sees their own stock.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface PhoneProperty {
  key: string;
  name: string;
  locality: string;
  /** "£1,150 pcm" / "£275 pw", or empty when REX has no rent. */
  rent: string;
  /** "On the market", "Let agreed", "Not yet live", "Managed", "Let". */
  status: string;
  availableFrom: string | null;
  propertyType: string | null;
  image: string | null;
  /** Who lives there now, when anybody does - a tenanted viewing needs a knock first. */
  tenants: { name: string; phone: string }[];
  landlord: { name: string; phone: string; email: string } | null;
  lat: number | null;
  lng: number | null;
  postcode: string | null;
}

const money = (n: number | null, period: "month" | "week" | null) =>
  n == null ? "" : `£${Math.round(n).toLocaleString("en-GB")} ${period === "week" ? "pw" : "pcm"}`;

function matches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const n = needle.toLowerCase().replace(/\s+/g, " ");
  return fields.some((f) => Boolean(f) && String(f).toLowerCase().replace(/\s+/g, " ").includes(n));
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (needle.length < 2) return NextResponse.json({ ok: true, properties: [] });
  const scope = await scopeFor(req);
  const rexUserId = scope.unlinked ? null : scope.rexUserId;

  const [book, managed] = await Promise.all([
    bookFor(rexUserId).catch(() => null),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
  ]);
  if (!book && !managed) {
    return NextResponse.json({ ok: false, error: "The property book did not load. Try again in a moment." }, { status: 502 });
  }

  const out: PhoneProperty[] = [];
  const managedByListing = new Map((managed?.properties ?? []).map((m) => [String(m.listingId), m]));

  for (const l of book?.listings ?? []) {
    if (out.length >= 25) break;
    if (!matches(needle, l.name, l.locality, l.postcode)) continue;
    const m = managedByListing.get(String(l.id));
    out.push({
      key: `l-${l.id}`,
      name: l.name,
      locality: l.locality,
      rent: money(l.rent, l.rentPeriod),
      status: l.letAgreed ? "Let agreed" : l.publicationStatus === "published" ? "On the market" : "Not yet live",
      availableFrom: l.availableFrom,
      propertyType: l.propertyType,
      image: l.image,
      tenants: (m?.tenants ?? []).map((t) => ({ name: t.name, phone: t.phone ?? "" })),
      landlord: m?.landlord ? { name: m.landlord.name, phone: m.landlord.phone ?? "", email: m.landlord.email ?? "" } : null,
      lat: l.lat,
      lng: l.lng,
      postcode: l.postcode,
    });
  }

  const listed = new Set((book?.listings ?? []).map((l) => String(l.id)));
  for (const m of managed?.properties ?? []) {
    if (out.length >= 25) break;
    if (listed.has(String(m.listingId))) continue;
    if (!matches(needle, m.name, m.locality, m.address, m.postcode)) continue;
    out.push({
      key: `m-${m.listingId}`,
      name: m.name,
      locality: m.locality,
      rent: money(m.rent, m.rentPeriod),
      status: m.service ? m.service : "Let",
      availableFrom: null,
      propertyType: null,
      image: m.image,
      tenants: m.tenants.map((t) => ({ name: t.name, phone: t.phone ?? "" })),
      landlord: m.landlord ? { name: m.landlord.name, phone: m.landlord.phone ?? "", email: m.landlord.email ?? "" } : null,
      lat: m.lat,
      lng: m.lng,
      postcode: m.postcode,
    });
  }

  return NextResponse.json({ ok: true, properties: out });
}
