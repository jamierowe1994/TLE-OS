import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Donut, MiniBars, StepPath } from "@/components/Charts";
import { Card, FlowTag, Ghost, PageHead, Pill } from "@/components/Wire";

/**
 * The front page is the journey: seven steps from a lead landing to keys in
 * hand, in the order the business actually runs them. Each step is a door —
 * one click takes you to the place you work that stage. Nothing on this page
 * is more than a click from the thing it describes; that's the "progressive"
 * promise made visible.
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
  { label: "Market appraisals", icon: "search", value: "3", hint: "booked" },
  { label: "Properties", icon: "home", value: "24", hint: "on market", href: "/listings" },
  { label: "Applications", icon: "checklist", value: "6", hint: "in play", href: "/applications" },
  { label: "Portfolio", icon: "folder", value: "568", hint: "managed", href: "/portfolio" },
  { label: "Move-ins", icon: "key", value: "2", hint: "this week" },
];

export default function Dashboard() {
  return (
    <>
      <PageHead
        title="Dashboard"
        blurb="The whole journey on one page, in the order it happens — lead to keys. Every tile is a door: one click lands you where that work lives."
      />

      {/* ── The journey ── seven steps, connected, each one a door. */}
      <div className="fade-up grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {JOURNEY.map((step, i) => {
          const inner = (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                <DoodleIcon name={step.icon} size={19} className="text-accent-dark" />
              </span>
              <span className="figures mt-3 block text-[26px] font-semibold leading-none">
                {step.value}
              </span>
              <span className="mt-1 block text-[12.5px] font-semibold leading-tight">
                {step.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">{step.hint}</span>
              {/* the little connector — the journey reads left to right */}
              {i < JOURNEY.length - 1 && (
                <span className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-line xl:block">
                  →
                </span>
              )}
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

        <Card title="Occupancy" tag={<FlowTag from="REX" />}>
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

      {/* ── What needs you next ── the progressive bit: each line will be a
             one-click jump straight to the thing itself. */}
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
          label="Activity feed"
          detail="A live stream of everything the OS pushes and pulls — every lead in, listing out, status change."
          tag={<FlowTag from="all systems" />}
        />
      </div>
    </>
  );
}
