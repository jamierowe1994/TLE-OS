"use client";

import { useEffect, useState } from "react";

/**
 * Takes a Learning demo page off the network (Tools > Learning > Systems,
 * 26 Oct 2026). The real customer screen is drawn inside it, and every call
 * that screen makes to our own /api is answered here, on the page, by the
 * demo's `answer`. Nothing reaches the server: no save, no email, no open
 * logged. A call the demo has no answer for is refused on the page too
 * (404), never passed through.
 *
 * Installed while rendering, not in an effect: React runs a child's effects
 * before its parent's, and the real screens fetch from their effects (the
 * pattern in components/showroom/demo/DemoNet).
 *
 * Also:
 *  - navigator.sendBeacon to our own origin is swallowed the same way;
 *  - links that would leave the screen (the tenant area, sign-in, mailto,
 *    another site) stop here and say so, so the frame never shows a real page;
 *  - a slim strip above the screen says it is the demo, with Start again.
 */

export type DemoReply = { status?: number; json: unknown };
export type DemoAnswer = (method: string, url: URL, body: unknown) => DemoReply | Promise<DemoReply>;

let current: DemoAnswer | null = null;
let realFetch: typeof fetch | null = null;
let realBeacon: Navigator["sendBeacon"] | null = null;
/* The page the demo answers for. A full page load clears all of this anyway. */
let demoPath: string | null = null;

const ours = (u: URL) => u.origin === window.location.origin;

function install(answer: DemoAnswer) {
  if (typeof window === "undefined") return;
  current = answer;
  demoPath = window.location.pathname;
  if (realFetch) return;
  realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    const onDemo = window.location.pathname === demoPath;
    /* The app's own move to another page (an RSC request for somewhere else): not made from the demo. */
    if (onDemo && ours(url) && !url.pathname.startsWith("/api/")) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (headers.get("rsc") && url.pathname !== demoPath) return Promise.reject(new TypeError("Not opened from the demo."));
      return realFetch!(input, init);
    }
    if (!onDemo || !ours(url) || !url.pathname.startsWith("/api/")) return realFetch!(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: unknown = init?.body ?? null;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* left as text */ }
    }
    /* A beat, so a press feels like a press and the screen's own "Saving…" shows. */
    await new Promise((r) => setTimeout(r, method === "GET" ? 120 : 350));
    let reply: DemoReply;
    try {
      reply = current ? await current(method, url, body) : { status: 404, json: { ok: false, error: "Not in the demo." } };
    } catch {
      reply = { status: 500, json: { ok: false, error: "Not in the demo." } };
    }
    if ((reply.status ?? 200) === 404) console.warn(`[learning demo] not answered: ${method} ${url.pathname}`);
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  };
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (to: string | URL, data?: BodyInit | null) => {
      try {
        const url = new URL(String(to), window.location.href);
        if (window.location.pathname === demoPath && ours(url)) return true;
      } catch { /* not a URL: let the browser refuse it */ }
      return realBeacon!(to, data);
    };
  }
}

/** Where a link would have gone, in words. */
function whereTo(href: string): string {
  if (href.startsWith("mailto:")) return "an email to the agent";
  if (href.startsWith("tel:")) return "a phone call to the agent";
  try {
    const to = new URL(href, window.location.href);
    if (!ours(to)) return to.host;
    if (to.pathname.startsWith("/tenant/sign-in")) return "the tenant sign-in";
    if (to.pathname.startsWith("/tenant")) return "the tenant's own area";
    if (to.pathname.startsWith("/landlord")) return "the landlord's own file";
    if (to.pathname.startsWith("/api/sign/")) return "their signed copy";
    return to.pathname;
  } catch {
    return "another page";
  }
}

export default function DemoFrame({
  answer,
  label,
  onRestart,
  children,
}: {
  answer: DemoAnswer;
  label: string;
  onRestart?: () => void;
  children: React.ReactNode;
}) {
  useState(() => {
    install(answer);
    return null;
  });
  const [left, setLeft] = useState<string | null>(null);

  useEffect(() => {
    install(answer);
  }, [answer]);

  useEffect(() => {
    let t = 0;
    const say = (where: string) => {
      setLeft(where);
      window.clearTimeout(t);
      t = window.setTimeout(() => setLeft(null), 3400);
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.closest("[data-demo-chip]")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      say(whereTo(href));
    };
    /* A form with a real action would post the page away. The screens here post by fetch; anything else stops. */
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      if (f?.getAttribute("action")) {
        e.preventDefault();
        say("a real form");
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <>
      {/* In the page's flow, above the screen: the screens keep their own bars fixed at the foot,
          and their sticky header slides over this as they scroll, so nothing ever sits on top of a control. */}
      <div data-demo-chip style={STRIP}>
        <span>{label} · nothing is saved or sent</span>
        {onRestart && (
          <button type="button" onClick={onRestart} style={RESTART}>
            Start again
          </button>
        )}
      </div>
      {children}
      {left && (
        <div role="status" style={NOTE}>
          This is the demo. In the real one that opens {left}; here it stays on this screen.
        </div>
      )}
    </>
  );
}

const STRIP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 10,
  minHeight: 32,
  padding: "4px 16px",
  background: "#141413",
  color: "#fff",
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const NOTE: React.CSSProperties = {
  position: "fixed",
  zIndex: 400,
  top: 100,
  left: "50%",
  transform: "translateX(-50%)",
  width: "max-content",
  maxWidth: "calc(100vw - 32px)",
  padding: "9px 14px",
  borderRadius: 14,
  background: "rgba(20, 20, 19, 0.9)",
  color: "#fff",
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.35,
  textAlign: "center",
  boxShadow: "0 6px 18px rgba(0,0,0,.18)",
};

const RESTART: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "4px 10px",
  background: "#fff",
  color: "#141413",
  font: "inherit",
  fontSize: 10,
  letterSpacing: "0.06em",
  cursor: "pointer",
};
