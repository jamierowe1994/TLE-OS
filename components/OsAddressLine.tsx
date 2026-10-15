"use client";
import { useEffect, useState } from "react";

/**
 * The address the OS holds for a home, when somebody has changed it in the
 * OS (lib/os-property-address, 15 Oct 2026) - shown under the address the
 * page reads from the listings system, so nobody wonders which is right.
 * Nothing at all when the OS holds none.
 */
export default function OsAddressLine({ propertyId, shown }: { propertyId: string | null | undefined; shown: string }) {
  const [held, setHeld] = useState<{ address: string; setBy: string; setAt: string } | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    let live = true;
    fetch(`/api/homes/os-address?property=${encodeURIComponent(String(propertyId))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && j.address) setHeld(j.address); })
      .catch(() => { /* the page's own address still stands */ });
    return () => { live = false; };
  }, [propertyId]);
  if (!held) return null;
  const same = held.address.replace(/\W/g, "").toLowerCase() === shown.replace(/\W/g, "").toLowerCase();
  if (same) return null;
  const when = new Date(held.setAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  return (
    <p className="mt-1 text-[12px] leading-relaxed text-muted" data-steve="home.os-address">
      <span className="font-semibold text-ink">Address in the OS:</span> {held.address}
      <span> · changed by {held.setBy || "someone"} on {when}. Change it on the back-office record too.</span>
    </p>
  );
}
