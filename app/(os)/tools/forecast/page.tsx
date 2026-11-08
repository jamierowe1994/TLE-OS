"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import type { Forecast } from "@/components/widgets-forecast";

/**
 * TOOLS > FORECAST (James, 8 Nov 2026: "we click forecasts, and then
 * forecast just opens out into finances. We should have a forecasting tool in
 * here so we can forecast over the next 12 or 18 months").
 *
 * The starting point is the book as it stands, read live by
 * /api/finances/forecast: the homes earning a monthly fee, their rent, the
 * fee rates set in Finances, the pace the book actually grew over the last
 * year. The agent then moves three dials - homes won a month, homes lost a
 * month, new lets a month - and the months ahead redraw. Nothing is typed in
 * as a figure: an unset rate leaves the money out and says so.
 */

type Horizon = 12 | 18;

const GBP0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const money = (pence: number) => GBP0.format(Math.round(pence / 100));
const short = (pence: number) => {
  const p = pence / 100;
  return p >= 100_000 ? `£${(p / 1000).toFixed(0)}k` : p >= 10_000 ? `£${(p / 1000).toFixed(1)}k` : GBP0.format(Math.round(p));
};
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "Europe/London" });

type Row = { label: string; homes: number; feeable: number; rentPence: number; mgmtPence: number | null; setupPence: number | null; totalPence: number | null };

