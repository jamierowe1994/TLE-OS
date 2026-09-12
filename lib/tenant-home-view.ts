import "server-only";
import type { Stop } from "@/lib/landlord-journey";
import { findUserById } from "@/lib/users";
import { completeness, type PassportData } from "@/lib/passport-shape";
import type { PassportRecord } from "@/lib/passport";
import { tenantDealViews, tenantPassport, type TenantAccount, type TenantDealView } from "@/lib/tenant-account";

/**
 * Everything the tenant's home needs, in one shape, from what we actually
 * hold: their passport (always, for anyone who came in through one) and
 * their Propoly deal if they have one. Nothing is invented: where there is
 * no tenancy yet the property card says so and the next step is finding
 * one, and the tiles say what they will show once there is.
 */

export type TenantHome = {
  first: string;
  daypart: string;
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
  if (deal) {
    const label = deal.stages.find((s) => s.state === "current")?.label ?? "Your tenancy";
    next = { title: label, blurb: deal.next, cta: "See your tenancy", href: "/tenant/tenancy" };
  } else if (data && done < total) {
    next = { title: "Finish your passport", blurb: `${total - done} of ${total} sections still to do. It is reused for every application, so it is worth finishing.`, cta: "Open my passport", href: passportPath ?? "/tenant" };
  } else {
    next = { title: "Find your next home", blurb: "Your passport is ready. When you apply for a property with us, your tenancy appears here and this page fills in around it.", cta: "See properties to rent", href: "https://thelettingexperts.co.uk" };
  }

  /* The spine. With a deal, its eight stages; without, the road to one. */
  const stops: Stop[] = deal
    ? deal.stages.map((s) => ({ id: s.key, label: s.label, sub: s.key === "move_day" && deal.moveIn ? day(deal.moveIn) : "", state: s.state }))
    : [
        { id: "passport", label: "Passport", sub: done === total ? "Complete" : `${done} of ${total}`, state: done === total ? "done" : "current" },
        { id: "find", label: "Find a home", sub: "Book viewings", state: done === total ? "current" : "upcoming" },
        { id: "apply", label: "Apply", sub: "One tap", state: "upcoming" },
        { id: "referencing", label: "Referencing", sub: "", state: "upcoming" },
        { id: "sign", label: "Sign", sub: "", state: "upcoming" },
        { id: "move", label: "Move in", sub: "", state: "upcoming" },
      ];

  const activity: TenantHome["activity"] = [];
  if (me.activatedAt) activity.push({ label: "Your tenant area opened", sub: "Welcome in", when: day(me.activatedAt), tone: "done" });
  if (record?.submittedAt) activity.push({ label: "Passport finished", sub: `${total} of ${total} sections`, when: day(record.submittedAt), tone: "done" });
  if (record?.createdAt) activity.push({ label: "Passport started", sub: record.agentId ? "From your agent's invite" : "", when: day(record.createdAt), tone: "quiet" });
  if (deal) activity.unshift({ label: deal.now, sub: deal.property, when: "", tone: "live" });

  return {
    first,
    daypart,
    agent,
    deal,
    passport: { record, path: passportPath, done, total, data },
    next,
    stops,
    activity: activity.slice(0, 4),
  };
}
