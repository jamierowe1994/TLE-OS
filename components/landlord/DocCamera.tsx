"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * TAKE A PHOTO OF A DOCUMENT, inside a frame.
 *
 * James, 16 Sep 2026: "we should offer guide rails ... a positioning box to
 * make sure that the document doesn't get cut off ... a bit like when you do
 * an ID check. Centre the ID or the document scan, make sure it's within this
 * border, so they're not going outside the lines."
 *
 * The reason this is worth building rather than handing them the phone's own
 * camera: a certificate photographed at arm's length with the edges cut off is
 * a document the office has to ask for again, and the landlord has no way of
 * knowing that until somebody emails them. The frame is the whole feature. It
 * is not decoration over a viewfinder - what is INSIDE it is what gets sent,
 * cropped here, so the promise the frame makes is one the file keeps.
 *
 * ── Why the crop happens on the phone ──────────────────────────────────────
 *
 * It would be less code to send the whole frame and crop later. But then the
 * guide is a lie: a landlord who lined the certificate up inside the box and
 * got back a photograph of their kitchen table has been told the box meant
 * something. Cropping here also cuts what goes over the wire by about two
 * thirds, which on a phone on 4G in somebody's hallway is the difference
 * between a send and a spinner.
 *
 * ── Why there is a fallback ────────────────────────────────────────────────
 *
 * getUserMedia needs a secure origin and a permission the landlord may refuse,
 * and in some in-app browsers (a link opened inside Gmail or Outlook) it is
 * simply not there. None of that may end with "you cannot send a photograph",
 * so a failure hands straight over to the phone's own camera through a plain
 * file input - no frame, but a document - and says which it is doing.
 */

/**
 * WHERE THE FRAME IS IN THE CAMERA'S OWN PICTURE.
 *
 * Exported and pure because it is the one piece of this component that can be
 * wrong without looking wrong. The video is drawn with object-fit: cover, so
 * the picture is scaled up until it fills the box and the overflow is cut off
 * the sides (or the top and bottom). That means the frame's position ON SCREEN
 * is not its position in the source, and cropping by the on-screen numbers
 * takes the wrong rectangle on every phone whose camera is a different shape
 * from its screen - which is all of them. So the cover transform is worked out
 * and undone: one scale, two offsets.
 *
 * Clamped at the end, because a frame that reaches past the edge of the
 * picture would otherwise ask drawImage for pixels that do not exist and come
 * back with a black band down one side.
 *
 * All four inputs are in CSS pixels relative to the video element's own box.
 */
