"use client";

import { use, useEffect, useState } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import PageHeader from "@/components/PageHeader";
import PrepareAndSend, { type SendSubject } from "@/components/appraisal/PrepareAndSend";
import { SERVICE_LEVELS, type MarketAppraisal } from "@/lib/market-appraisal";
import { SAMPLE_DECK, type PresentDeck } from "@/lib/present";

/**
 * Prepare and send for the valuation walkthrough. The real page
 * (app/(os)/market-appraisals/[id]/send) is a server page that reads the database,
 * so this is the same page put together in the browser: the appraisal from the
 * demo's book, and the sample deck (lib/present SAMPLE_DECK, Raj's) as the
 * post-appraisal with the figure on the file. The signing is the demo's stand-in
 * (components/landlord/DocusealEmbed); nothing is saved or sent.
 */
export default function DemoSend({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { id } = use(params);
  const [ma, setMa] = useState<MarketAppraisal | null>(null);
  useEffect(() => {
    fetch(`/api/appraisals/${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setMa(j.appraisal ?? null)).catch(() => setMa(null));
  }, [id]);

  const subject: SendSubject | null = ma && {
    id: ma.id, landlord: ma.landlord, landlordEmail: ma.landlordEmail ?? null, address: ma.address, postcode: ma.postcode ?? null, agent: ma.agent ?? null,
    valuation: ma.valuation ?? null, serviceLabel: SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel)?.label ?? null,
    feePct: ma.feePct ?? null, setupFee: ma.setupFee ?? null, valuedAt: ma.valuedAt ?? null, appointmentAt: ma.appointmentAt ?? null,
  };
  const deck: PresentDeck | null = ma && {
    ...SAMPLE_DECK,
    kind: "post-appraisal",
    recipientName: ma.landlord,
    property: { ...SAMPLE_DECK.property, address: ma.address, postcode: ma.postcode },
    valuation: { rent: ma.valuation ?? 0, serviceLevel: SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel)?.label ?? "", feePct: ma.feePct ?? 0, setupFee: ma.setupFee ?? 0, note: ma.valuationNote ?? "" },
  };

  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/market-appraisals">
        <div className="space-y-6">
          <PageHeader title="Prepare and send" blurb={`Check the presentation as ${ma?.landlord ?? "the landlord"} will read it, sign your half of the terms, then send it.`} />
          {subject && <PrepareAndSend ma={subject} deck={deck} />}
        </div>
      </OfficeFrame>
    </>
  );
}
