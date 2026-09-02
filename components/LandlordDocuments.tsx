"use client";

import { useState } from "react";

const RED = "#e31f36";

/**
 * Documents up. The one piece of the sample page that was always real: the
 * upload goes to R2 under the landlord's own reference. What we ask for is
 * listed beside it, so a landlord knows what to send without being told on
 * the phone.
 */
export default function LandlordDocuments({ accountId, wanted }: { accountId: string; wanted: string[] }) {
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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-[12px] font-bold">What we&rsquo;ll need from you</p>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-black/70">
          {wanted.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: RED }} />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/20 px-4 py-6 text-center transition-colors hover:border-black/40 ${busy ? "opacity-60" : ""}`}
        >
          <span className="text-[13px] font-bold">{busy ? "Uploading…" : "Send us a document"}</span>
          <span className="mt-1 text-[11.5px] text-black/50">A photo or a PDF is fine. Certificates, ID, proof of ownership.</span>
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
        {err && <p className="mt-2 text-[12px] font-semibold" style={{ color: RED }}>{err}</p>}
        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {uploads.map((u) => (
              <li key={u.url} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-[11px] font-bold" style={{ color: RED }}>Received</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
