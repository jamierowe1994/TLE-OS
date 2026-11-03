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

/** One expired certificate, from Michael's Outstanding list (the route takes
 *  it from lib/compliance-tracker, so it is his row, not a recount). */
interface ExpiredRow {
  propertyId: string;
  property: string;
  locality: string;
  cert: string;
  certLabel: string;
  daysLeft: number | null;
  agent: string | null;
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
  expired?: ExpiredRow[];
}

/* Susan Liles, 3 Nov 2026: "Can the summary boxes link to a list in Michael's
   view?" Every figure below opens his Property Compliance list at the same
   rows. The counts here and there come from the same book under the same
   rules (isOurs, requiredCerts, and what his tracker holds off Outstanding),
   so the number on the box is the number of rows the link opens. */
const DESK = "/compliance-desk/properties";
const deskHref = (q: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${DESK}?${qs}` : DESK;
};

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
/** "12 days ago", "5 months ago", "2 years ago" - an old record reads in years. */
const agoLabel = (days: number) =>
  days < 1
    ? "today"
    : days < 60
      ? `${days} ${days === 1 ? "day" : "days"} ago`
      : days < 730
        ? `${Math.round(days / 30)} months ago`
        : `${Math.round(days / 365)} years ago`;
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

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
        {href ? <Arrow /> : null}
      </div>
      <div className="stat-value stat-value--big mt-2">{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5 transition-colors hover:border-ink/30" title="Open this list in Michael's view">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

/** A small line arrow - the box opens a list. Icon, never an emoji. */
function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 12 12 4M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A count that opens Michael's list at those rows; plain text at nought. */
function Count({ value, href, className }: { value: number; href: string; className: string }) {
  return value > 0 ? (
    <Link href={href} className={`${className} underline decoration-dotted underline-offset-2 hover:decoration-solid`} title="Open these in Michael's view">
      {n(value)}
    </Link>
  ) : (
    <span className={className}>{n(value)}</span>
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
          <dd>
            <Count value={row.dueSoon} href={deskHref({ tab: "upcoming", cert: row.key })} className="tnum font-semibold text-amber-700" />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Expired</dt>
          <dd>
            <Count value={row.expired} href={deskHref({ status: "expired", cert: row.key })} className="tnum font-semibold text-red-700" />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">No record</dt>
          <dd>
            <Count value={row.noRecord} href={deskHref({ status: "missing", cert: row.key })} className="tnum font-semibold text-red-700" />
          </dd>
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

/* `openHref`: where "Open Compliance" goes. Susan's is the agents' Compliance
   page; on Michael's desk it is his own Property Compliance list. */
export default function ComplianceTab({ month, openHref = "/compliance" }: { month: string; seed?: SeedData | null; openHref?: string }) {
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
  /* Michael's list is one row per certificate, the boxes count homes; both are
     said, so a home with two expired certificates doesn't read as a mismatch. */
  const sum = (k: "expired" | "noRecord" | "dueSoon") => data.certificates.reduce((t, c) => t + c[k], 0);
  const certs = (v: number) => `${n(v)} ${v === 1 ? "certificate" : "certificates"}`;
  const expiredRows = data.expired ?? [];

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Tile
            label="Homes we manage"
            value={n(data.homes)}
            sub={`${n(data.hmos)} HMOs · let only excluded`}
            href={DESK}
          />
          <Tile
            label="Fully compliant"
            value={data.fullyCompliantPct == null ? "—" : `${data.fullyCompliantPct}%`}
            sub={`${n(data.fullyCompliant)} homes hold every certificate they need · ${n(needAttention)} on Michael's list`}
            href={DESK}
          />
          <Tile
            label="Expired certificate"
            value={n(data.withExpired)}
            sub={`homes with at least one · ${certs(sum("expired"))}`}
            href={deskHref({ status: "expired" })}
          />
          <Tile
            label="Missing certificate"
            value={n(data.withNoRecord)}
            sub={`homes with no record for at least one · ${certs(sum("noRecord"))}`}
            href={deskHref({ status: "missing" })}
          />
          <Tile
            label="Due in 30 days"
            value={n(data.withDueSoon)}
            sub={`homes with one running out · ${certs(sum("dueSoon"))}`}
            href={deskHref({ tab: "upcoming" })}
          />
        </div>
      </section>

      {/* ------------------------- the expired ones -------------------------
          Susan Liles, 3 Nov 2026: "Is there an option to see the actual
          expired ones on here and who is the agent?" Michael's own rows. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-sm font-semibold">Expired Certificates - {n(expiredRows.length)}</h2>
          {expiredRows.length ? (
            <Link href={deskHref({ status: "expired" })} className="text-[12px] font-semibold text-ink underline underline-offset-2">
              Open in Michael&rsquo;s view
            </Link>
          ) : null}
        </div>
        {data.expired == null ? (
          <p className="text-[12px] text-red-700">The list of expired certificates couldn&rsquo;t be read just now. Refresh in a minute.</p>
        ) : expiredRows.length === 0 ? (
          <div className="card p-5 text-[13px] text-muted">Nothing has expired on the homes we manage.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-[12.5px] sm:min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Property</th>
                  <th className="hidden px-3 py-3 font-semibold sm:table-cell">Certificate</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Expired</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Agent</th>
                </tr>
              </thead>
              <tbody>
                {expiredRows.map((r) => (
                  <tr key={`${r.propertyId}-${r.cert}`} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="block text-ink">{r.property}</span>
                      {r.locality ? <span className="block text-[11px] text-muted">{r.locality}</span> : null}
                      {/* On a phone the other three columns fold in here, so
                          the agent is never off the side of the screen. */}
                      <span className="mt-1 block text-[11.5px] sm:hidden">
                        <span className="text-ink">{LONG_LABEL[r.cert] ?? r.certLabel}</span>
                        {r.daysLeft == null ? null : <span className="text-red-700"> · {agoLabel(-r.daysLeft)}</span>}
                        <span className="text-muted"> · {r.agent ?? "No agent on record"}</span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink sm:table-cell">{LONG_LABEL[r.cert] ?? r.certLabel}</td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tnum text-red-700 sm:table-cell">
                      {r.daysLeft == null ? "-" : agoLabel(-r.daysLeft)}
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      {r.agent ? (
                        <Link
                          href={deskHref({ status: "expired", agent: r.agent })}
                          className="text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          title={`${r.agent}'s expired certificates in Michael's view`}
                        >
                          {r.agent}
                        </Link>
                      ) : (
                        <span className="text-red-700">No agent on record</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  <td className="px-3 py-2.5 text-right">
                    <Count value={row.dueSoon} href={deskHref({ tab: "upcoming", cert: row.key })} className="tnum" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Count value={row.expired} href={deskHref({ status: "expired", cert: row.key })} className="tnum" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Count value={row.noRecord} href={deskHref({ status: "missing", cert: row.key })} className="tnum" />
                  </td>
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
          only are the landlord&rsquo;s duty and are left out. Anything Michael&rsquo;s list holds off
          Outstanding - a licence renewal with the council, a Scottish EPC or legionella held to the
          next tenancy, a certificate with the compliance team or on file waiting for its date - is
          not counted expired or missing here either.
          {data.gasUnanswered > 0
            ? ` ${n(data.gasUnanswered)} ${data.gasUnanswered === 1 ? "home has" : "homes have"} no answer yet on whether there is gas.`
            : ""}{" "}
          <Link href={openHref} className="font-semibold text-ink underline underline-offset-2">
            Open Compliance
          </Link>{" "}
          for the homes behind each figure.
        </p>
      </section>
    </div>
  );
}
