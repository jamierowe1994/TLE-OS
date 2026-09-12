"use client";

import { usePathname } from "next/navigation";
import { HARNESS, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * The walkthrough strip on the sample only: where Sophie is, and a stop for
 * every point the portal looks different. Each is a plain link to the
 * stage route, which sets the cookie and comes back to this page, so the
 * switch works on every page of the sample without any state up here.
 *
 * James, 12 Sep 2026: "add a bit of a harness so I can see the different
 * stages ... we would then have a harness where we can switch the tab, and
 * we would say, cool, they've now put in an offer on a property. Here's
 * what it would look like."
 */
export default function StageHarness({ stage }: { stage: TenantStageKey }) {
  const path = usePathname() ?? "/tenant/demo";
  const on = HARNESS.findIndex((h) => h.key === stage);
  return (
    <>
    {/* Room under the page for the strip, so the footer is never behind it. */}
    <div aria-hidden className="h-14" />
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line/70 bg-white/90 p-1.5 shadow-[0_10px_30px_-12px_rgba(60,40,36,0.35)] backdrop-blur">
        <span className="shrink-0 pl-3 pr-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Sample</span>
        {HARNESS.map((h, i) => {
          const lit = h.key === stage;
          const passed = on >= 0 && i < on;
          return (
            <a
              key={h.key}
              href={`/tenant/demo/stage?to=${h.key}&back=${encodeURIComponent(path)}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${
                lit ? "bg-accent-dark font-semibold text-white" : passed ? "text-ink hover:bg-accent-soft" : "text-muted hover:bg-accent-soft hover:text-ink"
              }`}
              aria-current={lit ? "step" : undefined}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${lit ? "bg-white" : passed ? "bg-accent-dark" : "bg-line"}`} />
              {h.label}
            </a>
          );
        })}
      </div>
    </div>
    </>
  );
}
