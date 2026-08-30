/**
 * The three house accents, in one place.
 *
 * These hexes were written out three times - components/Shell.tsx, the
 * appearance tab on the profile, and app/globals.css - and setting up an
 * account was about to make it four. The CSS copy has to stay, because the
 * attribute selector is what actually paints; but nothing in TypeScript needs
 * its own opinion about what Blush looks like.
 *
 * The dot hexes here are for the SWATCH only. What a swatch shows and what the
 * page paints must agree, and the only way to guarantee that would be to read
 * the computed variable back off the document. That is worth doing if these
 * ever drift; today they are checked by eye against globals.css:51-60.
 */

export type Accent = {
  /** The data-accent value. Empty string is Clay, the house default, which is
   *  the ABSENCE of the attribute rather than a value of its own. */
  id: string;
  label: string;
  dot: string;
};

export const ACCENTS: Accent[] = [
  { id: "", label: "Warm Clay", dot: "#de968f" },
  { id: "blush", label: "Blush", dot: "#f0b3bb" },
  { id: "red", label: "Classic Red", dot: "#e31f36" },
];

export const ACCENT_KEY = "os-accent";

/** Stamp the accent on <html>. Clay clears the attribute rather than setting it. */
export function applyAccent(id: string) {
  if (id) document.documentElement.dataset.accent = id;
  else delete document.documentElement.dataset.accent;
}

export function readAccent(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? "";
  } catch {
    return "";
  }
}
