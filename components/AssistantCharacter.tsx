"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The assistant: a circle with a face, two jointed arms and a scribbled shadow.
 *
 * ── Arms have an elbow, and a pose per mood ───────────────────────────────
 *
 * James, 28 Aug: "his arms always seem to be doing the same thing… a hand in
 * the air for some reason, which doesn't need to always be a hand in the air…
 * It almost has an elbow, so he can move around a little bit more."
 *
 * Right on both counts. The arms were one fixed shape, so the wave was the only
 * pose he owned and he did it permanently. Each arm is now two segments hinged
 * at shoulder and elbow, and every mood sets four angles. At rest they hang
 * DOWN, which is the pose a person is actually in most of the time.
 *
 * The angles are CSS transforms with a transition, so moving between moods is
 * interpolated for free — he raises and lowers his arm rather than teleporting
 * between poses. That single transition does more for "alive" than any of the
 * keyframes below.
 *
 * ── The bug where the arm came out the other side ─────────────────────────
 *
 * James: "as he bends his arm in, you can see the edge of the arm as the thing
 * comes out of the side."
 *
 * A real defect, not a rough edge. The arms were drawn behind the body and
 * relied on the circle happening to cover their inner ends — so as soon as one
 * rotated far enough, its root swung past the far edge and appeared as a stray
 * stub.
 *
 * Fixed with a mask rather than by nudging coordinates: everything inside the
 * body circle is cut OUT of the arm layer. An arm is now only ever visible
 * where it has genuinely left the body, at any angle, in any pose. Fudging
 * coordinates would have needed re-checking against every pose added later.
 *
 * ── Wash, then grain ──────────────────────────────────────────────────────
 *
 * Two filters, not one. Grain alone is even, and even noise still reads flat.
 * The wash is low-frequency turbulence — big soft blotches — giving the ink an
 * uneven density the way a brush leaves more pigment in some places than
 * others. The grain on top is the paper tooth.
 *
 * ── Restraint ─────────────────────────────────────────────────────────────
 *
 * Idle is a slow hover and an irregular blink, arms down. Everything louder is
 * tied to an event: he waves when there is something worth seeing, wakes with
 * a start when clicked, shrugs when he has no answer.
 */

export type Mood =
  | "idle"
  | "wave"
  | "thinking"
  | "talking"
  | "happy"
  | "sorry"
  | "surprised"
  | "texting"
  | "flex"
  | "asleep";

/* ------------------------------------------------------------- geometry -- */
const BODY = { cx: 60, cy: 54, r: 35.4 };
/* The inked outline, drawn OUTSIDE the disc with a gap. The reference has a
   dark ring with paper showing between it and the fill — the mark of something
   outlined first and filled second, slightly inside its own line. The gap is
   left transparent rather than painted white so the page colour shows through
   and it works on any background. */
const RING = 38.8;

/* No legs, deliberately. Two of the references have them, but he lives at 40px
   in the corner of a screen — legs at that size are two grey specks and a pair
   of dots, and they cost the clean circle silhouette that makes him readable at
   a glance. He hovers instead, and the shadow does the work of saying where the
   ground is.

   James, 28 Aug: "I don't think that we should render legs." */

/**
 * Shoulders sit at the body's MIDDLE, not near its base.
 *
 * James: "his arms need to be higher up. They need to be coming from the middle
 * of his body… they should hang out the side when he's idle."
 *
 * They were low and hanging down, which is right for a person with legs and
 * wrong for a circle — a circle has no hip for an arm to fall past, so a
 * downward arm just buried itself in the silhouette. Out to the side at mid
 * height is both truer to the reference and, crucially, means every raise
 * starts from somewhere already clear of the body.
 *
 * Each segment is a QUADRATIC, not a line. Two straight segments meeting at an
 * angle give a hard V at the elbow however round the caps are; a pair of gentle
 * opposing bows reads as a limb.
 */
const L = { sx: 32, sy: 56, ecx: 24, ecy: 58, ex: 17, ey: 64, hcx: 11, hcy: 69, hx: 6, hy: 72 };
const R = { sx: 88, sy: 56, ecx: 96, ecy: 58, ex: 103, ey: 64, hcx: 109, hcy: 69, hx: 114, hy: 72 };

