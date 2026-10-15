import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { fillOfferPerson, offerPersonByToken } from "@/lib/offer-people";
import { cleanPerson, missingFrom } from "@/lib/offer-people-shape";
import { jsonObject } from "@/lib/json-body";
import { SCOTLAND } from "@/lib/passport-shape";

/**
 * ONE ADULT'S PART OF AN OFFER, BY THEIR OWN LINK (James, 14 Oct 2026).
 *
 *   GET  -> who it is for, the home, who made the offer, and anything already filled in
 *   POST { answers } -> their part, saved against the offer
 *
 * No account and no session: the token is the key, sent by the lead tenant
 * or the agent to this one person, and it opens this one part only. Nothing
 * else about the offer, the lead or the home is given out. An agent signed in
 * to the OS who fills it in is recorded as having done it for them.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = await offerPersonByToken(token);
  if (!p) return NextResponse.json({ ok: false, error: "That link isn't right, or the offer has gone." }, { status: 404 });
  return NextResponse.json(
    /* A Scottish home asks no Right to rent, and shows none back (lib/passport-scotland). */
    { ok: true, name: p.name, leadName: p.leadName, property: p.property, filled: p.filled, scottish: p.scottish, answers: p.scottish ? { ...p.answers, hasBritishPassport: null, shareCode: "" } : p.answers },
    { headers: { "cache-control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = await offerPersonByToken(token);
  if (!p) return NextResponse.json({ ok: false, error: "That link isn't right, or the offer has gone." }, { status: 404 });
  const b = (await jsonObject(req)) as Record<string, unknown>;
  const sent = cleanPerson(b.answers);
  /* Scotland: never asked, so whatever was stored before is kept, not blanked. */
  const answers = p.scottish ? { ...sent, hasBritishPassport: p.answers.hasBritishPassport, shareCode: p.answers.shareCode } : sent;
  const gaps = missingFrom(answers, p.scottish ? SCOTLAND : {});
  if (gaps.length) return NextResponse.json({ ok: false, error: `Still needed: ${gaps.join(", ")}.` }, { status: 400 });
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  const saved = await fillOfferPerson(token, answers, actor ? { kind: "agent", name: actor.name || actor.email } : { kind: "self", name: answers.name });
  if (!saved) return NextResponse.json({ ok: false, error: "That didn't save. Try again in a minute." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
