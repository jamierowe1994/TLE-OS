"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { useSlideOver } from "@/lib/use-slide-over";
import InspectionsBoard from "@/components/portfolio/InspectionsBoard";
import TenancyReviewsBoard from "@/components/portfolio/TenancyReviewsBoard";
import MoveOutsBoard from "@/components/portfolio/MoveOutsBoard";

/**
 * The Overview's pop-out (James, 21 Oct 2026): "in the Overview, when we click
 * them, we'll have a pop-out page so they can see all the different things
 * within there. Technically we're not deleting it, we're just hiding it within
 * the Overview tab."
 *
 * Inspections, Tenancy Reviews and Move-outs came off the Portfolio menu. Their
 * tiles open the whole board here - the same component the old page draws, so
 * every filter, sheet and button works the same in both places.
 *
 * Linkable: /overview?panel=inspections opens straight onto it. Opening from a
 * tile adds a history entry, so the browser's Back closes it; so do Esc, the
 * close button and a click on the dimmed page. Full screen on a phone, wide
 * from the right on a desktop.
 */

export const PANELS = {
  inspections: { title: "Inspections", icon: "search", Board: InspectionsBoard },
  "tenancy-reviews": { title: "Tenancy Reviews", icon: "file-contract", Board: TenancyReviewsBoard },
  "move-outs": { title: "Move-outs", icon: "key", Board: MoveOutsBoard },
} as const;
export type PanelId = keyof typeof PANELS;

const isPanel = (v: string | null): v is PanelId => !!v && v in PANELS;
const panelInUrl = (): PanelId | null => {
  try {
    const v = new URLSearchParams(window.location.search).get("panel");
    return isPanel(v) ? v : null;
  } catch {
    return null;
  }
};

/** The Overview's open pop-out, kept in step with ?panel= and the Back button. */
export function useOverviewPanel() {
  const [panel, setPanel] = useState<PanelId | null>(null);
  /* True when this page put the ?panel= entry on the history, so closing can
     step back off it rather than leave a Forward entry that reopens it. */
  const pushed = useRef(false);

  useEffect(() => {
    setPanel(panelInUrl());
    const onPop = () => {
      pushed.current = false;
      setPanel(panelInUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback((id: PanelId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", id);
    url.searchParams.delete("open");
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    pushed.current = true;
    setPanel(id);
  }, []);

  /* Called once the panel has slid out. */
  const closeNow = useCallback(() => {
    setPanel(null);
    if (!panelInUrl()) return;
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("panel");
    url.searchParams.delete("open");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  return { panel, open, closeNow };
}

export default function OverviewPanel({ panel, onClose: closeNow }: { panel: PanelId | null; onClose: () => void }) {
  /* Keep the last board drawn while the panel slides away. */
  const [held, setHeld] = useState<PanelId | null>(panel);
  useEffect(() => {
    if (panel) setHeld(panel);
  }, [panel]);
  const { shown, close } = useSlideOver(!!panel, () => {
    closeNow();
    setHeld(null);
  }, panel);

  /* A sheet of the board's own (record a review, close a move-out, a visit)
     is open on top: Esc belongs to it, not to the pop-out under it. */
  const [inner, setInner] = useState(false);
  const innerRef = useRef(false);
  innerRef.current = inner;

  /* Back pressed: the URL already lost ?panel=, so the panel slides out on
     its own (data-shown goes false) and the board is let go once it has. */
  useEffect(() => {
    if (panel || !held) return;
    const t = window.setTimeout(() => setHeld(null), 340);
    return () => window.clearTimeout(t);
  }, [panel, held]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || innerRef.current || e.defaultPrevented) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, close]);

  const id = panel ?? held;
  if (!id) return null;
  const { title, icon, Board } = PANELS[id];

  return (
    <div className="so-root fixed inset-0 z-[130]" data-shown={shown}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} data-shown={shown} className="so-scrim absolute inset-0 cursor-default bg-ink/35" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-shown={shown}
        className="so-panel absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] sm:rounded-l-2xl lg:w-[86%] xl:w-[80%]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8 sm:pb-4 sm:pt-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name={icon} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">Overview</p>
            <h2 className="truncate text-[20px] leading-tight sm:text-[24px]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            title="Close (Esc)"
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted transition-colors hover:border-ink/40 hover:text-ink"
          >
            <DoodleIcon name="cross" size={14} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-6">
          <Board key={id} embedded onInnerOpen={setInner} />
        </div>
      </aside>
    </div>
  );
}
