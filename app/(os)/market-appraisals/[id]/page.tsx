"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/Wire";
import MaterialInfoPanel from "@/components/MaterialInfoPanel";
import ResearchPanel from "@/components/ResearchPanel";
import {
  MA_STAGES,
  effectiveStage,
  needsValuation,
  SAMPLE_APPRAISALS,
} from "@/lib/market-appraisal";
import type { MaResearch } from "@/lib/ma-research";

/**
 * The appraisal file — a PAGE, laid out like a listing.
 *
 * It was a pop-out. James asked for the same shape a listing has, and he is
 * right: an appraisal is a file an agent lives in for three weeks, not a thing
 * they glance at. A drawer caps the property details at whatever fits above the
 * fold, and material information alone is thirty fields.
 *
 * The order is the order of the job, not of the data:
 *
 *   1. WHAT IT IS      — the property, including everything Homesearch holds
 *   2. WHERE IT IS UP TO — the spine, running down the page
 *   3. WHAT TO DO NEXT  — the actions, where the agent's hand is already going
 *   4. WHAT WE KNOW     — the evidence: comparables and the best-price guide
 *
 * An agent opening this at 8am wants (2) and (3). A landlord on the phone makes
 * them want (1). Nobody opens it wanting (4) first, which is why the research
 * — the slowest thing on the page — is last and loads without blocking.
 */

/** What the appraisal is waiting on at each stage. */
const NEXT: Record<string, { do: string; who: string }> = {
  booked: { do: "Send the pre-appraisal deck — two days before, with a welcome video if you can.", who: "Us" },
  pre_appraisal: { do: "Pull the comparables together and agree your opening figure before you go.", who: "Us" },
  appraisal: { do: "The visit. Walk it, then record the valuation while it is fresh.", who: "Us" },
  post_appraisal: { do: "Send the deck back with the figure, set the follow-up, and get the terms out for signature.", who: "Us" },
  takeon: { do: "Book the take-on visit — this is where the photographs and the description come from.", who: "Us" },
  aml: { do: "ID and proof of ownership, AML on the landlord, and the property's certificates.", who: "Us" },
  won: { do: "Everything clear — push it through to a listing.", who: "Us" },
  lost: { do: "Nothing outstanding. Worth recording why, while anyone remembers.", who: "—" },
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function AppraisalFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ma = SAMPLE_APPRAISALS.find((m) => m.id === id);

  const [research, setResearch] = useState<MaResearch | null>(null);
  const [failed, setFailed] = useState(false);

  /* The research is the slow call — Homesearch plus our own book, and it can
     run to eight seconds. It loads after paint and never blocks the spine,
     because the spine is what the agent came for. */
  useEffect(() => {
    if (!ma) return;
    let live = true;
    const q = new URLSearchParams({ address: ma.address, postcode: ma.postcode, beds: "2" });
    fetch(`/api/ma-research?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MaResearch) => live && setResearch(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [ma]);

  if (!ma) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">No such appraisal</p>
        <p className="mt-2 text-[12.5px] text-muted">
          It may have been removed, or the link is wrong.
        </p>
        <Link href="/market-appraisals" className="mt-4 inline-block text-[12.5px] underline">
          Back to Market Appraisals
        </Link>
      </div>
    );
  }

  const live = effectiveStage(ma);
  const at = MA_STAGES.findIndex((s) => s.id === live);
  /* "Lost" is an outcome, not a step, and it is not drawn on the spine. Counting
     it made the header say "stage 1 of 8" above seven visible stages. */
  const spine = MA_STAGES.filter((s) => s.id !== "lost");
  const next = NEXT[live];
  const missingFigure = needsValuation(ma);

  return (
    <>
      <Link href="/market-appraisals" className="text-[12.5px] text-muted underline">
        ← Market Appraisals
      </Link>

      {/* ── 1. what it is ───────────────────────────────────────────────── */}
      <header className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Market appraisal — stage {at + 1} of {spine.length}
        </p>
        <h1 className="hand mt-1 text-[26px] leading-tight">{ma.address}</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {ma.landlord} · {ma.postcode}
          {ma.agent ? ` · with ${ma.agent}` : " · no agent recorded"}
        </p>
        {ma.appointmentAt && (
          <p className="mt-0.5 text-[12.5px] text-muted">
            {new Date(ma.appointmentAt).toLocaleString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {ma.valuation ? ` · valued ${gbp(ma.valuation)} pcm` : ""}
          </p>
        )}
      </header>

      <div className="fade-up mt-4">
        {failed ? (
          <div className="rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-5">
            <p className="text-[12.5px] leading-relaxed">
              The property details couldn&apos;t be pulled. Nothing stale is shown in their
              place — reload, and if it keeps failing the Homesearch call is down.
            </p>
          </div>
        ) : (
          <MaterialInfoPanel
            material={research?.material ?? null}
            warning={research?.addressWarning ?? null}
            loading={!research}
          />
        )}
      </div>

      {/* ── 2. where it is up to ────────────────────────────────────────── */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-6">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Where it&apos;s up to
        </p>
        <ol className="mt-4 space-y-0">
          {spine.map((s, i, arr) => {
            const done = i < at;
            const here = s.id === live;
            return (
              <li key={s.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                {/* The spine itself — a line down the page, not a row of pills.
                    It is the thing James asked for by name, and it reads as a
                    journey rather than as a status field. */}
                {i < arr.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[10px] top-[22px] h-full w-[1.5px] ${
                      done ? "bg-accent-dark/50" : "bg-line"
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 mt-0.5 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] ${
                    done
                      ? "border-accent-dark bg-accent-soft text-accent-dark"
                      : here
                        ? "border-accent-dark bg-accent-dark text-white"
                        : "border-line bg-panel text-muted"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span
                    className={`block text-[13px] leading-tight ${here ? "font-semibold" : "text-muted"}`}
                  >
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                    {s.blurb}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
          Once terms are signed this stops being an appraisal and becomes a{" "}
          <span className="font-semibold">listing</span>.
        </p>
      </section>

      {/* ── 3. what to do next ──────────────────────────────────────────── */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-6">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Needs doing now
        </p>
        <p className="mt-2.5 text-[13.5px] leading-relaxed">
          {missingFigure
            ? "The visit has been and gone with no figure recorded. Do that first — everything after it waits on the valuation."
            : next?.do}
        </p>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          Waiting on <Pill tone="accent">{missingFigure ? "Us" : (next?.who ?? "Us")}</Pill>
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href={`/market-appraisals/${ma.id}/build`}
            className="rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white"
          >
            Build the presentation
          </Link>
          <Link
            href={`/market-appraisals?open=${ma.id}`}
            className="rounded-lg border border-line/80 px-4 py-2.5 text-[12.5px]"
          >
            Record the valuation
          </Link>
          <Link
            href="/compliance"
            className="rounded-lg border border-line/80 px-4 py-2.5 text-[12.5px]"
          >
            Certificates
          </Link>
        </div>
      </section>

      {/* ── 4. what we know ─────────────────────────────────────────────── */}
      <section className="fade-up mt-4">
        <ResearchPanel address={ma.address} postcode={ma.postcode} beds={2} />
      </section>
    </>
  );
}
