"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NewListingPanel from "@/components/listing/NewListingPanel";
import { useSaveReporter } from "@/components/SaveChip";
import type { MarketAppraisal, ServiceLevel } from "@/lib/market-appraisal";

/**
 * THE LISTING, FROM THE APPRAISAL FILE (Howard, 1 Oct 2026).
 *
 * "Write the description on the listing opens Listings but doesn't open MY
 * listing" - the link handed the property id to ?open=, which takes a listing
 * id, so the board opened with nothing on it. And: "I'm not sure if it's
 * possible to list the property from here, but it would make sense."
 *
 * So once the terms are signed the file carries one listing button:
 *
 *   - a listing exists on this home: Open the listing, straight onto its
 *     Marketing view, where the description is written;
 *   - none yet: Create the listing, the same panel as Listings > Add, opened
 *     here with the home, the agreed rent and the service already filled in.
 *     Nothing new reaches the records system - it is the existing create,
 *     with its existing switches, and nothing happens until they press it.
 */

/* The appraisal speaks Propoly's service levels; the listing speaks the
   records system's. */
const LISTING_SERVICE: Record<ServiceLevel, string> = {
  full_managed: "managed",
  rent_collect: "rent_collect",
  tenant_find: "let_only",
};

export default function ListingAction({
  ma,
  className,
  onLinked,
}: {
  ma: MarketAppraisal;
  className: string;
  /** The new listing's home, kept on the appraisal when it had none. */
  onLinked?: (next: MarketAppraisal) => void;
}) {
  const router = useRouter();
  const reporter = useSaveReporter();
  const [adding, setAdding] = useState(false);

  if (ma.listingId) {
    return (
      <Link href={`/listings?open=${encodeURIComponent(ma.listingId)}&tab=marketing`} className={className}>
        Open the listing <span aria-hidden>→</span>
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAdding(true)} className={className}>
        Create the listing <span aria-hidden>→</span>
      </button>
      {/* Portalled: the Next up card clips and transforms, which would trap a
          fixed panel inside the card. */}
      {adding && createPortal(
        <NewListingPanel
          prefill={{
            propertyId: ma.rexPropertyId,
            address: [ma.address, ma.postcode && !ma.address.toUpperCase().includes(ma.postcode.toUpperCase()) ? ma.postcode : ""]
              .filter(Boolean)
              .join(", "),
            rent: ma.valuation,
            serviceLevel: ma.serviceLevel ? LISTING_SERVICE[ma.serviceLevel] : null,
          }}
          onClose={() => setAdding(false)}
          onCreated={async (listingId, propertyId) => {
            /* The home the listing went on is this appraisal's home from now
               on, so the file finds the listing next time it is opened. */
            if (!ma.rexPropertyId && propertyId) {
              const settle = reporter.begin("Property record");
              const j = await fetch("/api/appraisals", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: ma.id, rexPropertyId: propertyId }),
              })
                .then((r) => r.json() as Promise<{ appraisal?: MarketAppraisal; error?: string }>)
                .catch(() => ({ appraisal: undefined, error: "That didn't save - the connection dropped." }));
              if (j.appraisal) {
                settle({ ok: true });
                onLinked?.(j.appraisal);
              } else settle({ ok: false, problem: j.error ?? "That didn't save." });
            }
            setAdding(false);
            router.push(`/listings?open=${encodeURIComponent(listingId)}&tab=marketing`);
          }}
        />,
        document.body
      )}
    </>
  );
}
