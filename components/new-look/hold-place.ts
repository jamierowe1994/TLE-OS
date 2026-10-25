/* Holds the page where it is when a tab swaps in shorter content.

   Without this, a shorter tab takes the page's height away from under the
   reader and the browser snaps the scroll up (429px on a listing's
   Enquiries). Instead the page's <main> keeps just enough height for the
   view to stay put, and that spare room melts away as the reader scrolls
   back up, so nothing ever visibly moves. */

let held: HTMLElement | null = null;
let floor = 0;

function room(main: HTMLElement) {
  const root = document.scrollingElement ?? document.documentElement;
  const top = main.getBoundingClientRect().top + root.scrollTop;
  const below = root.scrollHeight - (top + main.offsetHeight);
  return root.scrollTop + root.clientHeight - top - below;
}

function release() {
  if (held) held.style.minHeight = "";
  held = null;
  floor = 0;
  window.removeEventListener("scroll", onScroll);
}

function onScroll() {
  if (!held) return;
  const need = room(held);
  if (need >= floor) return;
  floor = need;
  if (floor <= 0) return release();
  held.style.minHeight = `${floor}px`;
}

/** Call from a tab press, before the new tab renders. */
export function holdPlace(from: Element | null) {
  if (typeof window === "undefined" || !from) return;
  const main = from.closest("main");
  if (!(main instanceof HTMLElement)) return;
  // Only the page itself scrolls here; a tab strip inside a scrolling panel is left alone.
  for (let el = from.parentElement; el && el !== main; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return;
  }
  if (held && held !== main) release();
  floor = room(main);
  if (floor <= 0) return release();
  held = main;
  main.style.minHeight = `${floor}px`;
  window.removeEventListener("scroll", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
}
