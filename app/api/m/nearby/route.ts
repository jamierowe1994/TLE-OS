import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { hasDb, q } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { bookFor } from "@/lib/listings-cache";
import type { Lead } from "@/lib/leads-sample";
import type { PhonePerson } from "@/app/api/m/people/route";
import { listContacts } from "@/lib/contacts-store";
import { listAppraisals } from "@/lib/appraisal-store";
import { pointsFor } from "@/lib/postcode-geo";
import { postcodeOf } from "@/lib/address-parse";
import { TEST_STREET } from "@/lib/test-guard";

/**
 * GET /api/m/nearby?who=landlord|tenant&lat=…&lng=…&miles=3 → the people
 * within that distance, nearest first. The phone's Search by Radius (James,
 * 18 Sep 2026). READ ONLY, scoped like /api/m/people.
 *
 * A person is placed by the home they belong to:
 *   landlord  every home we manage for them, and a landlord enquiry's address
 *   tenant    the home they live in, and a letting enquiry's property
 * So "within 3 miles" means "has a home, or wants one, within 3 miles".
 *
 * Landlords also come from the OS's own appraisals and contacts. Homes are
 * placed by their POSTCODE where they have one (lib/postcode-geo): REX's own
 * pins are sometimes wrong - an East Kilbride home came back 2.4 miles from
 * Hull. Leads keep their own point.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface NearbyPerson extends PhonePerson {
  miles: number;
}

/** Great-circle distance in miles. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

async function cachedLeads(rexUserId: string | null): Promise<Lead[]> {
  if (!hasDb()) return [];
  const key = rexUserId ? `leads:v2:agent:${rexUserId}` : "leads:v2:all";
  const rows = await q<{ payload: { book?: { leads?: Lead[] } } }>(`SELECT payload FROM os_cache WHERE key = $1`, [key]).catch(() => []);
  return rows[0]?.payload?.book?.leads ?? [];
}

const place = (lat: number | null | undefined, lng: number | null | undefined) =>
  lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const who = sp.get("who") === "landlord" ? "landlord" : "tenant";
  const here = place(Number(sp.get("lat")), Number(sp.get("lng")));
  if (!here) return NextResponse.json({ ok: false, error: "Where from? A location or a postcode is needed." }, { status: 400 });
  const miles = Math.min(Math.max(Number(sp.get("miles")) || 3, 0.25), 25);

  const scope = await scopeFor(req);
  const rexUserId = scope.unlinked ? null : scope.rexUserId;
  const [managed, leads, listings, contacts, appraisals] = await Promise.all([
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
    cachedLeads(rexUserId),
    who === "tenant" ? bookFor(rexUserId).then((b) => b?.listings ?? []).catch(() => []) : Promise.resolve([]),
    listContacts({ limit: 500 }).catch(() => []),
    who === "landlord" ? listAppraisals().catch(() => []) : Promise.resolve([]),
  ]);
  const pcOf = (pc: string | null | undefined, address?: string | null) => (pc && pc.trim()) || (address ? postcodeOf(address) : null) || "";
  const points = await pointsFor([
    ...(managed?.properties ?? []).map((h) => pcOf(h.postcode, h.address)),
    ...listings.map((l) => pcOf(l.postcode)),
    ...contacts.map((c) => pcOf(c.postcode, c.address)),
    ...appraisals.map((a) => pcOf(a.postcode, a.address)),
  ].filter(Boolean));
  /* The postcode's point first; REX's pin only when the postcode gave none. */
  const at = (pc: string, lat?: number | null, lng?: number | null) => (pc && points.get(pc)) || place(lat, lng);

  /* One row per person, at their nearest home. */
  const best = new Map<string, NearbyPerson>();
  const offer = (p: PhonePerson, at: { lat: number; lng: number } | null) => {
    if (!at || !p.name.trim()) return;
    const d = milesBetween(here, at);
    if (d > miles) return;
    const id = p.email ? `e:${p.email.toLowerCase()}` : p.phone ? `p:${p.phone.replace(/\D/g, "").slice(-10)}` : `n:${p.name.toLowerCase()}`;
    const had = best.get(id);
    if (!had || d < had.miles) best.set(id, { ...p, miles: Math.round(d * 10) / 10 });
  };

  const homes = managed?.properties ?? [];
  if (who === "landlord") {
    for (const h of homes) {
      if (!h.landlord) continue;
      offer({ key: `ll-${h.landlord.contactId}`, name: h.landlord.name, role: "Landlord", context: h.name, phone: h.landlord.phone ?? "", email: h.landlord.email ?? "" }, at(pcOf(h.postcode, h.address), h.lat, h.lng));
    }
    for (const c of contacts) {
      if (c.kind !== "landlord") continue;
      offer({ key: `os-${c.id}`, name: c.name, role: "Landlord", context: c.address, phone: c.mobile, email: c.email }, at(pcOf(c.postcode, c.address)));
    }
    for (const a of appraisals) {
      if (TEST_STREET.test(a.address)) continue;
      offer({ key: `ma-${a.id}`, name: a.landlord, role: "Landlord", context: a.address, phone: a.landlordMobile ?? "", email: a.landlordEmail ?? "" }, at(pcOf(a.postcode, a.address)));
    }
    for (const l of leads) {
      if (l.enquiry === "Letting") continue;
      offer({ key: `lead-${l.id}`, name: l.name, role: "Landlord Lead", context: l.address ?? "", phone: l.phone ?? "", email: l.email ?? "" }, place(l.lat, l.lng));
    }
  } else {
    for (const h of homes) {
      for (const t of h.tenants) {
        offer({ key: `ten-${t.contactId}`, name: t.name, role: "Tenant", context: h.name, phone: t.phone ?? "", email: t.email ?? "" }, at(pcOf(h.postcode, h.address), h.lat, h.lng));
      }
    }
    for (const c of contacts) {
      if (c.kind !== "tenant") continue;
      offer({ key: `os-${c.id}`, name: c.name, role: "Tenant", context: c.address, phone: c.mobile, email: c.email }, at(pcOf(c.postcode, c.address)));
    }
    const listingAt = new Map(listings.map((l) => [String(l.id), at(pcOf(l.postcode), l.lat, l.lng)]));
    for (const l of leads) {
      if (l.enquiry !== "Letting") continue;
      const at = place(l.lat, l.lng) ?? (l.listingId != null ? listingAt.get(String(l.listingId)) ?? null : null);
      offer({ key: `lead-${l.id}`, name: l.name, role: "Tenant Lead", context: l.address ?? "", phone: l.phone ?? "", email: l.email ?? "" }, at);
    }
  }

  const people = [...best.values()].sort((a, b) => a.miles - b.miles).slice(0, 60);
  return NextResponse.json({ ok: true, people, miles });
}
