"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HomeHero, TopBar } from "../bits";

/**
 * TOOLS (James, 3 Oct 2026): "a bunch of different tiles in there for
 * different tools" - each tile opens its own tool. Guides has its own place
 * (/agent/guides), so it is not here. Invoices and the rest come later.
 */

type Tile = { href: string; title: string; line: string; tone: "coral" | "pink" | "sage" | "card"; d: string };

const TILES: Tile[] = [
  { href: "/agent/tools/focus", title: "Focus Hour", line: "Heads down, alerts held.", tone: "coral", d: "M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 8v4.5l3 2" },
  { href: "/agent/tools/news", title: "News", line: "The team and the industry.", tone: "sage", d: "M5 5.5h11v13H6.5A1.5 1.5 0 0 1 5 17zM16 9h3v8a1.5 1.5 0 0 1-3 0M8 9h5M8 12h5M8 15h3" },
  { href: "/agent/tools/deposit", title: "Deposit Calculator", line: "The most a landlord can take.", tone: "pink", d: "M4.5 8.5h15v10h-15zM4.5 8.5l2-3h11l2 3M12 11.5v4M10 13.5h4" },
  { href: "/agent/tools/rent", title: "Rent Converter", line: "Month, week and year.", tone: "card", d: "M7 7h11l-3-3M17 17H6l3 3" },
];

const TONE: Record<Tile["tone"], { bg: string; ink: string; icon: string; iconInk: string; line: string }> = {
  coral: { bg: "var(--m-pink-grad)", ink: "#fff", icon: "rgba(255,255,255,0.22)", iconInk: "#fff", line: "rgba(255,255,255,0.9)" },
  pink: { bg: "var(--m-pink-wash)", ink: "var(--m-ink)", icon: "var(--m-card)", iconInk: "var(--m-coral)", line: "var(--m-muted)" },
  sage: { bg: "var(--m-green-wash)", ink: "var(--m-ink)", icon: "var(--m-card)", iconInk: "var(--m-sage-ink)", line: "var(--m-muted)" },
  card: { bg: "var(--m-card)", ink: "var(--m-ink)", icon: "var(--m-pink-wash)", iconInk: "var(--m-coral)", line: "var(--m-muted)" },
};

export default function PhoneTools() {
  /* A running Focus Hour shows on its tile. */
  const [until, setUntil] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    fetch("/api/m/focus", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { until?: string | null }) => setUntil(j.until ?? null))
      .catch(() => null);
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const left = until ? Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000)) : 0;

  return (
    <main>
      <TopBar />
      <HomeHero title="Tools" line="Handy bits for the working day." src="/illustrations/app/home-modern.webp" height={138} bottom={14} />

      <ul className="relative z-[1] -mt-5 grid grid-cols-2 gap-3">
        {TILES.map((t) => {
          const c = TONE[t.tone];
          const live = t.href.endsWith("/focus") && left > 0;
          return (
            <li key={t.href}>
              <Link data-morph href={t.href} className="m-press flex min-h-[172px] flex-col justify-between rounded-[26px] p-4 shadow-[0_14px_30px_-20px_rgba(120,60,40,0.55)]" style={{ background: c.bg, color: c.ink }}>
                <span className="flex items-start justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: c.icon, color: c.iconInk }}>
                    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={t.d} />
                    </svg>
                  </span>
                  <svg viewBox="0 0 24 24" aria-hidden className="mt-1 h-4 w-4 opacity-70">
                    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  <span className="m-title block text-[19px] leading-tight">{t.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug" style={{ color: c.line }}>
                    {live ? `Running · ${left} min left` : t.line}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
