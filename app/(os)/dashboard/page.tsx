"use client";

import { useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Card, FlowTag, Pill } from "@/components/Wire";

/**
 * The reference layout, made ours: four stats across the top, three working
 * boxes in the middle (a day view, a leads view, and a tickable attention
 * list), and the whole journey as a pipeline snapshot along the bottom.
 * Every figure maps to a measured source; unknowns say TBC on the tile.
 */

const STATS = [
  { label: "Leads today", icon: "target", value: "14", hint: "3 uncontacted", href: "/leads" },
  { label: "On market", icon: "home", value: "24", hint: "2 under offer", href: "/listings" },
  { label: "Applications", icon: "checklist", value: "6", hint: "1 stalled", href: "/applications" },
  { label: "Occupancy", icon: "pie", value: "93%", hint: "of the managed book", href: "/portfolio" },
];

const PIPELINE = [
  { label: "Leads", value: "14", href: "/leads" },
  { label: "Appointments", value: "9", href: "/viewings" },
  { label: "Appraisals", value: "3", tbc: true },
  { label: "Properties", value: "24", href: "/listings" },
  { label: "Applications", value: "6", href: "/applications" },
  { label: "Portfolio", value: "568", href: "/portfolio" },
  { label: "Move-ins", value: "2" },
];

const ATTENTION = [
  { id: "leads", text: "3 leads uncontacted for over 24 hours", area: "Leads", hot: true },
  { id: "gas", text: "Gas cert expires in 12 days — 41 Harewood Road", area: "Compliance", hot: true },
  { id: "ref", text: "Referencing stalled 6 days — Flat 2, Mercer St", area: "Applications", hot: false },
  { id: "money", text: "£1,240 reconciled in, not yet paid out", area: "Finances", hot: false },
];

const TODAY = [
  { time: "10:15", what: "Viewing — 12 Elm Gardens", who: "Priya Shah" },
  { time: "13:00", what: "Market appraisal — 9 Granby Road", who: "New landlord" },
  { time: "15:30", what: "Viewing — 41 Harewood Road", who: "Marcus Bell" },
  { time: "17:00", what: "Viewing — Flat 2, Mercer Street", who: "Sophie Turner" },
];

const LATEST_LEADS = [
  { who: "Sophie Turner", source: "Rightmove", when: "18m" },
  { who: "Chloe Adams", source: "Facebook ad", when: "2h" },
  { who: "Daniel Okafor", source: "Zoopla", when: "3h" },
  { who: "Ryan Whitfield", source: "Instagram ad", when: "1d" },
];

