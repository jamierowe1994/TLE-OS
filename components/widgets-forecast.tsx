"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { BigCount, Head, LineGraph } from "@/components/widgets";
import { SAGE_INK, SAGE_WASH } from "@/components/appraisal/NextUp";

/**
 * The Finances board's live tiles: what the book earns, what comes to the
 * person looking, where next month lands, and the platform they trade on.
 *
 * Nothing on these is typed in. The book, the rents, the service types and
 * the start dates are live out of REX; the package each partner is on comes
 * from the TEG Hub. The RATES - what we charge, what a package keeps, what a
 * licence costs - are settings, blank until an owner fills them in, and each
 * tile says which figure it is waiting for rather than guessing one.
 *
 * Same language as the home screen: a white tile with a hairline, the
 * eyebrow with its icon, one big figure, one line under it in the accent;
 * the odd tile in colour - fees on the pink, take-home on the sage.
 */

export interface MonthPoint {
  month: string;
  label: string;
  properties: number;
  managed: number;
  feeableRentPence: number;
  newLets: number;
  managementFeePence: number | null;
  setupFeePence: number | null;
  totalPence: number | null;
  projected: boolean;
}

export interface PackageTerms {
  sharePct: number | null;
  licencePence: number | null;
}

export interface Forecast {
  ok: boolean;
  live: boolean;
  reason?: string;
  basisSet: boolean;
  basis: {
    managementPct: number | null;
    rentCollectPct: number | null;
    setupFeePence: number | null;
    letOnlySetupPence: number | null;
    packages: Record<string, PackageTerms>;
  };
  past: MonthPoint[];
  ahead: MonthPoint[];
  growth: {
    addedThisYear: number; addedLast12: number; perMonth: number;
    propertiesNow: number; managedNow: number; feeableRentNowPence: number;
    propertiesYearAgo: number; feeableRentYearAgoPence: number; growthPct: number | null;
  };
  targetPence: number | null;
  predictedPence: number | null;
  mine: { package: string | null; sharePct: number | null; licencePence: number | null };
  paidThisMonthPence: number | null;
  paidNextMonthPence: number | null;
  nextMonthPence: number | null;
  licenceIncome: {
    partners: number;
    byPackage: { name: string; partners: number; licencePence: number | null; totalPence: number | null }[];
    totalPence: number | null;
  } | null;
  whole: boolean;
  canSetRates: boolean;
}

const PACKAGES = ["Basic", "Pro", "Academy"];

/* One fetch for the whole board, however many tiles are on it. */
let shared: Promise<Forecast | null> | null = null;
export function refreshForecast() { shared = null; }

export function useForecast(): { data: Forecast | null; loading: boolean; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data: Forecast | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    shared ??= fetch("/api/finances/forecast", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    void shared.then((j: Forecast | null) => {
      if (j?.ok && j.live) setState({ data: j, loading: false, error: null });
      else setState({ data: null, loading: false, error: j?.reason ?? "Couldn't read the book." });
    });
  }, []);
  useEffect(load, [load]);
  return { ...state, reload: () => { shared = null; load(); } };
}

const gbp = (pence: number | null | undefined, dp = 0) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const short = (pence: number | null | undefined) => {
  if (pence == null) return "—";
  const p = pence / 100;
  const sign = p < 0 ? "-" : "";
  const a = Math.abs(p);
  if (a >= 1_000_000) return `${sign}£${(a / 1_000_000).toFixed(1)}m`;
  if (a >= 10_000) return `${sign}£${Math.round(a / 1000)}k`;
  if (a >= 1000) return `${sign}£${(a / 1000).toFixed(1)}k`;
  return `${sign}£${Math.round(a)}`;
};
const thisMonthName = () => new Date().toLocaleDateString("en-GB", { month: "long" });
const nextMonthName = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString("en-GB", { month: "long" });
};

