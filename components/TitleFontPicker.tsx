"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A TRIAL CONTROL (James, 11 Sep 2026): cycle the OS's title face while he
 * picks one. Stamps data-title-font on <html>; the faces themselves are the
 * :root[data-title-font] rules in globals.css, scoped to .os-type, so only
 * the agents' screens change - never the portals or an email. Remembered per
 * browser. Comes out (with its CSS and the fonts in app/layout.tsx) the day
 * he chooses.
 */

const KEY = "tle-title-font";

const OPTIONS = [
  { key: "architects", label: "Architects Daughter", note: "Drafting-table hand", sample: "var(--font-architects)" },
  { key: "cherry", label: "Cherry Bomb One", note: "Round and bubbly", sample: "var(--font-cherry)" },
  { key: "boogaloo", label: "Boogaloo", note: "Chunky, condensed", sample: "var(--font-boogaloo)" },
  { key: "handlee", label: "Handlee", note: "Neat handwriting", sample: "var(--font-handlee)" },
  { key: "hurricane", label: "Hurricane", note: "Brush script", sample: "'Hurricane'" },
  { key: "fascinate", label: "Fascinate", note: "Art deco display", sample: "'Fascinate'" },
  { key: "fascinateinline", label: "Fascinate Inline", note: "Art deco, cut through", sample: "'Fascinate Inline'" },
  { key: "protest", label: "Protest Riot", note: "Stencil, loud", sample: "'Protest Riot'" },
  /* "Gervitz Levin" as dictated - no Google font by that name; Gravitas One
     is the nearest by sound. Swap it if he meant another. */
  { key: "gravitas", label: "Gravitas One", note: "Heavy display (for \"Gervitz Levin\")", sample: "'Gravitas One'" },
  { key: "story", label: "Story Script", note: "Storybook script", sample: "'Story Script'" },
  /* "Praise Serena" as dictated - Praise is the Google font. */
  { key: "praise", label: "Praise", note: "Calligraphy script", sample: "'Praise'" },
  { key: "luckiest", label: "Luckiest Guy", note: "Cartoon block", sample: "'Luckiest Guy'" },
  { key: "rampart", label: "Rampart One", note: "Outlined 3D block", sample: "'Rampart One'" },
  { key: "bricolage", label: "Bricolage Grotesque", note: "Quirky grotesque, extrabold", sample: "'Bricolage Grotesque'" },
  { key: "manrope", label: "Manrope", note: "The brand face, extrabold", sample: "var(--font-manrope)" },
] as const;

/*
 * The second batch (11 Sep) loads straight from Google Fonts rather than
 * through next/font: Story Script is newer than Next's own font list, and a
 * trial should not grow app/layout.tsx by seven faces. Story Script gets its
 * own link so that if Google ever refuses it, the other six still load.
 */
const GOOGLE_LINKS = [
  "https://fonts.googleapis.com/css2?family=Hurricane&family=Fascinate&family=Fascinate+Inline&family=Protest+Riot&family=Gravitas+One&family=Praise&family=Luckiest+Guy&family=Rampart+One&family=Bricolage+Grotesque:wght@600..800&display=swap",
  "https://fonts.googleapis.com/css2?family=Story+Script&display=swap",
];

type Face = (typeof OPTIONS)[number]["key"];

/** "architects" is the default in the CSS, so it means no attribute at all. */
function apply(face: Face) {
  const root = document.documentElement;
  if (face === "architects") root.removeAttribute("data-title-font");
  else root.setAttribute("data-title-font", face);
}

export default function TitleFontPicker() {
  const [face, setFace] = useState<Face>("architects");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    for (const href of GOOGLE_LINKS) {
      if (document.querySelector(`link[href="${href}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) as Face | null;
      if (saved && OPTIONS.some((o) => o.key === saved)) {
        setFace(saved);
        apply(saved);
      }
    } catch {
      /* no storage - the default stands */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (next: Face) => {
    setFace(next);
    apply(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* fine */
    }
  };

  const current = OPTIONS.find((o) => o.key === face) ?? OPTIONS[0];

  return (
    /* Left of Steve's bubble, which owns the bottom-right corner. */
    <div ref={wrap} className="fixed bottom-5 right-24 z-40 print:hidden">
      {open && (
        <div className="swing-down absolute bottom-[calc(100%+0.6rem)] right-0 max-h-[70vh] w-[264px] origin-bottom-right overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Title font - trial
          </p>
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => pick(o.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-page ${
                face === o.key ? "bg-page" : ""
              }`}
            >
              <span
                aria-hidden
                className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border border-line text-[18px] text-ink"
                style={{ fontFamily: o.sample }}
              >
                Aa
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{o.label}</span>
                <span className="block truncate text-[11px] text-muted">{o.note}</span>
              </span>
              {face === o.key && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-accent-dark">
                  <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Title font: ${current.label}. Change it`}
        aria-expanded={open}
        className={`flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-ink shadow-lg transition ${
          open ? "border-ink/60" : "border-line hover:border-black/30"
        }`}
      >
        <span className="text-[17px] leading-none" style={{ fontFamily: current.sample }}>
          Aa
        </span>
        <span className="text-[12px] font-medium">{current.label}</span>
      </button>
    </div>
  );
}
