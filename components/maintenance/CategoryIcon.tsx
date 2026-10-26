/**
 * A small line icon for each job category (lib/works-catalogue), so the
 * floating Report a repair / Plan a certificate can show them as tiles to
 * tap rather than a list to search (James, 26 Oct 2026: "some cool visuals
 * in there to help people select"). Unknown names get the three dots.
 */

const P: Record<string, React.ReactNode> = {
  drop: <path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z" />,
  flame: <path d="M12 3c1 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 3 0-3 .5-5.5.5-8z" />,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  appliance: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <circle cx="12" cy="13" r="3.8" />
      <path d="M8 6.5h2" />
    </>
  ),
  roof: <path d="M3 11.5L12 4l9 7.5M6 10v9.5h12V10M10 19.5v-5h4v5" />,
  door: (
    <>
      <path d="M6 20.5V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16.5M4 20.5h16" />
      <circle cx="14.5" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
    </>
  ),
  damp: <path d="M7 14.5a3 3 0 0 1-.5-6A5 5 0 0 1 16 7a3.5 3.5 0 0 1 1 7.5M9 18l-1 2M13 17.5l-1 2.5M16.5 17l-.8 2" />,
  brush: <path d="M14.5 4.5l5 5-7 7-5-5zM7.5 11.5L4 19.5l8-3.5M12 7l5 5" />,
  floor: <path d="M4 4h16v16H4zM4 12h16M12 4v16M8 4v8M16 12v8" />,
  leaf: <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" />,
  bug: (
    <>
      <rect x="8" y="7.5" width="8" height="12" rx="4" />
      <path d="M12 7.5V19.5M8 11H4.5M19.5 11H16M8 15H5M19 15h-3M10 7.5 8.5 4.5M14 7.5l1.5-3" />
    </>
  ),
  sparkle: <path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  bricks: <path d="M3.5 5h17v14h-17zM3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19" />,
  certificate: (
    <>
      <path d="M6 3.5h9l3 3v14H6z" />
      <path d="M9 9h6M9 12.5h6M9 16h3.5" />
    </>
  ),
  gauge: <path d="M4 17a8 8 0 1 1 16 0M12 17l4-5M8 17h8" />,
  wrench: <path d="M14.5 4a4 4 0 0 0-4.6 5.4L4 15.3 6.7 18l5.9-5.9A4 4 0 0 0 18 7.5l-2.6 2.6-2.5-.4-.4-2.5z" />,
  plug: <path d="M9 3v4.5M15 3v4.5M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0zM12 16.5V21" />,
  alarm: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9.5V13l2.5 1.5M4.5 4.5l2.5 2M19.5 4.5l-2.5 2" />
    </>
  ),
  shield: <path d="M12 3.5l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9v-5z" />,
  clipboard: <path d="M8.5 4.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2M8.5 3.5h7v3h-7zM9 12l2 2 4-4" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  out: <path d="M10 20.5H5V3.5h5M14 8l4 4-4 4M18 12H9" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
    </>
  ),
};

const BY_CATEGORY: Record<string, keyof typeof P> = {
  Plumbing: "drop",
  "Heating & boiler": "flame",
  Electrical: "bolt",
  Gas: "flame",
  Appliance: "appliance",
  "Roof & gutters": "roof",
  "Windows & doors": "door",
  "Locks & security": "lock",
  "Damp & mould": "damp",
  Decoration: "brush",
  Flooring: "floor",
  "Garden & fences": "leaf",
  Pests: "bug",
  Cleaning: "sparkle",
  Structural: "bricks",
  "Gas safety (CP12)": "flame",
  EICR: "bolt",
  EPC: "gauge",
  "Boiler service": "wrench",
  "Legionella risk assessment": "drop",
  "PAT test": "plug",
  "Smoke & CO alarms": "alarm",
  "Fire risk assessment": "shield",
  "HMO licence inspection": "clipboard",
  "Property inspection": "search",
  "Inventory & check-in": "key",
  "Check-out": "out",
  Other: "more",
};

/** An icon by category name, or by one of the names above (bolt, clock, calendar...). */
export default function CategoryIcon({ name, size = 20 }: { name: string; size?: number }) {
  const key = BY_CATEGORY[name] ?? (name in P ? (name as keyof typeof P) : "more");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[key]}
    </svg>
  );
}
