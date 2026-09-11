"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "Sign your contract", live. Asks the OS for a DocuSeal session for this
 * landlord and this appraisal, and opens it in a new tab. When they finish,
 * the signed PDF comes back through the webhook and the next load of this
 * page has the step gone and the file at compliance. If signing is not
 * switched on, or the terms are not ready, the tile says so in place.
 */
export default function SignTile({
  appraisalId,
  label,
  sub,
  icon,
  variant = "tile",
}: {
  appraisalId: string;
  label: string;
  sub: string;
  icon: string;
  /** "button": the big call to action on the "Your next step" card (11 Sep 2026). */
  variant?: "tile" | "button";
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function open() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/landlord/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appraisalId }),
      });
      const j = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (j.ok && j.url) {
        window.open(j.url, "_blank", "noopener");
        setNote("Opened in a new tab. Refresh this page once you have signed.");
      } else {
        setNote(j.error ?? "Couldn't open the terms just now.");
      }
    } catch {
      setNote("Couldn't open the terms just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "button") {
    return (
      <div>
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="inline-flex items-center gap-3 rounded-full bg-accent-dark px-7 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Opening…" : label}
          <span aria-hidden>→</span>
        </button>
        {note && <p className="mt-2.5 text-[12px] text-muted">{note}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex flex-col items-center rounded-2xl border border-line/60 bg-white px-3 py-4 text-center transition-colors hover:border-ink/40 disabled:opacity-60"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name={icon} size={18} />
      </span>
      <span className="mt-3 text-[13px] font-semibold leading-tight">{busy ? "Opening…" : label}</span>
      <span className="mt-1 text-[11.5px] leading-snug text-muted">{note ?? sub}</span>
      <span className="mt-2.5 text-[13px] text-muted">›</span>
    </button>
  );
}
