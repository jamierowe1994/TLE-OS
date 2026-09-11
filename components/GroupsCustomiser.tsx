"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DEFAULT_GROUPS, GROUPS, type GroupId, type GroupsConfig } from "@/components/LeadGroups";

/**
 * Customise, for the boxes.
 *
 * The list has had one for its columns since August; the boxes had none.
 * James, 11 Sep 2026: "they should be able to customise their view, and
 * that should always stay on. Once I've set it up, it will then stay." So:
 * which boxes show, in which order (arrows, not a drag - three rows do not
 * need a drag), and how many rows each opens with. The page saves it to the
 * person, so it is there on the next machine too.
 */
export default function GroupsCustomiser({ value, onChange }: { value: GroupsConfig; onChange: (next: GroupsConfig) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const order: GroupId[] = [...value.show, ...GROUPS.map((g) => g.id).filter((id) => !value.show.includes(id))];
  const toggle = (id: GroupId) =>
    onChange({ ...value, show: value.show.includes(id) ? value.show.filter((x) => x !== id) : order.filter((x) => x === id || value.show.includes(x)) });
  const move = (id: GroupId, dir: -1 | 1) => {
    const i = value.show.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.show.length) return;
    const next = [...value.show];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...value, show: next });
  };
  const changed = JSON.stringify(value) !== JSON.stringify(DEFAULT_GROUPS);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[12.5px] transition-colors ${
          open ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-transparent bg-accent-soft font-medium text-accent-dark hover:bg-accent-soft/70"
        }`}
        title="Choose which boxes show, their order, and how many rows each opens with"
      >
        <DoodleIcon name="setting" size={14} className="shrink-0" />
        Customise
        {changed && <span aria-hidden className="size-1.5 rounded-full bg-accent-dark" />}
      </button>

      {open && (
        <div className="fade-up absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line/60 bg-white p-4 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.25)]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Your boxes</p>
            {changed && (
              <button type="button" onClick={() => onChange(DEFAULT_GROUPS)} className="text-[10.5px] font-semibold text-muted transition-colors hover:text-ink">
                Reset
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-muted">Tick what shows, move it up or down. It stays as you set it, on every machine.</p>
          <ul className="mt-3 space-y-0.5">
            {order.map((id) => {
              const g = GROUPS.find((x) => x.id === id)!;
              const on = value.show.includes(id);
              const i = value.show.indexOf(id);
              return (
                <li key={id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <button type="button" onClick={() => toggle(id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border-[1.5px] text-[9px] ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line"}`}>
                      {on && "✓"}
                    </span>
                    <span className={`truncate text-[12px] ${on ? "" : "text-muted"}`}>{g.title}</span>
                  </button>
                  {on && (
                    <span className="flex shrink-0 gap-0.5">
                      <button type="button" disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${g.title} up`} className="size-6 rounded-full text-[11px] text-muted hover:bg-accent-soft/60 hover:text-ink disabled:opacity-30">↑</button>
                      <button type="button" disabled={i === value.show.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${g.title} down`} className="size-6 rounded-full text-[11px] text-muted hover:bg-accent-soft/60 hover:text-ink disabled:opacity-30">↓</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted">Rows per box</p>
          <div className="mt-1.5 flex gap-1.5">
            {[3, 6, 10, 20].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...value, preview: n })}
                className={`figures flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] transition-colors ${
                  value.preview === n ? "border-transparent bg-accent-dark font-semibold text-white" : "border-line/60 text-muted hover:border-ink/40 hover:text-ink"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
