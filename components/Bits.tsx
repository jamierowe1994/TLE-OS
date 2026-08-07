"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/* -------------------------------------------------------------------------
   Small shared controls. Kept together because they're the vocabulary the
   record pages are built from, not one-offs.
------------------------------------------------------------------------- */

/**
 * A button that answers back: it sinks under the finger and rocks slightly on
 * release. The class is removed on animation end so a second press replays it.
 */
export function PressButton({
  children,
  onClick,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        setPressed(true);
        onClick?.();
      }}
      onAnimationEnd={() => setPressed(false)}
      className={`press-wobble ${pressed ? "is-pressed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** Copy to clipboard, with the tick standing in for a whole sentence. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked — the value is on screen to select by hand */
        }
      }}
      className="shrink-0 rounded-md p-1 text-muted opacity-0 transition-all hover:text-ink group-hover/row:opacity-100"
    >
      {done ? (
        <span className="text-[11px] font-semibold text-accent-dark">Copied</span>
      ) : (
        <DoodleIcon name="doc" size={13} />
      )}
    </button>
  );
}

/**
 * A field you change by clicking it.
 *
 * No per-field Save button and no edit mode for the whole record: click the
 * value, it becomes an input with a rule under it, and it commits on blur or
 * Enter. Escape abandons. Editing one number shouldn't be a form submission.
 */
export function InlineField({
  value,
  onChange,
  placeholder = "—",
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit"
        className={`-mx-1 rounded px-1 text-left transition-colors hover:bg-accent-soft/40 ${className}`}
      >
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onChange(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      // The rule under it is the whole affordance — no box, no button.
      className={`-mx-1 w-full border-b-[1.5px] border-accent-dark bg-transparent px-1 outline-none ${className}`}
    />
  );
}

/** A row of the record: label, value, and a copy button on hover. */
export function DetailRow({
  icon,
  label,
  value,
  onChange,
  copyable,
}: {
  icon: string;
  label: string;
  value: string;
  onChange?: (next: string) => void;
  copyable?: boolean;
}) {
  return (
    <div className="group/row flex items-center gap-3 py-1.5">
      <DoodleIcon name={icon} size={15} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 text-[13.5px]">
        {onChange ? (
          <InlineField value={value} onChange={onChange} className="text-[13.5px]" />
        ) : (
          value
        )}
      </span>
      {copyable && value && <CopyButton value={value} label={label} />}
    </div>
  );
}

/**
 * A marker stroke under a heading.
 *
 * Hand-drawn here rather than taken from the licensed set: all 150 scribbles
 * are marks, arrows, sparkles and numbers — there is no underline among them.
 * Stretches to whatever it sits under; preserveAspectRatio="none" only
 * lengthens it, so the stroke keeps its weight at any width.
 */
export function Underline({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 10"
      preserveAspectRatio="none"
      aria-hidden
      className={`block h-[7px] w-full text-accent-dark ${className}`}
    >
      <path
        d="M1.5,6.4 C24,3.2 62,1.9 118.5,3.4 C62,6.6 25,7.9 1.5,6.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A section heading with the stroke under it. */
export function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="hand text-[15px] leading-tight">{children}</h4>
      <span className="mt-1 block max-w-[130px]">
        <Underline />
      </span>
    </div>
  );
}

/** The big tick after something lands. */
export function DoneTick({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 52 52" style={{ width: size, height: size }} aria-hidden>
      <circle
        className="ring-pop"
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="var(--accent-dark)"
        strokeWidth="2"
        style={{ transformOrigin: "center" }}
      />
      <path
        className="tick-draw"
        d="M15 27 l8 8 l15 -16"
        fill="none"
        stroke="var(--accent-dark)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
