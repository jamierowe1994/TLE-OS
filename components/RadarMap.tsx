"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogle } from "@/components/MarketMap";
import { SIGNALS, type Prospect } from "@/lib/radar-signals";

/**
 * Landlord Radar on a map.
 *
 * Same bones as PortfolioMap — Google's tiles with the clutter styled off, an
 * OverlayView so our own HTML pins follow every pan and zoom — and a third
 * job for them. Portfolio answers "where is the business"; this answers
 * "where are the landlords who look ready to move". So a pin is a SCORE, not
 * a rent, and the colour is how hot it is.
 *
 * ── Why the pins are filtered to the viewport ─────────────────────────────
 *
 * Portfolio draws 449 pins. This one has 1,800 on day one and will grow. A
 * DOM button per pin is fine at that count, but not if every pan re-lays out
 * the ones that are off screen, so `project` only keeps what is inside the
 * container with a margin. Zoomed out to the whole patch that is everything;
 * zoomed into a street it is a handful.
 *
 * ── "In view" is the search ───────────────────────────────────────────────
 *
 * James, 2 Sep: "they can actually run their own searches". Rather than a
 * drawing tool, the map reports what is inside it as it moves, and the
 * board can turn that into a list. Pan to a street, press List these.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

type Pt = { id: string; x: number; y: number; p: Prospect };

/** How hot. Three bands, so the legend can be read in a glance. */
export function heat(score: number): "hot" | "warm" | "cool" {
  return score >= 60 ? "hot" : score >= 30 ? "warm" : "cool";
}

