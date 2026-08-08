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
