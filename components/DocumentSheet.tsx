"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { closeDocument, useDocument, type SheetDocument } from "@/lib/doc-sheet";

/**
 * The certificate, up from the bottom of the page.
 *
 * Mounted once in the OS layout. When a document is opened the drawer behind
 * it has already started sliding right (it reads the same store), so the
 * sheet waits a beat and then rises; on close it drops first and the drawer
 * comes back. What you can do with it is deliberately short - look at it,
 * save it, send it - because James wants the file, not the overlay, to be
 * where the work happens.
 */

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(name);

export default function DocumentSheet() {
  const doc = useDocument();
  /* The document stays rendered while it slides down. */
  const [held, setHeld] = useState<SheetDocument | null>(null);
  const [up, setUp] = useState(false);
  const [mode, setMode] = useState<"view" | "send">("view");

  useEffect(() => {
    if (doc) {
      setHeld(doc);
      setMode("view");
      const t = setTimeout(() => setUp(true), 240);
      return () => clearTimeout(t);
    }
    setUp(false);
    const t = setTimeout(() => setHeld(null), 420);
    return () => clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDocument();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [held]);

  if (!held) return null;
  const d = held;
  const save = `${d.url}${d.url.includes("?") ? "&" : "?"}save=1`;

  return (
    <div className="fixed inset-0 z-[140]">
      <button
        aria-label="Close the document"
        onClick={closeDocument}
        className={`absolute inset-0 cursor-default bg-ink/45 transition-opacity duration-300 ${up ? "opacity-100" : "opacity-0"}`}
      />
      <section
        className={`absolute inset-x-0 bottom-0 top-[6vh] mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-page shadow-[0_-24px_60px_-24px_rgba(0,0,0,0.45)] transition-transform duration-[460ms] ${up ? "translate-y-0" : "translate-y-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{d.label}</p>
            <h2 className="mt-0.5 truncate text-[17px] leading-tight">{d.property ?? d.name}</h2>
            {d.property && <p className="mt-0.5 truncate text-[11.5px] text-muted">{d.name}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={save} className="flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-2 text-[12px] font-semibold transition-colors hover:border-ink">
              <DoodleIcon name="folder" size={13} /> Save
            </a>
            <button
              type="button"
              onClick={() => setMode(mode === "send" ? "view" : "send")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors ${mode === "send" ? "bg-ink text-page" : "border border-line/80 hover:border-ink"}`}
            >
              <DoodleIcon name="mail" size={13} /> Send
            </button>
            <button type="button" onClick={closeDocument} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">
              ✕
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-box">
          {isImage(d.name) ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.url} alt={d.name} className="max-h-full max-w-full rounded-xl object-contain" />
            </div>
          ) : (
            <iframe title={d.name} src={`${d.url}#toolbar=0`} className="h-full w-full border-0" />
          )}
          {mode === "send" && <SendPanel doc={d} onDone={() => setMode("view")} />}
        </div>
      </section>
    </div>
  );
}

function SendPanel({ doc, onDone }: { doc: SheetDocument; onDone: () => void }) {
  const [who, setWho] = useState<"landlord" | "other">("landlord");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    const j = await fetch("/api/compliance/send-document", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: doc.key, to: who, email: who === "other" ? email.trim() : undefined, note: note.trim() || undefined }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "The send did not go." }));
    setBusy(false);
    setResult(j.ok ? { ok: true, text: `Sent to ${j.to}.` } : { ok: false, text: j.error ?? "The send did not go." });
  }

  return (
    <div className="absolute inset-x-0 bottom-0 border-t border-line/70 bg-page px-6 py-5 shadow-[0_-16px_40px_-24px_rgba(0,0,0,0.35)]">
      <div className="mx-auto max-w-2xl">
        <p className="text-[13px] font-semibold">Who needs this?</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setWho("landlord")} className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${who === "landlord" ? "bg-ink text-page" : "border border-line/80 hover:border-ink"}`}>
            The landlord
          </button>
          <button type="button" onClick={() => setWho("other")} className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${who === "other" ? "bg-ink text-page" : "border border-line/80 hover:border-ink"}`}>
            Someone else
          </button>
        </div>
        {who === "other" && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Their email address"
            className="mt-3 w-full rounded-xl border border-line/80 bg-panel px-3.5 py-2.5 text-[13px] outline-none focus:border-ink"
          />
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A line to go with it (optional)"
          rows={2}
          className="mt-3 w-full resize-none rounded-xl border border-line/80 bg-panel px-3.5 py-2.5 text-[13px] outline-none focus:border-ink"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || (who === "other" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))}
            onClick={() => void send()}
            className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50"
          >
            {busy ? "Sending…" : who === "landlord" ? "Send to the landlord" : "Send it"}
          </button>
          <button type="button" onClick={onDone} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]">Cancel</button>
          {result && <span className={`text-[12px] ${result.ok ? "text-good" : "text-accent-dark"}`}>{result.text}</span>}
        </div>
        <p className="mt-2 text-[11px] text-muted">The certificate goes as an attachment from the agency&apos;s address, and a copy is kept on the email log.</p>
      </div>
    </div>
  );
}
