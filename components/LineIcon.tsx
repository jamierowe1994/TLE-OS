/**
 * Thin line icons for the Launch Day sidebar (James, 11 Oct 2026: "clean,
 * like a Linear or Attio kind of navigation bar"). One stroke, one size, drawn
 * on a 24 box in currentColor, so a row's icon takes its text colour. The
 * doodles stay everywhere else; these are for the chrome only.
 *
 * Keyed by the doodle names lib/nav already carries, plus the chrome's own.
 */

const PATHS: Record<string, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  "trend-up": (
    <>
      <path d="M3.5 17 9 11.5l4 4L20.5 8" />
      <path d="M15 8h5.5v5.5" />
    </>
  ),
  home: <path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  checklist: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1M9 12.5l2 2 4-4" />
    </>
  ),
  folder: (
    <>
      <path d="M4.5 20.5V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14.5 9.5h4a1 1 0 0 1 1 1v10M3 20.5h18M8 7.5h3M8 11h3M8 14.5h3" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="14" rx="2" />
      <path d="M3.5 10h17M15.5 15h2" />
    </>
  ),
  rocket: <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.3-.6-.6-2.3z" />,
  shield: <path d="M12 3.5 19 6.5v5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9v-5z" />,
  megaphone: (
    <>
      <path d="M4 10v4h3.5l7.5 5V5L7.5 10z" />
      <path d="M18.5 9a3.5 3.5 0 0 1 0 6" />
    </>
  ),
  note: (
    <>
      <path d="M5.5 5a1.5 1.5 0 0 1 1.5-1.5h11.5V17H7a1.5 1.5 0 0 0-1.5 1.5z" />
      <path d="M5.5 18.5A1.5 1.5 0 0 0 7 20.5h11.5V17" />
    </>
  ),
  flask: <path d="M9.5 3.5h5M10.5 3.5v6l-5 8.4a1.7 1.7 0 0 0 1.5 2.6h10a1.7 1.7 0 0 0 1.5-2.6l-5-8.4v-6M8 14.5h8" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.4v.4" />
      <circle cx="12" cy="16.6" r="0.8" fill="currentColor" />
    </>
  ),
  setting: (
    <>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
      <circle cx="15" cy="6.5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20a7.5 6 0 0 1 15 0" />
    </>
  ),
  logout: <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9.5" />,
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </>
  ),
  "chevron-down": <path d="m7 9.5 5 5 5-5" />,
  "chevron-right": <path d="m9.5 7 5 5-5 5" />,
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  message: <path d="M4 5.5h16v10.5H9.5L5.5 19.5v-3.5H4z" />,
  "magic-wand": <path d="m4 20 11-11M14 4.5v2M19.5 10h-2M17.4 6.6 16 8M10 4.5l.6 1.4L12 6.5l-1.4.6L10 8.5l-.6-1.4L8 6.5l1.4-.6z" />,
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m11 12.5 8.5-8.5M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  "file-contract": (
    <>
      <path d="M14 3.5H6.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5z" />
      <path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h4" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2A2.5 2 0 0 1 9.5 15M12 6v1.5M12 16.5V18" />
    </>
  ),
  bank: <path d="M3.5 9.5 12 4l8.5 5.5M5 20.5h14M6.5 10.5v7M10 10.5v7M14 10.5v7M17.5 10.5v7M4 20.5h16" />,
  trash: <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.8 12.6a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.6M10 10.5v6M14 10.5v6" />,
  dot: <circle cx="12" cy="12" r="3" />,
  /* Bond's rail (12 Oct 2026), in the same hand. */
  "arrow-left": <path d="M19.5 12h-15M10 6.5 4.5 12l5.5 5.5" />,
  "map-pin": (
    <>
      <path d="M12 20.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0c0 4.9-6.5 10.5-6.5 10.5z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 6.5 8 6 8-6" />
    </>
  ),
  pencil: <path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3l-10 10zM13.5 7l3 3" />,
};

export default function LineIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {PATHS[name] ?? PATHS.dot}
    </svg>
  );
}
