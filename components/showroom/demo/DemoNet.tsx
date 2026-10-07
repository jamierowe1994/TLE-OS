"use client";

import { useEffect, useState } from "react";
import { answer } from "@/lib/showroom/demo-api";
import { isStory, isWay, worldFor, type DemoWorld } from "@/lib/showroom/demo-world";

/**
 * Takes a demo page off the network (lib/showroom/demo-api says why and how).
 *
 * Put it FIRST inside a back office demo page, above the real screen. It
 * replaces window.fetch while it renders - during render, not in an effect,
 * because React runs a child's effects before its parent's and the real
 * screens fetch from their effects. Every /api call is then answered from the
 * invented world for the moment in the address (?story=&at=&way=); anything
 * else (the page's own scripts, fonts, pictures) goes through untouched.
 *
 * It also:
 *  - tells the Showroom around it what each press did and which emails it
 *    would have sent, so the walkthrough can say "that's the one" and move on;
 *  - rings the control the walkthrough asks for (a "hint"), found by its words;
 *  - stops links that would leave the demo for a real page, and says where
 *    they would have gone instead.
 */

/** The words on the control to ring. A list is a sequence: the furthest one on screen is ringed. */
type Hint = { text: string | string[]; near?: string } | null;

/** The OS screens that have a demo of their own, by address. */
const DEMO_SCREENS: Record<string, string> = {
  "/maintenance": "maintenance",
  "/compliance": "compliance",
  "/inspections": "inspections",
  "/compliance-desk/verify": "verify",
};

let world: DemoWorld | null = null;
let realFetch: typeof fetch | null = null;
/* The page the demo answers for. Leave it (a client-side navigation to a page
   without DemoNet) and fetch is the browser's own again - decided per call
   rather than by unmounting, because React's development double-run would
   otherwise let a screen's first fetch slip past between the two. */
let demoPath: string | null = null;

function seed(): DemoWorld {
  const sp = new URLSearchParams(window.location.search);
  const story = sp.get("story");
  const way = sp.get("way");
  return worldFor(isStory(story) ? story : "repair", Number(sp.get("at") ?? 0) || 0, isWay(way) ? way : "portal");
}

/**
 * Scroll THIS page to a control, and nothing else. scrollIntoView on an
 * element inside a frame also scrolls every page around it - the Showroom
 * jumped every time a scene rang a button below the fold. So the nearest
 * scrolling box (a drawer) or this window is moved by hand instead.
 */
function bringIntoView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  let box: HTMLElement | null = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight + 4) break;
    box = box.parentElement;
  }
  if (box && box !== document.body) {
    const b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTo({ top: box.scrollTop + (r.top - b.top) - box.clientHeight / 2 + r.height / 2, behavior: "smooth" });
    return;
  }
  if (r.top < 0 || r.bottom > window.innerHeight) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2, behavior: "smooth" });
}

/* Focus never scrolls the page around the frame: a screen that focuses a box
   as it opens would otherwise drag the Showroom down to it. */
function quietFocus() {
  if (window.parent === window) return;
  const proto = HTMLElement.prototype as HTMLElement & { __demoQuiet?: boolean };
  if (proto.__demoQuiet) return;
  const focus = proto.focus;
  proto.focus = function (this: HTMLElement, opts?: FocusOptions) {
    return focus.call(this, { ...(opts ?? {}), preventScroll: true });
  };
  proto.__demoQuiet = true;
}

function tell(msg: Record<string, unknown>) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ source: "tle-demo", ...msg }, window.location.origin);
  } catch { /* not framed, or framed by someone else: nothing to tell */ }
}

/** `fresh` re-reads the moment from the address: a new demo page, a new world. */
function install(fresh = false) {
  if (typeof window === "undefined") return;
  if (fresh || !world) world = seed();
  demoPath = window.location.pathname;
  quietFocus();
  if (realFetch) return;
  realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (window.location.pathname !== demoPath || url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return realFetch!(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: unknown = init?.body ?? null;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* left as text */ }
    }
    /* A beat, so a press feels like a press and the screen's own "Saving…" shows. */
    await new Promise((r) => setTimeout(r, method === "GET" ? 120 : 380));
    const reply = answer(world ?? (world = seed()), method, url, body);
    if (method !== "GET" && reply.status < 400) tell({ type: "did", did: reply.did ?? method.toLowerCase(), sent: reply.sent });
    if (reply.status >= 400 && method !== "GET") tell({ type: "refused", path: url.pathname });
    if (reply.status === 404 && !String((reply.json as { error?: string }).error ?? "").includes("isn't one of ours")) console.warn(`[showroom demo] not answered: ${method} ${url.pathname}`);
    return new Response(JSON.stringify(reply.json), { status: reply.status, headers: { "content-type": "application/json" } });
  };
}

