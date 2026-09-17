"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

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
  /**
   * THEIR MINIMISE BUTTON, GONE.
   *
   * The small chevron in the panel's top corner collapses .form-container to
   * nothing - and once the panel is fixed into our column it collapses to a
   * 0x0 box at the top left of the screen with no way back. James, 15 Sep:
   * "the second box is invisible to sign." That was one stray click on an
   * 18px icon costing a landlord the ability to sign their contract.
   *
   * It earns its place in their layout, where the panel lies across the
   * document and sometimes has to be got out of the way. Beside the document
   * it has nothing to get out of the way of.
   */
  .minimize-form-button { display: none !important; }

  /**
   * NOTHING SETS THE CANVAS HEIGHT HERE, AND THAT IS DELIBERATE.
   *
   * James, 15 Sep: "the signatures look a bit weird ... we need to make it a
   * little bit longer." The drawing box IS a 3:1 letterbox and he is right
   * about how it looks - but a CSS height on .draw-canvas is the wrong way to
   * fix it. Their backing store is fixed at width x DPR by 98 x DPR when the
   * signature step mounts, and it is NOT recomputed on resize (checked: a
   * resize event leaves it at 882x294 while the box reads 294x190). Stretching
   * the box therefore stretches every stroke on its way into the saved image,
   * and a distorted signature on a contract is worse than a short one.
   *
   * The room comes from the COLUMN being wider instead (SignSheet's COL_W),
   * which grows the canvas at its own ratio. If the letterbox itself has to
   * go, it is DocuSeal's to change.
   */

  /* THE FIELD PANEL. Theirs, and it moves to the right-hand column when there
     is room (components/landlord/SignSheet). Their label is text-2xl, which is
     sized for a panel lying across the full width of a document; in a 360px
     column it wraps a field name over three lines. */
  .form-container .steps-form label {
    font-size: 15px !important;
    line-height: 1.35 !important;
    font-weight: 600 !important;
    padding-bottom: 6px !important;
  }
  .form-container .steps-form .base-input {
    font-size: 16px !important;
  }
`;

export default function DocusealEmbed({
  url,
  email,
  onCompleted,
  onRoot,
  className = "",
  style,
}: {
  url: string;
  email?: string | null;
  onCompleted?: () => void;
  /**
   * Their shadow root, once it exists, so the surface around this can read
   * which step the signer is on and put the panel where it belongs. Nothing
   * here depends on it - a caller that does not pass it gets the form as it
   * has always been.
   */
  onRoot?: (root: ShadowRoot | null) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  /**
   * The callbacks are held in refs and kept OUT of the effect below.
   *
   * With them in the dependency list, a caller passing an inline arrow rebuilds
   * the <docuseal-form> on every render - which throws away a half-drawn
   * signature and a part-filled form. Nothing today does that, and nothing
   * should be able to.
   */
  const completed = useRef(onCompleted);
  const rooted = useRef(onRoot);
  completed.current = onCompleted;
  rooted.current = onRoot;

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
      /* Their panel open, never minimised - SignSheet places it in the column. */
      el.setAttribute("data-expand", "true");
      el.setAttribute("data-custom-css", CUSTOM_CSS);
      el.setAttribute("data-completed-message-title", "That is signed, thank you.");
      el.setAttribute("data-completed-message-body", "Your copy is on its way to your file. You can close this.");
      if (email) el.setAttribute("data-email", email);
      el.addEventListener("completed", () => completed.current?.());
      host.current.replaceChildren(el);
      setState("ready");
      /* The shadow root is attached in their connectedCallback, which has not
         necessarily run by the time replaceChildren returns. Twenty tries at
         50ms is a second, after which there is nothing to hand over and the
         caller simply gets no root - the form still works, it is only the
         column beside it that cannot be drawn. */
      let tries = 0;
      const look = () => {
        if (gone) return;
        if (el.shadowRoot) return rooted.current?.(el.shadowRoot);
        if (tries++ < 20) setTimeout(look, 50);
      };
      look();
    });
    return () => {
      gone = true;
      rooted.current?.(null);
    };
  }, [url, email]);

  return (
    <div className={className} style={style}>
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
