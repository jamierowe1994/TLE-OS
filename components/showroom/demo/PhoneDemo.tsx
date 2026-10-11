"use client";

import { useEffect, useState } from "react";
import { answerPhone } from "@/lib/showroom/demo-phone";

/**
 * The agent phone view (app/m) as a demo, for the launch tour's "On a Viewing"
 * (James, 11 Oct 2026: every guide a live run on the real screens).
 *
 * Render it straight AFTER <DemoNet /> on a /preview/<token>/phone page.
 * DemoNet does the ring, the "nothing is saved" label and the messages to
 * the tour; this sits in front of it and:
 *  - answers the phone's own calls (/api/diary, /api/m/...) from Sam's sample
 *    day (lib/showroom/demo-phone), and tells the tour what a press did;
 *  - keeps the phone's links and page moves (/m, /m/event/<id>, /m/people ...)
 *    inside the demo, at /preview/<token>/phone/...
 * Nothing is read from REX, nothing is saved, nothing is sent.
 */

const TOUR_ORIGINS = ["https://tle-os-demo-production.up.railway.app", "http://127.0.0.1:3392", "http://localhost:3392"];
function tell(msg: Record<string, unknown>) {
  try {
    if (window.parent === window) return;
    let to = window.location.origin;
    /* The tour is the frame's parent. After a tap moves the frame on, the referrer is the previous demo page,
       so the parent's own origin is read from ancestorOrigins where the browser gives it. */
    const anc = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0];
    try { const ref = document.referrer ? new URL(document.referrer).origin : null; if (anc && TOUR_ORIGINS.includes(anc)) to = anc; else if (ref && TOUR_ORIGINS.includes(ref)) to = ref; } catch { /* no referrer */ }
    window.parent.postMessage({ source: "tle-demo", ...msg }, to);
  } catch { /* not framed */ }
}

/** The demo address for a phone address (/m...), or null when it is not one. */
function phoneUrl(to: URL): string | null {
  const pre = window.location.pathname.match(/^(\/preview\/[^/]+\/phone)/)?.[1];
  if (!pre || to.origin !== window.location.origin) return null;
  if (to.pathname !== "/m" && !to.pathname.startsWith("/m/")) return null;
  const q = new URLSearchParams(to.search); q.delete("_rsc");
  const qs = q.toString();
  return `${pre}${to.pathname.slice(2)}${qs ? `?${qs}` : ""}`;
}

/* The story is 9:58am on the doorstep, two minutes before the viewing. The phone's clock is set to 9:58
   today (counting on from there), so whenever the tour is watched the day reads the same: the call back
   folded away as earlier, the viewing next. Only this demo page's clock; the OS itself is untouched. */
function setClock() {
  const Real = Date;
  const at = new Real(); at.setHours(9, 58, 0, 0);
  const off = at.getTime() - Real.now();
  class DemoDate extends Real {
    constructor(...a: ConstructorParameters<typeof Date> | []) {
      if (a.length === 0) super(Real.now() + off);
      else super(...(a as ConstructorParameters<typeof Date>));
    }
    static now() { return Real.now() + off; }
  }
  (window as unknown as { Date: DateConstructor }).Date = DemoDate as unknown as DateConstructor;
}

let installed = false;
function install() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  setClock();
  const inner = window.fetch.bind(window); // DemoNet's, installed just before this
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin && !url.pathname.startsWith("/api/")) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const demo = headers.get("rsc") ? phoneUrl(url) : null;
      if (demo) {
        if (headers.get("next-router-prefetch")) return Promise.reject(new TypeError("Not prefetched in the demo."));
        window.location.assign(demo);
        return new Promise<Response>(() => {});
      }
    }
    if (url.origin === window.location.origin) {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const reply = answerPhone(method, url);
      if (reply) {
        await new Promise((r) => setTimeout(r, method === "GET" ? 120 : 380));
        if (method !== "GET" || reply.did) tell({ type: "did", did: reply.did ?? method.toLowerCase(), sent: [] });
        return new Response(JSON.stringify(reply.json), { status: reply.status, headers: { "content-type": "application/json" } });
      }
    }
    return inner(input, init);
  };
}

export default function PhoneDemo() {
  useState(() => {
    install();
    return null;
  });
  useEffect(() => {
    install();
    /* On the window, in the capture phase: ahead of DemoNet's own guard, which would stop a phone link. */
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const to = phoneUrl(new URL(a.getAttribute("href") ?? "", window.location.href));
      if (!to) return;
      e.preventDefault();
      e.stopPropagation();
      tell({ type: "did", did: "opened", sent: [] });
      window.location.assign(to);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
