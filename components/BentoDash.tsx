"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { DEFAULT_LAYOUT, WIDGETS } from "@/components/widgets";

/**
 * The bento board: the dashboard as a grid of widgets the agent owns.
 *
 * Normal mode renders exactly like the old dashboard — the default layout IS
 * the old page, box for box. "Customise" turns on iPhone rules: everything
 * wiggles, a tray of widgets slides up from the bottom, and three gestures
 * do everything —
 *   drag a tile        → move it (the grid reflows around it)
 *   drag its corner    → resize it, and the widget CHANGES DEPTH with size
 *   drag it to the bin → gone (the ✕ badge does the same for one click)
 *
 * Four columns, 150px rows, dense flow — a bento, not a free canvas, so
 * nothing can ever be dropped somewhere broken.
 *
 * The layout persists in localStorage per browser until sign-in lands, at
 * which point it becomes a per-agent record. Reset always returns the
 * default, so nobody can lose the dashboard.
 */

type Item = { id: string; type: string; w: number; h: number };

const STORE = "tle-dash-layout-v1";
const COLS = 4;
const ROW_PX = 150;
const GAP_PX = 16;
const MAX_H = 3;

export default function BentoDash() {
  const [layout, setLayout] = useState<Item[]>(DEFAULT_LAYOUT);
  const [customise, setCustomise] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overBin, setOverBin] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Hydrate the saved board after mount — server and first client paint both
  // show the default, so there's no mismatch to argue about.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const saved: Item[] = JSON.parse(raw);
      if (Array.isArray(saved) && saved.every((i) => WIDGETS[i.type])) setLayout(saved);
    } catch {
      /* a broken save is just the default board */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(layout));
    } catch {
      /* private mode — the board still works, it just forgets */
    }
  }, [layout]);

  /* ── Move: drag a tile over another and the list reorders around it. ── */
  function onItemDragOver(e: React.DragEvent, overId: string) {
    if (!dragId) return;
    e.preventDefault();
    if (dragId === overId) return;
    setLayout((cur) => {
      const from = cur.findIndex((i) => i.id === dragId);
      const to = cur.findIndex((i) => i.id === overId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /* ── Add: drag a type out of the tray, drop it anywhere on the grid. ── */
  function onGridDrop(e: React.DragEvent) {
    const type = e.dataTransfer.getData("tray-widget");
    if (!type || !WIDGETS[type]) return;
    e.preventDefault();
    const def = WIDGETS[type];
    setLayout((cur) => [
      ...cur,
      { id: `w${Date.now()}`, type, w: def.defaultW, h: def.defaultH },
    ]);
  }

  /* ── Resize: pointer-drag the corner; cells snap as you cross them. ── */
  function startResize(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const item = layout.find((i) => i.id === id);
    const grid = gridRef.current;
    if (!item || !grid) return;
    const cellW = (grid.getBoundingClientRect().width - GAP_PX * (COLS - 1)) / COLS;
    const startX = e.clientX;
    const startY = e.clientY;
    const { w: w0, h: h0 } = item;

    const move = (ev: PointerEvent) => {
      const dw = Math.round((ev.clientX - startX) / (cellW + GAP_PX));
      const dh = Math.round((ev.clientY - startY) / (ROW_PX + GAP_PX));
      const w = Math.min(COLS, Math.max(1, w0 + dw));
      const h = Math.min(MAX_H, Math.max(1, h0 + dh));
      setLayout((cur) => cur.map((i) => (i.id === id ? { ...i, w, h } : i)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const remove = (id: string) => setLayout((cur) => cur.filter((i) => i.id !== id));
  const placed = new Set(layout.map((i) => i.type));

  return (
    <>
      {/* The one way in. Sits above the grid, right-aligned, quiet. */}
      <div className="mb-3 mt-8 flex justify-end">
        {customise ? (
          <PressButton
            onClick={() => setCustomise(false)}
            className="press-ring rounded-full bg-accent-dark px-5 py-2 text-[12px] font-semibold text-page"
          >
            Done
          </PressButton>
        ) : (
          <button
            type="button"
            onClick={() => setCustomise(true)}
            className="flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <DoodleIcon name="magic-wand" size={14} />
            Customise
          </button>
        )}
      </div>

      <div
        ref={gridRef}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("tray-widget")) e.preventDefault();
        }}
        onDrop={onGridDrop}
        className="grid grid-cols-4 gap-4 [grid-auto-flow:dense]"
        style={{ gridAutoRows: ROW_PX }}
      >
        {layout.map((item, idx) => {
          const def = WIDGETS[item.type];
          if (!def) return null;
          return (
            <section
              key={item.id}
              draggable={customise}
              onDragStart={(e) => {
                setDragId(item.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverBin(false);
              }}
              onDragOver={(e) => onItemDragOver(e, item.id)}
              className={`relative overflow-hidden rounded-2xl border bg-page p-5 ${
                customise
                  ? `wiggle cursor-grab border-dashed border-ink/40 active:cursor-grabbing ${
                      dragId === item.id ? "opacity-40" : ""
                    }`
                  : "block-pop fade-up border-line/80 hover:border-ink"
              }`}
              style={{
                gridColumn: `span ${item.w} / span ${item.w}`,
                gridRow: `span ${item.h} / span ${item.h}`,
                animationDelay: customise ? `${(idx % 5) * 0.07}s` : undefined,
              }}
            >
              {/* In customise mode the widget is a TILE — its own clicks are
                  off so dragging never fights a button underneath. */}
              <div className={customise ? "pointer-events-none h-full select-none" : "h-full"}>
                {def.render(item.w, item.h)}
              </div>

              {customise && (
                <>
                  {/* The ✕ badge, straight off the home screen. */}
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-[10px] text-muted shadow-sm transition-colors hover:border-accent-dark hover:text-accent-dark"
                    aria-label={`Remove ${def.label}`}
                  >
                    ✕
                  </button>
                  {/* The corner that resizes — and re-renders the widget a
                      level deeper with every cell it grows. */}
                  <button
                    type="button"
                    onPointerDown={(e) => startResize(e, item.id)}
                    className="absolute bottom-1.5 right-1.5 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
                    aria-label={`Resize ${def.label}`}
                    title="Drag to resize"
                  >
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M11 5v6H5M11 1v2M9 11H7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                    </svg>
                  </button>
                  <span className="absolute bottom-2 left-3 text-[9px] font-semibold uppercase tracking-wide text-muted/70">
                    {item.w}×{item.h}
                  </span>
                </>
              )}
            </section>
          );
        })}

        {!layout.length && (
          <div className="col-span-4 rounded-2xl border border-dashed border-line p-10 text-center text-[13px] text-muted">
            An empty board. Drag widgets up from the tray — or Reset brings the old dashboard back.
          </div>
        )}
      </div>

      {/* ── The tray: every widget the OS knows, sliding up when it matters. ── */}
      {customise && (
        <div className="fixed inset-x-0 bottom-5 z-[110] flex justify-center px-4">
          <div className="fade-up flex max-w-full items-stretch gap-2 overflow-x-auto rounded-3xl border border-line/80 bg-card p-3 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.35)]">
            {Object.entries(WIDGETS).map(([type, def]) => (
              <div
                key={type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("tray-widget", type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title={def.hint}
                className={`flex w-[92px] shrink-0 cursor-grab flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition-colors active:cursor-grabbing ${
                  placed.has(type)
                    ? "border-transparent opacity-35"
                    : "border-line/60 hover:border-ink/40"
                }`}
              >
                <DoodleIcon name={def.icon} size={22} className="text-accent-dark" />
                <span className="text-[9.5px] font-semibold leading-tight">{def.label}</span>
              </div>
            ))}

            {/* The bin. Drop a tile here and it's gone. */}
            <div
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault();
                  setOverBin(true);
                }
              }}
              onDragLeave={() => setOverBin(false)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) remove(dragId);
                setDragId(null);
                setOverBin(false);
              }}
              className={`ml-1 flex w-[92px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-2.5 transition-all ${
                overBin
                  ? "scale-105 border-accent-dark bg-accent-soft/60 text-accent-dark"
                  : "border-line text-muted"
              }`}
            >
              <DoodleIcon name="cross" size={20} className="opacity-80" />
              <span className="text-[9.5px] font-semibold">Drop to remove</span>
            </div>

            <button
              type="button"
              onClick={() => setLayout(DEFAULT_LAYOUT)}
              className="ml-1 flex w-[92px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line/60 p-2.5 text-muted transition-colors hover:border-ink/40 hover:text-ink"
            >
              <DoodleIcon name="magic-wand" size={20} />
              <span className="text-[9.5px] font-semibold">Reset to default</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