/** Said the same way on every tile that is waiting for a rate. */
function Waiting({ what, h }: { what: string; h: number }) {
  return (
    <>
      <BigCount value="—" hint={`waiting on ${what}`} />
      {h > 1 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          An owner sets it on The year ahead, and this comes alive off the live book. Nothing here is typed in.
        </p>
      )}
    </>
  );
}

/** Up or down on last month, said in one small pill. */
function Delta({ now, before }: { now: number | null | undefined; before: number | null | undefined }) {
  if (now == null || before == null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <SagePill>level with last month</SagePill>;
  return pct > 0 ? (
    <SagePill>+{pct}% on last month</SagePill>
  ) : (
    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-semibold text-accent-dark">{pct}% on last month</span>
  );
}

function SagePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>
      {children}
    </span>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</dt>
      <dd className="figures mt-0.5 truncate text-[13px]">{v}</dd>
    </div>
  );
}

/* ── fees this month: the headline, on the pink ─────────────────────────── */

export function FeesThisMonth({ w, h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const m = data?.past[data.past.length - 1];
  const prev = data?.past[data.past.length - 2];
  if (loading) return <><Head icon="wallet" label={`Fees · ${thisMonthName()}`} /><BigCount value="•" hint="reading the book…" /></>;
  if (error || !data) return <><Head icon="wallet" label={`Fees · ${thisMonthName()}`} /><BigCount value="—" hint={error ?? "no answer"} /></>;
  if (!data.basisSet) return <><Head icon="wallet" label={`Fees · ${thisMonthName()}`} /><Waiting what="the rates we charge" h={h} /></>;

  const mgmt = m?.managementFeePence ?? 0;
  const setup = m?.setupFeePence ?? 0;
  const total = m?.totalPence ?? 0;
  const mgmtShare = total ? Math.round((mgmt / total) * 100) : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="wallet" label={`Fees · ${thisMonthName()}`} />
        {w >= 2 && <Delta now={m?.totalPence} before={prev?.totalPence} />}
      </div>
      <p className="figures mt-3 text-[34px] leading-none">{short(m?.totalPence)}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-accent-dark">
        {data.whole ? "the whole business" : "your book"} · {m?.managed ?? 0} homes on a monthly fee, {m?.newLets ?? 0} new lets
      </p>
      {h > 1 && (
        <>
          {/* One bar, two streams: the recurring part and the one-offs. */}
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/70">
            <span className="h-full bg-accent-dark" style={{ width: `${mgmtShare}%` }} title={`Management ${gbp(mgmt)}`} />
            <span className="h-full" style={{ width: `${100 - mgmtShare}%`, background: SAGE_INK }} title={`Set-up ${gbp(setup)}`} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11.5px]">
            <Fact k="Management" v={short(m?.managementFeePence)} />
            <Fact k="Set-up fees" v={short(m?.setupFeePence)} />
            <Fact k="Rent roll" v={short(m?.feeableRentPence)} />
            <Fact k="Last month" v={short(prev?.totalPence)} />
          </dl>
          {w >= 2 && (
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
              Worked from the live book at the rates set on The year ahead. Net of VAT.
            </p>
          )}
        </>
      )}
    </>
  );
}

/* ── paid to you: the take-home, on the sage ───────────────────────────── */

