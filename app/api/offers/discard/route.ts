import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { mayDecideRexApp, mayOfferOn } from "@/lib/offer-access";
import { hasDb, q } from "@/lib/db";
import { decisionsFor, isDecisionRef } from "@/lib/offer-decisions";
import { recordDiscard } from "@/lib/offer-discards";
import { offerPhones, personKeys } from "@/lib/offer-repeat";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST /api/offers/discard { ref, listingId, duplicateOf, name }
 *
 * Takes a duplicate offer off the listing's Offers (James, 29 Oct 2026,
 * lib/offer-discards). Nobody is emailed. Refused on an offer accepted here,
 * and on an OS offer that isn't the same person as the one it is said to
 * repeat. Nothing is written to REX: a REX application discarded here is
 * only hidden from the listing in the OS.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OsRow = { id: string; email: string; name: string; listing_id: string | null; payload: Record<string, unknown> };

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

  const b = (await req.json().catch(() => ({}))) as { ref?: unknown; listingId?: unknown; duplicateOf?: unknown; name?: unknown };
  if (!isDecisionRef(b.ref)) return NextResponse.json({ ok: false, error: "Which offer?" }, { status: 400 });
  const ref = b.ref;
  const duplicateOf = isDecisionRef(b.duplicateOf) ? b.duplicateOf : null;
  if (!duplicateOf || duplicateOf === ref) return NextResponse.json({ ok: false, error: "Only a second offer from the same person can be discarded." }, { status: 400 });
  let listingId: string | null = /^-?\d{1,12}$/.test(String(b.listingId ?? "")) ? String(b.listingId) : null;
  let name = String(b.name ?? "").trim().slice(0, 200);

  /* Both made in the OS: the listing and the person are read from the offers
     themselves, not taken from the page. */
  const osIds = [ref, duplicateOf].filter((r) => r.startsWith("os:")).map((r) => r.slice(3));
  const rows = osIds.length
    ? await q<OsRow>(`SELECT id, email, name, listing_id, payload FROM os_tenant_viewing_responses WHERE kind = 'offer' AND id = ANY($1::text[])`, [osIds]).catch(() => [] as OsRow[])
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (ref.startsWith("os:")) {
    const mine = byId.get(ref.slice(3));
    if (!mine) return NextResponse.json({ ok: false, error: "That offer isn't there any more." }, { status: 404 });
    listingId = mine.listing_id;
    name = mine.name || mine.email;
  }
  if (ref.startsWith("os:") && duplicateOf.startsWith("os:")) {
    const a = byId.get(ref.slice(3));
    const k = byId.get(duplicateOf.slice(3));
    const keys = (r: OsRow) => [...personKeys(r.email, null), ...offerPhones(r.payload).map((p) => `p:${p}`)];
    const same = a && k && a.listing_id === k.listing_id && keys(a).some((x) => keys(k).includes(x));
    if (!same) return NextResponse.json({ ok: false, error: "These two offers aren't from the same person, so decline it instead." }, { status: 409 });
  }
  if (!listingId) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });

  const mine = ref.startsWith("os:") ? await mayOfferOn(req, who, listingId) : await mayDecideRexApp(req, who, ref.slice(4)).catch(() => false);
  if (!mine) return NextResponse.json({ ok: false, error: "That offer isn't on your book." }, { status: 403 });

  const decided = (await decisionsFor([ref]).catch(() => new Map())).get(ref);
  if (decided?.decision === "accepted") return NextResponse.json({ ok: false, error: "This one is accepted. Undo the accept first." }, { status: 409 });

  try {
    await recordDiscard({ ref, listingId, name: name || "Applicant", duplicateOf, by: { name: actor.name || actor.email, email: actor.email } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("discard offer failed", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
