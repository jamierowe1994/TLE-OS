"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import AlertsCard from "@/components/app/AlertsCard";
import StandaloneHint from "@/components/app/StandaloneHint";
import { TopBar } from "./bits";
import { todayLine, useHomeFigures, type Figure } from "./figures";

/**
 * HOME (3 Oct 2026), drawn from James's own pastel mockup - "my favourite is
 * probably the one on the left with the building": the greeting in Bricolage Grotesque
 * beside his painted street, a search across people and properties, four live
 * figures on pink and sage tiles, and today's line that opens Your Day.
 *
 * Every figure is the agent's own and live (./figures). A figure that cannot
 * be read shows a dash, and each tile opens where the number came from.
 */

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  return h < 12 ? "Good Morning," : h < 18 ? "Good Afternoon," : "Good Evening,";
}

export default function PhoneHome() {
  const f = useHomeFigures();
  const [first, setFirst] = useState("");
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user?: { name?: string } | null }) => setFirst((j.user?.name ?? "").split(/\s+/)[0] ?? ""))
      .catch(() => null);
  }, []);

  return (
    <main>
      <TopBar />

      {/* The greeting and the street. The painting runs off the right edge and
          the search card sits over its foot, as in the mockup. */}
      <section className="relative -mx-4 mt-2 h-[268px] overflow-hidden px-4">
        <img
          src="/illustrations/app/street-corner.webp"
          alt=""
          className="pointer-events-none absolute -right-16 top-0 h-[262px] w-auto max-w-none select-none"
          style={{ maskImage: "linear-gradient(to left, #000 70%, transparent 100%)", WebkitMaskImage: "linear-gradient(to left, #000 70%, transparent 100%)" }}
        />
        <div className="relative w-[56%] pt-4">
          <h1 className="m-title text-[38px] leading-[1.04]">
            {greeting()}
            <br />
            {first || " "}
          </h1>
          <p className="mt-3 max-w-[170px] text-[14px] leading-snug text-muted">Here&apos;s what&apos;s happening with your lettings today.</p>
        </div>
      </section>

      <Link
        href="/agent/search"
        className="m-press relative z-[1] -mt-5 flex h-[54px] items-center gap-3 rounded-full px-5 text-[14.5px] text-muted shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]"
        style={{ background: "var(--m-card)" }}
      >
        <DoodleIcon name="search" size={18} className="text-ink" />
        Search properties, tenants, landlords...
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile href="/agent/leads" tone="pink" icon="user" value={f.leadsToday} label="Leads Today" />
        <Tile href="/agent/properties?chip=market" tone="sage" icon="home" value={f.onMarket} label="On Market" />
        <Tile href={null} tone="pink" icon="doc" value={f.applications} label="Applications" />
        <Tile href="/agent/day" tone="sage" icon="key" value={f.viewingsWeek} label="Viewings, 7 Days" />
      </div>

      <Link href="/agent/day" className="m-press mt-3 flex items-center gap-3.5 rounded-[22px] px-4 py-4" style={{ background: "var(--m-green-wash)" }}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "var(--m-card)" }}>
          <DoodleIcon name="calendar" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">Today</span>
          <span className="block truncate text-[13.5px] text-muted">
            {f.todayError ? "Your calendar did not load" : f.today ? todayLine(f.today) : "Loading your calendar"}
          </span>
        </span>
        <Chevron />
      </Link>

      <div className="mt-3">
        <StandaloneHint />
        <AlertsCard />
      </div>
    </main>
  );
}

/* href null: the figure stands alone until its own app page exists (James,
   3 Oct 2026: the app never opens a desktop page). */
function Tile({ href, tone, icon, value, label }: { href: string | null; tone: "pink" | "sage"; icon: string; value: Figure; label: string }) {
  const Box = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <Link href={href} className="m-press flex min-h-[132px] flex-col justify-between rounded-[22px] p-4" style={{ background: tone === "pink" ? "var(--m-pink-wash)" : "var(--m-green-wash)" }}>
        {children}
      </Link>
    ) : (
      <div className="flex min-h-[132px] flex-col justify-between rounded-[22px] p-4" style={{ background: tone === "pink" ? "var(--m-pink-wash)" : "var(--m-green-wash)" }}>
        {children}
      </div>
    );
  return (
    <Box>
      <DoodleIcon name={icon} size={24} />
      <span>
        <span className="m-figure block text-[30px] font-semibold">
          {value === "loading" ? (
            <span role="status" aria-label="Loading" className="mb-1 mt-2 block h-5 w-5 animate-spin rounded-full border-[2.5px] border-black/10 border-t-[color:var(--m-coral)]" />
          ) : value === null ? (
            "–"
          ) : (
            value
          )}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 text-[13.5px]">
          {label}
          {href && <Chevron />}
        </span>
      </span>
    </Box>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
