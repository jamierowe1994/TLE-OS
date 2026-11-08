/**
 * A short word at the foot of the screen that something happened.
 *
 * James, 23 Sep 2026, on Howard's lead file: the saving was never the problem,
 * the not knowing was. A change saved in silence reads as a change that did
 * not save. So a save says so, and it says so from here rather than from
 * inside the drawer, because the save that matters most is the one sent as
 * the drawer closes - by the time it answers, the drawer has gone.
 *
 * Fire and forget: anything in the browser can call it, and <Toaster /> in the
 * OS layout shows it. With no Toaster on the page it simply goes unseen.
 */

export type ToastTone = "ok" | "bad";

export interface ToastDetail {
  text: string;
  tone: ToastTone;
  /** How long it stays up, for news worth reading (a listing now live). */
  ms?: number;
  /** Something didn't work: the toast can be pressed to say why, in plain
   *  English, and to send it in as a ticket (components/ProblemSheet). */
  problem?: Problem;
}

/** A failure explained (James, 8 Nov 2026: "explain to them why it didn't
 *  work in the most simple of terms"). */
export interface Problem {
  /** What they were trying to do: "Submit to portal". */
  action: string;
  /** The toast's own words, when "<action> didn't work" isn't right (a slow page). */
  title?: string;
  /** The line under it on the toast. */
  sub?: string;
  /** Plain English: why it didn't work. */
  why: string;
  /** What to do about it, if anything. */
  next: string;
  /** For the ticket only: the call, the status, what the server said. */
  technical: string;
}

export const TOAST_EVENT = "os-toast";

export function toast(text: string, tone: ToastTone = "ok", ms?: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { text, tone, ms } }));
}

/**
 * Said by <Toaster /> when the bottom toast pushes Steve up ("up") and when
 * it has gone and he drops back ("down") - once each way, not per toast. He
 * looks startled going up and lands with a bump (components/HelpDock).
 */
export const TOAST_LIFT_EVENT = "os-toast-lift";

export type ToastLift = "up" | "down";

/** Something they pressed didn't work: a red toast under Steve that opens
 *  the reason and a one-press ticket. */
export function problemToast(p: Problem): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { text: p.title ?? `${p.action} didn't work`, tone: "bad", ms: 14000, problem: p } })
  );
}
