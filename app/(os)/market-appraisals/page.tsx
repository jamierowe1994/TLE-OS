"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import PickOne from "@/components/PickOne";
import Segmented from "@/components/Segmented";
import StageTabs from "@/components/StageTabs";
import CornerSwell from "@/components/CornerSwell";
import {
  MA_STAGES,
  OPEN_STAGES,
  effectiveStage,
  needsValuation,
  urgencyOf,
  type MarketAppraisal,
  type MaStage,
} from "@/lib/market-appraisal";
import { fetchMe } from "@/lib/me";
import GuideButton from "@/components/GuideButton";

/**
 * Market Appraisals — the landlord side, from booked to won.
 *
 * Leads ends at "appraisal booked". This begins there. The two are deliberately
 * separate screens because they are separate jobs: winning a conversation, then
 * winning an instruction.
 *
 * Every row is real. Four hardcoded stand-ins used to be merged in and badged
 * as such — honest, but they were also the only reason this screen ever had
 * anything on it, so an empty store could never be noticed. It was not: the
 * capture job asked os_market_appraisals for postcodes and found none.
 */



const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/**
 * One drawn icon per stage, so the strip reads as a journey at a glance
 * rather than as six words of equal weight. They are the doodle set the rest
 * of the OS uses - no new vocabulary invented for one screen.
 */
const STAGE_ICON: Record<string, string> = {
  booked: "calendar",
  pre_appraisal: "doc",
  appraisal: "home",
  post_appraisal: "checklist",
  takeon: "key",
  aml: "shield",
};

/**
 * How far back to look.
 *
 * Deliberately defaulted to "any", not to this month. An appraisal booked six
 * weeks ago and still sitting at Pre-appraisal is the single most valuable row
 * on this screen, and a month filter is exactly what would hide it. The window
 * is here because James asked to be able to narrow, not to narrow by default.
 *
 * Scoped from now() at render, so it rolls over on its own and there is no
 * month literal anywhere to go stale.
 */
