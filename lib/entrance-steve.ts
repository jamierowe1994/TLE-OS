/**
 * The Steve entrance (James, 21 Nov 2026): the letters TLE OS drop in, one
 * lands crooked, Steve rolls in, knocks it straight and jumps out of the top
 * as the page opens. Rendered in Blender, four versions, picked at random so
 * it is not the same clip every morning.
 *
 * Everything here is per browser: which version is next, whether this browser
 * has played it before (so the sign-in page can fetch it ahead), and whether
 * the person wants its sound.
 */
export const STEVE_ENTRANCES = 4;
const PICK = "os-entrance-steve-pick";
const SEEN = "os-entrance-steve-seen";
const SOUND = "os-entrance-sound";

export const steveEntranceSrc = (n: number) => `/entrance/steve-${n}.mp4`;

/** The version for this visit: the one the sign-in page fetched ahead, or a fresh pick that is not last time's. */
export function pickSteveEntrance(): number {
  try {
    const kept = Number(sessionStorage.getItem(PICK));
    if (kept >= 1 && kept <= STEVE_ENTRANCES) return kept;
    const last = Number(localStorage.getItem(PICK));
    let n = 1 + Math.floor(Math.random() * STEVE_ENTRANCES);
    if (n === last) n = (n % STEVE_ENTRANCES) + 1;
    sessionStorage.setItem(PICK, String(n));
    localStorage.setItem(PICK, String(n));
    return n;
  } catch {
    return 1;
  }
}

export function markSteveEntranceSeen() {
  try {
    localStorage.setItem(SEEN, "1");
    sessionStorage.removeItem(PICK);
  } catch { /* private window: nothing to keep */ }
}

/** On the sign-in page: if this browser has played it before, fetch the next one while the person signs in. */
export function fetchSteveEntranceAhead() {
  try {
    if (localStorage.getItem(SEEN) !== "1") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const l = document.createElement("link");
    l.rel = "prefetch";
    l.as = "video";
    l.href = steveEntranceSrc(pickSteveEntrance());
    document.head.appendChild(l);
  } catch { /* never in the way of signing in */ }
}

export function entranceSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND) !== "off";
  } catch {
    return true;
  }
}

export function setEntranceSound(on: boolean) {
  try {
    if (on) localStorage.removeItem(SOUND);
    else localStorage.setItem(SOUND, "off");
  } catch { /* nothing to keep */ }
}
