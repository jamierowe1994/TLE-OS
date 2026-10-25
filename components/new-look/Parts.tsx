"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { holdPlace } from "./hold-place";

/**
 * The new look's shared parts (lib/new-look), styled from app/new-look.css.
 * Only screens switched to the new look use them, inside a [data-look="new"]
 * wrapper - drawn anywhere else they would pick up the old colours.
 */

/** The page header: type only, no illustration and no rule. */
export function Mast({ eyebrow, title, blurb, actions }: { eyebrow?: React.ReactNode; title: React.ReactNode; blurb?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="nl-mast">
      {eyebrow && <div className="nl-eyebrow mb-2">{eyebrow}</div>}
      <h1 className="nl-title">{title}</h1>
      {blurb && <p className="nl-blurb">{blurb}</p>}
      {actions && <div className="nl-actions">{actions}</div>}
    </header>
  );
}

export type Tone = "good" | "accent" | "info" | "warning" | "neutral";

/** Status as a word with a dot, not a filled pill. */
export function Badge({ tone = "neutral", plain = false, bare = false, children, title }: { tone?: Tone; plain?: boolean; bare?: boolean; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`nl-badge nl-badge--${tone}${plain ? " nl-badge--plain" : ""}${bare ? " nl-badge--bare" : ""}`}>
      {children}
    </span>
  );
}

/** Text tabs on a hairline, with an underline that slides to the chosen one. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className = "",
}: {
  items: { id: T; label: string; count?: number | null; dot?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number; ready: boolean } | null>(null);
  const measure = () => {
    const el = ref.current?.querySelector<HTMLElement>(".nl-tab.is-on");
    if (el) setInd((cur) => ({ x: el.offsetLeft, w: el.offsetWidth, ready: Boolean(cur) }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [value, items.map((i) => `${i.id}${i.count ?? ""}`).join()]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} role="tablist" aria-label={label} className={`nl-tabs ${className}`}>
      {ind && <span aria-hidden className={`nl-tab-ind${ind.ready ? " is-ready" : ""}`} style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} className={`nl-tab${t.id === value ? " is-on" : ""}`} onClick={() => { if (t.id !== value) holdPlace(ref.current); onChange(t.id); }}>
          {t.label}
          {t.count != null && <span className="nl-tab-n">{t.count}</span>}
          {t.dot && <span className="nl-tab-dot" aria-label="Needs attention" />}
        </button>
      ))}
    </div>
  );
}

export type MenuItem =
  | { label: string; sub?: string; onClick?: () => void; href?: string; danger?: boolean; disabled?: boolean; steve?: string }
  | "rule";

/** The three-dot menu: everything that is not one of the page's two jobs. */
export function Menu({ items, label = "More options" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
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
  return (
    <div ref={wrap} className="nl-menu-wrap">
      <button type="button" className="nl-iconbtn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <div className="nl-menu" role="menu">
          {items.map((it, i) =>
            it === "rule" ? (
              <hr key={`r${i}`} />
            ) : it.href ? (
              <a key={it.label} role="menuitem" href={it.href} target={it.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={it.danger ? "is-danger" : ""} onClick={() => setOpen(false)}>
                <span>
                  {it.label}
                  {it.sub && <small>{it.sub}</small>}
                </span>
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                data-steve={it.steve}
                disabled={it.disabled}
                className={it.danger ? "is-danger" : ""}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                <span>
                  {it.label}
                  {it.sub && <small>{it.sub}</small>}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** A small line icon for the new look's buttons: 1.6px stroke on a 24 grid. */
export function Ico({ name, size = 16 }: { name: "plus" | "download" | "pen" | "calendar" | "arrow" | "back" | "image" | "search" | "filter" | "check" | "phone" | "mail" | "upload" | "lock" | "sun" | "moon" | "auto" | "camera" | "megaphone" | "coin" | "list" | "grid"; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
    pen: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    back: <path d="M15 6l-6 6 6 6" />,
    image: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M20.5 16l-5-5-8.5 8.5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4.2-4.2" />
      </>
    ),
    filter: <path d="M4 7h16M7 12h10M10 17h4" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
    mail: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M4 7l8 6 8-6" />
      </>
    ),
    upload: <path d="M12 16V4M7 9l5-5 5 5M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />,
    lock: (
      <>
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </>
    ),
    moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
    auto: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
      </>
    ),
    camera: (
      <>
        <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.6A1 1 0 0 1 8.6 5h6.8a1 1 0 0 1 .8.4L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
        <circle cx="12" cy="12.8" r="3.4" />
      </>
    ),
    megaphone: <path d="M4 10v4h3l7 4V6l-7 4zM17.5 9a4 4 0 0 1 0 6" />,
    coin: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.6 2.6 0 0 1-2.5-1.5M12 6.5v1.5M12 16v1.5" />
      </>
    ),
    list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
    grid: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}
