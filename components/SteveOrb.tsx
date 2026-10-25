"use client";

import { useEffect, useRef, useState } from "react";
import type { SteveMood } from "@/components/SteveFace";

/**
 * Steve as an orb (25 Oct 2026, James: "a bit of a ball ... almost like a
 * Jarvis kind of thing that moves and pulses", then "more like it's an AI
 * that's in the corner"). A soft glowing bubble of lilac, violet, blue and
 * pink, always moving inside, with two white pill eyes that blink, bounce
 * while he thinks and squint when he's pleased. Behind the "orb" switch;
 * SteveFace draws this in his place.
 *
 * How it answers:
 *  - mood: thinking spins it up, sleepy slows and dims it, happy brightens
 *    it, surprised pops it. Speed changes ease in (playbackRate), never jump.
 *  - typing: every keystroke in a box marked data-steve-chat gives a small
 *    pulse, so it breathes with what's typed.
 *  - a press: it squashes, wobbles out of round and settles.
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

/* The swirl inside speeds up and slows down; the eyes keep their own time. */
function swirls(a: Animation) {
  const name = (a as CSSAnimation).animationName ?? "";
  return name.startsWith("sorb-") && !/blink|look|think/.test(name);
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
}: {
  size?: number;
  mood?: SteveMood;
  className?: string;
  label?: string;
  level?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const ball = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);

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
          [{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.07)", filter: "brightness(1.12)" }, { transform: "scale(1)", filter: "brightness(1)" }],
          { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }),
    [],
  );

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
      className={`sorb sorb--${mood} ${hover ? "is-hover" : ""} ${className}`}
      style={{ width: size, height: size, ["--s" as string]: `${size}px`, ...(swell ? { transform: `scale(${swell})`, transition: "transform 90ms linear" } : {}) }}
      role="img"
      aria-label={label}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={poke}
    >
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
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
