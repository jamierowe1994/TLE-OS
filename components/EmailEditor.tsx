"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CampaignStep } from "@/lib/campaigns";
import { blocksFor, renderStep, type StepCopy } from "@/lib/campaign-mail";

/**
 * Writing the words for one campaign step.
 *
 * TMKE's editor is 1,700 lines and does a great deal — per-device overrides,
 * saved snippets, undo stacks, product grids, uploads. Almost none of that
 * belongs here: these are four-paragraph follow-up letters to landlords, and
 * the failure mode of a big editor is a marketing person building something
 * elaborate that renders badly in Outlook. So this is the small subset that a
 * letter needs, on top of the SAME renderer, which is where TMKE's real work
 * actually lives.
 *
 * The preview is the rendered email, updating as you type, because the whole
 * point of the ported renderer is that nobody has to imagine what it looks
 * like.
 */

type Block = Record<string, unknown> & { type: string; id: string };

const PALETTE: { type: string; label: string; hint: string }[] = [
  { type: "heading", label: "Heading", hint: "A title" },
  { type: "text", label: "Text", hint: "A paragraph" },
  { type: "button", label: "Button", hint: "One thing to click" },
  { type: "image", label: "Image", hint: "A picture" },
  { type: "divider", label: "Divider", hint: "A line" },
  { type: "spacer", label: "Space", hint: "A gap" },
];

/** The fields the letter-writer can actually reach on each block. */
const MERGE = [
  { token: "{{firstName}}", label: "First name" },
  { token: "{{address}}", label: "Their property" },
  { token: "{{senderName}}", label: "Us" },
];

