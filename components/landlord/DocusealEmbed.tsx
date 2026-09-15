"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DocuSeal's signing form, rendered into OUR page, wearing our clothes.
 *
 * ONE definition, used by both places a landlord can sign: the modal from
 * their file, and the panel that rises under the presentation. They had drifted
 * into two - one an iframe, one an iframe - and BOTH were blank, because
 * docuseal.eu answers `x-frame-options: SAMEORIGIN` and the API returns
 * `embed_src: null`. Their embed is a web component or it is nothing.
 *
 * ── The attributes are read, not guessed ──────────────────────────────────
 *
 * Out of cdn.docuseal.com/js/form.js. docuseal.com/docs 302s to a raw EC2
 * hostname and their public repos document two props, so the shipped
 * JavaScript is the only honest source. Same for the class names in the CSS
 * below: `.base-button` is the big one, `.btn-neutral` is the Next that was
 * arriving in somebody else's navy.
 */

const EMBED_SRC = "https://cdn.docuseal.com/js/form.js";

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
        scriptPromise = null;
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Their form in our colours.
 *
 * Every selector is somebody else's internal class name and will rot silently
 * the day they rename one, so this covers what would actually look wrong and
 * stops: the buttons, and the signature box that was see-through.
 *
 * THE SEE-THROUGH BOX was ours. `data-background-color: transparent` let the
 * contract's own text show through the signature field, so a landlord read
 * "Landlord Signature" over the top of clause 29 (James, 14 Sep: "it looks
 * ridiculous"). Fields get a solid ground now and the page keeps the paper
 * white it is printed on.
 */
const BROWN = "#56423e";
const BROWN_LIFT = "#6b544f";
const CUSTOM_CSS = `
  .base-button, .btn-neutral, .complete-button, .submit-form-button, .start-form-submit-button {
    background-color: ${BROWN} !important;
    border-color: ${BROWN} !important;
    color: #fff !important;
  }
  .base-button:hover, .btn-neutral:hover, .complete-button:hover {
    background-color: ${BROWN_LIFT} !important;
    border-color: ${BROWN_LIFT} !important;
  }
  .btn-outline, .clear-canvas-button {
    color: ${BROWN} !important;
    border-color: ${BROWN} !important;
    background-color: transparent !important;
  }
  /* THE SEE-THROUGH BOX. .field-area is the real class - read off the live
     element in the shadow root, not guessed, after a guess at [data-field]
     and .signature-step matched nothing.

     Fully opaque, not 0.97: at 0.97 the contract's own words still ghosted
     through the box a landlord was reading, which is what James meant by "it
     looks ridiculous". The hairline is what makes it read as a box sitting ON
     the paper rather than a pale patch of it. */
  .field-area {
    background-color: #ffffff !important;
    box-shadow: 0 0 0 1px rgba(86, 66, 62, 0.20);
    border-radius: 4px;
  }
  /* Their focus ring is blue-500, which is the last of their colour to reach
     a landlord's screen. */
  .field-area:focus, .field-area:focus-visible {
    outline-color: ${BROWN} !important;
  }
`;

export default function DocusealEmbed({
  url,
  email,
  onCompleted,
  className = "",
}: {
  url: string;
  email?: string | null;
  onCompleted?: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

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
      /* Their header and logo, gone. James, 14 Sep: he would rather the
         contract itself ran full width than read our name twice. */
      el.setAttribute("data-with-title", "false");
      el.setAttribute("data-logo", "/brand/tle-os-logo.png");
      /* Drawn, never typed. "We're not going to allow them to pick the type,
         it's literally irrelevant." Their own clear-canvas button is the redo. */
      el.setAttribute("data-allow-typed-signature", "false");
      el.setAttribute("data-with-download-button", "false");
      el.setAttribute("data-with-send-copy-button", "false");
      el.setAttribute("data-with-field-placeholder", "true");
      /* Walks them field to field rather than leaving them to hunt down twelve
         pages for the next box. */
      el.setAttribute("data-autoscroll-fields", "true");
      el.setAttribute("data-custom-css", CUSTOM_CSS);
      el.setAttribute("data-completed-message-title", "That is signed, thank you.");
      el.setAttribute("data-completed-message-body", "Your copy is on its way to your file. You can close this.");
      if (email) el.setAttribute("data-email", email);
      if (onCompleted) el.addEventListener("completed", onCompleted);
      host.current.replaceChildren(el);
      setState("ready");
    });
    return () => {
      gone = true;
    };
  }, [url, email, onCompleted]);

  return (
    <div className={className}>
      <div ref={host} />
      {state === "loading" ? (
        <p className="px-4 py-12 text-center text-[13px] text-muted">Opening your contract…</p>
      ) : null}
      {state === "failed" ? (
        <div className="px-4 py-12 text-center">
          <p className="text-[13.5px] font-semibold">This will not open here just now.</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
            Nothing is wrong with your contract. Open it in a new tab instead, and it will still come back to your file
            once you have signed.
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
  );
}
