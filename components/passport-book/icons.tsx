/**
 * The passport book's line icons, drawn as the design draws them: one path
 * each on a 24 grid, stroked in the current colour. Icons, never emojis.
 */

const PATHS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6z",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  cal: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  pen: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  paw: "M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 13c-3 0-5 3-5 5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2c0-2-2-5-5-5z",
  pin: "M12 21s6-5.2 6-10.5a6 6 0 1 0-12 0C6 15.8 12 21 12 21ZM12 12.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  alert: "M12 3 2.5 20h19zM12 10v4.5M12 17.2h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Ic({ k, sw = 1.7 }: { k: IconName; sw?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[k]} />
    </svg>
  );
}

/**
 * The Letting Experts' pin, as a line mark: the ring, the upright through it
 * and the point beneath. The design's prototype drew a stand-in mark here;
 * this is TLE's own (public/brand/tle-logo-line.png), redrawn as strokes so it
 * takes the card's ink and the seal's light.
 */
export function Mark({ sw = 1.6 }: { sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.6 2.9a6.4 6.4 0 1 1-6.9 9.2" />
      <path d="M10.8 2.3v19.4" />
      <path d="M6.7 12.1 10.8 21.7" />
    </svg>
  );
}

/** The mark's paths alone, for drawing inside another SVG (the embossed seal). */
export const MARK_PATHS = ["M13.6 2.9a6.4 6.4 0 1 1-6.9 9.2", "M10.8 2.3v19.4", "M6.7 12.1 10.8 21.7"];
