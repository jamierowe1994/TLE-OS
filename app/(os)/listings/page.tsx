"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import Segmented from "@/components/Segmented";
import StageTabs from "@/components/StageTabs";
import CornerSwell from "@/components/CornerSwell";
import ListingDrawer from "@/components/ListingDrawer";
import NewListingPanel from "@/components/listing/NewListingPanel";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DIARY } from "@/lib/diary";
import { Readiness, Tag, boardGaps, readiness, statusOf, type PublishCheck } from "@/components/ListingTags";
import { ARCHIVE_AFTER_DAYS, archiveLabel, archiveWhy, type ArchiveReason } from "@/lib/listing-archive";
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
  /** The portal write-up. Absent on the static export. */
  advertHeading?: string | null;
  advertBody?: string | null;
  daysOnMarket: number | null;
  /** The day it went live, ISO. Absent on the static fallback, which is why
   *  the date window treats "no date" as never-published rather than as a
   *  row to hide. */
  publishedAt?: string | null;
  /** The day the record was made in REX. What a draft's age is measured from. */
  createdAt?: string | null;
  /** Stamped on by the server - see lib/listing-archive.ts. The rule runs
   *  THERE, once, so the board never works out "is this archived" itself. */
  archived?: boolean;
  archiveReason?: ArchiveReason | null;
  archivedSince?: string | null;
  archiveAgeDays?: number | null;
  lastUpdated: string | null;
  imageCount: number;
  image: string | null;
  serviceType?: string | null;
  tenant?: { name: string; email: string; phone: string } | null;
};

type Counts = {
  currentRentals: number; published: number; draft: number;
  letAgreed: number; available: number;
  /** Every unpublished listing, archived ones included. `draft` is only the
   *  ones still being worked on, which is what the Draft tab shows. */
  draftsAll?: number;
  archived?: number;
};

const FALLBACK = rexSample.listings as SampleListing[];
const FALLBACK_COUNTS = rexSample.counts as Counts;
const NO_COUNTS: Counts = { currentRentals: 0, published: 0, draft: 0, letAgreed: 0, available: 0 };

/** What to print under the price. Weekly rents say so. */
function rentPeriodLabel(l: SampleListing): string {
  return l.rentPeriod === "week" ? "per week" : "pcm";
}

