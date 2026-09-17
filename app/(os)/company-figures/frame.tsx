"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import PickOne from "@/components/PickOne";
import Freshness from "@/components/business/Freshness";
import { PresentProvider, usePresent } from "@/components/business/PresentMode";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import { currentMonth, monthLabel, monthProgressLabel, recentMonths } from "@/lib/business/format";
import { BUSINESS_TABS, PRESENT_KEYS } from "./rail";

/**
 * The frame around Susan's tabs: the heading, the month and the presenting
 * controls, shared by every tab so the month she picks survives moving between
 * them.
 *
 * This replaces the portal's own chrome (a red sidebar, a top bar with Sign out
 * and Customer view, a red TLE mark) that made the page look like a different
 * product from the rest of the OS (James, 17 Sep 2026). The rail now comes from
 * OwnWorkspace like the admin centre's and Kirstie's, and the heading is the
 * same eyebrow, title and blurb every other workspace page opens with.
 *
 * THE MONTH YOU ARE STANDING IN is the default, not the last closed one (James,
 * 28 Aug: "it should always pull through the most recent figures"). A live
 * month announces itself as "day 17 of 30" so a part-month is never mistaken
 * for a bad one.
 */

interface BusinessCtx {
  month: string;
  seed: SeedData | null;
  seedError: string | null;
}

const Ctx = createContext<BusinessCtx>({ month: currentMonth(), seed: null, seedError: null });
export const useBusiness = () => useContext(Ctx);

export default function BusinessFrame({ children }: { children: React.ReactNode }) {
  return (
    <PresentProvider>
      <Frame>{children}</Frame>
    </PresentProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { presenting, toggle } = usePresent();
  const [month, setMonth] = useState(currentMonth);
  const [seed, setSeed] = useState<SeedData | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [autoCycle, setAutoCycle] = useState(false);

  const key = path.split("/")[2] ?? "overview";
  const tab = BUSINESS_TABS.find((t) => t.key === key) ?? BUSINESS_TABS[0];

  // The admin-gated seed, once. lib/seed-data.ts is server-only; it reaches
  // the browser through that route and never through the bundle.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/business/seed", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ seed: SeedData }>;
      })
      .then((d) => !cancelled && setSeed(d.seed))
      .catch(() => !cancelled && setSeedError("Couldn't load the business figures. Refresh to try again."));
    return () => {
      cancelled = true;
    };
  }, []);

  const monthOptions = useMemo(() => {
    const live = currentMonth();
    return recentMonths(12)
      .slice()
      .reverse()
      .map((m) => ({ id: m, label: m === live ? `${monthLabel(m)} - live` : monthLabel(m) }));
  }, []);

  /* Presenting walks the boardroom story, not every working tab. */
  const step = useCallback(
    (dir: 1 | -1) => {
      const pos = PRESENT_KEYS.indexOf(tab.key as (typeof PRESENT_KEYS)[number]);
      const next = pos === -1 ? PRESENT_KEYS[0] : PRESENT_KEYS[(pos + dir + PRESENT_KEYS.length) % PRESENT_KEYS.length];
      router.push(`/company-figures/${next}`);
    },
    [tab.key, router]
  );
  useEffect(() => {
    if (!presenting) return;
    if (!PRESENT_KEYS.includes(tab.key as (typeof PRESENT_KEYS)[number])) router.push(`/company-figures/${PRESENT_KEYS[0]}`);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, step, tab.key, router]);
  useEffect(() => {
    if (!presenting || !autoCycle) return;
    const id = window.setInterval(() => step(1), 15000);
    return () => window.clearInterval(id);
  }, [presenting, autoCycle, step]);

  const status = monthProgressLabel(month);
  const live = status.startsWith("Live");

  return (
    <Ctx.Provider value={{ month, seed, seedError }}>
      <div className="type-admin biz-os">
        {presenting ? (
          <style>{`[data-admin-rail], [data-os-back] { display: none !important; }`}</style>
        ) : null}

        <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-dark">My Business</p>
            <h1 className="mt-1.5 leading-[1.02] text-[clamp(30px,2.6vw,44px)]">{tab.label}</h1>
            {!presenting ? (
              <p className="mt-2 max-w-[68ch] leading-relaxed text-muted text-[clamp(13px,0.95vw,15px)]">{tab.blurb}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${live ? "bg-accent-soft text-accent-dark" : "bg-panel text-muted"}`}>
              {status}
            </span>
            {!presenting ? <Freshness /> : null}
            <PickOne
              value={month}
              onChange={(v) => setMonth(v ?? month)}
              clearable={false}
              label="Month"
              icon="calendar"
              options={monthOptions}
            />
            {presenting ? (
              <button
                type="button"
                onClick={() => setAutoCycle((v) => !v)}
                aria-pressed={autoCycle}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                  autoCycle ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-card text-ink hover:border-ink/40"
                }`}
              >
                {autoCycle ? "Auto-cycle on" : "Auto-cycle"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              aria-pressed={presenting}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                presenting ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-card text-ink hover:border-ink/40"
              }`}
            >
              <span className={presenting ? "" : "text-accent-dark"}>
                <DoodleIcon name="dashboard" size={14} />
              </span>
              {presenting ? "Exit presenting" : "Present"}
            </button>
          </div>
        </header>

        {presenting ? (
          <div className="mb-5 flex items-center gap-2">
            {PRESENT_KEYS.map((k) => (
              <span
                key={k}
                title={BUSINESS_TABS.find((t) => t.key === k)?.label}
                className={`h-1.5 flex-1 rounded-full ${k === tab.key ? "bg-accent-dark" : "bg-line"}`}
              />
            ))}
          </div>
        ) : null}

        <section key={tab.key}>
          {seedError ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{seedError}</p>
          ) : seed ? (
            children
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-muted" aria-busy="true">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
              Loading the figures
            </div>
          )}
        </section>

        {presenting ? (
          <p className="mt-8 text-center text-[11px] text-muted">← → to change tabs · Esc to exit</p>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
