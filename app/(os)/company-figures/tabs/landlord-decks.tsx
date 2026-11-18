"use client";

// Company Figures > Landlord Decks (James, 18 Nov 2026): "How many agents are
// using the landlord presentation? Are they sending out the valuation the
// documented way? How many landlords have read it?"
//
// Month-scoped through /api/business/landlord-decks, so it rolls over on its
// own. A deck counts in the month it was sent; whether the landlord has opened
// it is as of now. Opens are the landlord's only - a signed-in member of staff
// never counts (app/api/present/opened).

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { LandlordDeckFigures, DeckKind } from "@/lib/business/landlord-decks"; // type-only
import { monthLabel } from "@/lib/business/format";

const n = (v: number) => v.toLocaleString("en-GB");
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "-");
const day = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }) : "-";
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** "9 hours", "2.5 days". */
const wait = (h: number | null) => (h == null ? "-" : h < 36 ? `${Math.round(h)} ${Math.round(h) === 1 ? "hour" : "hours"}` : `${Math.round((h / 24) * 10) / 10} days`);

const STAGE: Record<string, string> = {
  pre_appraisal: "Before the visit",
  appraisal: "Appraisal",
  post_appraisal: "After the visit",
  won: "Won",
  lost: "Lost",
  takeon: "Take-on",
};

const KIND_CARDS: { kind: DeckKind; title: string; when: string }[] = [
  { kind: "pre-appraisal", title: "Pre-appraisal", when: "Sent the day before the visit" },
  { kind: "appraisal", title: "Appraisal", when: "Presented on the day" },
  { kind: "post-appraisal", title: "Valuation", when: "Sent after the visit, with the figure" },
];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="stat-value stat-value--big mt-2">{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`tnum font-semibold ${tone ?? "text-ink"}`}>{value}</dd>
    </div>
  );
}

