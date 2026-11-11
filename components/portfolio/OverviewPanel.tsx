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
 * close button and a click on the dimmed page. Full screen on a phone, a
 * centred pop-out on a desktop (8 Nov 2026; it was a drawer from the right).
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

  /* `focus` (1 Nov 2026): a figure on a card opens its board on just those
     records - the Inspections card's Booked in opens In hand on the visits
     booked (lib/inspection-steps InHandFocus). The board reads it once. */
  const open = useCallback((id: PanelId, focus?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", id);
    url.searchParams.delete("open");
    if (focus) url.searchParams.set("focus", focus);
    else url.searchParams.delete("focus");
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
    url.searchParams.delete("focus");
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

  /* A pop-out in front of the page, not a drawer from the side (James,
     8 Nov 2026: "no pull out drawers. Just pop outs"). One solid panel in the
     house's square, condensed-capitals style; the board inside is the same
     component as ever, its tabs and figures restyled to match (new-look.css,
     .nl-ovp). Full screen on a phone. */
  return (
    <div data-look="new" className="nl-edge nl-ovp" data-shown={shown}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="nl-ovp-dim" />
      <section role="dialog" aria-modal="true" aria-label={title} className="nl-ovp-panel">
        <header className="nl-ovp-head">
          <span className="nl-ovp-icon" aria-hidden>
            <DoodleIcon name={icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="nl-ovp-eyebrow">PM Dashboard</p>
            <h2 className="nl-ovp-title">{title}</h2>
          </div>
          <button type="button" onClick={close} title="Close (Esc)" className="nl-ovp-close">
            <span>Close</span>
            <DoodleIcon name="cross" size={14} />
          </button>
        </header>
        <div className="nl-ovp-body">
          <Board key={id} embedded onInnerOpen={setInner} />
        </div>
      </section>
    </div>
  );
}
