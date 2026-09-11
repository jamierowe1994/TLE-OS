"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The Tags filter on the leads board (James, 11 Sep 2026: "that's the whole
 * point of having a filter"). Pick any number; a lead has to carry all of
 * them. Drawn like PickOne, so the row of filters reads as one set.
 */
export default function TagsPick({ tags, value, onChange, tone = "neutral" }: { tags: [string, number][]; value: string[]; onChange: (next: string[]) => void; tone?: "neutral" | "pink" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const needle = q.trim().toLowerCase();
  const shown = tags.filter(([t]) => !needle || t.toLowerCase().includes(needle));
  const on = value.length > 0;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[12.5px] transition-colors ${
          tone === "pink"
            ? on
              ? "border-transparent bg-accent-dark font-semibold text-white"
              : "border-transparent bg-accent-soft font-medium text-accent-dark hover:bg-accent-soft/70"
            : on
              ? "border-accent-dark bg-accent-soft text-accent-dark"
              : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        <DoodleIcon name="target" size={13} />
        {on ? `${value.length} tag${value.length === 1 ? "" : "s"}` : "Tags"}
        <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="fade-up absolute left-0 top-full z-30 mt-1.5 w-64 rounded-2xl border border-line/80 bg-card p-2 shadow-[0_18px_40px_-16px_rgba(16,16,20,0.35)]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a tag…"
            className="mb-1.5 w-full rounded-xl border border-line/80 bg-transparent px-3 py-1.5 text-[12px] outline-none focus:border-ink"
          />
          <ul className="max-h-64 overflow-y-auto">
            {shown.map(([t, n]) => {
              const picked = value.includes(t);
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => onChange(picked ? value.filter((x) => x !== t) : [...value, t])}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-page"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-[9px] ${picked ? "border-accent-dark bg-accent-dark text-page" : "border-line"}`}>{picked && "✓"}</span>
                    <span className="min-w-0 flex-1 truncate">{t}</span>
                    <span className="figures text-[10.5px] text-muted">{n}</span>
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="px-2 py-2 text-[12px] text-muted">No tag like that.</li>}
          </ul>
          {on && (
            <button type="button" onClick={() => onChange([])} className="mt-1.5 w-full rounded-lg border-t border-line/50 px-2 py-1.5 text-left text-[12px] text-muted hover:text-ink">
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
}
