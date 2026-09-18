import "server-only";
import type { Stop } from "@/lib/landlord-journey";
import { findUserById } from "@/lib/users";
import { completeness, type PassportData } from "@/lib/passport-shape";
import type { PassportRecord } from "@/lib/passport";
import { tenantDealViews, tenantPassport, type TenantAccount, type TenantDealView } from "@/lib/tenant-account";
import { STAGE_UPDATE, fillUpdate, findingRoad, isStage, type TenantStageKey } from "@/lib/tenant-journey";
import { homeOnMarket, homesOnMarket } from "@/lib/tenant-homes";
import { latestEnquiry, originFromPassport } from "@/lib/tenant-find";
import { milesBetween, type MarketHome } from "@/lib/market-homes";

/**
 * Everything the tenant's home needs, in one shape, from what we actually
 * hold: their passport (always, for anyone who came in through one) and
 * their Propoly deal if they have one. Nothing is invented: where there is
 * no tenancy yet the property card says so and the next step is finding
 * one, and the tiles say what they will show once there is.
 */

/** A home they have asked about, or are viewing, or have offered on: the
 *  property before it is a deal. */
export type TenantProperty = {
  property: string;
  locality: string;
  rentPcm: number | null;
  beds: number | null;
  photo: string | null;
  /** Where it opens: its page on Find a home, inside the portal. */
  href: string | null;
};

