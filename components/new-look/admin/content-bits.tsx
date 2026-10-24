"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Small parts the redrawn Admin screens share (Pre-let, Content, Emails;
 * 24 Oct 2026). Styled from app/new-look/admin.css, inside a
 * [data-look="new"] wrapper.
 */

/** The turning ring. */
export const Spin = () => <span className="nl-adm-spin" aria-hidden />;

/** A loading line: the ring and what it's reading. */
export function Loading({ label, page = false }: { label: string; page?: boolean }) {
  const line = (
    <p className="nl-adm-loading" role="status">
      <Spin /> {label}
    </p>
  );
  return page ? (
    <div data-look="new" className="nl-page nl-adm">
      {line}
    </div>
  ) : (
    line
  );
}

/** Something couldn't be read or done: said plainly, with a way to try again. */
export function Problem({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div className="nl-adm-c-error" role="alert">
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="nl-btn nl-btn--secondary nl-btn--sm">
          Try Again
        </button>
      )}
    </div>
  );
}

/**
 * The side drawer the new look edits in, portalled to the body so nothing on
 * the page (an animating parent, a clipped card) can trap it.
 */
export function AdmDrawer({
  title,
  eyebrow,
  sub,
  onClose,
  foot,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  sub?: React.ReactNode;
  onClose: () => void;
  foot?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  if (!host) return null;
  return createPortal(
    <div data-look="new" className="nl-drawer-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={onClose} />
      <div className={`nl-drawer${wide ? " nl-adm-drawer-wide" : ""}`}>
        <div className="nl-drawer-head">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="nl-eyebrow">{eyebrow}</p>}
            <h2 className="nl-drawer-title nl-adm-drawer-title">{title}</h2>
            {sub && <p className="nl-meta mt-1.5">{sub}</p>}
          </div>
          <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="nl-drawer-body">{children}</div>
        {foot && <div className="nl-drawer-foot">{foot}</div>}
      </div>
    </div>,
    host
  );
}
