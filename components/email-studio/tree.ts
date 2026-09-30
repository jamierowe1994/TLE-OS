/**
 * The email as a tree of blocks, and every edit the studio makes to it.
 *
 * Two levels and no more: a top-level list of sections, and inside a
 * `columns` section, one list per cell. The renderer draws no deeper and
 * nested column tables break in Outlook, so a path is at most three parts:
 *
 *   "b_7"          a top-level section
 *   "b_7/1/b_9"    block b_9, in cell 1, of the columns section b_7
 *
 * Pure functions only - the studio holds the state and the history.
 */
import { COLUMN_LAYOUTS, makeBlock } from "@/lib/email/render.js";

export type Block = Record<string, unknown> & { type: string; id: string };
export type Path = string;
/** Where something can be dropped: a top-level index, or an index in a cell. */
export type Drop = { parent: string | null; col: number; index: number };

type Layout = { key: string; label: string; cols: number; w: number[] };
export const LAYOUTS = COLUMN_LAYOUTS as Layout[];

let seq = 0;
export const newId = () => `es_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** A fresh block of a type, shaped by the renderer that will draw it. */
export function fresh(type: string): Block {
  const b = makeBlock(type) as Block;
  return { ...b, id: newId() };
}

export const childPath = (parent: string, col: number, id: string) => `${parent}/${col}/${id}`;
export const isChild = (p: Path) => p.split("/").length === 3;
export const idOf = (p: Path) => (isChild(p) ? p.split("/")[2] : p);
export const sameDrop = (a: Drop | null, b: Drop | null) =>
  !!a && !!b && a.parent === b.parent && a.col === b.col && a.index === b.index;

export const layoutOf = (b: Block): Layout => LAYOUTS.find((l) => l.key === b.layout) ?? LAYOUTS[1];

/** The cells, sized to the layout. Overflow folds into the last cell, never lost. */
export function cellsOf(b: Block): Block[][] {
  const want = layoutOf(b).cols;
  const cur = (Array.isArray(b.cols) ? (b.cols as Block[][]) : []).map((c) => (Array.isArray(c) ? c : []));
  const out: Block[][] = [];
  for (let i = 0; i < want; i += 1) out.push(cur[i] ? [...cur[i]] : []);
  for (let i = want; i < cur.length; i += 1) out[want - 1].push(...cur[i]);
  return out;
}

export function getAt(blocks: Block[], path: Path): Block | null {
  if (!path) return null;
  const [pid, ci, cid] = path.split("/");
  const top = blocks.find((b) => b.id === pid);
  if (!top) return null;
  if (cid === undefined) return top;
  return cellsOf(top)[Number(ci)]?.find((b) => b.id === cid) ?? null;
}

/** Rewrite the block at a path; returning null removes it. */
export function editAt(blocks: Block[], path: Path, fn: (b: Block) => Block | null): Block[] {
  if (!path) return blocks;
  const [pid, ci, cid] = path.split("/");
  if (cid === undefined) {
    const out: Block[] = [];
    for (const b of blocks) {
      if (b.id !== pid) out.push(b);
      else {
        const next = fn(b);
        if (next) out.push(next);
      }
    }
    return out;
  }
  return blocks.map((b) => {
    if (b.id !== pid) return b;
    const cols = cellsOf(b).map((cell, i) => {
      if (i !== Number(ci)) return cell;
      const out: Block[] = [];
      for (const c of cell) {
        if (c.id !== cid) out.push(c);
        else {
          const next = fn(c);
          if (next) out.push(next);
        }
      }
      return out;
    });
    return { ...b, cols };
  });
}

export function insertAt(blocks: Block[], drop: Drop, block: Block): Block[] {
  if (!drop.parent) {
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(drop.index, next.length)), 0, block);
    return next;
  }
  return blocks.map((b) => {
    if (b.id !== drop.parent) return b;
    const cols = cellsOf(b).map((cell, i) => {
      if (i !== drop.col) return cell;
      const next = [...cell];
      next.splice(Math.max(0, Math.min(drop.index, next.length)), 0, block);
      return next;
    });
    return { ...b, cols };
  });
}

/** The list a path sits in. */
export function listFor(blocks: Block[], path: Path): Block[] {
  if (!isChild(path)) return blocks;
  const [pid, ci] = path.split("/");
  const parent = blocks.find((b) => b.id === pid);
  return parent ? cellsOf(parent)[Number(ci)] ?? [] : [];
}

/** Where the block at a path currently sits, as a Drop. */
export function dropOf(blocks: Block[], path: Path): Drop {
  const id = idOf(path);
  const index = listFor(blocks, path).findIndex((b) => b.id === id);
  if (!isChild(path)) return { parent: null, col: 0, index };
  const [pid, ci] = path.split("/");
  return { parent: pid, col: Number(ci), index };
}

export function pathFor(drop: Drop, id: string): Path {
  return drop.parent ? childPath(drop.parent, drop.col, id) : id;
}

/**
 * Move a block to a drop target (drag and drop, or the arrows). Taking it out
 * first shifts everything after it up one, so a target later in the same list
 * comes down one to land where the line was drawn.
 */
export function moveTo(blocks: Block[], path: Path, target: Drop): { blocks: Block[]; path: Path } | null {
  const src = getAt(blocks, path);
  if (!src) return null;
  if (target.parent !== null && src.type === "columns") return null;
  if (target.parent === src.id) return null;
  const from = dropOf(blocks, path);
  const sameList = from.parent === target.parent && from.col === target.col;
  const index = sameList && from.index < target.index ? target.index - 1 : target.index;
  const next = insertAt(editAt(blocks, path, () => null), { ...target, index }, src);
  return { blocks: next, path: pathFor({ ...target, index }, src.id) };
}

/** Up or down one place within its own list. */
export function nudge(blocks: Block[], path: Path, by: -1 | 1): { blocks: Block[]; path: Path } | null {
  const at = dropOf(blocks, path);
  const len = listFor(blocks, path).length;
  const to = at.index + by;
  if (at.index < 0 || to < 0 || to >= len) return null;
  return moveTo(blocks, path, { ...at, index: by > 0 ? to + 1 : to });
}

/** A copy with new ids all the way down, dropped in just below the original. */
export function duplicate(blocks: Block[], path: Path): { blocks: Block[]; path: Path } | null {
  const src = getAt(blocks, path);
  if (!src) return null;
  const clone = (b: Block): Block => ({
    ...structuredClone(b),
    id: newId(),
    ...(b.type === "columns" ? { cols: cellsOf(b).map((cell) => cell.map(clone)) } : {}),
  });
  const copy = clone(src);
  const at = dropOf(blocks, path);
  const target = { ...at, index: at.index + 1 };
  return { blocks: insertAt(blocks, target, copy), path: pathFor(target, copy.id) };
}

/** The id of every block, top level and in cells, for finding a path by id. */
export function pathOfId(blocks: Block[], id: string): Path {
  if (blocks.some((b) => b.id === id)) return id;
  for (const b of blocks) {
    if (b.type !== "columns") continue;
    const cells = cellsOf(b);
    for (let i = 0; i < cells.length; i += 1) if (cells[i].some((c) => c.id === id)) return childPath(b.id, i, id);
  }
  return "";
}
