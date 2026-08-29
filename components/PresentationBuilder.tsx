"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import MaterialInfoPanel from "@/components/MaterialInfoPanel";
import MarketMap from "@/components/MarketMap";
import { Pill } from "@/components/Wire";
import {
  BUILD_STEPS,
  DECK_SECTIONS,
  defaultPlan,
  defaultSelection,
  pagesIn,
  reorder,
  type BuildStepId,
  type DeckPlan,
} from "@/lib/presentation-builder";
import type { MaResearch } from "@/lib/ma-research";
import { listingKey } from "@/lib/listing-key";

/**
 * Build the presentation.
 *
 * Called "Build presentation", not "Research" — James, 23 Aug, and he is
 * right: the agent is not browsing data, they are making the thing they will
 * put in front of a landlord. Naming it after the output is what makes the
 * button obvious at 8am.
 *
 * Five steps, not F&C's six. Buyer matches is dropped: a landlord does not
 * care who is looking, they care what it lets for and how fast.
 *
 * Every step can be empty and the wizard still finishes — see canAdvance in
 * lib/presentation-builder for why gating on "pick a comparable" would just
 * make agents stop using it.
 */

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/**
 * One map tile, for the little circle on the Map button.
 *
 * ── Why not Google, given we have a key ───────────────────────────────────
 *
 * Because Google is what produced the thing on screen. Static Maps answers a
 * key problem — billing not enabled, API not switched on — with HTTP 200 and
 * an IMAGE THAT SAYS SO. Not an error status: a picture of an apology, which
 * the proxy passed through and the circle displayed. Any check on the response
 * code would have called that a success.
 *
 * The map beside it never needed a key. CARTO tiles are public URLs, which is
 * why the main panel has worked all along. So the button uses the same tiles
 * as the map it opens: one image, no key, no billing, nothing to enable, and
 * it cannot fail by drawing words on the screen.
 *
 * The arithmetic is the standard slippy-map projection — longitude linear,
 * latitude through Mercator. Zoom 14 puts a street or two in a 44px circle,
 * which reads as "a map" without becoming a puzzle.
 */
function tileUrl(lat: number, lon: number, z = 15): string {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  /* STREET, not the grey canvas. At 36px across, a light-grey basemap is a
     grey disc — you cannot tell it from a placeholder, and the whole point of
     this button is that it LOOKS like a map before you press it. The street
     tile carries road colour and green space, which reads as a map at any size.

     Same family as the map beside it — see the note in MarketMap for why it is
     not CARTO or OSM, and why the Google key never leaves the server. */
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
}