export function frameToSource(
  view: { w: number; h: number },
  frame: { x: number; y: number; w: number; h: number },
  src: { w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  if (!src.w || !src.h || !view.w || !view.h) return { x: 0, y: 0, w: src.w || 1, h: src.h || 1 };
  const scale = Math.max(view.w / src.w, view.h / src.h);
  const offX = (view.w - src.w * scale) / 2;
  const offY = (view.h - src.h * scale) / 2;

  const x = Math.max(0, Math.min((frame.x - offX) / scale, src.w));
  const y = Math.max(0, Math.min((frame.y - offY) / scale, src.h));
  return {
    x,
    y,
    w: Math.max(1, Math.min(frame.w / scale, src.w - x)),
    h: Math.max(1, Math.min(frame.h / scale, src.h - y)),
  };
}

/** The frame's aspect, and why: A4 portrait is 1:1.414. Certificates are
 *  almost always A4, and a square guide over an A4 page either cuts the top
 *  and bottom off or leaves so much room either side that nobody lines
 *  anything up. Landscape is offered because an EICR summary often is. */
const SHAPES = {
  portrait: { w: 1, h: 1.414, label: "Portrait" },
  landscape: { w: 1.414, h: 1, label: "Landscape" },
} as const;
type Shape = keyof typeof SHAPES;

export default function DocCamera({
  title,
  onShot,
  onClose,
}: {
  /** What they are photographing, so the frame can say it. */
  title: string;
  /** The cropped page. Called once per shot; the sheet decides what happens. */
  onShot: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const [shape, setShape] = useState<Shape>("portrait");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  /* Stop the camera on the way out, always. A live camera behind a closed
     sheet is a green dot on somebody's phone with nothing on screen to
     explain it, and on iOS it survives a route change. */
  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setFailed(
          window.isSecureContext === false
            ? "This page needs a secure connection to open the camera."
            : "This browser will not open the camera here."
        );
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          /* The BACK camera, and as much of it as the phone will give: a
             document photographed at 640px is a document nobody can read the
             expiry date on. ideal rather than exact so a laptop webcam, which
             has no environment camera at all, still opens. */
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 2560 } },
          audio: false,
        });
        if (dead) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        const err = e as { name?: string };
        setFailed(
          err.name === "NotAllowedError"
            ? "The camera was not allowed. You can still choose a photo instead."
            : "The camera would not open. You can still choose a photo instead."
        );
      }
    })();
    return () => {
      dead = true;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** THE SHOT: what is inside the frame, and only that. See frameToSource. */
  const shoot = () => {
    const v = video.current;
    const box = frame.current;
    if (!v || !box || !v.videoWidth) return;

    const view = v.getBoundingClientRect();
    const f = box.getBoundingClientRect();
    const cut = frameToSource(
      { w: view.width, h: view.height },
      { x: f.left - view.left, y: f.top - view.top, w: f.width, h: f.height },
      { w: v.videoWidth, h: v.videoHeight }
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cut.w);
    canvas.height = Math.round(cut.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, cut.x, cut.y, cut.w, cut.h, 0, 0, canvas.width, canvas.height);

    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const stamp = new Date().toISOString().slice(0, 10);
        onShot(new File([blob], `${slug(title)}-${stamp}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      /* 0.9: a compliance certificate is read by a person looking for a date
         and a serial number, and JPEG artefacts around small type at 0.7 are
         exactly where that goes wrong. A cropped A4 page at 0.9 is around
         400KB - nothing against the 25MB the route allows. */
      0.9
    );
  };

  const s = SHAPES[shape];

  return (
    <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "#14100f" }}>
      <style>{`
        @keyframes doc-flash { from { opacity: 0.85 } to { opacity: 0 } }
      `}</style>

      {/* ── what they are photographing, and the way out ── */}
      <div className="flex shrink-0 items-center gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the camera"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{title}</p>
        {!failed && (
          <div className="flex shrink-0 rounded-full p-[3px]" style={{ background: "rgba(255,255,255,0.14)" }}>
            {(Object.keys(SHAPES) as Shape[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setShape(k)}
                aria-pressed={shape === k}
                className="rounded-full px-3 py-1 text-[11.5px] font-semibold"
                style={shape === k ? { background: "#fff", color: "#14100f" } : { color: "rgba(255,255,255,0.75)" }}
              >
                {SHAPES[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {failed ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p className="text-[15px] leading-relaxed text-white/80">{failed}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-full px-6 py-3 text-[14px] font-semibold"
            style={{ background: "#fff", color: "#14100f" }}
          >
            Choose a photo instead
          </button>
        </div>
      ) : (
        <>
          {/* ── the viewfinder, with the frame over it ── */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* THE GUIDE. A hole cut in a dark wash rather than a drawn
                rectangle: the darkened surround is what actually makes
                somebody move the phone, where an outline alone reads as
                decoration and gets ignored. The hole is a huge spread shadow
                on the frame itself, so there is one element and it can never
                drift out of line with what gets cropped. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div
                ref={frame}
                className="relative"
                style={{
                  aspectRatio: `${s.w} / ${s.h}`,
                  /* Whichever of the two runs out first, so the frame is
                     always whole and always the same shape. */
                  width: shape === "portrait" ? "min(100%, calc((100% - 0px) * 0.72))" : "100%",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  height: shape === "portrait" ? "auto" : undefined,
                  boxShadow: "0 0 0 9999px rgba(10, 8, 7, 0.62)",
                  borderRadius: 14,
                  transition: "aspect-ratio 200ms ease",
                }}
              >
                {/* The corners. Four brackets rather than a box outline -
                    a continuous border reads as a photo frame, corners read
                    as an alignment target, which is the one this has to be. */}
                {(
                  [
                    ["top-0 left-0", "border-t-[3px] border-l-[3px] rounded-tl-[12px]"],
                    ["top-0 right-0", "border-t-[3px] border-r-[3px] rounded-tr-[12px]"],
                    ["bottom-0 left-0", "border-b-[3px] border-l-[3px] rounded-bl-[12px]"],
                    ["bottom-0 right-0", "border-b-[3px] border-r-[3px] rounded-br-[12px]"],
                  ] as const
                ).map(([at, edge]) => (
                  <span
                    key={at}
                    className={`absolute h-8 w-8 ${at} ${edge}`}
                    style={{ borderColor: ready ? "#cfa096" : "rgba(255,255,255,0.5)" }}
                  />
                ))}
              </div>
            </div>

            {flash && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-white"
                style={{ animation: "doc-flash 180ms ease-out forwards" }}
              />
            )}
          </div>

          {/* ── the instruction and the shutter ── */}
          <div className="shrink-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-center">
            <p className="text-[13px] leading-relaxed text-white/70">
              Fit the whole document inside the frame. Everything outside it is cut off.
            </p>
            <button
              type="button"
              onClick={shoot}
              disabled={!ready}
              aria-label="Take the photo"
              className="mx-auto mt-4 flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.22)" }}
            >
              <span className="block h-[58px] w-[58px] rounded-full bg-white" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "document";
