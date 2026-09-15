"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SWIPE TO READ ON: the foot of the deck on a phone, as a control rather than
 * a hint.
 *
 * James, 15 Sep 2026, from a "Swipe To Pay" reference: the same idea REVERSED.
 * The knob starts on the RIGHT and is dragged LEFT, because that is the
 * direction the deck itself moves - a landlord pushing the page away to the
 * left is doing to the bar exactly what they do to the slide. A left-to-right
 * control on a right-to-left deck would teach the wrong gesture.
 *
 * The fill travels with the thumb and changes colour as it goes, pink at rest
 * to green at the end, so the bar answers "am I nearly there" without a number
 * on it.
 *
 * ── It is a button as well as a track ──────────────────────────────────────
 *
 * Every drag control needs a way through for somebody who cannot drag - a
 * switch user, a keyboard, a shaky hand on a moving train. Tap or press Enter
 * and it completes on its own. The drag is the nicer way, never the only way.
 */

/** Pink at rest, green at the end. Mixed in JS so it moves with the thumb. */
const FROM = [207, 160, 150]; // #cfa096, the deck's clay
const TO = [110, 132, 89]; //   #6e8459, the sage taken to something readable
const mix = (t: number) =>
  `rgb(${FROM.map((c, i) => Math.round(c + (TO[i] - c) * t)).join(", ")})`;

/** How far across before letting go counts as "yes". */
const DONE_AT = 0.72;

export default function SwipeToRead({
  label = "Swipe to read on",
  onDone,
}: {
  label?: string;
  onDone: () => void;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  /** 0 at rest on the right, 1 all the way left. */
  const [t, setT] = useState(0);
  /**
   * A REF, not state, for "is a finger down".
   *
   * pointerdown and the first pointermove can land in the same tick, and a
   * state flag set in the first is still false when the second reads it - so
   * the opening movement of the swipe gets dropped. A ref is true immediately;
   * `cursor` exists only to change the cursor, which can wait a frame.
   */
  const drag = useRef(false);
  const [cursor, setCursor] = useState(false);
  const [went, setWent] = useState(false);
  const still = useRef(false);

  useEffect(() => {
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  /* The distance the knob can travel: the track, less its own width and the
     2px of inset either side that keeps it off the edge. */
  const travel = useCallback(() => {
    const el = track.current;
    return el ? Math.max(1, el.clientWidth - 52 - 4) : 1;
  }, []);

  const finish = useCallback(() => {
    if (went) return;
    setWent(true);
    setT(1);
    /* Let the bar arrive before the page moves under it. */
    window.setTimeout(onDone, still.current ? 0 : 180);
  }, [onDone, went]);

  const onDown = (e: React.PointerEvent) => {
    if (went) return;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* Capture is a nicety - the drag still tracks without it. */
    }
    drag.current = true;
    setCursor(true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || went) return;
    const el = track.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    /* Measured from the RIGHT edge: the knob starts there and comes left. */
    const from = box.right - 26 - 2;
    setT(Math.max(0, Math.min(1, (from - e.clientX) / travel())));
  };

  const onUp = () => {
    if (!drag.current) return;
    drag.current = false;
    setCursor(false);
    if (t >= DONE_AT) finish();
    else setT(0);
  };

  /* Nudged left and back while it waits, so the eye finds it and it teaches
     the direction at the same time. NOT the up-and-down James pictured: the
     knob is 50px in a 54px track, so there are two pixels of vertical room and
     a bob would be invisible. Sideways is the room there is, and it points the
     way. It stops the moment a finger lands. */
  const resting = !cursor && !went && t === 0;

  const ease = cursor || still.current ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), width 260ms cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div
      ref={track}
      className="relative mb-6 h-[54px] w-full select-none overflow-hidden rounded-full"
      style={{ background: "var(--p-tint, #fdefec)", touchAction: "pan-y" }}
    >
      <style>{`
        @keyframes tle-nudge {
          0%, 62%, 100% { transform: translateX(0) }
          74%           { transform: translateX(-11px) }
          86%           { transform: translateX(-3px) }
        }
        .tle-nudge { animation: tle-nudge 2600ms cubic-bezier(0.4, 0, 0.2, 1) infinite }
        @media (prefers-reduced-motion: reduce) { .tle-nudge { animation: none } }
      `}</style>
      {/* THE FILL, anchored right, growing left behind the thumb. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 rounded-full"
        style={{ width: `calc(52px + ${t} * (100% - 52px))`, background: mix(t), transition: ease }}
      />

      {/* The words sit under the thumb and fade as it covers them. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center pr-[56px] text-[14px] font-semibold"
        style={{ color: "#56423e", opacity: Math.max(0, 1 - t * 1.8), transition: ease }}
      >
        {label}
      </span>

      {/* THE THUMB. A button too, so a tap or Enter does the same job. */}
      <button
        type="button"
        aria-label={label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => !drag.current && finish()}
        className={`absolute top-[2px] flex h-[50px] w-[50px] cursor-grab items-center justify-center rounded-full bg-white shadow-[0_6px_16px_-6px_rgba(40,25,20,0.55)] active:cursor-grabbing ${resting ? "tle-nudge" : ""}`}
        style={{ right: 2, transform: `translateX(${-t * travel()}px)`, transition: ease, touchAction: "none" }}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" style={{ color: mix(t) }}>
          <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
