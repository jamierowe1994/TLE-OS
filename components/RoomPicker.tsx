"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One dropdown in place of a tab per room (James, 6 Sep 2026: "you've just
 * given me 55 tabs"). Shows the tenant's name and the room or let they
 * hold; pick one and the drawer shows that room. "The house" sits beside
 * it as the way back.
 */

export interface RoomOption {
  id: string;
  /** The tenant, or "Empty". */
  name: string;
  /** "Room 2", or "let 1 Sept 2026" where REX names no rooms. */
  where: string;
  /** Something outstanding on this room. */
  bad?: boolean;
}

export default function RoomPicker({
  options, value, onChange, placeholder = "Tenants and rooms",
}: {
  options: RoomOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chosen = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", key, true); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex min-w-[220px] items-center gap-2 rounded-full border px-4 py-2 text-left text-[12.5px] transition-colors ${chosen ? "border-ink" : "border-line/80 hover:border-ink"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {chosen ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-semibold">{chosen.name}</span>
            <span className="shrink-0 text-[11px] text-muted">{chosen.where}</span>
          </span>
        ) : (
          <span className="text-muted">{placeholder} · {options.length}</span>
        )}
        <span className="ml-auto text-[10px] text-muted">▾</span>
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 z-10 mt-1.5 max-h-[60vh] w-[320px] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-2xl border border-line/80 bg-panel py-1.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35)]">
          {options.map((o) => (
            <li key={o.id} role="option" aria-selected={o.id === value}>
              <button
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12.5px] transition-colors hover:bg-box ${o.id === value ? "bg-box" : ""}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${o.bad ? "bg-accent-dark" : o.name === "Empty" ? "border border-line" : "bg-good"}`} />
                <span className={`min-w-0 truncate ${o.name === "Empty" ? "text-muted" : "font-semibold"}`}>{o.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted">{o.where}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
