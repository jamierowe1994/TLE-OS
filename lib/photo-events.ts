/**
 * "THE PHOTOGRAPHS CHANGED" - said between the boxes on an appraisal.
 *
 * Howard, 24 Sep 2026: "I have uploaded photos in the top box, but they
 * haven't appeared here yet." The appraisal page has two places that take
 * photographs (the take-on wizard and the Photographs panel), both writing to
 * the same file, and each read its own list once. So a photograph added in
 * one never showed in the other until the page was reloaded. Each now says so
 * when it adds or removes one, and each listens.
 */
const EVENT = "os-appraisal-photos";

export function photosChanged(appraisalId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: appraisalId }));
}

export function onPhotosChanged(appraisalId: string, fn: () => void): () => void {
  const h = (e: Event) => {
    if ((e as CustomEvent<string>).detail === appraisalId) fn();
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
