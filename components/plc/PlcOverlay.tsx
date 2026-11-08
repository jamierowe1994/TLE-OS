"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PlcWizard, { type PlcStepName } from "@/components/PlcWizard";

/**
 * The PLC check as a pop-out over the let (James, 8 Nov 2026: "a pop-out
 * overlay ... quite a lot of the screen ... rather than taking them to a
 * separate screen").
 *
 * One solid panel across most of the window: a header with where it is and
 * the four steps, the wizard underneath scrolling on its own. Closing it is
 * always safe - the pack saves as it goes, and opening it again offers to
 * pick up where it was left or start fresh (components/PlcWizard "resume").
 * The steps sit in the header, so there is nothing left for a Back button
 * to run into.
 */

const STEPS: { id: PlcStepName; label: string }[] = [
  { id: "details", label: "The let" },
  { id: "landlord", label: "Landlord documents" },
  { id: "tenant", label: "Tenant documents" },
  { id: "review", label: "Check and send" },
];

export default function PlcOverlay({ applicationId, address, onClose }: { applicationId: string; address?: string | null; onClose: () => void }) {
  const [step, setStep] = useState<PlcStepName>("gathering");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      /* A sheet opened from inside the check (an email, a file) has its own Escape. */
      if (document.querySelector(".nl-fs-wrap")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const at = STEPS.findIndex((s) => s.id === step);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-look="new" className={`nl-plc-wrap${shown ? " is-shown" : ""}`} role="dialog" aria-modal="true" aria-label="PLC check">
      <div className="nl-plc-dim" onClick={onClose} aria-hidden />
      <div className="nl-plc-panel">
        <header className="nl-plc-head">
          <div className="nl-plc-where">
            <span className="nl-plc-eyebrow">PLC check</span>
            {address && <span className="nl-plc-address" title={address}>{address}</span>}
          </div>
          <ol className="nl-plc-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={i < at ? "is-done" : i === at ? "is-on" : ""}>
                <i>{i < at ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : i + 1}</i>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="nl-plc-close" onClick={onClose} data-steve="plc.close">
            <span>Save and close</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="nl-plc-body" data-plc-scroll>
          <PlcWizard applicationId={applicationId} embedded onStep={setStep} onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body
  );
}
