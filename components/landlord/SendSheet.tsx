"use client";

import { useEffect, useRef, useState } from "react";
import DocCamera from "@/components/landlord/DocCamera";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * WHERE THE FILE COMES FROM: the sheet that rises when a landlord presses Send.
 *
 * James, 16 Sep 2026: "when they click Send, they'll have the options of Photo
 * Library, Take Photos, or Choose File."
 *
 * A bare file input already shows something like this on iOS - it is the
 * system sheet, and it is the reason those three words are the right ones.
 * This replaces it for one reason only: the system's "Take Photo" hands over
 * to the phone's own camera, and there is no way to put a guide frame on that.
 * Everything else about the sheet exists so that Take Photo can be ours.
 *
 * ── The tray ───────────────────────────────────────────────────────────────
 *
 * A gas certificate is two sides and an EICR is five, so a shot does not send
 * on its own: it lands in a tray, the camera stays open, and the landlord
 * takes the next page. What goes up is the whole set, bound into one PDF by
 * the server (see lib/doc-pages) - one row on their record rather than five
 * called the same thing in an order nobody can tell.
 */

export interface SendTarget {
  /** Which document this is - "gas", "epc", "other". */
  kind: string;
  /** What to call it, and what the camera says along the top. */
  label: string;
}

export default function SendSheet({
  target,
  busy,
  onSend,
  onClose,
}: {
  target: SendTarget;
  busy: boolean;
  /** The pages, in order. One entry for a library pick or a chosen file. */
  onSend: (files: File[]) => void;
  onClose: () => void;
}) {
  const [camera, setCamera] = useState(false);
  const [pages, setPages] = useState<File[]>([]);
  const [shots, setShots] = useState<string[]>([]);
  const library = useRef<HTMLInputElement | null>(null);
  const anyFile = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !camera && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, camera]);

  /* The previews are object URLs and every one of them is a leak until it is
     revoked. Ten photographs of an EICR at three megapixels is not a rounding
     error on a phone. */
  useEffect(() => () => shots.forEach((u) => URL.revokeObjectURL(u)), [shots]);

  const took = (f: File) => {
    setPages((p) => [...p, f]);
    setShots((s) => [...s, URL.createObjectURL(f)]);
  };
  const drop = (i: number) => {
    URL.revokeObjectURL(shots[i]);
    setPages((p) => p.filter((_, n) => n !== i));
    setShots((s) => s.filter((_, n) => n !== i));
  };

  const option =
    "flex w-full items-center gap-4 rounded-2xl border border-line/60 bg-white px-5 py-4 text-left transition-colors active:bg-[#faf9f7]";

  return (
    <>
      <div
        className="fixed inset-0 z-[94] flex items-end justify-center"
        style={{ background: "rgba(43, 32, 29, 0.45)", animation: "send-dim 240ms ease-out both" }}
        onClick={busy ? undefined : onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Send ${target.label}`}
      >
        <style>{`
          @keyframes send-dim { from { opacity: 0 } to { opacity: 1 } }
          @keyframes send-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
          @media (prefers-reduced-motion: reduce) { .send-sheet { animation: none !important } }
        `}</style>

        <div
          className="send-sheet w-full max-w-[520px] rounded-t-[26px] bg-[#faf9f7] px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-3"
          style={{ animation: "send-rise 340ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
          onClick={(e) => e.stopPropagation()}
        >
          <span aria-hidden className="mx-auto mb-4 block h-[5px] w-[44px] rounded-full bg-black/10" />

          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Send</p>
          <h2 className="mt-1 text-[21px] leading-tight">{target.label}</h2>

          {/* ── what has been taken so far ── */}
          {pages.length > 0 && (
            <div className="mt-4">
              <ul className="flex gap-2.5 overflow-x-auto pb-1">
                {shots.map((src, i) => (
                  <li key={src} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Page ${i + 1}`} className="h-[92px] w-[66px] rounded-xl border border-line/60 object-cover" />
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => drop(i)}
                      aria-label={`Remove page ${i + 1}`}
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden className="h-[11px] w-[11px]">
                        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-muted">
                {pages.length === 1
                  ? "One page. Add another if the document runs to more."
                  : `${pages.length} pages, sent as one document.`}
              </p>
            </div>
          )}

          {/* ── the three ways in ── */}
          <div className="mt-4 space-y-2.5">
            <button type="button" className={option} onClick={() => library.current?.click()} disabled={busy}>
              <Slot name="photo" />
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold">Photo Library</span>
                <span className="block text-[12px] text-muted">A photo you have already taken</span>
              </span>
            </button>

            <button type="button" className={option} onClick={() => setCamera(true)} disabled={busy}>
              <Slot name="camera" />
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold">
                  {pages.length > 0 ? "Take another page" : "Take Photo"}
                </span>
                <span className="block text-[12px] text-muted">With a frame, so nothing gets cut off</span>
              </span>
            </button>

            <button type="button" className={option} onClick={() => anyFile.current?.click()} disabled={busy}>
              <Slot name="doc" />
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold">Choose File</span>
                <span className="block text-[12px] text-muted">A PDF from your files or email</span>
              </span>
            </button>
          </div>

          {pages.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSend(pages)}
              className="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-accent-dark text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Sending…" : pages.length === 1 ? "Send it" : `Send ${pages.length} pages`}
              <DoodleIcon name="upload" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="mt-4 h-[50px] w-full rounded-full border border-line/70 bg-white text-[14px] font-semibold text-muted"
            >
              Cancel
            </button>
          )}

          {/* The system pickers, kept out of sight. accept splits them the way
              the two buttons promise: the library one asks for images, which
              is what opens the phone straight onto the camera roll; the other
              admits a PDF, which is what opens Files. */}
          <input
            ref={library}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.currentTarget.value = "";
              if (picked.length) onSend(picked);
            }}
          />
          <input
            ref={anyFile}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.currentTarget.value = "";
              if (picked.length) onSend(picked);
            }}
          />
        </div>
      </div>

      {camera && (
        <DocCamera
          title={target.label}
          onShot={took}
          onClose={() => {
            setCamera(false);
            /* The camera failing is not the end of the road: its own screen
               offers "Choose a photo instead", and closing on that lands back
               here with the library a tap away. */
          }}
        />
      )}
    </>
  );
}

function Slot({ name }: { name: "photo" | "camera" | "doc" }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
      <DoodleIcon name={name === "photo" ? "pack/photo" : name === "camera" ? "camera" : "folder"} size={17} />
    </span>
  );
}
