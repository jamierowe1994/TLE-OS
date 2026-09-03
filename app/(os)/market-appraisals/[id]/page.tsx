"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/Wire";
import ResearchPanel from "@/components/ResearchPanel";
import DeckRail from "@/components/DeckRail";
import ValuationForm from "@/components/ValuationForm";
import RexPropertyPicker from "@/components/RexPropertyPicker";
import VideoChaseControl from "@/components/VideoChaseControl";
import {
  MA_STAGES,
  effectiveStage,
  needsValuation,
  type MarketAppraisal,
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
 *   1. WHO AND WHAT     — the landlord, how to reach them, the property in a line
 *   2. THE APPOINTMENT  — when it is, and whether it has happened
 *   3. WHAT THEY SEE    — pre-appraisal, appraisal, post-appraisal, in that order
 *   4. WHAT WE KNOW     — the evidence: comparables and the best-price guide
 *
 * The full material-information panel is NOT here. It moved to the
 * presentation builder, where it was already rendered: thirty fields of
 * tenure and thermal transmittance is what you take to a landlord, not what
 * you need when you open the file — and it made the top of this page an
 * eight-second "Pulling the property details…" above everything an agent
 * actually came for.
 *
 * Nothing above (3) waits on a fetch. The research at (4) is the slowest thing
 * here and is last, loading without blocking anything above it.
 */

/** What the appraisal is waiting on at each stage. */
const NEXT: Record<string, { do: string; who: string }> = {
  booked: { do: "The pre-appraisal deck goes out the day before. Record a welcome video for it if you can.", who: "Us" },
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
  /* `undefined` means we have not looked yet and `null` means we looked and it
     is not there — the two must stay separate, or the page flashes "No such
     appraisal" at somebody who has just this second booked one. */
  const [booked, setBooked] = useState<MarketAppraisal | null | undefined>(undefined);
  const ma = booked ?? null;

  useEffect(() => {
    let gone = false;
    fetch(`/api/appraisals`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gone) return;
        const list: MarketAppraisal[] = Array.isArray(j?.appraisals) ? j.appraisals : [];
        setBooked(list.find((m) => m.id === id) ?? null);
      })
      .catch(() => {
        if (!gone) setBooked(null);
      });
    return () => {
      gone = true;
    };
  }, [id]);

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

  if (booked === undefined) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-[12.5px] text-muted">Fetching the appraisal…</p>
      </div>
    );
  }

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
        {/* THE DATE AND THE AGENT USED TO BE REPEATED HERE. Both now have
            sections of their own directly below, and the appointment was
            printed three times on one screen — header, appointment card, and
            again in "needs doing now". The header keeps only what those two
            sections do NOT say: where it is, and the figure, which is the one
            thing worth seeing without scrolling. */}
        <p className="mt-1 text-[12.5px] text-muted">
          {ma.postcode}
          {ma.valuation ? ` · valued ${gbp(ma.valuation)} pcm` : ""}
        </p>
      </header>

      {/* ── 1b. how to reach them ───────────────────────────────────────── */}
      {/* THE FULL MATERIAL-INFORMATION PANEL USED TO BE HERE and it has moved
          to the presentation builder, where it was already rendered anyway.
          James, 31 Aug: thirty fields of tenure and thermal transmittance is
          what you take to a landlord, not what you need when you open the
          file. It also meant the top of this page was a "Pulling the property
          details…" placeholder for eight seconds, above everything an agent
          actually came for.

          What replaces it is what an agent opens an appraisal to find: the
          property in one line, and a way to ring the landlord. Both are known
          instantly — no fetch, nothing to wait for. */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-6">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          The landlord
        </p>
        <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <p className="text-[10.5px] uppercase tracking-wide text-muted">Name</p>
            <p className="mt-0.5 text-[13px]">{ma.landlord}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-wide text-muted">Email</p>
            {ma.landlordEmail ? (
              <a
                href={`mailto:${ma.landlordEmail}`}
                className="mt-0.5 block truncate text-[13px] underline"
              >
                {ma.landlordEmail}
              </a>
            ) : (
              <p className="mt-0.5 text-[13px] text-muted">Not recorded</p>
            )}
          </div>
          <div>
            <p className="text-[10.5px] uppercase tracking-wide text-muted">Mobile</p>
            {ma.landlordMobile ? (
              <a href={`tel:${ma.landlordMobile}`} className="mt-0.5 block text-[13px] underline">
                {ma.landlordMobile}
              </a>
            ) : (
              <p className="mt-0.5 text-[13px] text-muted">Not recorded</p>
            )}
          </div>
        </div>

        {/* A few property facts once the research lands — never a placeholder
            while it is in flight. Absent reads as "not here yet", which is
            true, rather than as a screen that is broken. */}
        {research?.material && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line/70 pt-3 text-[12px] text-muted">
            {research.material.bedrooms != null && (
              <span>
                <span className="text-ink">{research.material.bedrooms}</span> bed
              </span>
            )}
            {research.material.compliance.epcRating && (
              <span>
                EPC <span className="text-ink">{research.material.compliance.epcRating}</span>
              </span>
            )}
            <span>{ma.postcode}</span>
            <span className="ml-auto">
              Full property details are on the presentation&apos;s first step.
            </span>
          </div>
        )}
        {/* Which REX property this is, captured at the booking stage — long
            before terms are signed, and by a person rather than by matching an
            address. See RexPropertyPicker for why that distinction matters. */}
        <div className="mt-4 border-t border-line/70 pt-3">
          <RexPropertyPicker appraisal={ma} onSaved={setBooked} />
        </div>

        {failed && (
          <p className="mt-4 border-t border-line/70 pt-3 text-[11.5px] leading-relaxed text-muted">
            Homesearch could not be reached, so there are no property facts here. Nothing stale is
            shown in their place.
          </p>
        )}
      </section>

      {/* ── 2. the booking ──────────────────────────────────────────────── */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-6">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          The appointment
        </p>
        {ma.appointmentAt ? (
          (() => {
            const when = new Date(ma.appointmentAt);
            const past = when < new Date();
            return (
              <>
                <p className="mt-2.5 text-[14.5px]">
                  {when.toLocaleString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
                  {past ? "Been and gone" : "Still to come"}
                  {ma.agent && <span>· with {ma.agent}</span>}
                </p>
                {/* Only when the visit has HAPPENED. Before it, "the
                    pre-appraisal goes out the day before" is already the whole
                    of Needs doing now, and saying it twice on one screen
                    taught an agent to stop reading either. */}
                {past && (
                  <p className="mt-3 border-t border-line/70 pt-3 text-[11.5px] leading-relaxed text-muted">
                    {missingFigure
                      ? "No figure has been recorded. That is the next thing, and the post-appraisal deck waits on it."
                      : "The figure is recorded, so the post-appraisal deck can go."}
                  </p>
                )}
              </>
            );
          })()
        ) : (
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
            No date on this appraisal. It was booked without one — worth chasing, because the
            pre-appraisal deck is scheduled from the appointment and has nothing to count back
            from.
          </p>
        )}
      </section>

      {/* ── 2. where it is up to ────────────────────────────────────────── */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-6">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Where it&apos;s up to
        </p>
        {/* ACROSS, not down. James, 28 Aug — and he is right: a spine is a
            journey, and a journey reads left to right. Vertically it looked
            like a checklist of unrelated jobs; horizontally you can see at a
            glance how far along a file is, which is the only question the
            panel exists to answer.

            It scrolls sideways rather than wrapping. Seven stages wrapped onto
            two rows would put "Won" underneath "Booked" and undo the reading
            order the change is for. */}
        <ol className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-2">
          {spine.map((s, i, arr) => {
            const done = i < at;
            const here = s.id === live;
            return (
              <li key={s.id} className="flex min-w-[132px] flex-1 shrink-0 flex-col">
                <div className="flex items-center">
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] ${
                      done
                        ? "border-accent-dark bg-accent-soft text-accent-dark"
                        : here
                          ? "border-accent-dark bg-accent-dark text-white"
                          : "border-line bg-panel text-muted"
                    }`}
                  >
                    {done ? "\u2713" : i + 1}
                  </span>
                  {i < arr.length - 1 && (
                    <span
                      aria-hidden
                      className={`h-[1.5px] flex-1 ${done ? "bg-accent-dark/50" : "bg-line"}`}
                    />
                  )}
                </div>
                <span className={`mt-2 pr-3 text-[12px] leading-tight ${here ? "font-semibold" : "text-muted"}`}>
                  {s.label}
                </span>
                {here && (
                  <span className="mt-0.5 pr-3 text-[10.5px] leading-snug text-muted">{s.blurb}</span>
                )}
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

        {/* The video nudge, while there is still time for one: who it goes
            to and when, with "send it to me now" for checking the email
            lands. This page is where that email's button points, so the
            recorder (in the pre-appraisal card below) is one scroll away. */}
        {(live === "booked" || live === "pre_appraisal") && (
          <div className="mt-4">
            <VideoChaseControl appraisalId={ma.id} />
          </div>
        )}

        {/* "Record the valuation" USED TO LIVE HERE and it was a redirect
            loop: it pointed at /market-appraisals?open=<id>, whose open
            handler immediately router.replace'd back to this page. It has been
            removed rather than left looking available, because there is no
            valuation form anywhere in this OS to send anyone to. The
            post-appraisal card below says so in words. */}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href="/compliance"
            className="rounded-lg border border-line/80 px-4 py-2.5 text-[12.5px]"
          >
            Certificates
          </Link>
        </div>
      </section>

      {/* ── 3. the three decks ──────────────────────────────────────────── */}
      {/* The valuation form is passed INTO the post-appraisal card rather than
          sitting in a section of its own further up. It is the thing that
          unlocks that step, and it belongs beside the step it unlocks. */}
      <section className="fade-up mt-4">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          What they see
        </p>
        <p className="mt-2 mb-3 text-[12px] leading-relaxed text-muted">
          Three decks, in the order a landlord meets them.
        </p>
        <DeckRail
          appraisalId={ma.id}
          refId={ma.leadId ?? ma.id}
          address={ma.address}
          postcode={ma.postcode}
          landlord={ma.landlord}
          appointmentAt={ma.appointmentAt ?? null}
          hasValuation={ma.valuation != null}
          valuationSlot={<ValuationForm appraisal={ma} onSaved={setBooked} />}
        />
      </section>

      {/* ── 4. what we know ─────────────────────────────────────────────── */}
      <section className="fade-up mt-4">
        <ResearchPanel address={ma.address} postcode={ma.postcode} beds={2} />
      </section>
    </>
  );
}
