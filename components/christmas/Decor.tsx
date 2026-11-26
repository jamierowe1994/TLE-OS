"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChristmas, useStill } from "@/lib/christmas";

/**
 * The Christmas decorations (lib/christmas, 26 Nov 2026). All drawn here in
 * code, no pictures: Steve's hat, the holly by the name, the fairy lights
 * along the sidebar, the snowy garland and the snow on the dashboard, and the tile
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
        title={collapsed ? words : on ? "Turn the Christmas look off" : "Snow, a snowy garland and fairy lights, just for you. Press again to turn it off."}
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

/* ── The garland across the top of the dashboard ──────────────────────────── */

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

/**
 * A pine cone lying on the branch: an oval of overlapping scales in rows, the
 * lower ones drawn first so each row sits over the one below, with snow only
 * on the upper edges, as on the wreath.
 */
function PineCone({ x, y, r, tilt, seed }: { x: number; y: number; r: number; tilt: number; seed: number }) {
  const rnd = seeded(seed * 97);
  const rx = r * 0.66;
  const rows = 6;
  const scales: Array<{ sx: number; sy: number; snow: boolean }> = [];
  for (let ri = rows - 1; ri >= 0; ri--) {
    const sy = -r * 0.8 + (ri * (r * 1.6)) / (rows - 1);
    const half = rx * Math.sqrt(Math.max(0, 1 - (sy / r) ** 2));
    const n = Math.max(1, Math.round((half * 2) / (r * 0.36)));
    for (let k = 0; k < n; k++) {
      const sx = n === 1 ? 0 : -half + r * 0.14 + (k * (half * 2 - r * 0.28)) / (n - 1) + (ri % 2 ? r * 0.08 : -r * 0.08);
      scales.push({ sx, sy, snow: ri < 3 ? rnd() < 0.8 : rnd() < 0.25 });
    }
  }
  const sw = r * 0.2;
  const sh = r * 0.17;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(0)})`}>
      <ellipse rx={rx} ry={r} fill="#3e2616" />
      {scales.map((p, i) => (
        <g key={i}>
          <path
            d={`M${(p.sx - sw).toFixed(2)} ${(p.sy - sh * 0.4).toFixed(2)} Q${p.sx.toFixed(2)} ${(p.sy + sh * 1.5).toFixed(2)} ${(p.sx + sw).toFixed(2)} ${(p.sy - sh * 0.4).toFixed(2)} Q${p.sx.toFixed(2)} ${(p.sy + sh * 0.3).toFixed(2)} ${(p.sx - sw).toFixed(2)} ${(p.sy - sh * 0.4).toFixed(2)} Z`}
            fill="url(#xmasCone)"
            stroke="#2e1b0f"
            strokeWidth="0.45"
          />
          {p.snow && (
            <path
              d={`M${(p.sx - sw * 0.8).toFixed(2)} ${(p.sy - sh * 0.3).toFixed(2)} Q${p.sx.toFixed(2)} ${(p.sy + sh * 0.35).toFixed(2)} ${(p.sx + sw * 0.8).toFixed(2)} ${(p.sy - sh * 0.3).toFixed(2)}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth={Math.max(0.9, r * 0.11).toFixed(2)}
              strokeLinecap="round"
              opacity="0.95"
            />
          )}
        </g>
      ))}
    </g>
  );
}

