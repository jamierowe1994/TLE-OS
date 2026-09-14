"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The contract, signed WITHOUT leaving The Letting Experts.
 *
 * James, 14 Sep 2026: "I don't want to do it as a pop-out. The simple reason
 * is that it will look a bit shocking for them to get sent to some random
 * site. No one's heard of DocuSeal."
 *
 * He is right, and it is not only a branding point. A landlord who clicks
 * "sign your contract" and lands on a domain they have never heard of, under
 * somebody else's logo, has been handed a good reason to stop and ring the
 * office - and the ones who do NOT stop are the ones who would sign anything,
 * which is worse. The signing surface has to look like the company whose name
 * is on the agreement.
 *
 * ── AN IFRAME CANNOT DO THIS. Measured, 14 Sep ────────────────────────────
 *
 * The first build framed the signing page and showed a blank white box.
 * `docuseal.eu` answers `x-frame-options: SAMEORIGIN`, so it can never be
 * framed on our domain, and the API returns `embed_src: null` on these
 * submitters, so there is no framable URL to find either.
 *
 * Their embed is a WEB COMPONENT: a script that renders the form into this
 * page's own DOM. Which is better than a frame anyway - it is why the
 * attributes below can reach it at all.
 *
 * ── The attributes are real, not guessed ──────────────────────────────────
 *
 * Read out of cdn.docuseal.com/js/form.js rather than from documentation,
 * because docuseal.com/docs 302s to a raw EC2 hostname and their public repos
 * document two props. Each one below does one of the things James asked for:
 *
 *   data-with-title            their "TLE Terms of Business" header, gone
 *   data-logo                  ours in place of theirs
 *   data-allow-typed-signature "we're not going to allow them to pick the
 *                              type, it's literally irrelevant" - so it is
 *                              drawn, and the redo is their own control
 *   data-with-download-button  gone; the signed copy arrives on their file
 *   data-with-send-copy-button gone, same reason
 *   data-custom-css            the button in our brown
 *
 * The signature itself stays DocuSeal's, and has to: the audit trail and the
 * certificate are what make the thing enforceable, and they belong to whoever
 * collected the signature.
 */

const EMBED_SRC = "https://cdn.docuseal.com/js/form.js";

/** Loaded once per page, whatever opens it. */
let scriptPromise: Promise<boolean> | null = null;
function loadEmbed(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (customElements.get("docuseal-form")) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise<boolean>((resolve) => {
      const s = document.createElement("script");
      s.src = EMBED_SRC;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => {
        /* Their CDN is down or blocked. The tile offers the tab instead -
           a landlord who cannot sign is worse than one who signs somewhere
           that looks wrong. */
        scriptPromise = null;
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/* Their form, in our colours. Kept small on purpose: every selector here is
   somebody else's internal class name and will rot silently if it changes,
   so it covers the one thing that would look wrong - a bright blue button in
   the middle of a brown page - and nothing more. */
const CUSTOM_CSS = `
  .btn { background-color: #56423e; border-color: #56423e; color: #fff; }
  .btn:hover { background-color: #6b544f; border-color: #6b544f; }
  .btn-outline { background-color: transparent; color: #56423e; }
`;

export default function SignModal({
  url,
  email,
  onClose,
  onDone,
}: {
  url: string;
  /** Prefills their side without asking them to type it again. */
  email?: string | null;
  onClose: () => void;
  /** They finished, so the page behind should read itself again. */
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "done">("loading");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [onClose]);

  useEffect(() => {
    let gone = false;
    void loadEmbed().then((ok) => {
      if (gone) return;
      if (!ok || !host.current) {
        setState("failed");
        return;
      }
      const el = document.createElement("docuseal-form");
      el.setAttribute("data-src", url);
      el.setAttribute("data-with-title", "false");
      el.setAttribute("data-logo", "/brand/tle-os-logo.png");
      el.setAttribute("data-allow-typed-signature", "false");
      el.setAttribute("data-with-download-button", "false");
      el.setAttribute("data-with-send-copy-button", "false");
      el.setAttribute("data-with-field-placeholder", "true");
      el.setAttribute("data-background-color", "transparent");
      el.setAttribute("data-custom-css", CUSTOM_CSS);
      el.setAttribute("data-completed-message-title", "That is signed, thank you.");
      el.setAttribute("data-completed-message-body", "Your copy is on its way to your file. You can close this.");
      if (email) el.setAttribute("data-email", email);
      /* Their own event, on their own element. The webhook is still what
         files the contract; this only decides what the screen says. */
      el.addEventListener("completed", () => setState("done"));
      host.current.replaceChildren(el);
      setState("ready");
    });
    return () => {
      gone = true;
    };
  }, [url, email]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b201d]/55 p-0 sm:p-6" onClick={onClose}>
      <div
        className="drawer-in flex h-full w-full max-w-[980px] flex-col overflow-hidden bg-page sm:h-[92vh] sm:rounded-[26px] sm:shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your terms of business"
      >
        {/* OUR masthead, so the first thing they read is our name. */}
        <div className="flex items-center gap-3 border-b border-line/60 bg-card px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent-dark">The Letting Experts</p>
            <h2 className="text-[16px] font-bold leading-tight">Your terms of business</h2>
          </div>
          {state === "done" ? (
            <button type="button" onClick={onDone} className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">
              All done
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-page hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
          <div ref={host} />
          {state === "loading" ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted">Opening your contract…</p>
          ) : null}
          {state === "failed" ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-semibold">This will not open here just now.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                Nothing is wrong with your contract. Open it in a new tab instead, and it will still come back to your
                file when you have signed.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white"
              >
                Open your contract
              </a>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-line/60 bg-card px-5 py-3">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
            {state === "done"
              ? "Signed. Your copy is on its way to your file."
              : "Scroll to the end and sign where it asks. Nothing is final until you press sign."}
          </p>
          {state !== "done" ? (
            <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-muted underline transition hover:text-ink">
              Finish later
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
