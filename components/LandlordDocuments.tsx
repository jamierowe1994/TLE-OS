"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Documents up, recorded.
 *
 * The landlord says what the file is - photo ID, proof of ownership, the
 * gas certificate, the EICR, the EPC - and sends it. The route files the
 * bytes under their account and records the kind, and this page refreshes
 * so the row turns green and the ask comes off their list. The sample page
 * has no account behind it, so there the button explains rather than sends.
 */

const KINDS: Array<{ id: string; label: string }> = [
  { id: "id", label: "Photo ID" },
  { id: "ownership", label: "Proof of ownership" },
  { id: "gas", label: "Gas safety certificate (CP12)" },
  { id: "eicr", label: "Electrical safety report (EICR)" },
  { id: "epc", label: "Energy Performance Certificate (EPC)" },
  { id: "other", label: "Something else" },
];

export default function LandlordDocuments({
  appraisalId,
  sample = false,
  wanted = [],
}: {
  appraisalId?: string | null;
  /** The Raj page: nothing behind it to file to. */
  sample?: boolean;
  /** Kinds still missing, so the picker starts on the first of them. */
  wanted?: string[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<string>(wanted[0] && KINDS.some((k) => k.id === wanted[0]) ? wanted[0] : "id");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err">("ok");

  async function upload(file: File) {
    if (sample) {
      setTone("ok");
      setNote("On the sample nothing is filed. A real landlord's upload goes to their file and turns the row green.");
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
      setTone("ok");
      setNote(`Received: ${file.name}. Thank you.`);
      router.refresh();
    } catch (e) {
      setTone("err");
      setNote(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="What is this document?"
          className="rounded-full border border-line/80 bg-white px-3 py-2 text-[12px] outline-none focus:border-accent"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : "Upload"}
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
      {note && <p className={`mt-2 text-[12px] ${tone === "err" ? "font-semibold text-accent-dark" : "text-muted"}`}>{note}</p>}
    </div>
  );
}