let seq = 0;
const nid = () => `eb_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function fresh(type: string): Block {
  switch (type) {
    case "heading":
      return { type, id: nid(), text: "A short, plain headline", align: "left", color: "" };
    case "text":
      return { type, id: nid(), text: "Hi {{firstName}},", bg: "" };
    case "button":
      return { type, id: nid(), text: "Book a call", url: "https://thelettingexperts.co.uk", align: "left", color: "" };
    case "image":
      return { type, id: nid(), url: "", alt: "", linkUrl: "", align: "center" };
    case "divider":
      return { type, id: nid(), color: "#E2E8F0" };
    default:
      return { type: "spacer", id: nid(), height: 24 };
  }
}

export default function EmailEditor({
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
  const [blocks, setBlocks] = useState<Block[]>(
    () => (initial?.blocks?.length ? (initial.blocks as Block[]) : (blocksFor(step) as Block[]))
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  /* Where a merge field would land. Tracked rather than guessed: dropping
     {{firstName}} at the end of a paragraph is almost never where it's wanted. */
  const focused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const touch = (next: Block[]) => {
    setBlocks(next);
    setDirty(true);
    setNote("");
  };
  const patch = (id: string, field: string, value: unknown) =>
    touch(blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    touch(next);
  };

  const insertMerge = (token: string) => {
    const el = focused.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    // React owns the value, so set it through the change handler the field
    // already has rather than poking the DOM and watching it snap back.
    const setter = el.dataset.blockId
      ? (v: string) => patch(el.dataset.blockId!, el.dataset.field!, v)
      : (v: string) => {
          setSubject(v);
          setDirty(true);
          setNote("");
        };
    setter(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  /* The preview: the real thing, rendered by the module that sends it. */
  const html = useMemo(() => {
    const m = renderStep(step, { name: "Susan Barnes", address: "3 Buttermere Close" }, { subject, blocks });
    return m?.html ?? "";
  }, [step, subject, blocks]);

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
      } else {
        setNote(j.error ?? j.reason ?? "It didn't save.");
      }
    } catch {
      setNote("It didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    setSaving(true);
    try {
      const res = await fetch(`/api/email-templates?campaign=${encodeURIComponent(campaignId)}&step=${stepIndex}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (j.saved) {
        setBlocks(blocksFor(step) as Block[]);
        setSubject(step.subject);
        setDirty(false);
        setNote("Back to what the campaign says in code.");
        onSaved(null);
      } else {
        setNote(j.error ?? j.reason ?? "It didn't revert.");
      }
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

  const field =
    "w-full rounded-lg border border-line/70 bg-page px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink/40";

  return (
    <div className="fade-up rounded-2xl border border-line/80 bg-panel p-5">
      {/* ── top ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line/60 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px]">
            Day {step.day} · {step.subject}
          </h2>
          <p className="text-[11px] text-muted">
            {/* The note wins: a save that fails leaves this dirty, and the old
                order hid the reason behind the word "Unsaved". */}
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
            className="rounded-lg bg-ink px-3 py-1.5 text-[11.5px] text-page disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* ── the words ── */}
        <div className="min-w-0">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Subject</label>
          <input
            className={field}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
              setNote("");
            }}
            onFocus={(e) => (focused.current = e.currentTarget)}
          />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-muted">Drop in:</span>
            {MERGE.map((m) => (
              <button
                key={m.token}
                type="button"
                onMouseDown={(e) => e.preventDefault()} /* keep the caret where it is */
                onClick={() => insertMerge(m.token)}
                className="rounded-md border border-line/70 px-1.5 py-0.5 text-[10.5px] text-muted hover:border-ink/30 hover:text-ink"
              >
                {m.label}
              </button>
            ))}
          </div>

          <ul className="mt-4 space-y-2">
            {blocks.map((b, i) => (
              <li key={b.id} className="rounded-xl border border-line/70 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[10.5px] uppercase tracking-wide text-muted">{b.type}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      ↑
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>
                      ↓
                    </IconBtn>
                    <IconBtn
                      label="Delete"
                      onClick={() => touch(blocks.filter((x) => x.id !== b.id))}
                    >
                      ×
                    </IconBtn>
                  </div>
                </div>
                <BlockFields block={b} patch={patch} focused={focused} field={field} />
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                title={p.hint}
                onClick={() => touch([...blocks, fresh(p.type)])}
                className="rounded-lg border border-line/70 px-2.5 py-1.5 text-[11.5px] hover:border-ink/30"
              >
                + {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
            The footer and its unsubscribe link are added on the way out — they can&apos;t be
            forgotten and don&apos;t need writing.
          </p>
        </div>

        {/* ── the email ── */}
        <div className="min-w-0">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">As it arrives</p>
          <iframe
            title="Live preview"
            srcDoc={html}
            className="h-[560px] w-full rounded-xl border border-line/60 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-6 w-6 rounded-md border border-line/70 text-[12px] leading-none hover:border-ink/30 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** The handful of fields each block type actually needs. */
function BlockFields({
  block,
  patch,
  focused,
  field,
}: {
  block: Block;
  patch: (id: string, field: string, value: unknown) => void;
  focused: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  field: string;
}) {
  const track = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    (focused.current = e.currentTarget);
  const str = (k: string) => (typeof block[k] === "string" ? (block[k] as string) : "");

  const align = (
    <label className="block">
      <span className="mb-1 block text-[10.5px] text-muted">Align</span>
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
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <input
            className={field}
            data-block-id={block.id}
            data-field="text"
            value={str("text")}
            onFocus={track}
            onChange={(e) => patch(block.id, "text", e.target.value)}
          />
          {align}
        </div>
      );
    case "text":
      return (
        <textarea
          rows={Math.min(8, Math.max(2, str("text").split("\n").length + 1))}
          className={`${field} resize-y leading-relaxed`}
          data-block-id={block.id}
          data-field="text"
          value={str("text")}
          onFocus={track}
          onChange={(e) => patch(block.id, "text", e.target.value)}
        />
      );
    case "button":
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
          <input
            className={field}
            placeholder="Button text"
            data-block-id={block.id}
            data-field="text"
            value={str("text")}
            onFocus={track}
            onChange={(e) => patch(block.id, "text", e.target.value)}
          />
          <input
            className={field}
            placeholder="https://…"
            data-block-id={block.id}
            data-field="url"
            value={str("url")}
            onFocus={track}
            onChange={(e) => patch(block.id, "url", e.target.value)}
          />
          {align}
        </div>
      );
    case "image":
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
          <input
            className={field}
            placeholder="Image URL"
            value={str("url")}
            onFocus={track}
            onChange={(e) => patch(block.id, "url", e.target.value)}
          />
          <input
            className={field}
            placeholder="Alt text — what it shows"
            value={str("alt")}
            onFocus={track}
            onChange={(e) => patch(block.id, "alt", e.target.value)}
          />
          {align}
        </div>
      );
    case "spacer":
      return (
        <label className="block max-w-[160px]">
          <span className="mb-1 block text-[10.5px] text-muted">Height (px)</span>
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
      return <p className="text-[11px] text-muted">Nothing to set — it just draws a line.</p>;
  }
}
