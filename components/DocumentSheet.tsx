"use client";

import { useEffect, useState } from "react";
import { canShow, closeDocument, useDocument, type SheetDocument } from "@/lib/doc-sheet";

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
  /* Send is for a certificate on a home's record (the route reads the home from the key). */
  const sendable = d.key.startsWith("documents/compliance-");
  const shows = canShow(d.name);

  /* The new look (8 Nov 2026): a centred pop-out on the linen, the file
     large in the middle, Download in brown - nothing opens a new tab. */
  return (
    <div className="ds-wrap fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-6">
      <button aria-label="Close the document" onClick={closeDocument} className={`ds-dim absolute inset-0 cursor-default transition-opacity duration-300 ${up ? "opacity-100" : "opacity-0"}`} />
      <section
        role="dialog"
        aria-label={d.name}
        className={`ds-card relative flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden transition-[transform,opacity] duration-[420ms] ${up ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-[0.98] opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <header className="ds-head">
          <div className="min-w-0">
            <p className="ds-kicker">{d.label}</p>
            <h2 className="ds-name">{d.property ?? d.name}</h2>
            {d.property && <p className="ds-sub">{d.name}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sendable && (
              <button type="button" onClick={() => setMode(mode === "send" ? "view" : "send")} className={`ds-btn${mode === "send" ? " is-on" : ""}`}>
                <Glyph d="M4 6h16v12H4zM4 7l8 6 8-6" /> Send
              </button>
            )}
            <a href={save} download className="ds-btn is-primary">
              <Glyph d="M12 4v11M7 10l5 5 5-5M5 20h14" /> Download
            </a>
            <button type="button" onClick={closeDocument} aria-label="Close" className="ds-x">
              <Glyph d="M6 6l12 12M18 6L6 18" />
            </button>
          </div>
        </header>

        <div className="ds-body relative min-h-0 flex-1">
          {!shows ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="ds-name">{d.name}</p>
              <p className="ds-sub max-w-sm">This kind of file can&apos;t be shown inside the OS. Download it to open it on this computer.</p>
              <a href={save} download className="ds-btn is-primary mt-2">
                <Glyph d="M12 4v11M7 10l5 5 5-5M5 20h14" /> Download
              </a>
            </div>
          ) : isImage(d.name) ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.url} alt={d.name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <iframe title={d.name} src={`${d.url}#toolbar=0&view=FitH`} className="h-full w-full border-0 bg-white" />
          )}
          {mode === "send" && sendable && <SendPanel doc={d} onDone={() => setMode("view")} />}
        </div>
      </section>
      <style>{CSS}</style>
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const CSS = `
.ds-dim { background: rgba(35, 29, 27, 0.5); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.ds-card { background: var(--page, #faf8f5); border: 1px solid var(--line, #e6ded4); border-radius: 4px; box-shadow: 0 30px 80px -30px rgba(35, 29, 27, 0.55); }
.ds-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px 14px 22px; border-bottom: 1px solid var(--line, #e6ded4); }
.ds-kicker { margin: 0; font-family: var(--font-bricolage), "Helvetica Neue", Arial, sans-serif; font-stretch: 75%; font-weight: 500; text-transform: uppercase; letter-spacing: .16em; font-size: 11.5px; color: var(--accent, #a85a51); }
.ds-name { margin: 3px 0 0; font-size: 17px; font-weight: 600; line-height: 1.25; color: var(--ink, #231d1b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-sub { margin: 2px 0 0; font-size: 12.5px; color: var(--muted, #6b5f5a); overflow: hidden; text-overflow: ellipsis; }
.ds-btn { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border: 1px solid var(--line-strong, #d4c9bd); background: var(--card, #fff); color: var(--ink, #231d1b); font-size: 13px; font-weight: 500; border-radius: 2px; transition: border-color .2s, background-color .2s; }
.ds-btn:hover { border-color: var(--ink, #231d1b); }
.ds-btn.is-on { background: var(--ink, #231d1b); color: var(--page, #fff); border-color: var(--ink, #231d1b); }
.ds-btn.is-primary { background: var(--primary, #56423e); border-color: var(--primary, #56423e); color: #fff; }
.ds-btn.is-primary:hover { background: color-mix(in srgb, var(--primary, #56423e) 86%, #000); }
.ds-x { display: grid; place-items: center; width: 38px; height: 38px; color: var(--muted, #6b5f5a); border: 1px solid transparent; border-radius: 2px; }
.ds-x:hover { color: var(--ink, #231d1b); border-color: var(--line, #e6ded4); }
.ds-body { background: var(--box, #efe8df); }
@media (max-width: 640px) { .ds-head { flex-wrap: wrap; padding: 14px; } .ds-btn { height: 36px; padding: 0 11px; } }
`;

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
