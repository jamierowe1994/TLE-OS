"use client";

import { useEffect, useRef, useState } from "react";
import LineIcon from "@/components/LineIcon";

/**
 * A board's own search, as an icon that opens (James, 11 Oct 2026): "it can
 * just be an icon that, when we click it, pops out ... at the top of the
 * list or tiles ... persist in the same place for leads, market appraisals,
 * listings, viewings, applications, and portfolio". The bar at the very top
 * of the page read as though it searched everything; this one sits on the
 * list it filters. Finding anything anywhere is the sidebar's Search (⌘K).
 *
 * Shut, a circle with the search icon. Open, a short field that filters as
 * you type. It stays open while it holds a search, and Esc clears and shuts it.
 */
export default function ListSearch({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(Boolean(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value) setOpen(true);
  }, [value]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search this list"
        aria-label="Search this list"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 bg-card text-muted transition-colors hover:border-ink/40 hover:text-ink"
      >
        <LineIcon name="search" size={16} />
      </button>
    );
  }
  return (
    <label className="fade-up flex h-9 w-[260px] max-w-full shrink-0 items-center gap-2 rounded-full border border-ink/40 bg-card pl-3 pr-1.5 transition-colors">
      <LineIcon name="search" size={15} className="text-muted" />
      <input
        ref={input}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setOpen(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted/70"
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          aria-label="Clear the search"
          className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-muted hover:bg-page hover:text-ink"
        >
          ×
        </button>
      )}
    </label>
  );
}
