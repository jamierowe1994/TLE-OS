import type { ReactNode } from "react";

/**
 * The shapes every Learning tile is drawn from (10 Nov 2026).
 *
 * James: "things like the illustrations, I think, need some work ... custom
 * tiles for each one ... otherwise they just blend in together". Each shape
 * is flat, bold and drawn around its own middle inside a 40 by 40 box, so a
 * tile is a short list of "this shape, here, this big, this colour" (see
 * TileArt). Colours are classes, never values: a, b (the two inks of the
 * tile's scheme), c (its pop colour), i (ink that sits on the pop colour),
 * k (the field itself, for holes). The scheme sets what those mean, in
 * app/new-look/systems.css.
 */

type Prim = (c: string, d: string) => ReactNode;

const line = (c: string, w: number) => ({
  className: `s${c}`,
  strokeWidth: w,
  fill: "none",
  strokeLinecap: "square" as const,
});

const word = (text: string, c: string, size = 40) => (
  <text x={0} y={size * 0.35} textAnchor="middle" fontSize={size} className={`tx ${c}`}>
    {text}
  </text>
);

const P: Record<string, Prim> = {
  disc: (c) => <circle r={20} className={c} />,
  ring: (c) => <circle r={17} {...line(c, 4)} />,
  box: (c) => <rect x={-18} y={-18} width={36} height={36} className={c} />,
  lines: (c) => (
    <g className={c}>
      <rect x={-16} y={-9} width={32} height={4} />
      <rect x={-16} y={-1} width={22} height={4} />
      <rect x={-16} y={7} width={27} height={4} />
    </g>
  ),
  house: (c, d) => (
    <>
      <rect x={9} y={-19} width={5} height={10} className={c} />
      <path d="M-20 -2 L0 -20 L20 -2 V20 H-20Z" className={c} />
      <rect x={-5} y={6} width={10} height={14} className={d} />
    </>
  ),
  cal: (c, d) => (
    <>
      <rect x={-18} y={-15} width={36} height={34} className={c} />
      <rect x={-11} y={-20} width={4} height={9} className={c} />
      <rect x={7} y={-20} width={4} height={9} className={c} />
      <rect x={-18} y={-6} width={36} height={2.5} className={d} />
      <g className={d}>
        <rect x={-12} y={1} width={5} height={5} />
        <rect x={-2.5} y={1} width={5} height={5} />
        <rect x={7} y={1} width={5} height={5} />
        <rect x={-12} y={10} width={5} height={5} />
        <rect x={-2.5} y={10} width={5} height={5} />
      </g>
    </>
  ),
  paper: (c, d) => (
    <>
      <path d="M-14 -20 H6 L14 -12 V20 H-14Z" className={c} />
      <path d="M6 -20 V-12 H14Z" className={d} opacity={0.45} />
    </>
  ),
  doc: (c, d) => (
    <>
      <path d="M-14 -20 H6 L14 -12 V20 H-14Z" className={c} />
      <path d="M6 -20 V-12 H14Z" className={d} opacity={0.45} />
      <g className={d}>
        <rect x={-8} y={-5} width={16} height={2.6} />
        <rect x={-8} y={2} width={16} height={2.6} />
        <rect x={-8} y={9} width={10} height={2.6} />
      </g>
    </>
  ),
  env: (c, d) => (
    <>
      <rect x={-20} y={-13} width={40} height={27} className={c} />
      <path d="M-20 -13 L0 4 L20 -13" {...line(d, 2.6)} />
    </>
  ),
  phone: (c, d) => (
    <>
      <rect x={-11} y={-20} width={22} height={40} rx={3} className={c} />
      <rect x={-8} y={-15} width={16} height={27} className={d} />
    </>
  ),
  bubble: (c) => <path d="M-20 -15 H20 V9 H-4 L-13 19 V9 H-20Z" className={c} />,
  bubbleR: (c) => <path d="M20 -15 H-20 V9 H4 L13 19 V9 H20Z" className={c} />,
  bell: (c) => (
    <>
      <path d="M0 -20 C10 -20 13 -10 13 -2 V8 L19 14 H-19 L-13 8 V-2 C-13 -10 -10 -20 0 -20Z" className={c} />
      <circle cy={17.5} r={3.6} className={c} />
    </>
  ),
  key: (c, d) => (
    <>
      <circle cx={-10} r={10} className={c} />
      <circle cx={-10} r={3.6} className={d} />
      <rect x={-2} y={-2.5} width={22} height={5} className={c} />
      <rect x={9} y={2} width={4} height={6} className={c} />
      <rect x={16} y={2} width={4} height={8} className={c} />
    </>
  ),
  pound: (c) => word("£", c),
  question: (c) => word("?", c),
  tick: (c) => <path d="M-14 1 L-4 11 L15 -11" {...line(c, 6)} />,
  cross: (c) => <path d="M-13 -13 L13 13 M13 -13 L-13 13" {...line(c, 6)} />,
  plane: (c, d) => (
    <>
      <path d="M-20 -2 L20 -18 L6 18 L-1 5Z" className={c} />
      <path d="M-1 5 L20 -18" {...line(d, 2)} />
    </>
  ),
  pin: (c, d) => (
    <>
      <path d="M0 20 C-14 4 -15 -3 -15 -6 A15 15 0 0 1 15 -6 C15 -3 14 4 0 20Z" className={c} />
      <circle cy={-6} r={5.5} className={d} />
    </>
  ),
  eye: (c, d) => (
    <>
      <path d="M-20 0 Q0 -18 20 0 Q0 18 -20 0Z" className={c} />
      <circle r={7} className={d} />
      <circle r={3} className={c} />
    </>
  ),
  spanner: (c) => (
    <g transform="rotate(45)">
      <rect x={-3} y={-10} width={6} height={30} className={c} />
      <path d="M-9 -20 V-10 A9 9 0 0 0 9 -10 V-20 H4 V-12 H-4 V-20Z" className={c} />
    </g>
  ),
  hammer: (c) => (
    <g transform="rotate(-45)">
      <rect x={-3} y={-8} width={6} height={28} className={c} />
      <rect x={-14} y={-20} width={28} height={12} className={c} />
    </g>
  ),
  shield: (c) => <path d="M0 -20 L17 -13 V0 C17 10 9 17 0 20 C-9 17 -17 10 -17 0 V-13Z" className={c} />,
  camera: (c, d) => (
    <>
      <rect x={-20} y={-11} width={40} height={28} className={c} />
      <rect x={-8} y={-17} width={16} height={7} className={c} />
      <circle cy={3} r={9} className={d} />
      <circle cy={3} r={4.5} className={c} />
    </>
  ),
  mega: (c) => (
    <>
      <path d="M-18 -5 H-8 L12 -18 V18 L-8 5 H-18Z" className={c} />
      <rect x={-13} y={5} width={6} height={12} className={c} />
      <path d="M18 -7 V7" {...line(c, 3)} />
    </>
  ),
  star: (c) => (
    <polygon
      points="0,-20 4.7,-6.5 19,-6.2 7.6,2.5 11.8,16.2 0,8 -11.8,16.2 -7.6,2.5 -19,-6.2 -4.7,-6.5"
      className={c}
    />
  ),
  sparkle: (c) => <path d="M0 -20 Q3 -3 20 0 Q3 3 0 20 Q-3 3 -20 0 Q-3 -3 0 -20Z" className={c} />,
  person: (c) => (
    <>
      <circle cy={-10} r={8} className={c} />
      <path d="M-16 20 C-16 6 -8 2 0 2 C8 2 16 6 16 20Z" className={c} />
    </>
  ),
  door: (c, d) => (
    <>
      <rect x={-12} y={-20} width={24} height={40} className={c} />
      <rect x={-7} y={-15} width={14} height={12} {...line(d, 2)} />
      <circle cx={6} cy={4} r={2.4} className={d} />
    </>
  ),
  clock: (c, d) => (
    <>
      <circle r={19} className={c} />
      <path d="M0 -11 V0 L8 5" {...line(d, 3.6)} />
    </>
  ),
  pen: (c, d) => (
    <g transform="rotate(40)">
      <rect x={-4} y={-20} width={8} height={28} className={c} />
      <rect x={-4} y={-14} width={8} height={3} className={d} />
      <path d="M-4 10 L0 20 L4 10Z" className={c} />
    </g>
  ),
  mag: (c) => (
    <>
      <circle cx={-4} cy={-4} r={12} {...line(c, 5)} />
      <path d="M7 7 L17 17" {...line(c, 6)} />
    </>
  ),
  cog: (c, d) => (
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
        <rect key={r} x={-3.6} y={-20} width={7.2} height={10} transform={`rotate(${r})`} className={c} />
      ))}
      <circle r={13.5} className={c} />
      <circle r={5.5} className={d} />
    </>
  ),
  lock: (c, d) => (
    <>
      <path d="M-9 -3 V-9 A9 9 0 0 1 9 -9 V-3" {...line(c, 5)} />
      <rect x={-14} y={-3} width={28} height={23} className={c} />
      <circle cy={6} r={3} className={d} />
      <rect x={-1.3} y={6} width={2.6} height={8} className={d} />
    </>
  ),
  arrow: (c) => <path d="M-20 -5 H4 V-14 L20 0 L4 14 V5 H-20Z" className={c} />,
  redo: (c) => (
    <>
      <path d="M13 -9 A15 15 0 1 0 15 5" {...line(c, 5)} />
      <path d="M6 -19 L19 -8 L4 -3Z" className={c} />
    </>
  ),
  tag: (c, d) => (
    <>
      <path d="M-20 0 L-8 -13 H20 V13 H-8Z" className={c} />
      <circle cx={-9} r={3} className={d} />
    </>
  ),
  board: (c, d) => (
    <>
      <rect x={-15} y={-20} width={4} height={40} className={c} />
      <rect x={-15} y={-18} width={34} height={3.5} className={c} />
      <rect x={-7} y={-12} width={26} height={18} className={d} />
    </>
  ),
  passport: (c, d) => (
    <>
      <rect x={-14} y={-20} width={28} height={40} className={c} />
      <circle cy={-4} r={8} {...line(d, 2.4)} />
      <path d="M-8 -4 H8 M0 -12 V4" {...line(d, 2)} />
      <rect x={-8} y={10} width={16} height={3} className={d} />
    </>
  ),
  hourglass: (c) => <path d="M-13 -20 H13 V-16 L3 0 L13 16 V20 H-13 V16 L-3 0 L-13 -16Z" className={c} />,
  rosette: (c, d) => (
    <>
      <path d="M-9 2 L-13 20 L-5 15 L0 20 V6Z" className={c} />
      <path d="M9 2 L13 20 L5 15 L0 20 V6Z" className={c} />
      <circle cy={-6} r={13} className={c} />
      <circle cy={-6} r={6} className={d} />
    </>
  ),
  plus: (c) => <path d="M-5 -18 H5 V-5 H18 V5 H5 V18 H-5 V5 H-18 V-5 H-5Z" className={c} />,
  clip: (c, d) => (
    <>
      <rect x={-15} y={-16} width={30} height={36} className={c} />
      <rect x={-8} y={-20} width={16} height={9} className={d} />
      <rect x={-6} y={-20} width={12} height={6} className={c} />
      <g className={d}>
        <rect x={-9} y={-4} width={18} height={2.6} />
        <rect x={-9} y={3} width={18} height={2.6} />
        <rect x={-9} y={10} width={11} height={2.6} />
      </g>
    </>
  ),
  slides: (c, d) => (
    <>
      <rect x={-20} y={-16} width={40} height={27} className={c} />
      <path d="M0 11 V18 M-9 19 H9" {...line(c, 3)} />
      <path d="M-5 -10 L8 -2.5 L-5 5Z" className={d} />
    </>
  ),
  tray: (c) => (
    <>
      <rect x={-12} y={-16} width={24} height={4} className={c} />
      <rect x={-12} y={-9} width={24} height={4} className={c} />
      <path d="M-20 0 H-8 L-5 6 H5 L8 0 H20 V16 H-20Z" className={c} />
    </>
  ),
  drop: (c) => <path d="M0 -20 C8 -8 14 -2 14 6 A14 14 0 0 1 -14 6 C-14 -2 -8 -8 0 -20Z" className={c} />,
  switch: (c, d) => (
    <>
      <rect x={-20} y={-11} width={40} height={22} rx={11} className={c} />
      <circle cx={9} r={7.5} className={d} />
    </>
  ),
  gauge: (c) => (
    <>
      <path d="M-18 9 A18 18 0 0 1 18 9" {...line(c, 6)} />
      <path d="M0 9 L10 -5" {...line(c, 3.6)} />
      <circle cy={9} r={4} className={c} />
    </>
  ),
  stamp: (c) => (
    <>
      <circle r={18} {...line(c, 3.4)} />
      <circle r={12} className={c} />
    </>
  ),
  track: (c, d) => (
    <>
      <rect x={-18} y={-1.6} width={36} height={3.2} className={c} />
      <circle cx={-18} r={5} className={c} />
      <circle r={5} className={c} />
      <circle cx={18} r={5} className={d} />
    </>
  ),
  book: (c, d) => (
    <>
      <rect x={-14} y={-20} width={28} height={40} className={c} />
      <rect x={-9} y={-20} width={3} height={40} className={d} opacity={0.5} />
      <rect x={-2} y={-12} width={11} height={3} className={d} />
    </>
  ),
};

/** One placed shape: name (or "txt:WORD"), x, y, scale, turn, colour, detail colour. */
export type Item = [string, number, number, number, number?, string?, string?];

export function drawItem(it: Item, key: number): ReactNode {
  const [name, x, y, s, r = 0, c = "a", d = "k"] = it;
  const body = name.startsWith("txt:") ? word(name.slice(4), c) : (P[name] ?? P.disc)(c, d);
  return (
    <g key={key} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      {body}
    </g>
  );
}
