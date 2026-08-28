"use client";

// Admin tab: Portfolio — overview cards + portfolio-by-partner table.
// PayProp is the source system; no API access yet, so everything is the
// 11 Jul 2026 snapshot. (No portfolio growth time series exists in the
// snapshot, so no growth chart is rendered.)

import { useEffect, useState } from "react";
import StatCard from "@/components/business/StatCard";
import SourceNote from "@/components/business/SourceNote";
import DataTable, { type DataTableColumn } from "@/components/business/DataTable";
import type { SeedData } from "@/lib/business/seed-data"; // type-only — erased at build
import type { PortfolioRow } from "@/lib/business/seed-types";
import { formatGBP, monthLabel } from "@/lib/business/format";
import { liveMonth } from "@/lib/business/roster";

const COLUMNS: DataTableColumn<PortfolioRow & Record<string, unknown>>[] = [
  {
    key: "agent",
    label: "Partner",
    render: (r) => (
      <span className={r.agent === "TOTAL" ? "font-semibold" : undefined}>{r.agent}</span>
    ),
  },
  { key: "managed", label: "Managed", align: "right" },
  { key: "letOnly", label: "Let only", align: "right" },
  {
    key: "total",
    label: "Total",
    align: "right",
    render: (r) => <span className="font-semibold">{r.total.toLocaleString("en-GB")}</span>,
  },
  { key: "rlpLec", label: "RLP / LEC", align: "right" },
  {
    key: "rentRoll",
    label: "Rent roll",
    align: "right",
    render: (r) => (r.rentRoll == null ? "—" : formatGBP(r.rentRoll)),
  },
  {
    key: "avgRent",
    label: "Avg rent",
    align: "right",
    render: (r) => (r.avgRent == null ? "—" : formatGBP(r.avgRent)),
  },
];

const LIVE_PARTNER_COLUMNS = [
  { key: "partner", label: "Partner" },
  { key: "managed", label: "Managed", align: "right" as const },
  { key: "letOnly", label: "Let only", align: "right" as const },
  {
    key: "total",
    label: "Total",
    align: "right" as const,
    render: (r: Record<string, unknown>) => (
      <span className="font-semibold">{(r.total as number).toLocaleString("en-GB")}</span>
    ),
  },
  {
    key: "rentRoll",
    label: "Rent roll",
    align: "right" as const,
    render: (r: Record<string, unknown>) =>
      r.rentRoll == null ? "—" : formatGBP(r.rentRoll as number),
  },
  {
    key: "avgRent",
    label: "Avg rent",
    align: "right" as const,
    render: (r: Record<string, unknown>) =>
      r.avgRent == null ? "—" : formatGBP(r.avgRent as number),
  },
];

interface LiveBook {
  totalProperties: number;
  totalRentRoll: number;
  avgRent: number;
  vacant: number;
  tenanted: number;
  byServiceLevel: Array<{ level: string; properties: number; rentRoll: number }>;
  byAccount: Array<{ account: string; label: string; properties: number; rentRoll: number; avgRent: number }>;
  unattributed: number;
  accounts: string[];
  byAgent: Record<
    string,
    {
      names: string[];
      properties: number;
      rentRoll: number;
      activeTenancies: number;
      /** This partner's own split, e.g. { "Fully managed": 12, "Let only": 5 }.
       *  Always been on the wire; the tab simply never declared it. */
      serviceLevels?: Record<string, number>;
    }
  >;
}