export default function ForecastTool() {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(12);
  const [won, setWon] = useState<number | null>(null);
  const [lost, setLost] = useState(0);
  const [lets, setLets] = useState<number | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);

  const load = () =>
    fetch("/api/finances/forecast", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Forecast & { error?: string }) => {
        if (!j || !j.ok) setError(j?.reason ?? j?.error ?? "The book couldn't be read just now.");
        else setData(j);
      })
      .catch(() => setError("The book couldn't be read just now. Check your connection and try again."));
  useEffect(() => {
    void load();
  }, []);

  /* What the book itself says, before anybody touches a dial. */
  const base = useMemo(() => {
    if (!data || !data.live) return null;
    const g = data.growth;
    const first = data.ahead[0];
    const feeableNow = g.managedNow;
    const avgRent = feeableNow ? g.feeableRentNowPence / feeableNow : 0;
    /* The share of new homes that earn a monthly fee, read back off the book's own first projected month. */
    const share = first && g.perMonth > 0 && avgRent > 0 ? Math.max(0, Math.min(1, (first.feeableRentPence - g.feeableRentNowPence) / (g.perMonth * avgRent))) : 1;
    const blended = first && first.managementFeePence != null && first.feeableRentPence ? first.managementFeePence / first.feeableRentPence : null;
    const setupPerLet = first && first.setupFeePence != null && first.newLets ? first.setupFeePence / first.newLets : first?.setupFeePence === 0 ? 0 : null;
    return {
      homesNow: g.propertiesNow,
      feeableNow,
      rentNow: g.feeableRentNowPence,
      avgRent,
      share,
      blended,
      setupPerLet,
      wonDefault: Math.round(g.perMonth * 10) / 10,
      letsDefault: first ? first.newLets : 0,
    };
  }, [data]);

  const wonNow = won ?? base?.wonDefault ?? 0;
  const letsNow = lets ?? base?.letsDefault ?? 0;

  const rows: Row[] = useMemo(() => {
    if (!base) return [];
    const out: Row[] = [];
    const now = new Date();
    let homes = base.homesNow;
    let feeable = base.feeableNow;
    let rent = base.rentNow;
    for (let i = 1; i <= horizon; i++) {
      const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
      homes = Math.max(0, homes + wonNow - lost);
      const feeChange = wonNow * base.share - lost * (base.feeableNow / Math.max(1, base.homesNow));
      feeable = Math.max(0, feeable + feeChange);
      rent = Math.max(0, rent + feeChange * base.avgRent);
      const mgmt = base.blended == null ? null : Math.round(rent * base.blended);
      const setup = base.setupPerLet == null ? null : Math.round(base.setupPerLet * letsNow);
      out.push({
        label: monthLabel(m),
        homes: Math.round(homes),
        feeable: Math.round(feeable),
        rentPence: Math.round(rent),
        mgmtPence: mgmt,
        setupPence: setup,
        totalPence: mgmt == null && setup == null ? null : (mgmt ?? 0) + (setup ?? 0),
      });
    }
    return out;
  }, [base, horizon, wonNow, lost, letsNow]);

  const priced = rows.some((r) => r.totalPence != null);
  const total = rows.reduce((a, r) => a + (r.totalPence ?? 0), 0);
  const first12 = rows.slice(0, 12).reduce((a, r) => a + (r.totalPence ?? 0), 0);
  const last = rows[rows.length - 1];
  const max = Math.max(1, ...rows.map((r) => r.totalPence ?? 0));
  const target = data?.targetPence ?? null;
  const targetMonthly = target != null ? target / 12 : null;
  const moved = won != null || lost !== 0 || lets != null;

  const saveTarget = async () => {
    if (targetDraft == null) return;
    const v = targetDraft.replace(/[^0-9.]/g, "");
    setSavingTarget(true);
    await fetch("/api/finances/forecast", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annualTargetPence: v ? Math.round(Number(v) * 100) : null }),
    }).catch(() => null);
    setSavingTarget(false);
    setTargetDraft(null);
    void load();
  };

  return (
    <div data-look="new" className="nl-page nl-rise nl-edge nl-fc">
      <Link href="/tools" className="nl-fc-back">
        <span aria-hidden>‹</span> Tools
      </Link>
      <Mast
        eyebrow="Getting paid"
        title="Forecast"
        blurb="Where the book lands over the next 12 or 18 months. It starts from the homes you have today and the pace the book really grew; move the dials to see what changes."
      />

      {error ? (
        <div className="nl-fc-card nl-fc-off" role="alert">
          <p>{error}</p>
          <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { setError(null); void load(); }}>Try again</button>
        </div>
      ) : !data ? (
        <div className="nl-fc-card nl-fc-wait"><span className="nl-fc-spin" aria-hidden /> Reading the book…</div>
      ) : !base ? (
        <div className="nl-fc-card nl-fc-off"><p>{data.reason ?? "The book isn't connected here, so there is nothing to forecast from."}</p></div>
      ) : (
        <>
          {/* ── the dials ── */}
          <section className="nl-fc-dials">
            <div className="nl-fc-card">
              <p className="nl-fc-k">Look ahead</p>
              <div className="nl-fc-seg" role="radiogroup" aria-label="How far ahead">
                {([12, 18] as Horizon[]).map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={horizon === h} className={horizon === h ? "is-on" : ""} onClick={() => setHorizon(h)}>
                    {h} months
                  </button>
                ))}
              </div>
              <p className="nl-fc-note">From {rows[0]?.label} to {last?.label}.</p>
            </div>
            <Dial label="Homes won a month" value={wonNow} min={0} max={Math.max(20, Math.ceil(base.wonDefault * 3))} step={0.5} onChange={setWon} hint={`The book has grown by ${base.wonDefault} a month over the last year.`} />
            <Dial label="Homes lost a month" value={lost} min={0} max={10} step={0.5} onChange={setLost} hint="Landlords who leave or sell. Not read from the book, so it starts at none." />
            <Dial label="New lets a month" value={letsNow} min={0} max={Math.max(30, base.letsDefault * 3)} step={1} onChange={setLets} hint={`${base.letsDefault} a month over the last year, each earning its set-up fee.`} />
          </section>
          {moved && (
            <button type="button" className="nl-link nl-fc-reset" onClick={() => { setWon(null); setLost(0); setLets(null); }}>
              Back to the book&apos;s own pace
            </button>
          )}

          {/* ── the answer ── */}
          <section className="nl-fc-figs">
            <Fig tone="terra" label={`Next ${horizon} months`} value={priced ? money(total) : "Rates not set"} sub={priced ? "Management and set-up fees" : "Set the fee rates in Finances"} />
            <Fig tone="olive" label={`A month by ${last?.label}`} value={last?.totalPence != null ? money(last.totalPence) : "-"} sub={last ? `${money(last.rentPence)} rent under fee` : ""} />
            <Fig tone="clay" label={`Homes by ${last?.label}`} value={last ? last.homes.toLocaleString("en-GB") : "-"} sub={`${base.homesNow.toLocaleString("en-GB")} today`} />
            <div className="nl-fc-fig" data-tone="brown">
              <p className="nl-fc-k">Your 12-month target</p>
              {targetDraft == null ? (
                <>
                  <p className="nl-fc-v">{target != null ? money(target) : "Not set"}</p>
                  <p className="nl-fc-sub">
                    {target != null && priced ? (first12 >= target ? `On course to beat it by ${money(first12 - target)}` : `${money(target - first12)} short on this pace`) : "What you want the next year to earn"}
                  </p>
                  <button type="button" className="nl-link" onClick={() => setTargetDraft(target != null ? String(Math.round(target / 100)) : "")}>
                    {target != null ? "Change" : "Set a target"}
                  </button>
                </>
              ) : (
                <form className="nl-fc-target" onSubmit={(e) => { e.preventDefault(); void saveTarget(); }}>
                  <span>£</span>
                  <input autoFocus inputMode="numeric" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} aria-label="Target for the next 12 months, in pounds" />
                  <button type="submit" className="nl-btn nl-btn--primary nl-btn--sm" disabled={savingTarget}>{savingTarget ? "Saving…" : "Save"}</button>
                </form>
              )}
            </div>
          </section>

          {/* ── month by month ── */}
          <section className="nl-fc-card nl-fc-chart">
            <header>
              <h2 className="nl-fc-h">Month by Month</h2>
              <p className="nl-fc-key">
                <span><i className="is-olive" />Management</span>
                <span><i className="is-clay" />Set-up</span>
                {targetMonthly != null && <span><i className="is-line" />Target a month</span>}
              </p>
            </header>
            {priced ? (
              <div className="nl-fc-bars" style={{ ["--n" as string]: rows.length }}>
                {rows.map((r, i) => {
                  const top = Math.max(max, targetMonthly ?? 0) * 1.08;
                  return (
                    <div key={r.label} className="nl-fc-col" title={`${r.label}: ${r.totalPence != null ? money(r.totalPence) : "-"}`}>
                      <div className="nl-fc-plot">
                        {targetMonthly != null && <i className="nl-fc-goal" style={{ bottom: `${(targetMonthly / top) * 100}%` }} aria-hidden />}
                        <span className="nl-fc-stack" style={{ height: `${((r.totalPence ?? 0) / top) * 100}%`, animationDelay: `${i * 30}ms` }}>
                          <span className="nl-fc-amt">{r.totalPence != null ? short(r.totalPence) : ""}</span>
                          <i className="is-clay" style={{ flexGrow: r.setupPence ?? 0 }} />
                          <i className="is-olive" style={{ flexGrow: r.mgmtPence ?? 0 }} />
                        </span>
                      </div>
                      <span className="nl-fc-m">{r.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="nl-fc-off-line">
                The fee rates aren&apos;t set yet, so no money is drawn. {data.canSetRates ? <Link href="/finances" className="nl-link">Set them in Finances</Link> : "An owner sets them in Finances."} Homes and rent are below.
              </p>
            )}
          </section>

          <section className="nl-fc-card nl-fc-table">
            <table>
              <thead>
                <tr><th>Month</th><th>Homes</th><th>Earning a fee</th><th>Rent under fee</th><th>Management</th><th>Set-up</th><th>Total</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.homes.toLocaleString("en-GB")}</td>
                    <td>{r.feeable.toLocaleString("en-GB")}</td>
                    <td>{money(r.rentPence)}</td>
                    <td>{r.mgmtPence != null ? money(r.mgmtPence) : "-"}</td>
                    <td>{r.setupPence != null ? money(r.setupPence) : "-"}</td>
                    <td className="is-total">{r.totalPence != null ? money(r.totalPence) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="nl-fc-foot">
            How it works: today&apos;s {base.feeableNow.toLocaleString("en-GB")} homes earning a monthly fee, at today&apos;s rents and the fee rates set in Finances. Each home won is worth the average rent of the ones you have, and earns a monthly fee about as often as the homes won last year did. Rents are held where they are today. {data.whole ? "Across the whole business." : "Your own homes."}
          </p>
        </>
      )}
    </div>
  );
}

function Dial({ label, value, min, max, step, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint: string }) {
  return (
    <label className="nl-fc-card nl-fc-dial">
      <span className="nl-fc-k">{label}</span>
      <span className="nl-fc-dv">{value % 1 ? value.toFixed(1) : value}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="nl-fc-note">{hint}</span>
    </label>
  );
}

function Fig({ tone, label, value, sub }: { tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="nl-fc-fig" data-tone={tone}>
      <p className="nl-fc-k">{label}</p>
      <p className="nl-fc-v">{value}</p>
      <p className="nl-fc-sub">{sub}</p>
    </div>
  );
}
