"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [selected, setSelected] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

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
  const patch = (id: string, field: string, value: unknown) =>
    change(blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  const move = (id: string, by: number) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const addBlock = (type: string) => {
    const b = fresh(type);
    const at = blocks.findIndex((x) => x.id === selected);
    const next = [...blocks];
    next.splice(at < 0 ? blocks.length : at + 1, 0, b);
    change(next);
    setSelected(b.id);
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

  const sel = blocks.find((b) => b.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-3 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
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

        <div className="flex min-h-0 flex-1">
          {/* ── the rail: what can't be typed ── */}
          <aside className="w-[232px] shrink-0 overflow-y-auto border-r border-line/70 p-3.5">
            <p className="mb-2 text-[10.5px] uppercase tracking-wide text-muted">Drop in</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PALETTE.map((p) => (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => addBlock(p.type)}
                  className="rounded-lg border border-line/70 px-2 py-2 text-[11.5px] hover:border-ink/30"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-line/60 pt-4">
              {sel ? (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10.5px] uppercase tracking-wide text-muted">{sel.type}</p>
                    <div className="ml-auto flex gap-1">
                      <Mini onClick={() => move(sel.id, -1)} label="Move up">↑</Mini>
                      <Mini onClick={() => move(sel.id, 1)} label="Move down">↓</Mini>
                      <Mini
                        onClick={() => {
                          change(blocks.filter((b) => b.id !== sel.id));
                          setSelected("");
                        }}
                        label="Delete"
                      >
                        ×
                      </Mini>
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
          <div className="min-w-0 flex-1 overflow-y-auto bg-page p-6">
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
                {blocks.map((b) => (
                  <Canvas
                    key={b.id}
                    block={b}
                    brand={brand}
                    ctx={ctx}
                    selected={b.id === selected}
                    onSelect={() => setSelected(b.id)}
                    onText={(text) => patch(b.id, "text", text)}
                  />
                ))}
                {!blocks.length && (
                  <p className="py-10 text-center text-[12px] text-muted">
                    Nothing here yet — drop a block in from the left.
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
 * One block, drawn by the real renderer.
 *
 * The words are edited in place with contenteditable, and committed on BLUR
 * rather than on every keystroke — React re-rendering the block's HTML under
 * a live caret sends it back to the start of the line, which makes typing
 * impossible.
 */
function Canvas({
  block,
  brand,
  ctx,
  selected,
  onSelect,
  onText,
}: {
  block: Block;
  brand: Record<string, unknown>;
  ctx: Record<string, unknown>;
  selected: boolean;
  onSelect: () => void;
  onText: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const editable = TYPEABLE.has(block.type);

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

  return (
    <div
      onClick={onSelect}
      style={{ marginTop: m.t, marginBottom: m.b, marginLeft: m.l, marginRight: m.r }}
      className={`relative rounded-lg transition-colors ${
        selected ? "outline outline-2 outline-offset-2 outline-accent-dark/60" : "hover:bg-accent-soft/20"
      }`}
    >
      <div
        ref={ref}
        // Typing goes straight onto the email. The renderer's own inline
        // styles come with it, so what's under the caret is what sends.
        contentEditable={editable}
        suppressContentEditableWarning
        onBlur={() => {
          if (!editable) return;
          const text = ref.current?.innerText ?? "";
          if (text !== block.text) onText(text.replace(/\n{3,}/g, "\n\n").trimEnd());
        }}
        dangerouslySetInnerHTML={{ __html: html }}
        className={editable ? "outline-none" : "pointer-events-none"}
      />
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
            The columns render, but dropping content INTO them is not built
            yet. Use one layout block per row and put the pictures in from the
            code side for now.
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
