"use client";

import Wordmark from "@/components/Wordmark";
import DoodleIcon from "@/components/DoodleIcon";
import Toaster from "@/components/Toaster";
import { FRONT, BACK, type NavItem } from "@/lib/nav";

/**
 * The OS around a back office demo screen: the rail, the content column, the
 * toasts. Drawn from lib/nav like the onboarding preview's stand-in
 * (components/preview/PreviewShell), so a rail item renamed in the product is
 * renamed here too - but nothing in it is a link and nothing fetches.
 *
 * The real Shell is not used because it reads the account, the switches and
 * the bell, and none of those belong to a demo somebody may open on a phone
 * without signing in.
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
  { href: "/compliance-desk/properties", label: "Properties", icon: "shield" },
  { href: "/compliance-desk/verify", label: "To verify", icon: "checklist" },
  { href: "/compliance-desk/plc", label: "PLC queue", icon: "list" },
  { href: "/compliance-desk/id-checks", label: "ID checks", icon: "user" },
  { href: "/compliance-desk/agents", label: "Agents", icon: "user" },
  { href: "/compliance-desk/works", label: "Works orders", icon: "setting" },
];

export default function OfficeFrame({ on, sub, desk = false, children }: { on: string; sub?: string; desk?: boolean; children: React.ReactNode }) {
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
