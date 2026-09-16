"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import SendSheet from "@/components/landlord/SendSheet";

/**
 * One upload button, for one kind of document: the row already says what
 * the file is, so the landlord only picks the file. The route files the
 * bytes under their account and records the kind; the page refreshes and
 * the row moves from "we need" to "sent". The sample has nothing behind it,
 * so there the button explains rather than sends.
 *
 * ── Two behaviours, because the two devices are not the same problem ───────
 *
 * On a PHONE the button opens our own sheet - Photo Library, Take Photo,
 * Choose File - because the camera is in the landlord's hand and Take Photo
 * has to be ours if it is to have a guide frame on it (see SendSheet).
 *
 * On a DESKTOP it stays what it was: a file picker, one click, no ceremony.
 * A sheet there would be three taps to reach the same dialogue, and the
 * landlord at a desk with a paper certificate is served by the QR code at the
 * top of the page instead - which hands the job to the phone that does have a
 * camera.
 */
export default function UploadDoc({
  kind,
  appraisalId,
  sample = false,
  label = "Send it",
  tone = "dark",
  /** What the document is called, for the camera's heading and the PDF name. */
  title,
}: {
  kind: string;
  appraisalId?: string | null;
  sample?: boolean;
  label?: string;
  tone?: "dark" | "light";
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);
  const [phone, setPhone] = useState(false);

  /* Measured rather than guessed from the user agent, and measured on the
     client only - a server render cannot know, and guessing produces a sheet
     that appears a frame after the click on the wrong device. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const read = () => setPhone(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);

  async function upload(files: File[]) {
    if (sample) {
      setSheet(false);
      setNote({ text: "On the sample nothing is filed. A real landlord's file goes onto their record here.", err: false });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const body = new FormData();
      for (const f of files) body.append("file", f);
      body.set("kind", kind);
      if (title) body.set("label", title);
      if (appraisalId) body.set("appraisalId", appraisalId);
      const res = await fetch("/api/landlord/documents", { method: "POST", body });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Upload failed");
      setSheet(false);
      setNote({
        text: files.length > 1 ? `Received: ${files.length} pages. Thank you.` : `Received: ${files[0].name}. Thank you.`,
        err: false,
      });
      router.refresh();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "Upload failed", err: true });
    } finally {
      setBusy(false);
    }
  }

  const look = `inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-semibold transition-opacity hover:opacity-90 ${
    tone === "dark" ? "bg-accent-dark text-white" : "border border-line/70 bg-white text-ink hover:border-ink/40"
  } ${busy ? "opacity-60" : ""}`;

  return (
    <span className="flex flex-col items-end gap-1">
      {phone ? (
        <button type="button" className={look} disabled={busy} onClick={() => setSheet(true)}>
          {busy ? "Sending…" : label}
          <DoodleIcon name="upload" size={13} />
        </button>
      ) : (
        <label className={look}>
          {busy ? "Sending…" : label}
          <DoodleIcon name="upload" size={13} />
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            multiple
            disabled={busy}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.currentTarget.value = "";
              if (picked.length) void upload(picked);
            }}
          />
        </label>
      )}
      {note && <span className={`max-w-[260px] text-right text-[11.5px] ${note.err ? "font-semibold text-accent-dark" : "text-muted"}`}>{note.text}</span>}

      {sheet && (
        <SendSheet
          target={{ kind, label: title ?? "Document" }}
          busy={busy}
          onSend={(files) => void upload(files)}
          onClose={() => setSheet(false)}
        />
      )}
    </span>
  );
}
