"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { waLink, waWebLink } from "@/lib/whatsapp-link";

/**
 * WhatsApp from a desk (Susan, 19 Sep 2026).
 *
 * A chat link only opens WhatsApp where WhatsApp lives, and for most agents
 * that is the phone in their hand, not the computer in front of them. So on
 * a desktop the button draws a code: point the phone's camera at it and the
 * chat opens on that person, with whatever was typed here already in the box.
 * On a phone there is nothing to scan - the button is the link.
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
            window.location.href = waLink(phone, text) as string;
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
     fixed overlay to the drawer instead of the screen. */
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative w-full max-w-[440px] rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <h2 className="hand text-[20px]">WhatsApp {first}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Point your phone&apos;s camera at the code. WhatsApp opens on {first}&apos;s chat with your message ready to send.
        </p>

        <div className="mt-5 flex items-start gap-5">
          <div className="flex h-[168px] w-[168px] shrink-0 items-center justify-center rounded-2xl border border-line/70 bg-white p-3">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`Code that opens WhatsApp on ${first}'s chat`} className="h-full w-full" />
            ) : (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink" aria-label="Drawing the code" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Your message</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={500}
              placeholder="Type it here, send it from your phone"
              className="mt-1.5 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
            />
            <p className="mt-1 text-[11px] text-muted">{phone}</p>
          </div>
        </div>

        <a
          href={waWebLink(phone, message) ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark hover:underline"
        >
          <DoodleIcon name="message-2" size={12} />
          No phone to hand? Open WhatsApp Web instead
        </a>

        {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
          >
            {onSent ? "Not sent" : "Done"}
          </button>
          {onSent && (
            <PressButton
              onClick={sent}
              disabled={busy}
              className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-semibold ${busy ? "cursor-not-allowed bg-line/40 text-muted" : "bg-accent-dark text-page"}`}
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