/**
 * Shoulder and elbow angles per mood, in degrees.
 *
 * Zero is the canonical pose: out to the side, angled slightly down. Because
 * the arms mirror, POSITIVE raises the left and NEGATIVE raises the right.
 */
const POSE: Record<Mood, { ls: number; le: number; rs: number; re: number }> = {
  /* Barely off canonical — out at the sides, which is the reference's rest. */
  idle: { ls: -6, le: 4, rs: 6, re: -4 },
  /* Dropped and slack. */
  asleep: { ls: -34, le: -12, rs: 34, re: 12 },
  /* Left arm right up, elbow open, so the HAND clears the head and is the
     thing you actually see moving. */
  wave: { ls: 88, le: 26, rs: 6, re: -4 },
  /* Up and OUT at a diagonal, not straight up — the reference's celebration is
     a diagonal V, which reads as delight. Vertical arms read as surrender. */
  happy: { ls: 62, le: 30, rs: -62, re: -30 },
  /* Out and up with the elbows dropped: "search me". */
  sorry: { ls: 26, le: -54, rs: -26, re: 54 },
  /* Raised to beside the head and held OUTSIDE the silhouette. A hand-to-chin
     would be inside the circle, where the mask correctly hides it — which is
     why this pose used to lose the arm entirely. */
  thinking: { ls: 62, le: 44, rs: 6, re: -4 },
  /* Both up, for the waking flail. */
  surprised: { ls: 104, le: 18, rs: -104, re: -18 },
  talking: { ls: 18, le: -16, rs: -18, re: 16 },
  /* Brought round to the front and drawn OVER the body — see `front` below. */
  texting: { ls: -46, le: -58, rs: 46, re: 58 },
  /* The double bicep. Upper arms roughly level and out, forearms swung hard up
     and in - the elbow angle is doing all the work, which is what makes it read
     as a flex rather than as a shrug or a cheer.
     Shown while the new-starter tour is pointing at him: James wanted him
     visibly pleased with himself rather than standing there being described. */
  flex: { ls: 24, le: 88, rs: -24, re: -88 },
};

/**
 * An open hand — five fingers fanned from the wrist.
 *
 * Was three strokes, which reads as a fork. The reference's hands are splayed
 * wide, and that openness is a surprising amount of the character's warmth: an
 * open palm is welcoming, a closed or minimal hand is not. It also survives
 * being shrunk, because the silhouette stays a recognisable star rather than
 * collapsing into a smudge.
 */
function Hand({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  /* Fanned around the arm's own direction, so the fingers keep splaying
     outward whatever angle the limb is at. */
  const fingers: Array<[number, number]> = [
    [-3.3, 2.3],
    [-2.1, 4.0],
    [0.1, 4.6],
    [2.2, 4.0],
    [3.5, 2.4],
  ];
  return (
    <g stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" transform={`translate(${x} ${y})`}>
      {fingers.map(([fx, fy], i) => (
        <path key={i} d={`M0 0 l${fx * s} ${fy}`} />
      ))}
    </g>
  );
}

/** One arm: upper and forearm as opposing bows, hinged at shoulder and elbow. */
function Arm({
  a, pose, ease, flip, waveClass, jellyClass,
}: {
  a: typeof L;
  pose: { s: number; e: number };
  ease: string;
  flip?: boolean;
  waveClass?: string;
  jellyClass?: string;
}) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, fill: "none" };
  return (
    <g
      className={waveClass}
      style={{ transform: `rotate(${pose.s}deg)`, transformOrigin: `${a.sx}px ${a.sy}px`, transition: ease }}
    >
      <path d={`M${a.sx} ${a.sy} Q${a.ecx} ${a.ecy} ${a.ex} ${a.ey}`} {...stroke} />
      <g
        className={jellyClass}
        style={{ transform: `rotate(${pose.e}deg)`, transformOrigin: `${a.ex}px ${a.ey}px`, transition: ease }}
      >
        {/* A disc at the joint. Round caps alone still leave a notch on the
            outside of a sharp bend; this fills it at every angle. */}
        <circle cx={a.ex} cy={a.ey} r="0.85" fill="currentColor" />
        <path d={`M${a.ex} ${a.ey} Q${a.hcx} ${a.hcy} ${a.hx} ${a.hy}`} {...stroke} />
        <Hand x={a.hx} y={a.hy} flip={flip} />
      </g>
    </g>
  );
}

