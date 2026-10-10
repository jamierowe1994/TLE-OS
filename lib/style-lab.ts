/**
 * The look lab (James, 10 Oct 2026) - pure, client-safe.
 *
 * "I just want to run a few different layouts to get a feel ... we should be
 * able to mix and match these: the navigation bar style with the colours.
 * I don't want to ever have to change this again."
 *
 * Six palettes x six sidebar layouts, chosen on the Dashboard by an owner
 * and kept in this browser only (localStorage), so nobody else's screen moves
 * while he decides. Nothing chosen = the live look: mist (#FBFBFB) round a white
 * page, live from 11 Oct (the warm wrap of 10 Oct is gone).
 * The colours are CSS variables keyed off data-lab-palette on
 * <html> (app/globals.css); the layout is read by components/Shell.
 *
 * Once he picks one, it becomes the default for everybody and this lab goes.
 */

export type LabPalette = "mist" | "soft" | "pale" | "reverse" | "dark-lift" | "dark-deep";
export type LabLayout = "original" | "launch" | "search" | "card" | "inverse" | "bleed";

export const LAB_PALETTES: { id: LabPalette; label: string; blurb: string; swatch: [string, string, string] }[] = [
  /* James, 11 Oct: "make the grey a little bit more subtle ... get rid of
     the warm wrap ... one of them should be #FBFBFB". Three neutral greys,
     no hue in any of them, faintest first; mist is now what is live. */
  { id: "mist", label: "Mist #FBFBFB", blurb: "What is live now: the faintest grey round a white page.", swatch: ["#fbfbfb", "#ffffff", "#ffffff"] },
  { id: "soft", label: "Soft #F8F8F8", blurb: "A shade more grey round the page.", swatch: ["#f8f8f8", "#ffffff", "#ffffff"] },
  { id: "pale", label: "Pale #F5F5F6", blurb: "The most defined of the three, still no tint.", swatch: ["#f5f5f6", "#ffffff", "#ffffff"] },
  { id: "reverse", label: "Reverse", blurb: "White sidebar, a soft grey page, white boxes on the grey.", swatch: ["#ffffff", "#f6f6f7", "#ffffff"] },
  { id: "dark-lift", label: "Dark, lighter sidebar", blurb: "Dark mode: the sidebar a step lighter than a near-black page.", swatch: ["#232427", "#141517", "#1d1e21"] },
  { id: "dark-deep", label: "Dark, darker sidebar", blurb: "Dark mode the other way round: a near-black sidebar beside a lighter page.", swatch: ["#0e0f11", "#1c1d20", "#26272b"] },
];

export const LAB_LAYOUTS: { id: LabLayout; label: string; blurb: string }[] = [
  { id: "original", label: "Original", blurb: "The sidebar as it is: TLE OS, the tabs, your profile at the foot." },
  { id: "launch", label: "Launch Day", blurb: "Clean, Linear-style: thin line icons, one size of type, quiet groups, no Showroom." },
  { id: "search", label: "Search at the top", blurb: "TLE OS with a small search under it, then the tabs." },
  { id: "card", label: "Floating card", blurb: "The sidebar as a rounded card standing on the page." },
  { id: "inverse", label: "Profile on top", blurb: "You at the top, Help and Settings at the foot, TLE OS last." },
  { id: "bleed", label: "One surface", blurb: "Sidebar and page the same colour, split by fine lines, search and profile across the top." },
];

export const LAB_KEY = "os-look-lab";

export type LabChoice = { palette: LabPalette | null; layout: LabLayout | null };

const isPalette = (v: unknown): v is LabPalette => LAB_PALETTES.some((p) => p.id === v);
const isLayout = (v: unknown): v is LabLayout => LAB_LAYOUTS.some((l) => l.id === v);

export function readLab(): LabChoice {
  try {
    const raw = JSON.parse(localStorage.getItem(LAB_KEY) ?? "{}") as Partial<LabChoice>;
    return { palette: isPalette(raw.palette) ? raw.palette : null, layout: isLayout(raw.layout) ? raw.layout : null };
  } catch {
    return { palette: null, layout: null };
  }
}

/** Put the choice on <html> and tell the shell. */
export function applyLab(c: LabChoice) {
  const el = document.documentElement;
  if (c.palette && c.palette !== "mist") el.dataset.labPalette = c.palette;
  else delete el.dataset.labPalette;
  if (c.layout && c.layout !== "original") el.dataset.labLayout = c.layout;
  else delete el.dataset.labLayout;
  window.dispatchEvent(new CustomEvent("os-look-lab", { detail: c }));
}

export function saveLab(c: LabChoice) {
  try {
    if (!c.palette && !c.layout) localStorage.removeItem(LAB_KEY);
    else localStorage.setItem(LAB_KEY, JSON.stringify(c));
  } catch {
    /* private window: it still applies for this visit */
  }
  applyLab(c);
}

/** Inlined in <head> so a chosen look is on before the first paint (no flash of the live one). */
export const LAB_BOOT = `try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(LAB_KEY)})||"{}");var d=document.documentElement;if(c.palette&&c.palette!=="mist")d.dataset.labPalette=c.palette;if(c.layout&&c.layout!=="original")d.dataset.labLayout=c.layout}catch(e){}`;
