"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TakeOnWizard, { type TakeOnHome } from "@/components/portfolio/TakeOnWizard";

/**
 * The Management transfer tile on a home's page (lib/take-ons, 19 Oct 2026).
 * A home already taken on links to its take-on, with how far the onboarding
 * letters have got. Otherwise it offers to mark the home as one - only where
 * the home is missing its landlord or tenants, or the OS is its only record,
 * so it doesn't sit on six hundred homes that are long settled.
 */
type Found = { id: string; comms: { doneAt: string | null }[] } | null;

export default function TakeOnTile({ home, className, icon, text, disabled, offer }: {
  home: TakeOnHome;
  className: string;
  icon: React.ReactNode;
  text: (label: string, what: string) => React.ReactNode;
  disabled?: boolean;
  /** Offer to mark the home as a transfer when it isn't one. */
  offer: boolean;
}) {
  const [found, setFound] = useState<Found | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/take-ons?home=${encodeURIComponent(home.ref)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setFound(j?.ok ? j.takeOn ?? null : null); })
      .catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [home.ref]);

  if (found) {
    const done = found.comms.filter((c) => c.doneAt).length;
    return (
      <Link href={`/portfolio/take-on/${encodeURIComponent(found.id)}`} className={className}>
        {icon}
        {text("Management transfer", done === found.comms.length ? "Onboarding done" : `Onboarding: ${done} of ${found.comms.length} done`)}
      </Link>
    );
  }
  if (found === undefined || !offer) return null;
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={className}>
        {icon}
        {text("Management transfer", "Taken on already let: add the landlord and tenants")}
      </button>
      {open && <TakeOnWizard home={home} onClose={() => setOpen(false)} />}
    </>
  );
}
