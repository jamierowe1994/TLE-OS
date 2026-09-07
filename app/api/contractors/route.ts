import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { listContractors, getContractor, saveContractor, contractorStats, contractorsFor, placeContractor, listOrders, getOrder, type Contractor } from "@/lib/works-orders";
import { geocode } from "@/lib/geocode";

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
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
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
    if (!c || (c.ownerId && c.ownerId !== me.id)) return NextResponse.json({ ok: false, error: "Not in your book." }, { status: 404 });
    const [stats, orders] = await Promise.all([contractorStats(id), listOrders({ limit: 500 })]);
    return NextResponse.json({ ok: true, contractor: c, stats, jobs: orders.filter((o) => o.contractorId === id) });
  }
  return NextResponse.json({ ok: true, contractors: await listContractors(me.id), me: me.id, canCorporate: can(actor.role, "see:business") });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const me = subject ?? actor;
  const b = (await req.json().catch(() => null)) as (Partial<Contractor> & { scope?: "mine" | "corporate" }) | null;
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
    const ownerId = b.id ? (await getContractor(b.id))!.ownerId : wantsCorporate ? null : me.id;
    const contractor = await saveContractor({ ...b, name: b.name, trade: b.trade, ownerId: b.id && corporate && b.scope ? (wantsCorporate ? null : me.id) : ownerId }, me.name || me.email);
    /* Place them from their address, so the picker can say how far. Best
       effort, after the save. */
    if (contractor.address) {
      geocode(contractor.address).then((g) => { if (g.ok) return placeContractor(contractor.id, g.at.lat, g.at.lng); }).catch(() => {});
    }
    return NextResponse.json({ ok: true, contractor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not save." }, { status: 400 });
  }
}
