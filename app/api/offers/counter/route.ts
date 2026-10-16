import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { mayDecideRexApp, mayOfferOn } from "@/lib/offer-access";
import { getApplicationById } from "@/lib/applications";
import { hasDb, q } from "@/lib/db";
import { addCounter, isCounterRef, removeLatestCounter, type CounterSide } from "@/lib/offer-counters";
import { homeOnMarket } from "@/lib/tenant-homes";
import { testListing } from "@/lib/test-overlay";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST /api/offers/counter
 *   { ref, side: "landlord" | "tenant", amount, moveIn?, note? }   a counter
 *   { ref, remove: <counter id> }                                  take back the newest
 *
 * The back-and-forth on an offer (James, 16 Oct 2026, lib/offer-counters).
 * The agent keys in each round for whichever side made it. Only an open offer
 * can be countered; Accept then takes the newest figure as the agreed one.
 *
 * The rent cap is the law (Renters' Rights Act): a counter can never go above
 * the advertised rent, the same rule as the offer itself (lib/agent-offer).
 * Nothing is sent to the tenant or the landlord from here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const who = await whoIs(req).catch(() => null);
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { ref?: unknown; side?: unknown; amount?: unknown; moveIn?: unknown; note?: unknown; remove?: unknown };
  if (!isCounterRef(b.ref)) return NextResponse.json({ ok: false, error: "Which offer?" }, { status: 400 });
  const ref = b.ref;

  /* The offer, where it is, and whether it is still open. */
  let listingId: string | null = null;
  let open = true;
  let asking: number | null = null;
  let mine = false;
  if (ref.startsWith("os:")) {
    const row = await q<{ listing_id: string | null }>(`SELECT listing_id FROM os_tenant_viewing_responses WHERE id = $1 AND kind = 'offer'`, [ref.slice(3)]).catch(() => []);
    if (!row[0]) return NextResponse.json({ ok: false, error: "That offer isn't there any more." }, { status: 404 });
    listingId = row[0].listing_id;
    mine = await mayOfferOn(req, who, listingId);
  } else if (ref.startsWith("rex:")) {
    const app = await getApplicationById(ref.slice(4)).catch(() => null);
    if (!app) return NextResponse.json({ ok: false, error: "That offer isn't there any more." }, { status: 404 });
    listingId = app.listingId != null ? String(app.listingId) : null;
    if (app.status === "accepted" || app.status === "unsuccessful") open = false;
    mine = await mayDecideRexApp(req, who, ref.slice(4)).catch(() => false);
  } else {
    const row = await q<{ payload: { listingId?: number; status?: string } }>(
      `SELECT payload FROM os_test_records WHERE kind = 'offer' AND payload->>'appId' = $1 LIMIT 1`,
      [ref.slice(5)]
    ).catch(() => []);
    if (!row[0]) return NextResponse.json({ ok: false, error: "That test offer isn't there any more." }, { status: 404 });
    listingId = row[0].payload.listingId != null ? String(row[0].payload.listingId) : null;
    if (row[0].payload.status === "accepted" || row[0].payload.status === "unsuccessful") open = false;
    mine = await mayOfferOn(req, who, listingId);
    if (listingId) asking = (await testListing(listingId).catch(() => null))?.rent || null;
  }
  if (!mine) return NextResponse.json({ ok: false, error: "That offer isn't on your book." }, { status: 403 });
  if (!ref.startsWith("test:")) {
    const d = await q<{ decision: string }>(`SELECT decision FROM os_offer_decisions WHERE ref = $1`, [ref]).catch(() => []);
    if (d[0]) open = false;
  }
  if (!open) return NextResponse.json({ ok: false, error: "This offer has already been decided. Undo the decision first to counter it." }, { status: 409 });

  const by = { name: actor.name || actor.email, email: actor.email };

  if (typeof b.remove === "string") {
    const done = await removeLatestCounter(ref, b.remove).catch(() => false);
    if (!done) return NextResponse.json({ ok: false, error: "Only the newest counter can be taken back." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const side: CounterSide | null = b.side === "landlord" || b.side === "tenant" ? b.side : null;
  if (!side) return NextResponse.json({ ok: false, error: "Who is countering, the landlord or the tenant?" }, { status: 400 });
  const amount = Math.round(Number(String(b.amount ?? "").replace(/[£,\s]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: "Put in the rent for the counter." }, { status: 400 });
  const moveIn = typeof b.moveIn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.moveIn) ? b.moveIn : null;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) || null : null;

  /* The advertised rent, read again here: the cap is the law. */
  if (asking == null && listingId && !ref.startsWith("test:")) {
    const home = await homeOnMarket(listingId).catch(() => null);
    if (home) asking = (home.rentPeriod === "month" ? home.rent : home.rentPcm) || null;
  }
  if (asking && amount > asking) {
    return NextResponse.json(
      { ok: false, error: `The advertised rent is ${gbp(asking)} a month. The law doesn't allow agreeing more than the advertised rent, so a counter can't go above it.` },
      { status: 400 }
    );
  }

  try {
    const counter = await addCounter({ ref, listingId, side, amount, moveIn, note, by });
    return NextResponse.json({ ok: true, counter });
  } catch (e) {
    console.error("offer counter failed", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
