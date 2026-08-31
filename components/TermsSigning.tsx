"use client";

import { useEffect, useRef, useState } from "react";

/**
 * THE LANDLORD SIGNS HERE, NOT IN THEIR INBOX.
 *
 * ── Why embedded rather than emailed ──────────────────────────────────────
 *
 * The terms currently go out through REX's DocuSign connection as a link in
 * an email. That means the landlord signs later, alone, after the agent has
 * left — which is where instructions get lost. Embedding puts the contract on
 * the agent's screen while they are still sitting at the kitchen table, with
 * the rent and the fee already on it.
 *
 * ── The web component, not the React package ──────────────────────────────
 *
 * DocuSeal ships `@docuseal/react`, and this deliberately does not use it.
 * Adding a dependency to render one iframe means a package to keep current,
 * a build that can break on somebody else's release, and a bundle that grows
 * for a screen most agents open once a fortnight. The script defines a custom
 * element and we point it at a URL — same result, nothing to maintain.
 *
 * ── Nothing is emailed ────────────────────────────────────────────────────
 *
 * The session is opened with `send_email: false`. If this component never
 * renders, no landlord ever hears from DocuSeal — which is why the button is
 * safe to have on screen before sending is signed off.
 */

/**
 * REACT 19 MOVED THE JSX NAMESPACE. Augmenting the old global `JSX` compiles
 * to nothing here — it has to go on `react`'s own namespace, or the custom
 * element is an unknown tag and tsc refuses it.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "docuseal-form": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "data-src"?: string;
          "data-email"?: string;
          "data-with-title"?: string;
          "data-custom-css"?: string;
        },
        HTMLElement
      >;
    }
  }
}

const SCRIPT = "https://cdn.docuseal.com/js/form.js";

/**
 * The form styled to look like the OS rather than like DocuSeal.
 *
 * Only the frame and the controls — the DOCUMENT is never restyled. It is a
 * legal agreement and it must look exactly as it will when it is printed.
 */
const CUSTOM_CSS = `
  .form-container { background:#fbfbfb; border:0; }
  .scrollbox { background:#fbfbfb; }
  .title-container, .header-container { background:#fbfbfb; }
  .submit-form-button {
    background:#a85a51; border:0; border-radius:8px; color:#fff; font-weight:600;
  }
  .submit-form-button:hover { background:#8f4a42; }
  .type-text-button, .upload-image-button, .clear-canvas-button,
  .set-current-date-button, .reupload-button {
    background:#fff; border:1px solid #cdc9c0; border-radius:8px; color:#3b3b3c;
  }
  .field-area-active { border-color:#a85a51; outline-color:#de968f; }
  .field-area-active-label { background:#a85a51; color:#fff; }
`;

interface Session {
  embedSrc: string;
  slug: string;
  valuation?: number | null;
  serviceLevel?: string | null;
}

export default function TermsSigning({
  appraisalId,
  landlord,
  onSigned,
}: {
  appraisalId: string;
  landlord: string;
  onSigned?: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  /* Loaded ONLY once a session exists. A third-party script on every appraisal
     page, for a panel most agents never open, is a network request and a
     parse we can simply not make. */
  useEffect(() => {
    if (!session || scriptReady) return;
    if (document.querySelector(`script[src="${SCRIPT}"]`)) {
      setScriptReady(true);
      return;
    }
    const el = document.createElement("script");
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => setScriptReady(true);
    el.onerror = () =>
      setError("DocuSeal's signing script didn't load. Check the connection and try again.");
    document.body.appendChild(el);
  }, [session, scriptReady]);

  /* The custom element fires `completed` when the landlord finishes. Listened
     for on the host rather than polled, so the panel can react the moment the
     signature lands rather than a webhook round-trip later. */
  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const done = () => onSigned?.();
    node.addEventListener("completed", done);
    return () => node.removeEventListener("completed", done);
  }, [session, onSigned]);

  async function open() {
    setOpening(true);
    setError(null);
    try {
      const r = await fetch("/api/docuseal/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: appraisalId }),
      });
      const j = (await r.json()) as Session & { ok?: boolean; error?: string };
      if (!j.ok || !j.embedSrc) setError(j.error ?? "Couldn't open the terms.");
      else setSession(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  if (error && !session) {
    return (
      <div className="rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-4">
        <p className="text-[12.5px] leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={open}
          className="mt-3 rounded-lg border border-line/80 px-3.5 py-2 text-[12.5px]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        <button
          type="button"
          onClick={open}
          disabled={opening}
          className="rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
        >
          {opening ? "Opening the terms…" : "Sign the terms"}
        </button>
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
          Opens the terms of business here, already carrying the rent, the fee and{" "}
          {landlord}&apos;s details. Nothing is emailed — they sign on this screen.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-[11px] text-muted">
        <span>Terms of business for {landlord}</span>
        {session.serviceLevel && <span>· {session.serviceLevel}</span>}
      </div>
      <div
        ref={holder}
        className="overflow-hidden rounded-xl border border-line/70 bg-panel"
        style={{ minHeight: 620 }}
      >
        {scriptReady ? (
          <docuseal-form
            data-src={session.embedSrc}
            data-with-title="false"
            data-custom-css={CUSTOM_CSS}
          />
        ) : (
          <p className="p-5 text-[12.5px] text-muted">Loading the contract…</p>
        )}
      </div>
      {error && <p className="mt-2 text-[11.5px] text-accent-dark">{error}</p>}
    </div>
  );
}
