/**
 * One request for the same data asked for twice at once (9 Nov 2026).
 *
 * James: "speed up as much of the system as possible". A week of the live
 * logs showed the same GET leaving one page two to five times within a few
 * hundred milliseconds - the chat count from every frame that shows it, the
 * property file from the page and its compliance box, the dashboard's front
 * figures from the Diary and its side panel. Each one was a full trip to
 * the server, and most of those to REX.
 *
 * This joins them: while a GET to one of our own /api/ addresses is on its
 * way, a second identical GET waits for the same answer and gets its own
 * copy of it. Nothing is kept once the answer is in - the next ask goes to
 * the server as before - so a figure is never older than the request that
 * fetched it. Only reads: a POST, PUT or DELETE is never joined.
 *
 * Each caller keeps its own cancel: a screen that leaves stops waiting, but
 * the shared request runs on for whoever else is waiting on it.
 */

type Key = string;

const SKIP = /^\/api\/(r2\/|esign\/document|photo\/|tenant\/documents\/|my\/property-files\/|assistant\/stream|.*\/stream|.*\/download)/;

function keyOf(input: RequestInfo | URL, init?: RequestInit): Key | null {
  if (typeof Request !== "undefined" && input instanceof Request) return null;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" || init?.body) return null;
  let url: URL;
  try {
    url = new URL(typeof input === "string" ? input : (input as URL).href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || SKIP.test(url.pathname)) return null;
  const headers = init?.headers ? JSON.stringify(init.headers instanceof Headers ? [...init.headers.entries()] : init.headers) : "";
  return `${url.pathname}${url.search}|${headers}`;
}

/** Waits for `p`, unless `signal` gives up first. */
function withOwnCancel<T>(p: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", stop);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", stop);
        reject(e);
      }
    );
  });
}

/** Put the joiner in front of window.fetch, once for the life of the tab. */
export function installFetchDedupe(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __osFetchDedupe?: boolean };
  if (w.__osFetchDedupe) return;
  w.__osFetchDedupe = true;
  const original = window.fetch.bind(window);
  const inFlight = new Map<Key, Promise<Response>>();
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const key = keyOf(input, init);
    if (!key) return original(input, init);
    let shared = inFlight.get(key);
    if (!shared) {
      /* The shared request carries no caller's signal, so one screen leaving
         cannot cancel it for another. */
      const { signal: _ignored, ...rest } = init ?? {};
      void _ignored;
      shared = original(input, rest);
      inFlight.set(key, shared);
      const done = () => {
        if (inFlight.get(key) === shared) inFlight.delete(key);
      };
      shared.then(done, done);
    }
    /* Every caller reads its own copy of the body. */
    return withOwnCancel(shared, init?.signal).then((res) => res.clone());
  };
}
