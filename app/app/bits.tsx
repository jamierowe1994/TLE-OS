"use client";

import Link from "next/link";
import { useEffect } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { useGoTo } from "@/components/app/AppFrame";

/**
 * The few pieces every phone screen shares. Kept deliberately small: big
 * targets (48px and up), one action per row, words rather than icons alone.
 */

/**
 * A screen's title, with the "+" for every other page at its right (James's
 * reference: "Dashboard" and a plus). An optional small line above (the
 * date), and on a screen one level down, a round back button at the left.
 */
export function PhoneTop({
  title,
  eyebrow,
  back,
  children,
}: {
  title: string;
  eyebrow?: string;
  back?: string;
  /** Sits under the title: the week strip, chips. */
  children?: React.ReactNode;
}) {
  const goTo = useGoTo();
  return (
    <header className="mb-4">
      <div className="flex h-11 items-center justify-between gap-3">
        {back ? <BackLink href={back} /> : <span />}
        <button type="button" onClick={goTo} aria-label="Everything else" className="m-press -mr-1.5 flex h-11 w-11 items-center justify-center rounded-full">
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {eyebrow && <p className="m-eyebrow mt-1">{eyebrow}</p>}
      <h1 className="m-title mt-0.5 text-[30px] leading-[1.15]">{title}</h1>
      {children}
    </header>
  );
}

export function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="Back" className="m-round m-press">
      <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/** Two or three choices as rounded chips, the chosen one filled. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="m-seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center gap-3 text-[14px] text-muted ${className}`}>
      <span className="block h-5 w-5 shrink-0 animate-spin rounded-full border-[2.5px] border-accent/30 border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorLine({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl bg-accent-soft/70 px-4 py-3 text-[14px] text-accent-dark">
      <p>{text}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Try Again
        </button>
      )}
    </div>
  );
}

/** A phone number as the dialler wants it: digits and a leading plus only. */
export const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

/** Call, text and email, as three plain buttons. Missing ones are left out, not greyed. */
export function ReachButtons({ phone, email }: { phone: string; email: string }) {
  const tel = dialable(phone);
  if (!tel && !email) return <p className="mt-3 text-[13px] text-muted">No number or email on the record.</p>;
  const btn = "m-btn m-press flex-1 !h-11 !text-[14.5px]";
  return (
    <div className="mt-3 flex gap-2">
      {tel && (
        <a href={`tel:${tel}`} className={`${btn} m-btn-primary`}>
          <DoodleIcon name="call" size={17} /> Call
        </a>
      )}
      {tel && (
        <a href={`sms:${tel}`} className={btn}>
          <DoodleIcon name="message" size={17} /> Text
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={btn}>
          <DoodleIcon name="mail" size={17} /> Email
        </a>
      )}
    </div>
  );
}

/** Directions in whichever maps app the phone opens Google's link with. */
export function mapsHref(address: string, lat?: number | null, lng?: number | null): string {
  const query = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** A sheet up from the bottom. Tapping the dim, or Escape, closes it. */
export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: "rgba(43, 32, 29, 0.45)", animation: "m-dim 200ms ease-out both" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <style>{`
        @keyframes m-dim { from { opacity: 0 } to { opacity: 1 } }
        @keyframes m-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .m-sheet { animation: none !important } }
      `}</style>
      <div
        className="m-sheet max-h-[88dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[26px] bg-page px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-3"
        style={{ animation: "m-rise 300ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-4 block h-[5px] w-[44px] rounded-full bg-black/10" />
        {children}
      </div>
    </div>
  );
}

/** The search box every finder screen opens on. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /* Off by default: on a tab, the keyboard springing up the moment the tab
     is opened hides the page it is on. */
  autoFocus?: boolean;
}) {
  return (
    <label className="m-search">
      <DoodleIcon name="search" size={17} className="text-muted" />
      <input
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-muted">
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </label>
  );
}
