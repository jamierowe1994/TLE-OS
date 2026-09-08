"use client";

import { useCallback, useEffect, useState } from "react";
import { BigCount, Head } from "@/components/widgets";
import { Pill } from "@/components/Wire";

/**
 * The Finances board's live tiles: how the book has grown, what it earns,
 * and where the next twelve months land against what somebody wants.
 *
 * The rest of that board says "not connected" because the fee figures on it
 * had been typed in. These do not repeat that mistake and they do not solve
 * it by guessing either: the book, the rents, the service types and the
 * start dates are live out of REX, and the RATE is a setting. Blank until an
 * owner fills it in, and the tile says which figure it is waiting for.
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

export interface Forecast {
  ok: boolean;
  live: boolean;
  reason?: string;
  basisSet: boolean;
  basis: { managementPct: number | null; rentCollectPct: number | null; setupFeePence: number | null; letOnlySetupPence: number | null };
  past: MonthPoint[];
  ahead: MonthPoint[];
  growth: {
    addedThisYear: number; addedLast12: number; perMonth: number;
    propertiesNow: number; managedNow: number; feeableRentNowPence: number;
    propertiesYearAgo: number; feeableRentYearAgoPence: number; growthPct: number | null;
  };
  targetPence: number | null;
  predictedPence: number | null;
  whole: boolean;
  canSetRates: boolean;
}

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
  if (Math.abs(p) >= 1_000_000) return `£${(p / 1_000_000).toFixed(1)}m`;
  if (Math.abs(p) >= 1000) return `£${Math.round(p / 1000)}k`;
  return `£${Math.round(p)}`;
};

/** Said the same way on every tile that is waiting for the rate. */
function NeedsRate({ what }: { what: string }) {
  return (
    <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
      Waiting on {what}. Set it on the Forecast tile and this comes alive off the live book - nothing here is typed in.
    </p>
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
        {g?.growthPct != null && <Pill tone="good">+{g.growthPct}%</Pill>}
      </div>
      {loading ? (
        <p className="mt-5 text-[11.5px] text-muted">Reading the book…</p>
      ) : error ? (
        <p className="mt-5 text-[11.5px] text-accent-dark">{error}</p>
      ) : g ? (
        <>
          <p className="figures mt-3 text-[30px] leading-none">{g.propertiesNow}</p>
          <p className="mt-1 text-[11px] font-medium text-accent-dark">homes on the book, {g.propertiesYearAgo} a year ago</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11.5px]">
            <Fact k={`Added in ${new Date().getFullYear()}`} v={`+${g.addedThisYear}`} />
            <Fact k="Added in 12 months" v={`+${g.addedLast12}`} />
            <Fact k="Running at" v={`${g.perMonth}/month`} />
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

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</dt>
      <dd className="figures mt-0.5 truncate text-[13px]">{v}</dd>
    </div>
  );
}

/* ── the money the book makes ───────────────────────────────────────────── */

export function ManagementFees({ h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const thisMonth = data?.past[data.past.length - 1];
  const value = thisMonth?.managementFeePence ?? null;
  return (
    <>
      <Head icon="wallet" label="Management fees" />
      {loading ? <BigCount value="•" hint="reading the book…" />
        : error ? <BigCount value="—" hint={error} />
        : !data?.basisSet ? <NeedsRate what="the management rate" />
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

export function SetupFees({ h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const thisMonth = data?.past[data.past.length - 1];
  return (
    <>
      <Head icon="coin" label="Set-up fees" />
      {loading ? <BigCount value="•" hint="reading the book…" />
        : error ? <BigCount value="—" hint={error} />
        : data?.basis.setupFeePence == null ? <NeedsRate what="the set-up fee" />
        : <>
            <BigCount value={short(thisMonth?.setupFeePence)} hint={`${thisMonth?.newLets ?? 0} new lets this month`} />
            {h > 1 && (
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                {gbp(data.basis.setupFeePence)} a let. The last twelve months ran at{" "}
                {Math.round(data.past.reduce((a, m) => a + m.newLets, 0) / 12)} lets a month.
              </p>
            )}
          </>}
    </>
  );
}

export function FeesThisMonth({ h }: { w: number; h: number }) {
  const { data, loading, error } = useForecast();
  const m = data?.past[data.past.length - 1];
  return (
    <>
      <Head icon="wallet" label="Fees this month" />
      {loading ? <BigCount value="•" hint="reading the book…" />
        : error ? <BigCount value="—" hint={error} />
        : !data?.basisSet ? <NeedsRate what="the rates we charge" />
        : <>
            <BigCount value={short(m?.totalPence)} hint={`${m?.managed ?? 0} homes on a monthly fee, ${m?.newLets ?? 0} new lets`} />
            {h > 1 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11.5px]">
                <Fact k="Management" v={short(m?.managementFeePence)} />
                <Fact k="Set-up" v={short(m?.setupFeePence)} />
                <Fact k="Rent roll" v={short(m?.feeableRentPence)} />
                <Fact k="Last month" v={short(data.past[data.past.length - 2]?.totalPence)} />
              </dl>
            )}
            {h > 1 && <p className="mt-3 text-[10.5px] leading-relaxed text-muted">Worked from the live book at the rates set on the Forecast tile. Net of VAT.</p>}
          </>}
    </>
  );
}

/* ── the twelve months ahead ────────────────────────────────────────────── */

export function FeeForecast({ h }: { w: number; h: number }) {
  const { data, loading, error, reload } = useForecast();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (data?.canSetRates) {
      body.basis = {
        managementPct: f.mgmt === "" ? null : Number(f.mgmt ?? data.basis.managementPct ?? 0) || null,
        rentCollectPct: f.collect === "" ? null : Number(f.collect ?? data.basis.rentCollectPct ?? 0) || null,
        setupFeePence: f.setup === "" ? null : Math.round((Number(f.setup ?? 0) || 0) * 100) || null,
        letOnlySetupPence: f.letonly === "" ? null : Math.round((Number(f.letonly ?? 0) || 0) * 100) || null,
      };
    }
    if (f.target !== undefined) body.annualTargetPence = f.target === "" ? null : Math.round((Number(f.target) || 0) * 100);
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
  const input = "w-full rounded-lg border border-line/80 bg-box px-2.5 py-1.5 text-[12px] outline-none focus:border-ink";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="trend-up" label="The year ahead" />
        <button type="button" onClick={() => setEditing((v) => !v)} className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[10.5px] text-muted transition-colors hover:border-ink hover:text-ink">
          {editing ? "Close" : data.basisSet ? "Rates and target" : "Set the rates"}
        </button>
      </div>

      {editing ? (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {data.canSetRates ? (
            <>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Management %
                <input defaultValue={data.basis.managementPct ?? ""} onChange={(e) => setF({ ...f, mgmt: e.target.value })} className={`mt-1 ${input}`} />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Rent collect %
                <input defaultValue={data.basis.rentCollectPct ?? ""} onChange={(e) => setF({ ...f, collect: e.target.value })} className={`mt-1 ${input}`} />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Set-up fee £
                <input defaultValue={data.basis.setupFeePence != null ? data.basis.setupFeePence / 100 : ""} onChange={(e) => setF({ ...f, setup: e.target.value })} className={`mt-1 ${input}`} />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Let-only fee £
                <input defaultValue={data.basis.letOnlySetupPence != null ? data.basis.letOnlySetupPence / 100 : ""} onChange={(e) => setF({ ...f, letonly: e.target.value })} className={`mt-1 ${input}`} />
              </label>
            </>
          ) : (
            <p className="text-[11px] text-muted sm:col-span-2">The rates are set by an owner. Your target is yours.</p>
          )}
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted sm:col-span-2">What you want to earn this year £
            <input defaultValue={data.targetPence != null ? data.targetPence / 100 : ""} onChange={(e) => setF({ ...f, target: e.target.value })} className={`mt-1 ${input}`} />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => { setEditing(false); setF({}); }} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] text-muted">Cancel</button>
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-full bg-ink px-4 py-1.5 text-[11.5px] font-semibold text-page disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
          <p className="text-[10.5px] leading-relaxed text-muted sm:col-span-2">
            The rates are the only thing here nobody can read out of REX. Everything else - the homes, their rents, the service on each and the day it came on - is live.
          </p>
        </div>
      ) : !data.basisSet ? (
        <NeedsRate what="the management rate and the set-up fee" />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              <span className="figures text-[28px] leading-none">{short(predicted)}</span>
              <span className="ml-1.5 text-[11px] text-muted">predicted</span>
            </span>
            {target != null && (
              <span>
                <span className="figures text-[17px] leading-none text-muted">{short(target)}</span>
                <span className="ml-1.5 text-[11px] text-muted">wanted</span>
              </span>
            )}
            {onCourse != null && (
              <Pill tone={onCourse >= 100 ? "good" : onCourse >= 90 ? "neutral" : "accent"}>
                {onCourse}% of target
              </Pill>
            )}
          </div>

          {h > 1 && (
            <>
              {/* Bars from zero, because a truncated axis flatters a modest
                  trend. The monthly target rides across them, which is what
                  makes an otherwise level chart worth looking at. */}
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
                        className={`w-full rounded-t-[3px] ${m.projected ? "bg-accent-dark/35" : "bg-ink/70"}`}
                        style={{ height: `${Math.max(3, Math.round(((m.totalPence ?? 0) / peak) * 88))}px` }}
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
                Solid is what the book earned, faded is where it goes if it keeps growing at {data.growth.perMonth} homes a month, the rate it actually grew over the last year.
                {target != null ? ` The dashed line is the ${short(target / 12)} a month your target needs.` : ""} Fees net of VAT.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
