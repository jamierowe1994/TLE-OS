"use client";

import { useEffect } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The search row a Portfolio board shows when it is opened from the Overview
 * rather than on its own page.
 *
 * James, 21 Oct 2026: "If we just start by getting rid of Move-outs, Tenancy
 * Reviews and Inspections, then ... in the Overview, when we click them, we'll
 * have a pop-out page so they can see all the different things within there."
 *
 * On its own page a board's search lives in the PageHeader. In the pop-out
 * there is no masthead (the pop-out carries the title), so the same pill sits
 * at the top of the board instead, drawn exactly as the masthead draws it.
 */
export default function BoardSearch({
  value,
  onChange,
  placeholder,
  actions,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex w-full min-w-0 max-w-sm items-center gap-2.5 rounded-full border border-line/80 bg-white px-4 py-2 transition-colors focus-within:border-ink">
        <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted/70"
        />
      </label>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

/**
 * Tells the Overview's pop-out whether one of the board's own sheets is open
 * on top of it, so Esc closes that sheet and not the whole pop-out under it.
 */
export function useReportInner(open: boolean, onInnerOpen?: (open: boolean) => void) {
  useEffect(() => {
    onInnerOpen?.(open);
  }, [open, onInnerOpen]);
  useEffect(() => () => onInnerOpen?.(false), [onInnerOpen]);
}

/** Props every Portfolio board takes (21 Oct 2026). */
export interface BoardProps {
  /** Drawn inside the Overview's pop-out: no masthead, a plain search row instead. */
  embedded?: boolean;
  /** See useReportInner. */
  onInnerOpen?: (open: boolean) => void;
}
