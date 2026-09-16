"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { RexHit, RexPerson } from "@/app/api/search/rex/route";

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
  const [rexPeople, setRexPeople] = useState<RexPerson[] | null>(null);
  const [rexBusy, setRexBusy] = useState(false);
  /* Said only once the wait is long enough to need explaining. James, 15 Sep:
     "it's not necessarily the length, it's the information, so it feels like
     it's stuck." Under a second nobody needs telling; over one, they do. */
  const [rexSlow, setRexSlow] = useState(false);
  const [rexNote, setRexNote] = useState<string | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  const box = useRef<HTMLLabelElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const seq = useRef(0);
  /* The term as it stands right now, for the guard in lookInRex - a slow REX
     answer must not land on a word somebody has already typed past. */
  const qRef = useRef("");
  qRef.current = q;

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
    setRexPeople(null);
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

  async function lookInRex(term: string) {
    const needle = term.trim();
    if (needle.length < 2) return;
    setRexBusy(true);
    setRexSlow(false);
    setRexNote(null);
    /* A second's grace before the screen explains itself. Most listing
       searches are back inside it and never need to say anything. */
    const tell = window.setTimeout(() => setRexSlow(true), 1000);
    const j = await fetch(`/api/search/rex?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    window.clearTimeout(tell);
    /* Only answer the term still in the box: a slow REX reply for a word
       somebody has typed past must not overwrite the one they are on. */
    if (needle !== qRef.current.trim()) return;
    setRexHits(j?.hits ?? []);
    setRexPeople(j?.people ?? []);
    setRexNote(j?.note ?? null);
    setRexBusy(false);
    setRexSlow(false);
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

  /* REX is asked ON ITS OWN, once the typing has settled - James, 15 Sep:
     search the system first, then go to REX and say so. Not per keystroke:
     a REX contact search is seconds long, and one per letter would be both
     useless and unkind to their API. 700ms after the last key, and only for
     three letters or more, which is where a name starts being a name. */
  useEffect(() => {
    const needle = q.trim();
    if (!open || needle.length < 3) return;
    const t = setTimeout(() => void lookInRex(needle), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

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
                {rexBusy && rexHits == null ? (
                  /* The wait, explained. Under a second this never appears;
                     over one it says what is being waited on, which is the
                     whole difference between waiting and being stuck. */
                  <p className="flex items-center gap-2 text-[11.5px] text-muted">
                    <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                    {rexSlow ? "Still looking - pulling records across…" : "Still looking…"}
                  </p>
                ) : rexHits == null ? (
                  <p className="text-[11.5px] text-muted">{rexNote ?? "Only what we hold here so far."}</p>
                ) : (
                  <>
                    {rexHits.length > 0 && (
                      <>
                        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">On the book, not opened here yet</p>
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
                      </>
                    )}

                    {/* People are shown to be READ, with a way into REX. What a
                        pulled person should become in the OS is a decision
                        nobody has made, and a half-formed record on the leads
                        board is worse than a link. */}
                    {(rexPeople?.length ?? 0) > 0 && (
                      <>
                        <p className={`text-[9.5px] font-bold uppercase tracking-wider text-muted ${rexHits.length ? "mt-3" : ""}`}>
                          People in REX
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {(rexPeople ?? []).map((p) => (
                            <li key={p.id} className="flex items-center gap-3">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold">{p.name}</span>
                                <span className="block truncate text-[10.5px] text-muted">{p.reach}</span>
                              </span>
                              <a
                                href={p.href}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[11px] font-semibold text-muted hover:border-ink hover:text-ink"
                              >
                                Open in REX
                              </a>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {rexHits.length === 0 && (rexPeople?.length ?? 0) === 0 && (
                      <p className="text-[11.5px] text-muted">{rexNote ?? "Nothing anywhere else either."}</p>
                    )}
                    {rexNote && (rexHits.length > 0 || (rexPeople?.length ?? 0) > 0) && (
                      <p className="mt-1.5 text-[11px] text-[#9d4340]">{rexNote}</p>
                    )}
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
