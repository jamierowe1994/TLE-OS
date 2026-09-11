"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { usePref } from "@/lib/prefs-store";

/**
 * Quick links: the agent's own shortcuts, on the home screen's Customise row.
 *
 * James, 11 Sep 2026: "I love the idea of being able to add custom buttons to
 * their homepage based on what they quickly want to use." So, in customise
 * mode, a small circle appears beside Done. Press it and you get the list of
 * things an agent reaches for ten times a day - add a lead, add a tenant, add
 * a landlord, book a viewing - and each one you tick becomes a pill on the
 * row, to the right of Customise, there every time you land on the dashboard.
 *
 * They are LINKS, nothing cleverer: each one lands on the screen that does the
 * job, with the panel already open where the screen supports it. The list
 * lives here so adding one is a line, not a feature.
 *
 * Which ones an agent chose is kept with the rest of their settings (usePref),
 * so it follows them between browsers once they are signed in, and stays put
 * in this browser until then - the same rule the tiles follow.
 */
export type QuickLink = {
  id: string;
  label: string;
  href: string;
  icon: string;
  /** One line under the label in the picker: where it lands, in plain words. */
  hint: string;
};

export const QUICK_LINKS: QuickLink[] = [
  { id: "new-lead", label: "Add a lead", href: "/leads?new=1", icon: "target", hint: "Opens the new lead panel" },
  { id: "new-tenant", label: "Add a tenant", href: "/leads?new=1&side=tenant", icon: "user", hint: "New lead panel, set to tenant" },
  { id: "new-landlord", label: "Add a landlord", href: "/leads?new=1&side=landlord", icon: "home", hint: "New lead panel, set to landlord" },
  { id: "book-viewing", label: "Book a viewing", href: "/listings", icon: "calendar", hint: "Pick the home, then Book viewing" },
  { id: "diary", label: "Today's diary", href: "/viewings", icon: "clock", hint: "Your viewings and appraisals" },
  { id: "appraisal", label: "Market appraisals", href: "/market-appraisals", icon: "trend-up", hint: "The appraisal pipeline" },
  { id: "repair", label: "Log a repair", href: "/maintenance", icon: "setting", hint: "Jobs, contractors and invoices" },
  { id: "compliance", label: "Check compliance", href: "/compliance", icon: "shield", hint: "What is due and what has lapsed" },
  { id: "emails", label: "Emails", href: "/emails", icon: "mail", hint: "The shared inbox" },
];

const STORE = "tle-dash-quick-v1";

export default function QuickLinks({ customising }: { customising: boolean }) {
  const [chosen, setChosen, ready] = usePref<string[] | null>(STORE, null);
  const ids = chosen ?? [];
  const links = ids.map((id) => QUICK_LINKS.find((q) => q.id === id)).filter((q): q is QuickLink => Boolean(q));

  const [open, setOpen] = useState(false);
  const circleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; maxH: number } | null>(null);

  /* The picker closes with customise mode: Done should leave nothing hanging. */
  useEffect(() => {
    if (!customising) setOpen(false);
  }, [customising]);

  /* Placed under the circle, on screen even at the right-hand edge of a phone. */
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = circleRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 272;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      /* Never off the bottom of a phone: it scrolls inside itself instead. */
      setAt({ top: r.bottom + 8, left, maxH: Math.max(160, window.innerHeight - r.bottom - 20) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  /* Outside tap or Escape closes it; a tap inside is a choice, not a close. */
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || circleRef.current?.contains(t)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  /* Written through a ref so two quick taps both land: the pref setter
     takes a value, not an updater, and the second tap of a fast pair would
     otherwise be computed from the list before the first. */
  const idsRef = useRef(ids);
  idsRef.current = ids;
  function commit(next: string[]) {
    idsRef.current = next;
    setChosen(next);
  }
  function toggle(id: string) {
    const cur = idsRef.current;
    commit(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }
  function remove(id: string) {
    commit(idsRef.current.filter((x) => x !== id));
  }

  if (!ready) return null;

  const pill = "flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-colors";

  return (
    <>
      {customising && (
        <button
          ref={circleRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Add a quick link"
          aria-expanded={open}
          title="Add a quick link"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed bg-page text-[16px] leading-none transition-colors ${
            open ? "border-ink text-ink" : "border-ink/40 text-muted hover:border-ink hover:text-ink"
          }`}
        >
          <span aria-hidden className={`block transition-transform ${open ? "rotate-45" : ""}`}>+</span>
        </button>
      )}

      {customising && links.length === 0 && (
        <span className="text-[11.5px] text-muted">Add quick links</span>
      )}

      {links.map((q, i) =>
        customising ? (
          <button
            key={q.id}
            type="button"
            onClick={() => remove(q.id)}
            title={`Remove ${q.label}`}
            className={`${pill} wiggle relative border-dashed border-ink/40 bg-page pr-8 text-ink`}
            style={{ animationDelay: `${(i % 5) * 0.11}s` }}
          >
            <DoodleIcon name={q.icon} size={13} />
            {q.label}
            {/* The ✕ badge, same idea as the tiles' - small, because the pill is. */}
            <span
              aria-hidden
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-[9px] text-muted"
            >
              ✕
            </span>
          </button>
        ) : (
          <Link
            key={q.id}
            href={q.href}
            className={`${pill} border-line/80 bg-page text-muted hover:border-ink hover:text-ink`}
          >
            <DoodleIcon name={q.icon} size={13} />
            {q.label}
          </Link>
        )
      )}

      {open && at && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Quick links"
            className="fixed z-[160] w-[272px] overflow-y-auto rounded-2xl border border-line bg-card p-2 shadow-lg"
            style={{ top: at.top, left: at.left, maxHeight: at.maxH }}
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Quick links
            </p>
            <ul className="flex flex-col">
              {QUICK_LINKS.map((q) => {
                const on = ids.includes(q.id);
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => toggle(q.id)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-page ${on ? "text-ink" : "text-muted"}`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink bg-ink text-page" : "border-line text-muted"}`}>
                        <DoodleIcon name={q.icon} size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold leading-tight">{q.label}</span>
                        <span className="block truncate text-[10.5px] leading-snug text-muted">{q.hint}</span>
                      </span>
                      <span aria-hidden className={`text-[11px] ${on ? "text-ink" : "text-transparent"}`}>✓</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
