"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small parts for the new look's Leads board and lead record (lib/new-look
 * "leads" and "lead"). Styled from app/new-look/leads.css; only ever drawn
 * inside a [data-look="new"] wrapper.
 */

type IcoName =
  | "chevron" | "chat" | "user" | "folder" | "clock" | "copy" | "home" | "wand" | "tag" | "link"
  | "note" | "settings" | "x" | "phone" | "mail" | "calendar" | "check" | "upload" | "arrow" | "plus" | "doc" | "target";

/** Line icons the shared set (components/new-look/Parts Ico) does not carry. */
export function LIco({ name, size = 16 }: { name: IcoName; size?: number }) {
  const p: Record<IcoName, React.ReactNode> = {
    chevron: <path d="M9 6l6 6-6 6" />,
    chat: <path d="M5 18.5V6.5A2 2 0 0 1 7 4.5h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9.5z" />,
    user: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    copy: (
      <>
        <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
        <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
      </>
    ),
    home: <path d="M4 11l8-6.5 8 6.5M6.5 9.5V19.5h11V9.5M10 19.5v-5h4v5" />,
    wand: <path d="M5 19L15 9M14 5.5v-2M18.5 10h2M17 6.5l1.5-1.5M12 3.5l.01.01M20.5 13.5l.01.01M15 9l1.5 1.5" />,
    tag: (
      <>
        <path d="M4 12.5V5.5a1.5 1.5 0 0 1 1.5-1.5h7l7.5 7.5-8.5 8.5z" />
        <circle cx="8.5" cy="8.5" r="1.3" />
      </>
    ),
    link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    note: <path d="M6 4.5h9l3.5 3.5v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1zM8.5 11h7M8.5 14.5h7M8.5 18h4" />,
    settings: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
    mail: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M4 7l8 6 8-6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    upload: <path d="M12 16V4M7 9l5-5 5 5M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    doc: <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM14 3.5V8h4" />,
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.8" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}

/** Two letters for the circle beside a name. */
export function initialsOf(name: string): string {
  const parts = (name || "").split(/[^A-Za-z]+/).filter(Boolean);
  return (parts.length ? parts.map((w) => w[0]).join("").slice(0, 2) : "?").toUpperCase();
}

/** A name with its circle of initials and one line under it, as the design draws people. */
export function Person({ name, sub }: { name: string; sub?: React.ReactNode }) {
  return (
    <span className="nl-leads-person">
      <span className="nl-leads-avatar" aria-hidden>
        {initialsOf(name)}
      </span>
      <span className="min-w-0">
        <span className="nl-strong block truncate">{name || "No name given"}</span>
        {sub && <span className="nl-meta block truncate">{sub}</span>}
      </span>
    </span>
  );
}

/**
 * Agent-facing screens never say REX (lib/agent-screens rule). Sentences the
 * shared handlers hand back still do, so the new look says "the backup store"
 * instead - the same words the Not backed up yet strip uses.
 */
export function sayNoRex(text: string): string {
  return text
    .replace(/\bin REX\b/g, "in the backup store")
    .replace(/\bto REX\b/g, "to the backup store")
    .replace(/\bfrom REX\b/g, "from the backup store")
    .replace(/\bREX\b/g, "the backup store");
}

/** Tags as a filter: tick as many as you like, the list narrows to leads carrying all of them. */
export function TagsMenu({ tags, value, onChange }: { tags: [string, number][]; value: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const needle = q.trim().toLowerCase();
  const shown = tags.filter(([t]) => !needle || t.toLowerCase().includes(needle));
  return (
    <div ref={wrap} className="nl-menu-wrap">
      <button type="button" className={`nl-leads-pick${value.length ? " is-set" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <LIco name="tag" size={14} />
        {value.length ? `Tags · ${value.length}` : "Any tag"}
      </button>
      {open && (
        <div className="nl-leads-custom" role="menu">
          <div className="nl-leads-custom-head">
            <b>Tags</b>
            <span className="nl-meta">Leads carrying every tag you tick.</span>
          </div>
          {tags.length > 8 && (
            <label className="nl-fsearch mb-2 w-full">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag" aria-label="Find a tag" />
            </label>
          )}
          <div className="max-h-[300px] overflow-y-auto">
            {shown.map(([t, n]) => {
              const on = value.includes(t);
              return (
                <button key={t} type="button" role="menuitemcheckbox" aria-checked={on} className={`nl-leads-custom-row${on ? " is-on" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}>
                  <span className={`nl-leads-check${on ? " is-on" : ""}`}>{on && <LIco name="check" size={11} />}</span>
                  <span className="min-w-0 flex-1 truncate">{t}</span>
                  <span className="nl-count">{n.toLocaleString("en-GB")}</span>
                </button>
              );
            })}
            {!shown.length && <p className="nl-meta px-1.5 py-2">No tags match.</p>}
          </div>
          <div className="nl-leads-custom-foot">
            {value.length > 0 && (
              <button type="button" className="nl-link" onClick={() => onChange([])}>
                Clear
              </button>
            )}
            <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