export default function DemoNet({ label = "Showroom demo" }: { label?: string }) {
  /* Installed while rendering, so it is in place before any child effect runs. */
  useState(() => {
    install(true);
    return null;
  });
  const [hint, setHint] = useState<Hint>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [left, setLeft] = useState<string | null>(null);

  useEffect(() => {
    install();
    tell({ type: "ready", path: window.location.pathname });
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== "tle-showroom") return;
      if (e.data.type === "hint") setHint(e.data.hint ?? null);
    };
    window.addEventListener("message", onMsg);

    /* Links out of the demo. A real page would load inside the Showroom with
       real records on it, so they stop here and say what they are. */
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const to = new URL(href, window.location.href);
      /* A link to another back office screen (Book it on a certificate opens
         Maintenance's raise form) opens that screen's demo, on the same story. */
      const pre = window.location.pathname.match(/^(\/preview\/[^/]+\/back-office)\//)?.[1];
      const screen = to.origin === window.location.origin ? DEMO_SCREENS[to.pathname] : undefined;
      if (pre && screen) {
        e.preventDefault();
        e.stopPropagation();
        const here = new URLSearchParams(window.location.search);
        const q = new URLSearchParams(to.search);
        for (const k of ["story", "at", "way"]) if (here.get(k) && !q.get(k)) q.set(k, here.get(k)!);
        window.location.assign(`${pre}/${screen}?${q}`);
        return;
      }
      if (to.origin === window.location.origin && /^\/(preview|tenant\/demo|landlord\/demo)\//.test(to.pathname) && to.pathname !== window.location.pathname) return;
      if (to.origin === window.location.origin && to.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeft(to.origin === window.location.origin ? to.pathname : to.host);
      window.setTimeout(() => setLeft(null), 3200);
    };
    document.addEventListener("click", onClick, true);
    /* A real press inside the screen - not a box the screen focused on its
       own - tells the walkthrough the person is driving, so Play stops. */
    const touched = () => tell({ type: "touched" });
    document.addEventListener("pointerdown", touched, true);
    document.addEventListener("keydown", touched, true);
    return () => {
      window.removeEventListener("message", onMsg);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", touched, true);
      document.removeEventListener("keydown", touched, true);
    };
  }, []);

  /* The ring: find the control by its words and follow it as the page moves. */
  useEffect(() => {
    if (!hint) { setBox(null); return; }
    let raf = 0;
    const findOne = (text: string): HTMLElement | null => {
      const want = text.toLowerCase();
      const scope = hint.near ? Array.from(document.querySelectorAll<HTMLElement>("section, div, li, form")).find((el) => el.textContent?.toLowerCase().includes(hint.near!.toLowerCase())) ?? document.body : document.body;
      const all = Array.from(scope.querySelectorAll<HTMLElement>("button, a, label, select, input[type=date], input[type=datetime-local], textarea, [role=button], summary"));
      return all.find((el) => (el.textContent ?? el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? "").trim().toLowerCase().startsWith(want) && el.offsetParent !== null)
        ?? all.find((el) => (el.textContent ?? el.getAttribute("placeholder") ?? "").toLowerCase().includes(want) && el.offsetParent !== null)
        ?? null;
    };
    const find = (): HTMLElement | null => {
      const list = Array.isArray(hint.text) ? hint.text : [hint.text];
      for (let i = list.length - 1; i >= 0; i--) {
        const el = findOne(list[i]);
        if (el) return el;
      }
      return null;
    };
    let scrolledTo: HTMLElement | null = null;
    const tick = () => {
      const el = find();
      if (el && el !== scrolledTo) {
        bringIntoView(el);
        scrolledTo = el;
      }
      setBox(el ? el.getBoundingClientRect() : null);
      raf = window.setTimeout(tick, 250) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [hint]);

  return (
    <>
      {box && (
        <span
          aria-hidden
          className="pointer-events-none fixed z-[300] rounded-xl"
          style={{
            left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12,
            boxShadow: "0 0 0 3px #e9a39a, 0 0 0 9px rgba(233,163,154,0.28)",
            animation: "demo-ring 1.6s ease-in-out infinite",
            transition: "left 200ms ease, top 200ms ease, width 200ms ease, height 200ms ease",
          }}
        />
      )}
      {left && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[301] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12.5px] text-page shadow-lg">
          In the real OS that opens {left}. The demo stays on this screen.
        </div>
      )}
      {/* Bottom left: the one corner no screen here keeps anything in. */}
      <span className="pointer-events-none fixed bottom-3 left-3 z-[299] rounded-full bg-ink/80 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-page">
        {label} · nothing is saved or sent
      </span>
      <style>{`@keyframes demo-ring { 0%,100% { opacity: 1 } 50% { opacity: .55 } }`}</style>
    </>
  );
}
