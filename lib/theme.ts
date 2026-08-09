/**
 * Light / dark / automatic, shared by the first-run chooser and the settings
 * panel so there is exactly one definition of what each mode means.
 */

export type ThemeChoice = "light" | "dark" | "auto";

export const THEME_KEY = "os-theme";

/**
 * Automatic follows the clock, not the operating system.
 *
 * Deliberate: an agent doing viewings until eight wants the screen to soften
 * in the evening whether or not they ever found macOS's appearance setting.
 * Dark from 19:00 to 07:00.
 */
export function isNight(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 19 || h < 7;
}

/** What a choice resolves to right now. */
export function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice === "auto") return isNight() ? "dark" : "light";
  return choice;
}

/** Stamp the resolved theme on <html>; light is the absence of the attribute. */
export function applyTheme(choice: ThemeChoice) {
  const mode = resolve(choice);
  if (mode === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

export function readTheme(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "auto" ? v : null;
  } catch {
    return null;
  }
}

export function writeTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* private browsing — works for the session, just won't be remembered */
  }
}

/**
 * The surface: what colour the page itself is, in daylight.
 *
 * "Medium" is the founding eggshell (#f2f0eb, sampled from the Notioly
 * artwork); "light" is plain white. Both exist because the beige split the
 * room (James, 8 Aug 2026) — one of them will eventually be removed, so
 * this is deliberately a two-value toggle, not a palette.
 */
export type SurfaceChoice = "light" | "medium";

export const SURFACE_KEY = "os-surface";

export function applySurface(choice: SurfaceChoice) {
  if (choice === "light") document.documentElement.dataset.surface = "light";
  else delete document.documentElement.dataset.surface;
}

export function readSurface(): SurfaceChoice {
  try {
    return localStorage.getItem(SURFACE_KEY) === "light" ? "light" : "medium";
  } catch {
    return "medium";
  }
}

export function writeSurface(choice: SurfaceChoice) {
  try {
    localStorage.setItem(SURFACE_KEY, choice);
  } catch {
    /* private browsing */
  }
}

/**
 * The dark room's decorating kit. Ten warm charcoals in hundred-steps —
 * 100 lightest, 1000 deepest — applied separately to the BACKGROUND and the
 * BOXES so James can find the exact blend by eye. Pure black never appears:
 * the illustrations are ink, and ink on true black loses its paper.
 */
/* Warm greys, not blue ones — the first ramp leaned blue (the B channel ran
   high) and James caught it: "bluey grey rather than greyy grey". These sit
   a whisker warm of neutral, same family as the eggshell daylight. */
export const CHARCOALS: { step: number; hex: string }[] = [
  { step: 100, hex: "#454341" },
  { step: 200, hex: "#403e3c" },
  { step: 300, hex: "#3b3937" },
  { step: 400, hex: "#363432" },
  { step: 500, hex: "#32302e" },
  { step: 600, hex: "#2d2c2a" },
  { step: 700, hex: "#292826" },
  { step: 800, hex: "#252422" },
  { step: 900, hex: "#21201e" },
  { step: 1000, hex: "#1c1b1a" },
];

export const DARK_BG_KEY = "os-dark-bg";
export const DARK_BOX_KEY = "os-dark-box";
/** Softer than the old #1c1c1e page — charcoal, and boxes a lift above it. */
export const DARK_BG_DEFAULT = 700;
export const DARK_BOX_DEFAULT = 500;

export function readDarkStep(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return CHARCOALS.some((c) => c.step === v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Stamp the chosen charcoals as CSS vars — the dark block reads them. */
export function applyDarkPalette() {
  const bg = CHARCOALS.find((c) => c.step === readDarkStep(DARK_BG_KEY, DARK_BG_DEFAULT))!;
  const box = CHARCOALS.find((c) => c.step === readDarkStep(DARK_BOX_KEY, DARK_BOX_DEFAULT))!;
  document.documentElement.style.setProperty("--dark-page", bg.hex);
  document.documentElement.style.setProperty("--dark-box", box.hex);
}

export function writeDarkStep(key: string, step: number) {
  try {
    localStorage.setItem(key, String(step));
  } catch {
    /* private browsing */
  }
  applyDarkPalette();
}
