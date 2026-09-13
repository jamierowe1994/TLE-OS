"use client";

import { useEffect, useRef, useState } from "react";
import { CREAM, HAND, INK, Stage, useStage } from "@/components/present-kit";

/**
 * THE ENTRANCE. The cover before slide one, on the appraisal and
 * post-appraisal decks only.
 *
 * James, 13 Sep 2026, from his reference in ~/Desktop/Presentation: "rather
 * than it being just the standard slide, we should utilise the fact that we
 * can create this from scratch". A street, drawn: a terrace down each side,
 * the far end of the road in the middle, the mark and the line in the sky
 * between them, and one sage button. (A handwritten line on the road was
 * tried and James took it out the same morning: "not a big fan".)
 *
 * ── How it arrives ─────────────────────────────────────────────────────────
 *
 * In his order: the RIGHT terrace pops in, then the LEFT, then the far
 * houses come up behind them - and as they do, the words FOLD IN from
 * nowhere, top down, one after another. "Pop" is a short overshoot on the
 * scale, not a bounce; the terraces are big and a real bounce on something
 * that size reads as a fault. The fold is a card turning down to face you
 * (rotateX from edge-on), which is what "from nowhere" needs: there is no
 * direction it slides in from.
 *
 * ── How it leaves ──────────────────────────────────────────────────────────
 *
 * Enter DROPS THEM OFF in the same order they came: right, left, the far
 * houses, then the words - each falling out of the bottom of the frame -
 * and the deck underneath settles from slightly-too-big to true
 * (PresentDeck's landing) as the last of them goes. James, 13 Sep: "the
 * properties should drop off: the right-hand side, left-hand side,
 * background, and words. They enter the screen." This replaced a fly-in
 * zoom, which he asked for first and then reworked.
 *
 * Under prefers-reduced-motion none of this moves: the scene appears, and
 * Enter is a plain fade.
 *
 * ── Where the street stands ────────────────────────────────────────────────
 *
 * NOT on the stage. The stage is 1440x900 scaled to fit, so on a 16:9 screen
 * it is letterboxed and the terraces stopped a hundred pixels short of the
 * edges - James, 13 Sep: "a load of white borders around the outside". The
 * words stay on the stage (they need to frame the same everywhere); the
 * street is anchored to the viewport itself, so it always reaches the
 * corners and the whole scene scales as one piece.
 *
 * TALLER THAN THE SCREEN, and pushed out past its sides. The drawings are
 * cut by their own canvas - the trees and chimneys run off the top, and the
 * end house off the outer side - and at any size where that edge is on
 * screen it shows as a flat line through the sky. James, 13 Sep: "I do not
 * want any image getting cropped because it just looks really bad." So the
 * canvas edges are hidden BEHIND the screen's: each terrace is 114vh tall
 * with its top above the window and its outer side past the edge - 10vw on
 * the right, 13.3vw on the left (see the note on the left terrace). What
 * the window cuts off is road and pavement at the foot, which is what he
 * asked for - "hide that behind the edges of the screen".
 *
 * A 39vw-wide version was tried first, to keep the inner trees clear of the
 * centre column. It left a band of sky above the chimneys on 16:10 with the
 * canvas edge visible across it, which is the thing above. The centre
 * column is tightened upward instead.
 *
 * THE HORIZON. The two roads run off their own drawings at different
 * heights - the right at 88% of its height, the left at 84% (measured off
 * the alpha) - so bottom-aligned they finished at different heights and
 * "the roads feel like they're at different heights". At 114vh the right
 * road's end sits 13.2vh above the drawing's foot and the left's 18.6vh, so
 * the right is dropped 8.2vh and the left 13.6vh: both ends land 5vh up
 * from the foot of the screen, and both tops stay above the window. The
 * far houses stand on that line, and only their middle shows between the
 * two road ends - the rest is behind the terraces, which is what makes them
 * far.
 *
 * ── The artwork ────────────────────────────────────────────────────────────
 *
 * Three files in public/brand/art: entrance-right, entrance-left and
 * entrance-far, each on a transparent ground so they sit on the deck's own
 * cream. The left terrace is its own drawing, not the right one mirrored -
 * James swapped the mirror out the same morning: "the houses are duplicates
 * ... which doesn't sit okay with me". Different houses, different numbers.
 */

/** How long the exit takes, Enter to gone. PresentDeck lands on the same clock. */
export const ENTRANCE_FLY_MS = 1050;

