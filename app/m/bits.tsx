"use client";

import Link from "next/link";
import { useEffect } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The few pieces every phone screen shares. Kept deliberately small: big
 * targets (48px and up), one action per row, words rather than icons alone.
 */

/** Back to the home screen, and the screen's title. */
export function PhoneTop({ title, back = "/m" }: { title: string; back?: string }) {
  return (
    <header className="mb-5 flex items-center gap-3">
      <Link
        href={back}
        aria-label="Back"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line/70 bg-card active:bg-panel"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <h1 className="text-[25px] leading-tight">{title}</h1>
    </header>
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
    <div role="alert" className="rounded-2xl border border-accent/40 bg-accent-soft/60 px-4 py-3 text-[14px] text-accent-dark">
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
  const btn = "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold active:opacity-80";
  return (
    <div className="mt-3 flex gap-2">
      {tel && (
        <a href={`tel:${tel}`} className={btn} style={{ background: "var(--brown)", color: "#fff" }}>
          <DoodleIcon name="call" size={17} /> Call
        </a>
      )}
      {tel && (
        <a href={`sms:${tel}`} className={`${btn} border border-line/70 bg-card`}>
          <DoodleIcon name="message" size={17} /> Text
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={`${btn} border border-line/70 bg-card`}>
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex h-14 items-center gap-3 rounded-2xl border border-line/80 bg-card px-4 focus-within:border-accent">
      <DoodleIcon name="search" size={18} className="text-muted" />
      <input
        type="search"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear" className="flex h-8 w-8 items-center justify-center rounded-full text-muted">
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </label>
  );
}