const PERIODS = [
  { id: "any", label: "Any date" },
  { id: "month", label: "This month" },
  { id: "30", label: "Next 30 days" },
  { id: "past", label: "Already happened" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

function inPeriod(iso: string | null, period: PeriodId): boolean {
  if (period === "any") return true;
  /* No date booked is a defect worth seeing, so it survives every window
     except the ones that are explicitly about when something happens. */
  if (!iso) return period !== "past";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return true;
  const now = Date.now();
  if (period === "past") return at < now;
  if (period === "30") return at >= now && at <= now + 30 * 864e5;
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return at >= from && at < to;
}

export default function MarketAppraisals() {
  const [filter, setFilter] = useState<MaStage | "open">("open");
  /* The bar under the header is this list's search - one search per page,
     the same as Leads (James, 11 Sep: the two bars were different widths). */
  const [q, setQ] = useState("");
  /* Narrowing by date, and how the rows are drawn. Both are view state and
     neither is persisted: they are how somebody is looking right now, not a
     setting about them. */
  const [period, setPeriod] = useState<PeriodId>("any");
  /* Tiles by default (James, 11 Sep 2026): the board is taken in, then worked down as a list. */
  const [view, setView] = useState<"list" | "tiles">("tiles");
  /* The appraisals actually booked through the OS. Null while we are still
     asking, so the screen can say "loading" rather than flashing "none yet" at
     somebody who has just booked one. */
  const [live, setLive] = useState<MarketAppraisal[] | null>(null);
  /* Booking one from here, for an appraisal that never was a lead. */
  const [booking, setBooking] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let gone = false;
    fetch("/api/appraisals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!gone) setLive(Array.isArray(j?.appraisals) ? j.appraisals : []);
      })
      .catch(() => {
        if (!gone) setLive([]);
      });
    return () => {
      gone = true;
    };
  }, []);

  /* Real bookings first, then the samples. Two lists rather than one because
     they are not the same kind of thing: one is this agent's actual work and
     the other is furniture. Concatenating them and sorting by urgency would
     bury a real appraisal among stand-ins. */
  const all = useMemo(() => live ?? [], [live]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const withStage = all
      .map((m) => ({ ...m, live: effectiveStage(m) }))
      .filter((m) => inPeriod(m.appointmentAt, period))
      .filter((m) => !needle || `${m.address} ${m.postcode} ${m.landlord} ${m.agent ?? ""}`.toLowerCase().includes(needle));
    const open = withStage.filter((m) => m.live !== "won" && m.live !== "lost");
    return (filter === "open" ? open : withStage.filter((m) => m.live === filter)).sort(
      (a, b) => urgencyOf(a) - urgencyOf(b)
    );
  }, [filter, all, period, q]);

  /* Arriving from Leads: booking an appraisal sends the agent here with
     ?open=<id>, and we forward to that appraisal's file.

     This waits for the live book. It used to test `?open=` against the four
     samples alone, so a real booking — whose id is always `lead-<something>` —
     never matched, and the handover dropped the agent on an undifferentiated
     list with no sign anything had been recorded. Nothing is forwarded until
     we know what actually exists. */
  useEffect(() => {
    if (live === null) return;
    const id = new URLSearchParams(window.location.search).get("open");
    const confirm = new URLSearchParams(window.location.search).get("confirm") === "1";
    if (id && all.some((m) => m.id === id)) router.replace(`/market-appraisals/${id}${confirm ? "?confirm=1" : ""}`);
  }, [router, live, all]);

  /* Both figures count the SAME set the list is about to draw. A strip that
     counts everything while the list is narrowed by date offers a tab with
     three on it that opens on nothing, which reads as the screen being
     broken. */
  const inWindow = useMemo(
    () => all.filter((m) => inPeriod(m.appointmentAt, period)),
    [all, period]
  );

  const openCount = useMemo(
    () => inWindow.filter((m) => { const k = effectiveStage(m); return k !== "won" && k !== "lost"; }).length,
    [inWindow]
  );

  const counts = useMemo(() => {
    const m = new Map<MaStage, number>();
    for (const s of inWindow) {
      const k = effectiveStage(s);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [inWindow]);

  return (
    <>
      {booking ? (
        <BookPanel
          onClose={() => setBooking(false)}
          /* Straight onto the file, the same landing as booking from a lead -
             the next thing to do is the research, and it lives there. */
          onBooked={(id) => router.push(`/market-appraisals/${id}?confirm=1`)}
        />
      ) : null}
      <PageHeader
        title="Market Appraisals"
        blurb="Booked, prepared, appraised, won. Everything between a landlord saying yes to a visit and signing terms."
        /* His hair starts near the very top of the artwork, so this one
           cannot bleed off the top the way the dashboard does without taking
           his head with it. 330 matches the height the other two scenes
           stand at.

           Pushed down 4% so the shadows under his feet run into the line and
           are erased by it, rather than the whole scene stopping politely
           above the rule. */
        /* Named for the artwork, not the page. The first appraisals scene was
           overwritten in place at this same path, so every browser that had
           loaded the page kept serving the old one for the four hours the
           cache-control allows - James saw the wrong man long after it went
           live. A new drawing gets a new name from here on, and the old file
           is deleted, so a swap can never be masked by a cache. */
        illustration="/illustrations/appraisals-desk.webp"
        /**
         * Sunk to the middle of the desk legs.
         *
         * He stood at 330 with 0.96 above the rule - 317px of artwork over the
         * line and 13 under it, which is a man behind a shelf rather than one
         * at a desk that carries on below. 620 x 0.5 buried half of him but
         * put the cut at the TOP of the legs and made him too big with it;
         * James, 10 Sep 2026: "make him a touch smaller and then bring him up
         * slightly... where the line cuts it off, it should be going about
         * halfway through the legs of the desk."
         *
         * Smaller (620 → 520) and the seat lifted (0.5 → 0.58), which is both
         * halves of that: less of him overall, and the line crossing further
         * down the legs rather than at their top. 302px above the rule.
         */
        /* Smaller, and tucked further behind the desk (James, 11 Sep): his
           head sits a touch above the title and never reaches the search
           bar. 380 x 0.6 puts 228px of him above the rule. */
        illustrationHeight={380}
        seat={0.6}
        illustrationAspect={0.9704}
        illustrationCrop
        lineBreak="none"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search appraisals…"
        actions={
          /* flex-wrap, like every other actions row. Without it the date
             picker and the view switch are one unbreakable 233px block, which
             on a 390px screen would not fit beside the reserved artwork and
             took the page 32px sideways (10 Sep 2026). */
          <div className="flex flex-wrap items-center gap-2.5">
            {/* First, and the only filled button on the row: it is the one
                thing on this screen that MAKES something rather than sorting
                what is already here. */}
            <button
              type="button"
              onClick={() => setBooking(true)}
              className="btn-press flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-page"
            >
              <DoodleIcon name="calendar" size={13} />
              Book an appraisal
            </button>
            {/* List or tiles, with the words on - the same switch, in the
                same place, as Leads (James, 11 Sep). The marker SLIDES
                between them - see components/Segmented. */}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "list" as const, label: "List", icon: <DoodleIcon name="list" size={13} /> },
                { id: "tiles" as const, label: "Tiles", icon: <DoodleIcon name="grid" size={13} /> },
              ]}
            />
            {/* Was a native <select>, which looked exactly like what it was
                next to hand-drawn pills. See components/PickOne. */}
            <PickOne
              label="Any date"
              icon="calendar"
              options={PERIODS.map((p) => ({ id: p.id, label: p.label }))}
              value={period}
              onChange={(v) => setPeriod((v ?? "any") as PeriodId)}
              /* PERIODS carries its own "Any date", and the page cannot hold
                 null, so no second any row. */
              clearable={false}
              neutral="any"
            />
            <GuideButton
              id="appraisals"
              className="flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
            />
          </div>
        }
      />

      {/* ── The spine. Shared with Listings and Applications since 10 Sep;
             the reasoning lives in components/StageTabs. ── */}
      <div className="fade-up relative mt-4 overflow-hidden rounded-[22px] border border-line/50 bg-white px-5 pb-4 pt-1">
        <CornerSwell />
        <div className="relative">
      {/* Boxed, so no flow chevrons between the tabs: with them the seven
          did not fit the box on a laptop and the last one wrapped alone. */}
      <StageTabs
        wrap
        flow={false}
        label="Appraisal stages"
        allId="open"
        value={filter}
        onChange={setFilter}
        stages={[
          { id: "open" as const, label: "All open", icon: "analytics", count: openCount, blurb: "Everything still in play" },
          ...OPEN_STAGES.map((st) => ({
            id: st.id, label: st.label, icon: STAGE_ICON[st.id] ?? "doc",
            count: counts.get(st.id) ?? 0, blurb: st.blurb,
          })),
        ]}
      />
        </div>
      </div>

      <div className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="hand text-[17px]">
            {filter === "open" ? "Open appraisals" : MA_STAGES.find((s) => s.id === filter)?.label}
            <span className="figures ml-2 text-[14px] text-muted">{rows.length}</span>
          </h2>
          {filter !== "open" && (
            <button type="button" onClick={() => setFilter("open")} className="text-[11.5px] text-muted underline">
              Show all open
            </button>
          )}
        </div>

        {live === null ? (
          <p className="py-6 text-[12.5px] text-muted">Fetching the appraisals…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted">
            Nothing at this stage{period === "any" ? "" : " in that date range"}.
          </p>
        ) : (
          /* A row opens the FILE, not a drawer. An appraisal is lived in for
             three weeks and carries thirty fields of material information -
             that wants an address you can bookmark, send, and come back to.
             True of a tile as much as a line. */
          <ul className={view === "tiles" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
            {rows.map((m) => (
              <li key={m.id}>
                <AppraisalCard m={m} tile={view === "tiles"} />
              </li>
            ))}
          </ul>
        )}
      </div>

    </>
  );
}

