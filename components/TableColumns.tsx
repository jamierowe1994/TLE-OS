"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Per-table column preferences: which fields show, and in what order.
 *
 * Every agent works differently — one lives by stage, another by move date —
 * so the table shape is theirs, not ours. Preferences are keyed per table
 * ("leads", "listings", …) and persist in localStorage, so Leads and Listings
 * each remember their own layout independently.
 *
 * Reordering is pointer-driven (see ColumnCustomiser) — no library, live
 * preview as you drag, and it works on touch.
 */

export type ColumnDef<T> = {
  key: string;
  label: string;
  /** The row's identity — always shown, can't be hidden or moved off the front. */
  required?: boolean;
  /** Hidden by default, but offered in the customiser. */
  optional?: boolean;
  render: (row: T) => React.ReactNode;
  /** Extra classes on the cell (alignment, nowrap, figures). */
  cell?: string;
};

type Prefs = { order: string[]; hidden: string[] };

function load(tableKey: string): Prefs | null {
  try {
    const raw = localStorage.getItem(`os-cols-${tableKey}`);
    return raw ? (JSON.parse(raw) as Prefs) : null;
  } catch {
    return null;
  }
}

export function useColumns<T>(tableKey: string, defs: ColumnDef<T>[]) {
  const defaultHidden = useMemo(
    () => defs.filter((d) => d.optional).map((d) => d.key),
    [defs]
  );
  const [order, setOrder] = useState<string[]>(() => defs.map((d) => d.key));
  const [hidden, setHidden] = useState<string[]>(defaultHidden);
  // Until the saved prefs are read, render defaults — otherwise the server
  // markup and the first client paint disagree and React throws a mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = load(tableKey);
    if (saved) {
      // Reconcile with the current defs: a column added since the prefs were
      // saved must still appear, and a removed one must not linger.
      const known = new Set(defs.map((d) => d.key));
      const kept = saved.order.filter((k) => known.has(k));
      const added = defs.map((d) => d.key).filter((k) => !kept.includes(k));
      setOrder([...kept, ...added]);
      setHidden(saved.hidden.filter((k) => known.has(k)));
    }
    setReady(true);
  }, [tableKey, defs]);

  function persist(nextOrder: string[], nextHidden: string[]) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    try {
      localStorage.setItem(
        `os-cols-${tableKey}`,
        JSON.stringify({ order: nextOrder, hidden: nextHidden })
      );
    } catch {
      /* private browsing — the session still works, it just won't remember */
    }
  }

  const byKey = useMemo(() => new Map(defs.map((d) => [d.key, d])), [defs]);
  const ordered = order.map((k) => byKey.get(k)!).filter(Boolean);
  const visible = ordered.filter((d) => d.required || !hidden.includes(d.key));

  return {
    ready,
    ordered,
    visible,
    hidden,
    toggle: (key: string) =>
      persist(
        order,
        hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
      ),
    move: (from: number, to: number) => {
      const next = [...order];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      persist(next, hidden);
    },
    reset: () => persist(defs.map((d) => d.key), defaultHidden),
  };
}

export function ColumnCustomiser<T>({
  cols,
}: {
  cols: ReturnType<typeof useColumns<T>>;
}) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  /**
   * Reordering runs on POINTER events, not the HTML5 drag API. Native DnD
   * text-selects the page underneath while you drag, doesn't work on touch,
   * and gives no live preview — the row only moves once you let go. Pointer
   * capture gives all three, and the list reorders under the finger.
   */
  function onPointerDown(e: React.PointerEvent, index: number) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(index);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging === null || !list.current) return;
    const items = [...list.current.children] as HTMLElement[];
    const over = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (over !== -1 && over !== dragging) {
      cols.move(dragging, over);
      setDragging(over);
    }
  }

  // Click-away, so the panel behaves like every other popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const shownCount = cols.visible.length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
          open
            ? "border-ink/40 text-ink"
            : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
        }`}
        title="Choose which columns show, and drag to reorder"
      >
        <DoodleIcon name="setting" size={14} className="shrink-0" />
        Customise
        <span className="figures text-[11px] text-muted">{shownCount}</span>
      </button>

      {open && (
        <div className="fade-up absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line/80 bg-card p-4 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.25)]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Columns
            </p>
            <button
              type="button"
              onClick={cols.reset}
              className="text-[10.5px] font-semibold text-muted transition-colors hover:text-ink"
            >
              Reset
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
            Drag to reorder. Untick to hide.
          </p>

          <ul
            ref={list}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            className="mt-3 max-h-72 space-y-0.5 overflow-y-auto"
          >
            {cols.ordered.map((c, i) => {
              const isHidden = cols.hidden.includes(c.key) && !c.required;
              return (
                <li
                  key={c.key}
                  className={`flex touch-none select-none items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                    dragging === i ? "bg-accent-soft/60" : "hover:bg-page"
                  }`}
                >
                  {/* The handle is the grip alone: the rest of the row stays a
                      plain click target for show/hide. */}
                  <span
                    onPointerDown={(e) => onPointerDown(e, i)}
                    className="cursor-grab px-0.5 text-[11px] leading-none text-muted/70 active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    disabled={c.required}
                    onClick={() => cols.toggle(c.key)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                  >
                    <span
                      className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border-[1.5px] text-[9px] ${
                        isHidden
                          ? "border-line"
                          : "border-accent-dark bg-accent-soft text-accent-dark"
                      }`}
                    >
                      {!isHidden && "✓"}
                    </span>
                    <span
                      className={`truncate text-[12px] ${isHidden ? "text-muted" : ""}`}
                    >
                      {c.label}
                    </span>
                    {c.required && (
                      <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wide text-muted/70">
                        always
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The table itself, rendered from the visible columns. A tall list scrolls
 * inside the card with the header pinned, so the filter bar and the pager
 * stay put while 20+ rows move.
 */
export function DataTable<T extends { id: string }>({
  cols,
  rows,
  onRowClick,
  activeId,
  maxHeight = 620,
}: {
  cols: ReturnType<typeof useColumns<T>>;
  rows: T[];
  /** Row and its index — the index is what lets a drawer walk the list. */
  onRowClick?: (row: T, index: number) => void;
  activeId?: string | null;
  maxHeight?: number;
}) {
  return (
    <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight }}>
      <table className="w-full text-left text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-page">
          <tr className="border-b border-line/70">
            {cols.visible.map((c) => (
              <th
                key={c.key}
                className="whitespace-nowrap bg-page pb-2.5 pr-3 pt-1 text-[9.5px] font-bold uppercase tracking-wider text-muted"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const active = activeId === row.id;
            return (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={`border-b border-line/40 transition-colors last:border-0 ${
                  onRowClick ? "cursor-pointer" : ""
                } ${active ? "bg-accent-soft/50" : "hover:bg-page"}`}
              >
                {cols.visible.map((c) => (
                  <td key={c.key} className={`py-4 pr-3 ${c.cell ?? ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
