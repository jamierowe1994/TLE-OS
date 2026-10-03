"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { calm } from "@/components/app/motion";

/**
 * THE SEARCH THAT FLOATS UP (James, 3 Oct 2026): "the search box should float
 * to the top, and then the background should blur behind it and darken ...
 * it should pop out of the screen and dim behind it so we can see the
 * searches that are appearing."
 *
 * The box sits in the page like any other. Tapped, it lifts off and rises to
 * the top of the screen - overshooting a little and settling - while the page
 * behind blurs and darkens; what matches appears under it as you type.
 * Picking one drops the box back where it came from and opens it; Cancel, the
 * dimmed page or Escape just drops it back.
 *
 * The page keeps the words (value/onChange), so its own list underneath is
 * filtered by the same search once the box is back.
 */

export interface FloatItem {
  key: string;
  title: string;
  line?: string;
  tag?: string;
  onPick: () => void;
}

export default function FloatSearch({
  value,
  onChange,
  placeholder,
  items,
  children,
  hint = "Start typing a name, a street or a postcode.",
  className = "",
  shadow = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** What matches, drawn as rows. */
  items?: FloatItem[] | null;
  /** Or the page draws its own results. */
  children?: React.ReactNode;
  hint?: string;
  className?: string;
  shadow?: boolean;
}) {
  const pill = useRef<HTMLButtonElement | null>(null);
  const float = useRef<HTMLDivElement | null>(null);
  const back = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const from = useRef<DOMRect | null>(null);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => setHost(document.querySelector(".m-app") ?? document.body), []);

  const lift = () => {
    if (open) return;
    from.current = pill.current?.getBoundingClientRect() ?? null;
    /* Mounted and focused inside the tap, so the phone raises its keyboard. */
    flushSync(() => setOpen(true));
    input.current?.focus({ preventScroll: true });
  };

  /* Rising: from where the box was to the top, a little past and back. */
  useLayoutEffect(() => {
    if (!open) return;
    const r = from.current;
    const el = float.current;
    if (!r || !el || calm() || typeof el.animate !== "function") return;
    const to = el.getBoundingClientRect();
    const dx = r.left - to.left;
    const dy = r.top - to.top;
    const sx = r.width / Math.max(1, to.width);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scaleX(${sx})`, transformOrigin: "left top" },
        { transform: `translate(0px, -16px) scale(1.05)`, transformOrigin: "left top", offset: 0.6 },
        { transform: `translate(0px, 4px) scale(0.99)`, transformOrigin: "left top", offset: 0.8 },
        { transform: "none", transformOrigin: "left top" },
      ],
      { duration: 640, easing: "cubic-bezier(0.3, 0.9, 0.3, 1)" }
    );
    back.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease-out", fill: "both" });
    list.current?.animate(
      [
        { opacity: 0, transform: "translateY(28px) scale(0.97)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 460, delay: 200, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)", fill: "both" }
    );
  }, [open]);

  /* Dropping back to where it came from, then gone. */
  const drop = (then?: () => void) => {
    const el = float.current;
    const r = pill.current?.getBoundingClientRect();
    input.current?.blur();
    const finish = () => {
      setOpen(false);
      then?.();
    };
    if (!el || !r || calm() || typeof el.animate !== "function") return finish();
    const to = el.getBoundingClientRect();
    el.animate([{ transform: "none" }, { transform: `translate(${r.left - to.left}px, ${r.top - to.top}px) scaleX(${r.width / Math.max(1, to.width)})` }], {
      duration: 320,
      easing: "cubic-bezier(0.5, 0, 0.3, 1)",
      fill: "forwards",
    });
    back.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "ease-in", fill: "forwards" });
    list.current?.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(20px)" }], { duration: 200, fill: "forwards" });
    window.setTimeout(finish, 300);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && drop();
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typed = value.trim().length > 0;

  return (
    <>
      <button
        ref={pill}
        type="button"
        onClick={lift}
        className={`m-press flex h-[54px] min-w-0 flex-1 items-center gap-3 rounded-full px-5 text-left ${shadow ? "shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]" : ""} ${className}`}
        style={{ background: "var(--m-card)", visibility: open ? "hidden" : undefined }}
      >
        <DoodleIcon name="search" size={18} />
        <span className={`min-w-0 flex-1 truncate text-[15px] ${typed ? "" : "text-muted"}`}>{typed ? value : placeholder}</span>
        {typed && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-muted"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        )}
      </button>

      {open &&
        host &&
        createPortal(
          <div className="fixed inset-0 z-[78]" role="dialog" aria-modal="true" aria-label="Search">
            <div
              ref={back}
              onClick={() => drop()}
              className="absolute inset-0"
              style={{ background: "rgba(35, 24, 22, 0.42)", backdropFilter: "blur(14px) saturate(1.1)", WebkitBackdropFilter: "blur(14px) saturate(1.1)" }}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto max-w-[560px] px-4 pt-[calc(env(safe-area-inset-top)+14px)]">
              <div ref={float} className="pointer-events-auto flex items-center gap-2.5">
                <label className="flex h-[56px] min-w-0 flex-1 items-center gap-3 rounded-full px-5 shadow-[0_24px_50px_-18px_rgba(20,10,8,0.6)]" style={{ background: "var(--m-card)" }}>
                  <DoodleIcon name="search" size={18} />
                  <input
                    ref={input}
                    type="search"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    enterKeyHint="search"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
                  />
                </label>
                <button type="button" onClick={() => drop()} className="h-[56px] shrink-0 rounded-full px-4 text-[15px] font-semibold text-white" style={{ background: "rgba(20, 14, 12, 0.55)" }}>
                  Cancel
                </button>
              </div>

              <div ref={list} className="pointer-events-auto mt-3 max-h-[62dvh] overflow-y-auto overscroll-contain rounded-[24px] shadow-[0_24px_50px_-24px_rgba(20,10,8,0.6)]" style={{ background: "var(--m-card)" }}>
                {children ??
                  (!typed ? (
                    <p className="px-5 py-4 text-[14px] text-muted">{hint}</p>
                  ) : items === null || items === undefined ? (
                    <p className="px-5 py-4 text-[14px] text-muted">Searching...</p>
                  ) : items.length === 0 ? (
                    <p className="px-5 py-4 text-[14px] text-muted">Nothing matches &ldquo;{value.trim()}&rdquo;.</p>
                  ) : (
                    <ul>
                      {items.slice(0, 30).map((it) => (
                        <li key={it.key} className="border-b last:border-b-0" style={{ borderColor: "var(--m-line)" }}>
                          <button type="button" onClick={() => drop(it.onPick)} className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-panel">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15.5px] font-medium">{it.title}</span>
                              {it.line && <span className="block truncate text-[13px] text-muted">{it.line}</span>}
                            </span>
                            {it.tag && (
                              <span className="shrink-0 rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}>
                                {it.tag}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            </div>
          </div>,
          host
        )}
    </>
  );
}
