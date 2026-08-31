"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PresentationBuilder from "@/components/PresentationBuilder";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { DECK_KINDS, type DeckKind } from "@/lib/present";

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
  /* WHICH DECK. Absent means the appraisal deck - the one this wizard was
     built for and the only one anybody reached it by before now. The
     post-appraisal card links here with ?kind=post-appraisal.

     Validated against the list rather than cast: this decides which slides a
     landlord ends up seeing, and a typo in a URL must not quietly mint the
     wrong deck. */
  const asked = useSearchParams().get("kind");
  const kind: DeckKind = DECK_KINDS.some((k) => k.id === asked)
    ? (asked as DeckKind)
    : "appraisal";

  /* THE RECORD IS FETCHED, NOT LOOKED UP IN AN ARRAY. The four hardcoded
     appraisals are gone — see lib/market-appraisal — so this page asks the
     store like every other appraisal screen.

     `undefined` while asking, `null` once we have looked and found nothing.
     Collapsing the two would flash "No such appraisal" at an agent whose
     record is a round-trip away, which is the worst possible first frame on
     the screen they open in a landlord's hallway. */
  const [ma, setMa] = useState<MarketAppraisal | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    fetch("/api/appraisals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gone) return;
        const list: MarketAppraisal[] = Array.isArray(j?.appraisals) ? j.appraisals : [];
        setMa(list.find((m) => m.id === id) ?? null);
      })
      .catch(() => !gone && setMa(null));
    return () => {
      gone = true;
    };
  }, [id]);

  if (ma === undefined) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-[12.5px] text-muted">Finding the appraisal&hellip;</p>
      </div>
    );
  }

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
      kind={kind}
      appraisal={ma}
      fullPage
      backHref={`/market-appraisals?open=${ma.id}`}
    />
  );
}
