import { NextResponse } from "next/server";
import { readPresentation, presentationExpiry } from "@/lib/present-store";
import { SAMPLE_DECK, deckKind } from "@/lib/present";
import { canBePack, packData, packHtml } from "@/lib/pre-pack";
import { withPlayableVideo } from "@/lib/present-video";

/**
 * The pre-appraisal pack, as the landlord opens it (Claude Design, 23 Oct
 * 2026). /present/<token> sends a pre-appraisal here once it has a booked
 * time; everything about who may see it is the same as there - the token is
 * the credential, a bad one is a plain 404, an expired one goes back to
 * /present/<token> to be told so and tidied away.
 *
 * `sample` is the showroom copy: no customer data, no answers saved, no opens.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  /* A landlord's pack must not be framed by another site. */
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const back = new URL(`/present/${encodeURIComponent(token)}`, req.url);

  if (token === "sample") {
    const deck = { ...SAMPLE_DECK, kind: "pre-appraisal" as const, createdAt: new Date().toISOString() };
    return new NextResponse(packHtml(packData(deck, null)), { headers: HEADERS });
  }

  const row = await readPresentation(token);
  if (!row) return new NextResponse("Not found", { status: 404 });
  /* Anything this page shouldn't draw goes back to the deck page, which knows
     how to say "expired", show a long deck, or draw the brochure. */
  if ((await presentationExpiry(row)).getTime() < Date.now()) return NextResponse.redirect(back);
  if (deckKind(row.deck) !== "pre-appraisal" || row.deck.look === "house" || !canBePack(row.deck)) return NextResponse.redirect(back);

  /* Slide 2's thumbnail is a frame of the video itself (Flow's "thumbnail" is a
     still of the screen recording, not the camera). */
  const deck = await withPlayableVideo(row.deck);
  return new NextResponse(packHtml(packData(deck, row.token)), { headers: HEADERS });
}
