"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderBlock, resolveMargin } from "@/lib/email/render.js";
import {
  cellsOf,
  childPath,
  duplicate,
  editAt,
  fresh,
  getAt,
  idOf,
  insertAt,
  isChild,
  layoutOf,
  moveTo,
  nudge,
  pathFor,
  sameDrop,
  type Block,
  type Drop,
  type Path,
} from "./tree";
import { ICONS, UI } from "./icons";
import { Field, Group, Inspector, LABEL, TextInput, TypeIcon } from "./Inspector";

/**
 * The email studio (30 Sep 2026): a three-panel, Mailchimp-style designer.
 *
 *   left     the block library (drag onto the email, or click to add below
 *            the selection), and Sections - every section in order, draggable
 *   middle   the live email, drawn block by block by the SENDING renderer.
 *            Hover shows a section's edge; click selects it and puts a
 *            toolbar on it - drag, up, down, duplicate, delete. Words are
 *            typed straight onto the page, with a formatting bar for text.
 *   right    the selected section's settings, or the email's own (subject,
 *            inbox line) when nothing is selected
 *
 * James's brief: "select the section and then move that section down,
 * rather than just a click button on the side that doesn't really work",
 * and "a significantly nicer layout". The block data is the same as the old
 * builder's, so everything already written opens here unchanged.
 */

export type StudioCopy = { subject: string; preheader: string; blocks: Block[] };

type Drag = { kind: "new"; type: string } | { kind: "move"; type: string; path: Path };

/* The library, grouped the way people look for things. */
const LIBRARY: { title: string; items: string[] }[] = [
  { title: "Basics", items: ["heading", "text", "button", "divider", "spacer"] },
  { title: "Media", items: ["image", "video", "social", "logo"] },
  { title: "Layout", items: ["columns"] },
  { title: "Extras", items: ["quote", "faq", "code"] },
];

/* What a new block starts as, where the renderer's defaults are someone
   else's (TMKE's) words or links. */
function starter(type: string): Block {
  const b = fresh(type);
  switch (type) {
    case "heading":
      return { ...b, text: "A New Heading" };
    case "text":
      return { ...b, text: "Write something here. Click to type.", html: "" };
    case "button":
      return { ...b, text: "Find Out More", url: "https://tle-os.co.uk" };
    case "logo":
      return { ...b, linkUrl: "https://thelettingexperts.co.uk" };
    case "quote":
      return { ...b, text: "Somebody's words, in their own voice.", who: "A landlord in Northampton" };
    case "code":
      return { ...b, html: '<p style="margin:0;font-family:Arial,sans-serif;">Your own HTML goes here.</p>' };
    case "social":
      return { ...b, show: { instagram: true, facebook: true, linkedin: true, website: true, twitter: false, youtube: false } };
    default:
      return b;
  }
}

/** A one-line name for a section in the Sections list. */
function summary(b: Block): string {
  const raw = (typeof b.text === "string" && b.text) || (typeof b.html === "string" && b.html) || (typeof b.title === "string" && b.title) || "";
  const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (b.type === "columns") return `${cellsOf(b).length} columns`;
  if (b.type === "image") return (b.alt as string) || (b.url ? "Picture" : "No picture yet");
  return plain.slice(0, 42) || LABEL[b.type] || b.type;
}

const EDITABLE = new Set(["heading", "text", "button", "quote"]);
const HISTORY = 80;

