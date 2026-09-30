/* Line icons for the studio: one stroke weight, 24 grid, currentColor. Drawn
   here rather than pulled from a pack so the set is exactly the blocks we
   offer and nothing else ships. */

type P = { size?: number; className?: string };

const Svg = ({ size = 20, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);

export const ICONS: Record<string, (p: P) => React.ReactElement> = {
  heading: (p) => <Svg {...p}><path d="M6 4v16M18 4v16M6 12h12" /></Svg>,
  text: (p) => <Svg {...p}><path d="M4 6h16M4 10h16M4 14h11M4 18h8" /></Svg>,
  button: (p) => <Svg {...p}><rect x="3" y="7" width="18" height="10" rx="5" /><path d="M9 12h6" /></Svg>,
  image: (p) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.8" /><path d="m21 16-5.5-5.5L6 20" /></Svg>,
  video: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m10 9 5 3-5 3z" /></Svg>,
  columns: (p) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M12 4v16" /></Svg>,
  divider: (p) => <Svg {...p}><path d="M3 12h18M7 7h10M7 17h10" opacity={0.35} /><path d="M3 12h18" /></Svg>,
  spacer: (p) => <Svg {...p}><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" /></Svg>,
  quote: (p) => <Svg {...p}><path d="M7 11H4.5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1H7a1 1 0 0 1 1 1V12c0 2.5-1.5 4.5-4 5.5M17 11h-2.5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1H17a1 1 0 0 1 1 1V12c0 2.5-1.5 4.5-4 5.5" /></Svg>,
  faq: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5M12 17h.01" /></Svg>,
  social: (p) => <Svg {...p}><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" /></Svg>,
  logo: (p) => <Svg {...p}><path d="M12 3a6 6 0 0 1 6 6c0 4.5-6 12-6 12S6 13.5 6 9a6 6 0 0 1 6-6z" /><circle cx="12" cy="9" r="2" /></Svg>,
  code: (p) => <Svg {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" /></Svg>,
  footer: (p) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 15h18M7 18h5" /></Svg>,
};

export const UI = {
  up: (p: P) => <Svg {...p}><path d="m6 14 6-6 6 6" /></Svg>,
  down: (p: P) => <Svg {...p}><path d="m6 10 6 6 6-6" /></Svg>,
  copy: (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>,
  trash: (p: P) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" /></Svg>,
  grip: (p: P) => <Svg {...p}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></Svg>,
  undo: (p: P) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>,
  redo: (p: P) => <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Svg>,
  desktop: (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>,
  mobile: (p: P) => <Svg {...p}><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></Svg>,
  close: (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  eye: (p: P) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>,
  send: (p: P) => <Svg {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></Svg>,
  alignLeft: (p: P) => <Svg {...p}><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></Svg>,
  alignCenter: (p: P) => <Svg {...p}><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></Svg>,
  alignRight: (p: P) => <Svg {...p}><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></Svg>,
  bold: (p: P) => <Svg {...p}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" /></Svg>,
  italic: (p: P) => <Svg {...p}><path d="M14 5h-4M14 19h-4M14 5l-4 14" /></Svg>,
  underline: (p: P) => <Svg {...p}><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" /></Svg>,
  link: (p: P) => <Svg {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></Svg>,
  list: (p: P) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></Svg>,
  numbered: (p: P) => <Svg {...p}><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 13.5c.5-.8 2.5-.8 2.5.5 0 1-2.5 1.5-2.5 3H6" /></Svg>,
  clear: (p: P) => <Svg {...p}><path d="M5 5h11M10 5l-3 14M14 14l6 6M20 14l-6 6" /></Svg>,
  person: (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>,
  upload: (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>,
  layers: (p: P) => <Svg {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Svg>,
  plus: (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
};
