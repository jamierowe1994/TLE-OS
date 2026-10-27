"use client";

import Wordmark from "@/components/Wordmark";
import DoodleIcon from "@/components/DoodleIcon";
import Toaster from "@/components/Toaster";
import LaunchNav from "@/components/LaunchNav";
import WorkspaceRail, { type RailGroup } from "@/components/WorkspaceRail";
import { FRONT, BACK, type NavItem } from "@/lib/nav";

/**
 * The OS around a back office demo screen: the rail, the content column, the
 * toasts. Drawn from lib/nav like the onboarding preview's stand-in
 * (components/preview/PreviewShell), so a rail item renamed in the product is
 * renamed here too - but nothing in it is a link and nothing fetches.
 *
 * The real Shell is not used because it reads the account, the switches and
 * the bell, and none of those belong to a demo somebody may open on a phone
 * without signing in. The office side draws the real sidebar, LaunchNav, in
 * the real Mist frame (11 Oct 2026): it had its own copy of the old rail, so
 * the demos (and the launch tour that shows them) looked a version behind.
 * Inert - nothing on it is pressable.
 */

function Item({ item, on, sub }: { item: NavItem; on: string; sub?: string }) {
  const lit = item.href === on || item.children?.some((c) => c.href.split("?")[0] === on);
  return (
    <div>
      <span className={`flex items-center rounded-xl px-3 py-2 text-[13px] ${lit ? "bg-ink text-page" : "text-muted"}`}>
        <DoodleIcon name={item.icon} size={16} className="shrink-0" />
        <span className="ml-3 whitespace-nowrap">{item.label}</span>
      </span>
      {lit && item.children && (
        <div className="ml-9 mt-1 space-y-0.5">
          {item.children.map((c) => (
            <span key={c.href} className={`block rounded-lg px-2.5 py-1 text-[12px] ${c.href.split("?")[0] === on && (!sub || c.label === sub) ? "text-ink" : "text-muted"}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The compliance desk's own rail (app/(os)/compliance-desk/layout), for its screens. */
const DESK: NavItem[] = [
  { href: "/compliance-desk", label: "Dashboard", icon: "home" },
  { href: "/compliance-desk/properties", label: "Property Compliance", icon: "shield" },
  { href: "/compliance-desk/verify", label: "Gas & Electric Check", icon: "checklist" },
  { href: "/compliance-desk/plc", label: "PLC Queue", icon: "list" },
  { href: "/compliance-desk/id-checks", label: "ID Checks", icon: "user" },
  { href: "/compliance-desk/agents", label: "Agent Compliance", icon: "user" },
  { href: "/compliance-desk/works", label: "Works Orders", icon: "setting" },
];

/** Kirstie's workspace rail (app/(os)/pre-tenancy/layout), for the pre-tenancy screens. Keep in step. */
const PRETENANCY: RailGroup[] = [
  {
    title: null,
    items: [
      { href: "/pre-tenancy/dashboard", label: "Dashboard", icon: "home" },
      { href: "/pre-tenancy", label: "Board", exact: true, icon: "grid" },
      { href: "/pre-tenancy/plc", label: "PLC queue", icon: "list" },
      { href: "/pre-tenancy/id-checks", label: "ID checks", icon: "user" },
    ],
  },
  { title: null, rule: true, items: [{ href: "/pre-tenancy/knowledge", label: "Knowledge", icon: "note" }] },
  { title: "Elsewhere", items: [{ href: "/compliance-desk", label: "Compliance desk", icon: "shield" }] },
];

const noop = () => {};
const SAM = { name: "Sam Whitaker", email: "sam@thelettingexperts.co.uk", photo: null };

export default function OfficeFrame({ on, sub, desk = false, rail, children }: { on: string; sub?: string; desk?: boolean; rail?: "pretenancy"; children: React.ReactNode }) {
  /* A workspace with its own rail (components/OwnWorkspace): the rail on the grey, the page in the white panel beside it. */
  if (rail) {
    return (
      <div className="flex min-h-screen bg-card text-ink lg:bg-[var(--shell-bg)]">
        <div className="flex min-w-0 flex-1 flex-col bg-card lg:ml-2 lg:bg-[var(--shell-panel)]">
          <main className="w-full flex-1 px-5 pb-28 pt-8 lg:px-10">
            <div className="admin-scope">
              <div className="flex flex-col gap-5 md:flex-row">
                <div aria-hidden className="pointer-events-none contents">
                  <WorkspaceRail label="Pre-tenancy" groups={PRETENANCY} at={on} />
                </div>
                <div className="min-w-0 flex-1 py-3">{children}</div>
              </div>
            </div>
          </main>
        </div>
        <Toaster />
      </div>
    );
  }
  if (!desk) {
    const current = BACK.flatMap((i) => i.children ?? []).find((c) => c.href.split("?")[0] === on && (!sub || c.label === sub))?.href ?? on;
    return (
      <div className="flex min-h-screen bg-card text-ink lg:bg-[var(--shell-bg)]">
        <aside aria-hidden className="pointer-events-none sticky top-3 mb-3 ml-2 mt-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden bg-[var(--shell-nav-bg)] px-2.5 py-3 lg:flex">
          <LaunchNav
            front={FRONT.filter((i) => i.href !== "/showroom")}
            back={BACK}
            mine={[]}
            pathname={on}
            currentHref={current}
            go={noop}
            collapsed={false}
            onToggleCollapse={noop}
            me={SAM}
            onSignOut={noop}
          />
        </aside>
        <main className="w-full min-w-0 flex-1 px-5 pb-28 pt-8 lg:my-2 lg:ml-2 lg:mr-2 lg:rounded-[18px] lg:bg-[var(--shell-panel)] lg:px-10 lg:shadow-[inset_0_0_0_1px_var(--shell-rim)]">{children}</main>
        <Toaster />
      </div>
    );
  }
  return (
    <div className="flex min-h-screen bg-page text-ink">
      <aside className="hidden w-[232px] shrink-0 flex-col gap-1 border-r border-line/60 px-3 py-6 lg:flex">
        <div className="mb-5 px-3">
          <Wordmark />
        </div>
        {desk ? (
          <>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">Compliance</p>
            {DESK.map((i) => <Item key={i.href} item={i} on={on} sub={sub} />)}
          </>
        ) : (
          <>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">Front of house</p>
            {FRONT.filter((i) => i.href !== "/showroom").map((i) => <Item key={i.href} item={i} on={on} sub={sub} />)}
            <p className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">Back office</p>
            {BACK.map((i) => <Item key={i.href} item={i} on={on} sub={sub} />)}
          </>
        )}
      </aside>
      <main className="w-full min-w-0 flex-1 px-5 pb-28 pt-8 lg:px-10">{children}</main>
      <Toaster />
    </div>
  );
}
