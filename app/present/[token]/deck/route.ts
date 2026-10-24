import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { readPresentation, presentationExpiry } from "@/lib/present-store";
import { deckKind } from "@/lib/present";
import { appraisalForRef, deckData, deckHtml, firmFigures, sampleDeck } from "@/lib/appraisal-deck";

/**
 * The appraisal presentation, as the agent shows it on the day and the
 * landlord opens it afterwards (Claude Design, 23 Oct 2026). /present/<token>
 * sends an appraisal deck here; who may see it is the same as there and as
 * the pre-appraisal pack (../pack) - the token is the credential, a bad one is
 * a plain 404, an expired one goes back to /present/<token> to be told so and
 * tidied away, and any other kind of deck goes back to be drawn as before.
 *
 * Staff signed in on this browser get "Let's get it on the market" wired to
 * the appraisal's Terms of Business; anyone else gets the agent's contact.
 *
 * `sample` is the showroom copy: no customer data, no opens, nothing sent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* The company figure is read live, capped at six seconds. */
export const maxDuration = 30;

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  /* A landlord's deck must not be framed by another site. */
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

async function staffOn(req: NextRequest): Promise<boolean> {
  const viewer = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!viewer) return false;
  return Boolean(await findUserById(viewer).catch(() => null));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const back = new URL(`/present/${encodeURIComponent(token)}`, publicOrigin(req));

  if (token === "sample") {
    const deck = sampleDeck();
    const [firm, staff] = await Promise.all([firmFigures(), staffOn(req)]);
    /* No customer data in it, so the showroom may frame it from our own origin. */
    return new NextResponse(deckHtml(deckData(deck, null, { firm, staff, sample: true })), {
      headers: { ...HEADERS, "x-frame-options": "SAMEORIGIN" },
    });
  }

  const row = await readPresentation(token);
  if (!row) return new NextResponse("Not found", { status: 404 });
  if ((await presentationExpiry(row)).getTime() < Date.now()) return NextResponse.redirect(back);
  if (deckKind(row.deck) !== "appraisal") return NextResponse.redirect(back);

  const deck = row.deck;
  const [firm, staff, appraisal] = await Promise.all([
    firmFigures(),
    staffOn(req),
    appraisalForRef(row.ref),
  ]);
  return new NextResponse(deckHtml(deckData(deck, row.token, { firm, staff, appraisal })), { headers: HEADERS });
}
