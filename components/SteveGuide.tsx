"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantCharacter from "@/components/AssistantCharacter";
import { GUIDE_EVENT, GUIDE_KEY, guideTarget, type DoneWhen, type GuideStep } from "@/lib/steve-guide";

/**
 * Steve pointing at things (lib/steve-guide for the routes and the rule).
 *
 * The screen dims around the one thing to press, a ring pulses round it, and
 * Steve says what it is beside it. Nothing is pressed for them - pressing it
 * is the lesson - and nothing is blocked: the dimming is paint, not a wall,
 * so somebody who knows better can click anything they like.
 *
 * It lives in the OS layout, so it is still here when the page changes, and
 * the guide in progress is kept in sessionStorage so a full reload does not
 * lose it either. Every quarter of a second it asks which step is the first
 * not yet done - on a new page, with a drawer just opened - and points there.
 * If what it wants is not on screen after a few seconds it says so, rather
 * than circling an empty corner.
 */

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;
const CARD_W = 300;

function visibleEl(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const found = Array.from(document.querySelectorAll(sel)).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (found) return found;
  }
  return null;
}

function met(d: DoneWhen, clicked: boolean): boolean {
  if ("any" in d) return d.any.some((x) => met(x, clicked));
  if ("path" in d) return window.location.pathname === d.path || window.location.pathname.startsWith(`${d.path}/`);
  if ("present" in d) return Boolean(visibleEl([d.present]));
  return clicked;
}
const isDone = (step: GuideStep, clicked: boolean) => met(step.done, clicked);

/**
 * Admin hides the main menu. A step that points at the menu, met on an Admin
 * page, becomes "Leave admin first" - and turns back into itself the moment
 * they are out and the menu is there to point at.
 */
function onScreen(step: GuideStep): GuideStep {
  const inAdmin = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
  const wantsRail = step.point.some((p) => p.startsWith("[data-nav=") && !p.includes('"/admin"'));
  if (inAdmin && wantsRail) return { point: ["[data-admin-leave]"], say: "First, Leave admin at the foot of this menu - the main menu is back once you are out.", done: step.done };
  return step;
}

export default function SteveGuide() {
  const path = usePathname();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [lost, setLost] = useState(false);
  const [finished, setFinished] = useState(false);
  /* Which steps have been clicked, for the ones that finish on a click. */
  const clicked = useRef<Set<number>>(new Set());
  const el = useRef<Element | null>(null);
  const since = useRef(0);
  const lastAt = useRef(-1);

  const stop = useCallback(() => {
    setTargetId(null);
    setBox(null);
    setLost(false);
    setFinished(false);
    clicked.current = new Set();
    try {
      sessionStorage.removeItem(GUIDE_KEY);
    } catch {}
  }, []);

  /* Start: from Steve's answer (an event), or a guide already under way. */
  useEffect(() => {
    const start = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!guideTarget(id)) return;
      clicked.current = new Set();
      lastAt.current = -1;
      setFinished(false);
      setTargetId(id);
      try {
        sessionStorage.setItem(GUIDE_KEY, JSON.stringify({ id, startedAt: Date.now() }));
      } catch {}
      /* Out of the way: the dock sits bottom right, often over the thing. */
      window.dispatchEvent(new CustomEvent("os-help-dock", { detail: { open: false } }));
    };
    window.addEventListener(GUIDE_EVENT, start);
    try {
      const held = JSON.parse(sessionStorage.getItem(GUIDE_KEY) ?? "null") as { id?: string; startedAt?: number } | null;
      /* A guide left for half an hour is not one they are still following. */
      if (held?.id && guideTarget(held.id) && Date.now() - (held.startedAt ?? 0) < 30 * 60 * 1000) setTargetId(held.id);
    } catch {}
    return () => window.removeEventListener(GUIDE_EVENT, start);
  }, []);

  /* Which step, and where it is - every quarter second. */
  useEffect(() => {
    if (!targetId || finished) return;
    const target = guideTarget(targetId);
    if (!target) return;
    const tick = () => {
      const steps = target.steps;
      let i = steps.findIndex((s, n) => !isDone(s, clicked.current.has(n)));
      if (i === -1) {
        setFinished(true);
        setBox(null);
        window.setTimeout(stop, 2600);
        return;
      }
      /* It can go back as well as forward: close the drawer and he points
         at the row again, leave the page and he points at the menu. */
      if (i !== lastAt.current) {
        lastAt.current = i;
        since.current = Date.now();
        setLost(false);
      }
      setAt(i);
      const found = visibleEl(onScreen(steps[i]).point);
      el.current = found;
      if (!found) {
        setBox(null);
        if (Date.now() - since.current > 3500) setLost(true);
        return;
      }
      setLost(false);
      const r = found.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        found.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [targetId, finished, path, stop]);

  /* A click on the thing being pointed at completes a click step. */
  useEffect(() => {
    if (!targetId) return;
    const onClick = (e: MouseEvent) => {
      const node = e.target as Node | null;
      if (node && el.current && el.current.contains(node)) clicked.current.add(at);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stop();
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [targetId, at, stop]);

  if (!targetId) return null;
  const target = guideTarget(targetId);
  if (!target) return null;
  const step = typeof window !== "undefined" ? onScreen(target.steps[at]) : target.steps[at];
  const total = target.steps.length;

  /* The card: beside the ring where there is room, else centred. */
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let card: React.CSSProperties = { left: (vw - CARD_W) / 2, top: vh / 2 - 80 };
  if (box && !finished) {
    const right = box.left + box.width + 14;
    const below = box.top + box.height + 12;
    if (right + CARD_W < vw - 12) card = { left: right, top: Math.max(12, Math.min(box.top, vh - 190)) };
    else if (below + 170 < vh) card = { left: Math.max(12, Math.min(box.left, vw - CARD_W - 12)), top: below };
    else card = { left: Math.max(12, Math.min(box.left, vw - CARD_W - 12)), top: Math.max(12, box.top - 182) };
  }

  const dim = "fixed z-[140] bg-[#2b201d]/35 pointer-events-none transition-all duration-300";
  return (
    <>
      {box && !finished && (
        <>
          {/* Four panels round the target: dim everything but the one thing. */}
          <div className={dim} style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div className={dim} style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <div className={dim} style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <div className={dim} style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          <div
            className="pointer-events-none fixed z-[141] rounded-[14px] ring-[3px] ring-accent-dark transition-all duration-300"
            style={{ ...box, animation: "steveGuidePulse 1.4s ease-in-out infinite" }}
          />
        </>
      )}
      <div
        className="fixed z-[142] rounded-[18px] border border-line/60 bg-white p-4 shadow-[0_20px_50px_-20px_rgba(40,25,20,0.55)] transition-all duration-300"
        style={{ ...card, width: CARD_W }}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <AssistantCharacter mood={finished ? "happy" : lost ? "confused" : "idle"} size={40} track={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {finished ? "That's the one" : `Step ${at + 1} of ${total}`}
            </p>
            <p className="mt-1 text-[13.5px] leading-snug">
              {finished
                ? "You've found it. Ask me whenever you want showing something else."
                : lost
                  ? `I can't see that on this screen just now. ${step.say}`
                  : step.say}
            </p>
          </div>
        </div>
        {!finished && (
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={stop} className="text-[12px] font-semibold text-muted underline underline-offset-2 hover:text-ink">
              Stop showing me
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes steveGuidePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(86,66,62,.35) } 50% { box-shadow: 0 0 0 8px rgba(86,66,62,0) } }`}</style>
    </>
  );
}
