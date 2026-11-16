/**
 * Is this error the network, not the code? (Stuart Roper, ticket 77d8e8a9,
 * 13 Nov 2026.)
 *
 * His iPhone showed "The OS stopped, not just this screen" on the phone app's
 * Properties, and all the browser had to say was "Load failed": Safari's
 * words for a request that never came back - a signal drop, the phone
 * waking from sleep, a deploy swapping the page's code underneath it. It
 * reaches the crash screens when the page itself was still arriving (Next
 * streams each page, and a stream cut off half way throws into the screen).
 * Nothing in our code is wrong in that case, and the right answer is to
 * load the page again, not to ask for a report.
 *
 * Each browser words it differently: Safari "Load failed", Chrome "Failed to
 * fetch", Firefox "NetworkError when attempting to fetch resource", and a
 * script or style the page needed and could not fetch "Loading chunk 12
 * failed" or "Loading CSS chunk 3 failed".
 */
const LOST = [
  /^load failed$/i,
  /failed to fetch/i,
  /networkerror/i,
  /network error/i,
  /network connection was lost/i,
  /loading (css )?chunk [\w-]+ failed/i,
  /chunkloaderror/i,
  /connection closed/i,
];

export function isLostConnection(e: unknown): boolean {
  const err = e as { message?: string; name?: string } | null | undefined;
  const text = `${err?.name ?? ""} ${err?.message ?? ""}`.trim();
  if (!text) return false;
  return LOST.some((r) => r.test(err?.message ?? "") || r.test(text));
}
