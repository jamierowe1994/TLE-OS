"use client";

import { useState } from "react";

/**
 * "UPLOAD IT NOW" - beside a certificate the landlord says they hold (James,
 * 26 Nov 2026: "if they have a current one ... we should give the landlord
 * the option to potentially upload it at that point"). Optional: nothing waits
 * on it, and the question is answered either way. A PDF or photos (a
 * two-sided certificate is two shots, filed as one). Styled by .tq-up in
 * app/terms-edge.css.
 */
export default function CertUpload({ url, kind, title, had = null, onDone }: {
  /** Where it goes: /api/sign/<token>/certificate. */
  url: string;
  kind: string;
  title: string;
  /** The name of the one already uploaded from this link, if any. */
  had?: string | null;
  onDone?: (kind: string, name: string) => void;
}) {
  const [name, setName] = useState<string | null>(had);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);

  async function send(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length || busy) return;
    setBad(null);
    setBusy(true);
    const body = new FormData();
    body.set("kind", kind);
    body.set("label", title);
    for (const f of files) body.append("file", f);
    const j = await fetch(url, { method: "POST", body })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (j?.ok) {
      setName(String(j.name ?? files[0].name));
      onDone?.(kind, String(j.name ?? files[0].name));
    } else setBad(j?.error ?? "That didn't upload. Try again, or skip it and send it to your agent later.");
  }

  const pick = (label: string) => (
    <>
      {label}
      <input type="file" accept="application/pdf,image/*" multiple hidden disabled={busy} onChange={(e) => { void send(e.target.files); e.target.value = ""; }} />
    </>
  );

  return (
    <div className="tq-up">
      {name ? (
        <div className="tq-up-done" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          <span><b>We have it.</b> {name}. Our compliance team will check it.</span>
          <label>{pick(busy ? "Sending…" : "Replace")}</label>
        </div>
      ) : (
        <>
          <p><b>Have it to hand?</b> Upload it now and it is one less thing to send us later. A PDF or a photo of each page is fine.</p>
          <div className="tq-up-row">
            <label className="btn" aria-disabled={busy}>{pick(busy ? "Uploading…" : "Upload It Now")}</label>
            <span className="tq-up-skip">Or carry on and send it later.</span>
          </div>
        </>
      )}
      {bad && <p className="tq-up-bad" role="alert">{bad}</p>}
    </div>
  );
}
