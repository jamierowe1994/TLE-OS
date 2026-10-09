"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * A dashboard tile's whole list, popped out (James, 9 Oct 2026).
 *
 * A tile cannot scroll, so "+8 more" opening inside it was no use: the tile
 * just ran out of room. "View all" opens this instead, over the page, and the
 * list scrolls in here however long it is.
 *
 * Portalled to <body>: the tiles sit in a grid that animates with a
 * transform, and a transformed ancestor turns "fixed" into "fixed to that
 * tile".
 */
export default function ListPopout({
  open,
  onClose,
  icon,
  title,
  sub,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon: string;
  title: string;
  sub?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    /* The page behind stays put while this list scrolls. */
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl sm:max-h-[85vh]"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name={icon} size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] font-normal leading-tight">{title}</h3>
            {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line/70 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** The "View all" button at the foot of a tile. */
export function ViewAllButton({ onClick, label = "View all", count }: { onClick: () => void; label?: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/20 px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40"
    >
      {label}
      {count != null && <span className="figures text-muted">{count}</span>}
    </button>
  );
}
