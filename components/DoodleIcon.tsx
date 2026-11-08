// The OS's small icons. Clean line icons drawn here (James, 8 Nov 2026: the
// hand-drawn doodles beside Call, WhatsApp and Email "all look really shit",
// and their strokes were being cut off at small sizes all over the OS).
//
// Every name the doodle set had is drawn below, so all 280-odd screens that
// use this change at once. Each is a 24-box line drawing with room round its
// edge and overflow left visible, so nothing is clipped at any size. A name
// with no drawing here falls back to the old mask files in /public/icons.

const P: Record<string, string> = {
  analytics: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  bank: "M3 9l9-5 9 5M4 9h16M5.5 9v8M9.8 9v8M14.2 9v8M18.5 9v8M3 20h18",
  bed: "M3 6v12M3 13h18v5M21 13v-2a3 3 0 0 0-3-3h-8v5M6.5 10.5h.01",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  calendar: "M4 6.5h16V20H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  call: "M5.2 4h3.6l1.8 4.5-2.3 1.4a11 11 0 0 0 5.8 5.8l1.4-2.3 4.5 1.8v3.6a1.2 1.2 0 0 1-1.2 1.2A15.8 15.8 0 0 1 4 5.2 1.2 1.2 0 0 1 5.2 4z",
  camera: "M4 8h3.5L9 5.5h6L16.5 8H20v11H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checklist: "M10.5 6.5H20M10.5 12H20M10.5 17.5H20M4 6.5l1.3 1.3 2.4-2.5M4 12l1.3 1.3 2.4-2.5M4 17.5l1.3 1.3 2.4-2.5",
  "chevron-down": "M6 9l6 6 6-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM14.5 8.5h-3.2a1.8 1.8 0 0 0 0 3.5h1.4a1.8 1.8 0 0 1 0 3.5H9.5M12 7v1.5M12 15.5V17",
  cross: "M6 6l12 12M18 6L6 18",
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  "file-contract": "M6 3h8l4 4v14H6zM14 3v4h4M9 11h6M9 14.5h4M9 18c1-1.2 1.8-1.2 2.5 0s1.5 1.2 2.5 0",
  folder: "M3 6.5h6l2 2h10V19H3z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5h.01",
  key: "M8 15.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 11.5h9M18 11.5v3M15 11.5v2.5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  lock: "M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3M12 15v2",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M9 12h10",
  "magic-wand": "M4 20L15 9M13.5 7.5l3 3M18 3v4M16 5h4M7 4v2M6 5h2M19 14v2M18 15h2",
  mail: "M3.5 6h17v12h-17zM4 7l8 6 8-6",
  megaphone: "M4 10v4h3l7 4V6l-7 4zM17 9a4 4 0 0 1 0 6M7 14l1.5 5H11l-1-4",
  message: "M4 5h16v11H9.5L5 19.5V16H4z",
  "message-2": "M12 20a8 8 0 1 0-6.9-4L4 20l4.1-1.1A8 8 0 0 0 12 20zM9 11.5h.01M12 11.5h.01M15 11.5h.01",
  note: "M5 4h14v11l-5 5H5zM14 20v-5h5M8 8.5h8M8 12h5",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  pie: "M12 3v9h9M20.5 14.5A9 9 0 1 1 9.5 3.4",
  rocket: "M14 4c3-1 5.5-1 6-.5s.5 3-.5 6L13 16l-5-5zM8 11l-3.5.5L3 14l4 .5M13 16l-.5 3.5L10 21l-.5-4M15.5 8.5h.01",
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.5 15.5l5 5",
  setting: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8",
  shield: "M12 3l7.5 3v6c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6zM9 12l2 2 4-4",
  sofa: "M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM5 18v2M19 18v2",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  suitcase: "M3.5 8h17v11h-17zM9 8V5.5h6V8M3.5 13h17",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01",
  "trend-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
  upload: "M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v5h16v-5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6",
  wallet: "M4 7.5h16v12H4zM4 7.5L15.5 4v3.5M16 13.5h2",
  "pack/photo": "M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9h.01",
  "pack/building": "M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3",
};
P["home-1"] = P.home;
P["pack/house"] = P.home;
P["bed.png"] = P.bed;
P["sofa.png"] = P.sofa;

export default function DoodleIcon({
  name,
  size = 18,
  className = "",
}: {
  /** A name from the list above ("mail", "call", "pack/house"…). */
  name: string;
  size?: number;
  className?: string;
}) {
  const d = P[name];
  if (d) {
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        /* A touch heavier when small, so a 12px icon still reads. */
        strokeWidth={size <= 14 ? 2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`inline-block shrink-0 ${className}`}
        style={{ overflow: "visible" }}
      >
        <path d={d} />
      </svg>
    );
  }
  /* Anything not drawn yet: the old mask files, as before. */
  const file = name.includes(".") ? name : `${name}.svg`;
  const url = `url(/icons/${name.includes("/") ? file : `doodle/${file}`})`;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "90%",
        maskSize: "90%",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