/* --------------------------------------------------------------- brows -- */
/* Only on the moods that need them. Brows are the strongest single signal a
   face has — which is exactly why they should stay off most of the time, or
   every expression starts shouting. */
function Brows({ mood }: { mood: Mood }) {
  const w = "var(--panel, #fff)";
  const c = { stroke: w, strokeWidth: 1.7, strokeLinecap: "round" as const, fill: "none" };
  if (mood === "thinking") {
    /* One raised higher than the other — the quizzical asymmetry. */
    return (
      <g {...c}>
        <path d="M46.6 40.4q3.4 -2.2 6.8 -0.4" />
        <path d="M66.8 38.6q3.4 -1.6 6.6 0.8" />
      </g>
    );
  }
  if (mood === "surprised") {
    return (
      <g {...c}>
        <path d="M46.4 38q3.6 -2.4 7.2 0" />
        <path d="M66.4 38q3.6 -2.4 7.2 0" />
      </g>
    );
  }
  if (mood === "sorry") {
    return (
      <g {...c}>
        <path d="M46.6 40.6q3.4 1.4 6.8 -0.6" />
        <path d="M66.6 40q3.4 -2 6.8 -0.6" />
      </g>
    );
  }
  return null;
}

/* ---------------------------------------------------------------- eyes -- */
function Eyes({ mood, blink, dx, dy }: { mood: Mood; blink: boolean; dx: number; dy: number }) {
  const w = "var(--panel, #fff)";
  const lx = 50, rx = 70, y = 48;

  if (blink || mood === "asleep") {
    /* Curving DOWN at the ends, like a lid closing over a ball. A flat line or
       an upward curve both read as a squint. */
    return (
      <g stroke={w} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d={`M${lx - 4} ${y - 0.6} q4 3.6 8 0`} />
        <path d={`M${rx - 4} ${y - 0.6} q4 3.6 8 0`} />
      </g>
    );
  }
  /* Flex borrows the happy arch: eyes squeezed shut with the effort, which is
     the difference between showing off and simply standing with arms raised. */
  if (mood === "happy" || mood === "flex") {
    return (
      <g stroke={w} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d={`M${lx - 3.6} ${y + 1} q3.6 -5 7.2 0`} />
        <path d={`M${rx - 3.6} ${y + 1} q3.6 -5 7.2 0`} />
      </g>
    );
  }
  if (mood === "sorry") {
    return (
      <g fill={w}>
        <ellipse cx={lx} cy={y + 1.2} rx="2.9" ry="3.6" transform={`rotate(-14 ${lx} ${y})`} />
        <ellipse cx={rx} cy={y + 1.2} rx="2.9" ry="3.6" transform={`rotate(14 ${rx} ${y})`} />
      </g>
    );
  }
  /* Lids low, looking down at whatever he's holding. */
  if (mood === "texting") {
    return (
      <g fill={w} transform="translate(0 2)">
        <ellipse cx={lx} cy={y} rx="3.4" ry="3.2" />
        <ellipse cx={rx} cy={y} rx="3.4" ry="3.2" />
      </g>
    );
  }
  const big = mood === "surprised";
  return (
    <g fill={w} transform={`translate(${dx} ${dy})`}>
      <ellipse cx={lx} cy={y} rx={big ? 4.4 : 3.4} ry={big ? 6.1 : 5.2} />
      <ellipse cx={rx} cy={y} rx={big ? 4.4 : 3.4} ry={big ? 6.1 : 5.2} />
    </g>
  );
}

function Mouth({ mood, still }: { mood: Mood; still: boolean }) {
  const w = "var(--panel, #fff)";
  const c = { stroke: w, strokeWidth: 1.9, strokeLinecap: "round" as const, fill: "none" };

  if (mood === "thinking") return <path d="M56 62h8" {...c} />;
  if (mood === "surprised") return <ellipse cx="60" cy="62" rx="2.9" ry="3.6" fill={w} />;
  /* A small open oval — the snore. */
  if (mood === "asleep") return <ellipse cx="59" cy="63" rx="2" ry="2.8" stroke={w} strokeWidth="1.7" fill="none" />;
  if (mood === "sorry") return <path d="M55 62q2.5 -2.2 5 0t5 0" {...c} />;
  if (mood === "texting") return <path d="M57 63h6" {...c} />;
  if (mood === "talking") {
    return (
      <ellipse
        cx="60" cy="62" rx="3.4" ry="2.8" fill={w}
        className={still ? undefined : "nib-talk"}
        style={{ transformOrigin: "60px 62px" }}
      />
    );
  }
  /* Small and gentle at rest. An earlier pass had a long sweeping grin, but the
     references keep it modest — on a shape this big a wide smile tips from
     friendly into manic, and he has to be looked at all day. */
  if (mood === "happy" || mood === "flex")
    return <path d="M53.5 60.5C56 66.5 64 66.5 66.5 60.5" {...c} />;
  return <path d="M55.5 60.8C57.4 64.6 62.6 64.6 64.5 60.8" {...c} />;
}

