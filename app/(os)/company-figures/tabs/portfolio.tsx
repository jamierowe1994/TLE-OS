"use client";

// Admin tab: Portfolio - the book in summary boxes (total, managed, let only,
// rent collect, RLP), each split England & Wales / Scotland, then rents and
// health, then the partner table. Everything is live from PayProp.
//
// Rebuilt 17 Sep 2026 from Susan's notes: the "Managed book - live" block at
// the top repeated the partner table below it, and the rent protection row
// ("No protection 69") was Scotland alone under a business-wide heading. The
// summary now answers her question in one row: how big is the book, how much
// of it is managed, and how much of the managed book is on RLP.
//
// Susan Liles, 3 Nov 2026: the split is now England / Wales / Scotland - Core /
// Scotland - Margo's Glasgow portfolio, by each home's own postcode rather than
// its PayProp agency (Sean McMahon's Edinburgh and Glasgow homes are on the E&W
// agency, so they were counted as England & Wales). Margo's homes stay apart
// until Sean completes the purchase. Growth and loss by region sits under it.
// RLP stays by PayProp agency: that is the only way PayProp gives it to us.

import { useEffect, useState } from "react";
import StatCard from "@/components/business/StatCard";
import SourceNote from "@/components/business/SourceNote";
import DataTable from "@/components/business/DataTable";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import { formatGBP, monthLabel } from "@/lib/business/format";
import { liveMonth } from "@/lib/business/roster";
import { BOOK_REGIONS, type BookRegion, type BookRegionOrUnknown } from "@/lib/business/book-regions";
import type { PortfolioGrowth } from "@/lib/business/book-record"; // type-only - erased at build

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
  /** By the home's own address (3 Nov 2026). Absent on a book cached before. */
  byRegion?: Record<
    BookRegionOrUnknown,
    { properties: number; rentRoll: number; avgRent: number; serviceLevels: Record<string, number> }
  >;
  regionUnknown?: Array<{ id: string; account: string; name: string; agent: string }>;
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

/* RLP only: PayProp gives it per agency, and the E&W agency holds Sean
   McMahon's Scottish homes too, so these are named for the agency. */