export function PaidToYou({ w, h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const label = `Paid to you · ${thisMonthName()}`;
  if (loading) return <><Head icon="coin" label={label} /><BigCount value="•" hint="reading the book…" /></>;
  if (error || !data) return <><Head icon="coin" label={label} /><BigCount value="—" hint={error ?? "no answer"} /></>;
  if (data.whole) {
    return (
      <>
        <Head icon="coin" label="Paid to partners" />
        <BigCount value="—" hint="worked per partner" />
        {(w >= 2 || h >= 2) && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            You are looking at the whole business. A partner&apos;s take-home is their fees at their package&apos;s share, less the licence. View as a partner to see theirs.
          </p>
        )}
      </>
    );
  }
  if (!data.basisSet) return <><Head icon="coin" label={label} /><Waiting what="the rates we charge" h={h} /></>;
  if (!data.mine.package) {
    return (
      <>
        <Head icon="coin" label={label} />
        <BigCount value="—" hint="no package on the Hub for you" />
        {(w >= 2 || h >= 2) && <p className="mt-2 text-[11px] leading-relaxed text-muted">The TEG Hub decides which package you are on. Once it says, your share applies here.</p>}
      </>
    );
  }
  if (data.mine.sharePct == null) return <><Head icon="coin" label={label} /><Waiting what={`the ${data.mine.package} share`} h={h} /></>;

  const fees = data.past[data.past.length - 1]?.totalPence ?? 0;
  const share = Math.round((fees * data.mine.sharePct) / 100);
  return (
    <>
      <Head icon="coin" label={label} />
      <p className="figures mt-3 text-[34px] leading-none">{short(data.paidThisMonthPence)}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium" style={{ color: SAGE_INK }}>
        {data.mine.sharePct}% of {short(fees)}
        {data.mine.licencePence ? `, less the ${short(data.mine.licencePence)} licence` : ""}
      </p>
      {h > 1 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11.5px]">
          <Fact k="Your share" v={short(share)} />
          <Fact k="Licence" v={data.mine.licencePence ? `-${short(data.mine.licencePence)}` : "—"} />
          <Fact k="Next month" v={short(data.paidNextMonthPence)} />
          <Fact k="Package" v={data.mine.package} />
        </dl>
      )}
    </>
  );
}

/* ── next month: where the projection lands ────────────────────────────── */

