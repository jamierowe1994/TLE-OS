"use client";

import { useEffect, useRef, useState } from "react";
import type { SteveMood } from "@/components/SteveFace";
import { steveSeason, type SteveSeason } from "@/lib/steve-season";

/**
 * Steve as an orb (25 Oct 2026, James: "a bit of a ball ... almost like a
 * Jarvis kind of thing that moves and pulses", then "more like it's an AI
 * that's in the corner"). A soft glowing coral bubble,
 * always moving inside, with two white pill eyes that blink, bounce
 * while he thinks and squint when he's pleased. Behind the "orb" switch;
 * SteveFace draws this in his place.
 *
 * How it answers:
 *  - mood: thinking spins it up, sleepy slows and dims it, happy brightens
 *    it, surprised pops it. Speed changes ease in (playbackRate), never jump.
 *  - typing: every keystroke in a box marked data-steve-chat gives a small
 *    pulse, so it breathes with what's typed.
 *  - a press: it squashes, wobbles out of round and settles.
 *  - the pointer: arriving over him gives a bounce and opens his eyes (in
 *    the corner he rests with them closed, out of the way). `track` makes
 *    the eyes follow the pointer round the screen whenever they're open.
 *  - thinking: the edge waves like liquid as well as the eyes bouncing.
 *  - `level` (0-1), when set, swells it with a voice - ready for him speaking.
 *
 * Plain CSS (app/new-look/steve-orb.css), no WebGL, so a page can carry a
 * dozen of them. Under reduced motion it holds still.
 */

const SPEED: Record<SteveMood, number> = { idle: 1, happy: 1.15, wink: 1.15, surprised: 1.6, thinking: 2.6, sleepy: 0.45 };

/* One keystroke listener for the whole page, however many orbs are drawn. */
const typists = new Set<() => void>();
let listening = false;
function onType(fn: () => void) {
  typists.add(fn);
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener(
      "input",
      (e) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.("[data-steve-chat]")) typists.forEach((f) => f());
      },
      true,
    );
  }
  return () => {
    typists.delete(fn);
  };
}

/* One pointer listener for the whole page, for every orb whose eyes follow it. */
const watchers = new Set<(x: number, y: number) => void>();
let watching = false;
function onPointer(fn: (x: number, y: number) => void) {
  watchers.add(fn);
  if (!watching && typeof window !== "undefined") {
    watching = true;
    window.addEventListener("pointermove", (e) => watchers.forEach((f) => f(e.clientX, e.clientY)), { passive: true });
  }
  return () => {
    watchers.delete(fn);
  };
}

/* The swirl inside speeds up and slows down; the eyes, the breathing and the
   edge keep their own time. */
function swirls(a: Animation) {
  const name = (a as CSSAnimation).animationName ?? "";
  return name === "sorb-orbit" || name === "sorb-swell";
}

