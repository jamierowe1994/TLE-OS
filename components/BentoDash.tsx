"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { DEFAULT_LAYOUT, WIDGETS } from "@/components/widgets";

/**
 * The bento board: the dashboard as a grid of widgets the agent owns.
 *
 * Everything moves on POINTER events — one code path that serves mouse and
 * finger alike, which is what makes this work on a touchscreen without a
 * second implementation.
 *
 * In customise mode:
 *   press-and-drag a tile   → it lifts and FOLLOWS the pointer; the others
 *                             squeeze apart (FLIP-animated) to show exactly
 *                             where it will land
 *   tap a tile              → Small / Medium / Large, right there
 *   drag the corner         → a live outline tracks the pull; the widget
 *                             re-renders deeper at every size it crosses
 *   drag to the bin / tap ✕ → gone
 *
 * The default board IS the reference dashboard; Reset always returns it.
 * Layout persists per browser until sign-in makes it per-agent.
 */

type Item = { id: string; type: string; w: number; h: number };

const STORE = "tle-dash-layout-v1";
const COLS = 4;
const ROW_PX = 150;
const GAP_PX = 16;
const MAX_H = 3;
const DRAG_THRESHOLD = 8;

/** Global S/M/L, unless the widget names its own shapes. */
const DEFAULT_SIZES: Record<"s" | "m" | "l", [number, number]> = {
  s: [1, 1], m: [2, 1], l: [2, 2],
};

type DragState = {
  id: string;
  fromTray: boolean;
  /** Pointer offset inside the tile, so it doesn't jump to the cursor. */
  dx: number; dy: number;
  /** Tile's pixel size, so the ghost matches what was picked up. */
  pw: number; ph: number;
  x: number; y: number;
  moved: boolean;
};

type ResizeState = { id: string; x0: number; y0: number; w0: number; h0: number; x: number; y: number };

