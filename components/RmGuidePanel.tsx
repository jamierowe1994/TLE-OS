"use client";

import { useRef, useState } from "react";
import {
  guideAgentHref,
  guideLabel,
  guideUrlProblem,
  RM_GUIDE_MAX_BYTES,
  rmGuideRef,
  type RmGuide,
} from "@/lib/rm-guide";

/**
 * "USE A RIGHTMOVE BEST PRICE GUIDE INSTEAD", on the builder's Recently let
 * step. Howard's ticket, approved by James 1 Oct 2026 - see lib/rm-guide.
 *
 * Controlled: the builder holds the guide, puts it on the deck and on its
 * picks, so this file only gathers it. A PDF goes to R2 through the usual
 * /api/r2/upload (document scope, under rm-guide-<ref>); a link is checked
 * for https here and again on the server.
 *
 * 10MB, not the document scope's 25MB: the request body is cut off at 10MB
 * once middleware has seen it, so a bigger file would fail on the way in.
 */
export default function RmGuidePanel({
  refId,
  value,
  onChange,
}: {
  refId: string;
  value: RmGuide | null;
  onChange: (next: RmGuide | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setProblem(null);
    if (file.type !== "application/pdf") return setProblem("The guide must be a PDF.");
    if (file.size > RM_GUIDE_MAX_BYTES) {
      return setProblem(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB - the limit is 10MB. Paste the link to it instead.`);
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", "document");
      form.append("ref", rmGuideRef(refId));
      const r = await fetch("/api/r2/upload", { method: "POST", body: form });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; key?: string; error?: string } | null;
      if (!r.ok || !j?.ok || !j.key) {
        setProblem(j?.error ?? (r.status === 413 ? "That file is too big - the limit is 10MB." : "The upload didn't work. Try again."));
        return;
      }
      onChange({ kind: "file", id: newId(), key: j.key, name: file.name });
      setOpen(false);
    } catch {
      setProblem("The upload didn't work - the connection dropped.");
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  function attachLink() {
    const no = guideUrlProblem(link);
    if (no) return setProblem(no);
    setProblem(null);
    onChange({ kind: "url", url: link.trim() });
    setLink("");
    setOpen(false);
  }

  const chip = "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors";
  const off = "border-line/80 text-muted hover:border-ink/40 hover:text-ink";
  const on = "border-brown bg-brown text-page";

  return (
    <div className="mb-3 shrink-0" data-rm-guide-panel>
      {value && !open ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-line/70 px-4 py-3">
          <DocIcon />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold">Rightmove price guide attached</span>
            <span className="block truncate text-[11.5px] text-muted">
              {guideLabel(value)} &middot; comparables are now optional. The landlord gets a See the Rightmove price guide button on What&apos;s letting nearby.
            </span>
          </span>
          <a href={guideAgentHref(value)} target="_blank" rel="noopener noreferrer" className={`${chip} ${off}`}>
            Open
          </a>
          <button type="button" onClick={() => { setOpen(true); setMode(value.kind); }} className={`${chip} ${off}`}>
            Replace
          </button>
          <button type="button" onClick={() => onChange(null)} className={`${chip} ${off}`}>
            Remove
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setOpen((o) => !o); setProblem(null); }}
              aria-expanded={open}
              className={`${chip} ${open ? on : off}`}
            >
              Use a Rightmove Best Price Guide instead {open ? "▴" : "▾"}
            </button>
            {!open && <span className="text-[11.5px] text-muted">Upload the PDF or paste its link - then you don&apos;t need 3 comparables.</span>}
          </div>
          {open && (
            <div className="fade-up mt-2.5 rounded-2xl border border-line/70 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { setMode("file"); setProblem(null); }} aria-pressed={mode === "file"} className={`${chip} ${mode === "file" ? on : off}`}>
                  Upload the PDF
                </button>
                <button type="button" onClick={() => { setMode("url"); setProblem(null); }} aria-pressed={mode === "url"} className={`${chip} ${mode === "url" ? on : off}`}>
                  Paste a link
                </button>
                {value && (
                  <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[11.5px] text-muted underline">
                    Keep the one attached
                  </button>
                )}
              </div>

              {mode === "file" ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    ref={picker}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => picker.current?.click()}
                    className={`${chip} ${on} inline-flex items-center gap-2 disabled:opacity-60`}
                  >
                    {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-page/40 border-t-page" aria-hidden />}
                    {busy ? "Uploading…" : "Choose the PDF"}
                  </button>
                  <span className="text-[11.5px] text-muted">PDF only, up to 10MB.</span>
                </div>
              ) : (
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    attachLink();
                  }}
                >
                  <input
                    type="url"
                    inputMode="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://www.rightmove.co.uk/..."
                    className="min-w-0 flex-1 rounded-full border border-line/80 bg-transparent px-3.5 py-1.5 text-[12.5px] outline-none focus:border-ink/40"
                    aria-label="Link to the Rightmove price guide"
                  />
                  <button type="submit" className={`${chip} ${on}`}>
                    Attach link
                  </button>
                </form>
              )}
              {problem && <p className="mt-2 text-[11.5px] text-accent-dark" role="alert">{problem}</p>}
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
                With a guide attached you can go on without ticking 3 comparables. The landlord sees What&apos;s letting nearby with a See the Rightmove price guide button; tick 3 as well and they get both.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Random enough to be the landlord's only key to the file (lib/rm-guide). */
function newId(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}