/** One labelled fact in a listing row: the icon, the caption, the value. */
function Fact({ icon, label, value, title }: { icon: string; label: string; value: string; title?: string }) {
  return (
    <span className="flex items-center gap-2">
      <DoodleIcon name={icon} size={13} className="shrink-0 text-accent-dark" />
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[9.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted">{label}</span>
        <span className="figures block truncate text-[12.5px]" title={title}>{value}</span>
      </span>
    </span>
  );
}

/** "2026-09-07" as "7 Sep 2026"; anything else as it came. */
function shortDate(iso: string | null): string {
  if (!iso) return "Now";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : iso;
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
  /* NEVER PUBLISHED means it is in no window at all.
     The rule above says a listing with no go-live date "survives every window
     except the ones about when something happened" - but the code read
     `period !== "older"`, which excluded it from only ONE of the three. So
     "Date listed: This month" answered with 33 listings that have no date
     listed. Measured 14 Sep 2026 while checking that month scoping rolls over:
     with the clock moved to January 2027 the filter still returned 33, all of
     them drafts, which is how it was noticed.
     An UNREADABLE date is a different thing and still passes below: we know it
     was published, we just cannot tell when, and hiding it would be a guess. */
  if (!iso) return false;
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
  { id: "rent-low", label: "Rent - low to high" },
  { id: "rent-high", label: "Rent - high to low" },
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
    /** Show a search box above the options - for a long list like localities. */
    searchable?: boolean;
  }[];
  active: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  /* Which group's options are popped out, and where the pop-out sits:
     level with that group's row, to the right of the panel. Hover opens
     it; click keeps it, so a trackpad can travel across the gap. */
  const [over, setOver] = useState<{ i: number; top: number; left: number } | null>(null);
  const [needle, setNeedle] = useState("");
  const btn = useRef<HTMLButtonElement | null>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 560) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) setOver(null);
  }, [open]);

  const pop = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setNeedle("");
    setOver({ i, top: r.top, left: r.right + 6 });
  };

  const g = over ? groups[over.i] : null;
  const shown = g ? g.options.filter((o) => !needle.trim() || o.label.toLowerCase().includes(needle.trim().toLowerCase())) : [];

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
            : "border-line/60 bg-white text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        <DoodleIcon name="setting" size={14} />
        Filters
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
          {/* The groups. Each row says what it is and what it is set to;
              the options themselves pop out beside it. */}
          <div
            data-filter-panel
            className="fade-up fixed z-[201] w-[240px] rounded-2xl border border-line/50 bg-white p-2 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.34)]"
            style={{ top: at.top, left: at.left }}
          >
            <div className="mb-1 flex items-center justify-between gap-3 px-2 pt-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Filters</p>
              {active > 0 && (
                <button type="button" onClick={() => { onClear(); setOver(null); }} className="text-[11.5px] text-accent-dark underline">
                  Clear all
                </button>
              )}
            </div>
            {groups.map((grp, i) => {
              const current = grp.options.find((o) => o.id === grp.value)?.label;
              const on = over?.i === i;
              return (
                <button
                  key={grp.label}
                  type="button"
                  onMouseEnter={(e) => pop(i, e.currentTarget)}
                  onClick={(e) => pop(i, e.currentTarget)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${on ? "bg-accent-soft/50" : "hover:bg-page"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold">{grp.label}</span>
                    <span className={`block truncate text-[11px] ${current ? "text-accent-dark" : "text-muted"}`}>{current ?? "Any"}</span>
                  </span>
                  <span aria-hidden className="text-muted">›</span>
                </button>
              );
            })}
          </div>

          {/* The options for the group under the mouse, beside it. */}
          {over && g && (
            <div
              className="fade-up fixed z-[202] max-h-[60vh] w-[220px] overflow-auto rounded-2xl border border-line/50 bg-white p-1.5 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.34)]"
              style={{ top: Math.min(over.top, window.innerHeight - 320), left: over.left }}
            >
              {g.searchable && (
                <input
                  autoFocus
                  value={needle}
                  onChange={(e) => setNeedle(e.target.value)}
                  placeholder={`Search ${g.label.toLowerCase()}…`}
                  className="mb-1 h-9 w-full rounded-xl border border-line/60 px-3 text-[12.5px] outline-none focus:border-ink"
                />
              )}
              <button
                type="button"
                onClick={() => g.onChange(null)}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent-soft/40 ${g.value === null ? "font-semibold text-accent-dark" : ""}`}
              >
                Any
              </button>
              {shown.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => g.onChange(o.id)}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent-soft/40 ${g.value === o.id ? "font-semibold text-accent-dark" : ""}`}
                >
                  {o.label}
                </button>
              ))}
              {g.searchable && shown.length === 0 && <p className="px-2.5 py-2 text-[11.5px] text-muted">Nothing matches.</p>}
            </div>
          )}
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
  /* The Add new listing panel, and the listing it just made. */
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [rentBand, setRentBand] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(null);
  /* Available used to be a switch of its own, because it answers the one
     question asked all day - what can I put someone in NOW. It is a stage on
     the tabs now, which answers the same question and three others beside it,
     and two controls for one filter is how a screen starts to disagree with
     itself. */
  const [stage, setStage] = useState<"all" | "Available" | "Let agreed" | "Draft" | "photos" | "compliance" | "archived">("all");
  const [period, setPeriod] = useState<PeriodId>("any");
  /* Tiles by default, like Market Appraisals (James, 11 Sep 2026). */
  const [view, setView] = useState<"list" | "tiles">("tiles");

  /* ── The real book. NOTHING stands in for it (18 Sep 2026). A saved export
        from 6 August used to show while the book loaded, when it failed, and
        for an agent with no link - other agents' real listings, dressed as the
        viewer's own, each opening a drawer that could edit them. The export is
        for a laptop with no listings system at all, and the server says so
        with `demo`. Anything else is a loading line or an error. ── */
  const [book, setBook] = useState<{
    listings: SampleListing[];
    counts: Counts;
    live: boolean;
    loading: boolean;
    failed?: boolean;
    reason?: string;
  }>({ listings: [], counts: NO_COUNTS, live: false, loading: true });

  /** The book. Also called after a listing is added, so the new one is there
   *  to open - the board holds a cached read and would not have it yet. */
  const loadBook = useCallback(async () => {
    try {
      const j = await fetch("/api/listings", { cache: "no-store" }).then((r) => r.json());
      if (j.ok && j.live && Array.isArray(j.listings)) {
        setBook({ listings: j.listings, counts: j.counts, live: true, loading: false });
        return true;
      }
      if (j.ok && j.demo) {
        setBook({ listings: FALLBACK, counts: FALLBACK_COUNTS, live: false, loading: false, reason: j.reason });
        return false;
      }
      setBook({
        listings: [],
        counts: NO_COUNTS,
        live: false,
        loading: false,
        failed: !j.unlinked,
        reason: j.reason ?? "We couldn't read your listings just now. Nothing is lost - try again in a minute.",
      });
    } catch {
      /* A book already on the screen stays: a refresh that fails after a save
         must not empty a board that was true a moment ago. */
      setBook((b) =>
        b.live
          ? { ...b, loading: false }
          : { listings: [], counts: NO_COUNTS, live: false, loading: false, failed: true, reason: "We couldn't read your listings just now. Nothing is lost - try again in a minute." }
      );
    }
    return false;
  }, []);
  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  /* ── THE ARCHIVE, fetched on first open and not before ──────────────────
     It carries REX's 223 withdrawn rentals as well as the cold drafts, and
     that is three more REX pages at about fifteen seconds a call. Paying for
     it on every visit to Listings, to fill a tab most agents will not open
     that day, is the wrong trade - so it loads when somebody asks for it. */
  const [archive, setArchive] = useState<{
    listings: SampleListing[];
    counts?: { total: number; staleDrafts: number; byHand: number; withdrawn: number };
    loading: boolean;
    asked: boolean;
    error?: string;
  }>({ listings: [], loading: false, asked: false });

  const loadArchive = useCallback(() => {
    setArchive((a) => {
      if (a.asked) return a;
      fetch("/api/listings/archive")
        .then((r) => r.json())
        .then((j) => {
          if (j.ok && Array.isArray(j.listings)) {
            setArchive({ listings: j.listings, counts: j.counts, loading: false, asked: true });
          } else {
            setArchive({ listings: [], loading: false, asked: true, error: j.reason ?? j.error ?? "The archive didn't answer." });
          }
        })
        .catch(() => setArchive({ listings: [], loading: false, asked: true, error: "The archive didn't answer." }));
      return { ...a, loading: true, asked: true };
    });
  }, []);

  useEffect(() => {
    if (stage === "archived") loadArchive();
  }, [stage, loadArchive]);

  /**
   * Put one away, or bring it back.
   *
   * The screen is updated from the SERVER's answer, not from what the button
   * was called: the rule about what is archived lives in one place and the
   * board asking it rather than assuming is what keeps the two agreeing.
   */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  const move = useCallback(async (id: string, action: "archive" | "restore") => {
    setBusyId(id);
    setArchiveNote(null);
    try {
      const r = await fetch("/api/listings/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; state?: { archived: boolean; reason: ArchiveReason | null; since: string | null; ageDays: number | null } };
      if (!j.ok) throw new Error(j.error ?? "That didn't save.");
      const st = j.state;
      const patch = (l: SampleListing): SampleListing =>
        String(l.id) !== id || !st
          ? l
          : { ...l, archived: st.archived, archiveReason: st.reason, archivedSince: st.since, archiveAgeDays: st.ageDays };
      setBook((b) => ({ ...b, listings: b.listings.map(patch) }));
      setArchive((a) => ({
        ...a,
        listings: action === "restore" ? a.listings.filter((l) => String(l.id) !== id) : a.listings,
      }));
      /* Archived from the board: it leaves the working list, and the archive
         is re-read next time it is opened rather than guessed at here. */
      if (action === "archive") setArchive((a) => ({ ...a, asked: false, listings: [] }));
    } catch (e) {
      setArchiveNote(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusyId(null);
    }
  }, []);

  const LISTINGS = book.listings;
  /* The working book: everything the cap has not put away. Defined once, and
     every tab but Archived reads from it - so a cold draft cannot reappear in
     All listings, Missing photos or Needs compliance by the back door. */
  const WORKING = useMemo(() => LISTINGS.filter((l) => !l.archived), [LISTINGS]);
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
  /* Off the WORKING book, so Draft counts the drafts somebody is still on -
     not the 144 that went cold. The full unpublished figure is still said out
     loud in the blurb; it is just no longer the tab's number. */
  const byStage = useMemo(() => {
    const out = { Available: 0, "Let agreed": 0, Draft: 0 } as Record<string, number>;
    for (const l of WORKING) out[statusOf(l).label] = (out[statusOf(l).label] ?? 0) + 1;
    return out;
  }, [WORKING]);

  /* What the Archived tab says before it has been opened: the cold drafts,
     which the book already knows about. REX's withdrawn listings are not in
     that figure, so the tab shows a "+" until the real count arrives rather
     than printing a number it will then contradict. */
  const archivedKnown = archive.counts?.total ?? LISTINGS.filter((l) => l.archived).length;

  /* And the archived slice OF THE CURRENT BOOK, which is a different number
     and the only one that belongs in a sentence about current rentals.
     Written with archivedKnown for one screenshot on 14 Sep and it read
     "269 current rentals: 62 available, 48 let agreed and 22 drafts on the go,
     with 360 more filed away" - a line that does not add up, because 223 of
     that 360 are withdrawn listings and were never part of the 269. */
  const archivedInBook = useMemo(() => LISTINGS.filter((l) => l.archived).length, [LISTINGS]);

  const board = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const band = RENT_BANDS.find((b) => b.id === rentBand);
    const source = stage === "archived" ? archive.listings : WORKING;
    const rows = source.filter((l) => {
      if (needle && !`${l.name} ${l.locality}`.toLowerCase().includes(needle)) return false;
      const cmp = l.rentMonthly ?? l.rent;
      if (band && !(cmp != null && band.test(cmp))) return false;
      if (loc && l.locality !== loc) return false;
      // "Available" is what the status chip already means — published and not
      // let agreed. Defined once, in statusOf, so the switch and the chip can
      // never drift apart and show a house the other disagrees with.
      if (stage === "photos") {
        if (l.imageCount > 0) return false;
      } else if (stage === "compliance") {
        if (l.epcExpiry != null) return false;
      } else if (stage === "archived") {
        /* The source IS the archive - there is no status left to test. */
      } else if (stage !== "all" && statusOf(l).label !== stage) return false;
      if (!listedIn(l.publishedAt, period)) return false;
      return true;
    });
    // Most recent is the resting order (REX's own lastUpdated already leads);
    // the rent sorts rearrange on request.
    const monthly = (l: SampleListing) => l.rentMonthly ?? l.rent;
    if (sort === "rent-low") rows.sort((a, b) => (monthly(a) ?? 1e9) - (monthly(b) ?? 1e9));
    else if (sort === "rent-high") rows.sort((a, b) => (monthly(b) ?? 0) - (monthly(a) ?? 0));
    /* The archive arrives in REX's modtime order, which on this data is a
       bulk sync rather than anything meaningful (see lib/listing-archive.ts).
       Most-recently-cold first is the order somebody scanning it wants. */
    else if (stage === "archived") rows.sort((a, b) => (b.archivedSince ?? "").localeCompare(a.archivedSince ?? ""));
    return rows;
  }, [WORKING, archive.listings, q, sort, rentBand, loc, stage, period]);

  /* ── READY TO PUBLISH, ON THE PUSH ROUTE'S OWN WORD (17 Sep 2026) ───────
     The book cannot see council tax, bills, furnishing or key features, so a
     draft that looks complete from here is checked the way the push button
     checks it before the tile says "Ready to publish". Only those drafts, only
     once per version of the listing: each check is several calls upstream. */
  const [checks, setChecks] = useState<Record<string, PublishCheck>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!book.live) return;
    const want = board
      .filter((l) => !l.archived && !l.letAgreed && l.publicationStatus !== "published" && boardGaps(l).length === 0)
      .map((l) => `${l.id}:${l.lastUpdated ?? ""}`)
      .filter((key) => !asked.current.has(key));
    if (!want.length) return;
    want.forEach((key) => asked.current.add(key));
    setChecks((c) => ({ ...c, ...Object.fromEntries(want.map((key) => [key, "checking" as const])) }));
    void (async () => {
      for (let i = 0; i < want.length; i += 24) {
        const batch = want.slice(i, i + 24);
        const settled: Record<string, PublishCheck> = {};
        try {
          const j = (await fetch(`/api/listings/readiness?ids=${encodeURIComponent(batch.join(","))}`, { cache: "no-store" }).then((r) => r.json())) as {
            ok?: boolean;
            results?: Record<string, { gaps?: { label: string }[]; failed?: boolean }>;
          };
          for (const key of batch) {
            const r = j.ok ? j.results?.[key.split(":")[0]] : undefined;
            settled[key] = r?.gaps ? r.gaps.map((g) => g.label) : "failed";
          }
        } catch {
          for (const key of batch) settled[key] = "failed";
        }
        setChecks((c) => ({ ...c, ...settled }));
      }
    })();
  }, [board, book.live]);

  return (
    <>
      <PageHeader
        title="Listings"
        blurb={
          book.loading
            ? "Fetching the rental book…"
            : book.live
              /* The full unpublished figure still gets said out loud. The Draft
                 tab counts the live ones now, and a page that never admitted
                 the other 144 exist would be hiding them rather than filing
                 them. */
              ? `Live - ${C.currentRentals} current rentals: ${byStage.Available} available, ${byStage["Let agreed"]} let agreed and ${byStage.Draft} drafts on the go${
                  archivedInBook ? `, with ${archivedInBook} older drafts filed away` : ""
                }.`
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
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Just the switch and the button that makes a listing (James, 11
                Sep). No icons on the switch - the drawn grid read as cut off.
                The filters, the date among them, live in the box below. */}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "list" as const, label: "List" },
                { id: "tiles" as const, label: "Tiles" },
              ]}
            />
            {/* A listing is made here now (16 Sep 2026): the address, what it
                is and the rent, then straight into Marketing for the rest. */}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-white ring-1 ring-inset ring-black/10 transition-opacity hover:opacity-90"
            >
              <span className="text-[15px] leading-none">+</span> Add new listing
            </button>
          </div>
        }
      />

      {/* ── The stages, and the filter for them. Same component and the same
             row as Market Appraisals and Applications. ── */}
      {/* Boxed with the corner circles, like Market Appraisals and the leads
          filter row. */}
      <div className="fade-up relative mt-4 overflow-hidden rounded-[22px] border border-line/50 bg-white px-5 pb-4 pt-1">
        <CornerSwell />
        <div className="relative flex flex-wrap items-start gap-x-4">
      <StageTabs
        wrap
        label="Listing statuses"
        allId="all"
        value={stage}
        onChange={setStage}
        flow={false}
        stages={[
          { id: "all" as const, label: "All listings", icon: "analytics", count: WORKING.length, blurb: "Everything on the rental book that is still moving" },
          { id: "Available" as const, label: "Available", icon: "home", count: byStage.Available, blurb: "Published, and not let agreed - what you can put somebody in now" },
          { id: "Let agreed" as const, label: "Let agreed", icon: "key", count: byStage["Let agreed"], blurb: "Taken, and working through to a tenancy" },
          { id: "Draft" as const, label: "Draft", icon: "doc", count: byStage.Draft, blurb: `Not on the portals yet - drafted in the last ${Math.round(ARCHIVE_AFTER_DAYS / 30)} months` },
          /* Two jobs rather than two states: what is holding a listing back. */
          { id: "photos" as const, label: "Missing photos", icon: "folder", count: WORKING.filter((l) => l.imageCount === 0).length, blurb: "No photographs on the listing" },
          { id: "compliance" as const, label: "Needs compliance", icon: "shield", count: WORKING.filter((l) => l.epcExpiry == null).length, blurb: "No EPC filed" },
          /* Last, and deliberately: it is where things go, not where work
             starts. The count grows once the tab is opened and REX's
             withdrawn listings come in with it. */
          { id: "archived" as const, label: "Archived", icon: "folder", count: archivedKnown, blurb: `${archivedInBook} cold drafts from the book, plus every listing that came off without a tenant` },
        ]}
      />
          <div className="ml-auto mt-4">
            <FilterPanel
              active={[sort, rentBand, loc].filter(Boolean).length + (period === "any" ? 0 : 1)}
              onClear={() => { setSort(null); setRentBand(null); setLoc(null); setPeriod("any"); }}
              groups={[
                { label: "Sort by", options: SORTS, value: sort, onChange: setSort },
                { label: "Rent", options: RENT_BANDS, value: rentBand, onChange: setRentBand },
                { label: "Location", options: localities, value: loc, onChange: setLoc, searchable: true },
                { label: "Date listed", options: PERIODS.filter((x) => x.id !== "any").map((x) => ({ id: x.id, label: x.label })), value: period === "any" ? null : period, onChange: (v) => setPeriod((v ?? "any") as PeriodId) },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── The board, in the same panel the other two boards use. ── */}
      {/* White with a hairline. A blush wash with doodles was tried here on
          11 Sep and taken straight back out: "the pink background doesn't
          work". */}
      <div className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="hand text-[17px]">
            {stage === "all" ? "All listings" : stage === "photos" ? "Missing photos" : stage === "compliance" ? "Needs compliance" : stage === "archived" ? "Archived" : stage}
            <span className="figures ml-2 text-[14px] text-muted">{board.length}</span>
          </h2>
          {stage !== "all" && (
            <button type="button" onClick={() => setStage("all")} className="text-[11.5px] text-muted underline transition-colors hover:text-ink">
              Show all listings
            </button>
          )}
        </div>
        {/* What the archive IS, said once, at the top of it. An agent opening
            a tab of 300 properties they have never seen before deserves the
            sentence that explains why they are all here. */}
        {stage === "archived" && (
          <p className="mb-4 rounded-2xl border border-line/50 bg-page px-4 py-3 text-[12px] leading-relaxed text-muted">
            Nothing is deleted and nothing is changed on the listing. A draft comes here once it has sat{" "}
            {Math.round(ARCHIVE_AFTER_DAYS / 30)} months without being published, and so does any listing
            taken off the market without a tenant. Search still reaches everything in here, and
            <span className="font-semibold text-ink"> Bring back to drafts</span> gives one another{" "}
            {Math.round(ARCHIVE_AFTER_DAYS / 30)} months on the board.
            {archive.counts && (
              <span className="mt-1.5 block">
                <span className="figures">{archive.counts.staleDrafts}</span> drafts gone cold ·{" "}
                <span className="figures">{archive.counts.withdrawn}</span> taken off the market
                {archive.counts.byHand > 0 && (
                  <> · <span className="figures">{archive.counts.byHand}</span> filed by hand</>
                )}
              </span>
            )}
          </p>
        )}
        {archiveNote && (
          <p className="mb-3 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[12px] font-semibold text-accent-dark">{archiveNote}</p>
        )}
        {stage === "archived" && archive.loading && (
          <p className="py-6 text-[12.5px] text-muted">Reading the archive - the withdrawn listings are held separately, so this one takes a moment…</p>
        )}
        {stage === "archived" && archive.error && !archive.loading && (
          <p className="py-6 text-[12.5px] text-accent-dark">{archive.error}</p>
        )}
        {book.loading && (
          <p className="flex items-center gap-2.5 py-6 text-[12.5px] text-muted" role="status">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
            Fetching your listings…
          </p>
        )}
        {!book.loading && !book.live && book.listings.length === 0 && (
          <div className="py-8 text-center" role={book.failed ? "alert" : "status"}>
            <p className="text-[13px] font-semibold text-ink">{book.failed ? "Your listings didn't load" : "No listings to show yet"}</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-muted">{book.reason}</p>
            {book.failed && (
              <button type="button" onClick={() => void loadBook()} className="mt-4 rounded-full bg-accent px-5 py-2 text-[12px] font-semibold text-white">
                Try again
              </button>
            )}
          </div>
        )}
        {board.length === 0 && (book.live || book.listings.length > 0) && !(stage === "archived" && (archive.loading || archive.error)) && (
          <p className="py-6 text-[12.5px] text-muted">
            Nothing matches{period === "any" ? "" : " in that window"} - widen the rent band or clear the filters.
          </p>
        )}
        <div className={`cascade ${view === "tiles" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}`}>
        {board.map((l) => {
          const st = statusOf(l);
          const views = viewingsFor(l.name);
          /* Withdrawn is REX's own state and cannot be undone from the OS, so
             the only listings offered a way back are the ones the OS filed:
             a cold draft, or one put away by hand. */
          const canRestore = l.archived === true && l.archiveReason !== "withdrawn";
          /* Filing a draft away EARLY is a decision about one property, so it
             lives inside the record (the drawer) rather than as a button on
             every card. Put here it would either sit permanently over the
             readiness box - which CLAUDE.md forbids and which looks it - or
             hide behind a hover, which is no button at all on a phone. */
          const busy = busyId === String(l.id);
          return (
            /* The card is a button, so the archive action cannot live INSIDE
               it - a button in a button is invalid and the inner click never
               reaches the right handler. It sits on top instead, which also
               keeps the whole card clickable through to the record. */
            <div key={l.id} className="fade-up relative">
            <button
              type="button"
              onClick={() => setOpenId(String(l.id))}
              // Thinner rule and less padding, so the photograph can grow
              // into the space rather than floating in a frame. p-2 with an
              // inner radius of 14 against the card's 16 keeps the two curves
              // concentric — the giveaway that a nested corner is wrong is
              // when the gap between the arcs is uneven.
              className={`block w-full rounded-[22px] border bg-white p-2.5 text-left transition-colors hover:border-ink/40 ${
                l.archived ? "border-line/40" : "border-line/50"
              } ${canRestore ? "pb-[52px]" : ""}`}
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
                      ? "h-44 w-full shrink-0 rounded-[16px]"
                      : "h-40 w-full shrink-0 rounded-[16px] sm:h-24 sm:w-32"
                  }
                />

                <div
                  className={
                    view === "tiles"
                      ? /* Tiles: the three facts side by side under the name, the rent on its own line. */
                        "grid min-w-0 flex-1 grid-cols-[1.5fr_1fr_1fr] gap-x-3 gap-y-3 px-2 pb-2 [&>span:first-child]:col-span-3"
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
                        /* Fixed fact columns from md, wide enough for "Available from"
                           on one line, and the readiness box as the last column from
                           xl. The name column takes what is left. */
                        "grid min-w-0 flex-1 grid-cols-[1.5fr_1fr_1fr] items-center gap-x-4 gap-y-3 py-1 pr-2 [&>span:first-child]:col-span-3 [&>span:last-child]:col-span-3 md:grid-cols-[minmax(0,1fr)_84px_110px_70px_64px] md:[&>span:first-child]:col-span-1 md:[&>span:last-child]:col-span-5 xl:grid-cols-[minmax(0,1fr)_84px_110px_70px_64px_230px] xl:[&>span:last-child]:col-span-1 2xl:grid-cols-[minmax(0,1fr)_84px_110px_70px_64px_310px]"
                  }
                >
                  <span className="min-w-0">
                    {/* The chips — only what changes decisions. No 'For sale',
                        no 'Sponsored': everything here is a rental, ours. */}
                    <span className="flex flex-wrap items-center gap-1.5">
                      {/* In the archive the state pill says why it is HERE.
                          "Draft" on a listing drafted in February 2024 is
                          true and useless; "Draft, gone cold" is the fact
                          that put it on this screen. */}
                      <Tag tone={l.archived ? "neutral" : st.tone}>
                        {l.archived ? archiveLabel(l.archiveReason ?? null) : st.label}
                      </Tag>
                      {l.tenant && <Tag tone="neutral">Tenanted</Tag>}
                      {/* The jobs-to-do chips are about getting a listing OUT.
                          On something already filed away they are noise. */}
                      {!l.archived && l.imageCount === 0 && <Tag tone="accent">No photos</Tag>}
                      {!l.archived && l.epcExpiry == null && <Tag tone="neutral">EPC not filed</Tag>}
                    </span>
                    <span className="hand mt-1.5 line-clamp-2 text-[17px] leading-tight">{l.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                      <DoodleIcon name="home-1" size={12} className="shrink-0" />
                      <span className="truncate">{l.locality}</span>
                    </span>
                  </span>

                  {/* The facts, each its own column. Same four as before and
                      in the same order; they are beside the address now
                      instead of under it. */}
                  {/* A third of the book — mostly drafts — carries no rent at
                      all. A bare "£" reads as broken; "rent not set" reads as
                      a job to do, which is what it is. */}
                  <span className={view === "tiles" ? "order-2 col-span-3 flex items-baseline gap-1.5 border-t border-line/50 pt-3" : "col-span-3 md:col-span-1"}>
                    <span className="figures block text-[20px] leading-none">
                      {l.rent == null ? "—" : `£${l.rent.toLocaleString("en-GB")}`}
                    </span>
                    <span className={view === "tiles" ? "text-[11px] text-muted" : "mt-0.5 block text-[10px] text-muted"}>
                      {l.rent == null ? "rent not set" : rentPeriodLabel(l)}
                    </span>
                  </span>
                  <Fact icon="calendar" label="Available from" value={shortDate(l.availableFrom)} title={l.availableFrom ?? undefined} />
                  {/* No Bedrooms column. REX's listing model has no bedroom
                      field at all, so it could only ever print a dash on every
                      row - a column of nothing. It comes back when the take-on
                      captures a count (11 Sep 2026). */}
                  <Fact icon="key" label="Viewings" value={String(views)} />
                  <Fact icon="folder" label="Photos" value={String(l.imageCount)} />

                  {/* Where it is, and the one move - see readiness(). On an
                      archived row there IS no next move, so the space says
                      why it is here and leaves room for the button that sits
                      over the card. */}
                  <span className={view === "tiles" ? "order-3 col-span-3 block" : "flex justify-end"}>
                    {l.archived ? (
                      <span className={`block text-[11.5px] leading-snug text-muted ${view === "tiles" ? "" : "text-right"}`}>
                        {archiveWhy({ archived: true, reason: l.archiveReason ?? null, since: l.archivedSince ?? null, ageDays: l.archiveAgeDays ?? null })}
                      </span>
                    ) : (
                      <Readiness r={readiness(l, checks[`${l.id}:${l.lastUpdated ?? ""}`])} compact={view === "tiles"} buttonOnly={view !== "tiles"} />
                    )}
                  </span>
                </div>
              </div>
            </button>

            {/* The one move on an archived row, and the quiet way to file a
                draft early. Over the card rather than in it - see above. */}
            {canRestore && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void move(String(l.id), "restore")}
                title={`Put it back on the board for another ${Math.round(ARCHIVE_AFTER_DAYS / 30)} months`}
                className="absolute bottom-3.5 right-3.5 z-10 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Bringing it back…" : "Bring back to drafts"}
              </button>
            )}
            </div>
          );
        })}

        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        {stage === "archived" ? (
          <>
            Showing {board.length} of {archivedKnown} filed away · Nothing here has been deleted, and
            no listing has been changed. The archive is the same book, read a different way.
          </>
        ) : (
          <>
            Showing {board.length} of {WORKING.length} listings still moving
            {C.draftsAll != null && C.draftsAll !== byStage.Draft && (
              <> ({C.draftsAll} of the {C.currentRentals} current rentals have never been published; {archivedInBook} are filed away)</>
            )}{" "}
            · <span className="font-semibold">Days on market</span> is only known for the published
            half: a draft has never been on a portal, so it has no clock to read.
          </>
        )}
      </p>

      <ListingDrawer
        /* Looked up across the archive as well as the book: on the Archived
           tab the row that was clicked is not in LISTINGS at all (a withdrawn
           listing was never in the book), and the drawer opened empty. */
        listing={
          openId == null
            ? null
            : LISTINGS.find((l) => String(l.id) === openId) ??
              archive.listings.find((l) => String(l.id) === openId) ??
              null
        }
        onArchive={(id, action) => void move(id, action)}
        archiveBusy={busyId != null && busyId === openId}
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

      {adding && (
        <NewListingPanel
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            /* Straight onto the new record, where Marketing fills it in. */
            void loadBook().then(() => setOpenId(id));
          }}
        />
      )}

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
