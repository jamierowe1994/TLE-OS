import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import AgentCard from "@/components/landlord/AgentCard";
import Spine from "@/components/landlord/Spine";
import { HeroAction, StepRow, pickHero } from "@/components/landlord/StepAction";
import { STAGE_COPY, fullJourney, type Stop } from "@/lib/landlord-journey";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * The journey page (James's mock, 11 Sep 2026), in the home page's language.
 *
 * The title and the agent. Then where they are now, on the pink card - what
 * is happening, the real next action, and why it matters - beside what they
 * can do now, every row a real action. Then the spine, then a card per stop
 * saying who does what: sage for done, pink for now, white for to come. The
 * after-the-let banner closes it.
 *
 * `homeHref` is where in-page links ("#documents") land, since those
 * sections live on the home page: the live portal or the demo.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const SAGE_INK = "#63614a";
const SAGE_WASH = "#f4f3ec";

/** The current-stage card's title, in words that read as a sentence. */
const TITLE: Record<string, string> = {
  valuation: "Valuation in progress",
  instruction: "Signing your instruction",
  compliance: "Compliance in progress",
  marketing: "Marketing your property",
  viewings: "Viewings and offers",
  let: "Let agreed, moving in soon",
  management: "Your property is managed",
};

export default function JourneyView({ view: v, homeHref }: { view: LandlordView; homeHref: string }) {
  const stops = fullJourney(v);
  const current = stops.find((s) => s.state === "current") ?? stops[stops.length - 1];
  const copy = STAGE_COPY[current.id] ?? STAGE_COPY.valuation;
  const hero = pickHero(v);

  return (
    <div className="space-y-6">
      {/* ── title and the agent ── */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="pt-2">
          <h1 className="text-[44px] leading-[1.05]">Your letting journey</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-muted">Track where you are, what&rsquo;s next, and what we need from you.</p>
        </div>
        <AgentCard v={v} />
      </div>

      {/* ── where they are, and what they can do ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-[22px] bg-accent-soft/80 p-7" data-search>
          <span aria-hidden className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-accent/15" />
          <span aria-hidden className="pointer-events-none absolute -bottom-40 right-28 h-72 w-72 rounded-full bg-white/40" />
          <div className="relative flex flex-col gap-6 md:flex-row">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-dark">
              <DoodleIcon name={copy.icon} size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={eyebrow}>Current stage</p>
              <h2 className="mt-2 text-[30px] leading-tight">{TITLE[current.id] ?? current.label}</h2>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">{copy.long}</p>
              {hero && (
                <div className="mt-6">
                  <HeroAction s={hero} v={v} anchorBase={homeHref} />
                </div>
              )}
            </div>
            <div className="md:w-[32%] md:border-l md:border-accent/30 md:pl-6">
              <p className={eyebrow}>Why this matters</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{copy.why}</p>
            </div>
          </div>
        </section>

        <section className={`${card} p-6`} data-search>
          <h2 className="flex items-center gap-3 text-[18px]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="checklist" size={15} />
            </span>
            What you can do now
          </h2>
          {v.steps.length ? (
            <div className="mt-3 divide-y divide-line/50">
              {v.steps.map((s) => (
                <StepRow key={s.id} s={s} v={v} anchorBase={homeHref} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-muted">Nothing needs you right now. We&rsquo;ll let you know when something does.</p>
          )}
        </section>
      </div>

      {/* ── the spine ── */}
      <section className={`${card} p-6`} data-search>
        <h2 className="text-[18px]">Your journey at a glance</h2>
        <div className="mt-7">
          <Spine stops={stops} />
        </div>
      </section>

      {/* ── a card per stop: who does what ──
          One row of seven that scrolls sideways when the window is too narrow
          for them, rather than wrapping into an uneven second row. */}
      <div className="grid auto-cols-[minmax(150px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1" data-search>
        {stops.map((s) => (
          <StageCard key={s.id} s={s} />
        ))}
      </div>

      {/* ── after the let ── */}
      <section className="flex flex-wrap items-center gap-5 rounded-[22px] p-6" style={{ background: SAGE_WASH }} data-search>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
          <DoodleIcon name="home" size={18} />
        </span>
        <div className="min-w-[240px] flex-1">
          <h2 className="text-[17px]">After your property is let</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
            This portal will become your maintenance and compliance hub. You&rsquo;ll be able to report issues, view certificates and stay
            on top of your property, all in one place.
          </p>
        </div>
        <Link
          href={`${homeHref}#maintenance`}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line/70 bg-white/70 px-5 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
        >
          Find out more <span aria-hidden>→</span>
        </Link>
      </section>
    </div>
  );
}

function StageCard({ s }: { s: Stop }) {
  const c = STAGE_COPY[s.id];
  const done = s.state === "done";
  const cur = s.state === "current";
  return (
    <article
      className={`flex flex-col rounded-[18px] border p-4 ${cur ? "border-transparent bg-accent-soft/80" : done ? "border-transparent" : "border-line/60 bg-white"}`}
      style={done ? { background: SAGE_WASH } : undefined}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            done ? "bg-white" : cur ? "border-2 border-accent-dark bg-white" : "border-2 border-line bg-white"
          }`}
          style={done ? { color: SAGE_INK } : undefined}
        >
          {done ? "✓" : cur ? <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" /> : null}
        </span>
        <h3 className="min-w-0 flex-1 text-[13.5px] leading-snug">{s.label}</h3>
      </div>
      {cur && (
        <span className="mt-2 self-start rounded-full bg-white/85 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-accent-dark">
          Current
        </span>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{c?.what}</p>
      <dl className={`mt-auto space-y-2 border-t pt-3 text-[11.5px] ${done ? "border-white/80" : cur ? "border-white/70" : "border-line/50"}`}>
        <div className="pt-1">
          <dt className="font-semibold">Your role</dt>
          <dd className="text-muted">{c?.yourRole}</dd>
        </div>
        <div>
          <dt className="font-semibold">Our role</dt>
          <dd className="text-muted">{c?.ourRole}</dd>
        </div>
        <div>
          <dt className="font-semibold">{done ? "Completed" : "Unlocks"}</dt>
          <dd className="text-muted">{done ? s.sub : c?.unlocks}</dd>
        </div>
      </dl>
    </article>
  );
}
