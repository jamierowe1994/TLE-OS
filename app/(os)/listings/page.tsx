"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import Segmented from "@/components/Segmented";
import StageTabs from "@/components/StageTabs";
import ListingDrawer from "@/components/ListingDrawer";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import { DIARY } from "@/lib/diary";
import rexSample from "@/lib/rex-sample.json";

/**
 * Listings, as CARDS — each house gets the attention it deserves: a proper
 * photo, its address large, the rent big in the corner, and one quiet row of
 * the facts that matter (available from, bedrooms, viewings so far).
 *
 * One search (the header's), one row of filters beside Add-new-listing, and
 * nothing else between the agent and the houses. Everything here is still
 * REAL — the read-only REX pull of 6 Aug.
 */

type SampleListing = {
  /** Every photo REX holds, in its own order. Absent on the static fallback,
   *  which predates the OS carrying more than one. */
  images?: string[];
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  /** REX quotes some rents WEEKLY. Printing those as "pcm" understates a
   *  property fourfold, so the period travels with the number. */
  rentPeriod?: "month" | "week" | null;
  /** Monthly equivalent — comparisons only, never shown. */
  rentMonthly?: number | null;
  letAgreed: boolean;
  publicationStatus: string | null;
  availableFrom: string | null;
  epcExpiry: string | null;
  epcRating?: string | null;
  daysOnMarket: number | null;
  /** The day it went live, ISO. Absent on the static fallback, which is why
   *  the date window treats "no date" as never-published rather than as a
   *  row to hide. */
  publishedAt?: string | null;
  lastUpdated: string | null;
  imageCount: number;
  image: string | null;
  serviceType?: string | null;
  tenant?: { name: string; email: string; phone: string } | null;
};

type Counts = {
  currentRentals: number; published: number; draft: number;
  letAgreed: number; available: number;
};

const FALLBACK = rexSample.listings as SampleListing[];
const FALLBACK_COUNTS = rexSample.counts as Counts;

/** What to print under the price. Weekly rents say so. */
function rentPeriodLabel(l: SampleListing): string {
  return l.rentPeriod === "week" ? "per week" : "pcm";
}

function statusOf(l: SampleListing): { label: string; tone: "good" | "accent" | "neutral" } {
  if (l.letAgreed) return { label: "Let agreed", tone: "neutral" };
  if (l.publicationStatus === "published") return { label: "Available", tone: "good" };
  return { label: "Draft", tone: "accent" };
}

/** One labelled fact in a listing row: the icon, the caption, the value. */
function Fact({ icon, label, value, title }: { icon: string; label: string; value: string; title?: string }) {
  return (
    <span className="flex items-center gap-2">
      <DoodleIcon name={icon} size={13} className="shrink-0 text-accent-dark" />
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="figures block truncate text-[12px]" title={title}>{value}</span>
      </span>
    </span>
  );
}

/** How many viewings the diary knows about for this address. */
function viewingsFor(name: string): number {
  return DIARY.filter((a) => a.kind === "viewing" && a.what.includes(name)).length;
}

/**
 * When it went on the market.
 *
 * Same shape and the same words as the appraisal board's window, because it
 * is the same question asked of a different record - James, 10 Sep 2026:
 * "listings and market appraisals very similarly... it'll say Date Listed."
 * A listing with no go-live date has never been published, which is worth
 * seeing, so it survives every window except the ones about when something
 * happened.
 */
const PERIODS = [
  /* "Date listed" rather than "Any date": PickOne prints the chosen row's
     label on the button, and with `neutral` the any-row IS the resting state -
     so the resting word has to be the control's own name, or the screen shows
     a filter called "Any date" and never says what date it means. James, 10
     Sep: "on that one, it'll say Date Listed." */
  { id: "any", label: "Date listed" },
  { id: "month", label: "This month" },
  { id: "30", label: "Last 30 days" },
  { id: "older", label: "Older than 90 days" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

function listedIn(iso: string | null | undefined, period: PeriodId): boolean {
  if (period === "any") return true;
  if (!iso) return period !== "older";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return true;
  const now = Date.now();
  if (period === "30") return at >= now - 30 * 864e5;
  if (period === "older") return at < now - 90 * 864e5;
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return at >= from && at < to;
}

const RENT_BANDS = [
  { id: "under750", label: "Under £750", test: (r: number) => r < 750 },
  { id: "750to1000", label: "£750 – £1,000", test: (r: number) => r >= 750 && r <= 1000 },
  { id: "1000to1500", label: "£1,000 – £1,500", test: (r: number) => r > 1000 && r <= 1500 },
  { id: "over1500", label: "Over £1,500", test: (r: number) => r > 1500 },
];

const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "rent-low", label: "Rent — low to high" },
  { id: "rent-high", label: "Rent — high to low" },
];

