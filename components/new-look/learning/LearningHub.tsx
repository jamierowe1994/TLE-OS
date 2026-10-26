"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import { STEPS_FOR } from "@/lib/showroom/content";

/**
 * Tools > Learning (James, 26 Oct 2026): two ways in. Guides, the library of
 * Francesca's documents, and Systems, a tour of the OS from every side, "so
 * rather than me having to train them on every single thing, they can just go
 * into tools and see."
 */

const stops = STEPS_FOR.tenant.length + STEPS_FOR.landlord.length + STEPS_FOR.agent.length;

export function Back({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="nl-lr-back">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {label}
    </Link>
  );
}

export default function LearningHub() {
  const [guides, setGuides] = useState<number | null | "error">(null);
  useEffect(() => {
    let gone = false;
    fetch("/api/tools/learning/guides", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { guides?: unknown[] }) => !gone && setGuides(Array.isArray(j.guides) ? j.guides.length : "error"))
      .catch(() => !gone && setGuides("error"));
    return () => {
      gone = true;
    };
  }, []);

  return (
    <div data-look="new" className="nl-page nl-rise nl-lr">
      <Back href="/tools" label="Tools" />
      <Mast title="Learning" blurb="The guides worth reading, and the whole system from every side. Dip in whenever you need it." />
      <div className="nl-lr-doors">
        <Link href="/tools/learning/guides" className="nl-lr-door is-guides" style={{ animationDelay: "80ms" }}>
          <span className="nl-lr-door-art" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 5.5c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5z" />
              <path d="M19.5 5.5c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5z" />
            </svg>
          </span>
          <span className="nl-lr-door-text">
            <span className="nl-lr-door-kicker">
              {guides === null ? <span className="nl-lr-spin" aria-label="Counting" /> : guides === "error" || guides === 0 ? "The library" : `${guides} guides`}
            </span>
            <span className="nl-lr-door-name">Guides</span>
            <span className="nl-lr-door-blurb">Every guide, checklist and playbook we have: for you, for landlords and for tenants, England, Wales and Scotland.</span>
            <span className="nl-lr-door-go">Open the guides <Arrow /></span>
          </span>
        </Link>
        <Link href="/tools/learning/systems" className="nl-lr-door is-systems" style={{ animationDelay: "160ms" }}>
          <span className="nl-lr-door-art" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4.5" width="18" height="12" rx="2" />
              <path d="M8.5 20h7M12 16.5V20" />
            </svg>
          </span>
          <span className="nl-lr-door-text">
            <span className="nl-lr-door-kicker">{stops} stops</span>
            <span className="nl-lr-door-name">Systems</span>
            <span className="nl-lr-door-blurb">A tour of the system: what the tenant and the landlord see, the emails they get, and what you press to set it off.</span>
            <span className="nl-lr-door-go">Take the tour <Arrow /></span>
          </span>
        </Link>
      </div>
    </div>
  );
}

export function Arrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
