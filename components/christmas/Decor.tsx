"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChristmas, useStill } from "@/lib/christmas";

/**
 * The Christmas decorations (lib/christmas, 26 Nov 2026). All drawn here in
 * code, no pictures: Steve's hat, the holly by the name, the fairy lights
 * along the sidebar, the snowy garland and the snow on the dashboard, and the tile
 * that turns the look on and off. The colours that go with it (a deep pine
 * sidebar; the page stays white in light mode and turns midnight in dark)
 * are in app/new-look/christmas.css.
 */

const BERRY = "#9e2f35";

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
      {/* Light leaves: the Christmas sidebar they sit on is deep green in both versions. */}
      <path d={leaf} transform="translate(20 0) rotate(-24)" fill="#7fb37a" />
      <path d={leaf} transform="translate(20 0) scale(-1 1) rotate(-24)" fill="#9cc98f" />
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
  /* Bright bulbs: they hang on a deep green sidebar. */
  const bulbs = ["#f2c14e", "#e5484d", "#fff1c9", "#7fd08a", "#f2c14e", "#e5484d", "#fff1c9", "#7fd08a", "#f2c14e", "#e5484d", "#fff1c9", "#7fd08a"];
  const n = bulbs.length;
  /* A wire along the very top that dips twice; the bulbs hang under it. */
  const y = (x: number) => 2 + 4 * Math.sin((x / 100) * Math.PI) ** 2;
  const wire = Array.from({ length: 41 }, (_, i) => {
    const x = i * 5;
    return `${i ? "L" : "M"}${x} ${y(x).toFixed(2)}`;
  }).join(" ");
  return (
    <svg className={`xmas-lights${still ? " is-still" : ""}`} viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d={wire} fill="none" stroke="#f1e8da" strokeOpacity="0.45" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      {bulbs.map((c, i) => {
        const x = 8 + (i * 184) / (n - 1);
        const top = y(x);
        return (
          <g key={i} className="xmas-bulb" style={{ animationDelay: `${(i * 0.37) % 2.6}s` }}>
            <ellipse className="xmas-glow" cx={x} cy={top + 5.6} rx="4.2" ry="4.6" fill={c} />
            <rect x={x - 1.1} y={top - 0.4} width="2.2" height="2" rx="0.4" fill="#d9cdb8" />
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
 * A pine garland hung across the top of the dashboard (James, 26 Nov 2026).
 * First a frosted tangle after a picture of a wreath; then, from a render of
 * a real garland: "have a look at how all of the pines flow in terms of
 * direction ... they all follow the same direction". So every needle now
 * grows from one stem and sweeps the same way, left to right, splayed a
 * little above and below it like a real fir branch. It hangs in scallops
 * from pins, with a pine cone, berries and a frosted ball at each pin, and a
 * light dusting of snow on the upper needles ("I do like the snow").
 */
function Garland() {
  const box = useRef<HTMLDivElement>(null);
  const px = useWidth(box);
  /* It scales with the page (James, 26 Nov 2026: "it needs to scale with the
     page in terms of size"): always four scallops, drawn larger on a wide
     page and smaller on a narrow one, so it looks the same at every width.
     1.35 at a 1,175px page is the size he approved; the limits keep it from
     turning into a thread on a small window or reaching the date line on a
     very wide one. */
  const k = Math.min(1.7, Math.max(0.8, (1.35 * px) / 1175));
  const w = px / k;
  const swags = 4;
  const sag = 20;
  const top = 12;
  const H = top + sag + 34;
  const span = w / swags;
  const yAt = (x: number) => {
    const t = ((x % span) + span) % span / span;
    return top + sag * 4 * t * (1 - t);
  };
  /* The way the stem is heading at x, in radians: the needles follow it. */
  const headingAt = (x: number) => {
    const t = ((x % span) + span) % span / span;
    return Math.atan((sag * 4 * (1 - 2 * t)) / span);
  };

  const art = (() => {
    if (w <= 0) return null;
    const rnd = seeded(1225);
    const back: string[] = [];
    const mid: string[] = [];
    const front: string[] = [];
    const frost: string[] = [];
    const dabs: Array<{ x: number; y: number; r: number }> = [];
    const deg = Math.PI / 180;

    /* One needle: from the stem, forward along the heading, leaning `lean`
       off it (negative = above the stem), bowing back towards the heading. */
    const needle = (x: number, lean: number, len: number, into: string[], snow: boolean) => {
      const y = yAt(x);
      const h = headingAt(x);
      const a = h + lean;
      const ox = x + (rnd() - 0.5) * 1.2;
      const oy = y + Math.sign(lean) * rnd() * 1.4;
      const ex = ox + Math.cos(a) * len;
      const ey = oy + Math.sin(a) * len;
      /* The bow: the middle of the needle sits a little further out than the straight line. */
      const mx = ox + Math.cos(a + lean * 0.35) * len * 0.5;
      const my = oy + Math.sin(a + lean * 0.35) * len * 0.5;
      into.push(`M${ox.toFixed(1)} ${oy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      if (snow) {
        const fx = ox + (ex - ox) * 0.58;
        const fy = oy + (ey - oy) * 0.58;
        frost.push(`M${fx.toFixed(1)} ${fy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`);
      }
    };

    for (let x = -10; x <= w + 2; x += 1.25) {
      /* Long dark needles underneath, splayed widest. */
      needle(x, -(30 + rnd() * 18) * deg, 11 + rnd() * 5, back, rnd() < 0.22);
      needle(x, (30 + rnd() * 18) * deg, 11 + rnd() * 5, back, false);
      /* The body of the branch. */
      needle(x + 0.6, -(20 + rnd() * 16) * deg, 9 + rnd() * 5, mid, rnd() < 0.3);
      needle(x + 0.6, (20 + rnd() * 16) * deg, 9 + rnd() * 5, mid, false);
      /* Short bright needles lying close along the stem, catching the light. */
      if (rnd() < 0.7) needle(x + 0.3, (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 12) * deg, 6 + rnd() * 4, front, false);
      /* A dab of snow lying on top here and there. */
      if (rnd() < 0.07) {
        const h = headingAt(x);
        dabs.push({ x: x + Math.sin(h) * 5, y: yAt(x) - Math.cos(h) * (4 + rnd() * 3), r: 1.2 + rnd() * 1.6 });
      }
    }

    /* At each pin: a cone, berries and a frosted ball, where a real garland is tied up. */
    const pins: Array<{ x: number; y: number; side: number; r: number; berries: Array<{ x: number; y: number; r: number }>; ball: { x: number; y: number; r: number } }> = [];
    for (let i = 0; i <= swags; i++) {
      const x = Math.min(w - 6, Math.max(6, i * span));
      const side = i === 0 ? 1 : i === swags ? -1 : rnd() < 0.5 ? -1 : 1;
      const cx = x + side * 3;
      const n = 3 + Math.floor(rnd() * 2);
      pins.push({
        x: cx,
        y: top + 9,
        side,
        r: 8.5 + rnd() * 1.5,
        berries: Array.from({ length: n }, (_, j) => ({ x: cx - side * (9 + (j % 2) * 4.5) + (rnd() - 0.5) * 2, y: top + 2 + j * 3.2 + (rnd() - 0.5) * 2, r: 2.5 + rnd() * 0.9 })),
        ball: { x: cx + side * 9.5, y: top + 3 + rnd() * 4, r: 3 + rnd() * 1.2 },
      });
    }
    /* And a few berries along the low point of each swag. */
    const low: Array<{ x: number; y: number; r: number }> = [];
    for (let i = 0; i < swags; i++) {
      const x = (i + 0.5) * span + (rnd() - 0.5) * span * 0.2;
      const n = 2 + Math.floor(rnd() * 2);
      for (let j = 0; j < n; j++) low.push({ x: x + j * 4.6 + (rnd() - 0.5), y: yAt(x) + 3 + (j % 2) * 3.4, r: 2.3 + rnd() * 0.8 });
    }
    /* Fairy lights wound along it, lit in the dark version only (James, 26 Nov
       2026: "when they're in dark mode, we can have some twinkling lights"). */
    const lights: Array<{ x: number; y: number; c: string; delay: number; dur: number }> = [];
    for (let x = 9; x < w - 4; x += 15 + rnd() * 6) {
      const h = headingAt(x);
      const off = (rnd() < 0.5 ? -1 : 1) * (2 + rnd() * 4);
      const pick = rnd();
      lights.push({
        x: x - Math.sin(h) * off,
        y: yAt(x) + Math.cos(h) * off,
        c: pick < 0.68 ? "#ffd98a" : pick < 0.84 ? "#ff7b72" : "#fff3d6",
        delay: rnd() * 3.2,
        dur: 2 + rnd() * 2.2,
      });
    }
    return { back, mid, front, frost, dabs, pins, low, lights };
  })();

  /* The stem itself, a brown line the needles grow from. */
  const stem = w
    ? Array.from({ length: swags }, (_, s) => `M${(s * span).toFixed(1)} ${top} Q ${(s * span + span / 2).toFixed(1)} ${top + sag * 2} ${((s + 1) * span).toFixed(1)} ${top}`).join(" ")
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
          <path d={art.back.join("")} stroke="#22472b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d={stem} fill="none" stroke="#4d3a26" strokeWidth="1.6" strokeLinecap="round" />
          <path d={art.mid.join("")} stroke="#3c7341" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d={art.front.join("")} stroke="#7aad57" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d={art.frost.join("")} stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {art.dabs.map((f, i) => (
            <circle key={`s${i}`} cx={f.x} cy={f.y} r={f.r} fill="#fbfcfd" />
          ))}
          <g className="xmas-glights">
            {art.lights.map((l, i) => (
              <g key={i} className="xmas-glight" style={{ animationDelay: `${l.delay.toFixed(2)}s`, animationDuration: `${l.dur.toFixed(2)}s` }}>
                <circle className="xmas-glight-halo" cx={l.x} cy={l.y} r="5.5" fill={l.c} />
                <circle cx={l.x} cy={l.y} r="1.7" fill={l.c} />
                <circle cx={l.x} cy={l.y} r="0.8" fill="#fffdf4" />
              </g>
            ))}
          </g>
          {art.low.map((b, i) => (
            <g key={`l${i}`}>
              <circle cx={b.x} cy={b.y} r={b.r} fill="url(#xmasBerry)" />
              <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.35} r={b.r * 0.28} fill="#fff" opacity="0.7" />
            </g>
          ))}
          {art.pins.map((p, i) => (
            <g key={`p${i}`}>
              <PineCone x={p.x} y={p.y} r={p.r} tilt={p.side * 12} seed={i + 7} />
              <circle cx={p.ball.x} cy={p.ball.y} r={p.ball.r} fill="url(#xmasBall)" />
              {p.berries.map((b, j) => (
                <g key={j}>
                  <circle cx={b.x} cy={b.y} r={b.r} fill="url(#xmasBerry)" />
                  <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.35} r={b.r * 0.28} fill="#fff" opacity="0.7" />
                </g>
              ))}
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
        /* On the white page a white flake needs an edge to be seen at all: a soft grey-blue one. */
        ctx.shadowColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(70,92,116,0.8)";
        ctx.shadowBlur = isDark ? 4 : 3;
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
