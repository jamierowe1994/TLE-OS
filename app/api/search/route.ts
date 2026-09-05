import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { getComplianceBook } from "@/lib/compliance-cache";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { getApplications } from "@/lib/applications";
import type { Lead } from "@/lib/leads-sample";

/**
 * GET /api/search?q=… → the one search bar, made real (5 Sep 2026).
 *
 * James: "the search bar no longer works in any of the tabs". It never had:
 * every page header drew a bar, and only Listings wired it. This answers the
 * bar on every page: an address, a name, an email or a phone number, and
 * back come the property, the lead, the application and the deal that
 * match, each with the screen that opens it.
 *
 * Read from the caches the screens already fill (listings, leads, the
 * compliance book, Propoly's deals) so a keystroke never walks REX. Only
 * applications are read live, and they answer in about a second.
 * Scoped like everything else: an agent searches their own book.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface Hit {
  kind: "property" | "lead" | "application" | "deal" | "compliance";
  title: string;
  sub: string;
  href: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

function matches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const n = needle.toLowerCase();
  const nd = digits(needle);
  return fields.some((f) => {
    if (!f) return false;
    const v = String(f).toLowerCase();
    if (v.includes(n)) return true;
    return nd.length >= 5 && digits(v).includes(nd);
  });
}

/** An id only matches when somebody has typed most of it - "07" is a phone
 *  prefix, not a request for every property whose REX id contains 07. */
const idMatch = (needle: string, id: string | null | undefined) => /^\d{5,}$/.test(needle.trim()) && Boolean(id && String(id).includes(needle.trim()));

async function cachedLeads(rexUserId: string | null): Promise<Lead[]> {
  if (!hasDb()) return [];
  const key = rexUserId ? `leads:v2:agent:${rexUserId}` : "leads:v2:all";
  const rows = await q<{ payload: { book?: { leads?: Lead[] } } }>(`SELECT payload FROM os_cache WHERE key = $1`, [key]).catch(() => []);
  return rows[0]?.payload?.book?.leads ?? [];
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (needle.length < 2) return NextResponse.json({ ok: true, hits: [] });
  const scope = await scopeFor(req);
  const rexUserId = scope.unlinked ? null : scope.rexUserId;

  const [book, leads, compliance, deals, applications] = await Promise.all([
    bookFor(rexUserId).catch(() => null),
    cachedLeads(rexUserId),
    getComplianceBook().catch(() => null),
    getAllPropolyDeals().catch(() => null),
    getApplications(200, rexUserId).catch(() => []),
  ]);

  const hits: Hit[] = [];
  const cap = (n: number) => hits.length < n;

  for (const l of book?.listings ?? []) {
    if (!cap(40)) break;
    if (matches(needle, l.name, l.locality) || idMatch(needle, l.propertyId) || idMatch(needle, l.id)) {
      /* HMO rooms share a name; the listing ref keeps them apart. */
      hits.push({ kind: "property", title: l.name, sub: `${l.locality} · listing ${l.id}`, href: `/listings?open=${encodeURIComponent(l.id)}` });
    }
  }
  for (const l of leads) {
    if (!cap(60)) break;
    if (matches(needle, l.name, l.email, l.phone, l.address, l.preferred)) {
      hits.push({ kind: "lead", title: l.name, sub: `${l.enquiry} lead · ${l.source}${l.area && l.area !== "—" ? ` · ${l.area}` : ""}`, href: `/leads?open=${encodeURIComponent(l.id)}` });
    }
  }
  for (const a of applications) {
    if (!cap(80)) break;
    const names = a.applicants.map((x) => x.name).join(", ");
    const emails = a.applicants.map((x) => x.email ?? "").join(" ");
    const phones = a.applicants.map((x) => x.phone ?? "").join(" ");
    if (matches(needle, a.property, names, emails, phones)) {
      hits.push({ kind: "application", title: names || "Application", sub: `application · ${a.property}`, href: `/applications?open=${encodeURIComponent(a.id)}` });
    }
  }
  for (const d of deals ?? []) {
    if (!cap(100)) break;
    const tenants = d.app.tenants.map((t) => t.name).join(", ");
    if (matches(needle, d.app.propertyName, tenants, ...d.app.tenants.map((t) => t.email ?? ""))) {
      hits.push({ kind: "deal", title: d.app.propertyName, sub: `deal · ${d.statusKey.replace(/_/g, " ")}${tenants ? ` · ${tenants}` : ""}`, href: `/pre-tenancy?deal=${encodeURIComponent(d.app.id)}` });
    }
  }
  for (const p of compliance?.book.properties ?? []) {
    if (!cap(120)) break;
    if (matches(needle, p.name, p.locality) || idMatch(needle, p.id)) {
      hits.push({ kind: "compliance", title: p.name, sub: `${p.locality} · certificates`, href: `/compliance?open=${encodeURIComponent(p.id)}` });
    }
  }

  return NextResponse.json({ ok: true, hits: hits.slice(0, 40) });
}