export default function LandlordDecksTab({ month }: { month: string; seed?: SeedData | null }) {
  const [data, setData] = useState<LandlordDeckFigures | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/business/landlord-decks?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && j?.ok) setData(j.figures as LandlordDeckFigures);
        else setError(j?.error ?? `The figures didn't load (${r.status}).`);
      })
      .catch(() => !cancelled && setError("The figures didn't load."));
    return () => {
      cancelled = true;
    };
  }, [month]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
        <span className="font-semibold">The landlord deck figures couldn&rsquo;t be read.</span> {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card flex items-center gap-3 p-5 text-[13px] text-muted" aria-busy="true">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
        Reading {monthLabel(month)}&rsquo;s landlord decks.
      </div>
    );
  }

  const k = data.kinds;
  const sent = k["pre-appraisal"].sent + k.appraisal.sent + k["post-appraisal"].sent;
  const opened = k["pre-appraisal"].opened + k.appraisal.opened + k["post-appraisal"].opened;
  const v = data.valuations;

  return (
    <div className="space-y-6">
      {/* ------------------------------ headline ------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[15px] text-ink">{monthLabel(month)} at a Glance</h2>
          <span className="text-[11px] text-muted">Live from the OS · read {stamp(data.asAt)}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Agents sending decks"
            value={n(data.agentsSending)}
            sub={`${n(data.agentsWithAppraisals)} ${data.agentsWithAppraisals === 1 ? "agent" : "agents"} had an appraisal this month`}
          />
          <Tile
            label="Decks sent"
            value={n(sent)}
            sub={`${n(k["pre-appraisal"].sent)} pre-appraisal · ${n(k.appraisal.sent)} appraisal · ${n(k["post-appraisal"].sent)} valuation`}
          />
          <Tile label="Opened by the landlord" value={pct(opened, sent)} sub={`${n(opened)} of ${n(sent)} ${sent === 1 ? "deck" : "decks"} sent this month`} />
          <Tile
            label="Valuations sent with the deck"
            value={pct(v.withDeck, v.total)}
            sub={
              v.total
                ? `${n(v.withDeck)} of ${n(v.total)} · ${n(v.withoutDeck)} without, ${n(v.withoutDeckNoVisit)} with no visit date`
                : "No valuations recorded this month"
            }
          />
        </div>
      </section>

      {/* ------------------------------ each deck ------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-[15px] text-ink">Each Deck</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {KIND_CARDS.map((c) => {
            const f = k[c.kind];
            return (
              <div key={c.kind} className="card flex h-full flex-col p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] text-ink">{c.title}</h3>
                  <span className="text-[11px] text-muted">{c.when}</span>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="stat-value stat-value--big">{pct(f.opened, f.sent)}</span>
                  <span className="pb-1 text-xs text-muted">opened</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                  <Line label="Sent" value={n(f.sent)} />
                  <Line label="Opened" value={n(f.opened)} />
                  <Line label="Came back to it" value={n(f.cameBack)} />
                  <Line label="Time to open" value={wait(f.medianHoursToOpen)} />
                  {c.kind === "pre-appraisal" ? <Line label="Answered the questions" value={n(data.answered)} /> : null}
                </dl>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted">
          Came back means opened twice or more. Time to open is the middle wait from sending to the first open.
        </p>
      </section>

      {/* ------------------------------- by agent ------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-[15px] text-ink">By Agent</h2>
        {data.agents.length === 0 ? (
          <div className="card p-5 text-[13px] text-muted">No decks or appraisals in {monthLabel(month)}.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-[12.5px] sm:min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Appraisals</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Pre-appraisal</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Appraisal</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Valuation</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Opened</th>
                  <th className="px-4 py-3 text-right font-semibold">Valuations with deck</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((r) => {
                  const decks = r.pre + r.appraisal + r.post;
                  return (
                    <tr key={r.agent} className="border-t border-line">
                      <td className="px-4 py-2.5">
                        <span className="block text-ink">{r.agent}</span>
                        {/* On a phone the deck columns fold in here. */}
                        <span className="mt-1 block text-[11.5px] text-muted sm:hidden">
                          {n(decks)} {decks === 1 ? "deck" : "decks"} · {n(r.opened)} opened · {n(r.appraisals)}{" "}
                          {r.appraisals === 1 ? "appraisal" : "appraisals"}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{n(r.appraisals)}</td>
                      <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{n(r.pre)}</td>
                      <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{n(r.appraisal)}</td>
                      <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{n(r.post)}</td>
                      <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{n(r.opened)}</td>
                      <td className={`px-4 py-2.5 text-right tnum ${r.valuations && r.valuationsWithDeck < r.valuations ? "text-red-700" : "text-ink"}`}>
                        {r.valuations ? `${n(r.valuationsWithDeck)} of ${n(r.valuations)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------ valuations without a deck ------------------------ */}
      <section className="space-y-3">
        <h2 className="text-[15px] text-ink">Valuations without a Deck - {n(data.withoutDeck.length)}</h2>
        {data.withoutDeck.length === 0 ? (
          <div className="card p-5 text-[13px] text-muted">
            {v.total ? "Every valuation this month went out with its deck." : `No valuations recorded in ${monthLabel(month)}.`}
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-[12.5px] sm:min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Property</th>
                  <th className="hidden px-3 py-3 font-semibold sm:table-cell">Agent</th>
                  <th className="hidden px-3 py-3 font-semibold sm:table-cell">Stage</th>
                  <th className="px-4 py-3 text-right font-semibold">Valued</th>
                </tr>
              </thead>
              <tbody>
                {data.withoutDeck.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/market-appraisals/${encodeURIComponent(r.id)}`}
                        className="block text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      >
                        {r.address || "No address"}
                      </Link>
                      {r.hadVisit ? null : <span className="block text-[11px] text-red-700">No visit date - marked {STAGE[r.stage]?.toLowerCase() ?? r.stage} without one</span>}
                      <span className="mt-1 block text-[11.5px] text-muted sm:hidden">
                        {r.agent} · {STAGE[r.stage] ?? r.stage}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink sm:table-cell">{r.agent}</td>
                    <td className="hidden px-3 py-2.5 text-ink sm:table-cell">{STAGE[r.stage] ?? r.stage}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tnum">{day(r.valuedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted">
          We count opens, not which slides a landlord read or for how long. Opening a deck while signed in to the OS never counts.
        </p>
      </section>
    </div>
  );
}