export type TenantHome = {
  first: string;
  daypart: string;
  /** Where they are (lib/tenant-journey). Decides the shape of the home and
   *  which pages are open. */
  stage: TenantStageKey;
  /** Before a deal: the home they enquired about, if any, and when. */
  enquiry: (TenantProperty & { enquiredOn: string | null }) | null;
  /** Their viewing on it: booked, or done and waiting for their thoughts. */
  viewing: { when: string; withName: string; status: "booked" | "done" } | null;
  /** Their offer on it. */
  offer: { amount: number; madeOn: string; status: "with_landlord" | "accepted" } | null;
  /** What else the agent has on the market, for the finding phase. */
  market: TenantProperty[];
  agent: { name: string; email: string | null; phone: string | null; photo: string | null } | null;
  deal: TenantDealView | null;
  passport: { record: PassportRecord | null; path: string | null; done: number; total: number; data: PassportData | null };
  next: { title: string; blurb: string; cta: string; href: string };
  stops: Stop[];
  activity: { label: string; sub: string; when: string; tone: "done" | "live" | "quiet" }[];
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export async function loadTenantHome(me: TenantAccount): Promise<TenantHome> {
  const [deals, record] = await Promise.all([tenantDealViews(me).catch(() => []), tenantPassport(me.email)]);
  const deal = deals[0] ?? null;
  const data = record?.data ?? null;
  const { done, total } = data ? completeness(data) : { done: 0, total: 6 };
  const first = me.name.split(/\s+/)[0] || me.name;
  /* Before a deal: the home they asked about, from the portal or from
     Rightmove and the rest (os_leads). Nearly everybody has one on day one,
     which is what ticks Find a home off (James, 18 Sep 2026). */
  const asked = deal ? null : await latestEnquiry(me.email).catch(() => null);
  const stage: TenantStageKey = deal ? stageOf(deal) : asked ? "enquired" : "passport";
  const [askedHome, market, origin] = deal
    ? [null, null, null]
    : await Promise.all([
        asked ? homeOnMarket(asked.listingId).catch(() => null) : Promise.resolve(null),
        homesOnMarket().catch(() => null),
        originFromPassport(record).catch(() => null),
      ]);
  const enquiry: TenantHome["enquiry"] = asked
    ? askedHome
      ? { ...property(askedHome), enquiredOn: asked.at }
      : { property: asked.address.split(",")[0] || "The home you asked about", locality: asked.address.split(",").slice(1).join(",").trim(), rentPcm: null, beds: null, photo: null, href: null, enquiredOn: asked.at }
    : null;

  /* Their agent: the deal's, or the one who issued the passport. */
  let agent: TenantHome["agent"] = null;
  if (deal?.agent.name) agent = { name: deal.agent.name, email: deal.agent.email, phone: null, photo: null };
  else if (record?.agentId) {
    const u = await findUserById(record.agentId).catch(() => null);
    if (u) agent = { name: u.name, email: u.email, phone: null, photo: u.photo };
  }

  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }));
  const daypart = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const passportPath = record ? `/tenant/passport/${record.token}` : null;

  /* The one next step. */
  let next: TenantHome["next"];
  if (!deal && enquiry) {
    const u = STAGE_UPDATE.enquired;
    next = {
      title: u.title,
      blurb: fillUpdate(u.blurb, { property: enquiry.property, agent: agent?.name ?? null }) || "We have your enquiry and will come back to you with times to view.",
      cta: enquiry.href ? "See the home" : "See other homes",
      href: enquiry.href ?? "/tenant/homes",
    };
  } else if (deal) {
    const label = deal.stages.find((s) => s.state === "current")?.label ?? "Your tenancy";
    next = { title: label, blurb: deal.next, cta: "See your tenancy", href: "/tenant/tenancy" };
  } else if (data && done < total) {
    next = { title: "Finish your passport", blurb: `${total - done} of ${total} sections still to do. It is reused for every application, so it is worth finishing.`, cta: "Open my passport", href: passportPath ?? "/tenant" };
  } else {
    next = { title: "Find your next home", blurb: "Your passport is ready. When you apply for a property with us, your tenancy appears here and this page fills in around it.", cta: "See properties to rent", href: "/tenant/homes" };
  }

  /* The spine. With a deal, its eight stages; without, the road to one
     (lib/tenant-journey findingRoad). */
  const stops: Stop[] = deal
    ? deal.stages.map((s) => ({ id: s.key, label: s.label, sub: s.key === "move_day" && deal.moveIn ? day(deal.moveIn) : "", state: s.state }))
    : findingRoad(stage, { home: enquiry?.property ?? null });

  /* What else is on: the nearest to their house, else the newest. */
  const near = (h: MarketHome) => (origin && h.lat != null && h.lng != null ? milesBetween(origin, { lat: h.lat, lng: h.lng }) : 1e9);
  const others = market && market.ok ? market.homes.filter((h) => h.id !== askedHome?.id) : [];
  const onMarket = (origin ? [...others].sort((x, y) => near(x) - near(y)) : others).slice(0, 3).map(property);

  const activity: TenantHome["activity"] = [];
  if (asked) activity.push({ label: `You asked about ${enquiry?.property ?? "a home"}`, sub: asked.via === "portal" ? "From Find a home" : "Your enquiry", when: day(asked.at), tone: "done" });
  if (me.activatedAt) activity.push({ label: "Your tenant area opened", sub: "Welcome in", when: day(me.activatedAt), tone: "done" });
  if (record?.submittedAt) activity.push({ label: "Passport finished", sub: `${total} of ${total} sections`, when: day(record.submittedAt), tone: "done" });
  if (record?.createdAt) activity.push({ label: "Passport started", sub: record.agentId ? "From your agent's invite" : "", when: day(record.createdAt), tone: "quiet" });
  if (deal) activity.unshift({ label: deal.now, sub: deal.property, when: "", tone: "live" });

  return {
    first,
    daypart,
    stage,
    /* The enquiry is read (above); viewings and offers are not yet read
       for a signed-in tenant. The sample (lib/tenant-sample) shows every stage. */
    enquiry,
    viewing: null,
    offer: null,
    market: onMarket,
    agent,
    deal,
    passport: { record, path: passportPath, done, total, data },
    next,
    stops,
    activity: activity.slice(0, 4),
  };
}

/** The stage from the deal: its key, or living once move-in day has passed;
 *  no deal is the passport stage. */
function stageOf(deal: TenantDealView | null): TenantStageKey {
  if (!deal) return "passport";
  if (deal.stageKey === "move_day" && deal.moveIn && new Date(deal.moveIn).getTime() < Date.now() - 24 * 3600 * 1000) return "living";
  return isStage(deal.stageKey) ? deal.stageKey : "deal_started";
}

/** Just the stage, for the shell, which decides the nav from it. */
export async function tenantStage(me: TenantAccount): Promise<TenantStageKey> {
  const deals = await tenantDealViews(me).catch(() => []);
  return stageOf(deals[0] ?? null);
}

/** A home on the market as the home page's cards draw it. */
function property(h: MarketHome): TenantProperty {
  return { property: h.name, locality: h.locality, rentPcm: h.rentPeriod === "month" ? h.rent : null, beds: h.beds, photo: h.photo, href: `/tenant/homes/${h.id}` };
}