/* Sage, for what is done - the same two values the appraisal file uses. */
const SAGE_INK = "#56634a";
const SAGE_WASH = "#f1f4ec";
const SPINE = MA_STAGES.filter((s) => s.id !== "lost");

/**
 * One appraisal, as a card (tiles) or a row (list). Same content either
 * way, in the file's own style: white with a hairline, the address in the
 * title face, a seven-segment strip for where it is up to, and the state as
 * pills at the foot - blush for a missing figure, sage for a recorded one.
 */
function AppraisalCard({ m, tile }: { m: MarketAppraisal & { live: MaStage }; tile: boolean }) {
  const when = m.appointmentAt
    ? new Date(m.appointmentAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  const at = SPINE.findIndex((s) => s.id === m.live);
  const stage = MA_STAGES.find((s) => s.id === m.live)?.label;
  const missing = needsValuation(m);

  const strip = (
    <span className="flex gap-1" aria-label={`Stage ${at + 1} of ${SPINE.length}`} title={`Stage ${at + 1} of ${SPINE.length}: ${stage}`}>
      {SPINE.map((s, i) => (
        <span
          key={s.id}
          className={`h-1.5 flex-1 rounded-full ${i === at ? "bg-accent-dark" : i > at ? "bg-line/40" : ""}`}
          style={i < at ? { background: SAGE_INK } : undefined}
        />
      ))}
    </span>
  );

  const badges = (
    <>
      {(m.unreadMessages ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-dark px-2.5 py-1 text-[11px] font-semibold text-white">
          <DoodleIcon name="message" size={11} />
          {m.unreadMessages === 1 ? "New message" : `${m.unreadMessages} new messages`}
        </span>
      )}
      {missing && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">No figure yet</span>}
      {m.valuation ? (
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>
          {gbp(m.valuation)} pcm
        </span>
      ) : null}
      <span className="rounded-full border border-line/60 px-2.5 py-1 text-[11px] font-semibold text-muted">{stage}</span>
    </>
  );

  /* The landlord's number and address. Both are DERIVED from the contact
     record, so either can be null - one sentence when we hold neither. */
  const contact = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
      {!m.landlordMobile && !m.landlordEmail ? (
        <span className="inline-flex items-center gap-1.5">
          <DoodleIcon name="user" size={11} />
          No contact recorded
        </span>
      ) : (
        <>
          {m.landlordMobile && (
            <span className="inline-flex items-center gap-1.5">
              <DoodleIcon name="call" size={11} />
              {m.landlordMobile}
            </span>
          )}
          {m.landlordEmail && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <DoodleIcon name="mail" size={11} />
              <span className="truncate">{m.landlordEmail}</span>
            </span>
          )}
        </>
      )}
    </span>
  );

  const house = (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
      <DoodleIcon name="home" size={18} />
    </span>
  );

  if (tile) {
    return (
      <Link
        href={`/market-appraisals/${m.id}`}
        className="flex h-full flex-col rounded-[22px] border border-line/50 bg-white p-5 transition-colors hover:border-ink/40"
      >
        <div className="flex items-start gap-3.5">
          {house}
          <div className="min-w-0">
            <span className="hand block text-[16px] leading-tight">{m.address}</span>
            <p className="mt-1 text-[12px]">
              <span className="font-semibold">{m.landlord}</span>
              <span className="text-muted">{m.postcode ? ` · ${m.postcode}` : ""}</span>
            </p>
          </div>
        </div>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-muted">
          <DoodleIcon name="calendar" size={12} />
          {when ?? "No date booked"}
          {m.agent ? <span> · with {m.agent}</span> : <span> · no agent recorded</span>}
        </p>
        <div className="mt-1.5">{contact}</div>
        <div className="mt-auto pt-5">
          {strip}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">{badges}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/market-appraisals/${m.id}`}
      /* Fixed columns for the strip and the pills, so the strip starts at the
         same place on every row and sits in the middle of the space rather
         than up against the pills (James, 11 Sep). */
      className="grid items-center gap-x-5 gap-y-3 rounded-[22px] border border-line/50 bg-white p-4 transition-colors hover:border-ink/40 lg:grid-cols-[auto_minmax(0,1fr)_280px_230px] lg:pr-5"
    >
      <span className="hidden lg:block">{house}</span>
      <div className="min-w-0">
        <span className="hand block text-[15px] leading-tight">{m.address}</span>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span>
            <span className="font-semibold">{m.landlord}</span>
            <span className="text-muted">{m.postcode ? ` · ${m.postcode}` : ""}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <DoodleIcon name="calendar" size={11} />
            {when ?? "No date booked"}
            {m.agent ? ` · with ${m.agent}` : ""}
          </span>
        </p>
        <div className="mt-1">{contact}</div>
      </div>
      <div className="w-[200px] max-w-full">
        {strip}
        <p className="mt-1.5 text-[10.5px] text-muted">Stage {at + 1} of {SPINE.length}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">{badges}</div>
    </Link>
  );
}

/* ─────────────────────── booking one from this screen ────────────────────── */

/**
 * Book an appraisal without a lead behind it.
 *
 * Every appraisal until now had to start life as a landlord lead, because the
 * only Book button in the OS was on a lead's file. That is not how the work
 * arrives: a landlord rings the office, or catches an agent at a viewing, and
 * there is no lead and no time to make one. The screen that lists appraisals
 * could not create one, which is item c12 on the pilot list and one of the
 * three "buttons that do nothing" found in the 11 Sep sweep.
 *
 * Nothing new behind it. `POST /api/appraisals` has always accepted a null
 * leadId and `createAppraisal` has always minted its own id in that case; what
 * was missing was a door. So this is a form over the route that Leads already
 * uses, and a booking made here is the same record, at the same stage, on the
 * same screen.
 *
 * ── The confirmation ──────────────────────────────────────────────────────
 *
 * A dated booking made FROM A LEAD emails the landlord their confirmation and
 * the calendar file. One made here cannot: the landlord's email is read off
 * the lead's contact record, and there is no contact. The route already
 * handles that and says so rather than failing, and so does this panel - the
 * agent is told plainly that nothing went out, because the alternative is an
 * agent who believes the landlord has been confirmed when they have not.
 */
function BookPanel({ onClose, onBooked }: { onClose: () => void; onBooked: (id: string) => void }) {
  const [landlord, setLandlord] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [agent, setAgent] = useState("");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Whoever is signed in, as the agent on the booking. Prefilled rather than
     asked: the agent booking it is the agent going, nine times in ten. */
  useEffect(() => {
    fetchMe()
      .then((j) => setAgent((j?.user?.name ?? "").trim()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready = landlord.trim().length > 0 && address.trim().length > 0;

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appraisals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: null,
          landlord: landlord.trim(),
          address: address.trim(),
          postcode: postcode.trim() || undefined,
          agent: agent.trim() || null,
          /* datetime-local has no zone. Sent as an ISO instant in the
             browser's own zone, which is the agent's, which is the one the
             appointment is in. */
          appointmentAt: at ? new Date(at).toISOString() : null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { appraisal?: { id?: string }; error?: string };
      if (j.error || !j.appraisal?.id) throw new Error(j.error ?? "That didn't save.");
      onBooked(j.appraisal.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] outline-none transition focus:border-black/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b201d]/45 p-3 sm:p-6" onClick={onClose}>
      <div
        className="drawer-in w-full max-w-[520px] overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Book an appraisal"
      >
        <div className="flex items-start gap-3 border-b border-line/60 px-6 py-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name="calendar" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Market appraisals</p>
            <h2 className="text-[22px] font-bold leading-tight">Book an appraisal</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              For one that never came through as a lead. It lands on this screen at Booked, the same as any other.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="space-y-3.5 px-6 py-5">
          <label className="block">
            <span className="text-[12px] font-semibold">The landlord</span>
            <input value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder="Their name" className={`mt-1.5 ${field}`} autoFocus />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold">The property</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="The address you are going to" className={`mt-1.5 ${field}`} />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold">Postcode</span>
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Read from the address if left blank" className={`mt-1.5 ${field}`} />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold">Who is going</span>
              <input value={agent} onChange={(e) => setAgent(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
          </div>
          <label className="block">
            <span className="text-[12px] font-semibold">When</span>
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={`mt-1.5 ${field}`} />
            <span className="mt-1.5 block text-[11.5px] leading-relaxed text-muted">
              A date can wait. One booked without it shows on this screen as needing a time, which is the chase.
            </span>
          </label>

          {/* Said before they press it, not after. */}
          <p className="rounded-xl border border-line/80 bg-box px-3.5 py-2.5 text-[11.5px] leading-relaxed">
            Booked here, <span className="font-semibold">nothing is emailed to the landlord.</span> The confirmation and
            the calendar invite go out when the appraisal comes from a lead, because that is where their email address
            is. Send it yourself, or add them as a lead first.
          </p>

          {error ? <p className="rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12.5px] text-[#9d4340]">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-6 py-4">
          <button
            type="button"
            onClick={save}
            disabled={!ready || busy}
            className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Booking…" : "Book it"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
            Cancel
          </button>
          {!ready ? <span className="text-[11.5px] text-muted">A landlord and an address, and it can go in.</span> : null}
        </div>
      </div>
    </div>
  );
}
