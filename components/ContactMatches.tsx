"use client";

import DoodleIcon from "@/components/DoodleIcon";
import type { Facet, FacetVerdict, ScoredMatch } from "@/lib/contact-match";

/**
 * "We think we already know this person."
 *
 * Lives in the gutter to the LEFT of the new-lead drawer, in the space the
 * drawer leaves — close enough to read while typing, far enough not to be in
 * the way. Below lg there is no gutter, so it doesn't render.
 *
 * A hundred per cent is a decision to make, so it is asked as a question at
 * the top. Everything else is offered quietly, scored, with the facts that
 * agreed and the facts that didn't — because a 50% is only useful if you can
 * see WHICH half matched.
 */

const FACET_LABEL: Record<Facet, string> = {
  name: "Name",
  address: "Address",
  mobile: "Mobile",
  email: "Email",
};

function Facets({ facets }: { facets: Record<Facet, FacetVerdict> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {(Object.keys(FACET_LABEL) as Facet[]).map((f) => {
        const v = facets[f];
        return (
          <span
            key={f}
            title={
              v === "match" ? "Same on both" : v === "differs" ? "Different" : "Nothing on file to compare"
            }
            className={`rounded-full px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-wide ${
              v === "match"
                ? "bg-accent-soft text-accent-dark"
                : v === "differs"
                  ? "border border-line/80 text-muted line-through"
                  : "border border-dashed border-line/80 text-muted/70"
            }`}
          >
            {FACET_LABEL[f]}
          </span>
        );
      })}
    </div>
  );
}

function Card({
  m,
  onOpen,
}: {
  m: ScoredMatch;
  onOpen: (m: ScoredMatch) => void;
}) {
  const unknown = (Object.values(m.facets) as FacetVerdict[]).filter((v) => v === "unknown").length;
  return (
    <div className="rounded-xl border border-line/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{m.name}</p>
          {m.email && <p className="truncate text-[11px] text-muted">{m.email}</p>}
          {m.mobile && <p className="truncate text-[11px] text-muted">{m.mobile}</p>}
          {m.address && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">
              {m.address.replace(/\s+/g, " ").trim()}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-page">
          {m.score}%
        </span>
      </div>
      <Facets facets={m.facets} />
      {unknown > 0 && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted">
          {unknown === 1 ? "One field" : `${unknown} fields`} couldn&apos;t be compared — nothing on
          file, or nothing typed yet.
        </p>
      )}
      <button
        type="button"
        onClick={() => onOpen(m)}
        className="mt-2.5 w-full rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
      >
        Work on this file instead
      </button>
    </div>
  );
}

export default function ContactMatches({
  matches,
  busy,
  onOpen,
  onDismissExact,
}: {
  matches: ScoredMatch[];
  busy: boolean;
  onOpen: (m: ScoredMatch) => void;
  /** "No" to the exact-match question — they meant to create a new record. */
  onDismissExact: () => void;
}) {
  const exact = matches.find((m) => m.score === 100) ?? null;
  const rest = matches.filter((m) => m !== exact);
  if (!busy && !matches.length) return null;

  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 hidden w-[24%] flex-col gap-3 overflow-y-auto p-5 lg:flex xl:w-[32%]">
      <div className="flex items-center gap-2 text-page">
        <DoodleIcon name="search" size={15} />
        <h3 className="text-[12px] font-semibold uppercase tracking-wide">
          {busy && !matches.length ? "Checking REX…" : "Already in REX?"}
        </h3>
      </div>

      {exact && (
        <div className="rounded-xl border border-accent-dark bg-card p-4">
          <p className="text-[13px] font-semibold leading-snug">{exact.name}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            All four match — name, address, mobile and email. This person is already in the
            system. Open their file?
          </p>
          <Facets facets={exact.facets} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onOpen(exact)}
              className="flex-1 rounded-full bg-ink px-3 py-1.5 text-[12px] text-page"
            >
              Yes, open it
            </button>
            <button
              type="button"
              onClick={onDismissExact}
              className="rounded-full border border-line/80 bg-card px-3 py-1.5 text-[12px]"
            >
              No
            </button>
          </div>
        </div>
      )}

      {rest.map((m) => (
        <Card key={m.id} m={m} onOpen={onOpen} />
      ))}

      {!!matches.length && (
        <p className="mt-auto text-[10px] leading-relaxed text-page/70">
          Scored a quarter each on name, address, mobile and email. A dashed field is one
          nobody has filled in — on their record or on yours.
        </p>
      )}
    </div>
  );
}
