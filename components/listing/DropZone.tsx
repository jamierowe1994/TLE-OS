"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE DROP ZONE (James, 11 Sep 2026): "Upload photos" or "File the EPC"
 * and a page appears - expanding out of the middle of the screen, up and
 * down, exaggerated on purpose - with one big box: drop it here. As the
 * files go up a bar shows the progress, and each one appears at the foot
 * as it lands. Making the step feel easy is the whole point.
 *
 * Two jobs, one surface:
 *   photos  → /api/r2/upload, scope "photo", under the listing's own prefix
 *   epc     → the certificate reader first (type, dates, the address on it),
 *             then filed through the same intake the compliance backlog
 *             uses, so REX gets it too
 */

export type DropKind = "photos" | "epc";

export interface Landed {
  name: string;
  /** A preview, where there is one (photographs). */
  url?: string;
  note?: string;
}

const ACCEPT: Record<DropKind, string> = {
  photos: "image/jpeg,image/png,image/webp,image/avif,image/heic",
  epc: "application/pdf,image/*",
};

export default function DropZone({
  kind,
  refId,
  propertyId,
  address,
  onClose,
  onLanded,
}: {
  kind: DropKind;
  /** The listing, for the photo prefix: "listing-<id>". */
  refId: string;
  /** The REX property behind the listing, for filing a certificate. */
  propertyId?: string | null;
  /** Else the address, and the file is held against it until the property exists. */
  address?: string | null;
  onClose: () => void;
  /** Every file that landed, as it lands. */
  onLanded?: (f: Landed) => void;
}) {
  const [shown, setShown] = useState(false);
  const [over, setOver] = useState(false);
  const [queue, setQueue] = useState<{ name: string; pct: number; done: boolean; error?: string; url?: string; note?: string }[]>([]);
  /* The EPC needs an expiry. The reader finds it on the certificate nearly
     every time; when it cannot, the agent types it. */
  const [expiry, setExpiry] = useState("");
  const [pendingEpc, setPendingEpc] = useState<{ file: File; note: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const words =
    kind === "photos"
      ? { title: "Add the photographs", drop: "Drop the photos here", sub: "JPEG, PNG or HEIC. As many as you like, in one go.", icon: "folder" }
      : { title: "File the EPC", drop: "Drop your EPC here", sub: "The certificate as a PDF or a photograph of it. We read the rating and the dates off it.", icon: "shield" };

  /** One file up, with a progress bar the whole way. */
  function upload(url: string, body: FormData, onPct: (p: number) => void): Promise<{ ok: boolean; [k: string]: unknown }> {
    return new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open("POST", url);
      x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
      x.onload = () => {
        try {
          resolve(JSON.parse(x.responseText));
        } catch {
          resolve({ ok: false, error: "The upload did not answer." });
        }
      };
      x.onerror = () => resolve({ ok: false, error: "The upload did not land." });
      x.send(body);
    });
  }

  async function take(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    if (kind === "photos") {
      for (const f of list) {
        const i = queue.length;
        setQueue((q) => [...q, { name: f.name, pct: 0, done: false }]);
        const body = new FormData();
        body.append("file", f);
        body.append("scope", "photo");
        body.append("ref", refId);
        const j = await upload("/api/r2/upload", body, (pct) => setQueue((q) => q.map((r, k) => (k === i ? { ...r, pct } : r))));
        setQueue((q) =>
          q.map((r, k) =>
            k === i
              ? j.ok
                ? { ...r, pct: 100, done: true, url: String(j.url) }
                : { ...r, pct: 100, done: true, error: String(j.error ?? "The upload did not land.") }
              : r
          )
        );
        if (j.ok) onLanded?.({ name: f.name, url: String(j.url) });
      }
      return;
    }
    /* The EPC: read it first. */
    const f = list[0];
    setQueue([{ name: f.name, pct: 10, done: false, note: "Reading the certificate…" }]);
    const readBody = new FormData();
    readBody.append("file", f);
    readBody.append("expect", "epc");
    const read = await upload("/api/compliance/certificates/read", readBody, (pct) => setQueue([{ name: f.name, pct: Math.min(60, pct * 0.6), done: false, note: "Reading the certificate…" }]));
    const r = (read.ok ? (read.read as { expiry?: string | null; issue?: string | null; notes?: string }) : null) ?? null;
    if (!r?.expiry) {
      setPendingEpc({ file: f, note: read.ok ? "The reader could not find an expiry date on it. Type it in and file it." : String(read.error ?? "The reader could not open it. Type the expiry in and file it.") });
      setQueue([{ name: f.name, pct: 60, done: false, note: "Waiting for the expiry date" }]);
      return;
    }
    await file(f, r.expiry, r.issue ?? "");
  }

  async function file(f: File, exp: string, issue: string) {
    setQueue([{ name: f.name, pct: 70, done: false, note: "Filing it…" }]);
    const body = new FormData();
    body.set("file", f);
    if (propertyId) body.set("propertyId", propertyId);
    else if (address) body.set("address", address);
    body.set("type", "epc");
    body.set("expiry", exp);
    if (issue) body.set("issue", issue);
    if (address) body.set("propertyName", address);
    body.set("source", "attached on the listing");
    const j = await upload("/api/compliance/certificates", body, () => undefined);
    setQueue([
      j.ok
        ? { name: f.name, pct: 100, done: true, note: `EPC filed, expires ${new Date(`${exp}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` }
        : { name: f.name, pct: 100, done: true, error: String(j.error ?? "The upload did not land.") },
    ]);
    setPendingEpc(null);
    if (j.ok) onLanded?.({ name: f.name, note: `expires ${exp}` });
  }

  const landed = queue.filter((q) => q.done && !q.error).length;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/40 transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      {/* Out of the middle, up and down. The overshoot on the curve is the
          exaggeration James asked for. */}
      <div
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border border-line/50 bg-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.5)]"
        style={{
          transform: shown ? "scaleY(1)" : "scaleY(0.02)",
          opacity: shown ? 1 : 0.4,
          transformOrigin: "50% 50%",
          transition: "transform 620ms cubic-bezier(0.18, 1.35, 0.32, 1), opacity 260ms ease-out",
        }}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-6">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark">{kind === "photos" ? "Marketing" : "Compliance"}</p>
            <h2 className="hand mt-1 text-[24px] leading-tight">{words.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink" title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-5">
          <input ref={input} type="file" accept={ACCEPT[kind]} multiple={kind === "photos"} className="hidden" onChange={(e) => { void take(e.target.files); e.target.value = ""; }} />
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-6 py-14 text-center transition-colors ${
              over ? "border-accent-dark bg-accent-soft/60" : "border-line/80 bg-page hover:border-accent-dark/60 hover:bg-accent-soft/30"
            }`}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name={over ? "upload" : words.icon} size={26} />
            </span>
            <p className="hand mt-5 text-[22px]">{over ? "Let go" : words.drop}</p>
            <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">{words.sub}</p>
            <span className="mt-5 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">Or choose {kind === "photos" ? "the files" : "the file"}</span>
          </div>

          {/* The EPC with no date on it: one field, one button. */}
          {pendingEpc && (
            <div className="mt-4 rounded-2xl border border-accent/60 bg-accent-soft/40 p-4">
              <p className="text-[12.5px] leading-relaxed">{pendingEpc.note}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-10 rounded-xl border border-line/70 bg-white px-3 text-[13px] outline-none focus:border-ink" />
                <button
                  type="button"
                  disabled={!expiry}
                  onClick={() => void file(pendingEpc.file, expiry, "")}
                  className="rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  File the EPC
                </button>
              </div>
            </div>
          )}

          {/* What has landed, as it lands. */}
          {queue.length > 0 && (
            <div className="mt-5">
              <div className="flex items-baseline justify-between text-[11.5px] text-muted">
                <span>{landed} of {queue.length} landed</span>
                <span className="figures">{Math.round(queue.reduce((s, q) => s + q.pct, 0) / queue.length)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/40">
                <div className="h-full rounded-full bg-accent-dark transition-[width] duration-300" style={{ width: `${queue.reduce((s, q) => s + q.pct, 0) / queue.length}%` }} />
              </div>
              <ul className={`mt-4 ${kind === "photos" ? "grid grid-cols-3 gap-2.5 sm:grid-cols-4" : "space-y-2"}`}>
                {queue.map((q, i) => (
                  <li key={q.name + i} className={kind === "photos" ? "fade-up overflow-hidden rounded-xl border border-line/50 bg-page" : "fade-up flex items-center gap-3 rounded-xl border border-line/50 px-3.5 py-2.5 text-[12.5px]"}>
                    {kind === "photos" ? (
                      <div className="relative aspect-[4/3]">
                        {q.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={q.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            {q.error ? <span className="px-2 text-center text-[10.5px] text-accent-dark">{q.error}</span> : <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${q.done && !q.error ? "bg-[#f4f3ec] text-[#63614a]" : q.error ? "bg-accent-soft text-accent-dark" : "bg-page"}`}>
                          {q.done && !q.error ? "✓" : q.error ? "!" : <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{q.name}</span>
                        <span className={`shrink-0 text-[11px] ${q.error ? "text-accent-dark" : "text-muted"}`}>{q.error ?? q.note}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {landed > 0 && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line/50 px-7 py-4">
            <button type="button" onClick={onClose} className="rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
