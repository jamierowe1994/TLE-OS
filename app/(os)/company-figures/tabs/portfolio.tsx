"use client";

// Admin tab: Portfolio — the book in summary boxes (total, managed, let only,
// rent collect, RLP), each split England & Wales / Scotland, then rents and
// health, then the partner table. Everything is live from PayProp.
//
// Rebuilt 17 Sep 2026 from Susan's notes: the "Managed book — live" block at
// the top repeated the partner table below it, and the rent protection row
// ("No protection 69") was Scotland alone under a business-wide heading. The
// summary now answers her question in one row: how big is the book, how much
// of it is managed, and how much of the managed book is on RLP.

import { useEffect, useState } from "react";
import StatCard from "@/components/business/StatCard";
import SourceNote from "@/components/business/SourceNote";
import DataTable from "@/components/business/DataTable";
import type { SeedData } from "@/lib/business/seed-data"; // type-only — erased at build
import { formatGBP, monthLabel } from "@/lib/business/format";
import { liveMonth } from "@/lib/business/roster";

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

type Account = "uk" | "scotland";

interface LiveBook {
  totalProperties: number;
  totalRentRoll: number;
  avgRent: number;
  byServiceLevel: Array<{ level: string; properties: number; rentRoll: number }>;
  byAccount: Array<{
    account: string;
    label: string;
    properties: number;
    rentRoll: number;
    avgRent: number;
    serviceLevels?: Record<string, number>;
  }>;
  unattributed: number;
  accounts: string[];
  byAgent: Record<
    string,
    {
      names: string[];
      properties: number;
      rentRoll: number;
      activeTenancies: number;
      serviceLevels?: Record<string, number>;
    }
  >;
}

interface Protection {
  agencies: { account: string; withRlp: number | null; withoutRlp: number | null; error: string | null }[];
  rlpPayments: { month: string; byAccount: { account: string; properties: number }[] } | null;
}

/* PayProp's own service-level wording, grouped. "Fully managed" is the only
   managed level it uses today; the pattern allows for "Managed" or EFM. */
const LEVELS = {
  managed: /managed|efm/i,
  letOnly: /let\s*only|tenant\s*find/i,
  rentCollect: /rent\s*collect/i,
} as const;

