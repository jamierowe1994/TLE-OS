"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSlideOver } from "@/lib/use-slide-over";

/**
 * Floating boxes over a darkened, blurred page (James, 25 Oct 2026, from the
 * Contractors design: "a kind of darkened background, and then you have the
 * option of clicking each individual box... it's not just one big blob").
 *
 * Not one panel: a header box (title, "2 of 6", close), an optional progress
 * line, the question and its lede in white on the dark, the content as
 * separate cards, and a footer box (a hint or a secondary on the left, the
 * main button on the right). Full width with the boxes stacked on a phone.
 *
 * Styled from app/new-look/float-sheet.css, prefix nl-fs-. Drawn in a portal
 * on its own [data-look="new"] root, so it carries the new look's tokens
 * wherever it is opened from.
 *
 *   <FloatSheet title="Log an Invoice" step={1} steps={2} onClose={close}
 *     question="Who is it from?" lede="Search the book."
 *     foot={<FloatFoot left={<span>Goes to To pay</span>}><button …>Next</button></FloatFoot>}>
 *     <FloatCard>…</FloatCard>
 *     <FloatChoice title="Emergency" text="Today" on={…} onClick={…} />
 *   </FloatSheet>
 *
 * Escape and a click on the dark close it (not while `dismissible` is
 * false, say while saving); Tab stays inside it; focus goes back to where it
 * was when it closes. A component that owns its own buttons can draw its
 * FloatFoot as its last child instead of passing `foot`.
 */

type Ctx = { close: () => void };
const FloatCtx = createContext<Ctx | null>(null);
/** Close the sheet it is inside with its exit played, from anything in it. */
export function useFloatSheet(): Ctx | null {
  return useContext(FloatCtx);
}

/* One sheet handing over to the next in the same moment (a chooser opening
   the flow it chose) keeps the dark up rather than flashing the page. */
let lastClosedAt = 0;
/* ...and the button that opened the first one is where focus goes back to when the last one closes. */
let lastBack: HTMLElement | null = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface FloatSheetProps {
  /** Mounted but closed plays nothing; most callers mount it only while open. */
  open?: boolean;
  title: React.ReactNode;
  onClose: () => void;
  /** "2 of 6" in the header and the progress line, 1-based. Leave out for a single screen. */
  step?: number;
  steps?: number;
  /** A back arrow in the header box. */
  onBack?: () => void;
  /** The big question in white over the dark, and the line under it. */
  question?: React.ReactNode;
  lede?: React.ReactNode;
  /** The footer box. Or draw <FloatFoot> as the last child. */
  foot?: React.ReactNode;
  /** md is the design's 640px; lg is wider, for a record; xl takes the
   *  screen's width, for a flow with a step list beside it. */
  size?: "md" | "lg" | "xl";
  /** False while something is saving: Escape and the dark do nothing. */
  dismissible?: boolean;
  /** Changes when the screen changes, so the boxes float in again and focus moves to the new one. */
  screenKey?: string | number;
  /** The dialog's name for a screen reader, when the title is not plain text. */
  label?: string;
  children?: React.ReactNode;
}