/** The same garland every visit: a seeded random, so it never reshuffles on a resize. */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A snowy pine garland hung across the top of the dashboard (James, 26 Nov
 * 2026, from a picture of a frosted wreath: "snowy pine cones ... the little
 * red berries and little white bits ... rather than in a wreath, hanging").
 * Frosted needles along a swag, pine cones with snow on their scales, berry
 * clusters, white frosted balls and the odd red bauble. All drawn here.
 */
function Garland() {
  const box = useRef<HTMLDivElement>(null);
  const px = useWidth(box);
  /* Drawn a third larger than its own units, so it reads as a real garland
     and still clears the date line under it. */
  const k = 1.35;
  const w = px / k;
  const swags = px > 900 ? 2 : 1;
  const sag = 28;
  const top = 10;
  const H = sag + 64;
  const span = w / Math.max(1, swags);
  const yAt = (x: number) => {
    const t = (x % span) / span;
    return top + sag * 4 * t * (1 - t);
  };

  const art = (() => {
    if (w <= 0) return null;
    const rnd = seeded(1225);
    const darkNeedles: string[] = [];
    const midNeedles: string[] = [];
    const frost: string[] = [];
    const cones: Array<{ x: number; y: number; r: number; tilt: number }> = [];
    const berries: Array<{ x: number; y: number; r: number }> = [];
    const balls: Array<{ x: number; y: number; r: number }> = [];
    const baubles: Array<{ x: number; y: number; r: number }> = [];
    const flecks: Array<{ x: number; y: number; r: number }> = [];

    const body: Array<{ x: number; y: number; r: number }> = [];
    const snowTop: Array<{ x: number; y: number; r: number }> = [];
    /* A soft dark body first, so the branch reads as full, not as sticks. */
    for (let x = -8; x <= w + 8; x += 7) {
      const y = yAt(Math.max(0, Math.min(w - 0.01, x)));
      body.push({ x: x + (rnd() - 0.5) * 3, y: y + 2 + (rnd() - 0.5) * 3, r: 8 + rnd() * 3 });
    }
    /* Needles: dense tufts splayed round the swag, curving a little, most of them frosted at the tip. */
    for (let x = -6; x <= w + 6; x += 2.1) {
      const y = yAt(Math.max(0, Math.min(w - 0.01, x)));
      for (let k = 0; k < 5; k++) {
        const ang = (rnd() * 2 - 1) * Math.PI + Math.PI / 2;
        const len = 7 + rnd() * 10;
        const ox = x + (rnd() - 0.5) * 5;
        const oy = y + 2 + (rnd() - 0.5) * 7;
        const ex = ox + Math.cos(ang) * len;
        const ey = oy + Math.sin(ang) * len * 0.78;
        const bend = (rnd() - 0.5) * 4;
        const qx = (ox + ex) / 2 + Math.sin(ang) * bend;
        const qy = (oy + ey) / 2 - Math.cos(ang) * bend;
        (rnd() < 0.55 ? darkNeedles : midNeedles).push(`M${ox.toFixed(1)} ${oy.toFixed(1)}Q${qx.toFixed(1)} ${qy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
        if (rnd() < 0.72) {
          const t0 = 0.5 + rnd() * 0.15;
          frost.push(`M${(ox + (ex - ox) * t0).toFixed(1)} ${(oy + (ey - oy) * t0).toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`);
        }
      }
      /* Snow lying along the top of the branch, as on the wreath. */
      if (rnd() < 0.5) snowTop.push({ x: x + (rnd() - 0.5) * 6, y: y - 3 - rnd() * 6, r: 1.4 + rnd() * 2.2 });
      if (rnd() < 0.28) flecks.push({ x: x + (rnd() - 0.5) * 18, y: y + (rnd() - 0.35) * 24, r: 0.6 + rnd() * 1 });
    }

    /* The trimmings, spaced along the swag so they never bunch. */
    const along = (step: number, jitter: number, each: (x: number, y: number) => void) => {
      for (let x = step * 0.5; x < w - 8; x += step + (rnd() - 0.5) * jitter) each(x, yAt(x));
    };
    along(118, 30, (x, y) => {
      cones.push({ x: x - 8, y: y + 7 + rnd() * 3, r: 10 + rnd() * 1.5, tilt: -28 + rnd() * 16 });
      if (rnd() < 0.7) cones.push({ x: x + 9, y: y + 10 + rnd() * 3, r: 9 + rnd() * 1.5, tilt: 14 + rnd() * 18 });
    });
    along(64, 18, (x, y) => {
      const cx = x + 30;
      const cy = y + 2 + rnd() * 8;
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) berries.push({ x: cx + (rnd() - 0.5) * 11, y: cy + (rnd() - 0.5) * 9, r: 2.6 + rnd() * 1.1 });
    });
    along(52, 20, (x, y) => {
      balls.push({ x: x + 14 + (rnd() - 0.5) * 8, y: y - 4 + rnd() * 16, r: 2.6 + rnd() * 2.8 });
    });
    along(236, 40, (x, y) => {
      baubles.push({ x: x + 58, y: y + 8 + rnd() * 6, r: 5.5 + rnd() * 1.5 });
    });

    return { body, snowTop, darkNeedles, midNeedles, frost, cones, berries, balls, baubles, flecks };
  })();

  /* The cord the garland hangs from, tied off at each end. */
  const cord = w
    ? Array.from({ length: swags }, (_, s) => `M${s * span} ${top} Q ${s * span + span / 2} ${top + sag * 2} ${(s + 1) * span} ${top}`).join(" ")
    : "";

  return (
    <div ref={box} className="xmas-garland" aria-hidden>
      {art && (
        <svg width={px} height={H * k} viewBox={`0 0 ${w} ${H}`} focusable="false">
          <defs>
            <radialGradient id="xmasBerry" cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#e0545a" />
              <stop offset="0.55" stopColor="#b3262c" />
              <stop offset="1" stopColor="#7a161b" />
            </radialGradient>
            <radialGradient id="xmasBall" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.7" stopColor="#f4f4f2" />
              <stop offset="1" stopColor="#d9dcdf" />
            </radialGradient>
            <radialGradient id="xmasCone" cx="0.4" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#a0704a" />
              <stop offset="1" stopColor="#5a3820" />
            </radialGradient>
          </defs>
          <path d={cord} fill="none" stroke="#2c3a2e" strokeWidth="2" />
          {art.body.map((b, i) => (
            <circle key={`m${i}`} cx={b.x} cy={b.y} r={b.r} fill="#1d3524" />
          ))}
          <path d={art.darkNeedles.join("")} stroke="#24412c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d={art.midNeedles.join("")} stroke="#3d6847" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d={art.frost.join("")} stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {art.snowTop.map((f, i) => (
            <circle key={`s${i}`} cx={f.x} cy={f.y} r={f.r} fill="#fbfcfd" />
          ))}
          {art.cones.map((c, i) => <PineCone key={`c${i}`} {...c} seed={i + 7} />)}
          {art.baubles.map((b, i) => (
            <g key={`b${i}`}>
              <circle cx={b.x} cy={b.y} r={b.r} fill="url(#xmasBerry)" />
              <circle cx={b.x - b.r * 0.35} cy={b.y - b.r * 0.38} r={b.r * 0.22} fill="#fff" opacity="0.75" />
            </g>
          ))}
          {art.balls.map((b, i) => (
            <circle key={`w${i}`} cx={b.x} cy={b.y} r={b.r} fill="url(#xmasBall)" />
          ))}
          {art.berries.map((b, i) => (
            <g key={`r${i}`}>
              <circle cx={b.x} cy={b.y} r={b.r} fill="url(#xmasBerry)" />
              <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.35} r={b.r * 0.28} fill="#fff" opacity="0.7" />
            </g>
          ))}
          {art.flecks.map((f, i) => (
            <circle key={`f${i}`} cx={f.x} cy={f.y} r={f.r} fill="#fff" opacity="0.95" />
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
 * holly and the lights key off it in CSS), and on the dashboard the garland
 * hangs in the page's top margin and the snow falls.
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
      {main && createPortal(<Garland />, main)}
    </>
  );
}