function still() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function SteveOrb({
  size = 40,
  mood = "idle",
  className = "",
  label = "Steve",
  level,
  track = false,
}: {
  size?: number;
  mood?: SteveMood;
  className?: string;
  label?: string;
  level?: number;
  track?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const ball = useRef<HTMLSpanElement>(null);
  const gaze = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  /* His costume for the time of year, read once in the browser (lib/steve-season). */
  const [season, setSeason] = useState<SteveSeason>(null);
  useEffect(() => setSeason(steveSeason()), []);
  const halloween = season === "halloween";

  /* The swirl's speed follows the mood (and the pointer), eased. */
  useEffect(() => {
    const el = ball.current;
    if (!el || still()) return;
    const rate = SPEED[mood] * (hover && mood !== "thinking" ? 1.35 : 1);
    el.getAnimations({ subtree: true }).forEach((a) => {
      if (swirls(a)) a.updatePlaybackRate(rate);
    });
  }, [mood, hover]);

  /* A pulse per keystroke in the chat. */
  useEffect(
    () =>
      onType(() => {
        if (still()) return;
        ref.current?.animate(
          [{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.09)", filter: "brightness(1.12)" }, { transform: "scale(0.98)" }, { transform: "scale(1)", filter: "brightness(1)" }],
          { duration: 340, easing: "cubic-bezier(.3,1.4,.5,1)" },
        );
      }),
    [],
  );

  /* The eyes follow the pointer: straight at it, up to a little way off centre. */
  useEffect(() => {
    if (!track) return;
    return onPointer((x, y) => {
      const r = ref.current?.getBoundingClientRect();
      const g = gaze.current;
      if (!r || !g) return;
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const d = Math.max(r.width * 1.5, Math.hypot(dx, dy));
      g.style.transform = `translate(${((dx / d) * r.width * 0.09).toFixed(2)}px, ${((dy / d) * r.width * 0.07).toFixed(2)}px)`;
    });
  }, [track]);

  /* Arriving under the pointer: a bounce. */
  const arrive = () => {
    setHover(true);
    if (still()) return;
    ball.current?.animate(
      [{ transform: "scale(1) translateY(0)" }, { transform: "scale(1.12) translateY(-6%)" }, { transform: "scale(0.97) translateY(1%)" }, { transform: "scale(1.03) translateY(-1%)" }, { transform: "scale(1) translateY(0)" }],
      { duration: 650, easing: "cubic-bezier(.3,1.5,.5,1)" },
    );
  };

  /* Surprised: one pop as it arrives. */
  useEffect(() => {
    if (mood !== "surprised" || still()) return;
    ref.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(0.96)" }, { transform: "scale(1)" }], { duration: 520, easing: "ease-out" });
  }, [mood]);

  /* A press: squash, wobble out of round, settle back. */
  const poke = () => {
    if (still()) return;
    ball.current?.animate(
      [
        { borderRadius: "50%", transform: "scale(1, 1) rotate(0deg)" },
        { borderRadius: "54% 46% 50% 50% / 46% 54% 46% 54%", transform: "scale(1.12, 0.86) rotate(-4deg)" },
        { borderRadius: "44% 56% 58% 42% / 56% 42% 58% 44%", transform: "scale(0.9, 1.1) rotate(5deg)" },
        { borderRadius: "52% 48% 45% 55% / 48% 55% 45% 52%", transform: "scale(1.05, 0.96) rotate(-2deg)" },
        { borderRadius: "50%", transform: "scale(1, 1) rotate(0deg)" },
      ],
      { duration: 900, easing: "cubic-bezier(.3,1.4,.5,1)" },
    );
    ball.current?.getAnimations({ subtree: true }).forEach((a) => {
      if (!swirls(a)) return;
      a.updatePlaybackRate(4);
      window.setTimeout(() => a.updatePlaybackRate(SPEED[mood]), 700);
    });
  };

  const swell = level == null ? undefined : 1 + Math.max(0, Math.min(1, level)) * 0.12;

  return (
    <span
      ref={ref}
      className={`sorb sorb--${mood}${hover ? " is-hover" : ""}${track ? " is-tracking" : ""}${halloween ? " is-halloween" : ""} ${className}`}
      style={{ width: size, height: size, ["--s" as string]: `${size}px`, ...(swell ? { transform: `scale(${swell})`, transition: "transform 90ms linear" } : {}) }}
      role="img"
      aria-label={label}
      onPointerEnter={arrive}
      onPointerLeave={() => setHover(false)}
      onPointerDown={poke}
    >
      {/* Halloween: a vampire's cape, high collar behind his head, swaying. */}
      {halloween && size >= 40 && (
        <svg className="sorb-cape" viewBox="0 0 100 100" aria-hidden>
          <path className="sorb-cape-out" d="M50 40 L17 3 L14 36 C8 56 4 78 2 98 L26 92 L50 98 L74 92 L98 98 C96 78 92 56 86 36 L83 3 Z" />
          <path className="sorb-cape-in" d="M50 44 L21 12 L19 38 C14 56 11 74 10 90 L28 86 L50 90 L72 86 L90 90 C89 74 86 56 81 38 L79 12 Z" />
        </svg>
      )}
      <span ref={ball} className="sorb-ball">
        <span className="sorb-o o1"><i /></span>
        <span className="sorb-o o2"><i /></span>
        <span className="sorb-o o3"><i /></span>
        <span className="sorb-o o4"><i /></span>
        <span className="sorb-o o5"><i /></span>
        <span className="sorb-grain" />
      </span>
      {size >= 22 && (
        <span className="sorb-eyes" aria-hidden>
          <span ref={gaze} className="sorb-gaze">
            <i />
            <i />
            {halloween && size >= 28 && (
              <b className="sorb-fangs">
                <em />
                <em />
              </b>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
