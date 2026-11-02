"use client";

import { useEffect, useState } from "react";

/** /api/business/listing-stages: null while reading. */
export type ListingStages = { ok: true; available: number; letAgreed: number; readAt: string } | { ok: false; error: string } | null;

/**
 * The whole business's Available and Let agreed, by the Listings board's own
 * rule (Susan, 2 Nov 2026: "We dont have 190 live listings and 54 forward
 * pipeline"). A stock, so read once, whatever month is picked. Overview and
 * Agents both read it, so the two tabs can never disagree.
 */
export function useListingStages(): ListingStages {
  const [stages, setStages] = useState<ListingStages>(null);
  useEffect(() => {
    let gone = false;
    const fail = "The Listings board couldn't be read just now.";
    fetch("/api/business/listing-stages", { cache: "no-store" })
      .then(async (r) => (await r.json()) as { ok?: boolean; error?: string; available?: number; letAgreed?: number; readAt?: string })
      .then((j) => {
        if (gone) return;
        if (j.ok && typeof j.available === "number" && typeof j.letAgreed === "number") {
          setStages({ ok: true, available: j.available, letAgreed: j.letAgreed, readAt: j.readAt ?? new Date().toISOString() });
        } else setStages({ ok: false, error: j.error ?? fail });
      })
      .catch(() => !gone && setStages({ ok: false, error: fail }));
    return () => {
      gone = true;
    };
  }, []);
  return stages;
}
