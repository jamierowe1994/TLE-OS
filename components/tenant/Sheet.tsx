"use client";

import { useEffect } from "react";

/**
 * A bottom sheet, the tenant portal's one (James, 18 Sep 2026: "we should be
 * utilising things like bottom sheets" on a phone). The same build as the
 * agent sheet on both portals: the dark behind it closes it, so does Escape,
 * the page underneath does not scroll while it is up, and its shadow only
 * exists while it is open (a parked sheet casting shadow back over the foot
 * of the screen was the landlord's bug of 15 Sep).
 *
 * Kept mounted and slid away rather than unmounted, so what was typed in it
 * survives closing it.
 */
export default function Sheet({
  open,
  onClose,
  label,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  /** Pinned to the foot of the sheet, above the safe area - the one button. */
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[57] bg-[#2b201d]/45 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        aria-hidden
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[58] flex max-h-[88vh] flex-col rounded-t-[26px] bg-white"
        style={{
          transform: open ? "translateY(0)" : "translateY(106%)",
          boxShadow: open ? "0 -24px 60px -28px rgba(40, 25, 20, 0.55)" : "none",
          /* Hidden once it has slid away, so nothing in it takes focus. */
          visibility: open ? "visible" : "hidden",
          transition: open
            ? "transform 460ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s"
            : "transform 460ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 460ms",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="mx-auto mb-1 mt-3 block h-1.5 w-11 shrink-0 rounded-full bg-line" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line/50 px-5 pt-3" style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0" style={{ height: "calc(14px + env(safe-area-inset-bottom))" }} />}
      </div>
    </>
  );
}
