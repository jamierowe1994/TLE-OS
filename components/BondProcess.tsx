"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The six steps, as a bar: flagged → card out → replied → called → booked
 * → won. Each step carries the doors that reached it and the conversion
 * from the step before, so the trial's question - is Bond worth the money -
 * is answered on the first screen, from the record.
 *
 * Pressing a step opens the board filtered to the doors standing at it.
 */

export interface ProcessData {
  steps: readonly { id: string; label: string; blurb: string }[];
  reached: number[];
  rate: (number | null)[];
  lost: number;
  doors: Record<string, number>;
  total: number;
}

const STEP_ICON = ["target", "mail", "message", "call", "calendar", "star"];

/** One shared read per patch, so Today and the board do not both walk it. */
const cache = new Map<string, Promise<ProcessData | null>>();
export function loadProcess(districts: string[]): Promise<ProcessData | null> {
  const key = districts.join(",");
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`/api/bond/process${key ? `?districts=${encodeURIComponent(key)}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => (j.ok ? (j as ProcessData) : null))
        .catch(() => null)
    );
  }
  return cache.get(key)!;
}
export function forgetProcess() {
  cache.clear();
}

export function useProcess(districts: string[]): { data: ProcessData | null; loading: boolean } {
  const [data, setData] = useState<ProcessData | null>(null);
  const [loading, setLoading] = useState(true);
  const key = districts.join(",");
  useEffect(() => {
    let gone = false;
    setLoading(true);
    void loadProcess(districts).then((d) => {
      if (gone) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}

export default function BondProcess({
  districts,
  active,
  onPick,
  compact = false,
}: {
  districts: string[];
  /** The step the board is filtered to, 1-6, or null. */
  active?: number | null;
  onPick?: (step: number | null) => void;
  compact?: boolean;
}) {
  const { data, loading } = useProcess(districts);
  const steps = data?.steps ?? [];

  return (
    <div className={`rounded-2xl border border-line/80 bg-panel ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted">The process</p>
        {data && (
          <p className="text-[11px] text-muted">
            {data.total.toLocaleString("en-GB")} door{data.total === 1 ? "" : "s"} in the patch
            {data.lost ? ` · ${data.lost} said no` : ""}
            {data.reached[1] ? ` · ${data.reached[5]} won from ${data.reached[1]} written to` : ""}
          </p>
        )}
      </div>

      {loading && !data ? (
        <p className="mt-3 text-[12px] text-muted">Reading the record…</p>
      ) : !data ? (
        <p className="mt-3 text-[12px] text-accent-dark">The process could not be read.</p>
      ) : (
        <ol className={`mt-3 grid gap-2 ${compact ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"}`}>
          {steps.map((s, i) => {
            const n = data.reached[i];
            const rate = data.rate[i];
            const lit = active === i + 1;
            return (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPick?.(lit ? null : i + 1)}
                  title={s.blurb}
                  className={`flex w-full flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    lit ? "border-accent-dark bg-accent-soft/60" : "border-line/70 bg-card hover:border-ink/40"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      <DoodleIcon name={STEP_ICON[i]} size={12} className="text-accent-dark" />
                      {i + 1}
                    </span>
                    {rate != null && (
                      <span className={`figures text-[11px] ${rate >= 20 ? "text-emerald-700" : "text-muted"}`} title="Of the step before">
                        {rate}%
                      </span>
                    )}
                  </span>
                  <span className={`figures mt-1 leading-none ${compact ? "text-[20px]" : "text-[26px]"}`}>{n.toLocaleString("en-GB")}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {!compact && data && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Nothing here is ticked by hand. A door moves along when a card is sent, when the owner scans it and leaves their details, when a call is logged on
          the lead, when an appraisal is booked, and when it is won. The percentage on a step is how many of the doors from the step before made it.
        </p>
      )}
    </div>
  );
}
