"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "How it works", on the screen a back office walkthrough is about: a link to
 * that walkthrough in the Showroom (lib/showroom/back-office), where it can be
 * read as a guide or clicked through as a live demo. James, 7 Oct 2026: "if I
 * can't find it, it's not relevant" - so the guide sits on the screen it
 * teaches, not only in the Showroom.
 *
 * Hidden inside the Showroom's own demo of the same screen, where it would be
 * a link back to the page you are already on.
 */
export default function WalkthroughLink({ step, way, className = "" }: { step: string; way?: string; className?: string }) {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try { setFramed(window.parent !== window); } catch { setFramed(true); }
  }, []);
  if (framed) return null;
  return (
    <Link
      href={`/showroom?side=backoffice&step=${encodeURIComponent(step)}${way ? `&way=${encodeURIComponent(way)}` : ""}`}
      className={`flex items-center gap-1.5 rounded-full border border-line/80 px-4 py-2.5 text-[13px] text-muted transition-colors hover:text-ink ${className}`}
    >
      <DoodleIcon name="magic-wand" size={14} className="text-accent-dark" /> How it works
    </Link>
  );
}
