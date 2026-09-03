"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Documents up. The one piece of the sample page that was always real: the
 * upload goes to R2 under the landlord's own reference. What we ask for is
 * listed beside it, so a landlord knows what to send without being told on
 * the phone.
 */
export default function LandlordDocuments({
  accountId,
  wanted,
  compact = false,
}: {
  accountId: string;
  wanted: string[];
  /** Just the button and what arrives - for a panel that already lists what is wanted. */
  compact?: boolean;
}) {
  const [uploads, setUploads] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("scope", "document");
      body.set("ref", `landlord-${accountId}`);
      const res = await fetch("/api/r2/upload", { method: "POST", body });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Upload failed");
      setUploads((cur) => [...cur, { name: j.name, url: j.url }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 ${busy ? "opacity-60" : ""}`}>
            {busy ? "Uploading…" : "Upload documents"}
            <DoodleIcon name="upload" size={13} className="text-white" />
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <a href="#documents" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink">
            View all documents <span className="text-[11px]">›</span>
          </a>
        </div>
        {err && <p className="mt-2 text-[12px] font-semibold text-accent-dark">{err}</p>}
        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {uploads.map((u) => (
              <li key={u.url} className="flex items-center justify-between gap-3 rounded-xl border border-line/60 bg-white px-3 py-2">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-[11px] font-semibold text-accent-dark">Received</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">What we&rsquo;ll need from you</p>
        <ul className="mt-2.5 space-y-2 text-[12.5px]">
          {wanted.map((w) => (
            <li key={w} className="flex items-start gap-2.5">
              <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-line/80" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line px-4 py-7 text-center transition-colors hover:border-ink/50 ${busy ? "opacity-60" : ""}`}
        >
          <DoodleIcon name="upload" size={22} className="text-accent-dark" />
          <span className="mt-2 text-[13px] font-semibold">{busy ? "Uploading…" : "Send us a document"}</span>
          <span className="mt-1 text-[11.5px] text-muted">A photo or a PDF is fine. Certificates, ID, proof of ownership.</span>
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {err && <p className="mt-2 text-[12px] font-semibold text-accent-dark">{err}</p>}
        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {uploads.map((u) => (
              <li key={u.url} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-box px-3 py-2">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-[11px] font-semibold text-accent-dark">Received</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
