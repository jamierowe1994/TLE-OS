import { notFound } from "next/navigation";
import PrepareAndSend, { type SendSubject } from "@/components/appraisal/PrepareAndSend";
import PageHeader from "@/components/PageHeader";
import { getAppraisal } from "@/lib/appraisal-store";
import { presentationsFor } from "@/lib/present-store";
import { SERVICE_LEVELS } from "@/lib/market-appraisal";
import type { PresentDeck } from "@/lib/present";

/**
 * The screen an agent uses to send a contract, and the only place the deck is
 * seen by anyone at The Letting Experts before the landlord sees it.
 *
 * A PAGE rather than a card on the file, for the same reason the builder is
 * one: it carries a full booklet the agent has to turn through, and a card
 * that has to hold a booklet is a card apologising for itself. It also has an
 * address, so a colleague can be sent to it.
 *
 * Read on the server because the deck lives in the database as JSON and there
 * is no endpoint that hands one out - nor should there be, since a deck is a
 * landlord's rent, their address and their comparables.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SendTermsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ma = await getAppraisal(id);
  if (!ma) notFound();

  /**
   * BOTH REFERENCES, not just the one we mint against today.
   *
   * New decks hang off the LEAD where there is one (NextUp mints against
   * `leadId ?? id`), but decks made before a lead was attached - and every
   * deck on an appraisal that never had one - sit under the appraisal's own
   * id. Asking for only one of the two shows an agent "there is no deck on
   * this file" over a file that has one, which is the sort of wrong that gets
   * a second deck built.
   */
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const rows = (await Promise.all(refs.map((r) => presentationsFor(r)))).flat();
  const post = rows.filter((r) => r.kind === "post-appraisal").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
  const deck = (post?.deck as PresentDeck | undefined) ?? null;

  const subject: SendSubject = {
    id: ma.id,
    landlord: ma.landlord,
    landlordEmail: ma.landlordEmail ?? null,
    address: ma.address,
    postcode: ma.postcode ?? null,
    agent: ma.agent ?? null,
    valuation: ma.valuation ?? null,
    serviceLabel: SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel)?.label ?? null,
    feePct: ma.feePct ?? null,
    setupFee: ma.setupFee ?? null,
    valuedAt: ma.valuedAt ?? null,
    appointmentAt: ma.appointmentAt ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prepare and send"
        blurb={`Check the presentation as ${ma.landlord} will read it, sign your half of the terms, then send it.`}
      />
      <PrepareAndSend ma={subject} deck={deck} />
    </div>
  );
}
