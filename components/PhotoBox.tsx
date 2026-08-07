"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The place a property photo goes — and now actually goes.
 *
 * A thin outlined box with a drawing in it, so an empty record still looks
 * composed rather than broken. Click it, drop a file on it, or use the upload
 * button that appears on hover.
 *
 * The local preview shows IMMEDIATELY, before the upload finishes, because a
 * box that sits blank for three seconds after you drop a file feels broken
 * even though it's working. The real stored file takes over when it lands.
 *
 * If the upload fails the preview is thrown away rather than left sitting
 * there — a picture on screen that isn't in the bucket is a lie the agent will
 * believe.
 */

export type StoredFile = { key: string; name: string; url: string };

export default function PhotoBox({
  className = "",
  label = "Add a photo",
  scope = "photo",
  refId = "unfiled",
  fill = false,
  onStored,
}: {
  className?: string;
  label?: string;
  /** "photo" or "document" — decides the allowlist and where it's filed. */
  scope?: "photo" | "document";
  /** Which record this belongs to, so everything for it shares a prefix. */
  refId?: string;
  /** Fill the height given instead of holding 4:3 — for when the photo IS
   *  the column rather than a thumbnail in one. */
  fill?: boolean;
  onStored?: (file: StoredFile) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Object URLs are a leak if you drop them on the floor.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function take(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setError(null);

    const local = URL.createObjectURL(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return local; });
    setBusy(true);

    try {
      const body = new FormData();
      body.append("file", f);
      body.append("scope", scope);
      body.append("ref", refId);
      const res = await fetch("/api/r2/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload failed.");
      const file: StoredFile = { key: json.key, name: json.name, url: json.url };
      setStored(file);
      onStored?.(file);
    } catch (e) {
      // Don't leave a picture on screen that isn't in the bucket.
      setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
      setStored(null);
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const shown = stored?.url ?? preview;

  return (
    <div className={`${fill ? "flex h-full flex-col" : ""} ${className}`}>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        onClick={() => !busy && input.current?.click()}
        className={`group relative flex ${
          fill ? "min-h-0 flex-1" : "aspect-[4/3]"
        } w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-colors ${
          over
            ? "border-accent-dark bg-accent-soft/40"
            : error
              ? "border-accent-dark"
              : "border-dashed border-line hover:border-ink/40"
        }`}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/notioly/moving.svg"
              alt=""
              aria-hidden
              className="art h-14 w-14 opacity-45"
            />
            <span className="text-[10.5px] text-muted">{over ? "Drop it" : label}</span>
          </div>
        )}

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-page/70">
            <span className="block h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          </span>
        )}

        {/* The upload affordance, only while pointing at it. */}
        {!busy && (
          <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line/80 bg-page text-muted opacity-0 transition-opacity group-hover:opacity-100">
            <DoodleIcon name="upload" size={13} />
          </span>
        )}

        <input
          ref={input}
          type="file"
          accept={scope === "photo" ? "image/*" : "image/*,application/pdf"}
          hidden
          onChange={(e) => take(e.target.files)}
        />
      </div>

      {error && <p className="mt-1.5 text-[10.5px] leading-tight text-accent-dark">{error}</p>}
      {stored && !error && (
        <p className="mt-1.5 truncate text-[10px] leading-tight text-muted" title={stored.name}>
          Stored · {stored.name}
        </p>
      )}
    </div>
  );
}