const COUNTRY: Record<Account, string> = { uk: "England & Wales", scotland: "Scotland" };

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/** A figure for the whole business, with England & Wales and Scotland beneath it. */
function SplitTile({
  label,
  total,
  uk,
  scotland,
  note,
  loading = false,
  error,
}: {
  label: string;
  total: string | null;
  uk: string | null;
  scotland: string | null;
  note?: string;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="card card-lift flex h-full flex-col p-5" title={note}>
      <div className="stat-label text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted" aria-busy="true">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
          Loading
        </div>
      ) : error ? (
        <div className="mt-2 text-xs text-red-700">{error}</div>
      ) : (
        <>
          <div className="stat-value stat-value--big mt-2">{total ?? "—"}</div>
          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3">
            <div className="min-w-0">
              <div className="truncate text-[10px] uppercase tracking-wide text-muted">{COUNTRY.uk}</div>
              <div className="tnum text-[15px] font-semibold text-ink">{uk ?? "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[10px] uppercase tracking-wide text-muted">{COUNTRY.scotland}</div>
              <div className="tnum text-[15px] font-semibold text-ink">{scotland ?? "—"}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PortfolioTab({ month }: { month: string; seed: SeedData }) {
  const [live, setLive] = useState<LiveBook | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [prot, setProt] = useState<Protection | null>(null);
  const [protFailed, setProtFailed] = useState(false);
  const [arrearsCount, setArrearsCount] = useState<number | null>(null);
  const [renewals, setRenewals] = useState<number | null>(null);

  // Protection: tags for Scotland, premium payments for E&W. The payments are a
  // month's walk, so poll until they land.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const ask = () => {
      fetch("/api/business/protection", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: Protection & { error?: string }) => {
          if (cancelled) return;
          if (!d?.agencies) {
            setProtFailed(true);
            return;
          }
          setProt(d);
          if (!d.rlpPayments && tries++ < 40) setTimeout(ask, 5000);
          else if (!d.rlpPayments) setProtFailed(true);
        })
        .catch(() => !cancelled && setProtFailed(true));
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, []);

  // "Renewals due" is certificates coming up for renewal — a REX figure.
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
            portfolioError?: string | null;
            arrears?: { tenants: unknown[] } | null;
          }) => {
            if (cancelled) return;
            if (d.portfolio) setLive(d.portfolio);
            if (d.arrears) setArrearsCount(d.arrears.tenants.length);
            if ((!d.portfolio || !d.arrears) && tries++ < 40) setTimeout(ask, 5000);
            else if (!d.portfolio) setLiveError(d.portfolioError || "PayProp has not answered.");
          }
        )
        .catch(() => {});
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------- the summary ---------------------------- */

  const acc = (a: Account) => live?.byAccount.find((x) => x.account === a) ?? null;
  /** Properties at a service level, for one agency or the whole book. Null when
   *  the per-agency split isn't in the cached book yet — never a guessed zero. */
  const levelCount = (re: RegExp, a?: Account): number | null => {
    if (!live) return null;
    if (!a) {
      return live.byServiceLevel.filter((l) => re.test(l.level)).reduce((n, l) => n + l.properties, 0);
    }
    const lv = acc(a)?.serviceLevels;
    if (!lv) return null;
    return Object.entries(lv)
      .filter(([k]) => re.test(k))
      .reduce((n, [, v]) => n + v, 0);
  };
  const fmt = (n: number | null) => (n == null ? null : n.toLocaleString("en-GB"));
  const notSet = live?.byServiceLevel.find((l) => l.level === "Not set")?.properties ?? 0;

  /* RLP per agency. The tag is the proper record and wins where PayProp lets
     us read it (Scotland today); otherwise the month's premium payments (E&W,
     whose consent refuses the tags call). */
  const rlpFor = (a: Account): { count: number; basis: string } | null => {
    const tag = prot?.agencies.find((x) => x.account === a);
    if (tag && !tag.error && tag.withRlp != null) return { count: tag.withRlp, basis: "PayProp tag" };
    const paid = prot?.rlpPayments?.byAccount.find((x) => x.account === a);
    if (paid && prot?.rlpPayments) {
      return { count: paid.properties, basis: `RLP premium paid in ${monthLabel(prot.rlpPayments.month)}` };
    }
    return null;
  };
  const rlpUk = rlpFor("uk");
  const rlpSc = rlpFor("scotland");
  const managedUk = levelCount(LEVELS.managed, "uk");
  const managedSc = levelCount(LEVELS.managed, "scotland");
  const pct = (n: number | null | undefined, d: number | null) =>
    n == null || !d ? null : `${((n / d) * 100).toFixed(1)}%`;
  const rlpReady = Boolean(rlpUk && rlpSc && managedUk != null && managedSc != null);
  const rlpTotal = rlpReady ? rlpUk!.count + rlpSc!.count : null;
  const managedTotal = managedUk != null && managedSc != null ? managedUk + managedSc : null;
  const rlpNote = rlpReady
    ? `England & Wales: ${rlpUk!.count} of ${managedUk} managed (${rlpUk!.basis}). Scotland: ${rlpSc!.count} of ${managedSc} managed (${rlpSc!.basis}).`
    : undefined;

  const bookLoading = !live && !liveError;
  const rlpLoading = !rlpReady && !protFailed && !liveError;
  const rlpError = !rlpReady && (protFailed || liveError) ? "PayProp could not answer for RLP." : null;

  /* ------------------------------ by partner ------------------------------ */

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
            managed: count(LEVELS.managed),
            letOnly: count(LEVELS.letOnly),
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

  const accountAvg = (a: Account) => {
    const x = acc(a);
    if (!x || !x.properties) return { value: null, source: "unavailable" as const, note: "Not in the PayProp book yet." };
    return {
      value: Math.round(x.avgRent),
      display: gbp(x.avgRent),
      source: "live-payprop" as const,
      note: `${gbp(x.rentRoll)} across ${x.properties} properties.`,
    };
  };

  return (
    <div className="space-y-6">
      {/* Stock, not flow: PayProp keeps no history of the book. */}
      {month !== liveMonth() ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          Everything on this tab is <strong>as at today</strong>, not {monthLabel(month)}. PayProp
          keeps no history of the book, so a past month can&apos;t be rebuilt.
        </div>
      ) : null}

      {liveError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          <span className="font-semibold">PayProp didn&rsquo;t answer for the book.</span> {liveError}
        </div>
      ) : null}

      {/* ---------------------------- summary ---------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Portfolio
          <SourceNote tone={live ? "live" : "unavailable"}>
            PayProp&rsquo;s active properties across both agencies, by PayProp&rsquo;s own service
            level. England &amp; Wales is one PayProp agency and Scotland the other.
          </SourceNote>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SplitTile
            label="Total portfolio"
            loading={bookLoading}
            error={liveError}
            total={fmt(live?.totalProperties ?? null)}
            uk={fmt(acc("uk")?.properties ?? null)}
            scotland={fmt(acc("scotland")?.properties ?? null)}
            note={notSet ? `${notSet} with no service level set in PayProp.` : undefined}
          />
          <SplitTile
            label="Total managed"
            loading={bookLoading}
            error={liveError}
            total={fmt(levelCount(LEVELS.managed))}
            uk={fmt(managedUk)}
            scotland={fmt(managedSc)}
          />
          <SplitTile
            label="Let only"
            loading={bookLoading}
            error={liveError}
            total={fmt(levelCount(LEVELS.letOnly))}
            uk={fmt(levelCount(LEVELS.letOnly, "uk"))}
            scotland={fmt(levelCount(LEVELS.letOnly, "scotland"))}
          />
          <SplitTile
            label="Rent collection"
            loading={bookLoading}
            error={liveError}
            total={fmt(levelCount(LEVELS.rentCollect))}
            uk={fmt(levelCount(LEVELS.rentCollect, "uk"))}
            scotland={fmt(levelCount(LEVELS.rentCollect, "scotland"))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SplitTile
            label="Managed on RLP"
            loading={rlpLoading}
            error={rlpError}
            total={fmt(rlpTotal)}
            uk={fmt(rlpUk?.count ?? null)}
            scotland={fmt(rlpSc?.count ?? null)}
            note={rlpNote}
          />
          <SplitTile
            label="RLP % of managed"
            loading={rlpLoading}
            error={rlpError}
            total={pct(rlpTotal, managedTotal)}
            uk={pct(rlpUk?.count, managedUk)}
            scotland={pct(rlpSc?.count, managedSc)}
            note={rlpNote ? `Of the managed book. ${rlpNote}` : undefined}
          />
          <SplitTile
            label="Monthly rent roll"
            loading={bookLoading}
            error={liveError}
            total={live ? gbp(live.totalRentRoll) : null}
            uk={acc("uk") ? gbp(acc("uk")!.rentRoll) : null}
            scotland={acc("scotland") ? gbp(acc("scotland")!.rentRoll) : null}
          />
        </div>
        {rlpReady && rlpUk && !/tag/.test(rlpUk.basis) ? (
          <p className="text-[11px] text-muted">
            RLP for England &amp; Wales is counted from the premiums paid in{" "}
            {prot?.rlpPayments ? monthLabel(prot.rlpPayments.month) : "the last month"}; Scotland
            from its PayProp tags. Hover a box for the working.
          </p>
        ) : null}
      </section>

      {/* ------------------------- rents & health ------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Rents &amp; Portfolio Health</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Avg rent - England & Wales" stat={accountAvg("uk")} loading={bookLoading} />
          <StatCard label="Avg rent - Scotland" stat={accountAvg("scotland")} loading={bookLoading} />
          <StatCard
            label="Renewals due"
            loading={renewals == null}
            stat={{
              value: renewals,
              source: "live-rex",
              note: "Compliance certificates expiring within 60 days, across the account.",
            }}
            sub="Next 60 days"
          />
          <StatCard
            label="In arrears"
            loading={arrearsCount == null}
            stat={{
              value: arrearsCount,
              source: "live-payprop",
              note: "Tenancies currently in debit across both agencies.",
            }}
            sub="See the Arrears tab"
          />
        </div>
      </section>

      {/* --------------------------- by partner --------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Portfolio by Partner {live ? `(${livePartnerRows.length} partners)` : ""}
          <SourceNote tone={live ? "live" : "unavailable"}>
            {live
              ? `PayProp portfolio walk, both agencies, as it stands today. Managed and let only come from each partner's own service-level split. ${live.unattributed} properties sit on TLE, Admin or a blank agent in PayProp and are not in any partner's row.`
              : "The live PayProp book has not answered yet."}
          </SourceNote>
        </h2>
        {live && liveTotals ? (
          <DataTable columns={LIVE_PARTNER_COLUMNS} rows={[...livePartnerRows, liveTotals]} compact />
        ) : liveError ? null : (
          <div className="flex items-center gap-2 text-xs text-muted" aria-busy="true">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
            Waiting on PayProp for the partner split.
          </div>
        )}
      </section>
    </div>
  );
}
