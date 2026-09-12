"use client";

import { useEffect, useRef, useState } from "react";
import PassportBook, { CARD_H, CARD_W, COVER, PassportBack, type PassportFocus } from "@/components/PassportBook";
import type { PassportData } from "@/lib/passport-shape";

/**
 * The passport, standing on the desk, and in your hand.
 *
 * Drawn here rather than pinned onto a photograph (that was 12 Sep 2026's
 * first cut, and a card a few pixels off the printed one reads as a
 * sticker). A warm disc behind, the card leaning back and turned a little
 * away, a brown edge for thickness, the shadow it throws.
 *
 * ── You can grab it ───────────────────────────────────────────────────────
 *
 * James: "you can grab the passport and flip it and spin it around ... and
 * then you can see the back of it." Drag sideways and it turns with the
 * pointer; let go and it settles on whichever face is nearer. A tap turns
 * it over. The form also turns it for you: page one writes on the front,
 * every later page writes on the back, so the card is always showing the
 * face being filled in.
 */

/* The lean, in the spirit of the reference: top edge running up to the
   right, the card turned slightly away from the viewer. */
const TILT_X = 9;
const TILT_Z = -3;
const REST_Y = -16;

type Side = "front" | "back";

function useScale(ref: React.RefObject<HTMLDivElement | null>, fit: (w: number, h: number) => number) {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(fit(width, height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return scale;
}

/** The two faces on one spindle, turned by `angle` degrees about Y. */
function Faces({ data, focus, scale, angle, lean, dragging }: { data: PassportData; focus: PassportFocus; scale: number; angle: number; lean: boolean; dragging: boolean }) {
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const r = 26 * scale;
  /* Thickness: two hard shadows in the cover's brown, stepping away to the
     right and down. They are part of the face, so they turn with it. */
  const edge = `${2 * scale}px ${2 * scale}px 0 ${COVER}, ${4 * scale}px ${4 * scale}px 0 ${COVER}cc, ${6 * scale}px ${6 * scale}px 0 ${COVER}99`;
  const face = (side: Side) => ({
    position: "absolute" as const,
    inset: 0,
    borderRadius: r,
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    transform: side === "back" ? "rotateY(180deg)" : "none",
    boxShadow: edge,
  });
  return (
    <div
      style={{
        width: w,
        height: h,
        transformStyle: "preserve-3d",
        /* The turn itself. Nothing on the way from one face to the other
           should snap: a long, soft ease, and none at all while a finger is
           on it. */
        transition: dragging ? "none" : "transform 1100ms cubic-bezier(0.25, 0.9, 0.3, 1)",
        willChange: "transform",
        transform: lean
          ? `perspective(2200px) rotateX(${TILT_X}deg) rotateY(${REST_Y + angle}deg) rotateZ(${TILT_Z}deg)`
          : `perspective(2200px) rotateY(${angle}deg)`,
      }}
    >
      <div style={face("front")}>
        <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <PassportBook data={data} focus={focus} />
        </div>
      </div>
      <div style={face("back")}>
        <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <PassportBack data={data} />
        </div>
      </div>
    </div>
  );
}

/**
 * The spindle: an angle, a drag that moves it, and a rest that snaps it to
 * the nearest face. `side` from the form turns it too.
 */
function useSpin(side: Side) {
  const [angle, setAngle] = useState(side === "back" ? 180 : 0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);

  useEffect(() => {
    /* Turn to the requested face by the shortest way from wherever it is. */
    setAngle((a) => {
      const target = side === "back" ? 180 : 0;
      const turns = Math.round((a - target) / 360);
      return target + turns * 360;
    });
  }, [side]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: angle, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    setAngle(drag.current.start + dx * 0.55);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const { moved, start } = drag.current;
    drag.current = null;
    setDragging(false);
    /* A tap turns it over; a drag settles on the nearer face. */
    setAngle((a) => (moved ? Math.round(a / 180) * 180 : start + 180));
  };
  const flip = () => setAngle((a) => Math.round(a / 180) * 180 + 180);

  return { angle, dragging, flip, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

const grab = (dragging: boolean) => ({
  cursor: dragging ? "grabbing" : "grab",
  touchAction: "pan-y" as const,
  userSelect: "none" as const,
  WebkitUserSelect: "none" as const,
});

export default function PassportScene({ data, focus, side }: { data: PassportData; focus: PassportFocus; side: Side }) {
  const box = useRef<HTMLDivElement>(null);
  const scale = useScale(box, (w, h) => Math.min((w * 0.84) / CARD_W, (h * 0.62) / CARD_H));
  const { angle, dragging, flip, handlers } = useSpin(side);
  const h = CARD_H * scale;
  const showing: Side = ((Math.round(angle / 180) % 2) + 2) % 2 === 0 ? "front" : "back";

  return (
    <div ref={box} className="relative h-full w-full">
      {/* The backdrop: a soft disc of the desk's light behind the card. Sized
          to the column, so it is a disc at every width and never a clipped one. */}
      <div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: `min(92%, ${h * 2.1}px)`,
          aspectRatio: "1 / 1",
          left: "50%",
          top: "46%",
          transform: "translate(-46%, -50%)",
          background: "radial-gradient(closest-side, #f6e4dc 0%, #f1d9ce 70%, rgba(241,217,206,0) 100%)",
        }}
      />

      {scale > 0 && (
        <>
          {/* The shadow it throws on the desk. Outside the spindle, so it
              stays on the desk while the card turns. */}
          <div
            aria-hidden
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: CARD_W * scale,
              height: CARD_H * scale,
              transform: "translate(-48%, -50%) rotateZ(-3deg)",
              borderRadius: 60 * scale,
              background: "rgba(70,45,40,0.26)",
              filter: `blur(${Math.max(20, 30 * scale)}px)`,
            }}
          />
          <div
            className="absolute"
            style={{ left: "50%", top: "50%", transform: "translate(-50%, -56%)", ...grab(dragging) }}
            {...handlers}
          >
            <Faces data={data} focus={focus} scale={scale} angle={angle} lean dragging={dragging} />
          </div>
          <button
            type="button"
            onClick={flip}
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-[12.5px] font-medium backdrop-blur transition-colors hover:bg-white"
            style={{ bottom: "9%", borderColor: `${COVER}22`, color: COVER }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M17 3v3.5h-3.5M7 21v-3.5h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showing === "front" ? "Turn it over" : "Back to the front"}
            <span className="text-[11.5px] font-normal opacity-60">· or drag it</span>
          </button>
        </>
      )}
    </div>
  );
}

/** The same card, flat, scaled to whatever width it is given. For phones:
 *  a tap turns it over. */
export function PassportFlat({ data, focus, side }: { data: PassportData; focus: PassportFocus; side: Side }) {
  const box = useRef<HTMLDivElement>(null);
  const scale = useScale(box, (w) => w / CARD_W);
  const { angle, dragging, handlers } = useSpin(side);
  return (
    <div ref={box} className="relative w-full" style={{ height: CARD_H * (scale || 0.4), ...grab(dragging) }} {...handlers}>
      {scale > 0 && (
        <Faces data={data} focus={focus} scale={scale} angle={angle} lean={false} dragging={dragging} />
      )}
    </div>
  );
}