/** The pop strokes off the greeting's corners — big enough to notice. */
function Pop({ mirror = false }: { mirror?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-8 w-8 text-ink ${mirror ? "-scale-x-100" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M3 15 L9 10" />
      <path d="M9 4 L12 11" />
      <path d="M18 3 L16 10" />
    </svg>
  );
}

/** Four bands, matching the portal's greeting — the OS should feel awake. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up, James?";
  if (h < 12) return "Good morning, James";
  if (h < 17) return "Good afternoon, James";
  if (h < 22) return "Good evening, James";
  return "Still up, James?";
}

export default function Dashboard() {
  const [done, setDone] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* ── The header sits on a ledge: a rule right across, with the
             looking-out-the-window illustration perched ON the line. */}
      <div className="fade-up relative flex items-end justify-between gap-6 border-b border-line/80 pt-10">
        <div className="relative mb-2 pb-9 pl-2 pt-8">
          {/* One flick off the top-left, its mirror off the bottom-right. */}
          <span className="absolute -top-2 left-0"><Pop /></span>
          <span className="absolute -right-12 bottom-4 rotate-180"><Pop /></span>
          <h1 className="text-[30px] leading-tight">{greeting()}</h1>
          <p className="mt-2.5 text-[13px] text-muted">
            Here&apos;s what&apos;s happening with your lettings business today.
          </p>
        </div>

        <div className="flex shrink-0 items-end gap-3 self-end pb-9">
          <label className="hidden w-60 items-center gap-2.5 rounded-full border border-line/80 px-4 py-2.5 transition-colors focus-within:border-ink sm:flex">
            <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
            <input
              type="text"
              placeholder="Search properties, tenants…"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
            />
          </label>
          <button
            type="button"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80"
            title="Notifications (wireframe)"
          >
            <DoodleIcon name="bell" size={17} className="text-ink" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
          </button>
        </div>

        {/* Her floor line lands exactly on the page rule — sat on the ledge. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/notioly/looking-out-the-window.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-[350px] hidden h-28 xl:block"
        />
      </div>

      {/* ── Four across the top, outline only. */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {STATS.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="fade-up group rounded-2xl border border-line/80 p-5 transition-colors hover:border-ink/40"
          >
            {/* Bare icons — no circle behind them; the page breathes better. */}
            <div className="flex items-center gap-2.5">
              <DoodleIcon name={s.icon} size={20} className="text-accent-dark" />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                {s.label}
              </span>
            </div>
            <p className="figures mt-3 text-[34px] leading-none">{s.value}</p>
            <p className="mt-1.5 text-[11px] font-medium text-accent-dark">{s.hint}</p>
          </Link>
        ))}
      </div>

      {/* ── Three working boxes. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Needs attention" tag={<Pill tone="accent">{ATTENTION.length - done.size}</Pill>}>
          <ul className="space-y-2.5">
            {ATTENTION.map((a) => {
              const ticked = done.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    className="flex w-full items-start gap-2.5 text-left"
                  >
                    <span
                      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                        ticked ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line"
                      }`}
                    >
                      {ticked && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                    <span
                      className={`text-[12.5px] leading-snug transition-all ${
                        ticked ? "text-muted line-through opacity-60" : ""
                      }`}
                    >
                      {a.text}
                      <span className={`ml-1.5 text-[10px] font-semibold ${a.hot ? "text-accent-dark" : "text-muted"}`}>
                        {a.area}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Today" tag={<FlowTag to="REX (service TBC)" />}>
          <ul className="space-y-2.5">
            {TODAY.map((t) => (
              <li key={t.time} className="flex items-baseline gap-3">
                <span className="figures w-11 shrink-0 text-[13px] text-accent-dark">{t.time}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px]">{t.what}</span>
                  <span className="block text-[10.5px] text-muted">{t.who}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/viewings" className="mt-3 block text-[11px] font-semibold text-muted transition-colors hover:text-ink">
            Full diary →
          </Link>
        </Card>

        <Card title="Latest leads" tag={<FlowTag from="REX + GHL" />}>
          <ul className="space-y-2.5">
            {LATEST_LEADS.map((l) => (
              <li key={l.who} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="hand block truncate text-[13px]">{l.who}</span>
                  <span className="block text-[10.5px] text-muted">{l.source}</span>
                </span>
                <span className="shrink-0 text-[10.5px] text-muted">{l.when}</span>
              </li>
            ))}
          </ul>
          <Link href="/leads" className="mt-3 block text-[11px] font-semibold text-muted transition-colors hover:text-ink">
            All leads →
          </Link>
        </Card>
      </div>

      {/* ── The journey, compact, along the bottom — the pipeline snapshot. */}
      <div className="fade-up mt-6 rounded-2xl border border-line/80 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px]">Pipeline snapshot</h2>
          <FlowTag from="REX + PayProp" />
        </div>
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-7">
          {PIPELINE.map((p) => {
            const inner = (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {p.label}
                  </span>
                </span>
                <span className="figures mt-1.5 block text-[24px] leading-none">{p.value}</span>
                {p.tbc && <span className="mt-0.5 block text-[9px] text-muted">source TBC</span>}
              </>
            );
            return p.href ? (
              <Link key={p.label} href={p.href} className="transition-opacity hover:opacity-70">
                {inner}
              </Link>
            ) : (
              <div key={p.label}>{inner}</div>
            );
          })}
        </div>
      </div>
    </>
  );
}
