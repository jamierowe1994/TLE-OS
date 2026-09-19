"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RevealCtx, type RevealHold } from "@/lib/reveal";

/**
 * A block that rises into the screen once it has something to show.
 *
 * It renders the element itself rather than wrapping one, because the whole
 * tile is what moves - border, background and all. A wrapper inside the tile
 * would leave an empty bordered box sitting there while its contents faded
 * in, which is the opposite of the effect.
 *
 * `index` staggers it: row after row rather than everything at once. The
 * delay only applies to a tile that was ready immediately - one that waited
 * for its figures has already taken its turn in the queue by waiting, and
 * adding a delay on top would make the slowest tile the last thing on screen
 * twice over.
 */
/** How long a tile may wait to arrive complete before it rises as a placeholder. */
const GRACE_MS = 450;

export default function Reveal({
  index = 0,
  className = "",
  style,
  children,
  ...rest
}: {
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "children">) {
  /* How many things inside are still waiting. Zero means show. */
  const [held, setHeld] = useState(0);
  /* Whether anything ever asked us to wait. A tile that never held should not
     also serve a stagger delay it has not earned - but one that DID hold has
     already been late, so it appears the moment it is ready. */
  const [waited, setWaited] = useState(false);

  const hold = useMemo<RevealHold>(
    () => ({
      add: () => {
        setWaited(true);
        setHeld((n) => n + 1);
      },
      done: () => setHeld((n) => Math.max(0, n - 1)),
    }),
    []
  );

  const ready = held === 0;

  /* NOT A HOLE IN THE BOARD (19 Sep 2026). A tile held until its figures
     landed, invisible - which is right for the half-second most of them take,
     and wrong for the slow ones: Today and Needs attention sat as blank gaps
     for as long as their feeds did, and a board with holes in it reads as
     broken. So a tile gets a short grace to arrive complete, and after that it
     rises anyway wearing a quiet placeholder, which fades into the real thing
     when it lands. One rise, never two: the class does not change when the
     content arrives, so nothing moves twice. */
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (ready || late) return;
    const t = window.setTimeout(() => setLate(true), GRACE_MS);
    return () => window.clearTimeout(t);
  }, [ready, late]);
  /* The placeholder stays for its fade-out, then goes. */
  const [ghost, setGhost] = useState(false);
  useEffect(() => {
    if (late && !ready) return setGhost(true);
    if (!ghost) return;
    const t = window.setTimeout(() => setGhost(false), 320);
    return () => window.clearTimeout(t);
  }, [late, ready, ghost]);
  const up = ready || late;
  /* 240ms first: the masthead is most of the way home by then, so the tiles
     land after it rather than with it (11 Sep 2026). */
  const delay = useCallback(() => (waited ? 0 : 280 + Math.min(index, 8) * 100), [waited, index]);

  return (
    <div
      {...rest}
      className={`${className} ${up ? "reveal-rise" : "reveal-held"}`}
      style={{ ...style, animationDelay: up ? `${late ? 0 : delay()}ms` : undefined }}
      aria-busy={!ready || undefined}
    >
      <RevealCtx.Provider value={hold}>{children}</RevealCtx.Provider>
      {ghost && (
        <div aria-hidden className={`reveal-ghost ${ready ? "reveal-ghost-out" : ""}`}>
          <span className="reveal-bar" style={{ width: "38%", height: 10 }} />
          <span className="reveal-bar" style={{ width: "24%", height: 30, marginTop: 18 }} />
          <span className="reveal-bar" style={{ width: "52%", height: 10, marginTop: 14 }} />
        </div>
      )}
    </div>
  );
}
