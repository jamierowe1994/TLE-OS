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
export const M_THEME_COLOUR: Record<MTheme, string> = { light: "#fbf8f4", dark: "#161312" };

/** The same, for the new look (lib/new-look "app"): white, and the desktop's dark. */
export const M_THEME_COLOUR_NEW: Record<MTheme, string> = { light: "#ffffff", dark: "#1f1e1d" };

/** Pins the new look on or off on this phone (?look=new|old, ?look=auto clears it), read by app/agent/layout. */
export const M_LOOK_COOKIE = "m-look";

/** The page colour the status bar should take, for whichever look is on screen. */
export function themeColour(theme: MTheme, fresh: boolean): string {
  return (fresh ? M_THEME_COLOUR_NEW : M_THEME_COLOUR)[theme];
}

/** Browser only: remember the choice for a year and repaint now. */
export function applyMTheme(theme: MTheme): void {
  document.cookie = `${M_THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.querySelector(".m-app")?.setAttribute("data-mtheme", theme);
  const fresh = document.querySelector(".m-app")?.getAttribute("data-applook") === "new";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", themeColour(theme, fresh)));
}
