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
}

export const TOAST_EVENT = "os-toast";

export function toast(text: string, tone: ToastTone = "ok"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { text, tone } }));
}
