"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { MA_STAGES } from "@/lib/market-appraisal";

/**
 * WHAT THE APPRAISAL LEARNED, ON THE LISTING (James, 10 Nov 2026: "We need to
 * make sure that all notes, everything, is brought forward").
 *
 * The valuation and its note, the fee and service agreed, what the agent
 * wrote about the landlord and the home, the property facts and every paper
 * the landlord sent - read from the appraisal and its lead each time the
 * listing opens (/api/listings/appraisal), never copied, so a correction on
 * the lead shows here at once.
 */

export type AppraisalPaper = { key: string; type: string; label: string; name: string; at: string | null; how: string; url: string | null };

export type ListingAppraisalData = {
  id: string;
  leadId: string | null;
  stage: string;
  address: string;
  agent: string | null;
  appointmentAt: string | null;
  valuation: number | null;
  valuationNote: string | null;
  valuedAt: string | null;
  valuedBy: string | null;
  feePct: number | null;
  setupFee: number | null;
  otherFees: string | null;
  serviceLevel: string | null;
  termsSentAt: string | null;
  landlord: { name: string; email: string | null; phone: string | null; notes: string | null } | null;
  facts: Array<{ label: string; value: string }>;
  notes: Array<{ at: string; by: string | null; kind: string; body: string }>;
  papers: AppraisalPaper[];
};

export type AppraisalState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "problem"; says: string }
  | { status: "known"; appraisal: ListingAppraisalData };

