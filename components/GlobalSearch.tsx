"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The search bar on every page, made real.
 *
 * Type an address, a name, an email or a phone number; the property, the
 * lead, the application and the deal that match drop down under the box,
 * each opening on its own screen. Enter takes the first. It asks the
 * server after a short pause rather than on every key, and the panel is
 * portalled to the body for the same reason the bell's is: the cards
 * below the header would otherwise paint over it.
 */

interface Hit {
  kind: "property" | "lead" | "application" | "deal" | "compliance";
  title: string;
  sub: string;
  href: string;
}

const ICON: Record<Hit["kind"], string> = { property: "home", lead: "target", application: "checklist", deal: "key", compliance: "shield" };

export default function GlobalSearch({ placeholder = "Search properties, tenants…" }: { placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLLabelElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const seq = useRef(0);

  const place = useCallback(() => {
    const r = box.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 360) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setHits(null);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { hits?: Hit[] } | null) => {
          if (mine !== seq.current) return;
          setHits(j?.hits ?? []);
          setBusy(false);
        })
        .catch(() => {
          if (mine === seq.current) {
            setHits([]);
            setBusy(false);
          }
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    setHits(null);
    router.push(h.href);
  }

  const showing = open && q.trim().length >= 2;

  return (
    <>
      <label
        ref={box}
        className="flex w-full max-w-xs items-center gap-2.5 rounded-full border border-line/80 px-4 py-2.5 transition-colors focus-within:border-ink"
      >
        <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
        <input
          type="text"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && hits?.[0]) go(hits[0]);
          }}
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
        />
      </label>
      {showing &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-[150] cursor-default" />
            <div
              style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
              className="fade-up fixed z-[160] max-w-[92vw] overflow-hidden rounded-2xl border border-line/80 bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
            >
              <ul className="max-h-[60vh] divide-y divide-line/50 overflow-y-auto">
                {busy && !hits && <li className="px-4 py-3 text-[12px] text-muted">Looking…</li>}
                {hits && !hits.length && !busy && (
                  <li className="px-4 py-3 text-[12px] text-muted">Nothing matches that. Try part of the address, or a surname.</li>
                )}
                {(hits ?? []).map((h, i) => (
                  <li key={`${h.kind}-${h.href}-${i}`}>
                    <button type="button" onClick={() => go(h)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-page">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft/60">
                        <DoodleIcon name={ICON[h.kind]} size={13} className="text-accent-dark" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{h.title}</span>
                        <span className="block truncate text-[11px] text-muted">{h.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
