"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { RexHit } from "@/app/api/search/rex/route";

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
  /* The REX half. Asked for by a button, never by typing: a REX listing
     search costs about a third of a second and a keystroke cannot. */
  const [rexHits, setRexHits] = useState<RexHit[] | null>(null);
  const [rexBusy, setRexBusy] = useState(false);
  const [rexNote, setRexNote] = useState<string | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
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
    setRexHits(null);
    setRexNote(null);
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

  async function lookInRex() {
    const needle = q.trim();
    if (needle.length < 2) return;
    setRexBusy(true);
    setRexNote(null);
    const j = await fetch(`/api/search/rex?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setRexHits(j?.hits ?? []);
    setRexNote(j?.note ?? null);
    setRexBusy(false);
  }

  /** Bring one in, then go to it. The board is rebuilt server-side first, so
      it is there when they arrive rather than a beat later. */
  async function pull(h: RexHit) {
    setPulling(h.id);
    const j = await fetch("/api/listings/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: h.id }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setPulling(null);
    if (!j?.ok) {
      setRexNote(j?.error ?? "That did not come through. Try again in a moment.");
      return;
    }
    setOpen(false);
    setQ("");
    setHits(null);
    router.push(j.href as string);
  }

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

              {/* ── What the OS does not hold ──────────────────────────────
                  The list above is our own copies, which is what makes it
                  instant. REX holds more - a let property, or one in another
                  category, is invisible to the OS however well somebody
                  remembers it. James, 15 Sep 2026: let them search REX and
                  pull a record in when they click it, so the data arrives one
                  record at a time. A button, not a keystroke: REX answers a
                  listing search in about a third of a second, which is too
                  slow to type into and quick enough to ask for. */}
              <div className="border-t border-line/60 bg-page/60 px-4 py-2.5">
                {rexHits == null ? (
                  <button
                    type="button"
                    onClick={() => void lookInRex()}
                    disabled={rexBusy}
                    className="flex items-center gap-2 text-[11.5px] font-semibold text-accent-dark hover:underline disabled:opacity-60"
                  >
                    <DoodleIcon name="search" size={12} />
                    {rexBusy ? "Looking in REX…" : "Not here? Look in REX"}
                  </button>
                ) : (
                  <>
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">In REX, not in the OS</p>
                    {rexHits.length === 0 ? (
                      <p className="mt-1 text-[11.5px] text-muted">{rexNote ?? "Nothing in REX either."}</p>
                    ) : (
                      <ul className="mt-1.5 space-y-1">
                        {rexHits.map((h) => (
                          <li key={h.id} className="flex items-center gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-semibold">{h.address}</span>
                              <span className="block truncate text-[10.5px] text-muted">{h.why}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => void pull(h)}
                              disabled={pulling === h.id}
                              className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                              style={{ background: "var(--accent-dark)" }}
                            >
                              {pulling === h.id ? "Bringing it in…" : "Bring it in"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {rexNote && rexHits.length > 0 && <p className="mt-1.5 text-[11px] text-[#9d4340]">{rexNote}</p>}
                  </>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
