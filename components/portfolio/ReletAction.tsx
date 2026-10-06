"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import NewListingPanel from "@/components/listing/NewListingPanel";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * RE-LET, FROM THE PORTFOLIO (6 Oct 2026).
 *
 * At the demo Lianna had a home coming up for relet and wanted to put it on
 * "so she didn't have to duplicate it across the system". James: "is there a
 * way of taking that from my portfolio, changing it back to a relet, and
 * restarting the process as a listing?"
 *
 * This is that. The same Add a new listing panel as Listings, opened with the
 * home, its current rent and its service already filled in. It goes on the
 * SAME property record as the last let, so the home keeps one history: the
 * old listing stays let, a new one starts as a draft, and "Fill it in for me"
 * on the new listing reads the last advert's words (lib/listing-autofill,
 * previousListing). The create route refuses a second CURRENT listing on the
 * home and opens the one that is already there instead.
 */

/* Portfolio carries REX's service label; the listing speaks its ids. */
function serviceId(label: string | null): string | null {
  const s = (label ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("let only") || s.includes("tenant find") || s.includes("find only")) return "let_only";
  if (s.includes("rent")) return "rent_collect";
  return "managed";
}

export default function ReletAction({ home, className }: { home: ManagedProperty; className: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!home.propertyId) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Re-let this home <span aria-hidden>→</span>
      </button>
      {/* Portalled: the drawer transforms, which would trap a fixed panel. */}
      {open &&
        createPortal(
          <NewListingPanel
            heading="Re-let this home"
            prefill={{
              propertyId: home.propertyId,
              address: [home.address || home.name, home.postcode && !(home.address || home.name).toUpperCase().includes(home.postcode.toUpperCase()) ? home.postcode : ""]
                .filter(Boolean)
                .join(", "),
              rent: home.rentMonthly ?? null,
              serviceLevel: serviceId(home.service),
            }}
            onClose={() => setOpen(false)}
            onCreated={(listingId) => {
              setOpen(false);
              router.push(`/listings?open=${encodeURIComponent(listingId)}&tab=marketing`);
            }}
          />,
          document.body
        )}
    </>
  );
}
