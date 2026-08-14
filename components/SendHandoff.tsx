"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The beat between pressing send and the email arriving.
 *
 * Sending the pre-appraisal is not one action, it is three: the landlord's own
 * page is minted, the deck's link is folded into the wording, and the email is
 * opened for a read. Done silently, the agent presses a button and a large
 * white box appears over the top of them — which is the jolt James described
 * on the deck's slides, in a different place.
 *
 * So the wait is shown rather than hidden, and it is a REAL wait: this stays
 * up while the page is genuinely being built, and hands over the moment it is
 * ready. The minimum beat exists only so a fast build doesn't flash.
 *
 * ── Why it moves the way it does ────────────────────────────────────────────
 *
 * The words start in the MIDDLE of the screen, not at the top, because that is
 * where eyes already are when a button has just been pressed. Then the block
 * travels down and out of the way, and the email takes the space it left —
 * so the email arrives into somewhere, rather than on top of something.
 *
 * Centred with flexbox and measured in vh, so it is the screen's own middle
 * on a laptop and on a large monitor alike. Nothing here is a fixed pixel
 * offset from the top.
 */
export default function SendHandoff({
  open,
  /** True once the real work behind the wait has finished. */
  ready,
  headline,
  sub,
  onDone,
}: {
  open: boolean;
  ready: boolean;
  headline: string;
  sub?: string;
  onDone: () => void;
}) {
  /** Drives the travel. Off for the first frame so the transition has a from. */
  const [moved, setMoved] = useState(false);
  /** The minimum beat, so a build that takes 200ms doesn't flicker past. */
  const [beat, setBeat] = useState(false);

  useEffect(() => {
    if (!open) {
      setMoved(false);
      setBeat(false);
      return;
    }
    const start = requestAnimationFrame(() => setMoved(true));
    const t = setTimeout(() => setBeat(true), 1900);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (open && beat && ready) onDone();
    // onDone is recreated each render by every caller; depending on it here
    // would fire the handover again on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, beat, ready]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[59] flex flex-col items-center justify-center bg-ink/35 p-6 backdrop-blur-sm">
      <div
        className="handoff-block flex flex-col items-center text-center"
        style={{ transform: moved ? "translateY(30vh)" : "translateY(0)" }}
      >
        {/* The clock is the only thing that keeps moving, so it reads as
            "working" rather than "stuck". */}
        <span className="handoff-tick text-page">
          <DoodleIcon name="clock" size={44} />
        </span>
        <p className="hand mt-5 text-[22px] text-page">{headline}</p>
        {sub && <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-page/75">{sub}</p>}
      </div>

    </div>,
    document.body
  );
}
