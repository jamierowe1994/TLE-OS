"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * One upload button, for one kind of document: the row already says what
 * the file is, so the landlord only picks the file. The route files the
 * bytes under their account and records the kind; the page refreshes and
 * the row moves from "we need" to "sent". The sample has nothing behind it,
 * so there the button explains rather than sends.
 */
export default function UploadDoc({
  kind,
  appraisalId,
  sample = false,
  label = "Send it",
  tone = "dark",
}: {
  kind: string;
  appraisalId?: string | null;
  sample?: boolean;
  label?: string;
  tone?: "dark" | "light";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);

  async function upload(file: File) {
    if (sample) {
      setNote({ text: "On the sample nothing is filed. A real landlord's file goes onto their record here.", err: false });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", kind);
      if (appraisalId) body.set("appraisalId", appraisalId);
      const res = await fetch("/api/landlord/documents", { method: "POST", body });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Upload failed");
      setNote({ text: `Received: ${file.name}. Thank you.`, err: false });
      router.refresh();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "Upload failed", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <label
        className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-semibold transition-opacity hover:opacity-90 ${
          tone === "dark" ? "bg-accent-dark text-white" : "border border-line/70 bg-white text-ink hover:border-ink/40"
        } ${busy ? "opacity-60" : ""}`}
      >
        {busy ? "Sending…" : label}
        <DoodleIcon name="upload" size={13} />
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
      {note && <span className={`max-w-[260px] text-right text-[11.5px] ${note.err ? "font-semibold text-accent-dark" : "text-muted"}`}>{note.text}</span>}
    </span>
  );
}