export default function AssistantCharacter({
  mood = "idle",
  size = 64,
  track = true,
  className = "",
  loop = false,
}: {
  mood?: Mood;
  size?: number;
  track?: boolean;
  className?: string;
  /**
   * Keep the mood's gesture running instead of playing it once.
   *
   * Wave and flex are one-shots everywhere else, which is right: a character
   * who waves at you forever is a character you stop seeing. The exception is
   * the new-starter tour, where the screen is dimmed, everything else is
   * blurred, and he is the only thing being looked at - there a gesture that
   * finishes after two seconds leaves him standing still while somebody is
   * still reading the sentence about him.
   */
  loop?: boolean;
}) {
  /* Filter and mask ids must be unique per instance, or a second character on
     the page silently steals the first one's. */
  const uid = useId().replace(/:/g, "");
  const grainId = `g-${uid}`;
  const washId = `w-${uid}`;
  const brushId = `b-${uid}`;
  const roughId = `r-${uid}`;
  const maskId = `m-${uid}`;
  const softId = `s-${uid}`;

  const svg = useRef<SVGSVGElement | null>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (still || mood === "asleep") return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 110);
          if (Math.random() < 0.25) {
            setTimeout(() => setBlink(true), 230);
            setTimeout(() => setBlink(false), 340);
          }
          next();
        },
        2200 + Math.random() * 3600
      );
    };
    next();
    return () => clearTimeout(t);
  }, [still, mood]);

  useEffect(() => {
    if (!track || still || mood === "thinking" || mood === "asleep" || mood === "texting") return;
    const onMove = (e: PointerEvent) => {
      const el = svg.current;
      if (!el) return;
      const b = el.getBoundingClientRect();
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(d / 220, 1) * 2.6;
      setLook({ x: (dx / d) * reach, y: (dy / d) * reach * 0.75 });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [track, still, mood]);

  const eyeShift =
    mood === "thinking" && !still ? { x: 2.2, y: -2.6 }
    : mood === "asleep" || mood === "texting" ? { x: 0, y: 0 }
    : look;

  const a = (n?: string) => (still ? undefined : n);
  const pose = POSE[mood];
  /* Texting is the one pose drawn in front of the body rather than behind it. */
  const front = mood === "texting";
  /* Asleep he settles right down onto his shadow rather than hovering — with
     no legs, that drop is the only cue left that he has stopped holding
     himself up. */
  const sitting = mood === "asleep";
  /* The interpolation between poses. Slightly springy, so a raised arm settles
     rather than stopping dead. */
  const ease = still ? "none" : "transform 520ms cubic-bezier(.34,1.4,.5,1)";

  const bodyAnim =
    mood === "happy" ? "nib-hop"
    : mood === "surprised" ? "nib-startle"
    /* Two short pumps rather than a hop: a flex is a held pose that tightens,
       and bouncing him would read as another celebration. */
    : mood === "flex" ? (loop ? "nib-flex-loop" : "nib-flex")
    : mood === "wave" ? (loop ? "nib-lean-loop" : "nib-lean")
    : mood === "talking" ? "nib-hover-fast"
    : mood === "asleep" ? "nib-sleep"
    : "nib-hover";
  const shadowAnim =
    mood === "happy" ? "nib-shadow-hop"
    : mood === "talking" ? "nib-shadow-fast"
    : mood === "asleep" ? "nib-shadow-sleep"
    : "nib-shadow";

  return (
    <svg
      ref={svg}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      role="img"
      aria-label={
        mood === "thinking" ? "Steve, thinking"
        : mood === "asleep" ? "Steve, idle"
        : "Steve"
      }
      className={className}
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* FADED PATCHES. Very low frequency and only two octaves, so it makes
            a handful of broad soft areas rather than a texture — the places a
            wash dried thinner. The steep alpha curve keeps most of it at zero
            so the patches are occasional, not all over. */}
        <filter id={washId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="g" />
          <feComponentTransfer in="g" result="t">
            <feFuncA type="linear" slope="1.5" intercept="-0.62" />
          </feComponentTransfer>
          <feComposite in="t" in2="SourceAlpha" operator="in" />
        </filter>

        {/* DRY BRUSH. The frequency is deliberately anisotropic — low across,
            high down — which stretches the noise into horizontal streaks. That
            directionality is the whole difference between "grain" and "a brush
            that was running out of paint". */}
        <filter id={brushId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="3" seed="11" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="g" />
          <feComponentTransfer in="g" result="t">
            <feFuncA type="linear" slope="1.2" intercept="-0.5" />
          </feComponentTransfer>
          <feComposite in="t" in2="SourceAlpha" operator="in" />
        </filter>

        {/* PAPER TOOTH. Fine, even, and the quietest of the four. */}
        <filter id={grainId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1.35" numOctaves="3" stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="g" />
          <feComponentTransfer in="g" result="t">
            <feFuncA type="linear" slope="0.8" intercept="-0.28" />
          </feComponentTransfer>
          <feComposite in="t" in2="SourceAlpha" operator="in" />
        </filter>

        <filter id={roughId} x="-25%" y="-60%" width="150%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Blur, for the shadow the forearms cast on the body while texting. */}
        <filter id={softId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>

        {/* Everything inside the body is cut OUT of the arm layer, so no
            rotation can push an arm's root out the far side. */}
        <mask id={maskId}>
          <rect x="-30" y="-30" width="180" height="180" fill="#fff" />
          <circle cx={BODY.cx} cy={BODY.cy} r={BODY.r - 0.6} fill="#000" />
        </mask>
      </defs>

      <g className={a(shadowAnim)} style={{ transformOrigin: "60px 105px" }}>
        <g filter={`url(#${roughId})`} stroke="currentColor" strokeLinecap="round" fill="none">
          <path d="M34 105q26 3.4 52 0" strokeWidth="1.5" opacity="0.16" />
          <path d="M38 106.6q22 2.6 44 -0.4" strokeWidth="1.2" opacity="0.13" />
          <path d="M43 103.6q17 -2.4 34 0.6" strokeWidth="1.1" opacity="0.11" />
          <path d="M47 105.8q13 1.8 26 -0.6" strokeWidth="1.6" opacity="0.14" />
          <path d="M30 104.4q8 1.2 14 0.8" strokeWidth="1" opacity="0.09" />
          <path d="M78 105.2q9 0.6 14 -1" strokeWidth="1" opacity="0.09" />
        </g>
      </g>

      <g
        className={a(bodyAnim)}
        style={{ transformOrigin: "60px 96px", transform: sitting ? "translateY(9px)" : undefined }}
      >
        {/* ---- arms, behind the body and masked to outside it ----
            Except when texting, where they come round the FRONT. In a flat
            side-on drawing there is no way to show an arm reaching toward the
            viewer, so it is drawn over the body instead — which is how comics
            have always solved it, and it is the only reason the phone reads as
            held rather than floating. */}
        {!front && (
          <g mask={`url(#${maskId})`}>
            <Arm a={L} pose={{ s: pose.ls, e: pose.le }} ease={ease}
                 waveClass={a(mood === "wave" ? "nib-wave" : mood === "surprised" ? "nib-jelly-l" : undefined)}
                 jellyClass={a(mood === "surprised" ? "nib-jelly-f" : undefined)} />
            <Arm a={R} pose={{ s: pose.rs, e: pose.re }} ease={ease} flip
                 waveClass={a(mood === "surprised" ? "nib-jelly-r" : undefined)}
                 jellyClass={a(mood === "surprised" ? "nib-jelly-f" : undefined)} />
          </g>
        )}

        {/* ---- body ----
            James's brief: "a soft washed charcoal texture rather than flat
            black — slightly mottled and uneven, with subtle faded patches,
            dry-brush grain and a matte hand-painted finish. Keep the variation
            very restrained so it still reads as solid black from a distance."

            Four layers, quietest last, and every opacity here is deliberately
            small. The test is the thumbnail: at 40px in the corner it must
            still read as one solid shape. Anything you can consciously SEE at
            that size is too strong. */}
        {/* No vignette. An earlier pass faded the rim, and James called it:
            "it's fairly obvious that it's trying to fade it… theirs is almost
            like a static textured effect rather than anything else."
            
            Exactly right — the reference is EVEN. Its life comes from fine
            all-over noise, not from a gradient, and a soft edge on a shape that
            also has a crisp drawn outline around it just reads as a mistake.
            The texture below is now dense and uniform; the disc's edge is
            simply an edge. */}
        <g>
          <circle cx={BODY.cx} cy={BODY.cy} r={BODY.r} fill="currentColor" />
          {/* 1. Lift — the big one. Pure black is a screen colour; charcoal is
                 a pigment. This is most of what separates the two. */}
          <circle cx={BODY.cx} cy={BODY.cy} r={BODY.r} fill="#fff" opacity="0.15" />
          {/* 2. STATIC. Now the loudest layer, and the one carrying the look —
                 fine, dense and even, right across the disc. */}
          <circle cx={BODY.cx} cy={BODY.cy} r={BODY.r} fill="#fff" opacity="0.17" filter={`url(#${grainId})`} />
          {/* 3. A whisper of unevenness so it is not perfectly regular. Pulled
                 right down from an earlier pass, where it was blotchy enough to
                 read as marks rather than as texture. */}
          <circle cx={BODY.cx} cy={BODY.cy} r={BODY.r} fill="#fff" opacity="0.06" filter={`url(#${washId})`} />
          <circle cx={BODY.cx} cy={BODY.cy} r={BODY.r} fill="#fff" opacity="0.04" filter={`url(#${brushId})`} />
        </g>
        {/* The outline, outside the fill. */}
        <circle cx={BODY.cx} cy={BODY.cy} r={RING} stroke="currentColor" strokeWidth="1.7" fill="none" />

        <Brows mood={mood} />
        <Eyes mood={mood} blink={blink} dx={eyeShift.x} dy={eyeShift.y} />
        <Mouth mood={mood} still={still} />

        {/* Texting: the phone, then the arms over the top of everything, with a
            soft shadow cast onto the body beneath them so they sit IN FRONT
            rather than looking pasted on. */}
        {/* Texting is posed by hand rather than through the rig. The reference
            has one arm looping out from the side and back across the front to
            meet the other on the phone — a shape the two-hinge rig cannot make,
            and not worth contorting the rig to fake. */}
        {front && (
          <g className={a("nib-scroll")} style={{ transformOrigin: "48px 78px" }}>
            {/* Cast onto the body, so the arms sit in front of it rather than
                on it. Without this the whole thing looks like a sticker. */}
            <ellipse cx="50" cy="76" rx="17" ry="13" fill="#000" opacity="0.26" filter={`url(#${softId})`} />
            <path
              d="M27 60c-8 4-9 13-3 17"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none"
            />
            <g transform="rotate(-8 48 78)">
              <rect x="38" y="64" width="19" height="27" rx="3.2" fill="currentColor" />
              <rect x="39.8" y="66" width="15.4" height="21.4" rx="2" fill="var(--panel, #fff)" opacity="0.34" />
              <circle cx="42.4" cy="68.8" r="0.8" fill="var(--panel, #fff)" opacity="0.5" />
              <circle cx="42.4" cy="71.4" r="0.8" fill="var(--panel, #fff)" opacity="0.5" />
            </g>
            <Hand x={38} y={76} />
            <Hand x={58} y={78} flip />
          </g>
        )}
      </g>

      {(mood === "wave" || mood === "happy") && (
        <path
          d="M18 16c0 4.6-1 5.6-5.6 5.6 4.6 0 5.6 1 5.6 5.6 0-4.6 1-5.6 5.6-5.6-4.6 0-5.6-1-5.6-5.6Z"
          fill="var(--accent, #7f1d1d)"
          className={a("nib-sparkle")}
          style={{ transformOrigin: "18px 21.6px" }}
        />
      )}

      {/* Airborne. Streaks under the body sell the height far better than more
          travel does — the reference uses them rather than a bigger jump. */}
      {mood === "happy" && !still && (
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="nib-ticks" opacity="0.55">
          <path d="M52 92q1.4 6 0.6 10" />
          <path d="M60 94q1 6 0.2 10" />
          <path d="M31 76q-3 4.6-3.4 8.6" />
          <path d="M89 76q3 4.6 3.4 8.6" />
        </g>
      )}

      {(mood === "wave" || mood === "surprised") && !still && (
        <g stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="nib-ticks">
          <path d="M104 24l5-3.6M108 31l5.4-1.4" />
          <path d="M24 88l-6 1.6M28 94l-6.4 2" />
        </g>
      )}

      {/* A drawn thought cloud, not three dots. It is the one piece of visual
          shorthand everybody reads instantly, and it gives the pause somewhere
          to live — an empty bubble says "working on it" better than a spinner
          ever has. */}
      {mood === "thinking" && (
        <g className={a("nib-dots")} stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M96 20c-1.6-4.6 3-8 6.4-5.6 1-4.4 7.4-4.6 8.6-0.6 3.8-2 7.6 1.4 6 5 3.4 1.4 3 6.4-0.8 7H98c-3.6-0.6-4.4-4.6-2-5.8Z" />
          <circle cx="92.6" cy="30.4" r="2.1" />
          <circle cx="88.4" cy="35.6" r="1.4" />
        </g>
      )}

      {/* zZZ, small to large going up and away — the way it is always drawn,
          and the size ramp is what gives it direction. */}
      {mood === "asleep" && (
        <g className={a("nib-dots")} fill="currentColor" opacity="0.55" fontWeight="700">
          <text x="88" y="34" fontSize="8">z</text>
          <text x="95" y="26" fontSize="11">Z</text>
          <text x="104" y="16" fontSize="15">Z</text>
        </g>
      )}

      <style>{`
        .nib-hover { animation: nib-hover 3.6s ease-in-out infinite; }
        .nib-hover-fast { animation: nib-hover 1.6s ease-in-out infinite; }
        @keyframes nib-hover {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          50%      { transform: translateY(-4px) scale(0.99, 1.01); }
        }
        .nib-hop { animation: nib-hop 0.9s cubic-bezier(.3,1.2,.5,1); }
        @keyframes nib-hop {
          0%   { transform: translateY(0) scale(1, 1); }
          14%  { transform: translateY(2px) scale(1.09, 0.9); }
          42%  { transform: translateY(-16px) scale(0.94, 1.08); }
          70%  { transform: translateY(0) scale(1.07, 0.93); }
          100% { transform: translateY(0) scale(1, 1); }
        }
        /* The flex: two short squeezes, held. He squashes very slightly wider
           and shorter on each pump rather than leaving the ground - a hop would
           read as another celebration, and this needs to read as effort. */
        .nib-flex { animation: nib-flex 1.15s cubic-bezier(.34,1.4,.5,1) 2; }
        .nib-flex-loop { animation: nib-flex 1.15s cubic-bezier(.34,1.4,.5,1) infinite; }
        .nib-lean-loop { animation: nib-lean 0.62s ease-in-out infinite; }
        @keyframes nib-flex {
          0%   { transform: scale(1, 1) translateY(0); }
          18%  { transform: scale(1.06, 0.95) translateY(1px); }
          34%  { transform: scale(0.99, 1.02) translateY(-2px); }
          52%  { transform: scale(1.05, 0.96) translateY(1px); }
          72%  { transform: scale(1, 1) translateY(0); }
          100% { transform: scale(1, 1) translateY(0); }
        }
        .nib-lean { animation: nib-lean 0.62s ease-in-out 3; }
        @keyframes nib-lean {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          50%      { transform: rotate(-5deg) translateY(-3px); }
        }
        /* Waking: a startle, then a shake of the head to clear it. */
        .nib-startle { animation: nib-startle 1.05s cubic-bezier(.3,1.4,.5,1); }
        @keyframes nib-startle {
          0%   { transform: scale(1,1) translateY(0) rotate(0deg); }
          22%  { transform: scale(1.12,1.12) translateY(-7px) rotate(0deg); }
          45%  { transform: scale(1,1) translateY(0) rotate(-7deg); }
          62%  { transform: rotate(6deg); }
          78%  { transform: rotate(-4deg); }
          90%  { transform: rotate(2deg); }
          100% { transform: rotate(0deg); }
        }
        .nib-sleep { animation: nib-sleep 5s ease-in-out infinite; }
        @keyframes nib-sleep {
          0%, 100% { transform: translateY(1px) scale(1.01, 0.99); }
          50%      { transform: translateY(-1px) scale(0.995, 1.005); }
        }
        .nib-shadow { animation: nib-shadow 3.6s ease-in-out infinite; }
        @keyframes nib-shadow {
          0%, 100% { transform: scaleX(1);    opacity: 1; }
          50%      { transform: scaleX(0.86); opacity: 0.6; }
        }
        .nib-shadow-fast { animation: nib-shadow 1.6s ease-in-out infinite; }
        .nib-shadow-hop { animation: nib-shadow-hop 0.9s cubic-bezier(.3,1.2,.5,1); }
        @keyframes nib-shadow-hop {
          0%   { transform: scaleX(1);    opacity: 1; }
          14%  { transform: scaleX(1.12); opacity: 1; }
          42%  { transform: scaleX(0.6);  opacity: 0.4; }
          70%  { transform: scaleX(1.14); opacity: 1; }
          100% { transform: scaleX(1);    opacity: 1; }
        }
        .nib-shadow-sleep { animation: nib-shadow 5s ease-in-out infinite; }
        /* The wave replaces the pose rotation for its duration, so it swings
           around the raised position rather than from the arm's rest angle. */
        .nib-wave { animation: nib-wave 0.62s ease-in-out 3; }
        @keyframes nib-wave {
          0%, 100% { transform: rotate(88deg); }
          35%      { transform: rotate(108deg); }
          70%      { transform: rotate(70deg); }
        }
        /* Waking: both arms up and flapping, elbows loose. James wanted them
           "jelly-like" — the trick is that the forearm runs at a different
           period from the upper arm, so the joint lags and the whole limb
           whips rather than swinging rigidly. */
        .nib-jelly-l { animation: nib-jelly-l 0.42s ease-in-out 4; }
        @keyframes nib-jelly-l {
          0%, 100% { transform: rotate(104deg); }
          50%      { transform: rotate(84deg); }
        }
        .nib-jelly-r { animation: nib-jelly-r 0.42s ease-in-out 4; }
        @keyframes nib-jelly-r {
          0%, 100% { transform: rotate(-104deg); }
          50%      { transform: rotate(-84deg); }
        }
        .nib-scroll { animation: nib-scroll 2.4s ease-in-out infinite; }
        @keyframes nib-scroll {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-1.4px) rotate(-1.4deg); }
        }
        .nib-jelly-f { animation: nib-jelly-f 0.29s ease-in-out 6; }
        @keyframes nib-jelly-f {
          0%, 100% { transform: rotate(16deg); }
          50%      { transform: rotate(-22deg); }
        }
        .nib-talk { animation: nib-talk 0.34s ease-in-out infinite; }
        @keyframes nib-talk {
          0%, 100% { transform: scaleY(0.55); }
          50%      { transform: scaleY(1.25); }
        }
        .nib-sparkle { animation: nib-sparkle 1.4s ease-in-out infinite; }
        @keyframes nib-sparkle {
          0%, 100% { transform: scale(0.82) rotate(0deg);  opacity: 0.55; }
          50%      { transform: scale(1.1)  rotate(18deg); opacity: 1; }
        }
        .nib-ticks { animation: nib-ticks 0.62s ease-in-out 3; }
        @keyframes nib-ticks { 0%, 100% { opacity: 0; } 40% { opacity: 0.5; } }
        .nib-dots { animation: nib-dots 1.6s ease-in-out infinite; }
        @keyframes nib-dots {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50%      { opacity: 1;   transform: translateY(-2.5px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nib-hover, .nib-hover-fast, .nib-hop, .nib-lean, .nib-startle, .nib-sleep,
          .nib-flex, .nib-flex-loop, .nib-lean-loop,
          .nib-shadow, .nib-shadow-fast, .nib-shadow-hop, .nib-shadow-sleep,
          .nib-wave, .nib-talk, .nib-sparkle, .nib-ticks, .nib-dots,
          .nib-jelly-l, .nib-jelly-r, .nib-jelly-f, .nib-scroll { animation: none; }
        }
      `}</style>
    </svg>
  );
}
