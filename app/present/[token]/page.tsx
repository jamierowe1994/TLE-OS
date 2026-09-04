import { notFound } from "next/navigation";
import { readPresentation } from "@/lib/present-store";
import { SAMPLE_DECK, DECK_KINDS, asStyle, slidesFor } from "@/lib/present";
import StylePicker from "@/components/StylePicker";
import PresentDeck from "@/components/PresentDeck";

/**
 * The landlord's copy.
 *
 * Public by necessity — they have no account, and they will open this on a
 * phone, from a mail client, quite possibly after forwarding it to whoever
 * else owns the property. The token is the credential; what it protects is
 * one visit's worth of detail (see lib/present-store.ts).
 *
 * A bad token gets a plain 404, not "no such presentation". Confirming that a
 * token is merely wrong rather than unknown is free information to anyone
 * trying them, and there is nothing useful to say to a real landlord who has
 * mangled a link anyway — they will ring the agent, which is the right
 * outcome.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PresentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ kind?: string; style?: string }>;
}) {
  const { token } = await params;

  /* The showroom copy. Reserved word, no customer data in it, and the only
     way an agent can look at the deck before sending their first one. It is
     also what renders on a machine with no database.

     ?kind= SWITCHES WHICH OF THE THREE IS SHOWN, and it earns its keep: the
     decks differ only by which slides they are made of, so the sample is the
     only way to see that difference without minting three real decks against
     a real landlord's address. /present/sample?kind=appraisal is what to open
     when reviewing the comparables and market slides — the pre-appraisal deck
     deliberately carries neither. */
  if (token === "sample") {
    const { kind, style } = await searchParams;
    const asked = DECK_KINDS.find((k) => k.id === kind)?.id ?? "pre-appraisal";
    /* ?style= SWITCHES THE LOOK, and the picker below makes it clickable.
       James, 4 Sep: the team are split on the drawn style, so rather than
       argue it they get all three side by side and choose. The picker is on
       the SAMPLE only - a landlord opening a real deck sees the one look the
       agent sent, with no controls on it. */
    const chosen = asStyle(style);
    const deck = { ...SAMPLE_DECK, kind: asked, style: chosen };
    return (
      <>
        <PresentDeck token="sample" deck={deck} slides={slidesFor(deck)} />
        <StylePicker kind={asked} style={chosen} />
      </>
    );
  }

  const row = await readPresentation(token);
  if (!row) notFound();

  return <PresentDeck token={row.token} deck={row.deck} slides={slidesFor(row.deck)} />;
}
