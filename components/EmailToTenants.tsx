"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DoneTick, PressButton } from "@/components/Bits";
import PeopleFilterBar, { NO_FILTERS, passesFilters, type Filters } from "@/components/PeopleFilter";
import { LEADS, leadSide, type Lead } from "@/lib/leads-sample";

/**
 * One property, out to the book.
 *
 * The mirror of Email properties on a lead: there, one person and many
 * properties; here, one property and many people. It's the other half of the
 * same job and an agent does it every time something new goes live.
 *
 * The list is MATCHED, not everybody. Blasting all 24 tenants with a £1,650
 * flat in Nottingham is how a database learns to ignore you — so budget and
 * area are checked, the reason is printed on every row, and only real matches
 * are pre-ticked. Everyone else is still there to tick by hand, because the
 * agent knows things the filter doesn't.
 */

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};

/** "£1,200 pcm" → 1200. Budgets are free text on a lead. */
function budgetOf(lead: Lead): number | null {
  const m = lead.budget.replace(/,/g, "").match(/£\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** The town or postcode district, so "Didsbury" matches "Didsbury M20". */
function areaWords(s: string): string[] {
  return s.toLowerCase().split(/[,\s]+/).filter((w) => w.length > 3);
}

type Match = { lead: Lead; why: string[]; strong: boolean };

function matchesFor(listing: Listing): Match[] {
  const rent = listing.rent ?? 0;
  const place = areaWords(listing.locality);

  return LEADS.filter((l) => leadSide(l) === "tenant" && l.stage !== "Not proceeding")
    .map((l) => {
      const why: string[] = [];
      const budget = budgetOf(l);
      // Within budget, or close enough that it's worth asking — 10% over is a
      // conversation, not a waste of their time.
      const affordable = budget != null && rent > 0 && rent <= budget * 1.1;
      if (affordable) why.push(budget! >= rent ? "In budget" : "Just over budget");

      const wants = areaWords(`${l.area} ${l.preferred}`);
      const sameArea = place.some((p) => wants.some((w) => w.startsWith(p) || p.startsWith(w)));
      if (sameArea) why.push("Right area");

      return { lead: l, why, strong: affordable && sameArea };
    });
  // No re-sort: the book is newest-first, and "most recent first" is the
  // order agents asked for. The strong matches are pre-ticked, not promoted.
}

export default function EmailToTenants({
  open,
  onClose,
  listing,
}: {
  open: boolean;
  onClose: () => void;
  listing: Listing | null;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [stage, setStage] = useState<"pick" | "review" | "sent">("pick");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const matches = useMemo(() => (listing ? matchesFor(listing) : []), [listing]);

  // Seeded on OPEN only — `matches` is derived, and depending on it would
  // re-tick everything mid-edit.
  const seed = useRef(matches);
  seed.current = matches;
  useEffect(() => {
    if (!open) return;
    setChosen(seed.current.filter((m) => m.strong).map((m) => m.lead.id));
    setStage("pick");
    setFilters(NO_FILTERS);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !listing) return null;

  const picked = matches.filter((m) => chosen.includes(m.lead.id));
  const strongCount = matches.filter((m) => m.strong).length;
  const visible = matches.filter((m) =>
    passesFilters({ name: m.lead.name, lat: m.lead.lat, lng: m.lead.lng }, filters)
  );

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div className="fade-up relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "sent" ? "On its way" : stage === "review" ? "Review email" : "Email this property out"}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {listing.name} · £{listing.rent?.toLocaleString("en-GB")} pcm
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {stage === "sent" && (
            <div className="flex flex-col items-center py-8 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">
                Sent to {picked.length} {picked.length === 1 ? "applicant" : "applicants"}
              </p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Logged against each of their records under Activity.
              </p>
            </div>
          )}

          {stage === "pick" && (
            <>
              <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
                {strongCount
                  ? `${strongCount} on the book match this on budget and area, and are ticked. The rest are here to add by hand.`
                  : "Nobody matches on both budget and area, so nothing is ticked — pick by hand."}
              </p>
              <PeopleFilterBar filters={filters} onChange={setFilters} />
              <ul className="space-y-2.5">
                {visible.map((m) => {
                  const on = chosen.includes(m.lead.id);
                  return (
                    <li key={m.lead.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setChosen((c) =>
                            on ? c.filter((x) => x !== m.lead.id) : [...c, m.lead.id]
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                          on ? "border-accent-dark bg-accent-soft/40" : "border-line/60"
                        }`}
                      >
                        <span
                          className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            on ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                          }`}
                        >
                          {on && "✓"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="hand block truncate text-[13px]">{m.lead.name}</span>
                          <span className="block truncate text-[10.5px] text-muted">
                            {m.lead.budget} · {m.lead.preferred}
                          </span>
                        </span>
                        {/* Why they're here — a suggestion that won't say why
                            is a suggestion nobody trusts. */}
                        <span className="flex shrink-0 gap-1.5">
                          {m.why.map((w) => (
                            <span
                              key={w}
                              className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] font-semibold text-accent-dark"
                            >
                              {w}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {!visible.length && (
                  <p className="py-6 text-center text-[12px] text-muted">
                    Nobody matches those filters — widen the radius or clear the search.
                  </p>
                )}
              </ul>
            </>
          )}

          {stage === "review" && (
            <div className="rounded-2xl border border-line/70 bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Subject</p>
              <p className="mt-1 text-[14px] font-semibold">
                Just listed — {listing.name}
              </p>
              <div className="mt-5 space-y-3 border-t border-line/60 pt-4 text-[13px] leading-relaxed">
                <p>Hi,</p>
                <p>
                  A property has just come onto our books that looks right for what you&apos;re
                  after.
                </p>
                <div className="flex items-center gap-3 rounded-xl border border-line/60 p-2.5">
                  <PropertyPhoto src={listing.image} className="h-14 w-20 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{listing.name}</span>
                    <span className="block truncate text-[11.5px] text-muted">{listing.locality}</span>
                  </span>
                  <span className="figures shrink-0">
                    £{listing.rent?.toLocaleString("en-GB")}
                    <span className="text-[10px] text-muted"> pcm</span>
                  </span>
                </div>
                <p>Reply to this email or give us a ring and we&apos;ll get you booked in.</p>
                <p className="text-muted">Kind regards,<br />The Lettings Experts</p>
              </div>
              <p className="mt-4 border-t border-line/60 pt-3 text-[10.5px] text-muted">
                Sent individually, not as one thread — {picked.length} separate email
                {picked.length === 1 ? "" : "s"}, so nobody sees anybody else&apos;s address.
              </p>
            </div>
          )}
        </div>

        {stage !== "sent" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
            <button
              type="button"
              onClick={() => setStage(stage === "review" ? "pick" : "review")}
              disabled={!picked.length}
              className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-40"
            >
              {stage === "review" ? "← Back" : "Review email"}
            </button>
            <PressButton
              onClick={() => picked.length && setStage("sent")}
              className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                picked.length ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <DoodleIcon name="mail" size={15} />
                Send to {picked.length || "…"}
              </span>
            </PressButton>
          </div>
        )}
      </div>
    </div>
  );
}
