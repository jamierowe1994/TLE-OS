"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The record-row version of the address lookup.
 *
 * Same engine as the New Lead panel's field — /api/address, key server-side —
 * but shaped like an InlineField so it lives inside a 42px contact row: click
 * the value, type, pick from the dropdown, and the chosen address commits
 * with its geotag resolved. The row never changes height; the suggestions
 * hang below it in their own layer.
 */

type Suggestion = { id: string; label: string };

export default function InlineAddress({
  value,
  onChange,
  onResolved,
  placeholder = "—",
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  onResolved?: (r: { address: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // Debounced lookup while typing — same 320ms as the big field, because a
  // lookup per keystroke is a lookup you pay for per keystroke.
  useEffect(() => {
    if (!editing || draft.trim().length < 3 || draft === value) {
      setOptions([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/address?q=${encodeURIComponent(draft)}`, { cache: "no-store" });
        const j = await r.json();
        setOptions(j.suggestions ?? []);
      } catch {
        setOptions([]);
      }
    }, 320);
    return () => window.clearTimeout(id);
  }, [draft, editing, value]);

  async function choose(opt: Suggestion) {
    setOptions([]);
    setEditing(false);
    onChange(opt.label);
    try {
      const r = await fetch(`/api/address?resolve=${encodeURIComponent(opt.id)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.address) {
        onChange(j.address);
        onResolved?.({ address: j.address, lat: j.lat ?? null, lng: j.lng ?? null });
      }
    } catch {
      /* the label they picked already committed — good enough */
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit"
        className={`-mx-1 truncate rounded px-1 text-left transition-colors hover:bg-accent-soft/40 ${className}`}
      >
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          // Give a mousedown on an option time to win before the blur commits
          // the raw text — otherwise picking a suggestion is a race you lose.
          window.setTimeout(() => {
            setOptions([]);
            setEditing(false);
            onChange(draft.trim());
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            setOptions([]);
            setEditing(false);
          }
        }}
        className={`-mx-1 w-full border-b-[1.5px] border-accent-dark bg-transparent px-1 outline-none ${className}`}
      />
      {options.length > 0 && (
        <ul className="fade-up absolute left-0 top-full z-30 mt-1 max-h-52 w-[320px] overflow-y-auto rounded-xl border border-line/80 bg-card py-1 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.3)]">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                // mousedown, not click: it fires before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(o);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-page"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
