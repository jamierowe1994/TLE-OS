"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * WHICH PROPERTY IN REX THIS APPRAISAL IS ABOUT — chosen by a person.
 *
 * ── Why a human picks instead of us matching ──────────────────────────────
 *
 * Signing the terms creates a REX listing, and a listing hangs off a property.
 * Resolving that property from an address string is the single thing this
 * project has been bitten by hardest: Homesearch returned "18 Knoll Rise,
 * LU2 7JA" for "18 Ashworth Rise, LU2 7QP" with a confident 200, and a
 * startsWith postcode check put Luton and Leicester comparables on a
 * Liverpool flat. Both of those were READS, and we caught them.
 *
 * Get it wrong here and a landlord's signed contract attaches to somebody
 * else's house in the live CRM six businesses work in. So the address goes to
 * REX's own autocomplete, REX does the matching, and an agent confirms —
 * once, deliberately, looking at the address and its status.
 *
 * "Already listed" is called out for that reason: it is the signal that this
 * is probably not the property you meant, and it is the mistake most likely
 * to look right.
 */

interface Hit {
  id: string;
  address: string;
  image: string | null;
  status: string | null;
  alreadyListed: boolean;
  category: string | null;
}

export default function RexPropertyPicker({
  appraisal,
  onSaved,
}: {
  appraisal: MarketAppraisal;
  onSaved: (next: MarketAppraisal) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(appraisal.address || "");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  /* Debounced, and last-request-wins. Typing an address fires a REX call per
     keystroke otherwise, and a slow early response can land after a fast late
     one and repaint the list with results for half a postcode. */
  useEffect(() => {
    if (!open || q.trim().length < 3) {
      setHits(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setBusy(true);
      fetch(`/api/rex/property-search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((j: { results?: Hit[]; error?: string }) => {
          if (mine !== seq.current) return;
          if (j.error) setError(j.error);
          else {
            setHits(j.results ?? []);
            setError(null);
          }
        })
        .catch((e: Error) => mine === seq.current && setError(e.message))
        .finally(() => mine === seq.current && setBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, open]);

  async function choose(id: string | null) {
    setError(null);
    try {
      const r = await fetch("/api/appraisals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: appraisal.id, rexPropertyId: id ?? "" }),
      });
      const j = (await r.json()) as { appraisal?: MarketAppraisal; error?: string };
      if (j.appraisal) {
        onSaved(j.appraisal);
        setOpen(false);
      } else setError(j.error ?? "Couldn't save that.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10.5px] uppercase tracking-wide text-muted">REX property</span>
        {appraisal.rexPropertyId ? (
          <>
            <span className="figures text-[12.5px]">#{appraisal.rexPropertyId}</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-[11px] text-muted underline"
            >
              Change
            </button>
          </>
        ) : (
          <>
            <span className="text-[12.5px] text-muted">Not linked</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-[11px] underline"
            >
              Link it
            </button>
            <span className="w-full text-[10.5px] leading-snug text-muted">
              Needed before terms can be signed — the contract attaches to a REX listing, and
              a listing needs a property.
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line/80 bg-panel p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
        Find it in REX
      </p>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Start typing the address…"
        className="mt-2 w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
      />

      {error && <p className="mt-2 text-[11.5px] text-accent-dark">{error}</p>}
      {busy && <p className="mt-2 text-[11.5px] text-muted">Asking REX…</p>}

      {hits && hits.length === 0 && !busy && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Nothing in REX matches that. Try the street on its own, or the postcode. If the
          property genuinely isn&apos;t in REX yet, it has to be created there first.
        </p>
      )}

      {hits && hits.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => choose(h.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-line/70 p-2.5 text-left hover:border-ink/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-snug">{h.address}</span>
                  <span className="mt-0.5 block text-[10.5px] text-muted">
                    #{h.id}
                    {h.category ? ` · ${h.category}` : ""}
                    {h.status ? ` · ${h.status}` : ""}
                  </span>
                </span>
                {/* The one thing worth shouting about: picking a property that
                    is already on the market is almost certainly the wrong one. */}
                {h.alreadyListed && (
                  <span className="shrink-0 rounded-full border border-accent-dark/40 px-2 py-0.5 text-[10px] text-accent-dark">
                    Already listed
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line/80 px-3.5 py-2 text-[12px]"
        >
          Cancel
        </button>
        {appraisal.rexPropertyId && (
          <button
            type="button"
            onClick={() => choose(null)}
            className="rounded-lg border border-line/80 px-3.5 py-2 text-[12px] text-muted"
          >
            Unlink
          </button>
        )}
      </div>
    </div>
  );
}
