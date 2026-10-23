"use client";

import { useEffect, useMemo, useState } from "react";
import { BoardSkeleton } from "@/components/Skeleton";
import { peekJson, readJson } from "@/lib/page-cache";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import PickOne from "@/components/PickOne";
import ListSearch from "@/components/ListSearch";
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
import BookAppraisalWizard from "@/components/appraisal/BookAppraisalWizard";
import { searchMatches } from "@/lib/search-match";
import { useNewLook } from "@/lib/use-new-look";
import { Badge, Ico, Mast, Tabs } from "@/components/new-look/Parts";

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
  /* The new look (lib/new-look "appraisals", 23 Oct 2026): null until known. */
  const look = useNewLook("appraisals");
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
  const [live, setLive] = useState<MarketAppraisal[] | null>(() => peekJson<{ appraisals?: MarketAppraisal[] }>("/api/appraisals")?.appraisals ?? null);
  /* A failed read is said, never shown as "Nothing at this stage" (Rig run 4, P-075). */
  const [loadError, setLoadError] = useState<string | null>(null);
  /* Booking one from here: a three-screen wizard that makes the landlord a
     lead first (components/appraisal/BookAppraisalWizard). */
  const [booking, setBooking] = useState(false);
  /* Bumped when the wizard saves, so the board reads the book again. */
  const [reload, setReload] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let gone = false;
    /* The last good read paints at once (lib/page-cache); this corrects it. */
    readJson<{ appraisals?: MarketAppraisal[]; error?: string }>("/api/appraisals", (j) => Array.isArray(j?.appraisals) && !j.error)
      .then((j) => {
        if (gone) return;
        if (!Array.isArray(j?.appraisals) || j.error) {
          setLoadError("We couldn't read the appraisals just now. Nothing is lost - refresh in a minute.");
          setLive((cur) => cur ?? []);
          return;
        }
        setLoadError(null);
        setLive(j.appraisals);
      })
      .catch(() => {
        if (gone) return;
        setLoadError("We couldn't read the appraisals just now. Nothing is lost - refresh in a minute.");
        setLive((cur) => cur ?? []);
      });
    return () => {
      gone = true;
    };
  }, [reload]);

  /* Real bookings first, then the samples. Two lists rather than one because
     they are not the same kind of thing: one is this agent's actual work and
     the other is furniture. Concatenating them and sorting by urgency would
     bury a real appraisal among stand-ins. */
  /* Archived by hand (Tidy away, 23 Oct 2026) is off every tab and kept
     behind its own Archived list, where the file's Bring back undoes it. */
  const [showArchived, setShowArchived] = useState(false);
  const archived = useMemo(() => (live ?? []).filter((m) => m.archivedAt), [live]);
  const all = useMemo(() => (live ?? []).filter((m) => !m.archivedAt), [live]);

  const rows = useMemo(() => {
    const needle = q.trim();
    const withStage = all
      .map((m) => ({ ...m, live: effectiveStage(m) }))
      .filter((m) => inPeriod(m.appointmentAt, period))
      .filter((m) => !needle || searchMatches(needle, m.address, m.postcode, m.landlord, m.agent));
    const open = withStage.filter((m) => m.live !== "won" && m.live !== "lost");
    if (showArchived) {
      return archived
        .map((m) => ({ ...m, live: effectiveStage(m) }))
        .filter((m) => !needle || searchMatches(needle, m.address, m.postcode, m.landlord, m.agent))
        .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
    }
    return (filter === "open" ? open : withStage.filter((m) => m.live === filter)).sort(
      (a, b) => urgencyOf(a) - urgencyOf(b)
    );
  }, [filter, all, archived, showArchived, period, q]);

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

  /* ── THE NEW LOOK (lib/new-look "appraisals", 23 Oct 2026) ──────────────
     The same book, stages, date window, search and archive as the board
     below, drawn the new way: a type-only header, one filter row, text tabs,
     and the stages as lanes side by side (or rows on hairlines). The old
     board stays underneath until the switch has bedded in. */
  if (look === null) {
    return <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Opening Market Appraisals…</p>;
  }
  if (look) {
    const tabValue = showArchived ? "archived" : filter;
    const stageBlurb = showArchived
      ? "Tidied away by hand. Open one and Bring back puts it on the board again."
      : filter === "open"
        ? "Everything still in play, the most pressing first."
        : noDash(MA_STAGES.find((s) => s.id === filter)?.blurb ?? "");
    const weekAhead = inWindow.filter((m) => {
      if (!m.appointmentAt || m.cancelledAt) return false;
      const t = new Date(m.appointmentAt).getTime();
      return t >= Date.now() && t <= Date.now() + 7 * 864e5;
    }).length;
    const unreadFiles = all.filter((m) => (m.unreadMessages ?? 0) > 0).length;
    const lanes = filter === "open" ? OPEN_STAGES : MA_STAGES.filter((s) => s.id === filter);
    const narrowed = Boolean(q.trim()) || period !== "any";
    return (
      <>
        {booking ? (
          <BookAppraisalWizard onClose={() => setBooking(false)} onFinished={() => setReload((n) => n + 1)} />
        ) : null}
        <div data-look="new" className="nl-page nl-rise nl-appr">
          <Mast
            title="Market Appraisals"
            blurb={
              live === null
                ? "Fetching the appraisals…"
                : loadError && all.length === 0
                  ? "From the day it's booked to signed terms."
                  : `From the day it's booked to signed terms. ${openCount} open${period === "any" ? "" : " in that window"}, ${weekAhead === 0 ? "no visits" : weekAhead === 1 ? "one visit" : `${weekAhead} visits`} in the next seven days${unreadFiles ? `, and ${unreadFiles === 1 ? "one landlord has" : `${unreadFiles} landlords have`} written back` : ""}.`
            }
            actions={
              <button type="button" data-steve="ma.book" onClick={() => setBooking(true)} className="nl-btn nl-btn--primary">
                <Ico name="plus" /> Book an appraisal
              </button>
            }
          />

          <div className="nl-filters">
            <label className="nl-fsearch">
              <Ico name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Address, postcode, landlord" aria-label="Search appraisals" />
            </label>
            <span className={`nl-fsel${period !== "any" ? " is-set" : ""}`}>
              <select aria-label="When" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
                {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </span>
            {narrowed && (
              <button type="button" className="nl-fmore" onClick={() => { setQ(""); setPeriod("any"); }}>
                Clear
              </button>
            )}
            <span className="nl-fcount">{live === null ? "" : `${rows.length} ${rows.length === 1 ? "appraisal" : "appraisals"}`}</span>
            <span className="nl-toggle" role="group" aria-label="Show as">
              <button type="button" className={view === "tiles" ? "is-on" : ""} aria-pressed={view === "tiles"} onClick={() => setView("tiles")}>Lanes</button>
              <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
            </span>
          </div>

          <div className="mt-6">
            <Tabs
              label="Appraisal stages"
              value={tabValue}
              onChange={(id) => {
                if (id === "archived") {
                  setShowArchived(true);
                  return;
                }
                setFilter(id as MaStage | "open");
                setShowArchived(false);
              }}
              items={[
                { id: "open", label: "All open", count: live === null ? null : openCount },
                ...OPEN_STAGES.map((st) => ({ id: st.id as string, label: st.label, count: live === null ? null : counts.get(st.id) ?? 0 })),
                ...(archived.length > 0 ? [{ id: "archived", label: "Archived", count: archived.length }] : []),
              ]}
            />
            <p className="nl-meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{stageBlurb}</span>
              {(filter !== "open" || showArchived) && (
                <button type="button" className="nl-link" onClick={() => { setFilter("open"); setShowArchived(false); }}>
                  Show all open
                </button>
              )}
            </p>
          </div>

          <div className="mt-7">
            {loadError && (
              <div className="nl-appr-error" role="alert">
                <p className="nl-block-title">The appraisals didn&apos;t load</p>
                <p className="nl-meta mt-1">{loadError}</p>
              </div>
            )}
            {live === null ? (
              <BoardSkeleton kind="rows" label="Fetching the appraisals…" count={5} />
            ) : rows.length === 0 && loadError ? null : rows.length === 0 ? (
              <p className="nl-empty">
                {showArchived ? "Nothing archived matches that." : q.trim() ? "Nothing matches that search." : `Nothing at this stage${period === "any" ? "" : " in that date range"}.`}
              </p>
            ) : view === "tiles" && !showArchived ? (
              <div className={`nl-appr-lanes${lanes.length === 1 ? " is-one" : ""}`}>
                {lanes.map((st) => {
                  const items = rows.filter((m) => m.live === st.id);
                  return (
                    <section key={st.id} className="nl-appr-lane" aria-label={st.label}>
                      <div className="nl-appr-lane-head">
                        <h2 className="nl-section-title">{st.label}</h2>
                        <span className="nl-count">{items.length}</span>
                      </div>
                      {items.length === 0 ? (
                        <p className="nl-appr-lane-empty">Nothing here{narrowed ? " that matches" : ""}.</p>
                      ) : (
                        <div className="nl-appr-lane-items">
                          {items.map((m) => <NlLaneItem key={m.id} m={m} />)}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="nl-appr-rows">
                {rows.map((m) => <NlRow key={m.id} m={m} />)}
              </div>
            )}
          </div>

          <p className="nl-appr-foot">
            <InfoIcon />
            Once the terms are signed and the checks are done, an appraisal becomes a listing.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {booking ? (
        <BookAppraisalWizard onClose={() => setBooking(false)} onFinished={() => setReload((n) => n + 1)} />
      ) : null}
      <PageHeader
        guide="appraisals"
        title="Market Appraisals"
        blurb="Booked, prepared, appraised, won. Everything between a landlord saying yes to a visit and signing terms."
        /* The board's search is the icon at the list's top right
           (components/ListSearch, 11 Oct 2026); finding anything is ⌘K. */
        search={false}
        actions={
          /* flex-wrap, like every other actions row. Without it the date
             picker and the view switch are one unbreakable 233px block, which
             on a 390px screen would not fit beside the reserved artwork and
             took the page 32px sideways (10 Sep 2026). */
          <div className="flex flex-wrap items-center gap-2.5">
            {/* First, and the only filled button on the row: it is the one
                thing on this screen that MAKES something rather than sorting
                what is already here. */}
            <button data-steve="ma.book"
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
        onChange={(v) => { setFilter(v); setShowArchived(false); }}
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="hand text-[17px]">
            {showArchived ? "Archived" : filter === "open" ? "Open appraisals" : MA_STAGES.find((s) => s.id === filter)?.label}
            <span className="figures ml-2 text-[14px] text-muted">{rows.length}</span>
          </h2>
          <span className="flex items-center gap-3">
            {(filter !== "open" || showArchived) && (
              <button type="button" onClick={() => { setFilter("open"); setShowArchived(false); }} className="text-[11.5px] text-muted underline">
                Show all open
              </button>
            )}
            {archived.length > 0 && !showArchived && (
              <button type="button" onClick={() => setShowArchived(true)} className="text-[11.5px] text-muted underline">
                Archived ({archived.length})
              </button>
            )}
            <ListSearch value={q} onChange={setQ} placeholder="Address, postcode, landlord…" />
          </span>
        </div>

        {loadError && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">{loadError}</p>}
        {live === null ? (
          <BoardSkeleton kind={view === "tiles" ? "cards" : "rows"} label="Fetching the appraisals…" count={view === "tiles" ? 6 : 5} />
        ) : rows.length === 0 && loadError ? null : rows.length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted">
            {showArchived ? "Nothing archived matches that." : <>Nothing at this stage{period === "any" ? "" : " in that date range"}.</>}
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
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  /* Cancelled (15 Oct 2026): says so, with the time it was for. */
  const when = m.appointmentAt ? fmt(m.appointmentAt) : m.cancelledAt ? `Cancelled${m.cancelledWas ? ` - was ${fmt(m.cancelledWas)}` : ""}` : null;
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
      {m.cancelledAt && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">Cancelled</span>}
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
      <Link data-steve-row=""
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
    <Link data-steve-row=""
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


/* ── the new look's pieces (lib/new-look "appraisals") ────────────────── */

/** No em dashes in anything a person reads (house rule); the stage blurbs carry some. */
const noDash = (t: string) => t.replace(/\s*—\s*/g, " - ");

const nlWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function nlWhenLine(m: MarketAppraisal) {
  if (m.appointmentAt) return nlWhen(m.appointmentAt);
  if (m.cancelledAt) return `Cancelled${m.cancelledWas ? ` - was ${nlWhen(m.cancelledWas)}` : ""}`;
  return "No date booked";
}

function NlBadges({ m }: { m: MarketAppraisal & { live: MaStage } }) {
  const unread = m.unreadMessages ?? 0;
  const missing = needsValuation(m);
  if (!unread && !m.cancelledAt && !missing) return null;
  return (
    <span className="nl-appr-badges">
      {unread > 0 && <Badge tone="accent">{unread === 1 ? "New message" : `${unread} new messages`}</Badge>}
      {m.cancelledAt && <Badge tone="accent">Cancelled</Badge>}
      {missing && <Badge tone="warning">No figure yet</Badge>}
    </span>
  );
}

/** One appraisal in its stage's lane: the address, who and when, and where it's up to. */
function NlLaneItem({ m }: { m: MarketAppraisal & { live: MaStage } }) {
  return (
    <Link data-steve-row="" href={`/market-appraisals/${m.id}`} className="nl-appr-item">
      <span className="nl-strong">{m.address}</span>
      <span className="nl-meta">
        {m.landlord}
        {m.postcode && !m.address.toUpperCase().includes(m.postcode.toUpperCase()) ? ` · ${m.postcode}` : ""}
      </span>
      <span className="nl-mono">
        {nlWhenLine(m)}
        {m.agent ? ` · ${m.agent}` : ""}
      </span>
      {(m.valuation || m.stageWhy) && (
        <span className={`nl-appr-note${m.valuation ? " is-good" : ""}`}>
          {m.valuation ? `${gbp(m.valuation)} pcm` : ""}
          {m.valuation && m.stageWhy ? " · " : ""}
          {m.stageWhy ?? ""}
        </span>
      )}
      <NlBadges m={m} />
    </Link>
  );
}

/** The seven steps as a thin line: done in ink, now in coral, the rest a hairline. */
function NlStrip({ m }: { m: MarketAppraisal & { live: MaStage } }) {
  const at = SPINE.findIndex((s) => s.id === m.live);
  const stage = MA_STAGES.find((s) => s.id === m.live)?.label;
  return (
    <span className="nl-appr-strip" title={at >= 0 ? `Stage ${at + 1} of ${SPINE.length}: ${stage}` : stage}>
      <span className="nl-appr-strip-bars" aria-hidden>
        {SPINE.map((s, i) => <i key={s.id} className={i < at ? "done" : i === at ? "now" : ""} />)}
      </span>
      <span className="nl-meta">{at >= 0 ? `${stage} · ${at + 1} of ${SPINE.length}` : stage}</span>
    </span>
  );
}

/** One appraisal as a row on a hairline: who, when, how to reach them, where it's up to. */
function NlRow({ m }: { m: MarketAppraisal & { live: MaStage } }) {
  return (
    <Link data-steve-row="" href={`/market-appraisals/${m.id}`} className="nl-appr-row">
      <span className="nl-appr-row-main">
        <span className="nl-strong">{m.address}</span>
        <span className="nl-meta">
          {m.landlord}
          {m.postcode && !m.address.toUpperCase().includes(m.postcode.toUpperCase()) ? ` · ${m.postcode}` : ""}
        </span>
        <span className="nl-appr-contact">
          {!m.landlordMobile && !m.landlordEmail ? (
            <span>No contact recorded</span>
          ) : (
            <>
              {m.landlordMobile && <span><Ico name="phone" size={12} /> {m.landlordMobile}</span>}
              {m.landlordEmail && <span className="min-w-0 truncate"><Ico name="mail" size={12} /> {m.landlordEmail}</span>}
            </>
          )}
        </span>
      </span>
      <span className="nl-appr-row-when">
        <span className="nl-mono">{nlWhenLine(m)}</span>
        <span className="nl-meta">{m.agent ? `with ${m.agent}` : "No agent recorded"}</span>
      </span>
      <NlStrip m={m} />
      <span className="nl-appr-row-tags">
        {m.valuation ? <Badge tone="good" plain>{gbp(m.valuation)} pcm</Badge> : null}
        <NlBadges m={m} />
      </span>
    </Link>
  );
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
