"use client";

import { useEffect } from "react";
import { NlFailed, NlLoading } from "@/components/new-look/admin/ScreenBits";
import { when } from "@/lib/admin-client";
import type { SentEmails } from "@/components/admin/SentEmails";

/**
 * Emails > Sent in the new look (lib/new-look "admin", 24 Oct 2026): every
 * email that left, newest first, and each one as it was received. It came
 * here from Activity, which keeps to who did what.
 */
export default function SentEmailsNew({ s }: { s: SentEmails }) {
  const open = s.open;
  const close = s.setOpen;

  /* Escape closes the email, as every drawer in the new look does. */
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, close]);

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <p className="nl-adm-lead">
        Every email the OS sent, newest first. Open one to see it exactly as it was received, not as the template looks today. Sign-in links are removed from the stored copy, so the button is there but cannot be used.
      </p>

      {s.sent === null ? (
        <NlLoading what="Reading what went out" />
      ) : s.failed ? (
        <NlFailed error="The sent emails couldn't be read just now." onRetry={s.load} first />
      ) : s.sent.length === 0 ? (
        <p className="nl-empty">Nothing sent since this started being recorded.</p>
      ) : (
        <section className="nl-adm-block is-first">
          <div className="nl-adm-block-head">
            <h2 className="nl-section-title">
              Sent <span className="nl-count">{s.sent.length === 200 ? "latest 200" : s.sent.length}</span>
            </h2>
          </div>
          <ul className="nl-adm-log">
            {s.sent.map((m) => (
              <li key={m.id}>
                <span className="min-w-0 flex-1">
                  <button type="button" onClick={() => void s.openEmail(m.id)} className="nl-link">
                    {m.subject || "(no subject)"}
                  </button>
                  <span className="nl-adm-muted"> · {m.to}</span>
                  {s.openFailed === m.id && <span className="nl-adm-bad"> · couldn&apos;t open it just now</span>}
                </span>
                <span className="nl-mono">{s.loadingId === m.id ? "Opening…" : when(m.sentAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <div className="nl-drawer-wrap" role="dialog" aria-modal="true" aria-label={open.subject}>
          <button type="button" aria-label="Close" onClick={() => s.setOpen(null)} className="nl-drawer-scrim" />
          <div className="nl-drawer nl-adm-wide">
            <div className="nl-drawer-head">
              <div className="nl-adm-drawer-text">
                <h2 className="nl-drawer-title">{open.subject || "(no subject)"}</h2>
                <p className="nl-meta">
                  To {open.to} · {when(open.sentAt)}
                </p>
              </div>
              <button type="button" onClick={() => s.setOpen(null)} className="nl-iconbtn nl-iconbtn--sm" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {/* An iframe, sandboxed with no allow flags: the stored copy is a whole
                HTML document, and it renders and can do nothing else. */}
            <iframe title={open.subject} srcDoc={open.html} sandbox="" className="nl-adm-drawer-frame" />
          </div>
        </div>
      )}
    </div>
  );
}
