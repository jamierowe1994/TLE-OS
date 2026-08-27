"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { FlowTag, Pill } from "@/components/Wire";
import {
  MA_STAGES,
  OPEN_STAGES,
  effectiveStage,
  needsValuation,
  urgencyOf,
  type MarketAppraisal,
  type MaStage,
  SAMPLE_APPRAISALS as SAMPLE,
} from "@/lib/market-appraisal";

/**
 * Market Appraisals — the landlord side, from booked to won.
 *
 * Leads ends at "appraisal booked". This begins there. The two are deliberately
 * separate screens because they are separate jobs: winning a conversation, then
 * winning an instruction.
 *
 * Sample rows until the diary join is wired. They are flagged as such on the
 * page rather than passed off as live — a screen that quietly shows invented
 * appraisals is worse than an empty one.
 */



const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function MarketAppraisals() {
  const [filter, setFilter] = useState<MaStage | "open">("open");
  const router = useRouter();

  const rows = useMemo(() => {
    const withStage = SAMPLE.map((m) => ({ ...m, live: effectiveStage(m) }));
    const open = withStage.filter((m) => m.live !== "won" && m.live !== "lost");
    return (filter === "open" ? open : withStage.filter((m) => m.live === filter)).sort(
      (a, b) => urgencyOf(a) - urgencyOf(b)
    );
  }, [filter]);

  /* Arriving from Leads: booking an appraisal sends the agent here with
     ?open=<id>. That used to pop a drawer; now it forwards to the file, so the
     old links from Leads and from the builder keep working. */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (id && SAMPLE.some((m) => m.id === id)) router.replace(`/market-appraisals/${id}`);
  }, [router]);

  const openCount = useMemo(
    () => SAMPLE.filter((m) => { const k = effectiveStage(m); return k !== "won" && k !== "lost"; }).length,
    []
  );

  const counts = useMemo(() => {
    const m = new Map<MaStage, number>();
    for (const s of SAMPLE) {
      const k = effectiveStage(s);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, []);

  return (
    <>
      <PageHeader
        title="Market Appraisals"
        blurb="Booked, prepared, appraised, won. Everything between a landlord saying yes to a visit and signing terms."
      />

      <div className="mt-10">
        <FlowTag from="Leads" to="Listings" />
      </div>

      <p className="fade-up mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12px] leading-relaxed">
        <span className="font-semibold">Sample rows, not live.</span> The diary join
        isn&apos;t wired yet, so these are stand-ins to shape the screen — don&apos;t quote
        them. The stage rail, the ordering and the handover from Leads are real.
      </p>

      {/* The spine, as a strip of tabs.
          Nine boxes across two rows read as a form to fill in. Six narrow tabs
          read as a process with a position in it — which is what it is, and
          what an agent is actually looking for when they arrive. */}
      <nav className="fade-up mt-4 flex flex-wrap gap-1.5" aria-label="Appraisal stages">
        <button
          type="button"
          onClick={() => setFilter("open")}
          className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
            filter === "open" ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
          }`}
        >
          All open <span className="figures ml-1 opacity-70">{openCount}</span>
        </button>
        {OPEN_STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilter(filter === s.id ? "open" : s.id)}
            title={s.blurb}
            className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
              filter === s.id ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
            }`}
          >
            <span className="mr-1 opacity-50">{i + 1}</span>
            {s.label} <span className="figures ml-1 opacity-70">{counts.get(s.id) ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px]">{filter === "open" ? "Open appraisals" : MA_STAGES.find((s) => s.id === filter)?.label}</h2>
          {filter !== "open" && (
            <button type="button" onClick={() => setFilter("open")} className="text-[11.5px] text-muted underline">
              Show all open
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted">Nothing at this stage.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-line/70 p-3.5 transition-colors hover:border-ink"
              >
                {/* A row opens the FILE, not a drawer. An appraisal is lived in
                    for three weeks and carries thirty fields of material
                    information — that wants an address you can bookmark, send,
                    and come back to. */}
                <Link href={`/market-appraisals/${m.id}`} className="block w-full text-left">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="hand text-[14px]">{m.address}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {/* The forgotten-valuation flag. It used to be a stage of
                        its own; as a flag it can shout from whichever stage
                        the file is actually sitting on. */}
                    {needsValuation(m) && <Pill tone="accent">No figure yet</Pill>}
                    <Pill tone="neutral">{MA_STAGES.find((s) => s.id === m.live)?.label}</Pill>
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] text-muted">
                  {m.landlord} · {m.postcode}
                  {m.agent ? ` · with ${m.agent}` : " · no agent recorded"}
                  {m.appointmentAt
                    ? ` · ${new Date(m.appointmentAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : " · no date booked"}
                  {m.valuation ? ` · valued ${gbp(m.valuation)} pcm` : ""}
                </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>


      <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>
          <span className="font-semibold">Leads ends where this begins.</span> Booking an
          appraisal closes the lead drawer and reopens the record here at Pre-appraisal —
          the lead isn&apos;t deleted, it&apos;s handed on, and the link is kept both ways.
        </li>
        <li>
          <span className="font-semibold">&ldquo;Awaiting valuation&rdquo; is derived, not
          stored.</span> An appointment that has passed with no figure recorded shows itself.
          Nothing schedules it and nothing can forget to move it.
        </li>
        <li>
          <span className="font-semibold">Click an appraisal</span> for its best-price
          guide and the comparables behind it. Research loads one property at a time,
          on your ask — it is a real sweep of the book, not a cached number.
        </li>
      </ul>
    </>
  );
}
