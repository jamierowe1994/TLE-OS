"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import SignModal from "@/components/landlord/SignModal";

/**
 * "Sign your contract", live. Asks the OS for a signing session for this
 * landlord and this appraisal, and opens it IN A MODAL ON THIS PAGE - never
 * in a new tab. James, 14 Sep 2026: "it will look a bit shocking for them to
 * get sent to some random site. No one's heard of DocuSeal." When they finish,
 * the signed PDF comes back through the webhook and the next load of this
 * page has the step gone and the file at compliance. If signing is not
 * switched on, or the terms are not ready, the tile says so in place.
 */
export default function SignTile({
  appraisalId,
  url,
  label,
  sub,
  icon,
  variant = "tile",
}: {
  appraisalId: string | null;
  /**
   * A contract that already exists, opened straight in the modal without
   * asking the OS for one.
   *
   * The harness needs this. Its sign tile was a plain external link, so the
   * demo kept opening a new tab to DocuSeal while the real portal opened the
   * modal - James refreshed it, saw no change, and was right: the modal had
   * never applied there. The screen built to show people what this looks like
   * has to be the screen that looks like it.
   */
  url?: string | null;
  label: string;
  sub: string;
  icon: string;
  /** "button": the big call to action on the "Your next step" card (11 Sep 2026).
   *  "link": the quiet one on the "Also:" line. */
  variant?: "tile" | "button" | "row" | "link";
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);

  async function open() {
    if (busy) return;
    /* Already have one: straight into the modal, no session to mint. */
    if (url) {
      setSigning(url);
      return;
    }
    if (!appraisalId) {
      setNote("There is no contract on this file yet.");
      return;
    }
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
        setSigning(j.url);
      } else {
        setNote(j.error ?? "Couldn't open the terms just now.");
      }
    } catch {
      setNote("Couldn't open the terms just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const modal = signing ? (
    <SignModal
      url={signing}
      onClose={() => setSigning(null)}
      onDone={() => {
        setSigning(null);
        /* The webhook files it; this only makes the page behind agree. */
        window.location.reload();
      }}
    />
  ) : null;

  if (variant === "row") {
    return (
      <>
      <button type="button" onClick={open} disabled={busy} className="flex w-full items-center gap-4 py-3.5 text-left transition-opacity hover:opacity-80 disabled:opacity-60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
          <DoodleIcon name={icon} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{busy ? "Opening…" : label}</span>
          <span className="block text-[12px] text-muted">{note ?? sub}</span>
        </span>
        <span aria-hidden className="text-[15px] text-muted">›</span>
      </button>
      {modal}
      </>
    );
  }

  if (variant === "link") {
    return (
      <>
      <button type="button" onClick={open} disabled={busy} className="font-semibold text-ink underline decoration-line underline-offset-4 transition hover:decoration-ink disabled:opacity-60">
        {busy ? "Opening…" : label}
      </button>
      {modal}
      </>
    );
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
        {modal}
      </div>
    );
  }

  /* The modal is a SIBLING of the button, never a child: a dialog inside a
     <button> is invalid, and every click inside it would press the button
     underneath and open a second session. */
  return (
    <>
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
    {modal}
    </>
  );
}