export default function RadarMap({
  prospects,
  openId,
  onOpen,
  onInView,
}: {
  prospects: Prospect[];
  openId: string | null;
  onOpen: (key: string) => void;
  /** The keys currently inside the map, whenever it moves. */
  onInView: (keys: string[]) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pts, setPts] = useState<Pt[]>([]);
  const [card, setCard] = useState<Prospect | null>(null);
  /* Fit the bounds once per SET of properties, not per render: a stage
     change hands the map a new array holding the same places, and refitting
     then would snap it back from wherever they had panned. */
  const fittedFor = useRef<string | null>(null);

  const placed = prospects.filter((p) => p.lat != null && p.lon != null);
  const placedSig = placed.map((p) => p.property_key).join("|");

  const project = useCallback(() => {
    const pr = overlay.current?.getProjection?.();
    const el = holder.current;
    if (!pr || !el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const shown: Pt[] = [];
    const inView: string[] = [];
    for (const p of placed) {
      const q = pr.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat as number, p.lon as number));
      if (!q) continue;
      if (q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= h) inView.push(p.property_key);
      if (q.x >= -60 && q.x <= w + 60 && q.y >= -60 && q.y <= h + 60) {
        shown.push({ id: p.property_key, x: q.x, y: q.y, p });
      }
    }
    setPts(shown);
    onInView(inView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects]);

  useEffect(() => {
    let dead = false;
    loadGoogle()
      .then(() => {
        if (dead || !holder.current) return;
        if (!map.current) {
          map.current = new google.maps.Map(holder.current, {
            center: { lat: 52.15, lng: -0.75 },
            zoom: 9,
            styles: [
              { featureType: "poi", stylers: [{ visibility: "off" }] },
              { featureType: "transit", stylers: [{ visibility: "off" }] },
              { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dcecd2" }] },
              { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e4efdc" }] },
              { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f2f1ef" }] },
              { featureType: "water", elementType: "geometry", stylers: [{ color: "#c3ddf2" }] },
              { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
              { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
              { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fdfcfa" }] },
              { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f7e7c3" }] },
              { elementType: "labels.text.fill", stylers: [{ color: "#6b6560" }] },
              { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
              { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
              { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
            ],
            disableDefaultUI: true,
            scrollwheel: true,
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: false,
          });
          const ov = new google.maps.OverlayView();
          ov.onAdd = () => {};
          ov.onRemove = () => {};
          ov.draw = () => project();
          ov.setMap(map.current);
          overlay.current = ov;
          map.current.addListener("bounds_changed", () => project());
          map.current.addListener("click", () => setCard(null));
        }
        setReady(true);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Re-project when the list changes; fit only when it is a new list. */
  useEffect(() => {
    if (!ready || !map.current) return;
    if (fittedFor.current !== placedSig) {
      fittedFor.current = placedSig;
      const b = new google.maps.LatLngBounds();
      placed.forEach((p) => b.extend({ lat: p.lat as number, lng: p.lon as number }));
      if (!b.isEmpty()) {
        map.current.fitBounds(b, 40);
        const z = map.current.getZoom();
        if (z != null && z > 16) map.current.setZoom(16);
      }
    }
    project();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, prospects]);

  /* A card for a property that has since been filtered out closes. */
  useEffect(() => {
    if (card && !prospects.some((p) => p.property_key === card.property_key)) setCard(null);
  }, [prospects, card]);

  if (!KEY || failed) {
    return (
      <div className="flex h-full min-h-[360px] w-full items-center justify-center rounded-2xl border border-dashed border-line/70 p-6 text-center">
        <p className="text-[12.5px] leading-relaxed text-muted">
          The map needs <span className="font-semibold">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> on this
          environment.
          <br />
          The list works without it.
        </p>
      </div>
    );
  }

  const pinClass = (p: Prospect, isOpen: boolean) => {
    if (isOpen) return "z-[3] border-ink bg-ink text-page";
    switch (heat(p.score)) {
      case "hot":
        return "z-[2] border-accent-dark bg-accent-dark text-white";
      case "warm":
        return "z-[1] border-accent-dark/60 bg-accent-soft text-accent-dark";
      default:
        return "z-[1] border-line/70 bg-page text-ink";
    }
  };

  return (
    <div className="relative h-full">
      <div ref={holder} className="h-full w-full overflow-hidden rounded-2xl border border-line/70 bg-line/10" />

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-muted/70"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
        </div>
      )}

      {ready && (
        <div className="absolute right-3 top-3 z-[5] flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-page shadow-md">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => map.current?.setZoom((map.current.getZoom() ?? 9) + 1)}
            className="h-9 w-9 border-b border-line/60 text-[15px] leading-none text-ink transition-colors hover:bg-line/20"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => map.current?.setZoom((map.current.getZoom() ?? 9) - 1)}
            className="h-9 w-9 text-[15px] leading-none text-ink transition-colors hover:bg-line/20"
          >
            &minus;
          </button>
        </div>
      )}

      {ready && (
        <div className="pointer-events-none absolute left-3 top-3 z-[5] flex flex-wrap items-center gap-2 rounded-full border border-line/70 bg-page/95 px-3 py-1.5 text-[11px] text-muted shadow-sm">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-dark" /> 60 and up
          <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full border border-accent-dark/60 bg-accent-soft" /> 30 to 59
          <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full border border-line/70 bg-page" /> under 30
          {placed.length < prospects.length && (
            <span className="ml-1">· {prospects.length - placed.length} without a location</span>
          )}
        </div>
      )}

      {ready &&
        pts.map(({ id, x, y, p }) => {
          const isOpen = openId === id || card?.property_key === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCard(p)}
              title={p.address || p.street || p.postcode}
              className={`figures absolute whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold shadow-sm transition-transform hover:scale-110 ${pinClass(p, isOpen)}`}
              style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
            >
              {p.score}
            </button>
          );
        })}

      {ready &&
        card &&
        (() => {
          const at = pts.find((q) => q.id === card.property_key);
          if (!at) return null;
          return (
            <div
              className="fade-up pointer-events-none absolute z-[4]"
              style={{ left: at.x, top: at.y, transform: "translate(-50%, calc(-100% - 16px))" }}
            >
              <div className="pointer-events-auto w-[260px] overflow-hidden rounded-2xl border border-line/70 bg-page p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12.5px] leading-snug">{card.address || card.street || card.postcode}</p>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setCard(null)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line/70 text-[10px] text-muted"
                  >
                    &#10005;
                  </button>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {[card.postcode, card.agent, card.rent != null ? `£${card.rent.toLocaleString("en-GB")} pcm` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {card.signals.slice(0, 4).map((s) => (
                    <span key={s.key} title={s.detail} className="rounded-full border border-line/70 px-2 py-0.5 text-[10px]">
                      {SIGNALS[s.key].label}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(card.property_key)}
                  className="mt-2.5 w-full rounded-full border border-ink/80 py-1.5 text-[11.5px] font-semibold transition-colors hover:bg-ink hover:text-page"
                >
                  Open
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
