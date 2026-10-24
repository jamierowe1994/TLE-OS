import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordHome, requiredDocsFor } from "@/lib/landlord-home-view";
import { fileData, fileHtml } from "@/lib/landlord-file";

/**
 * A signed-in landlord's file in the new design (Claude Design, 24 Oct 2026).
 * Not linked from anywhere yet: /landlord stays the landlord's page until
 * James swaps them. The same view the current page reads (lib/landlord-home-view),
 * the same ?p= to pick a property; signing goes to the current page's contract.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.redirect(new URL("/landlord/sign-in", publicOrigin(req)));
  const { view, open, first } = await loadLandlordHome(me, req.nextUrl.searchParams.get("p"));
  /* No open appraisal (only managed homes, or nothing yet): the current page handles those. */
  if (!view || !open[0]) return NextResponse.redirect(new URL("/landlord", publicOrigin(req)));
  const appraisal = open[0].appraisal;
  const asked = (await requiredDocsFor(appraisal.id)).map((r) => ({ kind: String(r.kind), title: r.title }));
  /* The Plan reads the deck sent after the visit. Its figure and the agent's words come from it when it
     has them, else from the newest of this appraisal's decks that does (the appraisal deck, usually). */
  const shown = view.presentation ?? null;
  const words = open[0].decks.find((r) => r.deck.figure || r.deck.loves?.length || r.deck.fixes?.length)?.deck ?? null;
  const deck = shown
    ? { ...shown, figure: shown.figure ?? words?.figure ?? null, loves: shown.loves?.length ? shown.loves : words?.loves ?? null, fixes: shown.fixes?.length ? shown.fixes : words?.fixes ?? null }
    : null;
  const d = fileData({ view, first, full: me.name, appraisal, deck, asked });
  return new NextResponse(fileHtml(d), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer" },
  });
}
