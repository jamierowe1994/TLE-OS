"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DocusealEmbed from "@/components/landlord/DocusealEmbed";

/**
 * Where a signature happens: a sheet that rises over the page with DocuSeal's
 * own form in it (the agent's part when they send, each landlord's on their
 * link). DocuSeal keeps the signature, the audit trail and the certificate.
 *
 * A "preview:" address is the local stand-in (lib/terms/flow inPreview): no
 * DocuSeal on this machine, so a typed name stands in for the signature and
 * the screens can still be walked end to end. Never reached in production.
 */
export default function TermsSignSheet({
  src,
  email,
  who,
  onSigned,
  onClose,
}: {
  src: string;
  email?: string | null;
  /** "Your part" / "Sign your terms" - said at the top of the sheet. */
  who: string;
  /** Called once DocuSeal (or the stand-in) says they are done. `name` only from the stand-in. */
  onSigned: (name?: string) => Promise<string | null> | string | null | void;
  onClose: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const preview = src.startsWith("preview:");

  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", esc);
    };
  }, [busy, onClose]);

  async function finish(typed?: string) {
    setBusy(true);
    setProblem(null);
    const said = await onSigned(typed);
    if (typeof said === "string" && said) setProblem(said);
    setBusy(false);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-look="new" className="nl-signsheet" role="dialog" aria-modal="true" aria-label={who}>
      <button type="button" className="nl-signsheet-scrim" aria-label="Close" onClick={() => !busy && onClose()} />
      <div className="nl-signsheet-panel">
        <div className="nl-signsheet-head">
          <b>{who}</b>
          <span className="flex-1" />
          <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label="Close" disabled={busy} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {problem && <p className="nl-signsheet-problem">{problem}</p>}
        {preview ? (
          <div className="nl-signsheet-body grid place-items-center">
            <div className="w-full max-w-[460px] space-y-4 py-10">
              <p className="nl-eyebrow">Preview signing</p>
              <p className="nl-meta">
                This machine isn&apos;t connected to DocuSeal, so a typed name stands in for the signature. On the live system this is DocuSeal&apos;s own signing, with its audit trail and certificate.
              </p>
              <label className="nl-field">
                <span>Type your full name to sign</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" style={{ fontFamily: "cursive", fontSize: 20 }} />
              </label>
              <button type="button" className="nl-btn nl-btn--primary w-full" disabled={!name.trim() || busy} onClick={() => void finish(name.trim())}>
                {busy ? "Signing…" : "Sign"}
              </button>
            </div>
          </div>
        ) : (
          <DocusealEmbed url={src} email={email ?? undefined} onCompleted={() => void finish()} className="nl-signsheet-body" />
        )}
      </div>
    </div>,
    document.body
  );
}
