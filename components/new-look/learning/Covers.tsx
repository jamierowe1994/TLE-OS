import type { ReactNode } from "react";
import { drawItem, type Item } from "./TilePrims";
import { Motif } from "./TileArt";

/**
 * The big covers for Tools > Learning: the two doors on the hub and the three
 * journeys under Systems.
 *
 * Redrawn 10 Nov 2026 (James: "redo the learning centre in our new style ...
 * add some pop and flair to it rather than it being very generic ... the
 * illustrations, I think, need some work"). They were thin-line drawings on
 * pastel; they are now flat posters in the final palette, built from the
 * same shapes as the file tiles (TilePrims) so the whole centre reads as one
 * set. Colours come from the scheme on the art's own box (.nl-ta is-sN in
 * app/new-look/tile-art.css).
 *
 * Groups marked pc-1, pc-2, pc-3 lift by different amounts when the tile is
 * hovered. They never carry a transform attribute of their own, because the
 * CSS transform would replace it.
 */

export type CoverTone = "clay" | "sage" | "brown" | "coral";
export type Audience = "you" | "landlords" | "tenants";

/** Which field each cover sits on: 0 terracotta, 2 olive, 4 brown. */
export const DOOR_SCHEME = { guides: 0, systems: 2 } as const;
export const JOURNEY_SCHEME: Record<"landlord" | "tenant" | "agent", number> = { landlord: 0, tenant: 2, agent: 4 };

function Poster({ children }: { children: ReactNode }) {
  return (
    <svg className="nl-pc" viewBox="0 0 360 170" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

const draw = (items: Item[]) => items.map(drawItem);
const Lift = ({ n, children }: { n: 1 | 2 | 3; children: ReactNode }) => <g className={`pc-${n}`}>{children}</g>;

/** The library: a shelf of spines, one leaning, a guide lying open. */
const SPINES: [number, number, number, string, string][] = [
  [52, 24, 98, "a", "c"],
  [78, 16, 78, "b", "c"],
  [96, 30, 112, "c", "a"],
  [128, 14, 88, "a", "c"],
  [144, 22, 70, "b", "a"],
];

export function GuidesCover() {
  return (
    <Poster>
      <Lift n={1}>
        {SPINES.map(([x, w, h, c, band]) => (
          <g key={x}>
            <rect className={c} x={x} y={150 - h} width={w} height={h} />
            <rect className={band} x={x} y={150 - h + 12} width={w} height={5} />
            <rect className={band} x={x} y={150 - 20} width={w} height={3} />
          </g>
        ))}
      </Lift>
      <Lift n={2}>
        <g transform="rotate(-13 190 150)">
          <rect className="a" x={170} y={54} width={20} height={96} />
          <rect className="c" x={170} y={68} width={20} height={5} />
        </g>
      </Lift>
      <Lift n={3}>{draw([["book", 262, 104, 2.5, -4, "a", "c"], ["disc", 318, 44, 0.8, 0, "c"], ["star", 318, 44, 0.44, 0, "i"], ["sparkle", 222, 42, 0.6, 0, "b"]])}</Lift>
      <rect className="c" x={24} y={150} width={312} height={6} />
    </Poster>
  );
}

function Card({ x, y, r, scheme, id, kind }: { x: number; y: number; r: number; scheme: number; id: string; kind: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <g className={`nl-ta is-s${scheme}`}>
        <rect className="sh" x={-32} y={-41} width={72} height={92} />
        <rect className="bg" x={-36} y={-46} width={72} height={92} />
        <g transform="translate(-34 -44) scale(0.68)">
          <Motif side="landlord" id={id} kind={kind} />
        </g>
        <rect className="a" x={-28} y={32} width={26} height={4} />
      </g>
    </g>
  );
}

/** The tour: a screen, an email and a job in the OS, joined by the route between them. */
export function SystemsCover() {
  return (
    <Poster>
      <path className="sa" d="M40 132 C 90 150, 120 60, 180 86 S 270 150, 326 60" fill="none" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
      <Lift n={1}>
        <Card x={86} y={92} r={-8} scheme={0} id="file-managed" kind="page" />
      </Lift>
      <Lift n={3}>
        <Card x={180} y={80} r={3} scheme={1} id="terms-to-sign" kind="email" />
      </Lift>
      <Lift n={2}>
        <Card x={274} y={92} r={9} scheme={4} id="kind:process" kind="process" />
      </Lift>
    </Poster>
  );
}

const JOURNEY: Record<"landlord" | "tenant" | "agent", [Item[], Item[], Item[]]> = {
  landlord: [
    [["house", 150, 94, 3.3, 0, "a", "k"]],
    [["key", 246, 118, 1.9, -24, "c", "a"]],
    [["disc", 262, 46, 0.95, 0, "c"], ["pound", 262, 46, 0.52, 0, "i", "c"], ["sparkle", 62, 50, 0.6, 0, "b"]],
  ],
  tenant: [
    [["door", 138, 92, 3.1, 0, "a", "k"]],
    [["passport", 236, 104, 1.9, 10, "b", "k"]],
    [["disc", 282, 46, 0.95, 0, "c"], ["key", 282, 46, 0.5, -30, "i", "c"], ["sparkle", 58, 56, 0.6, 0, "b"]],
  ],
  agent: [
    [["cal", 128, 94, 2.9, -5, "a", "k"]],
    [["phone", 226, 98, 2.3, 8, "b", "k"]],
    [["bubble", 282, 50, 1.25, 0, "c", "i"], ["sparkle", 52, 52, 0.6, 0, "b"]],
  ],
};

export function JourneyCover({ id }: { id: "landlord" | "tenant" | "agent" }) {
  const [a, b, c] = JOURNEY[id];
  return (
    <Poster>
      <Lift n={1}>{draw(a)}</Lift>
      <Lift n={2}>{draw(b)}</Lift>
      <Lift n={3}>{draw(c)}</Lift>
    </Poster>
  );
}

/** The TLE line mark: type only, over a thin rule. */
export function TleMark() {
  return (
    <span className="nl-lr-mark">
      <b>TLE</b>
      <i />
    </span>
  );
}