/** The appraisal behind a listing, asked once and shared by its sections. */
export function useListingAppraisal(listingId: string | number | null | undefined): AppraisalState {
  const [state, setState] = useState<AppraisalState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    if (!(Number(listingId) > 0)) {
      setState({ status: "none" });
      return;
    }
    fetch(`/api/listings/appraisal?id=${encodeURIComponent(String(listingId))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; appraisal?: ListingAppraisalData | null; error?: string }) => {
        if (!live) return;
        if (!j.ok) setState({ status: "problem", says: j.error ?? "The appraisal behind this listing did not load." });
        else setState(j.appraisal ? { status: "known", appraisal: j.appraisal } : { status: "none" });
      })
      .catch(() => live && setState({ status: "problem", says: "The appraisal behind this listing did not load." }));
    return () => {
      live = false;
    };
  }, [listingId]);
  return state;
}

const KIND: Record<string, string> = {
  call: "Call", text: "Text", whatsapp: "WhatsApp", email: "Email", visit: "Visit", note: "Note",
  nurture: "Nurture", rejoin: "Back in touch", lost: "Lost", moved: "Moved",
};
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : null;
const money = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function ListingAppraisal({ state, look }: { state: AppraisalState; look: "new" | "classic" }) {
  const [allNotes, setAllNotes] = useState(false);
  const nl = look === "new";
  const title = nl ? "nl-block-title" : "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
  const meta = nl ? "nl-meta" : "text-[12px] text-muted";
  const label = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted";

  if (state.status === "loading") {
    return (
      <div data-appraisal-on-listing>
        <h3 className={title}>From the Appraisal</h3>
        <p className={`${meta} mt-2 flex items-center gap-2`}>
          <span aria-hidden className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />
          Reading the market appraisal…
        </p>
      </div>
    );
  }
  if (state.status === "problem") {
    return (
      <div data-appraisal-on-listing>
        <h3 className={title}>From the Appraisal</h3>
        <p className="mt-2 text-[12.5px] text-accent-dark">{state.says}</p>
      </div>
    );
  }
  if (state.status === "none") {
    return (
      <div data-appraisal-on-listing>
        <h3 className={title}>From the Appraisal</h3>
        <p className={`${meta} mt-2`}>No market appraisal in the OS for this home, so there is nothing to bring across.</p>
      </div>
    );
  }

  const a = state.appraisal;
  const stage = MA_STAGES.find((s) => s.id === a.stage)?.label ?? a.stage;
  const figures: Array<{ k: string; v: string }> = [
    { k: "Valued at", v: a.valuation != null ? `${money(a.valuation)} pcm` : "Not valued" },
    { k: "Fee", v: a.feePct != null ? `${a.feePct}%` : "Not set" },
    { k: "Set-up fee", v: a.setupFee != null ? money(a.setupFee) : "Not set" },
    { k: "Service", v: a.serviceLevel ?? "Not set" },
  ];
  const notes = allNotes ? a.notes : a.notes.slice(0, 3);
  const by = [a.valuedBy ? `valued by ${a.valuedBy}` : a.agent ? `with ${a.agent}` : null, day(a.valuedAt ?? a.appointmentAt)].filter(Boolean).join(", ");

  return (
    <div data-appraisal-on-listing className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className={title}>From the Appraisal</h3>
          <p className={`${meta} mt-0.5`}>
            {stage}
            {by ? ` - ${by}` : ""}
          </p>
        </div>
        <Link href={`/market-appraisals/${encodeURIComponent(a.id)}`} className={nl ? "nl-link" : "text-[12px] font-semibold text-accent-dark hover:underline"}>
          Open the appraisal
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {figures.map((f) => (
          <div key={f.k} className="min-w-0">
            <dt className={label}>{f.k}</dt>
            <dd className="mt-0.5 text-[14px] font-medium text-ink">{f.v}</dd>
          </div>
        ))}
      </dl>
      {a.otherFees && (
        <p className="text-[12.5px] text-ink"><span className={label}>Other fees </span>{a.otherFees}</p>
      )}

      {a.valuationNote && (
        <div>
          <p className={label}>Valuation note</p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink">{a.valuationNote}</p>
        </div>
      )}

      {a.landlord?.notes && (
        <div>
          <p className={label}>About {a.landlord.name.split(/\s+/)[0]}</p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink">{a.landlord.notes}</p>
        </div>
      )}

      {a.facts.length > 0 && (
        <div>
          <p className={label}>The home</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {a.facts.map((f) => (
              <li key={f.label} className="rounded-full border border-line/60 bg-page px-2.5 py-1 text-[12px] text-ink">
                <span className="text-muted">{f.label}: </span>{f.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className={label}>Notes from the lead</p>
        {a.notes.length === 0 ? (
          <p className={`${meta} mt-1`}>No notes were written on the lead.</p>
        ) : (
          <>
            <ul className="mt-1.5 flex flex-col gap-2">
              {notes.map((n, i) => (
                <li key={`${n.at}-${i}`} className="rounded-xl bg-page px-3 py-2">
                  <p className="text-[11.5px] text-muted">{[KIND[n.kind] ?? n.kind, day(n.at), n.by].filter(Boolean).join(" - ")}</p>
                  <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-ink">{n.body}</p>
                </li>
              ))}
            </ul>
            {a.notes.length > 3 && (
              <button type="button" onClick={() => setAllNotes((v) => !v)} className={`mt-1.5 ${nl ? "nl-link" : "text-[12px] font-semibold text-accent-dark hover:underline"}`}>
                {allNotes ? "Show fewer" : `Show all ${a.notes.length} notes`}
              </button>
            )}
          </>
        )}
      </div>

      <div>
        <p className={label}>Papers from the appraisal</p>
        {a.papers.length === 0 ? (
          <p className={`${meta} mt-1`}>Nothing was uploaded on the appraisal or its lead.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line/40">
            {a.papers.map((p) => {
              const body = (
                <>
                  <DoodleIcon name="doc" size={14} className="shrink-0 text-accent-dark" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{p.label}</span>
                    <span className="block truncate text-[11.5px] text-muted">{[p.name, p.how, day(p.at)].filter(Boolean).join(" - ")}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] font-semibold text-accent-dark">{p.url ? "Open" : "Held by the office"}</span>
                </>
              );
              return (
                <li key={p.key}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 transition-colors hover:bg-page">{body}</a>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
