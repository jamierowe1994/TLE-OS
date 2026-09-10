"use client";

import { useCallback, useMemo, useState } from "react";
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
  const delay = useCallback(() => (waited ? 0 : Math.min(index, 8) * 70), [waited, index]);

  return (
    <div
      {...rest}
      className={`${className} ${ready ? "reveal-rise" : "reveal-held"}`}
      style={{ ...style, animationDelay: ready ? `${delay()}ms` : undefined }}
    >
      <RevealCtx.Provider value={hold}>{children}</RevealCtx.Provider>
    </div>
  );
}