const POP = "cubic-bezier(0.34, 1.25, 0.64, 1)";
const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";
const FALL = "cubic-bezier(0.55, 0, 0.85, 0.25)";
const SAGE_INK = "#56634a";
const CLAY = "#cfa096";

/** When each thing starts to leave, from Enter, in ms - James's order. */
const OUT = { right: 0, left: 140, far: 280, words: 400 };
const OUT_MS = 460;
/** When the words start folding in: as the far houses are coming up. */
const WORDS_IN = 700;

export default function PresentEntrance({
  onFly,
  onDone,
}: {
  /** Enter was pressed: the deck should start landing now, behind the scene. */
  onFly: () => void;
  /** The scene has gone: unmount, and let the first slide rise. */
  onDone: () => void;
}) {
  const { host, fit } = useStage();
  const fx = fit.staged;
  /* in → up: the street builds. up → out: Enter, and everything drops off. */
  const [phase, setPhase] = useState<"in" | "up" | "out">("in");
  const still = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* A frame later, like the deck's own first slide: server and client both
       paint it hidden, then it arrives. */
    const id = requestAnimationFrame(() => setPhase("up"));
    return () => cancelAnimationFrame(id);
  }, []);

  const enter = () => {
    if (phase !== "up") return;
    setPhase("out");
    onFly();
    window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      onDone();
    }, still.current ? 250 : ENTRANCE_FLY_MS);
  };

  /* Enter and Right both go in - Right because that is the deck's own Next,
     and someone with a clicker will press it here too. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const up = phase !== "in";
  const out = phase === "out";
  const noMotion = still.current;

  /**
   * One piece of the street. In: opacity eases out while the transform
   * overshoots (the pop). Out: it falls out of the bottom of the frame on
   * its own delay.
   */
  const layer = (inDelay: number, from: string, outDelay: number, inMs = 720): React.CSSProperties => {
    if (noMotion) return { opacity: up && !out ? 1 : 0, transition: "opacity 200ms ease-out" };
    if (out) return { opacity: 0, transform: "translateY(18vh)", transition: `opacity ${OUT_MS}ms ease-in ${outDelay}ms, transform ${OUT_MS}ms ${FALL} ${outDelay}ms` };
    return { opacity: up ? 1 : 0, transform: up ? "none" : from, transition: `opacity ${inMs}ms ease-out ${inDelay}ms, transform ${inMs}ms ${POP} ${inDelay}ms` };
  };

  /**
   * One line of the words. In: folds down to face you, from edge-on, top
   * first - 90ms apart, the deck's own stagger. Out: drops, after the
   * street, 40ms apart.
   */
  const fold = (i: number): React.CSSProperties => {
    if (noMotion) return { opacity: up && !out ? 1 : 0, transition: "opacity 200ms ease-out" };
    if (out) {
      const d = OUT.words + i * 40;
      return { opacity: 0, transform: "translateY(9vh)", transition: `opacity ${OUT_MS}ms ease-in ${d}ms, transform ${OUT_MS}ms ${FALL} ${d}ms` };
    }
    const d = WORDS_IN + i * 90;
    return {
      opacity: up ? 1 : 0,
      transform: up ? "none" : "perspective(900px) rotateX(-80deg) translateY(28px)",
      transformOrigin: "50% 0%",
      transition: `opacity 480ms ease-out ${d}ms, transform 720ms ${SETTLE} ${d}ms`,
    };
  };

  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;

  const centre = (
    <div className={`relative z-[4] flex flex-col items-center text-center ${fx ? "pt-[44px]" : "px-6 pb-[220px] pt-16"}`}>
      <div style={fold(0)}>
        {/* The pink mark, not the red one the deck's chrome uses - James, 13
            Sep 2026: "change that to the pink". */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className={`w-auto ${fx ? "h-[64px]" : "h-[52px]"}`} />
      </div>
      <div style={fold(1)}>
        {/* Three words. "Longer relationships" was four, and the rule under
            them and the WELCOME eyebrow both went the same morning. */}
        <p className="mt-6 text-[11px] uppercase tracking-[0.3em] text-black/50">People &middot; Homes &middot; Relationships</p>
      </div>
      <div className={fx ? "mt-[72px]" : "mt-12"} style={fold(2)}>
        <h1 className={`leading-[1.0] ${fx ? "text-[76px]" : "text-[44px] sm:text-[60px]"}`} style={HEAD}>
          Let&rsquo;s talk about
          <br />
          <span style={{ color: CLAY }}>your property.</span>
        </h1>
        {/* The stroke under the second line, drawn by hand rather than a rule. */}
        <svg viewBox="0 0 420 14" aria-hidden className={`mx-auto mt-2 h-[14px] ${fx ? "w-[380px]" : "w-[70%]"}`}>
          <path d="M4 10C90 3 200 2 300 5C350 6 390 7 416 9" fill="none" stroke={CLAY} strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        </svg>
      </div>
      <div className={fx ? "mt-9" : "mt-10"} style={fold(3)}>
        <button
          type="button"
          onClick={enter}
          className="group inline-flex h-[64px] items-center gap-3 rounded-full px-12 text-[21px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(86,99,74,0.7)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
          style={{ background: SAGE_INK }}
        >
          Enter
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 transition-transform group-hover:translate-x-1">
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div style={fold(4)}>
        <p className="mt-12 text-[11px] uppercase tracking-[0.3em] text-black/45">A smarter letting experience</p>
      </div>
    </div>
  );

  /* THE STREET, on the viewport. Right first, then left, then the far end
     of the road. Sized in vw so it scales as one piece and always reaches
     the corners - see the note at the top. */
  const street = fx && (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      {/* THE SKY: a pink shape off the top-right corner. It had the three
          flick strokes from James's reference beside it; he took them out on
          13 Sep 2026, the same way he took them out of the transition on 4
          Sep. It leaves with the far houses. */}
      <div className="absolute -right-[4vh] -top-[10vh] h-[62vh] w-[58vh]" style={layer(0, "scale(0.9)", OUT.far, 900)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
          <path d="M40 0L100 0L100 62C98 78 90 88 78 90C60 92 44 84 36 70C26 54 24 30 30 14C32 8 36 3 40 0Z" fill="var(--p-tint)" />
        </svg>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/art/entrance-right.webp" alt="" aria-hidden className="absolute z-[3] h-[114vh] w-auto max-w-none" style={{ ...layer(120, "translateX(3vw) scale(0.94)", OUT.right), right: "-10vw", bottom: "-8.2vh", transformOrigin: "100% 100%" }} />
      {/* The left sits 13.6vh under the edge so its road ends level with the
          right's - and 3.3vw further out than the right, because the drawing
          carries its trees and houses further into the frame: with both at
          10vw the left's content sat 3.3vw nearer the centre than the
          right's (measured on the rendered frame) and the words, which ARE
          centred, looked off-centre. James, 13 Sep: "the properties are
          lopsided". */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/art/entrance-left.webp" alt="" aria-hidden className="absolute z-[3] h-[114vh] w-auto max-w-none" style={{ ...layer(360, "translateX(-3vw) scale(0.94)", OUT.left), left: "-13.3vw", bottom: "-13.6vh", transformOrigin: "0% 100%" }} />
      {/* Centred by the class (Tailwind's `translate`), and ONLY there: the
          inline transform is the pop, and a translateX(-50%) in it as well
          centred the strip twice - it sat 490px left, and its right edge drew
          a hard line down the middle of the road (13 Sep 2026). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/art/entrance-far.webp" alt="" aria-hidden className="absolute bottom-[5vh] left-1/2 z-[2] w-[56vw] max-w-none -translate-x-1/2" style={layer(640, "translateY(2vh)", OUT.far, 800)} />
    </div>
  );

  const scene = fx ? (
    centre
  ) : (
    <>
      {/* A phone gets the argument and the far end of the street. The
          terraces are a screen tall and have nowhere to stand. */}
      {centre}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/art/entrance-far.webp" alt="" aria-hidden className="pointer-events-none absolute bottom-[40px] left-1/2 w-[140%] max-w-none -translate-x-1/2" style={layer(300, "translateY(2vh)", OUT.far, 800)} />
    </>
  );

  return (
    <section
      ref={host}
      aria-label="Welcome"
      className="fixed inset-0 z-40 overflow-hidden"
      style={{
        background: CREAM,
        color: INK,
        /* The ground goes last, once the words have dropped through it. */
        opacity: out ? 0 : 1,
        transition: noMotion ? "opacity 250ms ease-out" : `opacity 320ms ease-in ${ENTRANCE_FLY_MS - 340}ms`,
        pointerEvents: out ? "none" : "auto",
      }}
    >
      {street}
      <Stage fit={fit}>
        <div className="absolute inset-0 z-[2]">{scene}</div>
      </Stage>
    </section>
  );
}
