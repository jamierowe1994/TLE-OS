"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
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

/** How many viewings the diary knows about for this address. */
function viewingsFor(name: string): number {
  return DIARY.filter((a) => a.kind === "viewing" && a.what.includes(name)).length;
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
function Filter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
          current
            ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
            : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        {current?.label ?? label}
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] cursor-default"
          />
          <div className="fade-up absolute right-0 top-full z-[70] mt-1.5 min-w-[180px] rounded-2xl border border-line/80 bg-card p-1.5 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.3)]">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent-soft/40 ${
                value === null ? "font-semibold text-accent-dark" : ""
              }`}
            >
              {label}
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent-soft/40 ${
                  value === o.id ? "font-semibold text-accent-dark" : ""
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Listings() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [rentBand, setRentBand] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(null);

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
  const C = book.counts;

  const localities = useMemo(
    () => [...new Set(LISTINGS.map((l) => l.locality))].sort().map((x) => ({ id: x, label: x })),
    [LISTINGS]
  );

  const board = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const band = RENT_BANDS.find((b) => b.id === rentBand);
    const rows = LISTINGS.filter((l) => {
      if (needle && !`${l.name} ${l.locality}`.toLowerCase().includes(needle)) return false;
      const cmp = l.rentMonthly ?? l.rent;
      if (band && !(cmp != null && band.test(cmp))) return false;
      if (loc && l.locality !== loc) return false;
      return true;
    });
    // Most recent is the resting order (REX's own lastUpdated already leads);
    // the rent sorts rearrange on request.
    const monthly = (l: SampleListing) => l.rentMonthly ?? l.rent;
    if (sort === "rent-low") rows.sort((a, b) => (monthly(a) ?? 1e9) - (monthly(b) ?? 1e9));
    else if (sort === "rent-high") rows.sort((a, b) => (monthly(b) ?? 0) - (monthly(a) ?? 0));
    return rows;
  }, [LISTINGS, q, sort, rentBand, loc]);

  return (
    <>
      <PageHeader
        title="Listings"
        blurb={
          book.loading
            ? "Fetching the rental book from REX…"
            : book.live
              ? `Live from REX — ${C.currentRentals} current rentals, ${C.published} published to the portals and ${C.draft} still drafts.`
              : (book.reason ?? "Manage your properties and their marketing.")
        }
        illustration="/illustrations/notioly/moving.svg"
        lineBreak="none"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search properties…"
        /* One row of chrome: the filters, then the button that makes more
           houses. Nothing else stands between the agent and the board. */
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Filter label="Most recent" options={SORTS} value={sort} onChange={setSort} />
            <Filter label="Rent" options={RENT_BANDS} value={rentBand} onChange={setRentBand} />
            <Filter label="Location" options={localities} value={loc} onChange={setLoc} />
            <button
              type="button"
              className="hand flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] text-page transition-opacity hover:opacity-90"
            >
              <span className="text-base leading-none">+</span> Add new listing
            </button>
          </div>
        }
      />

      {/* ── The board: one card per house, full width, no clutter. ── */}
      <div className="mt-6 space-y-4">
        {board.map((l) => {
          const st = statusOf(l);
          const views = viewingsFor(l.name);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setOpenAt(LISTINGS.indexOf(l))}
              className="fade-up block-pop block w-full rounded-2xl border border-line/80 bg-box p-4 text-left hover:border-ink"
            >
              <div className="flex gap-5">
                <PropertyPhoto src={l.image} className="h-32 w-44 shrink-0 rounded-xl" />

                <div className="min-w-0 flex-1">
                  {/* The chips — only what changes decisions. No 'For sale',
                      no 'Sponsored': everything here is a rental, ours. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={st.tone}>{st.label}</Pill>
                    {l.tenant && <Pill tone="neutral">Tenanted</Pill>}
                    {l.imageCount === 0 && <Pill tone="accent">No photos</Pill>}
                    {l.epcExpiry == null && <Pill tone="neutral">EPC not filed</Pill>}
                  </div>

                  <h3 className="hand mt-2 truncate text-[19px] leading-tight">{l.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                    <DoodleIcon name="home-1" size={12} className="shrink-0" />
                    {l.locality}
                  </p>

                  {/* The fact row, each cell its own little column. */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line/50 pt-3">
                    <span className="flex items-center gap-2">
                      <DoodleIcon name="calendar" size={13} className="shrink-0 text-accent-dark" />
                      <span>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
                          Available from
                        </span>
                        <span className="figures block text-[12px]">{l.availableFrom ?? "Now"}</span>
                      </span>
                    </span>
                    <span className="hidden h-7 w-px bg-line/60 sm:block" />
                    <span className="flex items-center gap-2">
                      <DoodleIcon name="bed.png" size={13} className="shrink-0 text-accent-dark" />
                      <span>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
                          Bedrooms
                        </span>
                        <span
                          className="figures block text-[12px]"
                          title="Not in REX's listing projection — captured at the take-on"
                        >
                          —
                        </span>
                      </span>
                    </span>
                    <span className="hidden h-7 w-px bg-line/60 sm:block" />
                    <span className="flex items-center gap-2">
                      <DoodleIcon name="key" size={13} className="shrink-0 text-accent-dark" />
                      <span>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
                          Viewings so far
                        </span>
                        <span className="figures block text-[12px]">{views}</span>
                      </span>
                    </span>
                    <span className="hidden h-7 w-px bg-line/60 sm:block" />
                    <span className="flex items-center gap-2">
                      <DoodleIcon name="folder" size={13} className="shrink-0 text-accent-dark" />
                      <span>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
                          Photos
                        </span>
                        <span className="figures block text-[12px]">{l.imageCount}</span>
                      </span>
                    </span>
                  </div>
                </div>

                {/* The money, top right, unmissable. */}
                <div className="shrink-0 text-right">
                  {/* A third of the book — mostly drafts — carries no rent at
                      all. A bare "£" reads as broken; "Rent not set" reads as
                      a job to do, which is what it is. */}
                  <p className="figures text-[22px] leading-none">
                    {l.rent == null ? "—" : `£${l.rent.toLocaleString("en-GB")}`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {l.rent == null ? "rent not set" : rentPeriodLabel(l)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        {!board.length && (
          <p className="rounded-2xl border border-dashed border-line py-10 text-center text-[12.5px] text-muted">
            Nothing matches — widen the rent band or clear the filters.
          </p>
        )}
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
        listing={openAt == null ? null : LISTINGS[openAt]}
        onClose={() => setOpenAt(null)}
        onStep={(d) =>
          setOpenAt((i) => (i == null ? i : (i + d + LISTINGS.length) % LISTINGS.length))
        }
      />

      {/* The street, running off the bottom of the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/buildings-street.png"
        alt=""
        aria-hidden
        className="art pointer-events-none ml-auto mt-8 hidden w-[420px] opacity-90 lg:block"
      />
    </>
  );
}
