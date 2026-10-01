import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { getComplianceBook } from "@/lib/compliance-cache";
import { dueWithin, type CompProperty } from "@/lib/compliance";
import { getArrears } from "@/lib/business/payprop-income";
import { GET as portfolioGET } from "@/app/api/portfolio/route";
import { GET as worksGET } from "@/app/api/works-orders/route";
import { GET as inspectionsGET } from "@/app/api/inspections/route";
import { GET as reviewsGET } from "@/app/api/tenancy-reviews/route";
import { GET as applicationsGET } from "@/app/api/applications/route";
import { GET as listingsGET } from "@/app/api/listings/route";

/**
 * The Overview board (1 Oct 2026): one tile per part of property management,
 * the way REX PM's dashboard lays them out, so ops can see at a glance what
 * is late, what is coming up and where.
 *
 * Every figure is read from the screen it belongs to - the same route
 * handler, called here with the person's own request - so a tile can never
 * disagree with the page it links to, and an agent sees their own book just
 * as they do there. Each tile stands alone: one that fails says so and the
 * rest still draw. Nothing is a stored or sample number.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Json = Record<string, unknown>;
type Tile<T> = { ok: true; data: T } | { ok: false; error: string };

/** Call another screen's GET as the same person, and read its JSON. */
async function read(handler: (r: NextRequest) => Promise<Response>, req: NextRequest, path: string): Promise<Json> {
  const sub = new NextRequest(new URL(path, req.url), { headers: req.headers });
  const res = await handler(sub);
  const j = (await res.json()) as Json;
  if (!res.ok || j.ok === false) throw new Error(typeof j.error === "string" ? j.error : `That screen didn't answer (${res.status}).`);
  return j;
}

const settle = async <T,>(p: Promise<T>): Promise<Tile<T>> => {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't be read just now." };
  }
};

const todayLondon = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const today = todayLondon();
  const money = can(actor.role, "see:business");

  const [properties, maintenance, inspections, reviews, compliance, applications, lettings, arrears] = await Promise.all([
    settle(read(portfolioGET, req, "/api/portfolio").then((j) => {
      const c = (j.counts ?? {}) as Json;
      return {
        managed: Number(c.properties ?? 0),
        avgRent: Number(c.avgRent ?? 0),
        landlords: Number(c.landlords ?? 0),
        rentRoll: Number(c.managedRentRoll ?? 0),
        ageMs: typeof j.ageMs === "number" ? j.ageMs : null,
      };
    })),

    settle(read(worksGET, req, "/api/works-orders?open=1").then((j) => {
      const s = (j.summary ?? {}) as Json;
      const carried = (Array.isArray(j.carried) ? j.carried : []) as { followUpOn: string | null; overdue: boolean; title: string; propertyName: string; dueOn: string | null }[];
      return {
        open: Number(s.open ?? 0),
        overdue: Number(s.overdue ?? 0),
        emergencies: Number(s.emergencies ?? 0),
        followUp: carried.filter((c) => c.followUpOn && c.followUpOn <= today).length,
        late: carried.filter((c) => c.overdue).slice(0, 3).map((c) => ({ title: c.title, where: c.propertyName, dueOn: c.dueOn })),
        partial: typeof j.carriedError === "string" ? j.carriedError : null,
      };
    })),

    settle(read(inspectionsGET, req, "/api/inspections").then((j) => {
      const s = (j.summary ?? {}) as Json;
      if (typeof j.bookError === "string") throw new Error(j.bookError);
      return { due: Number(s.due ?? 0), overdue: Number(s.overdue ?? 0), booked: Number(s.booked ?? 0), awaitingTenant: Number(s.awaitingTenant ?? 0) };
    })),

    settle(read(reviewsGET, req, "/api/tenancy-reviews").then((j) => {
      const s = (j.summary ?? {}) as Json;
      const due = (Array.isArray(j.due) ? j.due : []) as { why: string; propertyName: string; agreement: string }[];
      const notice = due.filter((d) => /notice/i.test(d.why));
      return {
        due: Number(s.due ?? 0), overdue: Number(s.overdue ?? 0), doneThisMonth: Number(s.doneThisMonth ?? 0),
        noticeServed: notice.length,
        leaving: notice.slice(0, 3).map((d) => ({ where: d.propertyName, agreement: d.agreement })),
      };
    })),

    /* The compliance book is whole-business and the slowest read in the OS;
       it is cached, and the tile uses the Compliance screen's own rule. */
    settle(getComplianceBook().then(({ book, ageMs }) => {
      const seen = new Set<string>();
      const props = (book.properties as CompProperty[]).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      const due = dueWithin(30, props);
      const expired = due.filter((d) => d.status === "expired");
      return {
        expired: expired.length,
        dueSoon: due.length - expired.length,
        homesAffected: new Set(expired.map((d) => d.p.id)).size,
        ageMs: typeof ageMs === "number" ? ageMs : null,
      };
    })),

    settle(read(applicationsGET, req, "/api/applications").then((j) => {
      const apps = (Array.isArray(j.applications) ? j.applications : []) as { status: string; closed: unknown; startDate: string | null }[];
      const open = apps.filter((a) => !a.closed && /^(received|communicated)$/i.test(a.status));
      const movingIn = apps.filter((a) => !a.closed && /^accepted$/i.test(a.status) && (a.startDate ?? "") >= today);
      return { open: open.length, movingIn: movingIn.length };
    })),

    /* On the market = published to the portals, the dashboard tile's own rule;
       the book's "available" counts drafts too. */
    settle(read(listingsGET, req, "/api/listings?tests=0").then((j) => {
      const ls = (Array.isArray(j.listings) ? j.listings : []) as { publicationStatus: string | null; letAgreed: boolean }[];
      const published = ls.filter((l) => l.publicationStatus === "published");
      return {
        available: published.filter((l) => !l.letAgreed).length,
        letAgreed: published.filter((l) => l.letAgreed).length,
        drafts: ls.filter((l) => l.publicationStatus === "draft").length,
      };
    })),

    /* Money is Susan's and the owners' (see:business). Anyone else sees the
       tile say so rather than a number they are not meant to have. */
    money
      ? settle(getArrears().then((a) => {
          if (!a) throw new Error("PayProp isn't connected here.");
          const owing = a.tenants.filter((t) => !t.tenancyStart || t.tenancyStart <= today);
          return { tenants: owing.length, owed: owing.reduce((n, t) => n + t.owed, 0), largest: a.largest };
        }))
      : Promise.resolve({ ok: false as const, error: "Rent arrears are for the business owners." }),
  ]);

  return NextResponse.json({ ok: true, at: new Date().toISOString(), properties, maintenance, inspections, reviews, compliance, applications, lettings, arrears });
}
