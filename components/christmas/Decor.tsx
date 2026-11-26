"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChristmas, useStill } from "@/lib/christmas";

/**
 * The Christmas decorations (lib/christmas, 26 Nov 2026). All drawn here in
 * code, no pictures: Steve's hat, the holly by the name, the fairy lights
 * along the sidebar, the bunting and the snow on the dashboard, and the tile
 * that turns the look on and off. Colours are the house palette's warm
 * neighbours: berry, pine, a dull gold and linen.
 */

const BERRY = "#9e2f35";
const PINE = "#2f4a3a";
const GOLD = "#c49a4a";
const LINEN = "#f1e8da";
const CLAY = "#a85a51";

/* ── Steve's hat ─────────────────────────────────────────────────────────── */

/** A Santa hat that sits on Steve's head, tipped a little to his left, its tip flopping to his right. */
export function SantaHat({ className = "" }: { className?: string }) {
  return (
    <svg className={`xmas-hat ${className}`} viewBox="0 0 120 92" aria-hidden focusable="false">
      <defs>
        <linearGradient id="xmasHatRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c0464a" />
          <stop offset="0.55" stopColor={BERRY} />
          <stop offset="1" stopColor="#74222a" />
        </linearGradient>
        <radialGradient id="xmasFur" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f6f0e6" />
          <stop offset="1" stopColor="#dcd2c3" />
        </radialGradient>
      </defs>
      {/* The body: a soft cone that leans over and droops to the right. */}
      <path
        d="M14 70 C 18 44, 34 18, 62 12 C 82 8, 98 16, 106 34 C 110 44, 108 54, 103 60 C 99 50, 92 40, 82 38 C 90 50, 96 62, 98 72 Z"
        fill="url(#xmasHatRed)"
      />
      {/* A crease where the tip folds. */}
      <path d="M82 38 C 88 40, 96 46, 103 60" fill="none" stroke="#6a1f26" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      {/* The fur brim. */}
      <rect x="6" y="64" width="98" height="22" rx="11" fill="url(#xmasFur)" />
      <path d="M14 70 q6 -3 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" fill="none" stroke="#e5dccd" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      {/* The bobble. */}
      <circle cx="104" cy="64" r="11" fill="url(#xmasFur)" />
      <circle cx="100" cy="60" r="3.5" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

/* ── Holly by the name ───────────────────────────────────────────────────── */

export function Holly({ className = "" }: { className?: string }) {
  const leaf = "M0 0 C 3 -3, 6 -2, 8 -5 C 9 -2, 12 -2, 14 -4 C 14 -1, 17 0, 19 -1 C 17 2, 17 4, 19 6 C 16 6, 14 7, 13 10 C 11 7, 8 7, 6 9 C 6 6, 3 4, 0 4 C 2 2, 1 1, 0 0 Z";
  return (
    <svg className={`xmas-holly ${className}`} viewBox="-2 -14 44 30" aria-hidden focusable="false">
      <path d={leaf} transform="translate(20 0) rotate(-24)" fill={PINE} />
      <path d={leaf} transform="translate(20 0) scale(-1 1) rotate(-24)" fill="#3c5b47" />
      <path d="M20 0 l0 0" stroke="#24382c" />
      <circle cx="17.5" cy="1.5" r="3.6" fill={BERRY} />
      <circle cx="23" cy="2.5" r="3.6" fill="#b23a40" />
      <circle cx="20" cy="-3" r="3.6" fill="#8c2930" />
      <circle cx="16.5" cy="0.4" r="1" fill="#fff" opacity="0.7" />
      <circle cx="22" cy="1.4" r="1" fill="#fff" opacity="0.7" />
    </svg>
  );
}

/* ── Fairy lights along the top of the sidebar ───────────────────────────── */

export function FairyLights() {
  const still = useStill();
  const bulbs = [GOLD, BERRY, "#e9d9a8", PINE, GOLD, CLAY, "#e9d9a8", BERRY, GOLD, PINE, "#e9d9a8", BERRY];
  const n = bulbs.length;
  /* A wire along the very top that dips twice; the bulbs hang under it. */
  const y = (x: number) => 2 + 4 * Math.sin((x / 100) * Math.PI) ** 2;
  const wire = Array.from({ length: 41 }, (_, i) => {
    const x = i * 5;
    return `${i ? "L" : "M"}${x} ${y(x).toFixed(2)}`;
  }).join(" ");
  return (
    <svg className={`xmas-lights${still ? " is-still" : ""}`} viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d={wire} fill="none" stroke="#4a463d" strokeOpacity="0.5" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      {bulbs.map((c, i) => {
        const x = 8 + (i * 184) / (n - 1);
        const top = y(x);
        return (
          <g key={i} className="xmas-bulb" style={{ animationDelay: `${(i * 0.37) % 2.6}s` }}>
            <ellipse className="xmas-glow" cx={x} cy={top + 5.6} rx="4.2" ry="4.6" fill={c} />
            <rect x={x - 1.1} y={top - 0.4} width="2.2" height="2" rx="0.4" fill="#4a463d" />
            <ellipse cx={x} cy={top + 5.2} rx="1.9" ry="3" fill={c} />
            <ellipse cx={x - 0.6} cy={top + 4.2} rx="0.5" ry="0.9" fill="#fff" opacity="0.65" />
          </g>
        );
      })}
    </svg>
  );
}

/* ── The tile above Help ─────────────────────────────────────────────────── */

function Flake({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" className="xmas-flake">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
        {[0, 60, 120].map((a) => (
          <g key={a} transform={`rotate(${a} 12 12)`}>
            <path d="M12 2.5v19" />
            <path d="M9.2 4.6 12 7.2l2.8-2.6M9.2 19.4 12 16.8l2.8 2.6" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * "Try the new Christmas look" (James's words), above Help. Once on, it says
 * so, with a switch that turns it off again. Only while the season is on.
 */
export function ChristmasTile({ collapsed, look }: { collapsed: boolean; look?: "new" }) {
  const { season, on, set } = useChristmas();
  if (!season) return null;
  const words = on ? "Christmas look on" : "Try the new Christmas look";
  return (
    <li>
      <button
        type="button"
        onClick={() => set(!on)}
        aria-pressed={on}
        title={collapsed ? words : on ? "Turn the Christmas look off" : "Snow, bunting and fairy lights, just for you. Press again to turn it off."}
        className={`xmas-tile${on ? " is-on" : ""}${collapsed ? " is-tight" : ""}${look ? " is-new" : ""}`}
      >
        <span className="xmas-tile-icon">
          <Flake size={look ? 16 : 15} />
        </span>
        {!collapsed && (
          <>
            <span className="xmas-tile-words">{words}</span>
            <span className="xmas-tile-switch" aria-hidden>
              <i />
            </span>
          </>
        )}
      </button>
    </li>
  );
}

/* ── Bunting across the top of the dashboard ─────────────────────────────── */

function useWidth(el: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

function Bunting() {
  const box = useRef<HTMLDivElement>(null);
  const w = useWidth(box);
  const still = useStill();
  const colours = [BERRY, LINEN, PINE, GOLD, CLAY, LINEN];
  /* Two swags on a wide screen, one on a narrow one, each a gentle curve. */
  const swags = w > 760 ? 2 : 1;
  const sag = 32;
  const span = w / swags;
  const yAt = (x: number) => {
    const t = (x % span) / span;
    return 4 + sag * 4 * t * (1 - t);
  };
  const step = 42;
  const flags: Array<{ x: number; y: number; a: number; c: string }> = [];
  if (w > 0) {
    for (let s = 0; s < swags; s++) {
      const count = Math.max(4, Math.floor(span / step));
      for (let i = 1; i < count; i++) {
        const x = s * span + (i * span) / count;
        const dx = 1;
        const a = (Math.atan2(yAt(x + dx) - yAt(x - dx), 2 * dx) * 180) / Math.PI;
        flags.push({ x, y: yAt(x), a, c: colours[(s * 7 + i) % colours.length] });
      }
    }
  }
  const string = w
    ? Array.from({ length: swags }, (_, s) => `M${s * span} 4 Q ${s * span + span / 2} ${4 + sag * 2} ${(s + 1) * span} 4`).join(" ")
    : "";
  return (
    <div ref={box} className={`xmas-bunting${still ? " is-still" : ""}`} aria-hidden>
      {w > 0 && (
        <svg width={w} height={sag + 34} viewBox={`0 0 ${w} ${sag + 34}`} focusable="false">
          <path d={string} fill="none" stroke="#6b5a4a" strokeOpacity="0.55" strokeWidth="1.2" />
          {flags.map((f, i) => (
            <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.a.toFixed(1)})`}>
              <g className="xmas-flag" style={{ animationDelay: `${(i * 0.29) % 3}s` }}>
                <path d="M-11 0 L11 0 L0 22 Z" fill={f.c} stroke={f.c === LINEN ? "#d8cbb6" : "none"} strokeWidth="0.8" />
                <path d="M-11 0 L11 0" stroke="#000" strokeOpacity="0.12" strokeWidth="1.5" />
              </g>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ── Snow on the dashboard ───────────────────────────────────────────────── */

type Flakeling = { x: number; y: number; r: number; v: number; drift: number; phase: number; o: number };

function Snow() {
  const ref = useRef<HTMLCanvasElement>(null);
  const still = useStill();
  useEffect(() => {
    if (still) return;
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let flakes: Flakeling[] = [];
    const dark = () => document.documentElement.getAttribute("data-theme") === "dark";
    const make = (top: boolean): Flakeling => ({
      x: Math.random() * w,
      y: top ? -10 - Math.random() * 40 : Math.random() * h,
      r: 1.4 + Math.random() * 2.6,
      v: 0.25 + Math.random() * 0.55,
      drift: 0.3 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      o: 0.55 + Math.random() * 0.4,
    });
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* Light: about one flake per 26,000 square pixels, never a blizzard. */
      const want = Math.round(Math.min(70, Math.max(24, (w * h) / 26000)));
      flakes = Array.from({ length: want }, () => make(false));
    };
    size();
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 16.7;
      last = now;
      ctx.clearRect(0, 0, w, h);
      const isDark = dark();
      for (const f of flakes) {
        f.phase += 0.012 * dt;
        f.y += f.v * dt;
        f.x += Math.sin(f.phase) * f.drift * 0.35 * dt;
        if (f.y > h + 8) Object.assign(f, make(true));
        if (f.x < -8) f.x = w + 6;
        if (f.x > w + 8) f.x = -6;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        /* On a white page a white flake vanishes: a soft grey-blue edge keeps it visible without looking dirty. */
        ctx.fillStyle = `rgba(255,255,255,${f.o})`;
        ctx.shadowColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(78,98,120,0.7)";
        ctx.shadowBlur = isDark ? 4 : 2.5;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    const go = () => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    go();
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", go);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", go);
    };
  }, [still]);
  if (still) return null;
  return <canvas ref={ref} className="xmas-snow" aria-hidden />;
}

/* ── The layer the shell mounts ──────────────────────────────────────────── */

/**
 * Mounted once by the shell. With the look on: html gets data-xmas="on" (the
 * holly, the lights and the accents key off it in CSS), and on the dashboard
 * the bunting hangs in the page's top margin and the snow falls.
 */
export function ChristmasLayer({ pathname }: { pathname: string }) {
  const { on } = useChristmas();
  const [main, setMain] = useState<HTMLElement | null>(null);
  const home = pathname === "/dashboard" || pathname === "/";

  useEffect(() => {
    const root = document.documentElement;
    if (on) root.setAttribute("data-xmas", "on");
    else root.removeAttribute("data-xmas");
    return () => root.removeAttribute("data-xmas");
  }, [on]);

  useEffect(() => {
    if (!on || !home) {
      setMain(null);
      return;
    }
    setMain(document.querySelector<HTMLElement>("main[data-os-content]"));
  }, [on, home, pathname]);

  if (!on || !home) return null;
  return (
    <>
      <Snow />
      {main && createPortal(<Bunting />, main)}
    </>
  );
}
