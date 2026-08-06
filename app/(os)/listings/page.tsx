"use client";

import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import { FlowTag, Pill } from "@/components/Wire";
import rexSample from "@/lib/rex-sample.json";

/**
 * Listings: the marketing board, and the proof-of-concept for the whole
 * overlay — create here, push to REX, REX syndicates to the portals.
 *
 * Everything on this page is REAL, from a read-only pull on 6 Aug 2026:
 * the properties, their photos, their rents, their ages, and the counts
 * across the top (every current rental walked, 293 rows).
 */

type SampleListing = {
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  letAgreed: boolean;
  publicationStatus: string | null;
  availableFrom: string | null;
  epcExpiry: string | null;
  daysOnMarket: number | null;
  lastUpdated: string | null;
  imageCount: number;
  image: string | null;
};

const LISTINGS = rexSample.listings as SampleListing[];
const C = rexSample.counts;

function statusOf(l: SampleListing): { label: string; tone: "good" | "accent" | "neutral" } {
  if (l.letAgreed) return { label: "Let agreed", tone: "neutral" };
  if (l.publicationStatus === "published") return { label: "Available", tone: "good" };
  return { label: "Draft", tone: "accent" };
}

function Filter({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
    >
      {label}
      <span className="text-[9px]">▾</span>
    </button>
  );
}

export default function Listings() {
  return (
    <>
      <PageHeader
        title="Listings"
        blurb="Manage your properties and their marketing. List here once — the OS writes into REX, and REX syndicates to the portals."
        illustration="/illustrations/notioly/moving.svg"
        illustrationRight={430}
      />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <FlowTag from="REX (real data, pulled 6 Aug)" to="REX → portals" />
        <button
          type="button"
          className="hand flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] text-white transition-opacity hover:opacity-90"
        >
          <span className="text-base leading-none">+</span> Add new listing
        </button>
      </div>

      {/* ── The board. */}
      <div className="fade-up mt-4 rounded-2xl border border-line/80 p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex min-w-44 flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
            <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
            <input
              type="text"
              placeholder="Search properties…"
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
            />
          </label>
          <Filter label="All branches" />
          <Filter label="All statuses" />
          {/* The finding, as a filter rather than a banner: 165 of 293 current
              rentals sit in REX as unpublished drafts — 56% of the book, on no
              portal. Measured, and actionable right here. */}
          <button
            type="button"
            className="flex items-center gap-2 whitespace-nowrap rounded-full border border-accent/60 px-3.5 py-2 text-[12px] font-medium text-accent-dark transition-colors hover:bg-accent-soft/40"
          >
            Unpublished drafts
            <span className="figures">{C.draft}</span>
          </button>
          <Filter label="All property types" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line/70">
                {["Property", "Status", "Rent", "Beds", "Age in REX", "Last updated", ""].map(
                  (c, i) => (
                    <th
                      key={i}
                      className="pb-2.5 pr-3 text-[9.5px] font-bold uppercase tracking-wider text-muted"
                    >
                      {c}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {LISTINGS.map((l) => {
                const st = statusOf(l);
                return (
                  <tr
                    key={l.id}
                    className="cursor-pointer border-b border-line/40 transition-colors last:border-0 hover:bg-page"
                  >
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-3">
                        <PropertyPhoto
                          src={l.image}
                          className="h-11 w-14 shrink-0 rounded-lg"
                        />
                        <span className="min-w-0">
                          <span className="hand block truncate text-[13px]">{l.name}</span>
                          <span className="block truncate text-[10.5px] text-muted">
                            {l.locality} · {l.imageCount ? `${l.imageCount} photos` : "no photos"}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3">
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </td>
                    <td className="figures whitespace-nowrap py-3 pr-3">
                      £{l.rent?.toLocaleString("en-GB")}
                      <span className="text-[10px] text-muted"> pcm</span>
                    </td>
                    {/* Bedrooms are NOT in REX's listing projection — probed via
                        describe and four extra_fields variants. Blank, not guessed. */}
                    <td className="whitespace-nowrap py-3 pr-3 text-muted">—</td>
                    <td className="figures whitespace-nowrap py-3 pr-3">
                      {l.daysOnMarket?.toLocaleString("en-GB")}
                      <span className="text-[10px] text-muted"> days</span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-[11px] text-muted">
                      {l.lastUpdated}
                    </td>
                    <td className="py-3 pr-1 text-right text-muted">···</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
          <p className="text-[11px] text-muted">
            Showing 1–{LISTINGS.length} of {C.currentRentals} current rentals
          </p>
          <div className="flex items-center gap-1.5">
            {["‹", "1", "2", "3", "…", "37", "›"].map((p, i) => (
              <button
                key={i}
                type="button"
                className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] transition-colors ${
                  p === "1"
                    ? "bg-accent-soft/60 font-semibold text-accent-dark"
                    : "text-muted hover:text-ink"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Two honest footnotes, so nobody builds on a number that isn't there. */}
      <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>
          <span className="font-semibold">Beds</span> is blank on purpose — bedroom
          counts aren&apos;t in REX&apos;s listing projection (checked via describe and
          four extra_fields variants). They&apos;ll come from the property record or a
          portal feed; not invented here.
        </li>
        <li>
          <span className="font-semibold">Age in REX</span> is the record&apos;s own age,
          not true days-on-market — every listing&apos;s publication timestamp is null,
          so market date isn&apos;t recoverable from this call. Named for what it
          actually measures.
        </li>
      </ul>

      {/* The street, running off the bottom of the page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/buildings-street.png"
        alt=""
        aria-hidden
        className="pointer-events-none mt-8 ml-auto hidden w-[420px] opacity-90 lg:block"
      />
    </>
  );
}
