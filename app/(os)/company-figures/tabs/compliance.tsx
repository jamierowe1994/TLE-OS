"use client";

// Admin tab: Compliance - per certificate type, on the managed book.
//
// Rebuilt 17 Sep 2026 from Susan's notes ("we need the breakdown of compliance
// per category type i.e. Gas, EICR etc and % of portfolio").
//
// The old tab counted every compliance entry REX holds across the account —
// 2,635 items including let-only homes, oil safety and three kinds of HMO
// licence - so its "354 overdue" answered a different question from the
// Compliance page Michael works from. This one reads the same book, under the
// same scope and the same duty rules, through /api/business/compliance-breakdown.
//
// Stock, not flow: REX edits a certificate in place when it is renewed, so a
// past month cannot be rebuilt. Everything here is as at the last read.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import { monthLabel } from "@/lib/business/format";
import { liveMonth } from "@/lib/business/roster";

interface CertRow {
  key: string;
  label: string;
  required: number;
  inDate: number;
  dueSoon: number;
  expired: number;
  noRecord: number;
  compliantPct: number | null;
  portfolioPct: number;
}

interface Breakdown {
  ok: true;
  asAt: string;
  stale: boolean;
  homes: number;
  hmos: number;
  gasHomes: number;
  gasUnanswered: number;
  fullyCompliant: number;
  fullyCompliantPct: number | null;
  withExpired: number;
  withNoRecord: number;
  withDueSoon: number;
  certificates: CertRow[];
}

const LONG_LABEL: Record<string, string> = {
  gas: "Gas Safety",
  eicr: "EICR",
  epc: "EPC",
  licence: "HMO Licence",
  fire: "Fire Risk Assessment",
  pat: "PAT Testing",
  alarms: "Smoke & CO Alarms",
  legionella: "Legionella",
};

const n = (v: number) => v.toLocaleString("en-GB");
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Green from 95%, amber from 85%, red below. Placeholders until Michael sets them. */
const tone = (pct: number | null) =>
  pct == null ? "bg-line" : pct >= 95 ? "bg-green-500" : pct >= 85 ? "bg-amber-400" : "bg-red-500";

