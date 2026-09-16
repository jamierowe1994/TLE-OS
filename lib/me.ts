"use client";

/**
 * One answer to "who am I" per page load.
 *
 * ── Why this exists (16 Sep 2026) ─────────────────────────────────────────
 *
 * `/api/auth/me` was being fetched three to five times on EVERY OS page, by
 * components that have no idea about each other: ViewAsBar and HelpDock from
 * the layout, Shell around the content, the page itself, and OwnWorkspace on
 * the gated sections. Each one asked the same question, got the same answer,
 * and threw away four fifths of it.
 *
 * That was merely wasteful until you notice what the answer CARRIES. A
 * headshot is stored as a base64 data: URL in `os_users.photo` and comes back
 * inside `user` — James's is 20.8 KB — and the route is `no-store`, so nothing
 * caches it. Five copies of a photograph on every navigation, for every agent,
 * once they all upload one at the pilot.
 *
 * ── Why a window and not just in-flight sharing ───────────────────────────
 *
 * Sharing only the request that is currently in the air is not enough:
 * ViewAsBar mounts immediately, Shell and HelpDock each sit behind their own
 * <Suspense>, and the page mounts inside Shell's. Those commits land in
 * different ticks, so the first answer is already back before the last
 * component asks. Measured on the dashboard, in-flight sharing alone took
 * four requests down to three.
 *
 * So the answer is held for WINDOW_MS instead. Nothing about "who am I"
 * changes underneath that without a full page load: signing in and out,
 * starting a view-as and stopping one all set `window.location.href`, which
 * resets this module along with everything else. The one thing that does
 * change in place is your own name or headshot on the profile page, and that
 * calls invalidateMe below.
 */

export interface Me {
  ok?: boolean;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    photo?: string | null;
    role?: string;
  } | null;
  actor?: { id: string; name: string; email: string; role: string } | null;
  viewingAs?: boolean;
  subject?: { name: string; email: string } | null;
  isOwner?: boolean;
  canAdmin?: boolean;
  role?: string | null;
  subjectRole?: string | null;
  anyUsers?: boolean;
  hasDb?: boolean;
}

/* Long enough to cover one page's staggered mounts and a drawer opened a
   moment later; short enough that nothing can sit visibly wrong for long even
   if a path is found that changes the session without reloading. */
const WINDOW_MS = 30_000;

let inFlight: Promise<Me | null> | null = null;
let answer: Me | null = null;
let answeredAt = 0;

/**
 * The session, as `/api/auth/me` reports it. Null on any failure — every
 * caller already treated a bad response and a thrown fetch the same way, so
 * the shape is unchanged from the raw fetch each of them used to do.
 */
export function fetchMe(): Promise<Me | null> {
  if (inFlight) return inFlight;
  if (answeredAt && Date.now() - answeredAt < WINDOW_MS) {
    return Promise.resolve(answer);
  }
  inFlight = fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .catch(() => null)
    .then((j) => {
      /* A failure is NOT held. Held nulls would keep a whole page reading as
         signed out for half a minute after one dropped request. */
      if (j) {
        answer = j;
        answeredAt = Date.now();
      }
      inFlight = null;
      return j;
    });
  return inFlight;
}

/** Throw the held answer away — call after changing your own name or photo. */
export function invalidateMe(): void {
  answer = null;
  answeredAt = 0;
}
