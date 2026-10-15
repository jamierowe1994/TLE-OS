"use client";

import { useEffect, useState } from "react";
import { looksForeign } from "@/lib/language-guess";

/**
 * A Translate link under a customer's message that isn't in English (Amrit
 * Bhogal, 14 Oct 2026). Press it and the English appears underneath, with the
 * language it was in; nothing is sent or saved (app/api/translate). `force`
 * offers it whatever the guess says, for a long email the guess can't see.
 */
export default function TranslateText({
  text,
  onLanguage,
  force,
  tone = "light",
  className = "",
}: {
  text: string;
  /** The language it turned out to be, so a reply can be offered in it. */
  onLanguage?: (language: string) => void;
  force?: boolean;
  /** "dark" on a filled bubble. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const [state, setState] = useState<{ busy: boolean; out: { language: string; english: boolean; translation: string } | null; error: string | null }>({ busy: false, out: null, error: null });
  const [shown, setShown] = useState(true);
  /* New words (the whole enquiry arriving after its preview): start again. */
  useEffect(() => setState({ busy: false, out: null, error: null }), [text]);
  if (!force && !looksForeign(text)) return null;

  async function go() {
    if (state.out) { setShown((v) => !v); return; }
    setState({ busy: true, out: null, error: null });
    try {
      const r = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; language?: string; english?: boolean; translation?: string };
      if (!r.ok || !j.ok) { setState({ busy: false, out: null, error: j.error ?? "That couldn't be translated just now." }); return; }
      const out = { language: j.language ?? "", english: j.english === true, translation: j.translation ?? "" };
      setState({ busy: false, out, error: null });
      setShown(true);
      if (!out.english && out.language) onLanguage?.(out.language);
    } catch {
      setState({ busy: false, out: null, error: "That couldn't be translated just now." });
    }
  }

  const link = tone === "dark" ? "text-white/90" : "text-accent-dark";
  const muted = tone === "dark" ? "text-white/75" : "text-muted";
  return (
    <span className={`block ${className}`}>
      <button type="button" onClick={(e) => { e.stopPropagation(); void go(); }} disabled={state.busy} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold hover:underline disabled:opacity-60 ${link}`}>
        {state.busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
        {state.busy ? "Translating…" : state.out ? (shown ? "Hide the translation" : "Show the translation") : "Translate"}
      </button>
      {state.error && <span className={`mt-1 block text-[11px] ${muted}`}>{state.error}</span>}
      {state.out && shown && (
        state.out.english ? (
          <span className={`mt-1 block text-[11px] ${muted}`}>This one is already in English.</span>
        ) : (
          <span className={`mt-1.5 block border-l-2 pl-2.5 ${tone === "dark" ? "border-white/40" : "border-accent-dark/40"}`}>
            <span className={`block text-[10px] font-semibold uppercase tracking-wide ${muted}`}>In English · from {state.out.language}</span>
            <span className="mt-0.5 block whitespace-pre-line text-[12.5px] leading-snug">{state.out.translation}</span>
          </span>
        )
      )}
    </span>
  );
}