export default function FloatSheet({ open = true, title, onClose, step, steps, onBack, question, lede, foot, size = "md", dismissible = true, screenKey, label, children }: FloatSheetProps) {
  const { shown, close } = useSlideOver(open, onClose);
  const root = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const stack = useRef<HTMLDivElement | null>(null);
  const back = useRef<HTMLElement | null>(null);
  const [instant, setInstant] = useState(false);
  /* More boxes below the fold. The middle scrolls on its own on a laptop, and
     on a small screen the boxes past the bottom edge went unseen - nobody knew
     to scroll (James, 27 Oct 2026) - so a "More below" sits over the foot. */
  const [more, setMore] = useState(false);
  const titleId = useId();
  const dismiss = useRef(dismissible);
  dismiss.current = dismissible;
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    if (!open) return;
    const handedOver = Date.now() - lastClosedAt < 450;
    if (handedOver) setInstant(true);
    const active = document.activeElement as HTMLElement | null;
    back.current = active && active !== document.body ? active : handedOver ? lastBack : null;
    return () => {
      lastClosedAt = Date.now();
      lastBack = back.current;
      const to = back.current;
      /* After the page has settled, and not if another sheet has taken over. */
      if (to && typeof to.focus === "function") window.setTimeout(() => { if (!document.querySelector(".nl-fs-wrap") && document.contains(to)) to.focus({ preventScroll: true }); }, 0);
    };
  }, [open]);

  /* The boxes float in on opening and on every new screen. Played by a class
     rather than a remount, so nothing inside loses what was typed. */
  useLayoutEffect(() => {
    const el = stack.current;
    if (!open || !el) return;
    el.classList.remove("is-anim");
    void el.offsetWidth;
    el.classList.add("is-anim");
    const t = window.setTimeout(() => el.classList.remove("is-anim"), 900);
    return () => window.clearTimeout(t);
  }, [open, screenKey]);

  /* Focus into the new screen: the first field, else the first thing to press, else the close. */
  useEffect(() => {
    if (!open || !shown) return;
    const t = window.setTimeout(() => {
      const r = root.current;
      if (!r) return;
      if (r.contains(document.activeElement) && document.activeElement !== r && screenKey === undefined) return;
      const b = body.current;
      const pick = b?.querySelector<HTMLElement>("[data-autofocus]")
        ?? b?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]), textarea:not([disabled])')
        ?? b?.querySelector<HTMLElement>(FOCUSABLE)
        ?? r.querySelector<HTMLElement>(".nl-fs-x");
      pick?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, shown, screenKey]);

  /* Whichever is scrolling - the middle on a laptop, the whole sheet on a
     phone - and whether anything is still hidden below it. */
  const scroller = useCallback((): HTMLElement | null => {
    const b = body.current;
    const r = root.current;
    if (b && b.scrollHeight - b.clientHeight > 2 && getComputedStyle(b).overflowY !== "visible") return b;
    return r;
  }, []);
  useEffect(() => {
    if (!open) return;
    const check = () => {
      const el = scroller();
      setMore(Boolean(el && el.scrollHeight - el.scrollTop - el.clientHeight > 24));
    };
    check();
    const b = body.current;
    const r = root.current;
    b?.addEventListener("scroll", check, { passive: true });
    r?.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    if (b) { ro?.observe(b); for (const c of Array.from(b.children)) ro?.observe(c); }
    const t = window.setTimeout(check, 600);
    return () => {
      b?.removeEventListener("scroll", check);
      r?.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro?.disconnect();
      window.clearTimeout(t);
    };
  }, [open, screenKey, scroller, children]);
  const scrollOn = () => {
    const el = scroller();
    el?.scrollBy({ top: Math.max(160, el.clientHeight * 0.75), behavior: "smooth" });
  };

  /* Escape closes; Tab goes round inside. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const r = root.current;
      if (!r) return;
      /* Focus in something drawn over the boxes (a booker or an email sheet
         opened from a card, 27 Oct 2026): its keys are its own. */
      const at = document.activeElement;
      if (at && at !== document.body && !r.contains(at) && at.closest("[role=dialog], .fixed")) return;
      for (let n = r.closest(".nl-fs-wrap")?.nextElementSibling; n; n = n.nextElementSibling) if (n.matches(".fixed.inset-0")) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented || !dismiss.current) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const all = [...r.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!all.length) { e.preventDefault(); return; }
      const first = all[0];
      const last = all[all.length - 1];
      const here = document.activeElement as HTMLElement | null;
      if (!here || !r.contains(here)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && here === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* A click on the dark, not a drag that began in a field and ended outside it. */
  const downOnDark = useRef(false);
  const isDark = (t: EventTarget | null) => t instanceof HTMLElement && (t === root.current || t.hasAttribute("data-fs-dark"));
  const onDown = useCallback((e: React.MouseEvent) => { downOnDark.current = isDark(e.target); }, []);
  const onClick = useCallback((e: React.MouseEvent) => {
    if (downOnDark.current && isDark(e.target) && dismiss.current) closeRef.current();
    downOnDark.current = false;
  }, []);

  if (!open || typeof document === "undefined") return null;
  const stepped = !!steps && steps > 1 && !!step;
  return createPortal(
    <FloatCtx.Provider value={{ close }}>
      <div data-look="new" className={`nl-fs-wrap${instant ? " is-instant" : ""}`} data-shown={shown}>
        <div className="nl-fs-scrim" aria-hidden />
        <div
          ref={root}
          className={`nl-fs is-${size}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={label ? undefined : titleId}
          aria-label={label}
          onMouseDown={onDown}
          onClick={onClick}
        >
          <div ref={stack} className="nl-fs-stack" data-fs-dark>
            <header className="nl-fs-head">
              {onBack && (
                <button type="button" className="nl-fs-ib" aria-label="Back" onClick={onBack}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
                </button>
              )}
              <h2 id={titleId} className="nl-fs-title">{title}</h2>
              {stepped && <span className="nl-fs-stepn">{Math.min(step!, steps!)} of {steps}</span>}
              <button type="button" className="nl-fs-ib nl-fs-x" aria-label="Close" onClick={() => { if (dismiss.current) close(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </header>
            {stepped && (
              <div className="nl-fs-prog" aria-hidden>
                {Array.from({ length: steps! }, (_, i) => <i key={i} className={i < step! - 1 ? "is-past" : i === step! - 1 ? "is-on" : ""} />)}
              </div>
            )}
            <div ref={body} className="nl-fs-body" data-fs-dark>
              {question && <p className="nl-fs-q">{question}</p>}
              {lede && <p className="nl-fs-lede">{lede}</p>}
              {children}
            </div>
            {more && (
              <div className="nl-fs-more">
                <button type="button" onClick={scrollOn}>
                  More below
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                </button>
              </div>
            )}
            {foot}
          </div>
        </div>
      </div>
    </FloatCtx.Provider>,
    document.body,
  );
}

/** One box of content. `tight` for a list of rows; `as` for a form or a list. */
export function FloatCard({ children, className = "", tight = false, as: Tag = "div" }: { children: React.ReactNode; className?: string; tight?: boolean; as?: "div" | "section" | "form" | "ul" | "dl" }) {
  return <Tag className={`nl-fs-card${tight ? " is-tight" : ""}${className ? ` ${className}` : ""}`}>{children}</Tag>;
}

/** A card's own heading, in Title Case. */
export function FloatCardHead({ title, aside }: { title: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="nl-fs-card-head">
      <h3>{title}</h3>
      {aside != null && <span>{aside}</span>}
    </div>
  );
}

/** A label sitting on the dark, over a run of choices. */
export function FloatLabel({ children }: { children: React.ReactNode }) {
  return <p className="nl-fs-lb">{children}</p>;
}

/** The footer box: the hint or a secondary on the left, the buttons on the right. Sticks to the bottom as the boxes scroll. */
export function FloatFoot({ left, children }: { left?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <footer className="nl-fs-foot">
      <div className="nl-fs-foot-l">{left}</div>
      <div className="nl-fs-foot-r">{children}</div>
    </footer>
  );
}

/** Each choice its own card. `on` fills it in, coral unless a `tone` says otherwise. */
export function FloatChoice({ title, text, icon, on = false, disabled = false, onClick, aside, tone }: {
  title: React.ReactNode; text?: React.ReactNode; icon?: React.ReactNode; on?: boolean; disabled?: boolean; onClick: () => void; aside?: React.ReactNode;
  /** The colour it fills with once picked: coral unless said (an emergency red, a routine sage). */
  tone?: "coral" | "red" | "sage";
}) {
  return (
    <button type="button" className={`nl-fs-choice${on ? " is-on" : ""}${icon ? " has-icon" : ""}${tone ? ` is-${tone}` : ""}`} aria-pressed={on} disabled={disabled} onClick={onClick}>
      {icon && <span className="nl-fs-choice-i" aria-hidden>{icon}</span>}
      <span className="nl-fs-choice-t">
        <b>{title}</b>
        {text && <span>{text}</span>}
      </span>
      {aside != null ? <span className="nl-fs-choice-a">{aside}</span> : on ? (
        <svg className="nl-fs-choice-a" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      ) : null}
    </button>
  );
}

/** The moment it has gone: a tick, what happened, what happens next. */
export function FloatDone({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="nl-fs-card nl-fs-done" role="status">
      <span className="nl-fs-tick" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}
