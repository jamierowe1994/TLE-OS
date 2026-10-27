import { NextRequest, NextResponse } from "next/server";
import { worksLate } from "@/lib/london-clock";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { getComplianceBook } from "@/lib/compliance-cache";
import { CERT_META, dueWithin, type CompProperty } from "@/lib/compliance";
import { getArrears } from "@/lib/business/payprop-income";
import { stageOf, type StageListing } from "@/lib/listing-stages";
import { activity } from "@/lib/activity";
import { grantWholeBusiness } from "@/lib/scope";
import { wholeOverviewFor } from "@/lib/overview-access";
import type { FrontRecord } from "@/lib/front-dash";
import { GET as portfolioGET } from "@/app/api/portfolio/route";
import { GET as worksGET } from "@/app/api/works-orders/route";
import { GET as applicationsGET } from "@/app/api/applications/route";
import { GET as listingsGET } from "@/app/api/listings/route";

/**
 * GET /api/overview/records?kind=... - the records behind a PM Dashboard
 * figure (James, 25 Oct 2026: "they should all be clickable tiles, and they
 * should open out"), in the front dashboard's record shape so the same
 * pop-out draws them.
 *
 *   kind  managed | arrears | maintenance | compliance | applications | market
 *
 * Read exactly as /api/overview reads its figures - each screen's own route,
 * called as the same person, the same whole-business rule
 * (lib/overview-access) and the same cutting-down of the company-wide lists to
 * a person's own homes - so a list always matches the figure on its tile.
 * Inspections, tenancy reviews and move-outs open their own boards instead
 * (components/portfolio/OverviewPanel). Never a phone number or an email.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Json = Record<string, unknown>;
const KINDS = ["managed", "arrears", "maintenance", "compliance", "applications", "market"] as const;
type Kind = (typeof KINDS)[number];
const PAGE = 200;
const todayLondon = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const enc = encodeURIComponent;
const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

async function read(handler: (r: NextRequest) => Promise<Response>, req: NextRequest, path: string, whole: boolean): Promise<Json> {
  const sub = new NextRequest(new URL(path, req.url), { headers: req.headers });
  if (whole) grantWholeBusiness(sub);
  const res = await handler(sub);
  const j = (await res.json()) as Json;
  if (!res.ok || j.ok === false || j.unlinked) throw new Error(typeof j.error === "string" ? j.error : typeof j.reason === "string" ? j.reason : "That list couldn't be read just now.");
  return j;
}

export async function GET(req: NextRequest) {
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") as Kind | null;
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ ok: false, error: "Which list?" }, { status: 400 });
  const offset = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("offset") ?? 0)) || 0);
  const today = todayLondon();
  const whole = await wholeOverviewFor(req, { actor, subject, viewingAs });
  const get = (h: (r: NextRequest) => Promise<Response>, path: string) => read(h, req, path, whole);
  const mine = async (): Promise<Set<string> | null> => {
    if (whole) return null;
    const j = await get(portfolioGET, "/api/portfolio");
    return new Set(((Array.isArray(j.properties) ? j.properties : []) as { propertyId: string | null }[]).map((p) => String(p.propertyId ?? "")).filter(Boolean));
  };

  let rows: FrontRecord[] = [];
  try {
    if (kind === "managed") {
      const j = await get(portfolioGET, "/api/portfolio");
      type P = { listingId: string; name: string; locality: string; service: string | null; letSince: string | null; landlord: { name: string } | null; tenants: { name: string }[]; test?: boolean };
      rows = ((Array.isArray(j.properties) ? j.properties : []) as P[])
        .filter((p) => !p.test)
        .map((p) => ({
          id: `home:${p.listingId}`,
          name: p.landlord?.name || "Landlord not on record",
          property: [p.name, p.locality].filter(Boolean).join(", "),
          source: p.service,
          at: p.letSince,
          status: p.tenants.length ? `Let to ${p.tenants.map((t) => t.name).join(" & ")}` : "Empty",
          href: `/portfolio/${enc(p.listingId)}`,
        }))
        .sort((a, b) => a.property.localeCompare(b.property));
    } else if (kind === "arrears") {
      if (!can(actor.role, "see:business") || viewingAs) throw new Error("Rent arrears are for the business owners.");
      const a = await getArrears();
      if (!a) throw new Error("Still reading arrears from PayProp. Try again in a minute.");
      rows = a.tenants
        .filter((t) => !t.tenancyStart || t.tenancyStart <= today)
        .sort((x, y) => y.owed - x.owed)
        .map((t, i) => ({
          id: `arrears:${t.propertyId ?? i}:${t.tenant}`,
          name: t.tenant,
          property: t.property,
          source: null,
          at: t.lastInvoice,
          status: `${pounds(t.owed)} behind`,
          href: "/finances",
        }));
    } else if (kind === "maintenance") {
      const [j, homes] = await Promise.all([get(worksGET, "/api/works-orders?open=1"), mine()]);
      const ours = (id: string | null) => !homes || (!!id && homes.has(id));
      type O = { id: string; title: string; propertyId: string | null; propertyName: string; dueAt: string | null; urgency: string | null; status: string; createdAt: string; rehearsal?: boolean; kind?: string | null };
      type C = { taskId: string; title: string; propertyId: string | null; propertyName: string; dueOn: string | null; overdue: boolean; urgency: string | null; followUpOn: string | null };
      const orders = ((Array.isArray(j.orders) ? j.orders : []) as O[]).filter((o) => !o.rehearsal && ours(o.propertyId));
      const carried = ((Array.isArray(j.carried) ? j.carried : []) as C[]).filter((c) => ours(c.propertyId));
      rows = [
        ...orders.map((o) => ({
          id: `job:${o.id}`,
          name: o.title || "Job",
          property: o.propertyName,
          source: o.urgency === "emergency" ? "Emergency" : o.urgency ? o.urgency.charAt(0).toUpperCase() + o.urgency.slice(1) : null,
          at: o.dueAt ?? o.createdAt,
          status: worksLate(o as Parameters<typeof worksLate>[0]) ? `Overdue · ${o.status.replace(/_/g, " ")}` : o.status.replace(/_/g, " "),
          late: worksLate(o as Parameters<typeof worksLate>[0]),
          href: `/maintenance/${enc(o.id)}`,
        })),
        ...carried.map((c) => ({
          id: `carried:${c.taskId}`,
          name: c.title || "Job",
          property: c.propertyName,
          source: c.urgency === "emergency" ? "Emergency" : null,
          at: c.dueOn,
          status: c.overdue ? "Overdue · from property management" : c.followUpOn && c.followUpOn <= today ? "Follow up due" : "Open, from property management",
          late: c.overdue,
          href: "/maintenance",
        })),
      ].sort((a, b) => Number(Boolean(b.late)) - Number(Boolean(a.late)) || (a.at ?? "9").localeCompare(b.at ?? "9"));
    } else if (kind === "compliance") {
      const [{ book }, homes] = await Promise.all([getComplianceBook(), mine()]);
      const seen = new Set<string>();
      const props = (book.properties as CompProperty[]).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)) && (!homes || homes.has(String(p.id))));
      rows = dueWithin(30, props)
        .map((d) => {
          const days = d.cert?.expires ?? null;
          return {
            id: `cert:${d.p.id}:${d.key}`,
            name: CERT_META[d.key]?.short ?? String(d.key),
            property: [d.p.name, d.p.locality].filter(Boolean).join(", "),
            source: d.p.landlord || null,
            at: days == null ? null : new Date(Date.now() + days * 86_400_000).toISOString(),
            status: d.status === "expired" ? `Expired${days != null ? `, ${Math.abs(days)} days ago` : ""}` : `Due in ${days} days`,
            late: d.status === "expired",
            href: "/compliance",
          };
        })
        .sort((a, b) => Number(Boolean(b.late)) - Number(Boolean(a.late)) || (a.at ?? "").localeCompare(b.at ?? ""));
    } else if (kind === "applications") {
      const j = await get(applicationsGET, "/api/applications");
      type A = { id: string; status: string; closed: unknown; property: string; locality: string; applicants: { name: string }[]; dateReceived: string | null; startDate: string | null; statusLabel?: string };
      rows = ((Array.isArray(j.applications) ? j.applications : []) as A[])
        .filter((a) => !a.closed && /^(received|communicated)$/i.test(a.status))
        .map((a) => ({
          id: `app:${a.id}`,
          name: a.applicants.map((p) => p.name).filter(Boolean).join(" & ") || "Applicant not named",
          property: [a.property, a.locality].filter(Boolean).join(", "),
          source: null,
          at: a.dateReceived,
          status: a.statusLabel || a.status,
          href: `/applications/${enc(a.id)}`,
        }))
        .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    } else {
      const [j, act] = await Promise.all([get(listingsGET, "/api/listings?tests=0"), activity().catch(() => null)]);
      const accepted = new Set(act?.accepted ?? []);
      type L = StageListing & { id: string; name: string; locality: string; rent: number | null; publishedAt: string | null; archived?: boolean };
      rows = ((Array.isArray(j.listings) ? j.listings : []) as L[])
        .filter((l) => !l.archived && stageOf(l, accepted) === "Available")
        .map((l) => ({
          id: `listing:${l.id}`,
          name: l.rent ? `${pounds(l.rent)} pcm` : "Rent not set",
          property: [l.name, l.locality].filter(Boolean).join(", "),
          source: null,
          at: l.publishedAt,
          status: "On the portals",
          href: `/listings/${enc(l.id)}`,
        }))
        .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.replace(/\.$/, "") : "That list couldn't be read just now" });
  }
  return NextResponse.json({ ok: true, kind, from: null, to: null, total: rows.length, rows: rows.slice(offset, offset + PAGE), offset, more: offset + PAGE < rows.length, everything: whole });
}