export default function PresentationBuilder({
  address,
  postcode,
  landlord,
  refId,
  fullPage = false,
  backHref,
  onClose,
}: {
  address: string;
  postcode: string;
  landlord?: string;
  refId?: string;
  /** Rendered as a page rather than a modal — see the build route for why. */
  fullPage?: boolean;
  backHref?: string;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<MaResearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [plan, setPlan] = useState<DeckPlan>(defaultPlan);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<string | null>(null);

  /**
   * Mint the deck.
   *
   * Only the TICKED comparables travel, and only the figures they produce —
   * the deck is a snapshot, so the range a landlord opens on Sunday is the one
   * the agent approved on Friday. Sending the whole research packet would let
   * the numbers move underneath them.
   */
  async function create() {
    if (!d) return;
    setMaking(true);
    setError(null);
    try {
      const picked = d.comparables.filter((c) => chosen.includes(c.id));
      const rents = picked.map((c) => c.rentMonthly).sort((a, b) => a - b);
      const at = (q: number) => rents[Math.min(rents.length - 1, Math.floor(rents.length * q))];

      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ref: refId ?? "",
          recipientName: landlord ?? "",
          address,
          postcode,
          comparables: rents.length
            ? {
                // Recomputed from what the agent CHOSE, not copied from the
                // research. Ticking three of eight must move the range, or the
                // deck quotes a number the chosen properties do not support.
                guideLow: at(0.25),
                guideMid: at(0.5),
                guideHigh: at(0.75),
                basedOn: rents.length,
                rows: picked.map((c) => ({
                  name: c.name,
                  locality: c.locality,
                  rent: c.rentDisplay,
                  days: c.daysOnMarket,
                  letAgreed: c.letAgreed,
                })),
                caveat: d.guide?.caveat ?? null,
              }
            : null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (j.ok && j.url) setMade(j.url);
      else setError(j.error ?? "Couldn't create the presentation.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMaking(false);
    }
  }

  useEffect(() => {
    /* NO beds. The filter starts on "Any beds", so the first list must be any
       size too — sending 2 here meant the screen opened already filtered to
       two-bed while the control said Any, and setting the control BACK to Any
       changed nothing because it sent 2 as well. */
    const q = new URLSearchParams({ address, postcode });
    const mine = ++reqSeq.current;
    fetch(`/api/ma-research?${q}`)
      .then((r) => r.json())
      .then((j: MaResearch & { error?: string }) => {
        /* Somebody has already filtered. This is the opening list, and it is
           now the wrong one — see reqSeq. */
        if (mine !== reqSeq.current) return;
        if (j.error) return setError(j.error);
        setD(j);
        // Only same-sector start ticked — a pre-ticked box is a recommendation.
        setChosen(defaultSelection(j.comparables));
      })
      .catch((e: Error) => setError(e.message));
  }, [address, postcode]);

  /* Homesearch's live market — the whole sector including other agents'
     stock, and the only source that carries photographs. Picked separately
     from our own book because they are different evidence. */
  const nearby = d?.onMarketNearby ?? [];
  const [pickedNearby, setPickedNearby] = useState<string[]>([]);
  /* THE FILTER BAR. Radius defaults to 0 — the sector — because widening
     should be something an agent chooses, not something that happened to them.
     See MarketFilters in lib/ma-research for why F&C's 2-mile default is right
     for sales and wrong for lettings. */
  const [filters, setFilters] = useState<{ radius: number; beds: number; minRent: number; maxRent: number; type: "" | "H" | "F" }>(
    { radius: 0, beds: 0, minRent: 0, maxRent: 0, type: "" }
  );
  const [refiltering, setRefiltering] = useState(false);
  /* The split view. Off by default: most of the time an agent is skimming
     cards, and a map that is always there costs half the width for a question
     they have not asked yet. */
  const [mapOpen, setMapOpen] = useState(false);
  /* The map is kept MOUNTED for the length of its own exit, so it can slide
     back into the corner it came from instead of vanishing. `mapIn` drives the
     classes; `mapMounted` decides whether it exists at all. Two flags rather
     than one because a thing cannot animate out after it has been unmounted. */
  const [mapMounted, setMapMounted] = useState(false);
  const [mapIn, setMapIn] = useState(false);
  useEffect(() => {
    if (mapOpen) {
      setMapMounted(true);
      const f = requestAnimationFrame(() => setMapIn(true));
      return () => cancelAnimationFrame(f);
    }
    setMapIn(false);
    const t = setTimeout(() => setMapMounted(false), 320);
    return () => clearTimeout(t);
  }, [mapOpen]);
  /* The last pin clicked. That property jumps to the top of the list so the
     agent can see what they just pointed at without hunting for it — which is
     the whole reason for putting the two side by side. */
  const [focused, setFocused] = useState<string | null>(null);
  /**
   * WHICH PHOTOGRAPH EACH CARD IS SHOWING.
   *
   * Keyed by the card's own key rather than by index, so paging through a
   * property's pictures survives the list re-sorting under it when a pin is
   * clicked. Keyed by index it would have looked like the photographs jumped
   * between houses.
   */
  const [slide, setSlide] = useState<Record<string, number>>({});

  /**
   * The galleries, fetched AFTER the cards are up.
   *
   * One upstream call per listing, so this deliberately does not block the
   * research request — see /api/ma-photos. The results are folded back onto
   * the listing objects themselves, which means the map's popup card gets
   * them too without a second piece of plumbing.
   *
   * `ids` is a string rather than an array so the effect fires when the LIST
   * changes and not on every render — a dependency array holding a fresh
   * array literal never compares equal, and this would have refetched the
   * whole gallery set forever.
   */
  const photoIds = (d?.onMarketNearby ?? [])
    .map((l) => l.listingId)
    .filter((n): n is number => typeof n === "number")
    .join(",");
  useEffect(() => {
    if (!photoIds) return;
    let live = true;
    fetch(`/api/ma-photos?ids=${photoIds}`)
      .then((r) => r.json())
      .then((j: { photos?: Record<string, string[]>; adverts?: Record<string, string | null> }) => {
        if (!live || !j.photos) return;
        setD((prev) =>
          prev
            ? {
                ...prev,
                onMarketNearby: prev.onMarketNearby.map((l) =>
                  l.listingId
                    ? {
                        ...l,
                        photos: j.photos![String(l.listingId)] ?? [],
                        advert: j.adverts?.[String(l.listingId)] ?? null,
                      }
                    : l
                ),
              }
            : prev
        );
      })
      /* No error state. Every card already has its lead photograph; a gallery
         that does not arrive costs an arrow, not a property. */
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [photoIds]);

  /**
   * LAST REQUEST WINS, AND ONLY THE LAST ONE.
   *
   * This is why the beds filter "didn't work". Homesearch takes a second or
   * two, the first unfiltered load is in flight while the screen is already
   * usable, and whichever response arrived LAST used to win. Pick 3 bed early
   * and the opening request lands afterwards and quietly puts the whole list
   * back — the control had moved, the list had not, and nothing looked broken.
   *
   * A counter rather than an AbortController because the stale response is not
   * an error to be handled, it is an answer to a question nobody is asking any
   * more. It is read and discarded.
   */
  const reqSeq = useRef(0);

  async function applyFilters(next: typeof filters) {
    setFilters(next);
    setRefiltering(true);
    const mine = ++reqSeq.current;
    const q = new URLSearchParams({ address, postcode });
    if (next.radius) q.set("radius", String(next.radius));
    if (next.beds) q.set("beds", String(next.beds));
    if (next.minRent) q.set("minRent", String(next.minRent));
    if (next.maxRent) q.set("maxRent", String(next.maxRent));
    if (next.type) q.set("type", next.type);
    try {
      const r = await fetch(`/api/ma-research?${q}`);
      const j = (await r.json()) as MaResearch & { error?: string };
      if (mine !== reqSeq.current) return;
      if (!j.error) setD(j);
    } catch {
      /* leave the previous feed up rather than blanking it */
    } finally {
      if (mine === reqSeq.current) setRefiltering(false);
    }
  }
  /* Shared with the map, so a pin and a card agree on which house they are.
     See listingKey for why it is not the address. */
  const keyOf = listingKey;

  /**
   * ONE SET OF CONTROLS, RENDERED IN ONE OF TWO PLACES.
   *
   * With the map open they float over it; with the map shut they sit on the
   * line above the cards. Never both — the same `filters` and the same
   * applyFilters either way, because two knobs for one value is how a screen
   * starts lying to itself.
   *
   * Every control is the SAME height and the same shape. They were a slider, a
   * bare select and two naked number boxes at four different sizes, which read
   * as four unrelated things rather than one filter bar.
   */
  function controlsFor(onMap: boolean) {
    const skin = onMap
      ? "border-line/60 bg-page/95 shadow-md backdrop-blur"
      : "border-line/70 bg-panel shadow-sm";
    const ctl = `inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[12px] transition-colors hover:border-ink/40 ${skin}`;
    const sel = "appearance-none bg-transparent pr-4 text-[12px] outline-none";
    const caret = (
      <span className="pointer-events-none -ml-3.5 text-[9px] text-muted">&#9662;</span>
    );
    return (
      <>
        {/* Radius first and widest, because it is the one whose effect you can
            SEE: drag it and the ring on the map moves with it. That is the
            whole argument for putting these on the map rather than above it. */}
        <label className={ctl} title="How far out to search">
          <span className="text-muted">Within</span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filters.radius}
            onChange={(e) => applyFilters({ ...filters, radius: Number(e.target.value) })}
            className="w-24 accent-[#e31f36]"
            aria-label="Search radius in miles"
          />
          <span className="figures w-[52px] shrink-0 text-[11.5px]">
            {filters.radius ? `${filters.radius} mi` : d?.sector ?? "sector"}
          </span>
        </label>

        <span className={ctl}>
          <select
            value={filters.beds}
            onChange={(e) => applyFilters({ ...filters, beds: Number(e.target.value) })}
            aria-label="Bedrooms"
            className={sel}
          >
            <option value={0}>Any beds</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} bed
              </option>
            ))}
          </select>
          {caret}
        </span>

        <span className={ctl}>
          <select
            value={filters.type}
            onChange={(e) => applyFilters({ ...filters, type: e.target.value as "" | "H" | "F" })}
            aria-label="Property type"
            className={sel}
          >
            <option value="">Any type</option>
            <option value="H">Houses</option>
            <option value="F">Flats</option>
          </select>
          {caret}
        </span>

        <span className={ctl} title="Rent per month">
          <span className="text-muted">&pound;</span>
          <input
            type="number"
            placeholder="min"
            aria-label="Minimum rent"
            value={filters.minRent || ""}
            onChange={(e) => setFilters({ ...filters, minRent: Number(e.target.value) })}
            onBlur={() => applyFilters(filters)}
            className="w-12 bg-transparent text-[12px] outline-none"
          />
          <span className="text-muted">&ndash;</span>
          <input
            type="number"
            placeholder="max"
            aria-label="Maximum rent"
            value={filters.maxRent || ""}
            onChange={(e) => setFilters({ ...filters, maxRent: Number(e.target.value) })}
            onBlur={() => applyFilters(filters)}
            className="w-12 bg-transparent text-[12px] outline-none"
          />
        </span>

        {(filters.radius || filters.beds || filters.type || filters.minRent || filters.maxRent) ? (
          <button
            type="button"
            onClick={() => applyFilters({ radius: 0, beds: 0, minRent: 0, maxRent: 0, type: "" })}
            className={`${ctl} text-muted`}
          >
            Clear
          </button>
        ) : null}

        {/* Said out loud, because a filtered map that is still fetching looks
            exactly like a filtered map that found nothing. */}
        {refiltering && <span className={`${ctl} text-muted`}>Looking&hellip;</span>}
      </>
    );
  }
  const mapControls = controlsFor(true);

  const available = useMemo(() => (d?.comparables ?? []).filter((c) => !c.letAgreed), [d]);

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const here = BUILD_STEPS[step].id as BuildStepId;
  const pages = pagesIn(plan);

  /**
   * A CIRCLE SHOWING A MAP — and it stays a map when you press it.
   *
   * James, 29 Aug: "the map icon should clearly look like a map, and as we
   * click on it, it shouldn't turn into a different colour. It should still
   * show us a map." So the old accent wash and the word "Map" printed across
   * it are gone: on is a ring, off is no ring, and the picture never changes.
   *
   * It lives on the step line, hard right, in line with Review. That is the
   * only row on this screen that is always there, and it buys back the entire
   * filter box the button used to sit in.
   *
   * The picture is a real static map of this property, drawn by /api/map-thumb
   * so the Google key stays on the server. No key means no picture and the
   * circle falls back to the pin — the button still works, it just is not a map.
   */
  const mapToggle = here === "available" && nearby.length > 0 ? (
    <button
      type="button"
      onClick={() => setMapOpen((m) => !m)}
      aria-pressed={mapOpen}
      aria-label={mapOpen ? "Hide the map" : "Show the map"}
      title={mapOpen ? "Hide the map" : "Show the map"}
      className={`relative ml-auto hidden h-9 w-9 shrink-0 overflow-hidden rounded-full border transition-all hover:scale-105 active:scale-95 lg:block ${
        mapOpen
          ? "border-accent-dark ring-2 ring-accent-dark/35"
          : "border-line/80 hover:border-ink/40"
      }`}
    >
      {/* No geocode means no tile, and the button falls back to a plain
          circle. It still opens the map — losing the picture must not lose
          the feature. */}
      {d?.subjectPoint ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tileUrl(d.subjectPoint.lat, d.subjectPoint.lon)}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      {/* The property, in the middle of its own map. Without it the circle is
          a picture of a town; with it, it is a picture of THIS one. */}
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-dark ring-2 ring-white/90" />
    </button>
  ) : null;

  const walk = (
    <>
      <button
        type="button"
        onClick={() => setStep((s) => Math.max(0, s - 1))}
        disabled={step === 0}
        className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-40"
      >
        ← Back
      </button>
      {step < BUILD_STEPS.length - 1 ? (
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white"
        >
          Next →
        </button>
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={making || !d}
          className="rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {making ? "Creating…" : "Create presentation"}
        </button>
      )}
    </>
  );

  const body = (
    <>
        <div className="flex shrink-0 items-center justify-between gap-3 px-0 py-3">
          <div className="min-w-0">
            <p className="hand text-[17px] leading-tight">Build the presentation</p>
            <p className="truncate text-[11.5px] text-muted">
              {address} · {postcode}
            </p>
          </div>
          {/* BACK AND NEXT LIVE UP HERE NOW. James, 29 Aug: "move the next
              button and the back button up there and into that space."

              They were a footer, and a footer is a bar the screen has to pay
              for on every step whether or not anything else needs the room.
              On the title line they cost nothing — the line was already there
              and half empty — and the map gets the height back. */}
          <div className="flex shrink-0 items-center gap-2">
            {walk}
            {onClose && (
              <button type="button" onClick={onClose} className="ml-1 text-[18px] leading-none text-muted hover:text-ink">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* The five steps, clickable — an agent who wants to change one thing
            shouldn't have to walk the whole wizard again. */}
        <nav className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line/70 px-0 py-2.5">
          {BUILD_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              title={s.blurb}
              className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                i === step ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
              }`}
            >
              <span className="mr-1 opacity-50">{i + 1}</span>
              {s.label}
            </button>
          ))}
          {mapToggle}
        </nav>

        {/* WHEREVER THE PAGE ENDS IS WHERE THE MAP ENDS. James, 29 Aug.

            With the map open this stops being the scroller and becomes a
            column: the map takes whatever height is left after the title line
            and the steps, and the CARDS are the only thing that moves. No
            calc(100vh - a-number-I-guessed) — that number was wrong on every
            screen except the one it was measured on. */}
        <div
          className={
            mapMounted && here === "available"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-0 py-3"
              : "min-h-0 flex-1 overflow-y-auto px-0 py-3"
          }
        >
          {error && <p className="text-[12.5px] text-accent-dark">{error}</p>}
          {!d && !error && <p className="text-[12.5px] text-muted">Pulling the research…</p>}

          {d && here === "property" && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted">{BUILD_STEPS[0].blurb}</p>
              {d.addressWarning && (
                <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px] leading-relaxed">
                  {d.addressWarning}
                </p>
              )}
              {/* The same panel the appraisal file shows. One component rather
                  than two, so the deck an agent builds can never disagree with
                  the file they built it from. "Confirmed: Yes" used to live
                  here as a standalone box; it is now the panel's Matched pill,
                  which says the same thing next to the evidence for it. */}
              {/* The address is already in the header two lines up, and the
                  panel repeats property type. James spotted the duplication:
                  "you've got them in the boxes above". One or the other. */}
              <MaterialInfoPanel material={d.material} warning={d.addressWarning} hideVerbose />
            </div>
          )}

          {d && here === "available" && nearby.length > 0 && (
            <div className={mapMounted ? "flex min-h-0 flex-1 flex-col" : "mb-5"}>
              {/* NO BOX. The filter row is the row — a bordered, tinted panel
                  around four controls was a container drawn for its own sake,
                  and it cost the screen the vertical space that made the map
                  and the cards not fit together.

                  With the map open the same controls are floating ON it, so
                  this row folds away rather than duplicating them. It COLLAPSES
                  rather than disappears, so the cards rise into the space
                  instead of jumping. */}
              <div
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  mapOpen ? "mb-0 max-h-0 opacity-0" : "mb-3 max-h-24 opacity-100"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">{controlsFor(false)}</div>
                {/* How far out, said in words. The slider's own number says
                    "3 mi"; this says three miles OF WHERE, which is the bit an
                    agent is actually being asked to defend. */}
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  {refiltering
                    ? "Searching\u2026"
                    : filters.radius
                      ? `${nearby.length} on the market within ${filters.radius} ${filters.radius === 1 ? "mile" : "miles"} of ${postcode} \u2014 every agent's stock, not just ours.`
                      : `${nearby.length} on the market in ${d.sector} only \u2014 every agent's stock, not just ours. Drag the slider to reach further out.`}
                </p>
              </div>

              {/* SPLIT VIEW. Cards left, map right, both scrolling in their own
                  right — the Airbnb shape, and it works for the same reason:
                  you point at somewhere on the map and read about it without
                  either half moving out from under you.

                  The map is STICKY rather than scrolling with the list. A map
                  that leaves the screen while you scroll the results is a map
                  you have to keep scrolling back to. */}
              <div className={mapMounted ? "mt-3 flex min-h-0 flex-1 gap-4" : "mt-3"}>
                {/* WITH THE MAP OPEN THE LIST IS THE ONLY THING THAT SCROLLS.
                    James, 29 Aug: "if we scroll, it only scrolls the properties
                    on the left. If we do scroll on the right, it just moves the
                    map in and out."

                    So the column takes the height of the screen and scrolls
                    inside itself, and the map beside it never moves. The height
                    is measured from the viewport rather than fixed in pixels,
                    because this panel sits at different depths on a laptop and
                    a large monitor and a hardcoded 560px is right on neither. */}
                <ul
                  className={
                    mapMounted
                      /* Wider gaps than a boxed grid needs. With no border
                         the whitespace IS the separation — tight gaps make two
                         properties read as one, because nothing else says
                         where the first one stops. */
                      ? "grid min-h-0 flex-1 grid-cols-1 content-start gap-x-4 gap-y-6 overflow-y-auto pr-1 xl:grid-cols-2"
                      : "grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  }
                >
                {[...nearby]
                  .sort((a, b) => {
                    /* Only the clicked one moves. A full re-sort on every click
                       would shuffle the list under the agent's cursor, which is
                       worse than not helping at all. */
                    if (focused === keyOf(a)) return -1;
                    if (focused === keyOf(b)) return 1;
                    return 0;
                  })
                  .map((l) => {
                  const k = keyOf(l);
                  const on = pickedNearby.includes(k);
                  /* The lead photograph FIRST, then the gallery. The two
                     sources overlap — `image` is usually also in `images` —
                     so the lead one is deduped out rather than shown twice. */
                  const shots = l.photos?.length
                    ? [l.image, ...l.photos.filter((u) => u !== l.image)].filter(
                        (u): u is string => Boolean(u)
                      )
                    : l.image
                      ? [l.image]
                      : [];
                  const at = shots.length ? ((slide[k] ?? 0) % shots.length + shots.length) % shots.length : 0;
                  const step = (e: React.MouseEvent, by: number) => {
                    e.stopPropagation();
                    setSlide((m) => ({ ...m, [k]: (m[k] ?? 0) + by }));
                  };
                  return (
                    <li key={k}>
                      {/* NO BOX. James, 29 Aug: "I like the fact that they
                          don't have white boxes underneath like we do. We've
                          got the photo, and then we've got our connecting line
                          to make it into a tile."

                          He is right, and the reason is that the border was
                          doing no work. It drew a container around a
                          photograph that is already a rectangle, and the line
                          under the picture split one property into two halves.
                          The photo has a shape of its own; the words belong to
                          it by sitting underneath, not by being fenced in with
                          it. Selection is shown on the tick and a ring on the
                          PHOTO instead — the border was carrying that meaning
                          and losing it in the process. */}
                      <div className="group cursor-pointer" onClick={() => setFocused(k)}>
                        <div className="relative">
                          {/* Plain img, not next/image: these are third-party
                              S3 URLs, and a remote-image allowlist for a feed
                              whose host may change is config that breaks
                              silently the day it does. */}
                          {shots.length ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={shots[at]}
                              alt=""
                              loading="lazy"
                              /* 4:3 keeps a terrace whole. h-32 cropped these
                                 to a letterbox and cut the roofline off every
                                 one — a property photo with no property in it. */
                              className={`aspect-[4/3] w-full rounded-2xl bg-line/30 object-cover transition-all ${
                                on ? "ring-2 ring-accent-dark ring-offset-2 ring-offset-page" : ""
                              }`}
                            />
                          ) : (
                            <div
                              className={`flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-line/20 text-[11px] text-muted ${
                                on ? "ring-2 ring-accent-dark ring-offset-2 ring-offset-page" : ""
                              }`}
                            >
                              No photograph
                            </div>
                          )}

                          {/* The tick sits ON the photo, like the heart in the
                              reference. It was a checkbox in the row of text,
                              which put the one deliberate action on the card
                              in the least deliberate place. */}
                          <button
                            type="button"
                            aria-label={on ? "Remove from the deck" : "Add to the deck"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPickedNearby((c) =>
                                on ? c.filter((x) => x !== k) : [...c, k]
                              );
                            }}
                            className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[13px] shadow-sm transition-transform hover:scale-110 ${
                              on ? "bg-accent-dark text-white" : "bg-page/85 text-muted"
                            }`}
                          >
                            &#10003;
                          </button>

                          {l.status === "let agreed" && (
                            <span className="absolute left-2 top-2 rounded-full bg-page/95 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent-dark shadow-sm">
                              Let agreed
                            </span>
                          )}

                          {/* THE REAL ADVERT, bottom right and out of the
                              gallery arrows' way. This existed before and
                              pointed at Homesearch's bearer-token API URL — a
                              401 in front of a landlord. `current_listings/
                              <id>/url` resolves the actual Rightmove or
                              OnTheMarket page; 19 of 21 rows have one, and the
                              arrow is simply absent on the two that do not. */}
                          {l.advert && (
                            <a
                              href={l.advert}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Open the advert"
                              title="Open the advert"
                              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-page/90 text-[13px] text-ink opacity-0 shadow-sm transition-all hover:scale-110 group-hover:opacity-100"
                            >
                              &#8599;
                            </a>
                          )}

                          {/* PAGE THE PHOTOGRAPHS WITHOUT LEAVING THE LIST.
                              James, 29 Aug: "as we hover over to see the
                              photos, the arrow should pop up in the middle of
                              the right-hand side... every time we click the
                              button it will then show us a different photo."

                              This arrow used to open "the advert", which was
                              really Homesearch's bearer-token API URL — a 401
                              in front of a landlord. Now it does the thing it
                              always looked like it did.

                              Only when there IS more than one: an arrow that
                              returns you to the same picture is worse than no
                              arrow, because you press it twice to find out. */}
                          {shots.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => step(e, -1)}
                                aria-label="Previous photograph"
                                className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[13px] text-ink opacity-0 shadow-sm transition-all hover:scale-110 group-hover:opacity-100"
                              >
                                &#8249;
                              </button>
                              <button
                                type="button"
                                onClick={(e) => step(e, 1)}
                                aria-label="Next photograph"
                                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[13px] text-ink opacity-0 shadow-sm transition-all hover:scale-110 group-hover:opacity-100"
                              >
                                &#8250;
                              </button>

                              {/* How many, and where you are in them. Without
                                  this the arrows are a loop with no end and no
                                  sense of how much there is left to see. */}
                              <span className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
                                {shots.slice(0, 6).map((_, i) => (
                                  <span
                                    key={i}
                                    className={`h-1.5 w-1.5 rounded-full transition-all ${
                                      i === Math.min(at, 5) ? "bg-white" : "bg-white/55"
                                    }`}
                                  />
                                ))}
                                {shots.length > 6 && (
                                  <span className="ml-0.5 text-[9px] font-semibold text-white/90">
                                    {at + 1}/{shots.length}
                                  </span>
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Floating underneath, on the page. No panel, no line. */}
                        <div className="px-0.5 pt-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="figures text-[13.5px]">
                              {l.rent ? money(l.rent) : "\u2014"}
                              <span className="text-[10.5px] text-muted"> pcm</span>
                            </span>
                            {l.daysListed != null && (
                              <span className="text-[10.5px] text-muted">{l.daysListed}d listed</span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[12px]">{l.address}</p>
                          <p className="truncate text-[10.5px] text-muted">
                            {[l.beds ? `${l.beds} bed` : null, l.type, l.postcode]
                              .filter(Boolean)
                              .join(" \u00b7 ")}
                          </p>
                          {l.agent && (
                            <p className="truncate text-[10.5px] text-muted">{l.agent}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
                </ul>

                {/* Three quarters of the width was asked for; 58% is what that
                    means once the two-column card grid beside it still has to
                    hold a photograph and a price without wrapping.

                    IT SLIDES OUT OF THE CORNER IT WAS SUMMONED FROM. The width
                    animates, so the cards reflow with it rather than snapping;
                    `min-w` on the inner panel keeps the map its own size while
                    the column narrows, so it slides behind the edge instead of
                    being squashed into it. */}
                {mapMounted && (
                  <div
                    className={`hidden h-full shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
                      mapIn ? "w-[58%] opacity-100" : "w-0 opacity-0"
                    }`}
                  >
                    <div className="h-full min-w-[440px]">
                      <MarketMap
                        listings={nearby}
                        centre={d.subjectPoint}
                        selected={pickedNearby}
                        radiusMiles={filters.radius}
                        controls={mapControls}
                        /* Clicking a price brings that card to the top of the
                           list so it can be read — the half of the old
                           behaviour that was actually useful. */
                        onOpen={(k) => setFocused(k)}
                        /* Ticking now happens on the card that pops out of the
                           map, where the photo and the rent are visible. It
                           used to fire on the same click as opening, which made
                           adding a competitor's property to a landlord's deck a
                           side effect of pointing at it. */
                        onSelect={(k) =>
                          setPickedNearby((c) =>
                            c.includes(k) ? c.filter((x) => x !== k) : [...c, k]
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {d && here === "let" && (
            <div className="mb-5">
              {/* "Advertised Nd", not "let in Nd". The span is publication to
                  leased, so it is time on the market — which is the honest
                  reading and still the persuasive one. A row whose stamps do
                  not give a trustworthy span shows no number at all rather
                  than a rounded guess. */}
              <p className="text-[12.5px] leading-relaxed text-muted">
                What <span className="font-semibold">we</span> have let in {d.postcode.split(" ")[0]},
                most recent first, and how long each was advertised. This is ours rather than
                the whole market&apos;s, which is what makes it worth showing.
              </p>
              {d.recentlyLet.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-[12.5px] leading-relaxed text-muted">
                  Nothing let in this district yet. That is our book being thin here rather than
                  a fault, and better said plainly than papered over with something from further away.
                </p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {d.recentlyLet.map((l, i) => (
                    <li key={`${l.address}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-2 text-[12.5px]">
                      <span className="min-w-0">
                        {l.address}
                        <span className="ml-2 text-[11px] text-muted">
                          {[l.beds ? `${l.beds} bed` : null, l.postcode].filter(Boolean).join(" \u00b7 ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-muted">
                        {l.rent ? <span className="figures text-ink">{money(l.rent)}</span> : "\u2014"}
                        {l.daysToLet != null ? ` \u00b7 advertised ${l.daysToLet}d` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* MOVED HERE FROM "On the market". James, 29 Aug.

                  That step is the whole market — every agent's stock, with a
                  map. Our own book sitting underneath it was a second list
                  answering a different question on a screen already full of
                  the first one. Here it belongs: this step is the only one
                  that is about US, so "what we let" and "what we are letting"
                  now sit together and the market step is just the market. */}
              <p className="mt-6 border-t border-line/70 pt-5 text-[12.5px] leading-relaxed text-muted">
                And from our own book right now &mdash; the ones we are letting and can
                speak to.
              </p>
              <div className="space-y-3">
              {available.length === 0 ? (
                <p className="rounded-xl border border-line/70 p-4 text-[12.5px] text-muted">
                  Nothing here for this postcode. That is a real answer, not a failure — carry
                  on, and this section simply won&apos;t appear in the deck.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {available.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line/70 p-3 text-[12.5px]">
                        <input
                          type="checkbox"
                          checked={chosen.includes(c.id)}
                          onChange={() => toggle(c.id)}
                          className="h-4 w-4 accent-[#e31f36]"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {c.name}
                          <span className="ml-1.5 text-[10.5px] text-muted">{c.locality}</span>
                        </span>
                        {c.daysOnMarket != null && (
                          <span className="shrink-0 text-[10.5px] text-muted">
                            {c.letAgreed ? `let in ${c.daysOnMarket}d` : `${c.daysOnMarket}d`}
                          </span>
                        )}
                        <Pill tone={c.nearness === "sector" ? "accent" : "neutral"}>
                          {c.nearness === "sector" ? "same sector" : c.nearness === "district" ? "same district" : "wider area"}
                        </Pill>
                        <span className="figures shrink-0">{c.rentDisplay}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] leading-relaxed text-muted">
                Only same-sector properties start ticked. A pre-ticked box is a
                recommendation, and recommending one from the other side of the city is how
                you end up defending a property you have never seen.
              </p>
              </div>
            </div>
          )}

          {d && here === "market" && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted">{BUILD_STEPS[3].blurb}</p>
              {d.guide ? (
                <div className="rounded-xl border border-line/70 p-4">
                  <p className="figures text-[22px] leading-none">{money(d.guide.mid)} pcm</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {money(d.guide.low)}–{money(d.guide.high)} · {d.guide.basedOn} comparables ·{" "}
                    {d.guide.ring === "sector" ? "same sector" : d.guide.ring === "district" ? "same district" : "wider area"}
                  </p>
                  {d.guide.caveat && (
                    <p className="mt-2 text-[11.5px] leading-relaxed text-accent-dark">{d.guide.caveat}</p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-line/70 p-4 text-[12.5px] text-muted">
                  No guide — nothing in our book near this postcode.
                </p>
              )}
              <p className="text-[12px] text-muted">
                {d.areaAverage
                  ? `Homesearch: average ${d.areaAverage.beds}-bed asking rent in ${d.sector} is ${money(d.areaAverage.avgRent)} pcm.`
                  : "Homesearch has no average for this sector and bed count, so the market section will be left out."}
              </p>
            </div>
          )}

          {here === "review" && made && (
            <div className="mb-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-4">
              <p className="text-[13px] font-semibold">The presentation is ready.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                This is the link the landlord opens. Check it before you send it — it has
                their name on it.
              </p>
              <a
                href={made}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[12.5px] underline"
              >
                {made}
              </a>
            </div>
          )}

          {here === "review" && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted">
                {pages.length} pages, {chosen.length} comparable{chosen.length === 1 ? "" : "s"}.
                Untick to leave a section out; everything stays saved either way.
              </p>
              <ul className="space-y-1.5">
                {plan.order.map((id) => {
                  const s = DECK_SECTIONS.find((x) => x.id === id);
                  if (!s) return null;
                  const on = s.always || plan.enabled[s.id];
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl border border-line/70 p-3 text-[12.5px]"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={s.always}
                        onChange={() =>
                          setPlan((p) => ({ ...p, enabled: { ...p.enabled, [s.id]: !p.enabled[s.id] } }))
                        }
                        className="h-4 w-4 accent-[#e31f36] disabled:opacity-40"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block">{s.label}</span>
                        <span className="block text-[10.5px] text-muted">{s.blurb}</span>
                      </span>
                      {s.always ? (
                        <Pill tone="neutral">always in</Pill>
                      ) : (
                        <span className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => setPlan((p) => reorder(p, s.id, -1))}
                            className="rounded border border-line/80 px-2 text-[12px]"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlan((p) => reorder(p, s.id, 1))}
                            className="rounded border border-line/80 px-2 text-[12px]"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] leading-relaxed text-muted">
                Welcome stays first and the close stays last. Not tidiness — a deck that
                opens on a rent table shows a landlord a number before it has said who is
                speaking.
              </p>
            </div>
          )}
        </div>

    </>
  );

  /* A page fills the screen and keeps its own scroll; a modal has to be
     portalled and capped. Same content either way — only the frame differs. */
  if (fullPage) {
    return (
      /* FULL BLEED. The negative margins cancel the Shell's own page padding
         (px-5 / lg:px-10 / 2xl:px-14, py-8) and a slimmer gutter is put back,
         so this screen gets the window rather than the content column.

         It is worth the trick because of what this page has to hold at once:
         a step line, a filter row, a two-up card grid and a map beside it. In
         the padded column that stack ran off the bottom, and an agent stood in
         a landlord's hallway scrolling to find the map. `overflow-hidden` and
         a fixed viewport height mean the page itself never scrolls — only the
         card column inside it does. */
      <div className="-mx-5 -my-8 flex h-[100dvh] flex-col overflow-hidden px-5 lg:-mx-10 lg:px-8 2xl:-mx-14 2xl:px-8">
        {backHref && (
          <Link href={backHref} className="mt-4 inline-block shrink-0 text-[12px] text-muted underline">
            ← Back to the appraisal
          </Link>
        )}
        {/* NO PANEL. James, 29 Aug: "where we've got the container box for
            build a presentation, I think we should just get rid of it."

            Same reasoning as the cards. As a modal the box was the thing that
            made it a modal — it had to end somewhere. As a PAGE it is a box
            drawn around the whole page, so the border traces the window and
            the tint separates the screen from nothing. It also cost the map
            its edges: a full-bleed map inside a rounded panel is a map with a
            frame around it, which is precisely the look this screen has been
            trying to lose. */}
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      </div>
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-page shadow-2xl">
        {body}
      </div>
    </div>,
    document.body
  );
}
