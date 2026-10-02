import { warmJson } from "@/lib/page-cache";
import { warmDiary } from "@/lib/diary-store";

/**
 * Start a screen's reads before the screen exists.
 *
 * Changing screen plays the old one out for 400ms (Shell's goTo, James's
 * choreography of 10-11 Sep 2026) and only then mounts the new one, which
 * only THEN asked for its data - so every click was 400ms of animation
 * followed by however long the read took, one after the other. Now the read
 * starts on hover and on the click itself, runs underneath the fall, and the
 * board it lands on usually already has its answer (lib/page-cache).
 *
 * The URLs here must be the exact ones each board reads, or the warm-up is a
 * second, wasted request rather than a shared one.
 */
const READS: Record<string, string[]> = {
  "/leads": ["/api/leads", "/api/contacts"],
  "/market-appraisals": ["/api/appraisals"],
  "/listings": ["/api/listings"],
  "/applications": ["/api/applications?limit=200"],
};
const DIARY = new Set(["/dashboard", "/viewings"]);

/* Hovering back and forth over the rail must not fire a read per pass. */
const lastWarm = new Map<string, number>();
const AGAIN_MS = 20 * 1000;

export function warmRoute(href: string): void {
  if (typeof window === "undefined") return;
  const path = href.split("?")[0].split("#")[0];
  const now = Date.now();
  if (now - (lastWarm.get(path) ?? 0) < AGAIN_MS) return;
  lastWarm.set(path, now);
  for (const url of READS[path] ?? []) warmJson(url);
  if (DIARY.has(path)) warmDiary();
}
