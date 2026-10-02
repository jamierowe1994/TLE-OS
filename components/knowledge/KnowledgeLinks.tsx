"use client";

import { useState } from "react";

/**
 * Feed Steve links (James, 2 Oct 2026): paste articles, guidance and new
 * legislation, one per line. Each is read, written up and kept under "Law and
 * news", where Steve answers from it on the next question (lib/knowledge-links).
 */
type Result = { url: string; ok: true; id: string; title: string; updated: boolean } | { url: string; ok: false; error: string };

export default function KnowledgeLinks({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = text.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));

  async function read() {
    if (!urls.length || busy) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const r = await fetch("/api/knowledge/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls }) });
      const j = (await r.json()) as { ok?: boolean; results?: Result[]; error?: string };
      if (!j.ok) setError(j.error ?? "That didn't work.");
      else {
        setResults(j.results ?? []);
        if ((j.results ?? []).some((x) => x.ok)) onSaved();
        if ((j.results ?? []).every((x) => x.ok)) setText("");
      }
    } catch {
      setError("That didn't work - the connection dropped.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fade-up mt-6 rounded-[22px] border border-line/60 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="hand text-[17px] leading-tight">Feed Steve links</h2>
          <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
            New legislation, guidance, articles about lettings. Paste one link per line. Steve reads each page, writes up what changed and what agents must do, and keeps it under Law and news with the source and the date.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] hover:border-ink/40">
          Close
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"https://www.gov.uk/guidance/...\nhttps://www.propertyindustryeye.com/..."}
        className="mt-3 w-full resize-y rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!urls.length || busy}
          onClick={read}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[12.5px] font-semibold text-page disabled:opacity-40"
        >
          {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-page/40 border-t-page" />}
          {busy ? `Reading ${urls.length === 1 ? "it" : `${urls.length} links`}…` : urls.length > 1 ? `Read ${urls.length} links` : "Read it"}
        </button>
        <span className="text-[11px] text-muted">{busy ? "About 20 seconds a link." : "Up to ten at a time. A link read before is refreshed, not doubled."}</span>
      </div>
      {error && <p className="mt-3 text-[12px] text-accent-dark">{error}</p>}
      {results && (
        <ul className="mt-3 space-y-1.5">
          {results.map((r) => (
            <li key={r.url} className="flex items-start gap-2 text-[12px]">
              <span className={`mt-[3px] h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-[#56634a]" : "bg-accent-dark"}`} />
              <span className="min-w-0">
                {r.ok ? (
                  <>
                    <span className="font-semibold">{r.title}</span> <span className="text-muted">{r.updated ? "refreshed" : "kept"} under Law and news</span>
                  </>
                ) : (
                  <>
                    <span className="break-all text-muted">{r.url}</span> <span className="text-accent-dark">- {r.error}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
