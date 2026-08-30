"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The record-row version of the address lookup.
 *
 * Same engine as the New Lead panel's field — /api/address, key server-side —
 * but shaped like an InlineField so it lives inside a 42px contact row: click
 * the value, type, pick from the dropdown, and the chosen address commits
 * with its geotag resolved. The row never changes height; the suggestions
 * hang below it in their own layer.
 */

type Suggestion = { id: string; label: string };

export default function InlineAddress({
  value,
  onChange,
  onResolved,
  placeholder = "—",
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  onResolved?: (r: { address: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [options, setOptions] = useState<Suggestion[]>([]);
  /* Shown floating, never in flow — this lives in a 42px row that must not
     change height. Silent failure is still worse than a cramped explanation. */
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * WHERE TO DRAW THE DROPDOWN, IN VIEWPORT COORDINATES.
   *
   * It used to be `absolute top-full` inside the field. That is correct
   * everywhere except the one place this component is actually used: DetailRow
   * wraps it in `overflow-hidden` — deliberately, to stop a long address
   * running under the property column beside it — and an absolutely positioned
   * child drawn BELOW a 42px row is entirely outside that box, so it was
   * clipped out of existence.
   *
   * Nothing appeared: not the suggestions, not the error message, which is why
   * a broken lookup and a working one looked identical. James spotted it by
   * noticing New Lead works, and New Lead's field has no clipping ancestor.
   *
   * So it is portalled to the body and positioned from the input's own rect.
   * That is immune to this ancestor and to any future one, which matters more
   * than it sounds: the next person to add `overflow-hidden` for a layout
   * reason would otherwise break this again and never know.
   */
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  /* Measured while open, and re-measured on scroll and resize — a panel fixed
     to the viewport must follow the field it belongs to, or it detaches and
     floats over the page as the drawer scrolls underneath it. */
  useEffect(() => {
    if (!editing) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 320) });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [editing, options.length, problem]);

  // Debounced lookup while typing — same 320ms as the big field, because a
  // lookup per keystroke is a lookup you pay for per keystroke.
  useEffect(() => {
    if (!editing || draft.trim().length < 3 || draft === value) {
      setOptions([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/address?q=${encodeURIComponent(draft)}`, { cache: "no-store" });
        const j = await r.json();
        const got = j.suggestions ?? [];
        setOptions(got);
        /* THE THIRD STATE, WHICH USED TO RENDER AS NOTHING AT ALL.
        
           There are three outcomes and the field only ever spoke about two:
           suggestions (dropdown), a failed lookup (red note), and a lookup
           that worked and matched nothing — which showed neither, so a
           correctly-functioning empty result was indistinguishable from a
           field that had not fired.
        
           James, 30 Aug, editing a real address and seeing no dropdown: from
           the outside there was no way to tell whether the lookup was broken,
           idle, or simply had no answer. Now it says which. */
        setProblem(
          j.problem?.says ??
            (got.length === 0
              ? "No match for that yet. Keep typing, or leave it as you have written it."
              : null)
        );
      } catch {
        setOptions([]);
        setProblem("Address lookup didn't answer. If you've been idle a while, sign in again.");
      }
    }, 320);
    return () => window.clearTimeout(id);
  }, [draft, editing, value]);

  async function choose(opt: Suggestion) {
    setOptions([]);
    setEditing(false);
    onChange(opt.label);
    try {
      const r = await fetch(`/api/address?resolve=${encodeURIComponent(opt.id)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.address) {
        onChange(j.address);
        onResolved?.({ address: j.address, lat: j.lat ?? null, lng: j.lng ?? null });
      }
    } catch {
      /* the label they picked already committed — good enough */
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        /* The full address on hover. `truncate` only bites once the element is
           actually bounded — as an inline-block sized to its content it grew
           past the column and ran under the property list beside it, taking the
           copy button with it. max-w-full is what bounds it. */
        title={value ? `${value}\n\nClick to edit` : "Click to edit"}
        className={`-mx-1 inline-block max-w-full truncate align-bottom rounded px-1 text-left transition-colors hover:bg-accent-soft/40 ${className}`}
      >
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          // Give a mousedown on an option time to win before the blur commits
          // the raw text — otherwise picking a suggestion is a race you lose.
          window.setTimeout(() => {
            setOptions([]);
            setEditing(false);
            onChange(draft.trim());
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            setOptions([]);
            setEditing(false);
          }
        }}
        className={`-mx-1 w-full border-b-[1.5px] border-accent-dark bg-transparent px-1 outline-none ${className}`}
      />
      {/* PORTALLED, so no ancestor's overflow can hide it. z-[200] clears the
          lead drawer, which is z-[150]. */}
      {rect &&
        typeof document !== "undefined" &&
        problem &&
        options.length === 0 &&
        createPortal(
          <p
            style={{ left: rect.left, top: rect.top, width: rect.width }}
            className="fade-up fixed z-[200] rounded-lg border border-line/80 bg-card px-2.5 py-1.5 text-[10.5px] leading-relaxed text-accent-dark shadow-[0_12px_32px_-12px_rgba(16,16,20,0.3)]"
          >
            {problem} What you type still saves.
          </p>,
          document.body
        )}
      {rect &&
        typeof document !== "undefined" &&
        options.length > 0 &&
        createPortal(
          <ul
            style={{ left: rect.left, top: rect.top, width: rect.width }}
            className="fade-up fixed z-[200] max-h-52 overflow-y-auto rounded-xl border border-line/80 bg-card py-1 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.3)]"
          >
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  // mousedown, not click: it fires before the input's blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void choose(o);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-page"
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
