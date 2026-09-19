import { notFound } from "next/navigation";
import { readPresentation, presentationExpiry } from "@/lib/present-store";
import { SAMPLE_DECK, DECK_KINDS, slidesFor } from "@/lib/present";
import PrintDeck from "@/components/PrintDeck";

/**
 * THE PRESENTATION AS A PDF (James and Susan, 19 Sep 2026: "download it and
 * have that ready for the appointment"). Every slide at the landlord's own
 * 1280 x 800, one to a page, and the browser's Save as PDF opens once the
 * photographs have loaded - so the file is the deck exactly, and needs no
 * PDF engine on the server.
 *
 * Same credential as the deck itself, the token, and the same fortnight: an
 * expired link prints nothing. No opens are counted from here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PrintPresentation({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { token } = await params;
  if (token === "sample") {
    const { kind } = await searchParams;
    const asked = DECK_KINDS.find((k) => k.id === kind)?.id ?? "post-appraisal";
    const deck = { ...SAMPLE_DECK, kind: asked };
    return <PrintDeck deck={deck} slides={slidesFor(deck)} name="Sample presentation" />;
  }

  const row = await readPresentation(token);
  if (!row) notFound();
  if ((await presentationExpiry(row)).getTime() < Date.now()) notFound();

  /* A video cannot play on paper, and the builder's ticks are the builder's. */
  const deck = { ...row.deck, welcomeVideo: null, builder: null, terms: row.deck.terms ? { ...row.deck.terms, signUrl: null } : row.deck.terms };
  const label = DECK_KINDS.find((k) => k.id === deck.kind)?.label ?? "Presentation";
  return <PrintDeck deck={deck} slides={slidesFor(deck)} name={`${label} - ${deck.property?.address ?? ""}`.replace(/ - $/, "")} />;
}
