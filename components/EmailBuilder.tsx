"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignStep } from "@/lib/campaigns";
import { blocksFor, tleBrand, type StepCopy } from "@/lib/campaign-mail";
// The ported TMKE renderer — the same module that sends, drawing the canvas.
import {
  renderBlock,
  resolveMargin,
  mergeContextFor,
  FONT_STACKS,
  BRAND_COLOURS,
  COLUMN_LAYOUTS,
  makeBlock,
} from "@/lib/email/render.js";

/**
 * The email builder.
 *
 * It fills the screen because writing is the job while you're doing it —
 * the campaign list, the step plan and the queue are all noise at that
 * moment, and a builder in a side panel is a builder nobody uses.
 *
 * Two ways to edit the same thing, deliberately: the rail on the left for
 * what can't be typed (which block, what order, colours, links), and the
 * email itself on the right for the words. Nobody writing a letter wants to
 * type it into a form field beside a picture of a letter.
 *
 * The canvas is drawn by the SENDING renderer, block by block, so it isn't a
 * likeness of the email — it is the email, one <div> at a time.
 */

type Block = Record<string, unknown> & { type: string; id: string };

/* Everything the RENDERER can already draw. The builder used to offer six
   types against the renderer's twenty, because it kept its own smaller block
   factory (see below) - so layouts, testimonials and the rest existed and
   were simply unreachable. */
const PALETTE = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "button", label: "Button" },
  { type: "image", label: "Image" },
  { type: "columns", label: "Layout" },
  { type: "quote", label: "Testimonial" },
  { type: "faq", label: "Q&A" },
  { type: "video", label: "Video" },
  { type: "social", label: "Social" },
  { type: "logo", label: "Logo" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Space" },
];

const MERGE = [
  { token: "{{firstName}}", label: "First name" },
  { token: "{{address}}", label: "Their property" },
];

/** The blocks whose words are typed straight onto the canvas. */
const TYPEABLE = new Set(["heading", "text", "button", "quote"]);

