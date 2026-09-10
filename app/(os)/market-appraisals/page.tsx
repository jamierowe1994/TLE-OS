"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import PickOne from "@/components/PickOne";
import Segmented from "@/components/Segmented";
import StageTabs from "@/components/StageTabs";
import { Pill } from "@/components/Wire";
import {
  MA_STAGES,
  OPEN_STAGES,
  effectiveStage,
  needsValuation,
  urgencyOf,
  type MarketAppraisal,
  type MaStage,
} from "@/lib/market-appraisal";

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
  /* Narrowing by date, and how the rows are drawn. Both are view state and
     neither is persisted: they are how somebody is looking right now, not a
     setting about them. */
  const [period, setPeriod] = useState<PeriodId>("any");
  const [view, setView] = useState<"list" | "tiles">("list");
  /* The appraisals actually booked through the OS. Null while we are still
     asking, so the screen can say "loading" rather than flashing "none yet" at
     somebody who has just booked one. */
  const [live, setLive] = useState<MarketAppraisal[] | null>(null);
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
    const withStage = all
      .map((m) => ({ ...m, live: effectiveStage(m) }))
      .filter((m) => inPeriod(m.appointmentAt, period));
    const open = withStage.filter((m) => m.live !== "won" && m.live !== "lost");
    return (filter === "open" ? open : withStage.filter((m) => m.live === filter)).sort(
      (a, b) => urgencyOf(a) - urgencyOf(b)
    );
  }, [filter, all, period]);

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
    if (id && all.some((m) => m.id === id)) router.replace(`/market-appraisals/${id}`);
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
        illustrationHeight={520}
        seat={0.58}
        illustrationAspect={0.9704}
        illustrationCrop
        lineBreak="none"
        actions={
          /* flex-wrap, like every other actions row. Without it the date
             picker and the view switch are one unbreakable 233px block, which
             on a 390px screen would not fit beside the reserved artwork and
             took the page 32px sideways (10 Sep 2026). */
          <div className="flex flex-wrap items-center gap-2">
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
            {/* List or tiles. Two ways of reading the same rows: a list to
                work down, tiles to take in. Nothing is hidden in either.
                The marker SLIDES between them - see components/Segmented. */}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "list" as const, title: "List view", icon: <DoodleIcon name="list" size={14} /> },
                { id: "tiles" as const, title: "Tile view", icon: <DoodleIcon name="grid" size={14} /> },
              ]}
            />
          </div>
        }
      />

      {/* ── The spine. Shared with Listings and Applications since 10 Sep;
             the reasoning lives in components/StageTabs. ── */}
      <StageTabs
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

      <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px]">
            {filter === "open" ? "Open appraisals" : MA_STAGES.find((s) => s.id === filter)?.label}
            <span className="figures ml-1.5 text-muted">({rows.length})</span>
          </h2>
          {filter !== "open" && (
            <button type="button" onClick={() => setFilter("open")} className="text-[11.5px] text-muted underline">
              Show all open
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted">
            Nothing at this stage{period === "any" ? "" : " in that date range"}.
          </p>
        ) : (
          /* A row opens the FILE, not a drawer. An appraisal is lived in for
             three weeks and carries thirty fields of material information -
             that wants an address you can bookmark, send, and come back to.
             True of a tile as much as a line. */
          <ul className={view === "tiles" ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
            {rows.map((m) => {
              const when = m.appointmentAt
                ? new Date(m.appointmentAt).toLocaleString("en-GB", {
                    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })
                : null;
              const stage = MA_STAGES.find((s) => s.id === m.live)?.label;
              const badges = (
                <>
                  {/* The forgotten-valuation flag. It used to be a stage of its
                      own; as a flag it can shout from whichever stage the file
                      is actually sitting on. */}
                  {needsValuation(m) && <Pill tone="accent">No figure yet</Pill>}
                  {m.valuation ? <Pill tone="good">{gbp(m.valuation)} pcm</Pill> : null}
                  <Pill tone="neutral">{stage}</Pill>
                </>
              );

              /* The landlord's number and address, each behind its own drawn
                 icon. Both are DERIVED from the contact record, so either can
                 be null - it says "not recorded" rather than leaving a blank
                 that reads as still loading. */
              const contact = (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  {!m.landlordMobile && !m.landlordEmail ? (
                    /* Holding neither, one sentence. Two "not recorded"s side
                       by side under their own icons read as the screen having
                       failed rather than as a contact we simply do not have. */
                    <span className="inline-flex items-center gap-1.5">
                      <DoodleIcon name="user" size={11} />
                      No contact recorded for this landlord
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
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <DoodleIcon name="mail" size={11} />
                          <span className="truncate">{m.landlordEmail}</span>
                        </span>
                      )}
                    </>
                  )}
                </span>
              );

              return (
                <li key={m.id} className={view === "tiles" ? "" : ""}>
                  <Link
                    href={`/market-appraisals/${m.id}`}
                    className={`block h-full rounded-xl border border-line/70 p-3.5 transition-colors hover:border-ink ${
                      view === "tiles" ? "bg-box" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="hand text-[14px]">{m.address}</span>
                      {view === "list" && <span className="flex shrink-0 items-center gap-1.5">{badges}</span>}
                    </div>

                    <p className="mt-1 text-[11.5px]">
                      {/* A lead has no postcode, so an appraisal booked from
                          one starts without it - and the separator has to go
                          with it, or the line reads "Beatrice Okonkwo · · no
                          agent". */}
                      <span className="font-semibold">{m.landlord}</span>
                      <span className="text-muted">
                        {m.postcode ? ` · ${m.postcode}` : ""}
                        {m.agent ? ` · with ${m.agent}` : " · no agent recorded"}
                      </span>
                    </p>

                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted">
                      <DoodleIcon name="calendar" size={11} />
                      {when ?? "no date booked"}
                    </p>

                    <div className="mt-1.5">{contact}</div>

                    {/* Tiles carry the badges at the foot instead of the head:
                        a card is read top to bottom, and the state is the
                        answer, not the question. */}
                    {view === "tiles" && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-3">{badges}</div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </>
  );
}
