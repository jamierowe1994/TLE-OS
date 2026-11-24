"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A finger signature, drawn once (Sean McMahon, ticket 88c98681; lib/id-stamp).
 *
 * Its own full-screen layer rather than the app's Sheet: the Sheet closes on a
 * downward swipe, and a downward stroke is half of most signatures. The ink is
 * kept as a PNG with a clear background, cut to the strokes, so it sits on the
 * band of the ID's PDF like ink on paper.
 */

export default function SignaturePad({
  onSave,
  onClose,
}: {
  onSave: (png: string) => Promise<void>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = 2.6;
    g.strokeStyle = "#1f1714";
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    last.current = p;
    const g = e.currentTarget.getContext("2d");
    if (!g) return;
    g.beginPath();
    g.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
    g.fillStyle = "#1f1714";
    g.fill();
    setInked(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const g = e.currentTarget.getContext("2d");
    if (!g) return;
    const p = at(e);
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };

  const up = () => {
    last.current = null;
  };

  const clear = () => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.restore();
    setInked(false);
    setError(null);
  };

  /* Cut to the ink, with a little room round it. */
  const trimmed = (): string | null => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return null;
    const { width: w, height: h } = c;
    const data = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const room = 8;
    x0 = Math.max(0, x0 - room);
    y0 = Math.max(0, y0 - room);
    x1 = Math.min(w - 1, x1 + room);
    y1 = Math.min(h - 1, y1 + room);
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext("2d")?.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  const save = async () => {
    const png = trimmed();
    if (!png) return setError("Sign in the box first.");
    setSaving(true);
    setError(null);
    try {
      await onSave(png);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-page px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]" style={{ color: "var(--m-ink)" }} role="dialog" aria-modal="true" aria-label="Draw your signature">
      <div className="flex items-center justify-between">
        <h2 className="hand text-[21px] leading-tight">Your Signature</h2>
        <button type="button" onClick={onClose} disabled={saving} className="h-11 px-2 text-[14.5px] font-semibold text-muted">
          Cancel
        </button>
      </div>
      <p className="mt-1 text-[14px] leading-snug text-muted">Sign with your finger. It goes under the declaration on every ID you send, so you only do this once.</p>
      {/* Wide and short, like the line on a form: a tall box invites a tall,
          cramped signature that shrinks to nothing in the band. */}
      <div className="relative mt-4 h-[min(260px,45dvh)] overflow-hidden rounded-2xl border border-[color:var(--m-line)] bg-white">
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          aria-label="Signature box"
        />
        <span aria-hidden className="pointer-events-none absolute bottom-[30%] left-6 right-6 border-b border-dashed border-[color:var(--m-line)]" />
        {!inked && <span className="pointer-events-none absolute inset-x-0 bottom-[calc(30%-26px)] text-center text-[13px] text-muted">Sign above the line</span>}
      </div>
      {error && <p className="mt-3 text-[14px] font-semibold" style={{ color: "#b0412e" }}>{error}</p>}
      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" onClick={clear} disabled={saving || !inked} className="h-14 rounded-2xl border border-[color:var(--m-line)] bg-card text-[15px] font-semibold disabled:opacity-40">
          Clear
        </button>
        <button type="button" onClick={save} disabled={saving || !inked} className="flex h-14 items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white disabled:opacity-40" style={{ background: "var(--brown)" }}>
          {saving ? <><span className="block h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/40 border-t-white" /> Saving</> : "Save Signature"}
        </button>
      </div>
    </div>
  );
}
