"use client";

import { useEffect, useRef, useState } from "react";
import { useNewLook } from "@/lib/use-new-look";
import SteveOrb from "@/components/SteveOrb";

/**
 * Steve in the new look (Claude Design, 23 Oct 2026): a round coral sprite
 * with a leafy tuft, big white eyes and two floating hands, hovering over a
 * soft shadow. Drawn on a 48-unit grid, styled from app/new-look.css (.steve-*).
 *
 * Six faces: idle, happy (eyes close into smiles, a hop, a wave), thinking
 * (eyes up, a hand to his chin, a typing bubble), surprised, wink and sleepy.
 * Leave `mood` unset and he picks one by the time of day, smiles when the
 * pointer is over him and winks now and then. `track` makes his pupils follow
 * the pointer - once per screen at most.
 *
 * Faces, never emojis (house rule). All motion stops under reduced motion.
 */

export type SteveMood = "idle" | "happy" | "thinking" | "surprised" | "wink" | "sleepy";

function moodByTime(): SteveMood {
  const hr = new Date().getHours();
  return hr >= 21 || hr < 6 ? "sleepy" : hr < 12 ? "happy" : "idle";
}

const EYES: [number, number][] = [
  [19.4, 23.2],
  [28.6, 23.8],
];

function Arc({ c, up }: { c: [number, number]; up: boolean }) {
  return <path d={`M${c[0] - 2.8} ${c[1] + (up ? 1.2 : -0.4)}q2.8 ${up ? -3.8 : 2.4} 5.6 0`} className="steve-line" />;
}

export default function SteveFace({
  size = 40,
  mood,
  track = false,
  className = "",
  label = "Steve",
}: {
  size?: number;
  mood?: SteveMood;
  track?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [eye, setEye] = useState<[number, number]>([0, 0]);
  const [hover, setHover] = useState(false);
  const [wink, setWink] = useState(false);
  /* The clock is read after mounting, so the server's hour never disagrees
     with the browser's. */
  const [byTime, setByTime] = useState<SteveMood>("idle");
  useEffect(() => setByTime(moodByTime()), []);

  useEffect(() => {
    if (!track) return;
    const move = (ev: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      const d = Math.max(30, Math.hypot(dx, dy));
      setEye([(dx / d) * 1.8, (dy / d) * 1.4]);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [track]);

  useEffect(() => {
    if (mood) return;
    let off: number | undefined;
    const t = window.setInterval(() => {
      setWink(true);
      off = window.setTimeout(() => setWink(false), 900);
    }, 14000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(off);
    };
  }, [mood]);

  const orb = useNewLook("orb") === true;

  const m: SteveMood = mood ?? (hover ? "happy" : wink ? "wink" : byTime);
  if (orb) return <SteveOrb size={size} mood={mood ?? (byTime === "sleepy" ? "sleepy" : "idle")} className={className} label={label} />;
  const ex: [number, number] = m === "thinking" ? [1.4, -1.6] : m === "surprised" ? [0, 0] : eye;

  const pupils =
    m === "happy" ? (
      EYES.map((c) => <Arc key={c[0]} c={c} up />)
    ) : m === "sleepy" ? (
      EYES.map((c) => <Arc key={c[0]} c={c} up={false} />)
    ) : m === "wink" ? (
      <>
        <circle cx={EYES[0][0] + ex[0]} cy={EYES[0][1] + ex[1]} r={2.3} className="steve-pupil" />
        <Arc c={EYES[1]} up />
      </>
    ) : (
      EYES.map((c) => (
        <g key={c[0]} className="steve-blink">
          <circle cx={c[0] + ex[0]} cy={c[1] + ex[1]} r={m === "surprised" ? 1.5 : 2.3} className="steve-pupil" />
          <circle cx={c[0] + ex[0] + 0.8} cy={c[1] + ex[1] - 0.8} r={0.6} className="steve-glint" />
        </g>
      ))
    );

  return (
    <span
      ref={ref}
      className={`steve steve--${m} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
        <ellipse cx={24} cy={45} rx={9} ry={1.6} className="steve-shadow" />
        <g className="steve-float">
          <ellipse cx={4.6} cy={25} rx={2.9} ry={3.6} className="steve-hand l" />
          <ellipse cx={43.4} cy={25} rx={2.9} ry={3.6} className="steve-hand r" />
          <g className="steve-body">
            <path d="M23.4 13.6q-2.6-6.6 2.8-9.6q2.4-1.1 2.6.9q.2 3.4-2.4 6.6q3.6-3.4 7-2.2q1.6.7.3 2.1q-2.8 2.6-7.6 3.2z" className="steve-tuft" />
            <ellipse cx={24} cy={26.6} rx={14.6} ry={13} className="steve-shade" />
            <ellipse cx={24} cy={25.2} rx={14.6} ry={11.8} className="steve-skin" />
            {(m === "happy" || m === "wink") && (
              <>
                <ellipse cx={13.8} cy={29.4} rx={2.2} ry={1.2} className="steve-cheek" />
                <ellipse cx={34.2} cy={29.8} rx={2.2} ry={1.2} className="steve-cheek" />
              </>
            )}
            <circle cx={EYES[0][0]} cy={EYES[0][1]} r={5.4} className="steve-white" />
            <circle cx={EYES[1][0]} cy={EYES[1][1]} r={5.4} className="steve-white" />
            {pupils}
            {m === "surprised" && <ellipse cx={24.4} cy={32.4} rx={1.4} ry={1.7} className="steve-pupil" />}
            {m === "thinking" && <path d="M22.4 32.6h4" className="steve-line thin" />}
          </g>
        </g>
      </svg>
      {m === "sleepy" && (
        <span className="steve-z" aria-hidden>
          <i>z</i>
          <i>z</i>
        </span>
      )}
      {m === "thinking" && (
        <span className="steve-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
