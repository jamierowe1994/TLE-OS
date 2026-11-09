"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * "Updating · as at 10:42" - beside a board drawn from its last read while a
 * fresh one loads (James, 9 Nov 2026, lib/applications-read).
 *
 * The live-figures rule allows a held board only because it is never left
 * unlabelled: this says the board is being updated and how old the one on
 * screen is, and goes the moment the fresh one lands. If the fresh one does
 * not come, it says so, with a way to ask again, rather than letting an old
 * board pass for a live one.
 *
 * It takes no room on the page, so nothing jumps when it goes: on a desktop
 * it sits in a gap that is already there (beside the header's buttons, or in
 * the top corner of a let's page), and below that width it floats as a small
 * pill at the foot of the screen, clear of Steve in the corner. The pill is
 * drawn on the page's body, not inside the screen: a screen that slides in
 * on arrival (nl-rise) would otherwise carry a "fixed" pill with it, and on
 * a phone it landed on the header's buttons.
 */
export type BoardUpdate = "updating" | "failed" | null;

const timeOf = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
};

export default function BoardUpdating({
  state,
  asAt,
  onRetry,
  corner = false,
}: {
  state: BoardUpdate;
  asAt: string | null;
  onRetry?: () => void;
  /** On a desktop, pinned to the top right of the nearest positioned box rather than in the flow. */
  corner?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!state) return null;
  const time = timeOf(asAt);
  const tone = state === "updating" ? "text-muted" : "";
  const colour = state === "failed" ? { color: "var(--warning, #8a531a)" } : undefined;
  const words =
    state === "updating" ? (
      <>
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Updating{time ? ` · as at ${time}` : ""}
      </>
    ) : (
      <>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        Couldn&apos;t update{time ? ` · as at ${time}` : ""}
        {onRetry && (
          <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:no-underline">
            Try again
          </button>
        )}
      </>
    );
  return (
    <>
      <span
        role="status"
        aria-live="polite"
        style={colour}
        className={`hidden items-center gap-1.5 whitespace-nowrap text-[12px] ${tone} ${corner ? "lg:absolute lg:right-0 lg:top-0 lg:z-10 lg:flex" : "lg:inline-flex"}`}
      >
        {words}
      </span>
      {mounted &&
        createPortal(
          <span className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center lg:hidden">
            <span
              role="status"
              aria-live="polite"
              style={colour}
              className={`pointer-events-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-card px-3.5 py-2 text-[12px] shadow-[0_4px_18px_rgba(0,0,0,0.12)] ring-1 ring-line/70 ${tone}`}
            >
              {words}
            </span>
          </span>,
          document.body
        )}
    </>
  );
}
