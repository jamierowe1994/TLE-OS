"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { HARNESS_STAGES } from "@/lib/landlord-sample";
import type { Stage } from "@/lib/landlord-view";

/**
 * The harness (James, 12 Sep 2026): a strip of the seven stops across the
 * top of the sample, so anyone can click Raj from valuation to managed and
 * watch every page follow. Only ever on the sample - the live portal reads
 * the stage from the landlord's own file. Keeps ?from=admin so the preview
 * bar survives the click.
 */
export default function StageHarness({ stage }: { stage: Stage }) {
  const path = usePathname() ?? "/landlord/demo";
  const params = useSearchParams();
  const from = params?.get("from") === "admin" ? "&from=admin" : "";
  const here = HARNESS_STAGES.find((s) => s.id === stage) ?? HARNESS_STAGES[1];
  return (
    <div className="mb-6 rounded-[18px] border border-dashed border-line/80 bg-[#fbfbfa] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">The sample, at</p>
        <div className="flex flex-wrap gap-1.5">
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
      </div>
      <p className="mt-2 text-[12px] text-muted">{here.blurb}</p>
    </div>
  );
}
