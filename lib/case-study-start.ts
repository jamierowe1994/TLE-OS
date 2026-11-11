"use client";

import { toast } from "@/lib/toast";

/**
 * "Use as a case study" from any menu: starts one from the listing (or finds
 * the one already started) and opens it. Returns false when it couldn't, with
 * the reason already on a toast.
 */
export async function startCaseStudy(listingId: string | number, go: (href: string) => void): Promise<boolean> {
  toast("Starting the case study from the advert…");
  try {
    const res = await fetch("/api/case-studies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: String(listingId) }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; existed?: boolean; error?: string };
    if (!res.ok || !d.ok || !d.id) {
      toast(d.error ?? "The case study couldn't be started. Try again.", "bad");
      return false;
    }
    if (d.existed) toast("This home already has a case study. Opening it.");
    go(`/case-studies/${d.id}`);
    return true;
  } catch {
    toast("The case study couldn't be started. Check your connection and try again.", "bad");
    return false;
  }
}
