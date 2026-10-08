"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PassportScene from "@/components/PassportScene";
import { EMPTY_PASSPORT, isEmployed, isTrading, type PassportData } from "@/lib/passport-shape";

/**
 * A TENANT'S PASSPORT, AS A LIST (James, 8 Oct 2026).
 *
 * "When the agent views the passport, give it in a nice list format: a
 * pop-out ... the ID at the top, showing the back and forth, and then just a
 * list of all their answers below, rather than having to go through the
 * process as if it's a passport already."
 *
 * The card at the top is the tenant's own passport card - drag it or tap it
 * to turn it over. Below, every answer in plain rows, grouped the way an
 * agent reads a file. Read only, from GET /api/tenant/passport/answers.
 */

type Answer = { ok?: boolean; error?: string; name?: string; email?: string; submittedAt?: string | null; updatedAt?: string; householdIncome?: number | null; data?: PassportData };

const yn = (b: boolean | null | undefined) => (b == null ? null : b ? "Yes" : "No");
const money = (s: string | number | null | undefined) => {
  const n = Number(String(s ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? `£${Math.round(n).toLocaleString("en-GB")}` : null;
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const dob = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : s || null);
const month = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? new Date(`${s}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : s || null);

function groups(d: PassportData, household: number | null): { title: string; rows: [string, string | null][] }[] {
  return [
    {
      title: "Who they are",
      rows: [
        ["Legal name", d.legalName || null],
        ["Known as", d.knownAs || null],
        ["Date of birth", dob(d.dob)],
        ["Nationality", d.nationality || null],
        ["Email", d.email || null],
        ["Mobile", d.mobile || null],
      ],
    },
    {
      title: "Right to rent",
      rows: [
        ["British or Irish passport", yn(d.hasBritishPassport)],
        ...(d.hasBritishPassport === false ? ([["Share code", d.shareCode || null]] as [string, string | null][]) : []),
      ],
    },
    {
      title: "Work and money",
      rows: [
        ["What they do", d.applicantType || null],
        /* Only the questions the passport asked them, by what they do. */
        ...(isEmployed(d)
          ? ([
              ["Hours", d.workHours || null],
              ["Zero-hours contract", yn(d.zeroHours)],
              ["On probation", yn(d.onProbation)],
            ] as [string, string | null][])
          : []),
        ...(isTrading(d) ? ([["Trading for", d.tradingFor || null]] as [string, string | null][]) : []),
        ["Their income, a year", money(d.annualIncome)],
        ["Household income, a year", money(household)],
        ["Savings", money(d.savings)],
      ],
    },
    {
      title: "Who is moving in",
      rows: [
        ["Adults", d.numAdults || null],
        ["Children", d.numChildren || null],
        ["Other adults' incomes", d.coOccupantIncomes || null],
      ],
    },
    {
      title: "Where they live now",
      rows: [
        ["Current address", d.currentAddress || null],
        ["Moved in", month(d.movedIn)],
        ["Three years there", yn(d.livedThreeYears)],
        ...(d.livedThreeYears === false ? ([["Previous address", d.previousAddress || null]] as [string, string | null][]) : []),
        ["Rented in the last 12 months", yn(d.rentedLast12Months)],
        ["Rent paid on time", yn(d.rentOnTime)],
        ["Landlord reference", yn(d.landlordRef)],
      ],
    },
    {
      title: "Everything else",
      rows: [
        ["Adverse credit", yn(d.adverseCredit)],
        ...(d.adverseCredit ? ([["About it", d.adverseCreditNote || null]] as [string, string | null][]) : []),
        ["Guarantor available", yn(d.guarantor)],
        ["Pets", d.pets ? d.petsNote || "Yes" : yn(d.pets)],
        ["Smoker", yn(d.smoker)],
      ],
    },
  ];
}

export default function PassportAnswers({ email, name, onClose }: { email: string | null; name?: string; onClose: () => void }) {
  const [a, setA] = useState<Answer | null>(null);

  useEffect(() => {
    if (!email) return;
    setA(null);
    let live = true;
    fetch(`/api/tenant/passport/answers?email=${encodeURIComponent(email)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Answer) => live && setA(j))
      .catch(() => live && setA({ ok: false, error: "The passport didn't load. Try again." }));
    return () => {
      live = false;
    };
  }, [email]);

  useEffect(() => {
    if (!email) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [email, onClose]);

  if (!email) return null;
  const d: PassportData = { ...EMPTY_PASSPORT, ...(a?.data ?? {}) };

  return createPortal(
    <div className="fixed inset-0 z-[150]" data-steve-never>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/40" />
      <aside className="fade-up absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] sm:rounded-l-[22px]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Tenant passport</p>
            <h2 className="mt-0.5 truncate text-[19px] leading-tight">{a?.name || name || email}</h2>
            <p className="mt-0.5 text-[12px]">
              {a?.ok ? (
                a.submittedAt ? (
                  <span className="font-semibold text-accent-dark">Passport done · {day(a.submittedAt)}</span>
                ) : (
                  <span className="text-muted">Not finished yet{a.updatedAt ? ` · last touched ${day(a.updatedAt)}` : ""}</span>
                )
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {a === null ? (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Opening their passport…
            </p>
          ) : !a.ok ? (
            <p className="rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12.5px] text-[#9d4340]">{a.error ?? "The passport didn't load."}</p>
          ) : (
            <>
              {/* The card, front and back: drag it or tap it to turn it over. */}
              <div className="h-[300px]">
                <PassportScene data={d} focus={null} side="front" />
              </div>
              <p className="-mt-1 text-center text-[11px] text-muted">Drag or tap the card to see the back.</p>

              {groups(d, a.householdIncome ?? null).map((g) => (
                <section key={g.title} className="mt-5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</p>
                  <dl className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
                    {g.rows.map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 border-b border-line/40 px-4 py-2.5 last:border-b-0">
                        <dt className="text-[12.5px] text-muted">{label}</dt>
                        <dd className={`min-w-0 break-words text-[13px] ${value ? "font-semibold" : "text-muted/70"}`}>{value ?? "Not answered"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