export default function BentoDash() {
  const [layout, setLayout] = useState<Item[]>(DEFAULT_LAYOUT);
  const [customise, setCustomise] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [sizeMenu, setSizeMenu] = useState<string | null>(null);
  const [overBin, setOverBin] = useState(false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const binRef = useRef<HTMLDivElement | null>(null);
  const rectsRef = useRef(new Map<string, { x: number; y: number }>());
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // The ref is the SOURCE OF TRUTH for the pointer loop — a tap's down and
  // up can land inside one frame, before React has re-rendered, and logic
  // that reads the state mirror misses it. State only drives the ghost.
  const dragRef = useRef<DragState | null>(null);

  /* ── Persistence ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const saved: Item[] = JSON.parse(raw);
      if (Array.isArray(saved) && saved.every((i) => WIDGETS[i.type])) setLayout(saved);
    } catch { /* a broken save is just the default board */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(layout)); } catch { /* private mode */ }
  }, [layout]);

  /* ── FLIP: whenever tiles land somewhere new, they slide there instead of
     teleporting — this is the "squeeze apart" the drag is showing you. ── */
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.querySelectorAll<HTMLElement>("[data-bid]").forEach((el) => {
      const id = el.dataset.bid!;
      const now = el.getBoundingClientRect();
      const prev = rectsRef.current.get(id);
      if (prev && (Math.abs(prev.x - now.x) > 1 || Math.abs(prev.y - now.y) > 1) && id !== dragRef.current?.id) {
        el.animate(
          [{ transform: `translate(${prev.x - now.x}px, ${prev.y - now.y}px)` }, { transform: "none" }],
          { duration: 230, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
      rectsRef.current.set(id, { x: now.x, y: now.y });
    });
  });

  /* ── Moving: where would the pointer drop this? ── */
  function insertionIndex(px: number, py: number, excludeId: string): number | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const tiles = [...grid.querySelectorAll<HTMLElement>("[data-bid]")].filter(
      (el) => el.dataset.bid !== excludeId
    );
    if (!tiles.length) return 0;
    let best: { idx: number; d: number; before: boolean } | null = null;
    tiles.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const d = Math.hypot(px - cx, py - cy);
      const before = py < r.y || (py <= r.bottom && px < cx);
      const idx = layoutRef.current.findIndex((i) => i.id === el.dataset.bid);
      if (!best || d < best.d) best = { idx, d, before };
    });
    if (!best) return null;
    const b = best as { idx: number; d: number; before: boolean };
    return b.before ? b.idx : b.idx + 1;
  }

  function moveDraggedTo(px: number, py: number) {
    const d = dragRef.current;
    if (!d) return;
    const target = insertionIndex(px, py, d.id);
    if (target == null) return;
    setLayout((cur) => {
      const from = cur.findIndex((i) => i.id === d.id);
      if (from < 0) return cur;
      let to = target > from ? target - 1 : target;
      to = Math.max(0, Math.min(cur.length - 1, to));
      if (to === from) return cur;
      const next = [...cur];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }

  /* ── One pointer loop drives dragging, from tile or tray alike. ── */
  function beginDrag(e: React.PointerEvent, id: string, fromTray: boolean, pw: number, ph: number) {
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const state: DragState = {
      id, fromTray,
      dx: startX - rect.x, dy: startY - rect.y,
      pw, ph, x: startX, y: startY, moved: false,
    };
    dragRef.current = state;
    setDrag(state);

    const onMove = (ev: PointerEvent) => {
      const moved =
        dragRef.current?.moved ||
        Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD;
      if (dragRef.current) {
        dragRef.current = { ...dragRef.current, x: ev.clientX, y: ev.clientY, moved };
      }
      setDrag(dragRef.current);
      if (!moved) return;
      const bin = binRef.current?.getBoundingClientRect();
      const inBin = !!bin && ev.clientX > bin.x && ev.clientX < bin.right && ev.clientY > bin.y && ev.clientY < bin.bottom;
      setOverBin(inBin);
      if (!inBin) moveDraggedTo(ev.clientX, ev.clientY);
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setOverBin(false);
      if (!d) return;
      const bin = binRef.current?.getBoundingClientRect();
      const inBin = !!bin && ev.clientX > bin.x && ev.clientX < bin.right && ev.clientY > bin.y && ev.clientY < bin.bottom;
      if (d.moved && inBin) {
        setLayout((cur) => cur.filter((i) => i.id !== d.id));
      } else if (!d.moved && !d.fromTray) {
        // A tap, not a drag: offer the sizes.
        setSizeMenu((cur) => (cur === d.id ? null : d.id));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function beginTrayDrag(e: React.PointerEvent, type: string) {
    e.preventDefault();
    const def = WIDGETS[type];
    const id = `w${Date.now()}`;
    // Land it at the end immediately; the drag loop walks it into place.
    setLayout((cur) => [...cur, { id, type, w: def.defaultW, h: def.defaultH }]);
    const grid = gridRef.current;
    const cellW = grid ? (grid.getBoundingClientRect().width - GAP_PX * (COLS - 1)) / COLS : 260;
    beginDrag(e, id, true, cellW * def.defaultW + GAP_PX * (def.defaultW - 1), ROW_PX * def.defaultH + GAP_PX * (def.defaultH - 1));
    // Tray adds count as moved from the first touch — they're already a drag.
    if (dragRef.current) {
      dragRef.current = { ...dragRef.current, moved: true, dx: 40, dy: 20 };
      setDrag(dragRef.current);
    }
  }

  /* ── Resizing: the outline tracks the pull; the spans snap under it. ── */
  function beginResize(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const item = layoutRef.current.find((i) => i.id === id);
    if (!item) return;
    const start: ResizeState = { id, x0: e.clientX, y0: e.clientY, w0: item.w, h0: item.h, x: e.clientX, y: e.clientY };
    setResize(start);
    const grid = gridRef.current!;
    const cellW = (grid.getBoundingClientRect().width - GAP_PX * (COLS - 1)) / COLS;

    const onMove = (ev: PointerEvent) => {
      setResize((cur) => (cur ? { ...cur, x: ev.clientX, y: ev.clientY } : cur));
      const dw = Math.round((ev.clientX - start.x0) / (cellW + GAP_PX));
      const dh = Math.round((ev.clientY - start.y0) / (ROW_PX + GAP_PX));
      const w = Math.min(COLS, Math.max(1, start.w0 + dw));
      const h = Math.min(MAX_H, Math.max(1, start.h0 + dh));
      setLayout((cur) => cur.map((i) => (i.id === id ? { ...i, w, h } : i)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setResize(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const remove = (id: string) => setLayout((cur) => cur.filter((i) => i.id !== id));
  const placed = new Set(layout.map((i) => i.type));
  const dragged = drag?.moved ? layout.find((i) => i.id === drag.id) : null;

  /* The live outline while resizing — drawn from the tile's corner to the
     pointer, so the pull is visible before the snap catches up. */
  const resizeItem = resize ? layout.find((i) => i.id === resize.id) : null;
  const resizeEl = resize ? gridRef.current?.querySelector<HTMLElement>(`[data-bid="${resize.id}"]`) : null;
  const resizeRect = resizeEl?.getBoundingClientRect();

  return (
    <>
      <div className="mb-3 mt-8 flex justify-end">
        {customise ? (
          <PressButton
            onClick={() => { setCustomise(false); setSizeMenu(null); }}
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
        className="relative grid grid-cols-4 gap-4 [grid-auto-flow:dense]"
        style={{ gridAutoRows: ROW_PX }}
      >
        {layout.map((item, idx) => {
          const def = WIDGETS[item.type];
          if (!def) return null;
          const isDragged = dragged?.id === item.id;
          const sizes = def.sizes ?? DEFAULT_SIZES;
          return (
            <section
              key={item.id}
              data-bid={item.id}
              onPointerDown={(e) => {
                if (!customise) return;
                const t = e.target as HTMLElement;
                if (t.closest("[data-nodrag]")) return;
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                beginDrag(e, item.id, false, r.width, r.height);
              }}
              className={`relative rounded-2xl border bg-page p-5 ${
                customise
                  ? `wiggle cursor-grab select-none border-dashed border-ink/40 ${
                      isDragged ? "opacity-30" : ""
                    }`
                  : "block-pop fade-up overflow-hidden border-line/80 hover:border-ink"
              }`}
              style={{
                gridColumn: `span ${item.w} / span ${item.w}`,
                gridRow: `span ${item.h} / span ${item.h}`,
                animationDelay: customise ? `${(idx % 5) * 0.11}s` : undefined,
                touchAction: customise ? "none" : undefined,
                overflow: sizeMenu === item.id ? "visible" : "hidden",
              }}
            >
              <div className={customise ? "pointer-events-none h-full select-none" : "h-full"}>
                {def.render(item.w, item.h)}
              </div>

              {customise && (
                <>
                  {/* ✕ badge — generous target, straight off the home screen. */}
                  <button
                    type="button"
                    data-nodrag
                    onClick={() => remove(item.id)}
                    className="absolute left-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-[11px] text-muted shadow-sm transition-colors hover:border-accent-dark hover:text-accent-dark"
                    aria-label={`Remove ${def.label}`}
                  >
                    ✕
                  </button>

                  {/* The resize corner: a curved bracket hugging the tile's
                      own radius, hard in the corner, with a 44px target —
                      finger-sized, and it doesn't wiggle with the tile. */}
                  <button
                    type="button"
                    data-nodrag
                    onPointerDown={(e) => beginResize(e, item.id)}
                    className="absolute -bottom-1 -right-1 flex h-11 w-11 cursor-nwse-resize items-end justify-end p-2 text-accent-dark"
                    style={{ touchAction: "none" }}
                    aria-label={`Resize ${def.label}`}
                    title="Drag to resize"
                  >
                    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                      <path
                        d="M4 17 H10 A7 7 0 0 0 17 10 V4"
                        fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  <span className="absolute bottom-2 left-3 text-[9px] font-semibold uppercase tracking-wide text-muted/70">
                    {item.w}×{item.h}
                  </span>

                  {/* Tap → sizes, right where you tapped. */}
                  {sizeMenu === item.id && (
                    <div
                      data-nodrag
                      className="fade-up absolute right-2 top-2 z-30 flex gap-1 rounded-2xl border border-line/80 bg-card p-1.5 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.35)]"
                    >
                      {(["s", "m", "l"] as const).map((k) => {
                        const [w, h] = sizes[k];
                        const on = item.w === w && item.h === h;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setLayout((cur) => cur.map((i) => (i.id === item.id ? { ...i, w, h } : i)));
                              setSizeMenu(null);
                            }}
                            className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors ${
                              on ? "bg-accent-soft text-accent-dark" : "hover:bg-accent-soft/40"
                            }`}
                          >
                            {/* A little glyph OF the shape, not just a letter. */}
                            <span
                              className={`block rounded-[3px] border-[1.5px] ${on ? "border-accent-dark bg-accent-dark/20" : "border-ink/50"}`}
                              style={{ width: 8 + w * 5, height: 6 + h * 5 }}
                            />
                            <span className="text-[9px] font-semibold uppercase">
                              {k === "s" ? "Small" : k === "m" ? "Medium" : "Large"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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

      {/* The lifted tile, following the pointer. */}
      {dragged && drag && (
        <div
          className="pointer-events-none fixed z-[160] rounded-2xl border border-ink/50 bg-page p-5 opacity-95 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: drag.pw,
            height: drag.ph,
            transform: "scale(1.03) rotate(0.6deg)",
            overflow: "hidden",
          }}
        >
          {WIDGETS[dragged.type]?.render(dragged.w, dragged.h)}
        </div>
      )}

      {/* The live resize outline — you see the pull, then the snap. */}
      {resize && resizeRect && resizeItem && (
        <div
          className="pointer-events-none fixed z-[155] rounded-2xl border-2 border-dashed border-accent-dark/70"
          style={{
            left: resizeRect.x,
            top: resizeRect.y,
            width: Math.max(120, resize.x - resizeRect.x + 10),
            height: Math.max(80, resize.y - resizeRect.y + 10),
          }}
        >
          <span className="figures absolute bottom-1.5 right-2.5 text-[12px] font-semibold text-accent-dark">
            {resizeItem.w}×{resizeItem.h}
          </span>
        </div>
      )}

      {/* ── The tray. ── */}
      {customise && (
        <div className="fixed inset-x-0 bottom-5 z-[110] flex justify-center px-4">
          <div className="fade-up flex max-w-full items-stretch gap-2 overflow-x-auto rounded-3xl border border-line/80 bg-card p-3 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.35)]">
            {Object.entries(WIDGETS).map(([type, def]) => (
              <div
                key={type}
                onPointerDown={(e) => !placed.has(type) && beginTrayDrag(e, type)}
                title={def.hint}
                style={{ touchAction: "none" }}
                className={`flex w-[92px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition-colors ${
                  placed.has(type)
                    ? "border-transparent opacity-35"
                    : "cursor-grab border-line/60 hover:border-ink/40 active:cursor-grabbing"
                }`}
              >
                <DoodleIcon name={def.icon} size={22} className="text-accent-dark" />
                <span className="text-[9.5px] font-semibold leading-tight">{def.label}</span>
              </div>
            ))}

            <div
              ref={binRef}
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
