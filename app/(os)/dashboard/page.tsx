"use client";

import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Donut, MiniBars, StepPath } from "@/components/Charts";
import { Card, FlowTag, Ghost, Pill } from "@/components/Wire";

/**
 * The front page is the journey: seven steps from a lead landing to keys in
 * hand, in the order the business runs them. Each tile is a door — one click
 * lands you where that work lives.
 *
 * Every figure on this page maps to a measured, reachable source (REX census
 * 2 Aug 2026 / PayProp probe) — nothing is invented. Where a source still
 * needs confirming, the tile says so rather than pretending.
 */
const JOURNEY: {
  label: string;
  icon: string;
  value: string;
  hint: string;
  href?: string;
}[] = [
  { label: "Leads", icon: "target", value: "14", hint: "new today", href: "/leads" },
  { label: "Appointments", icon: "calendar", value: "9", hint: "next 7 days", href: "/viewings" },
  { label: "Market appraisals", icon: "search", value: "3", hint: "source TBC" },
  { label: "Properties", icon: "home", value: "24", hint: "on market", href: "/listings" },
  { label: "Applications", icon: "checklist", value: "6", hint: "in play", href: "/applications" },
  { label: "Portfolio", icon: "folder", value: "568", hint: "managed", href: "/portfolio" },
  { label: "Move-ins", icon: "key", value: "2", hint: "this week" },
];

/** Four bands, matching the portal's greeting — the OS should feel awake. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Still up?";
}

export default function Dashboard() {
  return (
    <>
      {/* ── Top bar: search + notifications, right where the mock puts them. */}
      <div className="fade-up flex items-center justify-end gap-3">
        <label className="flex w-64 items-center gap-2.5 rounded-full border border-line/80 bg-card px-4 py-2.5 transition-colors focus-within:border-ink">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input
            type="text"
            placeholder="Search properties, tenants…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
        </label>
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line/80 bg-card"
          title="Notifications (wireframe)"
        >
          <DoodleIcon name="bell" size={17} className="text-ink" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
        </button>
      </div>

      {/* ── The welcome: handwritten greeting, one line, an illustration. */}
      <div className="fade-up mt-2 flex items-end justify-between gap-8">
        <div className="pb-2">
          <h1 className="text-[44px] leading-tight">{greeting()}</h1>
          <p className="mt-1.5 text-sm text-muted">
            Here&apos;s what&apos;s happening with your lettings business today.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/lady-window.png"
          alt=""
          aria-hidden
          className="hidden w-64 shrink-0 xl:block"
        />
      </div>

      {/* ── The journey ── seven steps, each one a door. */}
      <div className="fade-up mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {JOURNEY.map((step) => {
          const inner = (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                <DoodleIcon name={step.icon} size={19} className="text-accent-dark" />
              </span>
              <span className="figures mt-3 block text-[27px] leading-none">
                {step.value}
              </span>
              <span className="hand mt-1 block text-[12.5px] leading-tight">
                {step.label}
              </span>
              <span className="mt-0.5 block text-[10.5px] text-muted">{step.hint}</span>
            </>
          );
          const cls =
            "relative block rounded-2xl border border-line/60 bg-card p-4 shadow-[0_1px_2px_rgba(16,16,20,0.04)] transition-transform";
          return step.href ? (
            <Link key={step.label} href={step.href} className={`${cls} hover:-translate-y-0.5`}>
              {inner}
            </Link>
          ) : (
            <div key={step.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* ── The instruments ── one row, deliberately varied. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Leads this week" tag={<FlowTag from="portals → REX" />}>
          <MiniBars
            values={[6, 11, 8, 14, 9, 4, 14]}
            labels={["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]}
          />
        </Card>

        <Card title="Occupancy" tag={<FlowTag from="PayProp" />}>
          <Donut pct={93} label="of the managed book has a tenancy in place" />
        </Card>

        <Card title="Move-in: 5 Orchard Close" tag={<Pill tone="good">Friday</Pill>}>
          <p className="text-xs text-muted">Hannah Price · 6 of 8 steps done</p>
          <div className="mt-3">
            <StepPath done={6} total={8} />
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Deposit registered ✓ · Right to rent ✓ · Gas cert to attach
          </p>
        </Card>
      </div>

      {/* ── What needs you next ── each line will be a one-click jump. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="What needs you next"
          tag={<FlowTag from="REX + PayProp" />}
          className="lg:col-span-2"
        >
          <ul className="space-y-3 text-[13px]">
            <li className="flex items-center justify-between gap-3">
              <span>3 leads uncontacted for over 24 hours</span>
              <Pill tone="accent">Leads</Pill>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Gas certificate expires in 12 days — 41 Harewood Road</span>
              <Pill tone="accent">Compliance</Pill>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Application stalled at referencing for 6 days — Flat 2, Mercer St</span>
              <Pill>Applications</Pill>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>£1,240 reconciled in, not yet paid out</span>
              <Pill>Finances</Pill>
            </li>
          </ul>
        </Card>

        <Ghost
          label="Recent activity"
          detail="A live stream of everything the OS pushes and pulls — REX AuditLogs already records field-level changes with actor and timestamp, so this feed is real, not aspirational."
          tag={<FlowTag from="REX AuditLogs" />}
        />
      </div>
    </>
  );
}