function Bar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
      <div className={`h-full rounded-full ${tone(pct)}`} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="stat-value stat-value--big mt-2">{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function CertCard({ row, homes }: { row: CertRow; homes: number }) {
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] text-ink">{LONG_LABEL[row.key] ?? row.label}</h3>
        <span className="text-[11px] text-muted">
          {n(row.required)} homes · {row.portfolioPct}% of portfolio
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="stat-value stat-value--big">{row.compliantPct == null ? "—" : `${row.compliantPct}%`}</span>
        <span className="pb-1 text-xs text-muted">compliant</span>
      </div>
      <div className="mt-2">
        <Bar pct={row.compliantPct} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">In date</dt>
          <dd className="tnum font-semibold text-ink">{n(row.inDate)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Due in 30 days</dt>
          <dd className="tnum font-semibold text-amber-700">{n(row.dueSoon)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Expired</dt>
          <dd className="tnum font-semibold text-red-700">{n(row.expired)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">No record</dt>
          <dd className="tnum font-semibold text-red-700">{n(row.noRecord)}</dd>
        </div>
      </dl>
      {row.key === "gas" && row.required < homes ? (
        <p className="mt-auto pt-3 text-[11px] text-muted">
          The other {n(homes - row.required)} homes have no gas duty.
        </p>
      ) : null}
    </div>
  );
}

export default function ComplianceTab({ month }: { month: string; seed: SeedData }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/business/compliance-breakdown", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && j?.ok) setData(j as Breakdown);
        else setError(j?.error ?? `REX didn't answer (${r.status}).`);
      })
      .catch(() => !cancelled && setError("REX didn't answer."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
        <span className="font-semibold">Compliance couldn&rsquo;t be read.</span> {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card flex items-center gap-3 p-5 text-[13px] text-muted" aria-busy="true">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
        Reading certificates from REX - this takes up to a minute when it hasn&rsquo;t been read recently.
      </div>
    );
  }

  const main = data.certificates.filter((c) => ["gas", "eicr", "epc"].includes(c.key));
  const needAttention = data.homes - data.fullyCompliant;

  return (
    <div className="space-y-6">
      {month !== liveMonth() ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          Everything on this tab is <strong>as at today</strong>, not {monthLabel(month)}. REX
          overwrites a certificate when it is renewed, so a past month can&apos;t be rebuilt.
        </div>
      ) : null}

      {/* ------------------------------ headline ------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-sm font-semibold">Compliance - the Managed Book</h2>
          <span className="text-[11px] text-muted">
            Live from REX and REX PM · read {stamp(data.asAt)}
            {data.stale ? " · refreshing" : ""}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Homes we manage"
            value={n(data.homes)}
            sub={`${n(data.hmos)} HMOs · let only excluded`}
          />
          <Tile
            label="Fully compliant"
            value={data.fullyCompliantPct == null ? "—" : `${data.fullyCompliantPct}%`}
            sub={`${n(data.fullyCompliant)} homes hold every certificate they need`}
          />
          <Tile
            label="Expired certificate"
            value={n(data.withExpired)}
            sub="homes with at least one"
          />
          <Tile
            label="Missing certificate"
            value={n(data.withNoRecord)}
            sub={`homes with no record for at least one · ${n(data.withDueSoon)} due in 30 days`}
          />
        </div>
      </section>

      {/* ---------------------------- the big three ---------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">By Certificate</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {main.map((row) => (
            <CertCard key={row.key} row={row} homes={data.homes} />
          ))}
        </div>
      </section>

      {/* ------------------------------ every type ------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Every Certificate Type</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Certificate</th>
                <th className="px-3 py-3 text-right font-semibold">Homes needing it</th>
                <th className="px-3 py-3 text-right font-semibold">% of portfolio</th>
                <th className="px-3 py-3 text-right font-semibold">In date</th>
                <th className="px-3 py-3 text-right font-semibold">Due 30 days</th>
                <th className="px-3 py-3 text-right font-semibold">Expired</th>
                <th className="px-3 py-3 text-right font-semibold">No record</th>
                <th className="w-40 px-4 py-3 text-right font-semibold">Compliant</th>
              </tr>
            </thead>
            <tbody>
              {data.certificates.map((row) => (
                <tr key={row.key} className="border-t border-line">
                  <td className="px-4 py-2.5 text-ink">
                    {LONG_LABEL[row.key] ?? row.label}
                    {["licence", "fire", "pat", "alarms", "legionella"].includes(row.key) ? (
                      <span className="ml-1.5 text-[11px] text-muted">HMOs only</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tnum">{n(row.required)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{row.portfolioPct}%</td>
                  <td className="px-3 py-2.5 text-right tnum">{n(row.inDate)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{n(row.dueSoon)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{n(row.expired)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{n(row.noRecord)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20">
                        <Bar pct={row.compliantPct} />
                      </div>
                      <span className="w-12 text-right tnum font-semibold text-ink">
                        {row.compliantPct == null ? "—" : `${row.compliantPct}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          Compliant = in date, including those due in the next 30 days. Gas, EICR and EPC are
          required on every home (gas only where there is gas); the rest only on HMOs. Homes let
          only are the landlord&rsquo;s duty and are left out.
          {data.gasUnanswered > 0
            ? ` ${n(data.gasUnanswered)} ${data.gasUnanswered === 1 ? "home has" : "homes have"} no answer yet on whether there is gas.`
            : ""}{" "}
          <Link href="/compliance" className="font-semibold text-ink underline underline-offset-2">
            Open Compliance
          </Link>{" "}
          for the homes behind each figure.
        </p>
      </section>
    </div>
  );
}
