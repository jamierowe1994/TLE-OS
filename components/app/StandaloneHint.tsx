"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Shown on Home only while the app is open in a browser tab (3 Oct 2026).
 * James's screenshots had Safari's address bar and buttons all over the app:
 * a page cannot hide them, only opening it from the home screen as a web app
 * does. So it says so, once per visit, and points at the steps.
 */
export default function StandaloneHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("app-hint-off") === "1";
    } catch {
      /* Show it. */
    }
    setShow(!standalone && !/TLEOSApp\//.test(navigator.userAgent) && !dismissed);
  }, []);
  if (!show) return null;
  return (
    <section className="mb-3 flex items-center gap-3 rounded-[22px] px-4 py-3.5" style={{ background: "var(--m-pink-wash)" }}>
      <DoodleIcon name="upload" size={20} />
      <Link href="/download" className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">Open TLE OS Full Screen</span>
        <span className="block text-[13px] leading-snug text-muted">Add it to your home screen and the browser&apos;s buttons go.</span>
      </Link>
      <button
        type="button"
        aria-label="Hide"
        onClick={() => {
          try {
            sessionStorage.setItem("app-hint-off", "1");
          } catch {
            /* It just hides for now. */
          }
          setShow(false);
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </section>
  );
}
