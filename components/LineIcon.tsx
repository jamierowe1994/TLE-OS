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
  dot: <circle cx="12" cy="12" r="3" />,
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
