"use client";

import { useEffect, useMemo, useState } from "react";
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
function tileUrl(lat: number, lon: number, z = 14): string {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  /* Same service as the map beside it — see the note in MarketMap for why
     it is not CARTO, OSM or Google. */
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
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
    const q = new URLSearchParams({ address, postcode, beds: "2" });
    fetch(`/api/ma-research?${q}`)
      .then((r) => r.json())
      .then((j: MaResearch & { error?: string }) => {
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
  /* The last pin clicked. That property jumps to the top of the list so the
     agent can see what they just pointed at without hunting for it — which is
     the whole reason for putting the two side by side. */
  const [focused, setFocused] = useState<string | null>(null);

  async function applyFilters(next: typeof filters) {
    setFilters(next);
    setRefiltering(true);
    const q = new URLSearchParams({ address, postcode, beds: "2" });
    if (next.radius) q.set("radius", String(next.radius));
    if (next.beds) q.set("beds", String(next.beds));
    if (next.minRent) q.set("minRent", String(next.minRent));
    if (next.maxRent) q.set("maxRent", String(next.maxRent));
    if (next.type) q.set("type", next.type);
    try {
      const r = await fetch(`/api/ma-research?${q}`);
      const j = (await r.json()) as MaResearch & { error?: string };
      if (!j.error) setD(j);
    } catch {
      /* leave the previous feed up rather than blanking it */
    } finally {
      setRefiltering(false);
    }
  }
  const keyOf = (l: { address: string; rent: number | null }) => `${l.address}|${l.rent}`;

  const available = useMemo(() => (d?.comparables ?? []).filter((c) => !c.letAgreed), [d]);
  const let_ = useMemo(() => (d?.comparables ?? []).filter((c) => c.letAgreed), [d]);

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const here = BUILD_STEPS[step].id as BuildStepId;
  const pages = pagesIn(plan);

  const body = (
    <>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div className="min-w-0">
            <p className="hand text-[17px] leading-tight">Build the presentation</p>
            <p className="truncate text-[11.5px] text-muted">
              {address} · {postcode}
            </p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-ink">
              ✕
            </button>
          )}
        </div>

        {/* The five steps, clickable — an agent who wants to change one thing
            shouldn't have to walk the whole wizard again. */}
        <nav className="flex shrink-0 flex-wrap gap-1.5 border-b border-line/70 px-5 py-3">
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
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
            <div className="mb-5">
              {/* Say what the list was ASKED for, so nobody has to guess why a
                  property is in it. */}
              <div className="mb-3 rounded-xl border border-line/70 bg-box p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-[11px]">
                    <span className="block text-[9.5px] uppercase tracking-wide text-muted">
                      How far out — {filters.radius ? `${filters.radius} miles` : d.sector}
                    </span>
                    <input
                      type="range" min={0} max={10} step={0.5}
                      value={filters.radius}
                      onChange={(e) => applyFilters({ ...filters, radius: Number(e.target.value) })}
                      className="mt-1.5 w-44 accent-[#e31f36]"
                    />
                  </label>
                  <label className="text-[11px]">
                    <span className="block text-[9.5px] uppercase tracking-wide text-muted">Beds</span>
                    <select
                      value={filters.beds}
                      onChange={(e) => applyFilters({ ...filters, beds: Number(e.target.value) })}
                      className="mt-1 rounded-lg border border-line/80 bg-panel px-2 py-1.5 text-[12px]"
                    >
                      <option value={0}>Any</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px]">
                    <span className="block text-[9.5px] uppercase tracking-wide text-muted">Type</span>
                    <select
                      value={filters.type}
                      onChange={(e) => applyFilters({ ...filters, type: e.target.value as "" | "H" | "F" })}
                      className="mt-1 rounded-lg border border-line/80 bg-panel px-2 py-1.5 text-[12px]"
                    >
                      <option value="">Any</option>
                      <option value="H">Houses</option>
                      <option value="F">Flats</option>
                    </select>
                  </label>
                  <label className="text-[11px]">
                    <span className="block text-[9.5px] uppercase tracking-wide text-muted">Rent £</span>
                    <span className="mt-1 flex items-center gap-1">
                      <input type="number" placeholder="min" value={filters.minRent || ""}
                        onChange={(e) => setFilters({ ...filters, minRent: Number(e.target.value) })}
                        onBlur={() => applyFilters(filters)}
                        className="w-20 rounded-lg border border-line/80 bg-panel px-2 py-1.5 text-[12px]" />
                      <input type="number" placeholder="max" value={filters.maxRent || ""}
                        onChange={(e) => setFilters({ ...filters, maxRent: Number(e.target.value) })}
                        onBlur={() => applyFilters(filters)}
                        className="w-20 rounded-lg border border-line/80 bg-panel px-2 py-1.5 text-[12px]" />
                    </span>
                  </label>
                  {/* A CIRCLE SHOWING A MAP, not a button saying "Map".
                      James, 29 Aug: "rather than having a map button... could
                      we just show a little tiny map in there."

                      The picture is a real static map of this property, drawn
                      by /api/map-thumb so the Google key stays on the server.
                      No key means no picture and the circle falls back to the
                      icon — the button still works, it just is not a map. */}
                  <button
                    type="button"
                    onClick={() => setMapOpen((m) => !m)}
                    aria-pressed={mapOpen}
                    aria-label={mapOpen ? "Hide the map" : "Show the map"}
                    title={mapOpen ? "Hide the map" : "Show the map"}
                    className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-full border transition-all hover:scale-105 active:scale-95 ${
                      mapOpen
                        ? "border-accent-dark ring-2 ring-accent-dark/30"
                        : "border-line/80"
                    }`}
                  >
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
                    <span
                      className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold uppercase tracking-wider transition-colors ${
                        mapOpen ? "bg-accent-dark/70 text-white" : "bg-page/45 text-ink"
                      }`}
                    >
                      Map
                    </span>
                  </button>
                  {(filters.radius || filters.beds || filters.type || filters.minRent || filters.maxRent) ? (
                    <button type="button"
                      onClick={() => applyFilters({ radius: 0, beds: 0, minRent: 0, maxRent: 0, type: "" })}
                      className="rounded-lg border border-line/80 px-2.5 py-1.5 text-[11.5px] text-muted">
                      Reset
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                  {refiltering ? "Searching…" : d.marketFilters?.appliedRadius
                    ? `Within ${filters.radius} miles of ${postcode} — a box, because Homesearch has no radius; the width is narrowed by latitude so it stays circular-ish.`
                    : `Sector ${d.sector} only. Drag the slider to reach further out.`}
                </p>
              </div>

              <p className="text-[12.5px] leading-relaxed text-muted">
                {nearby.length} on the market — every agent&apos;s stock, not just ours.
                This is what a tenant is choosing between.
                {mapOpen && focused ? " Clicking a price brings it to the top." : ""}
              </p>

              {/* SPLIT VIEW. Cards left, map right, both scrolling in their own
                  right — the Airbnb shape, and it works for the same reason:
                  you point at somewhere on the map and read about it without
                  either half moving out from under you.

                  The map is STICKY rather than scrolling with the list. A map
                  that leaves the screen while you scroll the results is a map
                  you have to keep scrolling back to. */}
              <div className={mapOpen ? "mt-3 flex gap-4" : "mt-3"}>
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
                    mapOpen
                      ? "grid h-[calc(100vh-260px)] flex-1 grid-cols-1 content-start gap-3 overflow-y-auto pr-1 xl:grid-cols-2"
                      : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
                  return (
                    <li key={k}>
                      <label
                        className={`block cursor-pointer overflow-hidden rounded-xl border transition-colors ${
                          on ? "border-accent-dark" : "border-line/70"
                        }`}
                      >
                        {/* Plain img, not next/image: these are third-party S3
                            URLs, and a remote-image allowlist for a feed whose
                            host may change is config that breaks silently the
                            day it does. */}
                        {l.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.image}
                            alt=""
                            loading="lazy"
                            /* Taller. h-32 cropped these to a letterbox and
                               cut the roofline off every terrace — a property
                               photo with no property in it. 4:3 keeps the
                               building whole at four across. */
                            className="aspect-[4/3] w-full bg-line/30 object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center bg-line/20 text-[11px] text-muted">
                            No photograph
                          </div>
                        )}
                        <div className="flex items-start gap-2 p-3">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setPickedNearby((c) => (on ? c.filter((x) => x !== k) : [...c, k]))
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#e31f36]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="figures text-[13px]">
                                {l.rent ? money(l.rent) : "\u2014"}
                                <span className="text-[10.5px] text-muted"> pcm</span>
                              </span>
                              {l.daysListed != null && (
                                <span className="text-[10.5px] text-muted">{l.daysListed}d listed</span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px]">{l.address}</span>
                            <span className="block truncate text-[10.5px] text-muted">
                              {[l.beds ? `${l.beds} bed` : null, l.type, l.postcode]
                                .filter(Boolean)
                                .join(" \u00b7 ")}
                            </span>
                            {l.agent && (
                              <span className="block truncate text-[10.5px] text-muted">{l.agent}</span>
                            )}
                          </span>
                        </div>
                      </label>
                    </li>
                  );
                })}
                </ul>

                {/* Three quarters of the width was asked for; 58% is what that
                    means once the two-column card grid beside it still has to
                    hold a photograph and a price without wrapping. */}
                {mapOpen && (
                  <div className="hidden w-[58%] shrink-0 lg:block">
                    <div className="sticky top-2">
                      <MarketMap
                        listings={nearby}
                        centre={d.subjectPoint}
                        selected={pickedNearby}
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

              <p className="mt-3 border-b border-line/70 pb-4 text-[11px] leading-relaxed text-muted">
                Nothing here starts ticked — it is somebody else&apos;s stock, and putting a
                competitor&apos;s property into our deck should be a decision, not a default.
              </p>
            </div>
          )}

          {d && here === "available" && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted">
                {here === "available"
                  ? "From our own book — the ones we are letting and can speak to."
                  : BUILD_STEPS[2].blurb}
              </p>
              {(here === "available" ? available : let_).length === 0 ? (
                <p className="rounded-xl border border-line/70 p-4 text-[12.5px] text-muted">
                  Nothing here for this postcode. That is a real answer, not a failure — carry
                  on, and this section simply won&apos;t appear in the deck.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(here === "available" ? available : let_).map((c) => (
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

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-5 py-3.5">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg border border-line/80 px-3.5 py-2 text-[12px] disabled:opacity-40"
          >
            ← Back
          </button>
          {step < BUILD_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12px] font-semibold text-white"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={making || !d}
              className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {making ? "Creating…" : "Create presentation"}
            </button>
          )}
        </div>
    </>
  );

  /* A page fills the screen and keeps its own scroll; a modal has to be
     portalled and capped. Same content either way — only the frame differs. */
  if (fullPage) {
    return (
      <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
        {backHref && (
          <Link href={backHref} className="mb-3 inline-block text-[12px] text-muted underline">
            ← Back to the appraisal
          </Link>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line/80 bg-panel">
          {body}
        </div>
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
