/**
 * Light or dark on the agent's phone (2 Oct 2026).
 *
 * Chosen once on the first visit (components/m/Welcome) and changeable from
 * the "+" sheet. Per phone, not per person: it is a cookie, so the server
 * paints the right mode first time (app/m/layout.tsx) and the iPhone app's
 * status bar follows the theme colour. Only /m reads it - the full OS stays
 * light-only (lib/theme THEME_LOCKED).
 */

export type MTheme = "light" | "dark";

export const M_THEME_COOKIE = "m-theme";

/** The page colour of each mode, which is also the theme colour the app reads. */
export const M_THEME_COLOUR: Record<MTheme, string> = { light: "#ffffff", dark: "#121212" };

/** Browser only: remember the choice for a year and repaint now. */
export function applyMTheme(theme: MTheme): void {
  document.cookie = `${M_THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.querySelector(".m-app")?.setAttribute("data-mtheme", theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", M_THEME_COLOUR[theme]));
}