export default function Studio({
  title,
  kindLabel,
  initial,
  brand,
  onSave,
  onClose,
  uploadImage,
  previewHtml,
  onSendTest,
}: {
  title: string;
  kindLabel: string;
  initial: StudioCopy;
  brand: Record<string, unknown>;
  /** Resolves to an error sentence, or null when saved. */
  onSave: (copy: StudioCopy) => Promise<string | null>;
  onClose: () => void;
  uploadImage?: (file: File) => Promise<string>;
  /** The whole email, as sent, for Preview. */
  previewHtml: (copy: StudioCopy) => string;
  /** Sends a test of what is SAVED; the studio saves first. */
  onSendTest?: () => Promise<string>;
}) {
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks);
  const [subject, setSubject] = useState(initial.subject);
  const [preheader, setPreheader] = useState(initial.preheader);
  const [selected, setSelected] = useState<Path>("");
  const [editing, setEditing] = useState<Path>("");
  const [tab, setTab] = useState<"blocks" | "sections">("blocks");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const [, force] = useState(0);

  /* Undo and redo: every change is a snapshot. */
  const past = useRef<Block[][]>([]);
  const future = useRef<Block[][]>([]);
  const change = useCallback((next: Block[], sel?: Path) => {
    setBlocks((cur) => {
      past.current = [...past.current.slice(-HISTORY), cur];
      future.current = [];
      return next;
    });
    if (sel !== undefined) setSelected(sel);
    setDirty(true);
    setNote(null);
    force((x) => x + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setBlocks((cur) => {
      future.current = [cur, ...future.current];
      return prev;
    });
    setSelected("");
    setDirty(true);
    force((x) => x + 1);
  }, []);
  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (!next) return;
    future.current = rest;
    setBlocks((cur) => {
      past.current = [...past.current, cur];
      return next;
    });
    setSelected("");
    setDirty(true);
    force((x) => x + 1);
  }, []);

  const patch = useCallback(
    (path: Path, field: string, value: unknown) => {
      change(
        editAt(blocks, path, (b) =>
          field === "layout" && b.type === "columns"
            ? { ...b, layout: value, cols: cellsOf({ ...b, layout: value } as Block) }
            : { ...b, [field]: value }
        )
      );
    },
    [blocks, change]
  );

  /* ── Drag and drop ────────────────────────────────────────────────────── */
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropAt, setDropAt] = useState<Drop | null>(null);
  const dnd = {
    at: dropAt,
    active: dragging,
    begin(d: Drag) {
      drag.current = d;
      /* Deferred a frame: changing the page under the pointer as the drag
         starts makes Chrome cancel it. */
      requestAnimationFrame(() => setDragging(true));
    },
    end() {
      drag.current = null;
      setDragging(false);
      setDropAt(null);
    },
    allows(parent: string | null) {
      const d = drag.current;
      return Boolean(d) && (parent === null || d!.type !== "columns");
    },
    over(d: Drop) {
      setDropAt((p) => (sameDrop(p, d) ? p : d));
    },
    drop(target: Drop) {
      const d = drag.current;
      dnd.end();
      if (!d) return;
      if (d.kind === "new") {
        if (target.parent !== null && d.type === "columns") return;
        const b = starter(d.type);
        change(insertAt(blocks, target, b), pathFor(target, b.id));
        return;
      }
      const moved = moveTo(blocks, d.path, target);
      if (moved) change(moved.blocks, moved.path);
    },
  };

  /** Click a tile: in under the selection (inside its cell, if it is in one). */
  const add = (type: string) => {
    const b = starter(type);
    if (selected && isChild(selected) && type !== "columns") {
      const [pid, ci, cid] = selected.split("/");
      const cell = cellsOf(getAt(blocks, pid) as Block)[Number(ci)];
      const drop = { parent: pid, col: Number(ci), index: cell.findIndex((x) => x.id === cid) + 1 };
      change(insertAt(blocks, drop, b), pathFor(drop, b.id));
      return;
    }
    const top = selected ? selected.split("/")[0] : "";
    const at = blocks.findIndex((x) => x.id === top);
    const drop = { parent: null, col: 0, index: at < 0 ? blocks.length : at + 1 };
    change(insertAt(blocks, drop, b), b.id);
  };

  const act = {
    up: (p: Path) => {
      const r = nudge(blocks, p, -1);
      if (r) change(r.blocks, r.path);
    },
    down: (p: Path) => {
      const r = nudge(blocks, p, 1);
      if (r) change(r.blocks, r.path);
    },
    copy: (p: Path) => {
      const r = duplicate(blocks, p);
      if (r) change(r.blocks, r.path);
    },
    remove: (p: Path) => change(editAt(blocks, p, () => null), ""),
  };

  /* ── Keys ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable='true']");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        act.remove(selected);
      } else if (e.key === "Escape") setSelected("");
      else if (e.key === "ArrowUp" && e.altKey && selected) act.up(selected);
      else if (e.key === "ArrowDown" && e.altKey && selected) act.down(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function save(): Promise<boolean> {
    setBusy("save");
    setNote(null);
    try {
      const err = await onSave({ subject, preheader, blocks });
      if (err) {
        setNote({ text: err, bad: true });
        return false;
      }
      setDirty(false);
      setNote({ text: "Saved" });
      return true;
    } catch {
      setNote({ text: "It didn't save.", bad: true });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function test() {
    if (!onSendTest) return;
    if (dirty && !(await save())) return;
    setBusy("test");
    try {
      setNote({ text: await onSendTest() });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "The test didn't send.", bad: true });
    } finally {
      setBusy("");
    }
  }

  const close = () => {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };

  /* The canvas shows merge fields as they are written ({{firstName}}), so
     typing around one can never bake somebody's real name into the email. */
  const ctx = useMemo(() => ({}), []);
  const sel = getAt(blocks, selected);
  const logo = typeof brand.logo === "string" ? brand.logo : "";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex flex-col bg-[#efebe7] text-[#1c1917]" style={{ fontFamily: "var(--font-body)" }}>
      {/* ── Top bar ── */}
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#e4dfdb] bg-white px-3 sm:px-4">
        <button type="button" onClick={close} title="Close" className="grid h-9 w-9 place-items-center rounded-lg text-[#6b625e] hover:bg-[#f3f0ed] hover:text-[#1c1917]">
          <UI.close size={18} />
        </button>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#a85a51]">{kindLabel}</p>
          <p className="truncate text-[14px] font-semibold leading-tight">{title}</p>
        </div>
        <div className="mx-auto hidden items-center rounded-lg bg-[#f3f0ed] p-0.5 md:flex">
          {(["desktop", "mobile"] as const).map((d) => {
            const I = d === "desktop" ? UI.desktop : UI.mobile;
            return (
              <button key={d} type="button" onClick={() => setDevice(d)} title={d === "desktop" ? "Computer" : "Phone"} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] ${device === d ? "bg-white font-semibold shadow-sm" : "text-[#8a817c]"}`}>
                <I size={15} /> {d === "desktop" ? "Computer" : "Phone"}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {note && <span className={`hidden text-[12px] sm:inline ${note.bad ? "text-[#a85a51]" : "text-[#56634a]"}`}>{note.text}</span>}
          {!note && dirty && <span className="hidden text-[12px] text-[#9a908a] sm:inline">Unsaved changes</span>}
          <IconBtn title="Undo (⌘Z)" disabled={!past.current.length} onClick={undo}><UI.undo size={17} /></IconBtn>
          <IconBtn title="Redo (⇧⌘Z)" disabled={!future.current.length} onClick={redo}><UI.redo size={17} /></IconBtn>
          <button type="button" onClick={() => setPreview(true)} className="hidden items-center gap-1.5 rounded-lg border border-[#e4dfdb] px-3 py-2 text-[12.5px] font-medium hover:border-[#b9b0aa] sm:flex">
            <UI.eye size={15} /> Preview
          </button>
          {onSendTest && (
            <button type="button" disabled={busy !== ""} onClick={() => void test()} className="hidden items-center gap-1.5 rounded-lg border border-[#e4dfdb] px-3 py-2 text-[12.5px] font-medium hover:border-[#b9b0aa] disabled:opacity-50 sm:flex">
              <UI.send size={15} /> {busy === "test" ? "Sending…" : "Send test"}
            </button>
          )}
          <button type="button" disabled={busy !== "" || !dirty} onClick={() => void save()} className="rounded-lg bg-[#56423e] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40">
            {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Left: the library ── */}
        <aside className="hidden w-[272px] shrink-0 flex-col border-r border-[#e4dfdb] bg-white md:flex">
          <div className="m-3 flex rounded-lg bg-[#f3f0ed] p-0.5">
            {(
              [
                { v: "blocks", label: "Blocks", I: UI.plus },
                { v: "sections", label: "Sections", I: UI.layers },
              ] as const
            ).map((o) => (
              <button key={o.v} type="button" onClick={() => setTab(o.v)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12.5px] ${tab === o.v ? "bg-white font-semibold shadow-sm" : "text-[#8a817c]"}`}>
                <o.I size={14} /> {o.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
            {tab === "blocks" ? (
              <>
                {LIBRARY.map((g) => (
                  <div key={g.title} className="mb-4">
                    <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#a39a94]">{g.title}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {g.items.map((type) => {
                        const I = ICONS[type];
                        return (
                          <button
                            key={type}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              dnd.begin({ kind: "new", type });
                              e.dataTransfer.effectAllowed = "copy";
                              e.dataTransfer.setData("text/plain", type);
                            }}
                            onDragEnd={() => dnd.end()}
                            onClick={() => add(type)}
                            className="group flex h-[74px] cursor-grab flex-col items-center justify-center gap-1.5 rounded-xl border border-[#ebe6e2] bg-[#fdfcfb] text-[#3b3431] transition-all hover:-translate-y-px hover:border-[#cfc5bf] hover:bg-white hover:shadow-[0_4px_14px_-6px_rgba(86,66,62,0.35)] active:cursor-grabbing"
                          >
                            <span className="text-[#6b625e] transition-colors group-hover:text-[#56423e]">
                              <I size={22} />
                            </span>
                            <span className="text-[11.5px] font-medium">{LABEL[type]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="px-1 text-[11px] leading-relaxed text-[#9a908a]">Drag a block onto the email, or click one to add it under the selected section.</p>
              </>
            ) : (
              <Outline blocks={blocks} selected={selected} onSelect={setSelected} dnd={dnd} act={act} />
            )}
          </div>
        </aside>

        {/* ── Middle: the email ── */}
        <main className="min-w-0 flex-1 overflow-y-auto" onClick={() => setSelected("")}>
          <div className="mx-auto px-4 py-8 transition-all" style={{ maxWidth: device === "mobile" ? 420 : 720 }}>
            <div className="mb-3 flex items-baseline gap-2 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a39a94]">Subject</span>
              <span className="truncate text-[13px] font-medium text-[#3b3431]">{subject || "No subject yet"}</span>
            </div>
            <div
              className="mx-auto rounded-2xl bg-white shadow-[0_20px_60px_-24px_rgba(60,40,36,0.35)] ring-1 ring-black/5 transition-all"
              style={{ width: device === "mobile" ? 375 : 600, maxWidth: "100%" }}
            >
              {logo && (
                <div className="px-8 pt-7">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="The Letting Experts" className="h-9 w-auto" />
                </div>
              )}
              <div className={device === "mobile" ? "px-5 py-6" : "px-8 py-7"}>
                {blocks.map((b, i) => (
                  <Fragment key={b.id}>
                    <DropZone drop={{ parent: null, col: 0, index: i }} dnd={dnd} />
                    <Section
                      block={b}
                      path={b.id}
                      brand={brand}
                      ctx={ctx}
                      selected={selected}
                      editing={editing}
                      onSelect={setSelected}
                      onEditing={setEditing}
                      onCommit={(path, fields) => change(editAt(blocks, path, (x) => ({ ...x, ...fields })))}
                      dnd={dnd}
                      act={act}
                      isFirst={i === 0}
                      isLast={i === blocks.length - 1}
                    />
                  </Fragment>
                ))}
                <DropZone drop={{ parent: null, col: 0, index: blocks.length }} dnd={dnd} tall={!blocks.length} />
                {!blocks.length && !dragging && (
                  <div className="rounded-xl border-2 border-dashed border-[#e4dfdb] py-16 text-center">
                    <p className="text-[14px] font-semibold text-[#3b3431]">Start with a block</p>
                    <p className="mt-1 text-[12.5px] text-[#9a908a]">Drag one in from the left, or click it.</p>
                  </div>
                )}
              </div>
              <div className="border-t border-[#f0ece9] px-8 py-5 text-center text-[11.5px] text-[#a39a94]">
                Sent to the TLE team from TLE OS · The Letting Experts
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-[#a39a94]">
              {"{{firstName}}"} becomes each person&apos;s first name when it sends.
            </p>
          </div>
        </main>

        {/* ── Right: settings ── */}
        <aside className="hidden w-[308px] shrink-0 overflow-y-auto border-l border-[#e4dfdb] bg-white lg:block">
          {sel ? (
            <>
              <div className="flex items-center gap-2.5 border-b border-[#eeeae6] px-5 py-4">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f6f1ee] text-[#56423e]">
                  <TypeIcon type={sel.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-tight">{LABEL[sel.type] ?? sel.type}</p>
                  <p className="text-[11px] text-[#9a908a]">{isChild(selected) ? "Inside a column" : "Section"}</p>
                </div>
                <button type="button" onClick={() => setSelected("")} title="Done" className="grid h-8 w-8 place-items-center rounded-lg text-[#8a817c] hover:bg-[#f3f0ed]">
                  <UI.close size={16} />
                </button>
              </div>
              <Inspector block={sel} patch={(f, v) => patch(selected, f, v)} uploadImage={uploadImage} />
              <div className="flex gap-2 p-5">
                <button type="button" onClick={() => act.copy(selected)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e4dfdb] py-2 text-[12.5px] font-medium hover:border-[#b9b0aa]">
                  <UI.copy size={15} /> Duplicate
                </button>
                <button type="button" onClick={() => act.remove(selected)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#f0d9d5] py-2 text-[12.5px] font-medium text-[#a85a51] hover:bg-[#fbf1ef]">
                  <UI.trash size={15} /> Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[#eeeae6] px-5 py-4">
                <p className="text-[14px] font-semibold">Email settings</p>
                <p className="text-[11.5px] text-[#9a908a]">Click any section on the email to change it.</p>
              </div>
              <Group title="In the inbox">
                <Field label="Subject line">
                  <TextInput value={subject} onChange={(e) => { setSubject(e.target.value); setDirty(true); setNote(null); }} placeholder="What people see first" />
                </Field>
                <Field label="Preview line" hint="The grey words after the subject in most inboxes.">
                  <TextInput value={preheader} onChange={(e) => { setPreheader(e.target.value); setDirty(true); setNote(null); }} placeholder="A short line that makes them open it" />
                </Field>
                <button
                  type="button"
                  onClick={() => { setSubject((s) => `${s}{{firstName}}`); setDirty(true); }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-[#56423e]"
                >
                  <UI.person size={14} /> Add their first name to the subject
                </button>
              </Group>
              <Group title="Tips">
                <ul className="space-y-2 text-[12px] leading-relaxed text-[#6b625e]">
                  <li>Drag a section by its handle, or use the arrows on it, to move it up and down.</li>
                  <li>⌥↑ and ⌥↓ move the selected section. ⌘Z undoes.</li>
                  <li>Keep pictures under 1MB; big ones load slowly on phones.</li>
                </ul>
              </Group>
            </>
          )}
        </aside>
      </div>

      {preview && <PreviewModal html={previewHtml({ subject, preheader, blocks })} subject={subject} onClose={() => setPreview(false)} />}
    </div>,
    document.body
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function IconBtn({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg text-[#6b625e] hover:bg-[#f3f0ed] hover:text-[#1c1917] disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

type Dnd = {
  at: Drop | null;
  active: boolean;
  begin: (d: Drag) => void;
  end: () => void;
  allows: (parent: string | null) => boolean;
  over: (d: Drop) => void;
  drop: (d: Drop) => void;
};

type Acts = { up: (p: Path) => void; down: (p: Path) => void; copy: (p: Path) => void; remove: (p: Path) => void };

/**
 * The gap between sections. Barely there until something is being dragged,
 * then a clear target with a line and a label where it will land.
 */
function DropZone({ drop, dnd, tall }: { drop: Drop; dnd: Dnd; tall?: boolean }) {
  const on = sameDrop(dnd.at, drop);
  return (
    <div
      onDragOver={(e) => {
        if (!dnd.allows(drop.parent)) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.over(drop);
      }}
      onDrop={(e) => {
        if (!dnd.allows(drop.parent)) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.drop(drop);
      }}
      className={`relative transition-all ${dnd.active ? (tall ? "h-24" : "h-7") : "h-1.5"}`}
    >
      {dnd.active && (
        <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 transition-all ${on ? "h-[3px] rounded-full bg-[#de968f]" : "h-px border-t border-dashed border-[#d9cfca]"}`}>
          {on && (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#56423e] px-2.5 py-0.5 text-[10.5px] font-semibold text-white shadow">
              Drop here
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One section on the email: drawn by the sending renderer, with an edge on
 * hover, and when selected a toolbar that belongs to it - so moving a section
 * is done on the section, not from a panel somewhere else.
 */
function Section({
  block,
  path,
  brand,
  ctx,
  selected,
  editing,
  onSelect,
  onEditing,
  onCommit,
  dnd,
  act,
  isFirst,
  isLast,
}: {
  block: Block;
  path: Path;
  brand: Record<string, unknown>;
  ctx: Record<string, unknown>;
  selected: Path;
  editing: Path;
  onSelect: (p: Path) => void;
  onEditing: (p: Path) => void;
  onCommit: (path: Path, fields: Record<string, unknown>) => void;
  dnd: Dnd;
  act: Acts;
  isFirst: boolean;
  isLast: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isSel = selected === path;
  const typeable = EDITABLE.has(block.type);
  const m = resolveMargin(block) as { t: number; r: number; b: number; l: number };

  /* Re-drawn only when the block itself changes: typing is committed on blur,
     so the caret is never thrown back to the start mid-word. */
  const html = useMemo(() => {
    try {
      return (renderBlock(block, brand, ctx) as string) ?? "";
    } catch {
      return "";
    }
  }, [block, brand, ctx]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    onEditing("");
    if (block.type === "text") {
      const inner = (el.firstElementChild as HTMLElement | null)?.innerHTML ?? el.innerHTML;
      if (inner !== block.html) onCommit(path, { html: inner, text: el.innerText });
    } else {
      const text = el.innerText.replace(/\n{3,}/g, "\n\n").trim();
      if (text !== block.text) onCommit(path, { text });
    }
  };

  const toolbar = isSel && (
    <div
      onClick={(e) => e.stopPropagation()}
      /* Down the section's outside edge, in the card's margin, so it never
         sits on top of the words being judged. Inside a column it tucks in. */
      className={`absolute top-0 z-20 flex flex-col items-center gap-0.5 rounded-lg bg-[#1c1917] p-0.5 text-white shadow-lg ${isChild(path) ? "right-1" : "-right-[46px]"}`}
    >
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
        className="grid h-7 w-7 cursor-grab place-items-center rounded-md hover:bg-white/15 active:cursor-grabbing"
      >
        <UI.grip size={15} />
      </span>
      <ToolBtn title="Move up (⌥↑)" disabled={isFirst} onClick={() => act.up(path)}><UI.up size={15} /></ToolBtn>
      <ToolBtn title="Move down (⌥↓)" disabled={isLast} onClick={() => act.down(path)}><UI.down size={15} /></ToolBtn>
      <ToolBtn title="Duplicate" onClick={() => act.copy(path)}><UI.copy size={15} /></ToolBtn>
      <ToolBtn title="Delete" onClick={() => act.remove(path)}><UI.trash size={15} /></ToolBtn>
    </div>
  );

  const label = isSel && (
    <span className="absolute -top-[18px] left-2 z-20 flex items-center gap-1 rounded-md bg-[#de968f] px-2 py-1 text-[10.5px] font-semibold text-white shadow">
      <TypeIcon type={block.type} size={12} /> {LABEL[block.type] ?? block.type}
    </span>
  );

  const frame = `group/sec relative rounded-md transition-shadow ${
    isSel ? "shadow-[0_0_0_2px_#de968f]" : "hover:shadow-[0_0_0_1px_#e7c3bd]"
  }`;

  const select = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(path);
  };

  if (block.type === "columns") {
    const layout = layoutOf(block);
    const cells = cellsOf(block);
    return (
      <div onClick={select} className={frame} style={{ marginTop: m.t, marginBottom: m.b }}>
        {label}
        {toolbar}
        <div className="flex gap-3 p-1">
          {cells.map((cell, i) => (
            <div key={i} style={{ width: `${layout.w[i]}%` }} className="min-w-0 rounded-lg border border-dashed border-[#e7dfda] p-1.5">
              {cell.map((c, j) => (
                <Fragment key={c.id}>
                  <DropZone drop={{ parent: block.id, col: i, index: j }} dnd={dnd} />
                  <Section
                    block={c}
                    path={childPath(block.id, i, c.id)}
                    brand={brand}
                    ctx={ctx}
                    selected={selected}
                    editing={editing}
                    onSelect={onSelect}
                    onEditing={onEditing}
                    onCommit={onCommit}
                    dnd={dnd}
                    act={act}
                    isFirst={j === 0}
                    isLast={j === cell.length - 1}
                  />
                </Fragment>
              ))}
              <DropZone drop={{ parent: block.id, col: i, index: cell.length }} dnd={dnd} tall={!cell.length} />
              {!cell.length && !dnd.active && <p className="py-5 text-center text-[11px] text-[#b9b0aa]">Drag a block here</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div onClick={select} className={frame} style={{ marginTop: m.t, marginBottom: m.b }}>
      {label}
      {toolbar}
      {editing === path && block.type === "text" && <TextBar />}
      {editing === path && block.type !== "text" && <TokenBar />}
      <div
        ref={ref}
        contentEditable={typeable}
        suppressContentEditableWarning
        onFocus={() => {
          onSelect(path);
          onEditing(path);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.target as HTMLElement).blur();
          if (e.key === "Enter" && block.type !== "text" && block.type !== "quote") {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          }
        }}
        dangerouslySetInnerHTML={{ __html: html || (block.type === "image" ? EMPTY_IMAGE : block.type === "video" ? EMPTY_VIDEO : "") }}
        className={`${typeable ? "cursor-text outline-none" : "pointer-events-none"} min-h-[8px] px-1 py-0.5`}
      />
    </div>
  );
}

const EMPTY_IMAGE = `<div style="border:2px dashed #e4dfdb;border-radius:12px;padding:34px 12px;text-align:center;font:500 13px/1.4 Inter,Arial,sans-serif;color:#9a908a;background:#faf8f6">Picture<br><span style="font-size:11.5px">Upload one on the right</span></div>`;
const EMPTY_VIDEO = `<div style="border:2px dashed #e4dfdb;border-radius:12px;padding:34px 12px;text-align:center;font:500 13px/1.4 Inter,Arial,sans-serif;color:#9a908a;background:#faf8f6">Video<br><span style="font-size:11.5px">Paste its link on the right</span></div>`;

function ToolBtn({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

/* The formatting bar, while typing in a text section. Buttons keep the
   selection (mousedown is cancelled) and use the browser's own editing
   commands, so bold is <b> and a list is a real <ul> in the email. */
function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

function TextBar() {
  const b = (title: string, run: () => void, icon: React.ReactNode) => (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => { e.preventDefault(); run(); }} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/15">
      {icon}
    </button>
  );
  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute -top-[52px] left-2 z-30 flex items-center gap-0.5 rounded-lg bg-[#1c1917] p-0.5 text-white shadow-lg">
      {b("Bold", () => exec("bold"), <UI.bold size={15} />)}
      {b("Italic", () => exec("italic"), <UI.italic size={15} />)}
      {b("Underline", () => exec("underline"), <UI.underline size={15} />)}
      {b("Link", () => {
        const url = window.prompt("Link to (a web address, or mailto:)", "https://");
        if (url && url !== "https://") exec("createLink", url);
      }, <UI.link size={15} />)}
      <span className="mx-0.5 h-4 w-px bg-white/20" />
      {b("Bulleted list", () => exec("insertUnorderedList"), <UI.list size={15} />)}
      {b("Numbered list", () => exec("insertOrderedList"), <UI.numbered size={15} />)}
      {b("Clear formatting", () => exec("removeFormat"), <UI.clear size={15} />)}
      <span className="mx-0.5 h-4 w-px bg-white/20" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("insertText", "{{firstName}}"); }} className="flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium hover:bg-white/15">
        <UI.person size={13} /> First name
      </button>
    </div>
  );
}

function TokenBar() {
  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute -top-[52px] left-2 z-30 flex items-center rounded-lg bg-[#1c1917] p-0.5 text-white shadow-lg">
      <button type="button" onMouseDown={(e) => { e.preventDefault(); exec("insertText", "{{firstName}}"); }} className="flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium hover:bg-white/15">
        <UI.person size={13} /> Insert first name
      </button>
    </div>
  );
}

/** Every section in order, as a list you can drag to reorder. */
function Outline({ blocks, selected, onSelect, dnd, act }: { blocks: Block[]; selected: Path; onSelect: (p: Path) => void; dnd: Dnd; act: Acts }) {
  if (!blocks.length) return <p className="px-1 py-6 text-center text-[12px] text-[#9a908a]">No sections yet.</p>;
  return (
    <div>
      <p className="mb-2 px-1 text-[11px] leading-relaxed text-[#9a908a]">Drag to reorder. Click to select.</p>
      {blocks.map((b, i) => (
        <Fragment key={b.id}>
          <DropZone drop={{ parent: null, col: 0, index: i }} dnd={dnd} />
          <div
            draggable
            onDragStart={(e) => {
              dnd.begin({ kind: "move", type: b.type, path: b.id });
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", b.id);
            }}
            onDragEnd={() => dnd.end()}
            onClick={() => onSelect(b.id)}
            className={`group flex cursor-grab items-center gap-2 rounded-lg border px-2 py-2 active:cursor-grabbing ${idOf(selected) === b.id || selected.startsWith(`${b.id}/`) ? "border-[#de968f] bg-[#fdf6f4]" : "border-transparent hover:border-[#ebe6e2] hover:bg-[#faf8f6]"}`}
          >
            <span className="text-[#b9b0aa]"><UI.grip size={14} /></span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#f6f1ee] text-[#56423e]"><TypeIcon type={b.type} size={15} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold leading-tight">{LABEL[b.type] ?? b.type}</span>
              <span className="block truncate text-[11px] text-[#9a908a]">{summary(b)}</span>
            </span>
            <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" title="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); act.up(b.id); }} className="grid h-6 w-6 place-items-center rounded text-[#8a817c] hover:bg-[#efe9e5] disabled:opacity-30"><UI.up size={13} /></button>
              <button type="button" title="Move down" disabled={i === blocks.length - 1} onClick={(e) => { e.stopPropagation(); act.down(b.id); }} className="grid h-6 w-6 place-items-center rounded text-[#8a817c] hover:bg-[#efe9e5] disabled:opacity-30"><UI.down size={13} /></button>
            </span>
          </div>
        </Fragment>
      ))}
      <DropZone drop={{ parent: null, col: 0, index: blocks.length }} dnd={dnd} />
    </div>
  );
}

/** The whole email as it will arrive, on a computer or a phone. */
function PreviewModal({ html, subject, onClose }: { html: string; subject: string; onClose: () => void }) {
  const [w, setW] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className="fixed inset-0 z-[1010] flex flex-col bg-[#1c1917]/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto mt-4 flex w-full max-w-[760px] items-center gap-3 px-4" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{subject || "No subject"}</p>
        <div className="flex rounded-lg bg-white/10 p-0.5">
          {(["desktop", "mobile"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setW(d)} className={`rounded-md px-3 py-1 text-[12px] ${w === d ? "bg-white font-semibold text-[#1c1917]" : "text-white/80"}`}>
              {d === "desktop" ? "Computer" : "Phone"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white hover:bg-white/10">
          <UI.close size={17} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <iframe title="Preview" srcDoc={html} sandbox="allow-same-origin allow-popups" className="mx-auto block h-full min-h-[80vh] rounded-xl bg-white shadow-2xl" style={{ width: w === "mobile" ? 390 : 720, maxWidth: "100%" }} />
      </div>
    </div>
  );
}
