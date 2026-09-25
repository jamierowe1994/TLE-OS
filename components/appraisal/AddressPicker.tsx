"use client";

import { useEffect, useMemo, useState } from "react";
import type { HsAddress } from "@/lib/ma-research";

/**
 * Pick the property by hand when Homesearch cannot match the address.
 *
 * Howard, 24 Sep 2026: "if homesearch cant find the property, let me locate it
 * using search". 52a Moor Street matched nothing, yet Homesearch holds 52 Moor
 * Street at the same postcode. The automatic match must never guess (see
 * matchIsTrustworthy), so the agent chooses, and the page says it was them.
 *
 * Opens on every address Homesearch holds at the postcode, closest first. The
 * box filters that list; three letters or more can also search the whole of
 * Homesearch, for a postcode that is itself wrong.
 */
export default function AddressPicker({
  postcode,
  asked,
  busy = false,
  onPick,
  onCancel,
}: {
  postcode: string;
  /** The address as the appraisal has it, to put the likeliest rows first. */
  asked: string;
  /** The research is reloading from a pick. */
  busy?: boolean;
  onPick: (a: HsAddress) => void;
  onCancel?: () => void;
}) {
  const [all, setAll] = useState<HsAddress[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [wide, setWide] = useState<HsAddress[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let gone = false;
    setAll(null);
    setProblem(null);
    fetch(`/api/ma-research/addresses?postcode=${encodeURIComponent(postcode)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; addresses?: HsAddress[]; error?: string }) => {
        if (gone) return;
        if (!j.ok) setProblem(j.error ?? "Homesearch did not answer.");
        setAll(j.addresses ?? []);
      })
      .catch(() => {
        if (!gone) {
          setProblem("Couldn't reach Homesearch just now.");
          setAll([]);
        }
      });
    return () => {
      gone = true;
    };
  }, [postcode]);

  /* "52a Moor Street" → building 52 and street "moor street": rows on that
     building come first, then the street, then the rest as Homesearch has them. */
  const ranked = useMemo((): Array<HsAddress & { closest?: boolean }> => {
    const first = asked.split(",")[0].toLowerCase();
    const base = first.match(/\d+/)?.[0] ?? "";
    const street = first.replace(/^[\d\s\-a-z]*?(?=[a-z]{3,})/i, "").trim();
    const score = (label: string) => {
      const l = label.toLowerCase();
      let s = 0;
      if (street && l.includes(street)) s += 1;
      if (base && new RegExp(`(^|\\D)${base}(\\D|$)`).test(l)) s += 2;
      return s;
    };
    return [...(all ?? [])]
      .map((a, i) => ({ a, i, s: score(a.label) }))
      .sort((x, y) => y.s - x.s || x.i - y.i)
      .map((x) => ({ ...x.a, closest: x.s >= 3 }));
  }, [all, asked]);

  const words = find.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const shown: Array<HsAddress & { closest?: boolean }> = (wide ?? ranked).filter((a) => words.every((w) => a.label.toLowerCase().includes(w)));

  async function searchWide() {
    const q = find.trim();
    if (q.length < 3) return;
    setSearching(true);
    try {
      const j = (await fetch(`/api/ma-research/addresses?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => r.json())) as {
        ok?: boolean;
        addresses?: HsAddress[];
        error?: string;
      };
      setWide(j.addresses ?? []);
      if (!j.ok) setProblem(j.error ?? "Homesearch did not answer.");
    } catch {
      setProblem("Couldn't reach Homesearch just now.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="rounded-xl border border-line/70 bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="hand text-[16px]">Find it yourself</p>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-[11.5px] text-muted hover:text-ink">
            Keep the one I picked
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        {wide
          ? `Searching all of Homesearch for "${find.trim()}".`
          : all === null
            ? `Reading the addresses Homesearch holds at ${postcode}…`
            : all.length
              ? `Homesearch holds ${all.length} address${all.length === 1 ? "" : "es"} at ${postcode}. Pick the landlord's home and the facts load from it.`
              : `Homesearch holds no addresses at ${postcode}. Search by street and town instead.`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={find}
          onChange={(e) => {
            setFind(e.target.value);
            if (wide) setWide(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !shown.length) void searchWide();
          }}
          placeholder="Type a number, street or building"
          className="min-w-0 flex-1 basis-56 rounded-lg border border-line/80 bg-page px-3 py-2 text-[13px]"
        />
        <button
          type="button"
          onClick={() => void searchWide()}
          disabled={find.trim().length < 3 || searching}
          className="rounded-lg border border-line/80 px-3 py-2 text-[12px] font-semibold transition-colors hover:border-ink disabled:opacity-40"
        >
          {searching ? "Searching…" : "Search everywhere"}
        </button>
      </div>

      {problem && <p className="mt-2 text-[12px] text-accent-dark">{problem}</p>}

      {all === null && !wide ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Loading addresses…
        </p>
      ) : (
        <ul className="mt-3 max-h-64 divide-y divide-line/50 overflow-y-auto rounded-lg border border-line/60">
          {shown.length === 0 && (
            <li className="px-3 py-2.5 text-[12px] text-muted">
              Nothing matches{find.trim() ? ` "${find.trim()}"` : ""}.{" "}
              {find.trim().length >= 3 && !wide ? "Try Search everywhere." : ""}
            </li>
          )}
          {shown.map((a) => (
            <li key={a.hsId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick({ hsId: a.hsId, label: a.label })}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[12.5px] transition-colors hover:bg-accent-soft/40 disabled:opacity-50"
              >
                <span className="min-w-0">{a.label}</span>
                {a.closest && !find && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent-dark">Closest</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