let seq = 0;
const nid = () => `eb_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/* The renderer owns what a new block looks like. This used to be a second
   switch here that covered six types and drifted from it - which is exactly
   how a `columns` block added by the builder could come out shaped
   differently from one the renderer expects. */
const fresh = (type: string): Block => makeBlock(type) as Block;

/* ── Paths ──────────────────────────────────────────────────────────────────
   A block used to be addressed by its id alone, which stopped working the
   moment content could live INSIDE a column: the same operations (patch,
   move, delete) now have to reach two depths. A path is a string so it can be
   compared with === and held in state without re-render churn:

     "b_7"           a top-level block
     "b_7/1/b_9"     block b_9, in column index 1, of the layout block b_7

   Two segments is the whole story — the renderer draws no deeper than that
   and nested column tables break in Outlook, so a path is never longer. */
type Path = string;

const childPath = (parent: string, col: number, id: string) => `${parent}/${col}/${id}`;
const isChildPath = (p: Path) => p.split("/").length === 3;

const layoutOf = (block: Block) =>
  (COLUMN_LAYOUTS as { key: string; label: string; cols: number; w: number[] }[]).find(
    (l) => l.key === block.layout
  ) || (COLUMN_LAYOUTS as { key: string; cols: number; w: number[] }[])[1];

/** The `cols` array, normalised to the column count the chosen layout wants.
    Overflow is folded into the LAST remaining column rather than dropped —
    silently losing somebody's paragraph because they tried a narrower layout
    is unforgivable, and undo is a save away. */
function ensureCols(block: Block): Block[][] {
  const want = layoutOf(block).cols;
  const cur = (Array.isArray(block.cols) ? (block.cols as Block[][]) : []).map((c) =>
    Array.isArray(c) ? c : []
  );
  const out: Block[][] = [];
  for (let i = 0; i < want; i += 1) out.push(cur[i] ? [...cur[i]] : []);
  for (let i = want; i < cur.length; i += 1) out[want - 1].push(...cur[i]);
  return out;
}

function getAt(blocks: Block[], path: Path): Block | null {
  if (!path) return null;
  const [pid, ci, cid] = path.split("/");
  const top = blocks.find((b) => b.id === pid);
  if (!top) return null;
  if (cid === undefined) return top;
  return ensureCols(top)[Number(ci)]?.find((b) => b.id === cid) ?? null;
}

/** Rewrite the block at `path`. Returning null removes it — one traversal
    covers patch, delete and replace at both depths. */
function editAt(blocks: Block[], path: Path, fn: (b: Block) => Block | null): Block[] {
  if (!path) return blocks;
  const [pid, ci, cid] = path.split("/");
  if (cid === undefined) {
    const out: Block[] = [];
    for (const b of blocks) {
      if (b.id !== pid) {
        out.push(b);
        continue;
      }
      const n = fn(b);
      if (n) out.push(n);
    }
    return out;
  }
  return blocks.map((b) => {
    if (b.id !== pid) return b;
    const cols = ensureCols(b).map((col, i) => {
      if (i !== Number(ci)) return col;
      const out: Block[] = [];
      for (const c of col) {
        if (c.id !== cid) {
          out.push(c);
          continue;
        }
        const n = fn(c);
        if (n) out.push(n);
      }
      return out;
    });
    return { ...b, cols };
  });
}

/** Where a drop would land. `parent === null` means the top level. */
type Drop = { parent: string | null; col: number; index: number };
const sameDrop = (a: Drop | null, b: Drop | null) =>
  !!a && !!b && a.parent === b.parent && a.col === b.col && a.index === b.index;

function insertAt(blocks: Block[], drop: Drop, block: Block): Block[] {
  if (!drop.parent) {
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(drop.index, next.length)), 0, block);
    return next;
  }
  return blocks.map((b) => {
    if (b.id !== drop.parent) return b;
    const cols = ensureCols(b).map((col, i) => {
      if (i !== drop.col) return col;
      const next = [...col];
      next.splice(Math.max(0, Math.min(drop.index, next.length)), 0, block);
      return next;
    });
    return { ...b, cols };
  });
}

/** The list a path sits in, for index arithmetic. */
function listFor(blocks: Block[], path: Path): Block[] {
  if (!isChildPath(path)) return blocks;
  const [pid, ci] = path.split("/");
  const parent = blocks.find((b) => b.id === pid);
  return parent ? ensureCols(parent)[Number(ci)] ?? [] : [];
}

/** What is being dragged. The type travels with it because the guard against
    layouts-inside-layouts has to run during dragover, when dataTransfer is
    deliberately unreadable. */
type Drag = { kind: "new"; type: string } | { kind: "move"; type: string; path: Path };

export default function EmailBuilder({
  campaignId,
  stepIndex,
  step,
  initial,
  onClose,
  onSaved,
}: {
  campaignId: string;
  stepIndex: number;
  step: CampaignStep;
  initial: StepCopy | null;
  onClose: () => void;
  onSaved: (copy: StepCopy | null) => void;
}) {
  const [subject, setSubject] = useState(initial?.subject || step.subject);
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initial?.blocks?.length ? (initial.blocks as Block[]) : (blocksFor(step) as Block[])
  );
  const [selected, setSelected] = useState<Path>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  /* Shut on a phone so the first thing on screen is the email. The lg: rules
     above ignore this entirely, so the desktop rail is never hidden. */
  const [railOpen, setRailOpen] = useState(false);

  /* The drag itself lives in a ref, not state: dragover fires continuously and
     re-rendering the canvas under a live drag drops the drop. Only the
     INDICATOR position is state, because that's the one thing that must
     repaint. */
  const dragging = useRef<Drag | null>(null);
  const [dropAt, setDropAt] = useState<Drop | null>(null);

  const brand = useMemo(() => tleBrand(), []);
  const ctx = useMemo(
    () =>
      ({
        ...mergeContextFor({ name: "Susan Barnes", email: "susan@example.com" }, brand),
        address: "3 Buttermere Close",
      }) as Record<string, unknown>,
    [brand]
  );

  const change = (next: Block[]) => {
    setBlocks(next);
    setDirty(true);
    setNote("");
  };

  /* Ids are unique across the whole tree, so the inspector can keep saying
     "this id, this field" and the path is worked out here. That's what keeps
     the big Fields switch untouched by nesting. */
  const pathOf = (id: string): Path => {
    if (blocks.some((b) => b.id === id)) return id;
    for (const b of blocks) {
      if (b.type !== "columns") continue;
      const cols = ensureCols(b);
      for (let i = 0; i < cols.length; i += 1) {
        if (cols[i].some((c) => c.id === id)) return childPath(b.id, i, id);
      }
    }
    return "";
  };

  const patch = (id: string, field: string, value: unknown) => {
    const path = pathOf(id);
    if (!path) return;
    change(
      editAt(blocks, path, (b) =>
        // Changing the layout changes how many cells exist; growing or
        // shrinking `cols` to match is part of the same edit, never a
        // separate one the renderer has to survive in between.
        field === "layout" && b.type === "columns"
          ? { ...b, layout: value, cols: ensureCols({ ...b, layout: value } as Block) }
          : { ...b, [field]: value }
      )
    );
  };

  const move = (path: Path, by: number) => {
    const list = listFor(blocks, path);
    const id = isChildPath(path) ? path.split("/")[2] : path;
    const i = list.findIndex((b) => b.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    if (!isChildPath(path)) {
      change(reordered);
      return;
    }
    const [pid, ci] = path.split("/");
    change(
      blocks.map((b) =>
        b.id === pid
          ? { ...b, cols: ensureCols(b).map((c, k) => (k === Number(ci) ? reordered : c)) }
          : b
      )
    );
  };

  const remove = (path: Path) => {
    change(editAt(blocks, path, () => null));
    setSelected("");
  };

  /* Clicking a palette button still adds after whatever is selected — including
     inside a cell, so the keyboard-only route reaches the same places the
     mouse does. */
  const addBlock = (type: string) => {
    const b = fresh(type);
    if (selected && isChildPath(selected) && type !== "columns") {
      const [pid, ci, cid] = selected.split("/");
      const list = listFor(blocks, selected);
      const at = list.findIndex((x) => x.id === cid);
      const drop: Drop = { parent: pid, col: Number(ci), index: at < 0 ? list.length : at + 1 };
      change(insertAt(blocks, drop, b));
      setSelected(childPath(pid, Number(ci), b.id));
      return;
    }
    const topId = selected ? selected.split("/")[0] : "";
    const at = blocks.findIndex((x) => x.id === topId);
    const next = [...blocks];
    next.splice(at < 0 ? blocks.length : at + 1, 0, b);
    change(next);
    setSelected(b.id);
  };

  /* ── Drag and drop ────────────────────────────────────────────────────────
     Native HTML5 DnD, no library: the tree is small, the drop targets are
     explicit strips rather than computed geometry, and a dependency here
     would have to be kept email-safe forever. */
  const dnd = {
    at: dropAt,
    begin(d: Drag) {
      dragging.current = d;
    },
    end() {
      dragging.current = null;
      setDropAt(null);
    },
    over(d: Drop) {
      setDropAt((prev) => (sameDrop(prev, d) ? prev : d));
    },
    // A layout inside a layout produces nested tables, which Outlook breaks
    // and the renderer doesn't read anyway. Refused before it lands, not after.
    allows(parent: string | null) {
      const d = dragging.current;
      if (!d) return false;
      return parent === null || d.type !== "columns";
    },
    drop(target: Drop) {
      const d = dragging.current;
      dragging.current = null;
      setDropAt(null);
      if (!d) return;
      // Same guard as `allows`, re-checked here because the drop is the last
      // moment it can be refused.
      if (target.parent !== null && d.type === "columns") return;

      if (d.kind === "new") {
        const b = fresh(d.type);
        change(insertAt(blocks, target, b));
        setSelected(target.parent ? childPath(target.parent, target.col, b.id) : b.id);
        return;
      }

      const src = getAt(blocks, d.path);
      if (!src) return;

      // Moving within one list: taking the block out first shifts everything
      // after it up by one, so the target index has to come down to match or
      // the block lands one place too far along.
      const srcChild = isChildPath(d.path);
      const [spid, sci] = d.path.split("/");
      const sameList = srcChild
        ? target.parent === spid && target.col === Number(sci)
        : target.parent === null;
      let index = target.index;
      if (sameList) {
        const from = listFor(blocks, d.path).findIndex((b) => b.id === src.id);
        if (from > -1 && from < index) index -= 1;
      }

      const next = insertAt(editAt(blocks, d.path, () => null), { ...target, index }, src);
      change(next);
      setSelected(target.parent ? childPath(target.parent, target.col, src.id) : src.id);
    },
  };

  async function save() {
    setSaving(true);
    setNote("");
    try {
      const res = await fetch("/api/email-templates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, stepIndex, subject, blocks }),
      });
      const j = await res.json();
      if (j.saved) {
        setDirty(false);
        setNote("Saved.");
        onSaved({ subject, blocks });
      } else setNote(j.error ?? j.reason ?? "It didn't save.");
    } catch {
      setNote("It didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/email-templates?campaign=${encodeURIComponent(campaignId)}&step=${stepIndex}`,
        { method: "DELETE" }
      );
      const j = await res.json();
      if (j.saved) {
        setBlocks(blocksFor(step) as Block[]);
        setSubject(step.subject);
        setSelected("");
        setDirty(false);
        setNote("Back to what the campaign says in code.");
        onSaved(null);
      } else setNote(j.error ?? j.reason ?? "It didn't revert.");
    } finally {
      setSaving(false);
    }
  }

  /* Escape closes, but never over unsaved words. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dirty) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, onClose]);

  const sel = getAt(blocks, selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-0 backdrop-blur-sm sm:p-3">
      <div className="flex h-full w-full flex-col overflow-hidden border-line bg-panel shadow-2xl sm:rounded-2xl sm:border">
        {/* ── top ── */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Day {step.day} · {step.channel}
            </p>
            <p className="text-[12px] text-muted">
              {note || (dirty ? "Unsaved changes" : "Saved copy overrides the campaign in code.")}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRailOpen((o) => !o)}
              className="rounded-lg border border-line/70 px-2.5 py-1.5 text-[11.5px] hover:border-ink/30 lg:hidden"
            >
              {railOpen ? "Hide tools" : "Add & edit"}
            </button>
            <button
              type="button"
              onClick={revert}
              disabled={saving}
              className="rounded-lg border border-line/70 px-2.5 py-1.5 text-[11.5px] hover:border-ink/30 disabled:opacity-50"
            >
              Revert
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line/70 px-2.5 py-1.5 text-[11.5px] hover:border-ink/30"
            >
              {dirty ? "Close without saving" : "Close"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-lg bg-ink px-3.5 py-1.5 text-[11.5px] text-page disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* ── Stacked on a phone, side by side from lg.
            The EMAIL is first in the flow on a narrow screen, because that is
            the thing being looked at; the rail follows as a drawer. Before
            this the 232px rail sat beside the canvas at every width and
            squeezed it to a sliver on a handset. ── */}
        <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
          {/* ── the rail: what can't be typed ── */}
          <aside
            className={`shrink-0 overflow-y-auto border-line/70 p-3.5 lg:block lg:w-[232px] lg:max-h-none lg:border-r lg:border-t-0 ${
              railOpen ? "max-h-[45vh] border-t" : "hidden"
            }`}
          >
            <p className="mb-2 text-[10.5px] uppercase tracking-wide text-muted">Drop in</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
              {PALETTE.map((p) => (
                <button
                  key={p.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    dnd.begin({ kind: "new", type: p.type });
                    e.dataTransfer.effectAllowed = "copy";
                    // Firefox refuses to start a drag with an empty payload.
                    e.dataTransfer.setData("text/plain", p.type);
                  }}
                  onDragEnd={() => dnd.end()}
                  onClick={() => addBlock(p.type)}
                  className="cursor-grab rounded-lg border border-line/70 px-2 py-2 text-[11.5px] hover:border-ink/30 active:cursor-grabbing"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Drag one onto the email, or click to drop it in under whatever is selected.
            </p>

            <div className="mt-5 border-t border-line/60 pt-4">
              {sel ? (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10.5px] uppercase tracking-wide text-muted">
                      {sel.type}
                      {isChildPath(selected) ? " · in a column" : ""}
                    </p>
                    <div className="ml-auto flex gap-1">
                      <Mini onClick={() => move(selected, -1)} label="Move up">↑</Mini>
                      <Mini onClick={() => move(selected, 1)} label="Move down">↓</Mini>
                      <Mini onClick={() => remove(selected)} label="Delete">×</Mini>
                    </div>
                  </div>
                  <Fields block={sel} patch={patch} />
                </>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-muted">
                  Click anything in the email to change it. Words are typed straight onto the
                  page; everything else is set here.
                </p>
              )}
            </div>

            <p className="mt-5 border-t border-line/60 pt-4 text-[10.5px] leading-relaxed text-muted">
              The footer and the unsubscribe are added when it sends — they can&apos;t be
              forgotten and don&apos;t need writing.
            </p>
          </aside>

          {/* ── the email ── */}
          <div className="min-w-0 flex-1 overflow-y-auto bg-page p-3 sm:p-6">
            <div className="mx-auto max-w-[640px]">
              <label className="mb-1 block text-[10.5px] uppercase tracking-wide text-muted">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setDirty(true);
                  setNote("");
                }}
                className="mb-4 w-full rounded-lg border border-line/70 bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40"
              />

              <div
                className="rounded-2xl border border-line/60 bg-white p-5"
                style={{ backgroundColor: brand.cardColor }}
              >
                {blocks.map((b, i) => (
                  <Fragment key={b.id}>
                    <DropStrip drop={{ parent: null, col: 0, index: i }} dnd={dnd} />
                    <Canvas
                      block={b}
                      path={b.id}
                      brand={brand}
                      ctx={ctx}
                      selected={selected}
                      onSelect={setSelected}
                      onText={(id, text) => patch(id, "text", text)}
                      dnd={dnd}
                    />
                  </Fragment>
                ))}
                <DropStrip drop={{ parent: null, col: 0, index: blocks.length }} dnd={dnd} />
                {!blocks.length && (
                  <p className="py-10 text-center text-[12px] text-muted">
                    Nothing here yet — drag a block in from the left.
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] text-muted">Type these in anywhere:</span>
                {MERGE.map((m) => (
                  <code
                    key={m.token}
                    className="rounded-md border border-line/70 px-1.5 py-0.5 text-[10.5px] text-muted"
                  >
                    {m.token}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Dnd = {
  at: Drop | null;
  begin: (d: Drag) => void;
  end: () => void;
  over: (d: Drop) => void;
  allows: (parent: string | null) => boolean;
  drop: (d: Drop) => void;
};

function Mini({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-6 w-6 rounded-md border border-line/70 text-[12px] leading-none hover:border-ink/30"
    >
      {children}
    </button>
  );
}

/**
 * The gap between two blocks, as a drop target.
 *
 * Explicit strips rather than working out from the pointer whether it's in the
 * top or bottom half of a block: the halves version fights contenteditable,
 * which swallows drag events over the words themselves.
 */
function DropStrip({
  drop,
  dnd,
  tall,
}: {
  drop: Drop;
  dnd: Dnd;
  tall?: boolean;
}) {
  const active = sameDrop(dnd.at, drop);
  return (
    <div
      onDragOver={(e) => {
        if (!dnd.allows(drop.parent)) return;
        // Without preventDefault the browser refuses the drop outright.
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        dnd.over(drop);
      }}
      onDrop={(e) => {
        if (!dnd.allows(drop.parent)) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.drop(drop);
      }}
      className={`relative ${tall ? "h-4" : "-my-1 h-3"}`}
    >
      <div
        className={`absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full transition-colors ${
          active ? "bg-accent-dark" : "bg-transparent"
        }`}
      />
    </div>
  );
}

/**
 * One block, drawn by the real renderer.
 *
 * The words are edited in place with contenteditable, and committed on BLUR
 * rather than on every keystroke — React re-rendering the block's HTML under
 * a live caret sends it back to the start of the line, which makes typing
 * impossible.
 */
function Canvas({
  block,
  path,
  brand,
  ctx,
  selected,
  onSelect,
  onText,
  dnd,
}: {
  block: Block;
  path: Path;
  brand: Record<string, unknown>;
  ctx: Record<string, unknown>;
  selected: Path;
  onSelect: (p: Path) => void;
  onText: (id: string, text: string) => void;
  dnd: Dnd;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const editable = TYPEABLE.has(block.type);
  const isSelected = selected === path;

  /* Rendered from the block, but NOT re-rendered while it's being typed into:
     the html memo is keyed on the committed value, and the commit happens on
     blur. */
  const html = useMemo(() => {
    try {
      return renderBlock(block, brand, ctx) ?? "";
    } catch {
      return "";
    }
  }, [block, brand, ctx]);

  // The gaps between blocks belong to the renderer too — without them the
  // canvas runs every paragraph together and reads as a wall, which is
  // exactly the thing the writer is trying to judge.
  const m = resolveMargin(block) as { t: number; r: number; b: number; l: number };

  const shell = `group relative rounded-lg transition-colors ${
    isSelected ? "outline outline-2 outline-offset-2 outline-accent-dark/60" : "hover:bg-accent-soft/20"
  }`;

  /* The grip, not the block, starts the drag. Making the whole wrapper
     draggable steals the mouse from contenteditable, and you can no longer
     select a word to retype it. */
  const grip = (
    <span
      draggable
      onDragStart={(e) => {
        dnd.begin({ kind: "move", type: block.type, path });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", block.id);
        e.stopPropagation();
      }}
      onDragEnd={() => dnd.end()}
      title="Drag to move"
      // Sat on the corner rather than beside the first line: inside a quarter
      // column there is no margin to hang it in, and it would land on top of
      // the first word.
      className="absolute -left-2 -top-2.5 z-10 cursor-grab select-none rounded-md border border-line/70 bg-panel px-1 text-[11px] leading-[16px] text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
    >
      ⠿
    </span>
  );

  /* A layout block is drawn as real cells in the editor rather than handed to
     the renderer whole. The renderer's <table> is correct for sending but has
     nothing you can click into, and an empty cell comes out as a non-breaking
     space — which is precisely what made columns feel broken. */
  if (block.type === "columns") {
    const layout = layoutOf(block);
    const cols = ensureCols(block);
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect(path);
        }}
        style={{ marginTop: m.t, marginBottom: m.b, marginLeft: m.l, marginRight: m.r }}
        className={shell}
      >
        {grip}
        <div className="flex gap-2">
          {cols.map((children, i) => (
            <div
              key={i}
              style={{ width: `${layout.w[i]}%` }}
              className="min-w-0 rounded-lg border border-dashed border-line/70 p-1.5"
            >
              {children.map((c, j) => (
                <Fragment key={c.id}>
                  <DropStrip drop={{ parent: block.id, col: i, index: j }} dnd={dnd} />
                  <Canvas
                    block={c}
                    path={childPath(block.id, i, c.id)}
                    brand={brand}
                    ctx={ctx}
                    selected={selected}
                    onSelect={onSelect}
                    onText={onText}
                    dnd={dnd}
                  />
                </Fragment>
              ))}
              {children.length ? (
                <DropStrip
                  drop={{ parent: block.id, col: i, index: children.length }}
                  dnd={dnd}
                />
              ) : (
                <EmptyCell drop={{ parent: block.id, col: i, index: 0 }} dnd={dnd} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect(path);
      }}
      style={{ marginTop: m.t, marginBottom: m.b, marginLeft: m.l, marginRight: m.r }}
      className={shell}
    >
      {grip}
      <div
        ref={ref}
        // Typing goes straight onto the email. The renderer's own inline
        // styles come with it, so what's under the caret is what sends.
        contentEditable={editable}
        suppressContentEditableWarning
        onBlur={() => {
          if (!editable) return;
          const text = ref.current?.innerText ?? "";
          if (text !== block.text) onText(block.id, text.replace(/\n{3,}/g, "\n\n").trimEnd());
        }}
        dangerouslySetInnerHTML={{ __html: html }}
        className={editable ? "outline-none" : "pointer-events-none"}
      />
    </div>
  );
}

/** An empty column has to LOOK like somewhere you can put something. */
function EmptyCell({ drop, dnd }: { drop: Drop; dnd: Dnd }) {
  const active = sameDrop(dnd.at, drop);
  return (
    <div
      onDragOver={(e) => {
        if (!dnd.allows(drop.parent)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        dnd.over(drop);
      }}
      onDrop={(e) => {
        if (!dnd.allows(drop.parent)) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.drop(drop);
      }}
      className={`flex min-h-[64px] items-center justify-center rounded-md border border-dashed px-2 text-center text-[10.5px] leading-tight transition-colors ${
        active ? "border-accent-dark bg-accent-soft/30 text-ink" : "border-line/70 text-muted"
      }`}
    >
      Drop something here
    </div>
  );
}

/** The parts of a block that can't be typed. */
function Fields({
  block,
  patch,
}: {
  block: Block;
  patch: (id: string, field: string, value: unknown) => void;
}) {
  const field =
    "w-full rounded-lg border border-line/70 bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-ink/40";
  const str = (k: string) => (typeof block[k] === "string" ? (block[k] as string) : "");
  const label = (t: string) => <span className="mb-1 block text-[10.5px] text-muted">{t}</span>;

  const num = (k: string) => (block[k] == null || block[k] === "" ? "" : String(block[k]));

  /* ── Type controls, shared by heading / text / button ──────────────────────
     Font, size and colour on ONE row each rather than behind a disclosure:
     the whole reason this editor exists is that Francesca should not need to
     ask anybody to change a word or a colour. */
  const typography = (
    <>
      <label className="mt-2 block">
        {label("Font")}
        <select
          className={field}
          value={str("font")}
          onChange={(e) => patch(block.id, "font", e.target.value)}
        >
          <option value="">Match the brand default</option>
          {FONT_STACKS.map((f: { key: string; label: string; web?: boolean }) => (
            <option key={f.key} value={f.key}>
              {f.label}
              {f.web ? " — not everywhere" : ""}
            </option>
          ))}
        </select>
        {/* Said HERE, at the moment of choosing, not in a help page. */}
        {FONT_STACKS.find((f: { key: string; web?: boolean }) => f.key === str("font"))?.web && (
          <span className="mt-1 block text-[10.5px] leading-relaxed text-amber-700">
            Gmail and Outlook on Windows strip web fonts. Those readers see the
            fallback, so keep this for a display word rather than a paragraph.
          </span>
        )}
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          {label("Size (px)")}
          <input
            type="number"
            min={9}
            max={80}
            className={field}
            placeholder={block.type === "heading" ? "28" : "15"}
            value={num("size")}
            onChange={(e) =>
              patch(block.id, "size", e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </label>
        <label className="block">
          {label("Line height")}
          <input
            type="number"
            step="0.05"
            min={0.9}
            max={2.2}
            className={field}
            placeholder={block.type === "heading" ? "1.15" : "1.6"}
            value={num("lineHeight")}
            onChange={(e) =>
              patch(block.id, "lineHeight", e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </label>
      </div>

      <div className="mt-2">
        {label("Colour")}
        <div className="flex flex-wrap items-center gap-1.5">
          {BRAND_COLOURS.map((c: { key: string; label: string; hex: string }) => {
            const on = str("color").toUpperCase() === c.hex.toUpperCase();
            return (
              <button
                key={c.key}
                type="button"
                title={`${c.label} ${c.hex}`}
                onClick={() => patch(block.id, "color", c.hex)}
                className={`h-6 w-6 rounded-full border-2 transition-colors ${
                  on ? "border-ink" : "border-line/70 hover:border-ink/40"
                }`}
                style={{ background: c.hex }}
              />
            );
          })}
          {/* The swatches are the brand; the field is the escape hatch. */}
          <input
            className={`${field} ml-1 w-24`}
            placeholder="#hex"
            value={str("color")}
            onChange={(e) => patch(block.id, "color", e.target.value)}
          />
          {str("color") && (
            <button
              type="button"
              onClick={() => patch(block.id, "color", "")}
              className="text-[10.5px] font-semibold text-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </>
  );

  const align = (
    <label className="mt-2 block">
      {label("Align")}
      <select
        className={field}
        value={str("align") || "left"}
        onChange={(e) => patch(block.id, "align", e.target.value)}
      >
        <option value="left">Left</option>
        <option value="center">Centre</option>
        <option value="right">Right</option>
      </select>
    </label>
  );

  switch (block.type) {
    case "heading":
    case "text":
      return (
        <>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Type the words straight onto the email.
          </p>
          {align}
          {typography}
        </>
      );
    case "button":
      return (
        <>
          <label className="block">
            {label("Where it goes")}
            <input
              className={field}
              placeholder="https://…"
              value={str("url")}
              onChange={(e) => patch(block.id, "url", e.target.value)}
            />
          </label>
          {align}
          {typography}
        </>
      );
    case "columns":
      return (
        <>
          <label className="block">
            {label("Layout")}
            <select
              className={field}
              value={str("layout") || "50-50"}
              onChange={(e) => patch(block.id, "layout", e.target.value)}
            >
              {COLUMN_LAYOUTS.map((l: { key: string; label: string }) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-[11.5px]">
            <input
              type="checkbox"
              checked={block.stackMobile !== false}
              onChange={(e) => patch(block.id, "stackMobile", e.target.checked)}
            />
            {/* Four columns at 140px each on a phone is unreadable, so this is
                on by default and turning it off is the deliberate act. */}
            Stack into one column on a phone
          </label>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            Drag anything from the left into a column. Fewer columns keeps
            whatever was in the ones that went, moved into the last column.
          </p>
        </>
      );
    case "quote":
      return (
        <>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Type the quote straight onto the email.
          </p>
          <label className="mt-2 block">
            {label("Who said it")}
            <input
              className={field}
              placeholder="A landlord in Chorlton"
              value={str("who")}
              onChange={(e) => patch(block.id, "who", e.target.value)}
            />
          </label>
          {align}
          {typography}
        </>
      );
    case "image":
      return (
        <>
          <label className="block">
            {label("Image URL")}
            <input
              className={field}
              value={str("url")}
              onChange={(e) => patch(block.id, "url", e.target.value)}
            />
          </label>
          <label className="mt-2 block">
            {label("What it shows")}
            <input
              className={field}
              value={str("alt")}
              onChange={(e) => patch(block.id, "alt", e.target.value)}
            />
          </label>
          {align}
        </>
      );
    case "spacer":
      return (
        <label className="block">
          {label("Height (px)")}
          <input
            type="number"
            min={4}
            max={120}
            className={field}
            value={Number(block.height) || 24}
            onChange={(e) => patch(block.id, "height", Number(e.target.value))}
          />
        </label>
      );
    default:
      return <p className="text-[11.5px] text-muted">Nothing to set — it just draws a line.</p>;
  }
}
