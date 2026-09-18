"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HARNESS, phaseOf, type TenantStageKey } from "@/lib/tenant-journey";

/**
 * The harness: a way to walk the sample tenant from signing in to moved in and
 * watch every page follow. Only ever on the sample - the real portal reads the
 * stage from the tenant's own deal.
 *
 * James, 12 Sep 2026: "add a bit of a harness so I can see the different
 * stages ... we would say, cool, they've now put in an offer on a property.
 * Here's what it would look like."
 *
 * ── It hides behind the logo ──────────────────────────────────────────────
 *
 * James, 16 Sep 2026, asking for the landlord's treatment here too. It was a
 * strip pinned across the foot of every page, which is the one thing a real
 * tenant would never see, and on a phone it sat over whatever was at the
 * bottom of the screen - which on this portal is usually the thing they came
 * for. The landlord's went the same way on 15 Sep for the same reason: "just
 * so it's out of the way, so I can see what it would look like to an actual
 * landlord."
 *
 * So there is NOTHING on the page until the logo is tapped. The handle is the
 * logo because every page has one and no tenant would think to press it. The
 * click is caught here rather than wired through the shell, which is shared
 * with the real portal, where this component never mounts and the logo goes
 * home as it always did.
 *
 * It stays open across a stage change (sessionStorage), because choosing a
 * stop navigates - and having to find the logo again after every click is the
 * kind of small tax that stops people testing.
 */

const KEY = "tle-tenant-harness-open";

const PHASE: Record<string, string> = {
  finding: "Finding a home",
  tenancy: "Moving in",
  living: "Living there",
};

export default function StageHarness({ stage }: { stage: TenantStageKey }) {
  const path = usePathname() ?? "/tenant/demo";
  const [open, setOpen] = useState(false);
  const on = HARNESS.findIndex((h) => h.key === stage);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") setOpen(true);
    } catch {
      /* A private window still gets the harness, it just forgets. */
    }
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (!t.closest("[data-tle-logo]")) return;
      /* Capture phase and stopped here, or the link underneath navigates home
         and takes the panel with it. */
      e.preventDefault();
      e.stopPropagation();
      setOpen((v) => {
        try {
          sessionStorage.setItem(KEY, v ? "0" : "1");
        } catch {}
        return !v;
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const shut = () => {
    try {
      sessionStorage.setItem(KEY, "0");
    } catch {}
    setOpen(false);
  };

  /* Nothing at all on the page. This is what a tenant sees. */
  if (!open) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] px-3 pt-3 print:hidden">
      <div className="mx-auto max-w-[760px] rounded-[18px] border border-line/70 bg-[#fbfbfa] px-4 py-3 shadow-[0_18px_40px_-20px_rgba(40,25,20,0.45)]">
        <div className="flex items-start gap-3">
          <p className="mt-0.5 flex-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">The sample, at</p>
          <button
            type="button"
            onClick={shut}
            className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-[11.5px] text-muted underline underline-offset-2 hover:text-ink"
          >
            Hide
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {HARNESS.map((h, i) => {
            const lit = h.key === stage;
            return (
              /* A plain anchor, not a Link: the stop is a cookie the route
                 sets before bouncing back here, so this has to be a real
                 request rather than a client navigation. */
              <a
                key={h.key}
                href={`/tenant/demo/stage?to=${h.key}&back=${encodeURIComponent(path)}`}
                className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                  lit
                    ? "bg-ink font-semibold text-white"
                    : i < on
                      ? "border border-line/70 bg-white text-ink hover:border-ink/40"
                      : "border border-line/70 bg-white text-muted hover:border-ink/40 hover:text-ink"
                }`}
                aria-current={lit ? "step" : undefined}
              >
                <span className="mr-1.5 opacity-60">{i + 1}</span>
                {h.label}
              </a>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {PHASE[phaseOf(stage)] ?? "The sample"} - the sections down the side open and close with the stop.
        </p>
        <p className="mt-1.5 text-[11px] text-muted">Tap the logo any time to bring this back.</p>
      </div>
    </div>
  );
}