/** The dropdown chip — same grammar as the leads bar. */
/**
 * One button, every filter behind it.
 *
 * There were four controls in a row - a sort, a rent band, a locality and the
 * availability switch - and each one opened its own little menu. Four buttons
 * that all mean "narrow this list" is four things to read before you can do
 * the one thing, and it got worse every time a filter was added (James, 10
 * Sep 2026).
 *
 * ── Why it is portalled ──────────────────────────────────────────────────
 *
 * The panel is rendered into <body>, not beside the button. The controls now
 * live inside the masthead, which animates and carries a clip-path, and a
 * menu positioned inside that is at the mercy of whatever its ancestors are
 * doing - which is how a dropdown ends up underneath the page instead of over
 * it. Out at the body it has nothing above it to be trapped by, and it is
 * placed from the button's own measured position.
 */
function FilterPanel({
  groups,
  active,
  onClear,
}: {
  groups: {
    label: string;
    options: { id: string; label: string }[];
    value: string | null;
    onChange: (v: string | null) => void;
  }[];
  active: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 8, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    /* Follows the button rather than freezing where it was opened - the page
       under it still scrolls. */
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[13px] transition-colors ${
          active
            ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
            : "border-line/80 bg-panel text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        <DoodleIcon name="setting" size={14} />
        Filter
        {active > 0 && (
          <span className="figures rounded-full bg-accent-dark px-1.5 text-[10px] font-bold text-page">{active}</span>
        )}
      </button>

      {open && at && createPortal(
        <>
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200] cursor-default"
          />
          <div
            data-filter-panel
            className="fade-up fixed z-[201] max-h-[70vh] w-[268px] overflow-auto rounded-2xl border border-line/80 bg-card p-3 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.34)]"
            style={{ top: at.top, left: at.left }}
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Filter</p>
              {active > 0 && (
                <button type="button" onClick={onClear} className="text-[11.5px] text-accent-dark underline">
                  Clear all
                </button>
              )}
            </div>
            {groups.map((g) => (
              <div key={g.label} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-[11px] font-semibold text-muted">{g.label}</p>
                <button
                  type="button"
                  onClick={() => g.onChange(null)}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent-soft/40 ${
                    g.value === null ? "font-semibold text-accent-dark" : ""
                  }`}
                >
                  Any
                </button>
                {g.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => g.onChange(o.id)}
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent-soft/40 ${
                      g.value === o.id ? "font-semibold text-accent-dark" : ""
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default function Listings() {
  /* Open BY ID, not by index. The book is re-read behind the page and its
     order changes as REX updates records, so an index taken at open time
     pointed at a different house a minute later (?open=228a Chapter Road
     opened 166 Gloucester Road North, 7 Sep). */
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [rentBand, setRentBand] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(null);
  /* Available used to be a switch of its own, because it answers the one
     question asked all day - what can I put someone in NOW. It is a stage on
     the tabs now, which answers the same question and three others beside it,
     and two controls for one filter is how a screen starts to disagree with
     itself. */
  const [stage, setStage] = useState<"all" | "Available" | "Let agreed" | "Draft">("all");
  const [period, setPeriod] = useState<PeriodId>("any");
  const [view, setView] = useState<"list" | "tiles">("list");

  /* ── The real book, out of REX. The static export stands in until it
        answers, so the page never renders empty. ── */
  const [book, setBook] = useState<{
    listings: SampleListing[];
    counts: Counts;
    live: boolean;
    loading: boolean;
    reason?: string;
  }>({ listings: FALLBACK, counts: FALLBACK_COUNTS, live: false, loading: true });

  useEffect(() => {
    let gone = false;
    fetch("/api/listings")
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (j.ok && j.live && Array.isArray(j.listings)) {
          setBook({ listings: j.listings, counts: j.counts, live: true, loading: false });
        } else {
          setBook({ listings: FALLBACK, counts: FALLBACK_COUNTS, live: false, loading: false, reason: j.reason });
        }
      })
      .catch(() => {
        if (!gone) setBook((b) => ({ ...b, loading: false, reason: "REX didn't answer — showing the last static export." }));
      });
    return () => { gone = true; };
  }, []);

  const LISTINGS = book.listings;
  /* ?open=<listing id> from the search bar or the bell: open that card once
     the book is here. Once, so closing it does not reopen it. */
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || !LISTINGS.length) return;
    const wanted = new URLSearchParams(window.location.search).get("open");
    if (!wanted) return;
    if (LISTINGS.some((l) => String(l.id) === wanted)) {
      setOpenId(wanted);
      openedFromUrl.current = true;
    }
  }, [LISTINGS]);
  const C = book.counts;

  const localities = useMemo(
    () => [...new Set(LISTINGS.map((l) => l.locality))].sort().map((x) => ({ id: x, label: x })),
    [LISTINGS]
  );

  /* Counted once, read twice. The blurb used to say "98 published and 170
     drafts" over tabs that said 58 available, 48 let agreed and 162 drafts -
     both right, counting different things, on the same screen. A let-agreed
     draft is one house, and it cannot be in two of these. */
  const byStage = useMemo(() => {
    const out = { Available: 0, "Let agreed": 0, Draft: 0 } as Record<string, number>;
    for (const l of LISTINGS) out[statusOf(l).label] = (out[statusOf(l).label] ?? 0) + 1;
    return out;
  }, [LISTINGS]);

  const board = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const band = RENT_BANDS.find((b) => b.id === rentBand);
    const rows = LISTINGS.filter((l) => {
      if (needle && !`${l.name} ${l.locality}`.toLowerCase().includes(needle)) return false;
      const cmp = l.rentMonthly ?? l.rent;
      if (band && !(cmp != null && band.test(cmp))) return false;
      if (loc && l.locality !== loc) return false;
      // "Available" is what the status chip already means — published and not
      // let agreed. Defined once, in statusOf, so the switch and the chip can
      // never drift apart and show a house the other disagrees with.
      if (stage !== "all" && statusOf(l).label !== stage) return false;
      if (!listedIn(l.publishedAt, period)) return false;
      return true;
    });
    // Most recent is the resting order (REX's own lastUpdated already leads);
    // the rent sorts rearrange on request.
    const monthly = (l: SampleListing) => l.rentMonthly ?? l.rent;
    if (sort === "rent-low") rows.sort((a, b) => (monthly(a) ?? 1e9) - (monthly(b) ?? 1e9));
    else if (sort === "rent-high") rows.sort((a, b) => (monthly(b) ?? 0) - (monthly(a) ?? 0));
    return rows;
  }, [LISTINGS, q, sort, rentBand, loc, stage, period]);

  return (
    <>
      <PageHeader
        title="Listings"
        blurb={
          book.loading
            ? "Fetching the rental book from REX…"
            : book.live
              ? `Live from REX — ${C.currentRentals} current rentals: ${byStage.Available} available, ${byStage["Let agreed"]} let agreed and ${byStage.Draft} still drafts.`
              : (book.reason ?? "Manage your properties and their marketing.")
        }
        /* Cropped at the bottom in the artwork itself, so the frame's bottom
           edge IS the rule: no seat and no dip means she is dropped by
           nothing and the crop lands exactly on the line, which reads as her
           sitting behind it. */
        illustration="/illustrations/reading-listings.webp"
        /* Same drawing with the lamp ON, for the dark. Not an inversion - a
           second artwork, which is why it is worth the extra file. */
        illustrationDark="/illustrations/reading-listings-dark.webp"
        illustrationAspect={1.121}
        lineBreak="none"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search properties…"
        /* One row of chrome: the filters, then the button that makes more
           houses. Nothing else stands between the agent and the board. */
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Date listed, then list or tiles - the same two controls, in the
                same order, as Market Appraisals and Applications. */}
            <PickOne
              label="Date listed"
              icon="calendar"
              options={PERIODS.map((x) => ({ id: x.id, label: x.label }))}
              value={period}
              onChange={(v) => setPeriod((v ?? "any") as PeriodId)}
              clearable={false}
              neutral="any"
            />
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "list" as const, title: "List view", icon: <DoodleIcon name="list" size={14} /> },
                { id: "tiles" as const, title: "Tile view", icon: <DoodleIcon name="grid" size={14} /> },
              ]}
            />
            <FilterPanel
              active={[sort, rentBand, loc].filter(Boolean).length}
              onClear={() => { setSort(null); setRentBand(null); setLoc(null); }}
              groups={[
                { label: "Sort by", options: SORTS, value: sort, onChange: setSort },
                { label: "Rent", options: RENT_BANDS, value: rentBand, onChange: setRentBand },
                { label: "Location", options: localities, value: loc, onChange: setLoc },
              ]}
            />
            <button
              type="button"
              className="hand flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] text-page transition-opacity hover:opacity-90"
            >
              <span className="text-base leading-none">+</span> Add new listing
            </button>
          </div>
        }
      />

      {/* ── The stages, and the filter for them. Same component and the same
             row as Market Appraisals and Applications. ── */}
      <StageTabs
        label="Listing statuses"
        allId="all"
        value={stage}
        onChange={setStage}
        flow={false}
        stages={[
          { id: "all" as const, label: "All listings", icon: "analytics", count: LISTINGS.length, blurb: "Everything on the rental book" },
          { id: "Available" as const, label: "Available", icon: "home", count: byStage.Available, blurb: "Published, and not let agreed - what you can put somebody in now" },
          { id: "Let agreed" as const, label: "Let agreed", icon: "key", count: byStage["Let agreed"], blurb: "Taken, and working through to a tenancy" },
          { id: "Draft" as const, label: "Draft", icon: "doc", count: byStage.Draft, blurb: "Not on the portals yet" },
        ]}
      />

      {/* ── The board, in the same panel the other two boards use. ── */}
      <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px]">
            {stage === "all" ? "All listings" : stage}
            <span className="figures ml-1.5 text-muted">({board.length})</span>
          </h2>
          {stage !== "all" && (
            <button type="button" onClick={() => setStage("all")} className="text-[11.5px] text-muted underline transition-colors hover:text-ink">
              Show all listings
            </button>
          )}
        </div>
        {board.length === 0 && (
          <p className="py-6 text-[12.5px] text-muted">
            Nothing matches{period === "any" ? "" : " in that window"} — widen the rent band or clear the filters.
          </p>
        )}
        <div className={`cascade ${view === "tiles" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-4"}`}>
        {board.map((l) => {
          const st = statusOf(l);
          const views = viewingsFor(l.name);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setOpenId(String(l.id))}
              // Thinner rule and less padding, so the photograph can grow
              // into the space rather than floating in a frame. p-2 with an
              // inner radius of 14 against the card's 16 keeps the two curves
              // concentric — the giveaway that a nested corner is wrong is
              // when the gap between the arcs is uneven.
              className="fade-up block-pop block w-full rounded-2xl border border-line/60 bg-box p-2 text-left hover:border-ink"
            >
              {/* The list card STACKS on a phone.

                  Side by side it is a 224px photograph that cannot shrink, the
                  details, and the price column that cannot shrink either -
                  which needs more than a 390px screen has, so the page scrolled
                  sideways (10 Sep 2026). Below sm the photograph goes full
                  width on top, exactly as the tiles view already does; from sm
                  up nothing changes. */}
              <div className={view === "tiles" ? "flex flex-col gap-3" : "flex flex-col gap-3 sm:flex-row sm:gap-4"}>
                <PropertyPhoto
                  src={l.image}
                  className={
                    view === "tiles"
                      ? "h-40 w-full shrink-0 rounded-[14px]"
                      : "h-40 w-full shrink-0 rounded-[14px] sm:h-24 sm:w-32"
                  }
                />

                <div
                  className={
                    view === "tiles"
                      ? "min-w-0 flex-1 px-1 pb-1"
                      : /* ── One row, read across ──────────────────────────
                           The name truncated on its own line, the four facts
                           stacked underneath it, and the rent pinned right -
                           which left a lake of white between the address and
                           the price and pushed the card taller than it needed
                           to be. James, 10 Sep 2026: "we have a load of white
                           space between the property name and the price per
                           month... I would rather utilise that space and make
                           this more of a grid... a bit more like applications."

                           So the facts move UP beside the name and become
                           columns, with the rent as the last one. Fixed
                           widths from md up so every card's columns line up
                           down the page - that is what makes it read as a
                           table rather than as five cards that happen to be
                           stacked. Below md they wrap, because six columns in
                           a phone's width is not a table either. */
                        "grid min-w-0 flex-1 items-center gap-x-4 gap-y-3 py-1 md:grid-cols-[minmax(0,1.35fr)_112px_78px_74px_66px_104px]"
                  }
                >
                  <span className="min-w-0">
                    {/* The chips — only what changes decisions. No 'For sale',
                        no 'Sponsored': everything here is a rental, ours. */}
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={st.tone}>{st.label}</Pill>
                      {l.tenant && <Pill tone="neutral">Tenanted</Pill>}
                      {l.imageCount === 0 && <Pill tone="accent">No photos</Pill>}
                      {l.epcExpiry == null && <Pill tone="neutral">EPC not filed</Pill>}
                    </span>
                    <span className="hand mt-1.5 block truncate text-[17px] leading-tight">{l.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                      <DoodleIcon name="home-1" size={12} className="shrink-0" />
                      <span className="truncate">{l.locality}</span>
                    </span>
                  </span>

                  {/* The facts, each its own column. Same four as before and
                      in the same order; they are beside the address now
                      instead of under it. */}
                  <Fact icon="calendar" label="Available from" value={l.availableFrom ?? "Now"} />
                  <Fact
                    icon="bed.png"
                    label="Bedrooms"
                    value="—"
                    title="Not in REX's listing projection — captured at the take-on"
                  />
                  <Fact icon="key" label="Viewings" value={String(views)} />
                  <Fact icon="folder" label="Photos" value={String(l.imageCount)} />

                  {/* A third of the book — mostly drafts — carries no rent at
                      all. A bare "£" reads as broken; "rent not set" reads as
                      a job to do, which is what it is. */}
                  <span className="md:text-right">
                    <span className="figures block text-[20px] leading-none">
                      {l.rent == null ? "—" : `£${l.rent.toLocaleString("en-GB")}`}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted">
                      {l.rent == null ? "rent not set" : rentPeriodLabel(l)}
                    </span>
                  </span>
                </div>
              </div>
            </button>
          );
        })}

        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Showing {board.length} of {C.currentRentals} current rentals ·{" "}
        <span className="font-semibold">Bedrooms</span> shows a dash on purpose — counts
        aren&apos;t in REX&apos;s listing projection; they arrive with the take-on and are
        never invented. <span className="font-semibold">Days on market</span> is only
        known for the published half: a draft has never been on a portal, so it has no
        clock to read.
      </p>

      <ListingDrawer
        listing={openId == null ? null : LISTINGS.find((l) => String(l.id) === openId) ?? null}
        onClose={() => setOpenId(null)}
        onStep={(d) =>
          setOpenId((id) => {
            /* Step through the board as shown - filtered and sorted - not the raw book. */
            const list = board.length ? board : LISTINGS;
            const i = list.findIndex((l) => String(l.id) === id);
            if (i < 0) return id;
            return String(list[(i + d + list.length) % list.length].id);
          })
        }
      />

      {/* The street, running off the bottom of the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/street.webp"
        alt=""
        aria-hidden
        className="art art-figure pointer-events-none ml-auto mt-8 hidden w-[420px] opacity-90 lg:block"
      />
    </>
  );
}
