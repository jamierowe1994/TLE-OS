"use client";

import { use } from "react";
import Link from "next/link";
import PresentationBuilder from "@/components/PresentationBuilder";
import { SAMPLE_APPRAISALS } from "@/lib/market-appraisal";

/**
 * Building a presentation is a FULL PAGE, not a modal.
 *
 * It started as a pop-out and that was the wrong shape. This is the most
 * intensive screen an agent touches: property material info, everything on the
 * market with photographs, everything recently let, area statistics, then
 * choosing sections and ordering them. A modal caps that at whatever fits
 * above the fold and makes every table scroll inside a box inside a box.
 *
 * It is also going to grow — example brochures, comparable photography, market
 * commentary — and a modal that grows becomes a page badly. Better a page now
 * than a modal apologising for itself later.
 *
 * The URL matters too: /market-appraisals/<id>/build is somewhere an agent can
 * come back to, bookmark, or be sent. A modal has no address.
 */
export default function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ma = SAMPLE_APPRAISALS.find((m) => m.id === id);

  if (!ma) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">No such appraisal</p>
        <p className="mt-2 text-[12.5px] text-muted">
          It may have been removed, or the link is wrong.
        </p>
        <Link href="/market-appraisals" className="mt-4 inline-block text-[12.5px] underline">
          Back to Market Appraisals
        </Link>
      </div>
    );
  }

  return (
    <PresentationBuilder
      address={ma.address}
      postcode={ma.postcode}
      landlord={ma.landlord}
      refId={ma.leadId ?? ma.id}
      fullPage
      backHref={`/market-appraisals?open=${ma.id}`}
    />
  );
}
