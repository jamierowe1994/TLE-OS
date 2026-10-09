"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * FieldSelect, but as many lines as you like.
 *
 * James, 8 Oct 2026: planning a job, "you could select boiler service and EPC
 * at the same time". The same field and the same list as FieldSelect, except
 * choosing a line ticks it and leaves the list open for the next one, and
 * choosing it again unticks it. The field says how many are chosen; what they
 * are is shown by the caller, beside it.
 *
 * Lianna, 9 Oct 2026: "can I not type P and it comes up with pests?" Typing
 * filters the list - a box at its top takes the letters, and a letter typed
 * on the closed field opens it with that letter already in.
 */
export default function FieldMultiSelect({
  values,
  onChange,
  options,
  placeholder = "Choose",
  className = "",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [find, setFind] = useState("");
  const holder = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const box = useRef<HTMLInputElement | null>(null);
  const id = useId();
  const chosen = options.filter((o) => values.includes(o.value));
  /* Words starting with the letters first, then anything containing them. */
  const shown = (() => {
    const n = find.trim().toLowerCase();
    if (!n) return options;
    const starts = options.filter((o) => o.label.toLowerCase().split(/[\s,&/-]+/).some((w) => w.startsWith(n)));
    const rest = options.filter((o) => !starts.includes(o) && o.label.toLowerCase().includes(n));
    return [...starts, ...rest];
  })();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (holder.current && !holder.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (!open) { setFind(""); return; }
    setActive(Math.max(0, options.findIndex((o) => values.includes(o.value))));
    box.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (find) setActive(0); }, [find]);
  useEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /* Kept in the list's own order, whatever order they were ticked in. */
  const toggle = (i: number) => {
    const v = shown[i]?.value;
    if (v == null) return;
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    onChange(options.map((o) => o.value).filter((x) => next.includes(x)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (!open && e.key.length === 1 && /[a-z0-9]/i.test(e.key) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setFind(e.key); setOpen(true); return; }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    /* Space types a space in the find box; Enter ticks the highlighted line. */
    else if (e.key === "Enter" || (e.key === " " && e.target !== box.current)) { e.preventDefault(); e.stopPropagation(); toggle(active); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={holder} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-box px-3 py-2.5 text-left text-[13px] outline-none transition-colors ${open ? "border-ink" : "border-line/80 hover:border-ink/40"} focus-visible:border-ink`}
      >
        <span className={`min-w-0 truncate ${chosen.length ? "" : "text-muted"}`}>
          {chosen.length === 0 ? placeholder : chosen.length === 1 ? chosen[0].label : `${chosen.length} chosen`}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-multiselectable
          className="fade-up absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line/80 bg-white p-1 shadow-[0_14px_34px_-14px_rgba(0,0,0,0.3)]"
        >
          <li role="presentation" className="sticky top-0 z-10 bg-white p-1 pb-1.5">
            <input
              ref={box}
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Type to find"
              aria-label="Find a category"
              className="w-full rounded-lg border border-line/80 bg-box px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink"
            />
          </li>
          {shown.length === 0 && <li role="presentation" className="px-3 py-2 text-[12px] text-muted">Nothing called that.</li>}
          {shown.map((o, i) => {
            const on = values.includes(o.value);
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-i={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => toggle(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${i === active ? "bg-accent-soft/60" : ""} ${on ? "font-semibold" : ""}`}
                >
                  <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line bg-white"}`}>
                    {on && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    )}
                  </span>
                  <span className="min-w-0 truncate">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