const AGENCY: Record<Account, string> = { uk: "E&W PayProp", scotland: "Scotland PayProp" };

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/** A figure for the whole business, with its parts beneath it, two to a row. */
function SplitTile({
  label,
  total,
  parts,
  note,
  loading = false,
  error,
}: {
  label: string;
  total: string | null;
  parts: Array<{ label: string; value: string | null }>;
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
          <div className="mt-auto grid grid-cols-2 gap-x-2 gap-y-2.5 border-t border-line pt-3">
            {parts.map((p) => (
              /* A label that wraps (Scotland - Margo) keeps its figure on the
                 same line as its neighbour's. */
              <div key={p.label} className="flex min-w-0 flex-col">
                <div className="text-[10px] uppercase leading-tight tracking-wide text-muted">{p.label}</div>
                <div className="tnum mt-auto text-[15px] font-semibold text-ink">{p.value ?? "-"}</div>
              </div>
            ))}
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
  const [regionsFailed, setRegionsFailed] = useState(false);
  const [growth, setGrowth] = useState<PortfolioGrowth | null>(null);
  const [growthError, setGrowthError] = useState<string | null>(null);

  // Growth and loss by region for the month on the picker (3 Nov 2026). Waits
  // on the same PayProp walk as the book, so it asks again until that lands.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setGrowth(null);
    setGrowthError(null);
    const ask = () => {
      fetch(`/api/business/portfolio-growth?month=${encodeURIComponent(month)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { growth?: PortfolioGrowth | null; pending?: boolean; error?: string | null }) => {
          if (cancelled) return;
          if (d.growth) setGrowth(d.growth);
          else if (d.pending && tries++ < 40) setTimeout(ask, 5000);
          else setGrowthError(d.error || "PayProp hasn't answered for the book.");
        })
        .catch(() => {
          if (cancelled) return;
          if (tries++ < 40) setTimeout(ask, 5000);
          else setGrowthError("We couldn't reach the server for growth and loss. Refresh to try again.");
        });
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, [month]);

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

  // "Renewals due" is certificates coming up for renewal - a REX figure.
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
            problem?: string | null;
          }) => {
            if (cancelled) return;
            if (d.portfolio) {
              setLive(d.portfolio);
              setLiveError(null);
            } else if (d.problem || d.portfolioError) {
              /* Say why now, and keep asking behind it (Rig run 3, P-022):
                 the tiles said "Loading" for twenty minutes otherwise. */
              setLiveError(d.problem || d.portfolioError || null);
            }
            if (d.arrears) setArrearsCount(d.arrears.tenants.length);
            /* A book cached before the region split is walked again behind
               it; keep asking until the regions are in (3 Nov 2026). */
            if ((!d.portfolio?.byRegion || !d.arrears) && tries++ < 40) setTimeout(ask, 5000);
            else if (!d.portfolio) setLiveError(d.problem || d.portfolioError || "PayProp has not answered.");
            else if (!d.portfolio.byRegion) setRegionsFailed(true);
          }
        )
        /* A failed request used to end the polling in silence, leaving the
           tiles on "Loading" for good. */
        .catch(() => {
          if (cancelled) return;
          if (tries++ < 40) setTimeout(ask, 5000);
          else setLiveError("We couldn't reach the server for PayProp's figures. Refresh to try again.");
        });
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------- the summary ---------------------------- */

  const acc = (a: Account) => live?.byAccount.find((x) => x.account === a) ?? null;
  /** Properties at a service level, for one agency or the whole book. Null when
   *  the per-agency split isn't in the cached book yet - never a guessed zero. */
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

  /* ------------------------------ by region ------------------------------ */

  const regions = live?.byRegion ?? null;
  const regionsLoading = !regions && !liveError && !regionsFailed;
  const regionsError = liveError || (regionsFailed && !regions ? "PayProp hasn't finished the region split. Refresh to try again." : null);
  /** Homes in a region, at a service level when one is given. */
  const regionCount = (key: BookRegionOrUnknown, re?: RegExp): number | null => {
    const r = regions?.[key];
    if (!r) return null;
    if (!re) return r.properties;
    return Object.entries(r.serviceLevels)
      .filter(([k]) => re.test(k))
      .reduce((n, [, v]) => n + v, 0);
  };
  /** The four regions beneath a tile, each formatted by `show`. */
  const regionParts = (show: (key: BookRegion) => string | null) =>
    BOOK_REGIONS.map((r) => ({ label: r.short, value: show(r.key) }));
  const unknownHomes = live?.regionUnknown ?? [];

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

  /* --------------------------- growth and loss --------------------------- */

  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const signed = (n: number) => (n > 0 ? `+${n.toLocaleString("en-GB")}` : n.toLocaleString("en-GB"));
  type GrowthRow = { region: string; short: string; now: number; joined: number; left: number | null; total?: boolean };
  const growthRows: GrowthRow[] = growth
    ? [
        ...BOOK_REGIONS.map((r) => {
          const g = growth.regions.find((x) => x.key === r.key)!;
          return { region: r.label, short: r.short, now: g.now, joined: g.joined, left: g.left };
        }),
        /* Homes with no postcode to place them: shown only when there are any. */
        ...growth.regions
          .filter((g) => g.key === "unknown" && (g.now || g.joined || g.left))
          .map((g) => ({ region: "Region not known", short: "Not known", now: g.now, joined: g.joined, left: g.left })),
        { region: "Total", short: "Total", now: growth.total.now, joined: growth.total.joined, left: growth.total.left, total: true },
      ]
    : [];
  const GROWTH_COLUMNS = [
    {
      key: "region",
      label: "Region",
      /* The short name on a phone, so the table fits without scrolling. */
      render: (r: GrowthRow) => (
        <span className={r.total ? "font-semibold" : undefined}>
          <span className="hidden sm:inline">{r.region}</span>
          <span className="sm:hidden">{r.short}</span>
        </span>
      ),
    },
    {
      key: "now",
      label: "Homes",
      align: "right" as const,
      render: (r: GrowthRow) => <span className={r.total ? "font-semibold" : undefined}>{r.now.toLocaleString("en-GB")}</span>,
    },
    { key: "joined", label: "Joined", align: "right" as const, render: (r: GrowthRow) => r.joined.toLocaleString("en-GB") },
    {
      key: "left",
      label: "Left",
      align: "right" as const,
      render: (r: GrowthRow) => (r.left == null ? <span className="text-muted">Not recorded</span> : r.left.toLocaleString("en-GB")),
    },
    {
      key: "net",
      label: "Change",
      align: "right" as const,
      render: (r: GrowthRow) =>
        r.left == null ? (
          <span className="text-muted">-</span>
        ) : (
          <span
            className={`font-semibold ${r.joined - r.left > 0 ? "text-emerald-700" : r.joined - r.left < 0 ? "text-red-700" : ""}`}
          >
            {signed(r.joined - r.left)}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stock, not flow: PayProp keeps no history of the book. */}
      {month !== liveMonth() ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          Everything on this tab is <strong>as at today</strong>, not {monthLabel(month)}, apart from
          Growth and Loss. PayProp keeps no history of the book, so a past month can&apos;t be rebuilt.
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
            level. Each home is placed by its own postcode, so Sean McMahon&rsquo;s Edinburgh and
            Glasgow homes on the E&amp;W agency count in Scotland. Margo&rsquo;s Glasgow portfolio is
            the Scotland agency&rsquo;s homes under Margaret Wilson or Sean McMahon (Glasgow), kept
            apart until the purchase completes.
          </SourceNote>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SplitTile
            label="Total portfolio"
            loading={regionsLoading}
            error={regionsError}
            total={fmt(live?.totalProperties ?? null)}
            parts={regionParts((k) => fmt(regionCount(k)))}
            note={notSet ? `${notSet} with no service level set in PayProp.` : undefined}
          />
          <SplitTile
            label="Total managed"
            loading={regionsLoading}
            error={regionsError}
            total={fmt(levelCount(LEVELS.managed))}
            parts={regionParts((k) => fmt(regionCount(k, LEVELS.managed)))}
          />
          <SplitTile
            label="Let only"
            loading={regionsLoading}
            error={regionsError}
            total={fmt(levelCount(LEVELS.letOnly))}
            parts={regionParts((k) => fmt(regionCount(k, LEVELS.letOnly)))}
          />
          <SplitTile
            label="Rent collection"
            loading={regionsLoading}
            error={regionsError}
            total={fmt(levelCount(LEVELS.rentCollect))}
            parts={regionParts((k) => fmt(regionCount(k, LEVELS.rentCollect)))}
          />
        </div>
        {regions && unknownHomes.length ? (
          <details className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <summary className="cursor-pointer">
              {unknownHomes.length === 1 ? "1 home" : `${unknownHomes.length} homes`} in the total{" "}
              {unknownHomes.length === 1 ? "has" : "have"} no postcode in PayProp, so{" "}
              {unknownHomes.length === 1 ? "it isn't" : "they aren't"} in any region. Show{" "}
              {unknownHomes.length === 1 ? "it" : "them"}.
            </summary>
            <ul className="mt-2 space-y-0.5 text-[12px]">
              {unknownHomes.map((h) => (
                <li key={h.id}>
                  {h.name || "No name"} - {h.agent || "no agent"} ({AGENCY[h.account as Account] ?? h.account})
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SplitTile
            label="Managed on RLP"
            loading={rlpLoading}
            error={rlpError}
            total={fmt(rlpTotal)}
            parts={[
              { label: AGENCY.uk, value: fmt(rlpUk?.count ?? null) },
              { label: AGENCY.scotland, value: fmt(rlpSc?.count ?? null) },
            ]}
            note={rlpNote}
          />
          <SplitTile
            label="RLP % of managed"
            loading={rlpLoading}
            error={rlpError}
            total={pct(rlpTotal, managedTotal)}
            parts={[
              { label: AGENCY.uk, value: pct(rlpUk?.count, managedUk) },
              { label: AGENCY.scotland, value: pct(rlpSc?.count, managedSc) },
            ]}
            note={rlpNote ? `Of the managed book. ${rlpNote}` : undefined}
          />
          <SplitTile
            label="Monthly rent roll"
            loading={regionsLoading}
            error={regionsError}
            total={live ? gbp(live.totalRentRoll) : null}
            parts={regionParts((k) => (regions?.[k] ? gbp(regions[k].rentRoll) : null))}
          />
        </div>
        {rlpReady ? (
          <p className="text-[11px] text-muted">
            RLP is split by PayProp agency, not region: PayProp only gives it per agency, and the E&amp;W
            agency holds Sean McMahon&rsquo;s Scottish homes too.
            {rlpUk && !/tag/.test(rlpUk.basis)
              ? ` E&W is counted from the premiums paid in ${prot?.rlpPayments ? monthLabel(prot.rlpPayments.month) : "the last month"}; Scotland from its PayProp tags.`
              : ""}{" "}
            Hover a box for the working.
          </p>
        ) : null}
      </section>

      {/* ------------------------- growth and loss ------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Growth and Loss - {monthLabel(month)}
          <SourceNote tone={growth ? "live" : "unavailable"}>
            Joined is each home&rsquo;s own listed-from date in PayProp. PayProp doesn&rsquo;t date a
            home leaving, so Left is a home that has dropped off the book, from the OS&rsquo;s daily
            record of it. Homes is the book today, by the same regions as above; Change is joined
            less left.
          </SourceNote>
        </h2>
        {growth ? (
          <>
            <DataTable columns={GROWTH_COLUMNS} rows={growthRows} compact />
            {growth.leftFrom ? (
              <p className="text-[11px] text-muted">
                Left is counted from {dayLabel(growth.leftFrom)}, when the OS started keeping a daily
                record of the book. Joined covers the whole month.
              </p>
            ) : growth.total.left == null ? (
              <p className="text-[11px] text-muted">
                Homes that left in {monthLabel(month)} aren&rsquo;t known:{" "}
                {growth.recordStarted
                  ? `the OS's daily record of the book starts on ${dayLabel(growth.recordStarted)}.`
                  : "the OS's daily record of the book hasn't started yet."}
              </p>
            ) : null}
            {growth.moved ? (
              <p className="text-[11px] text-muted">
                {growth.moved === 1 ? "1 home" : `${growth.moved} homes`} changed region in{" "}
                {monthLabel(month)} (a postcode put right, or Margo&rsquo;s homes moving to Sean) and{" "}
                {growth.moved === 1 ? "isn't" : "aren't"} counted as joined or left.
              </p>
            ) : null}
          </>
        ) : growthError ? (
          <div className="text-xs text-red-700">{growthError}</div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted" aria-busy="true">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
            Waiting on PayProp for growth and loss.
          </div>
        )}
      </section>

      {/* ------------------------- rents & health ------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Rents &amp; Portfolio Health</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SplitTile
            label="Average rent"
            loading={regionsLoading}
            error={regionsError}
            total={live ? gbp(live.avgRent) : null}
            parts={regionParts((k) => (regions?.[k]?.properties ? gbp(regions[k].avgRent) : null))}
            note="Monthly rent roll over homes, for each region."
          />
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
