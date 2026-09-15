"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { HARNESS_STAGES } from "@/lib/landlord-sample";
import type { Stage } from "@/lib/landlord-view";

/**
 * The harness: a way to walk the sample landlord from valuation to managed and
 * watch every page follow. Only ever on the sample - the live portal reads the
 * stage from the landlord's own file.
 *
 * ── It hides behind the logo ──────────────────────────────────────────────
 *
 * James, 15 Sep 2026: "can we please remove the sample app section, just
 * because it's in the way ... hide this within the Letting Experts logo ...
 * just so it's out of the way, so I can see what it would look like to an
 * actual landlord."
 *
 * Which is the point of a showroom: a strip of developer controls across the
 * top is the one thing a real landlord would never see, and on a phone it was
 * taking the first fifth of the screen before anything of theirs appeared.
 *
 * So there is NOTHING on the page until the logo is tapped. The handle is the
 * logo because every page has one and no landlord would think to press it.
 * The click is caught here rather than wired through the layout: the layout is
 * shared with the live portal, where this component never mounts and the logo
 * goes home as it always did.
 *
 * It stays open across a stage change (sessionStorage), because choosing a
 * stop navigates - and having to find the logo again after every click is
 * exactly the kind of small tax that stops people testing.
 */

const KEY = "tle-harness-open";

export default function StageHarness({ stage }: { stage: Stage }) {
  const path = usePathname() ?? "/landlord/demo";
  const params = useSearchParams();
  const from = params?.get("from") === "admin" ? "&from=admin" : "";
  const here = HARNESS_STAGES.find((s) => s.id === stage) ?? HARNESS_STAGES[1];
  const [open, setOpen] = useState(false);

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
      /* Capture phase and stopped here, or the link underneath navigates
         home and takes the panel with it. */
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

  /* Nothing at all on the page. This is what a landlord sees. */
  if (!open) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] px-3 pt-3">
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
          {HARNESS_STAGES.map((s, i) => {
            const on = s.id === stage;
            return (
              <Link
                key={s.id}
                href={`${path}?stage=${s.id}${from}`}
                className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${on ? "bg-ink font-semibold text-white" : "border border-line/70 bg-white text-muted hover:border-ink/40 hover:text-ink"}`}
              >
                <span className="mr-1.5 opacity-60">{i + 1}</span>
                {s.label}
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">{here.blurb}</p>
        <p className="mt-1.5 text-[11px] text-muted">Tap the logo any time to bring this back.</p>
      </div>
    </div>
  );
}
