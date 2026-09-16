import { NextResponse } from "next/server";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordDocuments } from "@/lib/landlord-documents-view";
import { HANDOFF_MINUTES, mintHandoff } from "@/lib/doc-handoff";
import { hasDb } from "@/lib/db";

/**
 * "Send it from your phone": the desktop asks for a code.
 *
 * Signed in, always - the QR is minted FOR the person at the keyboard, and a
 * route that would mint one for anybody who asked is a route that hands out
 * upload rights to a stranger's file. Everything the token can then do is
 * bounded in lib/doc-handoff; this only decides whose it is.
 *
 * The token comes back once and is never readable again. Pressing the button
 * twice mints a second code rather than showing the first, which is also the
 * reason a code cannot be "revoked" from the screen: it simply runs out.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const docs = await loadLandlordDocuments(me);
  const minted = await mintHandoff(me.id, docs.appraisalId);
  if (!minted) return NextResponse.json({ ok: false, error: "Could not make a code. Try again." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    /* A PATH, not a URL. The origin is whatever the phone's browser is given
       by the QR, and that is drawn on the client from window.location - so a
       preview, a branch deploy and production each hand out their own host
       without this route having to be told what it is. */
    path: `/send/${minted.token}`,
    expiresAt: minted.expiresAt,
    minutes: HANDOFF_MINUTES,
  });
}