export function NextMonth({ w, h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const label = `Forecast · ${nextMonthName()}`;
  if (loading) return <><Head icon="trend-up" label={label} /><BigCount value="•" hint="reading the book…" /></>;
  if (error || !data) return <><Head icon="trend-up" label={label} /><BigCount value="—" hint={error ?? "no answer"} /></>;
  if (!data.basisSet) return <><Head icon="trend-up" label={label} /><Waiting what="the rates we charge" h={h} /></>;
  const thisMonth = data.past[data.past.length - 1]?.totalPence ?? null;
  const series = [...data.past.slice(-6), ...data.ahead.slice(0, 3)].map((m) => (m.totalPence ?? 0) / 100);
  return (
    <>
      <Head icon="trend-up" label={label} />
      <p className="figures mt-3 text-[34px] leading-none">{short(data.nextMonthPence)}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-accent-dark">
        {data.whole ? "fee income" : data.paidNextMonthPence != null ? `${short(data.paidNextMonthPence)} to you` : "fee income"}
        {thisMonth != null && data.nextMonthPence != null
          ? ` · ${data.nextMonthPence >= thisMonth ? "up" : "down"} ${short(Math.abs(data.nextMonthPence - thisMonth))} on this month`
          : ""}
      </p>
      {(w >= 2 || h >= 2) && (
        <div className="mt-4">
          <LineGraph data={series} tall={h >= 2} />
          <p className="mt-1.5 text-[9.5px] text-muted">
            six months behind, three ahead · growing at {data.growth.perMonth} homes a month
          </p>
        </div>
      )}
    </>
  );
}

/* ── the platform: which package, and what it means ────────────────────── */

export function Platform({ w, h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  if (loading) return <><Head icon="star" label="Your platform" /><BigCount value="•" hint="asking the Hub…" /></>;
  if (error || !data) return <><Head icon="star" label="Your platform" /><BigCount value="—" hint={error ?? "no answer"} /></>;

  /* An owner sees the licence book, not a package of their own. */
  if (data.whole && data.licenceIncome) {
    const li = data.licenceIncome;
    return (
      <>
        <Head icon="file-contract" label="Licence income" />
        <p className="figures mt-3 text-[34px] leading-none">{li.totalPence == null ? "—" : short(li.totalPence)}</p>
        <p className="mt-1.5 truncate text-[11px] font-medium text-accent-dark">
          {li.totalPence == null ? "waiting on the licence per package" : "a month"} · {li.partners} active partner{li.partners === 1 ? "" : "s"}
        </p>
        {(w >= 2 || h >= 2) && (
          <ul className="mt-3 space-y-1.5">
            {li.byPackage.map((p) => (
              <li key={p.name} className="flex items-baseline gap-2 text-[11.5px]">
                <span className="figures w-6 shrink-0 text-accent-dark">{p.partners}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="figures shrink-0 text-muted">{p.totalPence == null ? "licence not set" : `${short(p.totalPence)} a month`}</span>
              </li>
            ))}
          </ul>
        )}
        {h >= 2 && (
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
            Headcount from the TEG Hub, active partners only. The licence on each package is set on The year ahead.
          </p>
        )}
      </>
    );
  }

  const pkg = data.mine.package;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="star" label="Your platform" />
        {pkg && <span className="rounded-full bg-brown px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Partner</span>}
      </div>
      <p className="hand mt-3 text-[30px] leading-none">{pkg ?? "—"}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-accent-dark">
        {!pkg
          ? "no package on the Hub for you"
          : data.mine.licencePence != null
            ? `${short(data.mine.licencePence)} a month licence`
            : "licence not set yet"}
      </p>
      {(w >= 2 || h >= 2) && pkg && (
        <ul className="mt-3 space-y-1.5 text-[11.5px]">
          <li className="flex items-center gap-2">
            <DoodleIcon name="coin" size={12} className="shrink-0 text-accent-dark" />
            {data.mine.sharePct != null ? `You keep ${data.mine.sharePct}% of fee income` : "Your share of fee income is not set yet"}
          </li>
          <li className="flex items-center gap-2">
            <DoodleIcon name="grid" size={12} className="shrink-0 text-accent-dark" />
            <Link href="/tools" className="hover:underline">The systems you run on</Link>
          </li>
        </ul>
      )}
    </>
  );
}

/* ── the target: wanted against predicted ──────────────────────────────── */

export function Target({ h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  if (loading) return <><Head icon="target" label="Your target" /><BigCount value="•" hint="reading the book…" /></>;
  if (error || !data) return <><Head icon="target" label="Your target" /><BigCount value="—" hint={error ?? "no answer"} /></>;
  if (data.targetPence == null) {
    return (
      <>
        <Head icon="target" label="Your target" />
        <BigCount value="—" hint="no target set" />
        <p className="mt-2 text-[11px] leading-relaxed text-muted">Say what you want to earn this year on The year ahead, and this shows how far along you are.</p>
      </>
    );
  }
  const pct = data.predictedPence != null ? Math.round((data.predictedPence / data.targetPence) * 100) : null;
  const gap = data.predictedPence != null ? data.predictedPence - data.targetPence : null;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="target" label="Your target" />
        {pct != null && (pct >= 100 ? <SagePill>on course</SagePill> : <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-semibold text-accent-dark">{100 - pct}% short</span>)}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="figures text-[34px] leading-none">{short(data.targetPence)}</span>
        <span className="text-[11px] text-muted">wanted this year</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-panel">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, background: (pct ?? 0) >= 100 ? SAGE_INK : "var(--accent-dark)" }} />
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium text-accent-dark">
        {data.predictedPence == null
          ? "predicted once the rates are set"
          : `${short(data.predictedPence)} predicted · ${gap != null && gap >= 0 ? `${short(gap)} over` : `${short(Math.abs(gap ?? 0))} to find`}`}
      </p>
      {h >= 2 && <p className="mt-3 text-[10.5px] leading-relaxed text-muted">Predicted is the next twelve months at the rate the book actually grew over the last year.</p>}
    </>
  );
}

/* ── how the book has grown ─────────────────────────────────────────────── */

export function PortfolioGrowth({ h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const g = data?.growth;
  if (h <= 1) {
    return (
      <>
        <Head icon="trend-up" label="Portfolio growth" />
        <BigCount
          value={loading ? "•" : error ? "—" : `+${g?.addedThisYear ?? 0}`}
          hint={loading ? "reading the book…" : error ? error : `homes added in ${new Date().getFullYear()}`}
        />
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="trend-up" label="Portfolio growth" />
        {g?.growthPct != null && <SagePill>+{g.growthPct}% in a year</SagePill>}
      </div>
      {loading ? (
        <p className="mt-5 text-[11.5px] text-muted">Reading the book…</p>
      ) : error ? (
        <p className="mt-5 text-[11.5px] text-accent-dark">{error}</p>
      ) : g ? (
        <>
          <p className="figures mt-3 text-[34px] leading-none">{g.propertiesNow}</p>
          <p className="mt-1.5 text-[11px] font-medium text-accent-dark">homes on the book, {g.propertiesYearAgo} a year ago</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11.5px]">
            <Fact k={`Added in ${new Date().getFullYear()}`} v={`+${g.addedThisYear}`} />
            <Fact k="Added in 12 months" v={`+${g.addedLast12}`} />
            <Fact k="Running at" v={`${g.perMonth} a month`} />
            <Fact k="Earning a monthly fee" v={`${g.managedNow}`} />
          </dl>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
            Rent roll on those {g.managedNow}: {gbp(g.feeableRentNowPence)} a month, against {gbp(g.feeableRentYearAgoPence)} a year ago.
          </p>
        </>
      ) : null}
    </>
  );
}

/* ── the two streams, on their own ─────────────────────────────────────── */

export function ManagementFees({ h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const thisMonth = data?.past[data.past.length - 1];
  const value = thisMonth?.managementFeePence ?? null;
  return (
    <>
      <Head icon="key" label="Management fees" />
      {loading ? <BigCount value="•" hint="reading the book…" />
        : error ? <BigCount value="—" hint={error} />
        : !data?.basisSet ? <Waiting what="the management rate" h={h} />
        : <>
            <BigCount value={short(value)} hint={`this month, on ${thisMonth?.managed ?? 0} homes`} />
            {h > 1 && (
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                {data.basis.managementPct}% of {gbp(thisMonth?.feeableRentPence)} rent roll
                {data.basis.rentCollectPct != null ? `, rent collect at ${data.basis.rentCollectPct}%` : ""}. Net of VAT.
              </p>
            )}
          </>}
    </>
  );
}

export function SetupFees({ w, h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const thisMonth = data?.past[data.past.length - 1];
  const lets = data?.past.slice(-12).map((m) => m.newLets) ?? [];
  return (
    <>
      <Head icon="pack/house" label="Set-up fees" />
      {loading ? <BigCount value="•" hint="reading the book…" />
        : error ? <BigCount value="—" hint={error} />
        : data?.basis.setupFeePence == null ? <Waiting what="the set-up fee" h={h} />
        : <>
            <div className="flex items-end gap-4">
              <div className="min-w-0">
                <BigCount value={short(thisMonth?.setupFeePence)} hint={`${thisMonth?.newLets ?? 0} new lets this month`} />
              </div>
              {w >= 2 && (
                <div className="mb-1 min-w-0 flex-1">
                  <div className="flex h-9 items-end gap-1">
                    {lets.map((n, i) => (
                      <span key={i} className={`flex-1 rounded-t-[3px] ${i === lets.length - 1 ? "bg-accent-dark" : "bg-accent-soft"}`} style={{ height: `${Math.max(8, (n / Math.max(1, ...lets)) * 100)}%` }} title={`${n} lets`} />
                    ))}
                  </div>
                  <p className="mt-1 text-[9px] text-muted">new lets · last 12 months</p>
                </div>
              )}
            </div>
            {h > 1 && (
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                {gbp(data.basis.setupFeePence)} a let. The last twelve months ran at {Math.round(lets.reduce((a, b) => a + b, 0) / 12)} lets a month.
              </p>
            )}
          </>}
    </>
  );
}

/* ── the twelve months ahead, and where the rates are set ──────────────── */

export function FeeForecast({ h }: { w: number; h: number }) {
  const { data, loading, error, reload } = useForecast();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const num = (key: string, fallback: number | null, pence = false): number | null => {
    const raw = f[key];
    if (raw === undefined) return fallback;
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return pence ? Math.round(n * 100) : n;
  };

  async function save() {
    if (!data) return;
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (data.canSetRates) {
      const packages: Record<string, PackageTerms> = {};
      for (const p of PACKAGES) {
        packages[p] = {
          sharePct: num(`share:${p}`, data.basis.packages[p]?.sharePct ?? null),
          licencePence: num(`licence:${p}`, data.basis.packages[p]?.licencePence ?? null, true),
        };
      }
      body.basis = {
        managementPct: num("mgmt", data.basis.managementPct),
        rentCollectPct: num("collect", data.basis.rentCollectPct),
        setupFeePence: num("setup", data.basis.setupFeePence, true),
        letOnlySetupPence: num("letonly", data.basis.letOnlySetupPence, true),
        packages,
      };
    }
    if (f.target !== undefined) body.annualTargetPence = num("target", data.targetPence, true);
    await fetch("/api/finances/forecast", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(false);
    setEditing(false);
    setF({});
    reload();
  }

  if (loading) return <><Head icon="trend-up" label="The year ahead" /><p className="mt-5 text-[11.5px] text-muted">Reading the book…</p></>;
  if (error || !data) return <><Head icon="trend-up" label="The year ahead" /><p className="mt-5 text-[11.5px] text-accent-dark">{error}</p></>;

  const months = [...data.past.slice(-6), ...data.ahead];
  const peak = Math.max(1, ...months.map((m) => m.totalPence ?? 0));
  const target = data.targetPence;
  const predicted = data.predictedPence;
  const onCourse = target != null && predicted != null ? Math.round((predicted / target) * 100) : null;
  const input = "w-full rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-ink";
  const lab = "text-[10px] font-bold uppercase tracking-wider text-muted";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="trend-up" label="The year ahead" />
        <button type="button" data-nodrag onClick={() => setEditing((v) => !v)} className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[10.5px] text-muted transition-colors hover:border-ink hover:text-ink">
          {editing ? "Close" : data.basisSet ? "Rates and target" : "Set the rates"}
        </button>
      </div>

      {editing ? (
        <div className="mt-3 max-h-[240px] overflow-y-auto pr-1">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {data.canSetRates ? (
              <>
                <label className={lab}>Management %
                  <input defaultValue={data.basis.managementPct ?? ""} onChange={(e) => setF({ ...f, mgmt: e.target.value })} className={`mt-1 ${input}`} />
                </label>
                <label className={lab}>Rent collect %
                  <input defaultValue={data.basis.rentCollectPct ?? ""} onChange={(e) => setF({ ...f, collect: e.target.value })} className={`mt-1 ${input}`} />
                </label>
                <label className={lab}>Set-up fee £
                  <input defaultValue={data.basis.setupFeePence != null ? data.basis.setupFeePence / 100 : ""} onChange={(e) => setF({ ...f, setup: e.target.value })} className={`mt-1 ${input}`} />
                </label>
                <label className={lab}>Let-only fee £
                  <input defaultValue={data.basis.letOnlySetupPence != null ? data.basis.letOnlySetupPence / 100 : ""} onChange={(e) => setF({ ...f, letonly: e.target.value })} className={`mt-1 ${input}`} />
                </label>
                {/* The packages: what each keeps and what each pays. */}
                <p className="text-[10.5px] leading-relaxed text-muted sm:col-span-2">
                  Partner packages, as the Hub names them. The share is what a partner on that package keeps of fee income; the licence is what they pay a month.
                </p>
                {PACKAGES.map((p) => (
                  <div key={p} className="grid grid-cols-[64px_1fr_1fr] items-end gap-2 sm:col-span-2">
                    <span className="pb-2 text-[12px] font-semibold">{p}</span>
                    <label className={lab}>Share %
                      <input defaultValue={data.basis.packages[p]?.sharePct ?? ""} onChange={(e) => setF({ ...f, [`share:${p}`]: e.target.value })} className={`mt-1 ${input}`} />
                    </label>
                    <label className={lab}>Licence £ a month
                      <input defaultValue={data.basis.packages[p]?.licencePence != null ? (data.basis.packages[p].licencePence as number) / 100 : ""} onChange={(e) => setF({ ...f, [`licence:${p}`]: e.target.value })} className={`mt-1 ${input}`} />
                    </label>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-[11px] text-muted sm:col-span-2">The rates are set by an owner. Your target is yours.</p>
            )}
            <label className={`${lab} sm:col-span-2`}>What you want to earn this year £
              <input defaultValue={data.targetPence != null ? data.targetPence / 100 : ""} onChange={(e) => setF({ ...f, target: e.target.value })} className={`mt-1 ${input}`} />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => { setEditing(false); setF({}); }} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] text-muted">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void save()} className="rounded-full bg-brown px-4 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </div>
            <p className="text-[10.5px] leading-relaxed text-muted sm:col-span-2">
              The rates are the only thing here nobody can read out of REX. Everything else - the homes, their rents, the service on each and the day it came on - is live.
            </p>
          </div>
        </div>
      ) : !data.basisSet ? (
        <Waiting what="the management rate and the set-up fee" h={h} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              <span className="figures text-[28px] leading-none">{short(predicted)}</span>
              <span className="ml-1.5 text-[11px] text-muted">predicted over the next twelve months</span>
            </span>
            {target != null && (
              <span>
                <span className="figures text-[17px] leading-none text-muted">{short(target)}</span>
                <span className="ml-1.5 text-[11px] text-muted">wanted</span>
              </span>
            )}
            {onCourse != null && (
              onCourse >= 100
                ? <SagePill>{onCourse}% of target</SagePill>
                : <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-semibold text-accent-dark">{onCourse}% of target</span>
            )}
          </div>

          {h > 1 && (
            <>
              {/* Bars from zero, because a truncated axis flatters a modest
                  trend. Solid is the book as it was; sage is where it goes. */}
              <div className="relative mt-4 h-[92px]">
                {target != null && (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent-dark/70"
                    style={{ bottom: `${Math.min(88, Math.round(((target / 12) / peak) * 88))}px` }}
                  />
                )}
                <div className="flex h-full items-end gap-[3px]">
                  {months.map((m) => (
                    <div key={m.month} className="flex flex-1 flex-col items-center justify-end" title={`${m.label}: ${gbp(m.totalPence)}${m.projected ? " projected" : ""}`}>
                      <div
                        className={`w-full rounded-t-[3px] ${m.projected ? "" : "bg-accent-dark"}`}
                        style={{ height: `${Math.max(3, Math.round(((m.totalPence ?? 0) / peak) * 88))}px`, ...(m.projected ? { background: "#b7b5a0" } : {}) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-1.5 flex justify-between text-[9.5px] text-muted">
                <span>{months[0]?.label} · {short(months[0]?.totalPence)}</span>
                <span>now</span>
                <span>{months[months.length - 1]?.label} · {short(months[months.length - 1]?.totalPence)}</span>
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                Clay is what the book earned, sage is where it goes if it keeps growing at {data.growth.perMonth} homes a month, the rate it actually grew over the last year.
                {target != null ? ` The dashed line is the ${short(target / 12)} a month your target needs.` : ""} Fees net of VAT.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