export default function PortfolioTab({ month, seed }: { month: string; seed: SeedData }) {
  // The managed book, live from PayProp across both agencies. Gathered in the
  // background, so poll until it lands rather than blocking the tab.
  const [live, setLive] = useState<LiveBook | null>(null);
  /** Rent protection, from PayProp's property tags. See lib/payprop-tags. */
  const [protBook, setProtBook] = useState<{
    agencies: { account: string; withRlp: number | null; withoutRlp: number | null; error: string | null }[];
    withRlp: number;
    withoutRlp: number;
    unreadable: string[];
  } | null>(null);
  const [arrearsCount, setArrearsCount] = useState<number | null>(null);
  const [renewals, setRenewals] = useState<number | null>(null);

  // "Renewals due" is certificates coming up for renewal — a REX figure, not
  // a PayProp one, so it comes from the compliance sweep.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/business/protection", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !cancelled && d?.agencies && setProtBook(d))
      .catch(() => {
        /* The snapshot still stands. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const ask = () => {
      fetch("/api/business/compliance-live", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { compliance?: { upcoming: number } | null }) => {
          if (cancelled) return;
          if (d.compliance) setRenewals(d.compliance.upcoming);
          else if (tries++ < 40) setTimeout(ask, 5000);
        })
        .catch(() => {});
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const ask = () => {
      fetch("/api/business/payprop-live", { cache: "no-store" })
        .then((r) => r.json())
        .then(
          (d: {
            portfolio?: LiveBook | null;
            arrears?: { tenants: unknown[] } | null;
          }) => {
            if (cancelled) return;
            if (d.portfolio) setLive(d.portfolio);
            if (d.arrears) setArrearsCount(d.arrears.tenants.length);
            if ((!d.portfolio || !d.arrears) && tries++ < 40) setTimeout(ask, 5000);
          }
        )
        .catch(() => {});
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, []);

  const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

  /** Sum the service levels whose name matches — PayProp's own wording varies. */
  function serviceStat(b: LiveBook, match: RegExp) {
    const hits = b.byServiceLevel.filter((l) => match.test(l.level));
    if (hits.length === 0) return undefined;
    return {
      value: hits.reduce((n, l) => n + l.properties, 0),
      source: "live-payprop" as const,
      note: hits.map((l) => `${l.level}: ${l.properties}`).join(" · "),
    };
  }

  function accountAvg(b: LiveBook, label: string) {
    const a = b.byAccount.find((x) => x.label === label);
    if (!a || !a.properties) return null;
    return {
      value: Math.round(a.avgRent),
      display: gbp(a.avgRent),
      source: "live-payprop" as const,
      note: `${gbp(a.rentRoll)} across ${a.properties} properties.`,
    };
  }
  /* Only report protection when at least one agency actually answered. Zero
     from a refused call would read as "nobody is protected". */
  const prot =
    protBook && (protBook.withRlp > 0 || protBook.withoutRlp > 0) ? protBook : null;
  const protReadable = (protBook?.agencies ?? [])
    .filter((a) => !a.error)
    .map((a) => (a.account === "uk" ? "E&W" : a.account === "scotland" ? "Scotland" : a.account));
  const protBlocked = (protBook?.unreadable ?? []).map((a) =>
    a === "uk" ? "E&W" : a === "scotland" ? "Scotland" : a
  );
  /* Appended to every note, so a figure lifted out of context still says which
     part of the business it describes. */
  const protShort = protBlocked.length ? ` · ${protReadable.join(" and ")} only` : "";

  const agents = live
    ? Object.entries(live.byAgent)
        .map(([, b]) => b)
        .sort((a, b) => b.properties - a.properties)
    : [];

  const p = seed.portfolio;
  const o = p.overview;
  /* Portfolio by partner, live.
     Everything except RLP/LEC is already in the PayProp book — the managed /
     let-only split comes from each partner's own serviceLevels, which the walk
     has always collected and this tab simply never read.

     RLP/LEC is NOT carried. It appears in no PayProp service level, no Propoly
     service level (censused across all 575 completed deals: full_managed,
     tenant_find, rent_collect and nothing else) and no readable fee category.
     The old column was typed by a person. A column we cannot source is dropped
     and said so, rather than shown half-full. */
  const livePartnerRows = live
    ? Object.values(live.byAgent)
        .map((b) => {
          const lv = b.serviceLevels ?? {};
          const count = (re: RegExp) =>
            Object.entries(lv)
              .filter(([k]) => re.test(k))
              .reduce((n, [, v]) => n + v, 0);
          return {
            partner: b.names[0] ?? "—",
            managed: count(/managed|efm/i),
            letOnly: count(/let\s*only/i),
            total: b.properties,
            rentRoll: b.rentRoll,
            avgRent: b.properties ? b.rentRoll / b.properties : null,
          };
        })
        .sort((a, b) => b.total - a.total)
    : [];
  const liveTotals = live
    ? {
        partner: "TOTAL",
        managed: livePartnerRows.reduce((n, r) => n + r.managed, 0),
        letOnly: livePartnerRows.reduce((n, r) => n + r.letOnly, 0),
        total: livePartnerRows.reduce((n, r) => n + r.total, 0),
        rentRoll: livePartnerRows.reduce((n, r) => n + r.rentRoll, 0),
        avgRent: null,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Source banner */}
      {live ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <span className="font-semibold">Live from PayProp</span> —{" "}
          {live.totalProperties.toLocaleString("en-GB")} managed properties across{" "}
          {live.accounts.length === 2 ? "both agencies" : live.accounts.join(", ")}, worth{" "}
          <span className="font-semibold">{gbp(live.totalRentRoll)}</span> a month.
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <span className="font-semibold">Fetching the live book from PayProp…</span>{" "}
          Nothing shown until it lands — the walk takes a moment cold.
        </div>
      )}

      {live ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Managed book — live</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Managed properties
              </div>
              <div className="stat-value mt-1 text-[26px]">{live.totalProperties}</div>
            </div>
            <div className="card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Rent under management
              </div>
              <div className="stat-value mt-1 text-[26px]">{gbp(live.totalRentRoll)}</div>
              <div className="mt-0.5 text-[11px] text-muted">per month</div>
            </div>
            <div className="card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Partners with a book
              </div>
              <div className="stat-value mt-1 text-[26px]">{agents.length}</div>
            </div>
            <div className="card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Unattributed
              </div>
              <div className="stat-value mt-1 text-[26px]">{live.unattributed}</div>
              <div className="mt-0.5 text-[11px] text-muted">
                On TLE / Admin / blank in PayProp
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-[13px] font-semibold">By responsible agent</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="pb-2 font-semibold">Agent</th>
                    <th className="pb-2 text-right font-semibold">Properties</th>
                    <th className="pb-2 text-right font-semibold">Tenancies</th>
                    <th className="pb-2 text-right font-semibold">Rent / month</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.names.join("|")} className="border-t border-line">
                      <td className="py-2">{a.names.join(" / ")}</td>
                      <td className="py-2 text-right tnum">{a.properties}</td>
                      <td className="py-2 text-right tnum">{a.activeTenancies}</td>
                      <td className="py-2 text-right tnum">{gbp(a.rentRoll)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Grouped on PayProp&rsquo;s own <code>responsible_agent</code> field.
              Spelling variants of one person are merged; anything that
              can&rsquo;t be resolved to a single partner is left unattributed
              rather than guessed at.
            </p>
          </div>
        </section>
      ) : null}

      {/* This tab reads a STOCK, not a flow. PayProp and Rex both export
          current state and neither keeps a history, so "as it stood in June"
          cannot be rebuilt — only invented. The month selector above does not
          change these figures, and saying so is the whole point of this
          banner: the old wording implied they were a July capture, which made
          a live read look stale AND made a past month look answerable. */}
      {month !== liveMonth() ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          Everything below is <strong>as at today</strong>, not {monthLabel(month)}. These are
          current-state figures — neither PayProp nor Rex stores a history of them, so a past
          month can&apos;t be rebuilt. Live figures carry their own date; anything still on the
          snapshot is badged and dated 11 Jul 2026.
        </div>
      ) : null}

      {/* Overview */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Portfolio overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total properties"
            stat={
              live
                ? { value: live.totalProperties, source: "live-payprop", note: "Active properties in PayProp across both agencies." }
                : o.total
            }
            big
            sub={
              live
                ? live.byAccount.map((a) => `${a.label} ${a.properties}`).join(" · ")
                : `E&W ${o.eAndWTotal.value ?? "—"} · Glasgow ${o.glasgowTotal.value ?? "—"}`
            }
          />
          <StatCard
            label="Managed"
            stat={(live ? serviceStat(live, /managed/i) : null) ?? o.totalManaged}
            big
            sub={
              live
                ? "By PayProp service level"
                : `E&W ${o.eAndWManaged.value ?? "—"} · Glasgow ${o.glasgowManaged.value ?? "—"}`
            }
          />
          <StatCard
            label="Let only"
            stat={(live ? serviceStat(live, /let\s*only|tenant\s*find/i) : null) ?? o.eAndWLetOnly}
            sub={live ? "By PayProp service level" : "All E&W — Glasgow has 0 let-only"}
          />
          <StatCard
            label="Monthly rent roll"
            stat={
              live
                ? { value: Math.round(live.totalRentRoll), display: gbp(live.totalRentRoll), source: "live-payprop", note: `Across ${live.totalProperties} properties — average ${gbp(live.avgRent)}.` }
                : o.rentRollTotal
            }
            big
            sub={
              live
                ? live.byAccount.map((a) => `${a.label} ${gbp(a.rentRoll)}`).join(" · ")
                : `E&W ${o.rentRollEAndW.display ?? "—"} · Glasgow ${o.rentRollGlasgow.display ?? "—"}`
            }
          />
        </div>
      </section>

      {live ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Service levels — live</h2>
          <div className="card p-5">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2 font-semibold">Service level (as PayProp records it)</th>
                  <th className="pb-2 text-right font-semibold">Properties</th>
                  <th className="pb-2 text-right font-semibold">Rent / month</th>
                </tr>
              </thead>
              <tbody>
                {live.byServiceLevel.map((l) => (
                  <tr key={l.level} className="border-t border-line">
                    <td className="py-2">{l.level}</td>
                    <td className="py-2 text-right tnum">{l.properties}</td>
                    <td className="py-2 text-right tnum">{gbp(l.rentRoll)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-muted">
              PayProp&rsquo;s service level never mentions protection — it is only ever
              Fully managed, Let only or Rent collect. Rent protection is a{" "}
              <span className="font-semibold">tag on the property</span>, read separately
              below.
            </p>
          </div>
        </section>
      ) : null}

      {/* Rent protection — from PayProp's TAGS, not the service level.

          The service level never mentions protection: PayProp's own wording is
          only ever "Fully managed", "Let only" or "Rent collect", so the
          heuristic below it could never match and the typed seed showed
          through. The record is a tag on the property. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Managed — rent protection</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="No protection"
            stat={
              prot
                ? {
                    value: prot.withoutRlp,
                    source: "live-payprop",
                    note: `Tagged "Experts Managed Service No RLP"${protShort}.`,
                  }
                : o.noProtection
            }
          />
          <StatCard
            label="With RLP"
            stat={
              prot
                ? {
                    value: prot.withRlp,
                    source: "live-payprop",
                    note: `Tagged "Experts Managed Service with RLP"${protShort}.`,
                  }
                : o.withRlp
            }
          />
          {/* No LEC tag exists anywhere we can read, so this stays on the
              snapshot rather than being reported as zero. Zero would say
              "nobody has LEC", which is a different and unevidenced claim. */}
          <StatCard label="With LEC" stat={o.withLec} sub="no tag for this — snapshot" />
          <StatCard
            label="Protected %"
            stat={
              prot && prot.withRlp + prot.withoutRlp > 0
                ? (() => {
                    const total = prot.withRlp + prot.withoutRlp;
                    const pctVal = (prot.withRlp / total) * 100;
                    return {
                      value: Math.round(pctVal * 10) / 10,
                      display: `${pctVal.toFixed(1)}%`,
                      source: "live-payprop" as const,
                      note: `${prot.withRlp} of ${total} tagged properties${protShort}.`,
                    };
                  })()
                : o.protectedPct
            }
            sub="of tagged portfolio"
          />
        </div>

        {/* The missing agency, named. A total that silently omits the larger
            book is worse than no total, and E&W is 503 of 587 properties. */}
        {protBlocked.length > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] leading-relaxed text-amber-800">
            <span className="font-semibold">
              These figures are {protReadable.join(" and ") || "partial"} only.
            </span>{" "}
            {protBlocked.join(" and ")} refused the tags call — the OAuth consent is
            missing <code>read:entity:tags</code>. Re-authorise that agency on the
            deployed site and the rest fills in by itself. It must be done there, not
            locally: there is one refresher and rotating its token breaks live E&amp;W.
          </p>
        )}
      </section>

      {/* Rents + health */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Rents &amp; portfolio health</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Avg rent — E&W"
            stat={live ? accountAvg(live, "E&W") ?? o.avgRentEAndW : o.avgRentEAndW}
          />
          <StatCard
            label="Avg rent — Glasgow"
            stat={live ? accountAvg(live, "Glasgow") ?? o.avgRentGlasgow : o.avgRentGlasgow}
          />
          <StatCard
            label="Vacant"
            stat={
              live
                ? { value: live.vacant, source: "live-payprop", note: `Properties with no tenancy running; ${live.tenanted} are tenanted.` }
                : o.vacant
            }
          />
          <StatCard
            label="Renewals due"
            stat={
              renewals != null
                ? { value: renewals, source: "live-rex", note: "Compliance certificates expiring within 60 days, across the account." }
                : o.renewals
            }
            sub={renewals != null ? "Next 60 days" : undefined}
          />
          <StatCard
            label="In arrears"
            stat={
              arrearsCount != null
                ? { value: arrearsCount, source: "live-payprop", note: "Tenancies currently in debit across both agencies." }
                : o.arrears
            }
            sub="See Arrears tab (admin only)"
          />
        </div>
      </section>

      {/* By partner */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Portfolio by partner{" "}
          {live ? `— live (${livePartnerRows.length} partners)` : ""}
          <SourceNote tone={live ? "live" : "unavailable"}>
            {live
              ? "PayProp portfolio walk, both agencies, as it stands today. Managed and let-only come from each partner's own service-level split; average rent is worked out per partner rather than blended down from the whole book."
              : "The live PayProp book has not answered yet."}
          </SourceNote>
        </h2>
        {/* No seed fallback. It rendered the June book under a live heading
            while PayProp was still walking, so the table looked finished and
            was a month out. A wait that says it is waiting is better. */}
        {live && liveTotals ? (
          <>
            <DataTable
              columns={LIVE_PARTNER_COLUMNS}
              rows={[...livePartnerRows, liveTotals]}
              compact
            />
            <p className="text-xs text-muted">
              RLP / LEC is not shown. It appears in no PayProp service level, no
              Propoly service level and no fee category we can read — the column on
              the old table was typed by hand, so there is nothing to pull it from.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">Waiting on PayProp for the partner split.</p>
        )}
      </section>
    </div>
  );
}
