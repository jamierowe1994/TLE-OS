"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import {
  PERIOD_CHOICES, STATEMENT_FLOOR, dayShort, dayWords, londonTodayIso, monthWords, periodQuery,
  type Period, type PeriodKind,
} from "@/lib/statement-period";

/**
 * The commission statement on Finances (agents' call, 19 Oct 2026): pick a
 * period, see every payment PayProp made you, download it as a TLE PDF.
 * Rhiannon Dodge rarely gets PayProp's monthly statements, and until this
 * James was sending them by hand.
 *
 * The figures are PayProp's own payments to the partner, the same rows
 * Company figures counts as their earnings. If PayProp cannot answer for
 * every agency the page says so and there is nothing to download.
 */

type Line = { paidOn: string; property: string; propertyId: string; category: string; amount: number; net: number };
type Statement =
  | { ok: true; lines: Line[]; other: Line[]; total: number; totalNet: number; otherTotal: number; readAt: string }
  | { ok: false; kind: string; problem: string };
type Answer = {
  ok: boolean;
  error?: string;
  canPick: boolean;
  agents: { id: string; name: string }[] | null;
  agent: { id: string; name: string } | null;
  period: Period;
  statement: Statement | null;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => GBP.format(n);
const PICK_KEY = "tle-statement-period";

export default function CommissionStatement() {
  const [kind, setKind] = useState<PeriodKind>("last-month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* True once the server has said "still reading": the first read of a
     period, which takes a minute or two whatever the period. */
  const [reading, setReading] = useState(false);
  /* Bumped by Try again, to ask afresh for the same period and agent. */
  const [attempt, setAttempt] = useState(0);

  /* The period chosen last time, a per-person convenience only. */
  useEffect(() => {
    try {
      const k = localStorage.getItem(PICK_KEY);
      if (k && PERIOD_CHOICES.some((c) => c.kind === k) && k !== "custom") setKind(k as PeriodKind);
    } catch { /* private window: the default is fine */ }
  }, []);

  const customReady = kind !== "custom" || (Boolean(from) && Boolean(to));
  const qs = useMemo(() => periodQuery(kind, { from, to }, agentId), [kind, from, to, agentId]);

  useEffect(() => {
    if (!customReady) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);
    setReading(false);
    /* A first read of a period can outlast one request (the server answers
       "reading" after 20 seconds, and the front door gives up at 100), so
       the screen asks again until the figures are in - for ten minutes,
       then it says so and offers Try again. Susan Liles, 3 Nov 2026: by the
       clock rather than a count of asks, now that each ask is shorter. */
    const started = Date.now();
    const ask = () => {
      fetch(`/api/finances/statement?${qs}`, { cache: "no-store" })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as Answer | null;
          if (!live) return;
          const reading = j?.statement && !j.statement.ok && j.statement.kind === "reading";
          const gateway = !j && r.status >= 502 && r.status <= 524;
          if ((reading || gateway) && Date.now() - started < 10 * 60_000) {
            setReading(true);
            timer = setTimeout(ask, 5_000);
            return;
          }
          if (!j?.ok) setError(j?.error ?? "The statement would not load.");
          else setAnswer(j);
          setLoading(false);
        })
        .catch(() => {
          if (!live) return;
          setError("The statement would not load. Check your connection and try again.");
          setLoading(false);
        });
    };
    ask();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [qs, customReady, attempt]);

  /* Fetched rather than linked, so a refusal reads as a sentence on the
     page and never as raw text in a new tab. */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const download = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/finances/statement/pdf?${qs}`, { cache: "no-store" });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        setSaveError(j?.error ?? "The PDF would not download. Try again in a minute.");
        return;
      }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "TLE Commission Statement.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setSaveError("The PDF would not download. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const choose = (k: PeriodKind) => {
    setKind(k);
    try { localStorage.setItem(PICK_KEY, k); } catch { /* fine */ }
  };

  const s = answer?.statement ?? null;
  const ok = s && s.ok ? s : null;
  const homes = ok ? new Set(ok.lines.map((l) => l.propertyId || l.property)).size : 0;
  const today = londonTodayIso();
  const slow = kind === "tax-year" || kind === "calendar-year" || kind === "custom";

  /* By month and by home, for the pictures (James, 8 Nov 2026: "start doing some work on the commission statement section"). */
  const byMonth = ok ? groupSum(ok.lines, (l) => l.paidOn.slice(0, 7)) : [];
  const byHome = ok ? groupSum(ok.lines, (l) => l.property).sort((x, y) => y.sum - x.sum).slice(0, 6) : [];
  const monthTop = Math.max(1, ...byMonth.map((m) => m.sum));
  const homeTop = Math.max(1, ...byHome.map((m) => m.sum));

  return (
    <div data-look="new" className="nl-page nl-rise nl-edge nl-cs">
      <Link href="/finances" className="nl-fc-back"><span aria-hidden>‹</span> Finances</Link>
      <Mast
        eyebrow="Finances"
        title="Commission Statement"
        blurb="Every payment PayProp made you for the period you pick, ready to download as a statement."
        actions={
          ok ? (
            <button type="button" onClick={download} disabled={saving} className="nl-btn nl-btn--primary">
              {saving ? <span className="nl-fc-spin nl-cs-spin" aria-hidden /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              )}
              {saving ? "Preparing the PDF" : "Download PDF"}
            </button>
          ) : undefined
        }
      />

      <section className="nl-fc-card nl-cs-pick">
        {answer?.canPick && (
          <label className="nl-cs-agent">
            <span className="nl-fc-k">Agent</span>
            <select value={agentId ?? answer.agent?.id ?? ""} onChange={(e) => setAgentId(e.target.value || null)}>
              <option value="">Choose an agent</option>
              {(answer.agents ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="nl-cs-period">
          <span className="nl-fc-k">Period</span>
          <div className="nl-fc-seg nl-cs-seg" role="radiogroup" aria-label="Period">
            {PERIOD_CHOICES.map((c) => (
              <button key={c.kind} type="button" role="radio" aria-checked={kind === c.kind} className={kind === c.kind ? "is-on" : ""} onClick={() => choose(c.kind)}>
                {c.label}
              </button>
            ))}
          </div>
          {kind === "custom" && (
            <div className="nl-cs-dates">
              <label>
                <span className="nl-fc-k">From</span>
                <input type="date" value={from} min={STATEMENT_FLOOR} max={today} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                <span className="nl-fc-k">To</span>
                <input type="date" value={to} min={from || STATEMENT_FLOOR} max={today} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          )}
        </div>
      </section>

      <div className="nl-cs-body">
        {!customReady ? (
          <p className="nl-cs-quiet">Pick a start and an end date. PayProp&apos;s history here starts on {dayWords(STATEMENT_FLOOR)}.</p>
        ) : loading ? (
          <div className="nl-fc-card nl-cs-wait">
            <span className="nl-fc-spin" aria-hidden />
            <p>{answer?.canPick && agentId ? "Reading the payments from PayProp" : "Reading your payments from PayProp"}</p>
            {(slow || reading) && <p className="nl-fc-note">The first read of a period can take a minute or two. It carries on while you wait, and after that it is quick.</p>}
          </div>
        ) : error ? (
          <Problem text={error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : answer && !answer.agent ? (
          <p className="nl-cs-quiet">Choose an agent to see their statement.</p>
        ) : answer && s && !s.ok ? (
          <Problem text={s.problem} onRetry={s.kind === "reading" || s.kind === "unreachable" ? () => setAttempt((n) => n + 1) : undefined} />
        ) : answer && ok ? (
          <>
            <header className="nl-cs-head">
              <h2 className="nl-fc-h">{answer.period.title}</h2>
              <p className="nl-fc-sub">
                {answer.agent?.name} · {dayWords(answer.period.from)} to {dayWords(answer.period.to)}{answer.period.toDate ? ", so far" : ""}
              </p>
            </header>
            {saveError && <Problem text={saveError} />}

            <section className="nl-fc-figs">
              <div className="nl-fc-fig" data-tone="terra"><p className="nl-fc-k">Commission Paid</p><p className="nl-fc-v">{money(ok.total)}</p><p className="nl-fc-sub">With VAT</p></div>
              <div className="nl-fc-fig" data-tone="olive"><p className="nl-fc-k">Net of VAT</p><p className="nl-fc-v">{money(ok.totalNet)}</p><p className="nl-fc-sub">One sixth off, as the accounts do</p></div>
              <div className="nl-fc-fig" data-tone="clay"><p className="nl-fc-k">Payments</p><p className="nl-fc-v">{ok.lines.length.toLocaleString("en-GB")}</p><p className="nl-fc-sub">From PayProp</p></div>
              <div className="nl-fc-fig" data-tone="brown"><p className="nl-fc-k">Homes</p><p className="nl-fc-v">{homes.toLocaleString("en-GB")}</p><p className="nl-fc-sub">{homes ? `${money(ok.total / homes)} a home` : "None paid"}</p></div>
            </section>

            {ok.lines.length > 0 && (
              <section className="nl-cs-pics">
                {byMonth.length > 1 && (
                  <div className="nl-fc-card">
                    <h3 className="nl-fc-k nl-cs-pic-h">By Month</h3>
                    <ol className="nl-cs-bars">
                      {byMonth.map((m, i) => (
                        <li key={m.key}>
                          <span className="nl-cs-bl">{monthWords(`${m.key}-01`)}</span>
                          <span className="nl-cs-bt"><i className={i === byMonth.length - 1 ? "is-terra" : "is-olive"} style={{ width: `${(m.sum / monthTop) * 100}%` }} /></span>
                          <b>{money(m.sum)}</b>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <div className="nl-fc-card">
                  <h3 className="nl-fc-k nl-cs-pic-h">The Homes That Paid Most</h3>
                  <ol className="nl-cs-bars">
                    {byHome.map((m, i) => (
                      <li key={m.key}>
                        <span className="nl-cs-bl">{m.key}</span>
                        <span className="nl-cs-bt"><i className={["is-terra", "is-clay", "is-olive", "is-sage", "is-brown", "is-clay"][i]} style={{ width: `${(m.sum / homeTop) * 100}%` }} /></span>
                        <b>{money(m.sum)}</b>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            )}

            {ok.lines.length ? (
              <Lines title="Every Payment" lines={ok.lines} byMonth />
            ) : (
              <p className="nl-cs-quiet">No commission was paid to {answer.agent?.name ?? "you"} through PayProp in this period.</p>
            )}

            {ok.other.length > 0 && (
              <>
                <Lines title="Also Paid to You, Not Commission" note="Money PayProp passed on that is not a fee, such as contractor work. Not in the commission total." lines={ok.other} />
                <p className="nl-cs-othertotal">Total, not commission: <b>{money(ok.otherTotal)}</b></p>
              </>
            )}

            <p className="nl-fc-foot">
              Read from PayProp at {new Date(ok.readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} on{" "}
              {new Date(ok.readAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })}. Each payment sits on the day PayProp sent it. Net of VAT takes one sixth off, as the accounts do.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function groupSum(lines: Line[], keyOf: (l: Line) => string): { key: string; sum: number }[] {
  const m = new Map<string, number>();
  for (const l of lines) m.set(keyOf(l), (m.get(keyOf(l)) ?? 0) + l.amount);
  return [...m.entries()].map(([key, sum]) => ({ key, sum })).sort((a, b) => a.key.localeCompare(b.key));
}

function Problem({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="nl-fc-card nl-cs-problem" role="alert">
      <p>{text}</p>
      <p className="nl-fc-note">Nothing to download until every figure is in.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="nl-btn nl-btn--secondary nl-btn--sm">Try again</button>
      )}
    </div>
  );
}

function Lines({ title, note, lines, byMonth }: { title: string; note?: string; lines: Line[]; byMonth?: boolean }) {
  const groups: { month: string; lines: Line[] }[] = [];
  for (const l of lines) {
    const m = byMonth ? l.paidOn.slice(0, 7) : "all";
    const g = groups[groups.length - 1];
    if (g && g.month === m) g.lines.push(l);
    else groups.push({ month: m, lines: [l] });
  }
  return (
    <section className="nl-cs-lines">
      <h3 className="nl-fc-h">{title}</h3>
      {note && <p className="nl-fc-note">{note}</p>}
      <div className="nl-fc-card nl-cs-table">
        <div className="nl-cs-tr is-head"><span>Paid on</span><span>Property</span><span>Type</span><span>Amount</span></div>
        {groups.map((g) => {
          const sum = g.lines.reduce((n, l) => n + l.amount, 0);
          return (
            <div key={g.month}>
              {byMonth && (
                <div className="nl-cs-month"><span>{monthWords(`${g.month}-01`)}</span><span>{money(sum)}</span></div>
              )}
              {g.lines.map((l, i) => (
                <div key={`${l.paidOn}-${l.propertyId}-${l.category}-${i}`} className="nl-cs-tr">
                  <span className="nl-cs-day">{dayShort(l.paidOn)}</span>
                  <span className="nl-cs-prop">{l.property}<em>{dayShort(l.paidOn)} · {l.category}</em></span>
                  <span className="nl-cs-cat">{l.category}</span>
                  <span className="nl-cs-amt">{money(l.amount)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
