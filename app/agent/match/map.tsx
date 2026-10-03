"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogle } from "@/components/MarketMap";

/**
 * The map under Email the Database and Find a Home (3 Oct 2026, James's
 * "Create, Find and Join your circle" reference): the subject in the middle on
 * a coral pin, everyone or everything that fits around it on white pins, a
 * soft ring for the distance chosen.
 *
 * Google's map with the desk's own quiet style (components/MarketMap - no
 * shops, no bus stops), and the pins are React, positioned from an
 * OverlayView's projection exactly as the desk's market map does it. If
 * Google cannot be reached the same pins are drawn on rings instead, so the
 * screen is never a grey box.
 */

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  /** Who or what, for the screen reader. */
  name: string;
  /** Initials on the pin; empty draws a house (a home with no photo). */
  label: string;
  image?: string | null;
  on: boolean;
}

const STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dcecd2" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e4efdc" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f2f1ef" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c3ddf2" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f7e7c3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a837d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

const CORAL = "#de7c70";

export function PinMap({
  centre,
  centreImage,
  centreIcon = "home",
  pins,
  miles,
  onPin,
  onBlank,
  padTop = 150,
  padBottom = 0,
}: {
  centre: { lat: number; lng: number };
  centreImage?: string | null;
  /** What the middle pin draws with no photo: the home, or the tenant. */
  centreIcon?: "home" | "person";
  pins: Pin[];
  /** The ring drawn, and what the view fits. */
  miles: number;
  onPin: (id: string) => void;
  /** A tap on the map itself, not a pin. */
  onBlank?: () => void;
  /** Space the top bar takes, so the ring sits below it. */
  padTop?: number;
  /** Space the cards take at the foot, so the ring sits in what is visible. */
  padBottom?: number;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const ring = useRef<google.maps.Circle | null>(null);
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const pinsRef = useRef(pins);
  const blank = useRef(onBlank);
  blank.current = onBlank;
  pinsRef.current = pins;

  const project = () => {
    const p = overlay.current?.getProjection();
    if (!p) return;
    const next: Record<string, { x: number; y: number }> = {};
    const c = p.fromLatLngToContainerPixel(new google.maps.LatLng(centre.lat, centre.lng));
    if (c) next.__centre = { x: c.x, y: c.y };
    for (const pin of pinsRef.current) {
      const q = p.fromLatLngToContainerPixel(new google.maps.LatLng(pin.lat, pin.lng));
      if (q) next[pin.id] = { x: q.x, y: q.y };
    }
    setPos(next);
  };

  useEffect(() => {
    let dead = false;
    /* Google's own word that the key was refused (a page on an address the
       key does not allow): it would otherwise draw a grey "something went
       wrong" box, so the rings take over. */
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => !dead && setFailed(true);
    loadGoogle()
      .then(() => {
        if (dead || !holder.current) return;
        map.current = new google.maps.Map(holder.current, {
          center: centre,
          zoom: 13,
          /* So each distance chip fits its ring exactly, not the nearest whole zoom. */
          isFractionalZoomEnabled: true,
          styles: STYLE,
          disableDefaultUI: true,
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
        map.current.addListener("click", () => blank.current?.());
        ring.current = new google.maps.Circle({
          map: map.current,
          center: centre,
          radius: miles * 1609.34,
          strokeColor: CORAL,
          strokeOpacity: 0.55,
          strokeWeight: 1.5,
          fillColor: CORAL,
          fillOpacity: 0.06,
          clickable: false,
        });
        fit();
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fit = () => {
    if (!map.current || !ring.current) return;
    ring.current.setRadius(miles * 1609.34);
    const b = ring.current.getBounds();
    /* The whole ring in what is visible, with room to spare (James, 3 Oct
       2026: "the radius comes off the screen"). */
    if (b) map.current.fitBounds(b, { top: padTop, bottom: padBottom + 24, left: 30, right: 30 });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fit, [miles, padBottom, padTop]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(project, [pins]);

  if (failed) return <Rings centreImage={centreImage} centreIcon={centreIcon} pins={pins} miles={miles} centre={centre} onPin={onPin} padBottom={padBottom} />;

  return (
    <div className="absolute inset-0" style={{ background: "#f2f1ef" }}>
      <div ref={holder} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pins.map((p) => {
          const at = pos[p.id];
          return at ? <PinDot key={p.id} p={p} x={at.x} y={at.y} onPin={onPin} /> : null;
        })}
        {pos.__centre && <CentrePin x={pos.__centre.x} y={pos.__centre.y} image={centreImage} icon={centreIcon} />}
      </div>
    </div>
  );
}

/** The same picture without Google: rings for the distances, pins by bearing. */
function Rings({ centre, centreImage, centreIcon, pins, miles, onPin, padBottom }: { centre: { lat: number; lng: number }; centreImage?: string | null; centreIcon: "home" | "person"; pins: Pin[]; miles: number; onPin: (id: string) => void; padBottom: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 390, h: 700 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const top = 150;
  const usable = size.h - top - padBottom - 30;
  const cx = size.w / 2;
  const cy = top + usable / 2;
  const r = Math.max(60, Math.min(size.w / 2 - 20, usable / 2));
  const k = Math.cos((centre.lat * Math.PI) / 180);
  const place = (p: Pin) => {
    const dx = (p.lng - centre.lng) * k * 69.17;
    const dy = (p.lat - centre.lat) * 69.17;
    return { x: cx + (dx / miles) * r, y: cy - (dy / miles) * r };
  };
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" style={{ background: "#f4f1ec" }}>
      {[1, 0.66, 0.33].map((f) => (
        <span
          key={f}
          className="absolute rounded-full"
          style={{ left: cx - r * f, top: cy - r * f, width: r * 2 * f, height: r * 2 * f, border: `1.5px solid ${f === 1 ? "rgba(222,124,112,0.5)" : "rgba(222,124,112,0.2)"}`, background: f === 1 ? "rgba(222,124,112,0.05)" : undefined }}
        />
      ))}
      {pins.map((p) => {
        const at = place(p);
        return <PinDot key={p.id} p={p} x={at.x} y={at.y} onPin={onPin} />;
      })}
      <CentrePin x={cx} y={cy} image={centreImage} icon={centreIcon} />
    </div>
  );
}

function PinDot({ p, x, y, onPin }: { p: Pin; x: number; y: number; onPin: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPin(p.id)}
      aria-label={p.name}
      aria-pressed={p.on}
      className="pointer-events-auto absolute flex flex-col items-center"
      style={{ left: x, top: y, transform: "translate(-50%, -100%)", zIndex: p.on ? 3 : 2 }}
    >
      <span
        className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold shadow-[0_6px_14px_-6px_rgba(60,40,30,0.45)] transition-transform duration-200"
        style={{
          background: p.on ? CORAL : "#ffffff",
          color: p.on ? "#ffffff" : CORAL,
          border: `3px solid ${p.on ? CORAL : "#ffffff"}`,
          transform: p.on ? "scale(1.08)" : "none",
        }}
      >
        {p.image ? (
          <img src={p.image} alt="" className="h-full w-full rounded-full object-cover" />
        ) : p.label ? (
          p.label
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5" />
          </svg>
        )}
      </span>
      <span aria-hidden className="-mt-[3px] h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent" style={{ borderTopColor: p.on ? CORAL : "#ffffff" }} />
    </button>
  );
}

function CentrePin({ x, y, image, icon }: { x: number; y: number; image?: string | null; icon: "home" | "person" }) {
  return (
    <span className="pointer-events-none absolute flex flex-col items-center" style={{ left: x, top: y, transform: "translate(-50%, -100%)", zIndex: 1 }}>
      <span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-full shadow-[0_10px_22px_-8px_rgba(222,124,112,0.9)]" style={{ background: CORAL, border: `4px solid ${CORAL}` }}>
        {image ? (
          <img src={image} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon === "person" ? "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5" : "M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5"} />
          </svg>
        )}
      </span>
      <span aria-hidden className="-mt-[3px] h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent" style={{ borderTopColor: CORAL }} />
      <span aria-hidden className="-mt-1 h-[10px] w-[44px] rounded-[50%]" style={{ background: "rgba(222,124,112,0.28)" }} />
    </span>
  );
}
