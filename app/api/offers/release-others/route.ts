import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { closedReasons, getApplicationById, getApplications } from "@/lib/applications";
import { decisionsFor, isDecisionRef } from "@/lib/offer-decisions";
import { dealForApplication } from "@/lib/application-journey";
import { feeOf, otherOpenOffers, releaseOthers } from "@/lib/offer-hold";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * GET  /api/offers/release-others?application=<id>
 *        -> { fee, offers }   the other offers held on that home
 * POST /api/offers/release-others { applicationId, refs? }
 *        -> declines them here and puts a "not this one" with the agent
 *
 * Only once the accepted tenant's holding fee is settled in Propoly (9 Oct
 * 2026, James: hold the others until the deposit is paid). Nothing reaches
 * the tenants by itself; the agent sends each one from the update. See
 * lib/offer-hold.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function load(req: NextRequest, applicationId: string) {
  const who = await whoIs(req).catch(() => null);
  const me = who?.actor ?? null;
  if (!me) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  const app = await getApplicationById(applicationId).catch(() => null);
  if (!app || !app.listingId) return { error: NextResponse.json({ ok: false, error: "That application isn't there." }, { status: 404 }) };
  /* An agent acts on their own applications, as the journey route decides. */
  if (!can(me.role, "staff:internal") && app.agent && app.agent.trim().toLowerCase() !== (me.name ?? "").trim().toLowerCase()) {
    return { error: NextResponse.json({ ok: false, error: `That application is ${app.agent.split(/\s+/)[0]}'s.` }, { status: 403 }) };
  }
  const accepted =
    app.status === "accepted" || (await decisionsFor([`rex:${app.id}`]).catch(() => new Map())).get(`rex:${app.id}`)?.decision === "accepted";
  if (!accepted) return { error: NextResponse.json({ ok: false, error: "This offer hasn't been accepted." }, { status: 409 }) };
  const listingId = String(app.listingId);
  const [deal, all] = await Promise.all([dealForApplication(app).catch(() => null), getApplications(300)]);
  /* closedReasons reads each listing's state from REX: only this home's. */
  const here = all.filter((a) => String(a.listingId ?? "") === listingId);
  const closed = await closedReasons(here).catch(() => new Map<string, string>());
  const offers = await otherOpenOffers(listingId, `rex:${app.id}`, here, closed);
  return { me, app, listingId, fee: feeOf(deal), offers };
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("application") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which application?" }, { status: 400 });
  const r = await load(req, id);
  if ("error" in r) return r.error;
  return NextResponse.json({ ok: true, fee: r.fee, offers: r.offers.map((o) => ({ ref: o.ref, name: o.name, amount: o.amount, people: o.people.length })) });
}

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { applicationId?: unknown; refs?: unknown };
  const id = typeof b.applicationId === "string" ? b.applicationId : "";
  if (!id) return NextResponse.json({ ok: false, error: "Which application?" }, { status: 400 });
  const r = await load(req, id);
  if ("error" in r) return r.error;
  if (!r.fee.settled) {
    return NextResponse.json({ ok: false, error: "The holding fee isn't paid yet, so the other offers are still held." }, { status: 409 });
  }
  const picked = Array.isArray(b.refs) ? new Set(b.refs.filter(isDecisionRef)) : null;
  const offers = picked ? r.offers.filter((o) => picked.has(o.ref)) : r.offers;
  if (!offers.length) return NextResponse.json({ ok: false, error: "No other offers are waiting on this home." }, { status: 409 });
  try {
    const done = await releaseOthers({
      accepted: r.app,
      listingId: r.listingId,
      offers,
      by: { name: r.me.name || r.me.email, email: r.me.email },
      paidAt: r.fee.paidAt,
    });
    return NextResponse.json({ ok: true, declined: done.declined, updateId: done.update?.id ?? null });
  } catch (e) {
    console.error("release others failed", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
