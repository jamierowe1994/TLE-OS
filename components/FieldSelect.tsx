"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A drop-down that looks like the rest of the form.
 *
 * James, 7 Oct 2026: "any drop-downs need to be styled" - the browser's own
 * select box sat in the middle of every form looking like another product.
 * This is the same field (border, padding, the soft box fill) with our own
 * list under it: the chosen line ticked, groups headed, an optional last row
 * for "add one", and the keyboard doing what it does in a select - arrows to
 * move, Enter to choose, Escape to close (without closing the pop-up it sits
 * in).
 */

export interface SelectOption {
  value: string;
  label: string;
  /** A second, quieter line. */
  sub?: string;
  /** Options sharing a group sit under its heading, in the order given. */
  group?: string;
}

export default function FieldSelect({
  value,
  onChange,
  options,
  placeholder = "Choose",
  className = "",
  extra,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  /** A last row that does something rather than choosing - "+ Add a contractor". */
  extra?: { label: string; onPick: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const holder = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const id = useId();
  const chosen = options.find((o) => o.value === value) ?? null;
  const rows = options.length + (extra ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (holder.current && !holder.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (i: number) => {
    if (extra && i === options.length) extra.onPick();
    else if (options[i]) onChange(options[i].value);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(rows - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); pick(active); }
    else if (e.key === "Tab") setOpen(false);
  };

  let lastGroup: string | undefined;
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
        <span className={`min-w-0 truncate ${chosen ? "" : "text-muted"}`}>{chosen ? chosen.label : placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          className="fade-up absolute left-0 right-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line/80 bg-white p-1 shadow-[0_14px_34px_-14px_rgba(0,0,0,0.3)]"
        >
          {options.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const on = o.value === value;
            return (
              <li key={`${o.value}-${i}`} role="presentation">
                {head && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted">{head}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-i={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${i === active ? "bg-accent-soft/60" : ""} ${on ? "font-semibold" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.sub && <span className="block truncate text-[11px] font-normal text-muted">{o.sub}</span>}
                  </span>
                  {on && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-accent-dark">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
          {extra && (
            <li role="presentation" className="mt-1 border-t border-line/50 pt-1">
              <button
                type="button"
                data-i={options.length}
                onMouseEnter={() => setActive(options.length)}
                onClick={() => pick(options.length)}
                className={`w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-accent-dark ${active === options.length ? "bg-accent-soft/60" : ""}`}
              >
                {extra.label}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
