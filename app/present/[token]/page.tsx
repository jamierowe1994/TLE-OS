import { notFound } from "next/navigation";
import { readPresentation } from "@/lib/present-store";
import { SAMPLE_DECK, slidesFor } from "@/lib/present";
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
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  /* The showroom copy. Reserved word, no customer data in it, and the only
     way an agent can look at the deck before sending their first one. It is
     also what renders on a machine with no database. */
  if (token === "sample") {
    return <PresentDeck token="sample" deck={SAMPLE_DECK} slides={slidesFor(SAMPLE_DECK)} />;
  }

  const row = await readPresentation(token);
  if (!row) notFound();

  return <PresentDeck token={row.token} deck={row.deck} slides={slidesFor(row.deck)} />;
}
