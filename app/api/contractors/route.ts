import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { listContractors, getContractor, saveContractor, contractorStats, contractorsFor, placeContractor, listOrders, getOrder, setContractorLogo, type Contractor } from "@/lib/works-orders";
import { geocode } from "@/lib/geocode";
import { findLogo, websiteUrl } from "@/lib/contractor-logo";
import { scopeJobs, statsOf } from "@/lib/contractor-scope";

/**
 * The trades book, two shelves: the company's contractors, which everyone
 * can use, and this person's own (James, 7 Sep 2026). A profile carries
 * the firm, the person, the trade, phone, email, website, address, the
 * registration and notes - and, read off the jobs, what they have done
 * for us and what is owed.
 *
 * GET               → both shelves, marked whose.
 * GET ?id=          → one profile with its jobs and money.
 * POST              → add or edit. Anyone may keep their own; only somebody
 *                     with see:business may put one on the company shelf or
 *                     edit a company one. You cannot edit another agent's.
 * POST { id, action: "refresh_logo" } → read their logo off the website again.
 *
 * The jobs on a profile are this person's own unless they are the office
 * (James, 21 Oct 2026, lib/contractor-scope), and the money is counted over
 * the jobs shown, so an agent never learns a colleague's spend that way.
 *
 * Their logo (James, 21 Oct 2026): a website saved with no logo yet, or a
 * website changed, is read for one (lib/contractor-logo). After the save,
 * at most six seconds, and a failed read leaves the save as it was.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  const { actor, subject } = who;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, contractors: [], me: null });
  const me = subject ?? actor;
  const forJob = req.nextUrl.searchParams.get("for");
  if (forJob) {
    const found = await getOrder(forJob);
    if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
    return NextResponse.json({ ok: true, ranked: await contractorsFor(found.order, me.id), placed: found.order.propertyLat != null });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const c = await getContractor(id);
    /* The office sees every agent's book (James, 19 Oct 2026); an agent only their own and the company's. */
    if (!c) return NextResponse.json({ ok: false, error: "No such contractor." }, { status: 404 });
    if (c.ownerId && c.ownerId !== me.id && !can(me.role, "see:everything")) return NextResponse.json({ ok: false, error: "This contractor is in another agent's book, so only they and the office can open their record." }, { status: 404 });
    const [allStats, orders] = await Promise.all([contractorStats(id), listOrders({ limit: 500 })]);
    const scoped = await scopeJobs(req, who, orders.filter((o) => o.contractorId === id));
    return NextResponse.json({ ok: true, contractor: c, stats: scoped.everyone ? allStats : statsOf(scoped.orders), jobs: scoped.orders, everyone: scoped.everyone, mineJobs: scoped.mine });
  }
  return NextResponse.json({ ok: true, contractors: await listContractors(me.id), me: me.id, canCorporate: can(actor.role, "see:business") });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const me = subject ?? actor;
  const b = (await req.json().catch(() => null)) as (Partial<Contractor> & { scope?: "mine" | "corporate"; action?: string }) | null;
  /* Refresh logo, from the profile. Anyone who may open the record may ask:
     it only reads their own website again. */
  if (b?.action === "refresh_logo" && b.id) {
    const cur = await getContractor(b.id);
    if (!cur || (cur.ownerId && cur.ownerId !== me.id && !can(me.role, "see:everything"))) return NextResponse.json({ ok: false, error: "No such contractor." }, { status: 404 });
    if (!websiteUrl(cur.website)) return NextResponse.json({ ok: false, error: "Add their website first, and the logo is read from it." }, { status: 400 });
    const logo = await findLogo(cur.website).catch(() => null);
    if (!logo) return NextResponse.json({ ok: false, error: "Their website didn't offer a logo we could use." }, { status: 404 });
    await setContractorLogo(cur.id, logo);
    return NextResponse.json({ ok: true, contractor: { ...cur, logoUrl: logo } });
  }
  if (!b?.name?.trim() || !b.trade?.trim()) return NextResponse.json({ ok: false, error: "A contractor needs a name and a trade." }, { status: 400 });
  const corporate = can(actor.role, "see:business");
  try {
    if (b.id) {
      const cur = await getContractor(b.id);
      if (!cur) return NextResponse.json({ ok: false, error: "No such contractor." }, { status: 404 });
      if (cur.ownerId && cur.ownerId !== me.id) return NextResponse.json({ ok: false, error: "That contractor is in somebody else's book." }, { status: 403 });
      if (!cur.ownerId && !corporate) return NextResponse.json({ ok: false, error: "Company contractors are kept by the office. Add your own copy instead." }, { status: 403 });
    }
    const wantsCorporate = b.scope === "corporate";
    if (wantsCorporate && !corporate) return NextResponse.json({ ok: false, error: "Only the office can put a contractor on the company shelf." }, { status: 403 });
    const before = b.id ? await getContractor(b.id) : null;
    const ownerId = b.id ? before!.ownerId : wantsCorporate ? null : me.id;
    let contractor = await saveContractor({ ...b, name: b.name, trade: b.trade, ownerId: b.id && corporate && b.scope ? (wantsCorporate ? null : me.id) : ownerId }, me.name || me.email);
    /* Place them from their address, so the picker can say how far. Best
       effort, after the save. */
    if (contractor.address) {
      const placed = contractor;
      geocode(placed.address).then((g) => { if (g.ok) return placeContractor(placed.id, g.at.lat, g.at.lng); }).catch(() => {});
    }
    /* Their logo, off the website: when there is none yet, or the website
       has changed. Never holds the save up past the read's own six seconds,
       and a failure is no logo, not an error. */
    const siteChanged = Boolean(before && websiteUrl(before.website) !== websiteUrl(contractor.website));
    if (websiteUrl(contractor.website) && (!contractor.logoUrl || siteChanged)) {
      const logo = await findLogo(contractor.website).catch(() => null);
      if (logo || siteChanged) {
        await setContractorLogo(contractor.id, logo ?? "").catch(() => {});
        contractor = { ...contractor, logoUrl: logo ?? "" };
      }
    } else if (!websiteUrl(contractor.website) && contractor.logoUrl && siteChanged) {
      await setContractorLogo(contractor.id, "").catch(() => {});
      contractor = { ...contractor, logoUrl: "" };
    }
    return NextResponse.json({ ok: true, contractor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not save.") }, { status: 400 });
  }
}
