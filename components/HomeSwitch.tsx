"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HomeLinks } from "@/lib/home-links-match";

/**
 * Listing · Managed home · Let in progress - one home's records, side by side
 * (Michael and Lianna, team call 29 Oct 2026; matching in lib/home-links).
 *
 * At the head of a listing's page and a home's page. The page you are on is
 * the lit one; the others are links, and only the ones that exist are drawn.
 * Nothing at all when this is the home's only record.
 */

type Kind = "listing" | "home" | "let";
const LABEL: Record<Kind, string> = { listing: "Listing", home: "Managed home", let: "Let in progress" };

export default function HomeSwitch({
  from,
  listingId,
  propertyId,
  address,
  className = "",
}: {
  from: "listing" | "home";
  listingId: string;
  propertyId: string | null | undefined;
  address: string;
  className?: string;
}) {
  const [links, setLinks] = useState<HomeLinks | null>(null);
  useEffect(() => {
    let live = true;
    setLinks(null);
    const sp = new URLSearchParams({ from, listing: listingId, address });
    if (propertyId) sp.set("property", propertyId);
    fetch(`/api/home-links?${sp}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: HomeLinks & { ok?: boolean }) => live && j.ok && setLinks({ listing: j.listing, home: j.home, let: j.let }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [from, listingId, propertyId, address]);

  if (!links || !(links.listing || links.home || links.let)) return null;
  const order: Kind[] = ["listing", "home", "let"];
  return (
    <nav aria-label="This home's records" className={`inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-box p-1 ${className}`}>
      {order.map((k) => {
        if (k === from) {
          return (
            <span key={k} aria-current="page" className="rounded-full bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-sm">
              {LABEL[k]}
            </span>
          );
        }
        const l = links[k];
        if (!l) return null;
        return (
          <Link key={k} href={l.href} title={l.hint ?? undefined} className="rounded-full px-3.5 py-1.5 text-[12.5px] text-muted transition-colors hover:text-ink">
            {LABEL[k]} <span aria-hidden>→</span>
          </Link>
        );
      })}
    </nav>
  );
}
