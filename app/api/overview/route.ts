import { NextRequest, NextResponse } from "next/server";
import { activity } from "@/lib/activity";
import { stageCounts, type StageListing } from "@/lib/listing-stages";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { getComplianceBook } from "@/lib/compliance-cache";
import { dueWithin, type CompProperty } from "@/lib/compliance";
import { getArrears, payPropProblem } from "@/lib/business/payprop-income";
import { payPropConfigured } from "@/lib/business/payprop";
import { GET as portfolioGET } from "@/app/api/portfolio/route";
import { GET as worksGET } from "@/app/api/works-orders/route";
import { GET as inspectionsGET } from "@/app/api/inspections/route";
import { GET as reviewsGET } from "@/app/api/tenancy-reviews/route";
import { GET as moveOutsGET } from "@/app/api/move-outs/route";
import { GET as applicationsGET } from "@/app/api/applications/route";
import { GET as listingsGET } from "@/app/api/listings/route";
import { grantWholeBusiness } from "@/lib/scope";
import { seesWholeOverview } from "@/lib/overview-access";
import { readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";

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
 *
 * WHO SEES WHAT (James, 2 Oct 2026): the whole business is Michael's - he
 * keeps track of compliance across every home - and the owners'. Everybody
 * else's Overview is their own homes (lib/overview-access). Maintenance and
 * compliance are company-wide on their own screens, so for an own-homes
 * board they are cut down here to the homes in the person's book.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Json = Record<string, unknown>;
type Tile<T> = { ok: true; data: T } | { ok: false; error: string };

/** Call another screen's GET as the same person, and read its JSON. */
async function read(handler: (r: NextRequest) => Promise<Response>, req: NextRequest, path: string, whole: boolean): Promise<Json> {
  const sub = new NextRequest(new URL(path, req.url), { headers: req.headers });
  if (whole) grantWholeBusiness(sub);
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
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const today = todayLondon();
  const money = can(actor.role, "see:business") && !viewingAs;
  /* An owner viewing as somebody sees THEIR Overview, so the grant follows
     the person being viewed - and a view-as of someone with no account
     (the REX id on the cookie) is never widened. */
  const viewAsCookie = actor.role === "owner" && !!readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  const whole = viewingAs ? !!subject && (await seesWholeOverview(subject)) : !viewAsCookie && (await seesWholeOverview(actor));
  const get = (h: (r: NextRequest) => Promise<Response>, path: string) => read(h, req, path, whole);

  /* The person's own homes, for cutting the company-wide tiles down. */
  const portfolio = get(portfolioGET, "/api/portfolio");
  const mine: Promise<Set<string> | null> = whole
    ? Promise.resolve(null)
    : portfolio.then((j) => new Set(((Array.isArray(j.properties) ? j.properties : []) as { propertyId: string | null }[]).map((p) => String(p.propertyId ?? "")).filter(Boolean)));

  const [properties, maintenance, inspections, reviews, moveOuts, compliance, applications, lettings, arrears] = await Promise.all([
    settle(portfolio.then((j) => {
      const c = (j.counts ?? {}) as Json;
      return {
        /* REX PM's own count of managed homes once its list is read (rooms let
           separately each count), else the book's. */
        managed: Number(c.homes ?? c.properties ?? 0),
        occupied: c.homes != null ? Number(c.homesOccupied ?? 0) : null,
        vacant: c.homes != null ? Number(c.homesVacant ?? 0) : null,
        upcoming: c.homes != null ? Number(c.upcomingVacancies ?? 0) : null,
        avgRent: Number(c.avgRent ?? 0),
        landlords: Number(c.landlords ?? 0),
        rentRoll: Number(c.managedRentRoll ?? 0),
        ageMs: typeof j.ageMs === "number" ? j.ageMs : null,
      };
    })),

    settle(Promise.all([get(worksGET, "/api/works-orders?open=1"), mine]).then(([j, homes]) => {
      const s = (j.summary ?? {}) as Json;
      const ours = (id: string | null) => !homes || (!!id && homes.has(id));
      const carried = ((Array.isArray(j.carried) ? j.carried : []) as { propertyId: string | null; followUpOn: string | null; overdue: boolean; title: string; propertyName: string; dueOn: string | null }[]).filter((c) => ours(c.propertyId));
      const orders = ((Array.isArray(j.orders) ? j.orders : []) as { propertyId: string | null; dueAt: string | null; urgency: string | null; rehearsal?: boolean }[]).filter((o) => !o.rehearsal && ours(o.propertyId));
      const now = Date.now();
      return {
        open: homes ? orders.length + carried.length : Number(s.open ?? 0),
        overdue: homes ? orders.filter((o) => o.dueAt && Date.parse(o.dueAt) < now).length + carried.filter((c) => c.overdue).length : Number(s.overdue ?? 0),
        emergencies: homes ? orders.filter((o) => o.urgency === "emergency").length : Number(s.emergencies ?? 0),
        followUp: carried.filter((c) => c.followUpOn && c.followUpOn <= today).length,
        late: carried.filter((c) => c.overdue).slice(0, 3).map((c) => ({ title: c.title, where: c.propertyName, dueOn: c.dueOn })),
        partial: typeof j.carriedError === "string" ? j.carriedError : null,
      };
    })),

    settle(get(inspectionsGET, "/api/inspections").then((j) => {
      const s = (j.summary ?? {}) as Json;
      if (typeof j.bookError === "string") throw new Error(j.bookError);
      return { due: Number(s.due ?? 0), overdue: Number(s.overdue ?? 0), booked: Number(s.booked ?? 0), awaitingTenant: Number(s.awaitingTenant ?? 0) };
    })),

    settle(get(reviewsGET, "/api/tenancy-reviews").then((j) => {
      const s = (j.summary ?? {}) as Json;
      const due = (Array.isArray(j.due) ? j.due : []) as { why: string; propertyName: string; agreement: string }[];
      const notice = due.filter((d) => /notice/i.test(d.why));
      return {
        due: Number(s.due ?? 0), overdue: Number(s.overdue ?? 0), doneThisMonth: Number(s.doneThisMonth ?? 0),
        noticeServed: notice.length,
        leaving: notice.slice(0, 3).map((d) => ({ where: d.propertyName, agreement: d.agreement })),
      };
    })),

    /* Upcoming vacancies is the Move-outs screen's own list (2 Oct 2026). */
    settle(get(moveOutsGET, "/api/move-outs").then((j) => {
      const s = (j.summary ?? {}) as Json;
      const open = (Array.isArray(j.open) ? j.open : []) as { propertyName: string; moveOutOn: string | null; daysAway: number | null }[];
      return {
        open: Number(s.open ?? 0), overdue: Number(s.overdue ?? 0), next30: Number(s.next30 ?? 0), followUp: Number(s.followUp ?? 0),
        next: open.filter((m) => m.daysAway !== null && m.daysAway >= 0).slice(0, 3).map((m) => ({ where: m.propertyName, on: m.moveOutOn })),
      };
    })),

    /* The compliance book is whole-business and the slowest read in the OS;
       it is cached, and the tile uses the Compliance screen's own rule. */
    settle(Promise.all([getComplianceBook(), mine]).then(([{ book, ageMs }, homes]) => {
      const seen = new Set<string>();
      const props = (book.properties as CompProperty[]).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)) && (!homes || homes.has(String(p.id))));
      const due = dueWithin(30, props);
      const expired = due.filter((d) => d.status === "expired");
      return {
        expired: expired.length,
        dueSoon: due.length - expired.length,
        homesAffected: new Set(expired.map((d) => d.p.id)).size,
        ageMs: typeof ageMs === "number" ? ageMs : null,
      };
    })),

    settle(get(applicationsGET, "/api/applications").then((j) => {
      const apps = (Array.isArray(j.applications) ? j.applications : []) as { status: string; closed: unknown; startDate: string | null }[];
      const open = apps.filter((a) => !a.closed && /^(received|communicated)$/i.test(a.status));
      const movingIn = apps.filter((a) => !a.closed && /^accepted$/i.test(a.status) && (a.startDate ?? "") >= today);
      return { open: open.length, movingIn: movingIn.length };
    })),

    /* On the market, let agreed and drafts by the one rule every screen uses
       (lib/listing-stages, Rig run 3, P-026). Let agreed counted only the
       published ones here, and drafts counted the 140-odd filed away. */
    settle(Promise.all([get(listingsGET, "/api/listings?tests=0"), activity().catch(() => null)]).then(([j, act]) => {
      const ls = (Array.isArray(j.listings) ? j.listings : []) as StageListing[];
      return stageCounts(ls, new Set(act?.accepted ?? []));
    })),

    /* Money is Susan's and the owners' (see:business). Anyone else sees the
       tile say so rather than a number they are not meant to have. */
    money
      ? settle(getArrears().then((a) => {
          /* Null is "not read yet" or "PayProp failed", not only "not set up"
             (Rig run 3, P-022): say which. */
          if (!a) {
            throw new Error(
              !payPropConfigured()
                ? "PayProp isn't connected here."
                : (payPropProblem() ?? "Still reading arrears from PayProp. Try again in a minute.")
            );
          }
          const owing = a.tenants.filter((t) => !t.tenancyStart || t.tenancyStart <= today);
          return { tenants: owing.length, owed: owing.reduce((n, t) => n + t.owed, 0), largest: a.largest };
        }))
      : Promise.resolve({ ok: false as const, error: "Rent arrears are for the business owners." }),
  ]);

  const label = whole ? "the whole business" : ((subject ?? actor).name || "your homes");
  return NextResponse.json({ ok: true, at: new Date().toISOString(), scope: { whole, label }, properties, maintenance, inspections, reviews, moveOuts, compliance, applications, lettings, arrears });
}
