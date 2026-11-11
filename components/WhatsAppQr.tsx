"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { openWhatsAppApp, waAppLink, waLink, waWebLink } from "@/lib/whatsapp-link";

/**
 * WhatsApp from a desk (Susan, 19 Sep 2026).
 *
 * A chat link only opens WhatsApp where WhatsApp lives, and for most agents
 * that is the phone in their hand, not the computer in front of them. So on
 * a desktop the button draws a code: point the phone's camera at it and the
 * chat opens on that person, with whatever was typed here already in the box.
 * On a phone there is nothing to scan - the button is the link.
 *
 * ONE WHATSAPP, NOT A TAB A PRESS (22 Oct 2026). Both ways now open the chat
 * in the WhatsApp app (lib/whatsapp-link waAppLink): on a phone straight
 * away, on a desk from "Open in WhatsApp on this computer". A wa.me or
 * WhatsApp Web link opened a fresh tab every time, and in the iPhone app a
 * Safari sheet. WhatsApp Web stays as the fallback for a desk without the
 * app, and still opens its own tab - WhatsApp's headers leave no way to
 * reuse one.
 *
 * The OS cannot see what was sent from the phone. Where the record keeps a
 * log, `onSent` lets the sheet ask and write it down, so a WhatsApp still
 * shows on the file as an attempt.
 */
export function WhatsAppButton({
  phone,
  name,
  text,
  onSent,
  className = "",
  children,
}: {
  phone: string;
  /** Who it is going to - the sheet says their first name. */
  name: string;
  /** What to have typed for them. Defaults to a greeting. */
  text?: string;
  /** Write it on the record. Resolve to an error line if it did not save. */
  onSent?: (message: string) => Promise<string | null | void>;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const first = name.trim().split(/\s+/)[0] || "them";
  if (!waLink(phone)) return null;

  return (
    <>
      <button
        type="button"
        title={`WhatsApp ${first}`}
        aria-label={`WhatsApp ${first}`}
        onClick={() => {
          /* A phone is already the thing the code would be scanned with. */
          if (window.matchMedia("(pointer: coarse) and (max-width: 820px)").matches) {
            /* The app, not wa.me's web page; wa.me only if WhatsApp didn't open. */
            openWhatsAppApp(waAppLink(phone, text) as string, () => {
              window.location.href = waLink(phone, text) as string;
            });
            return;
          }
          setOpen(true);
        }}
        className={className}
      >
        {children ?? <DoodleIcon name="message-2" size={13} />}
      </button>
      {open && <WhatsAppSheet phone={phone} first={first} text={text} onSent={onSent} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsAppSheet({
  phone,
  first,
  text,
  onSent,
  onClose,
}: {
  phone: string;
  first: string;
  text?: string;
  onSent?: (message: string) => Promise<string | null | void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(text ?? `Hi ${first}, `);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Pressed Open in WhatsApp and nothing came to the front. */
  const [noApp, setNoApp] = useState(false);

  const link = waLink(phone, message) ?? "";
  useEffect(() => {
    let live = true;
    /* Typing redraws the code, but not on every keystroke. */
    const t = window.setTimeout(() => {
      QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 0, scale: 8, color: { dark: "#101014", light: "#ffffff" } })
        .then((d) => { if (live) setSrc(d); })
        .catch(() => { if (live) setSrc(null); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sent() {
    if (!onSent || busy) return;
    setBusy(true);
    setError(null);
    const problem = await onSent(message.trim()).catch(() => "That didn't save - the connection dropped.");
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    onClose();
  }

  /* Portalled: the drawers it opens from are transformed, which would pin a
     fixed overlay to the drawer instead of the screen.

     ON TOP OF WHATEVER IT WAS PRESSED IN (27 Oct 2026). At z-150 it opened
     under the floating stages that came after it - the landlord pop-up on a
     listing (z-420) and the new-look diary drawer (z-300) - blurred behind
     them, and closing them took it away (Dan Richards, Sean McMahon). Nothing
     opens from the sheet, so it sits above every stage. A dialog, so the
     stages' Escape closes the sheet first and leaves them open; and clicks
     stop here, as EmailPerson's do, rather than reaching the row it was
     pressed from (the landlord rows fold and drag). */
  return createPortal(
    <div
      className="nl-wa-wrap fixed inset-0 z-[430] flex items-center justify-center p-4"
      data-look="new"
      role="dialog"
      aria-modal="true"
      aria-label={`WhatsApp ${first}`}
      data-wa-sheet
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      {/* Bigger, in the house style (James, 8 Nov 2026: "make that page a bit
          bigger so they can actually see all of their message"): the message
          on the left with room to read it, the code on the right. */}
      <div className="nl-wa fade-up relative w-full">
        <div className="nl-wa-head">
          <div>
            <h2>WhatsApp {first}</h2>
            <p>{phone}</p>
          </div>
          <button type="button" className="nl-wa-x" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="nl-wa-body">
          <div className="nl-wa-msg">
            <p className="nl-wa-k">Your message</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              maxLength={500}
              placeholder="Type it here, send it from your phone"
            />
            <p className="nl-wa-count">{message.length} of 500</p>
          </div>
          <div className="nl-wa-code">
            <p className="nl-wa-k">Send it from your phone</p>
          <div className="nl-wa-qr">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`Code that opens WhatsApp on ${first}'s chat`} className="h-full w-full" />
            ) : (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink" aria-label="Drawing the code" />
            )}
          </div>
            <p className="nl-wa-hint">Point your phone&apos;s camera at the code. WhatsApp opens on {first}&apos;s chat with your message ready to send.</p>
          </div>
        </div>

        <div className="nl-wa-also">
          <button
            type="button"
            onClick={() => {
              setNoApp(false);
              openWhatsAppApp(waAppLink(phone, message) as string, () => setNoApp(true));
            }}
            className="nl-btn nl-btn--secondary nl-btn--sm"
          >
            <DoodleIcon name="message-2" size={12} />
            Open in WhatsApp on this computer
          </button>
          <a
            href={waWebLink(phone, message) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="nl-link"
          >
            Or WhatsApp Web
          </a>
        </div>
        {noApp && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            Nothing opened? WhatsApp may not be on this computer. Use WhatsApp Web instead, or get the app from whatsapp.com/download so it opens in the same window every time.
          </p>
        )}

        {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}

        <div className="nl-wa-foot">
          <button
            type="button"
            onClick={onClose}
            className="nl-btn nl-btn--quiet"
          >
            {onSent ? "Not sent" : "Done"}
          </button>
          {onSent && (
            <PressButton
              onClick={sent}
              disabled={busy}
              className="nl-btn nl-btn--primary"
            >
              <DoodleIcon name="checklist" size={14} />
              {busy ? "Saving…" : "I've sent it - log it"}
            </PressButton>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
