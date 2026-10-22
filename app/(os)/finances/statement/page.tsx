"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
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
    /* A first read of a period can outlast one request (the server answers
       "reading" after 45 seconds, and the front door gives up at 100), so
       the screen asks again until the figures are in - about ten minutes,
       then it says so. */
    const ask = (tries: number) => {
      fetch(`/api/finances/statement?${qs}`, { cache: "no-store" })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as Answer | null;
          if (!live) return;
          const reading = j?.statement && !j.statement.ok && j.statement.kind === "reading";
          const gateway = !j && r.status >= 502 && r.status <= 524;
          if ((reading || gateway) && tries < 40) {
            timer = setTimeout(() => ask(tries + 1), 5_000);
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
    ask(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [qs, customReady]);

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

  return (
    <>
      <PageHeader
        title="Commission Statement"
        blurb="Every payment PayProp made you for the period you pick, ready to download as a statement."
        search={false}
        actions={
          <Link
            href="/finances"
            className="flex items-center gap-1.5 rounded-full border border-line/80 bg-page px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
          >
            Back to Finances
          </Link>
        }
      />

      <section className="rounded-2xl border border-line/70 bg-card p-4 sm:p-5">
        {answer?.canPick && (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[12px] text-muted">Agent</span>
            <select
              value={agentId ?? answer.agent?.id ?? ""}
              onChange={(e) => setAgentId(e.target.value || null)}
              className="w-full rounded-xl border border-line bg-page px-3 py-2.5 text-[14px] text-ink sm:w-80"
            >
              <option value="">Choose an agent</option>
              {(answer.agents ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        )}

        <span className="mb-1.5 block text-[12px] text-muted">Period</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Period">
          {PERIOD_CHOICES.map((c) => (
            <button
              key={c.kind}
              type="button"
              role="radio"
              aria-checked={kind === c.kind}
              onClick={() => choose(c.kind)}
              className={`rounded-full px-4 py-2 text-[13px] transition-colors ${
                kind === c.kind ? "bg-accent-dark font-semibold text-page" : "border border-line/80 bg-page text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {kind === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">From</span>
              <input type="date" value={from} min={STATEMENT_FLOOR} max={today} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-xl border border-line bg-page px-3 py-2 text-[14px] text-ink" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">To</span>
              <input type="date" value={to} min={from || STATEMENT_FLOOR} max={today} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border border-line bg-page px-3 py-2 text-[14px] text-ink" />
            </label>
          </div>
        )}
      </section>

      <div className="mt-5">
        {!customReady ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">
            Pick a start and an end date. PayProp&apos;s history here starts on {dayWords(STATEMENT_FLOOR)}.
          </p>
        ) : loading ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/70 bg-card px-5 py-14 text-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden />
            <p className="text-[14px] text-ink">Reading your payments from PayProp</p>
            {slow && <p className="max-w-sm text-[12px] text-muted">A long period can take a minute or two the first time.</p>}
          </div>
        ) : error ? (
          <Problem text={error} />
        ) : answer && !answer.agent ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">
            Choose an agent to see their statement.
          </p>
        ) : answer && s && !s.ok ? (
          <Problem text={s.problem} />
        ) : answer && ok ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-normal tracking-normal text-ink">
                  {answer.period.title}
                </h2>
                <p className="text-[12px] text-muted">
                  {answer.agent?.name} · {dayWords(answer.period.from)} to {dayWords(answer.period.to)}{answer.period.toDate ? ", so far" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={download}
                disabled={saving}
                className="flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-page/40 border-t-page" aria-hidden />
                ) : (
                  <DoodleIcon name="doc" size={14} />
                )}
                {saving ? "Preparing PDF" : "Download PDF"}
              </button>
            </div>

            {saveError && <div className="mt-3"><Problem text={saveError} /></div>}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Commission paid" value={money(ok.total)} tint />
              <Tile label="Net of VAT" value={money(ok.totalNet)} />
              <Tile label="Payments" value={String(ok.lines.length)} />
              <Tile label="Homes" value={String(homes)} />
            </div>

            {ok.lines.length ? (
              <Lines title="Every Payment" lines={ok.lines} byMonth />
            ) : (
              <p className="mt-5 rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">
                No commission was paid to {answer.agent?.name ?? "you"} through PayProp in this period.
              </p>
            )}

            {ok.other.length > 0 && (
              <>
                <Lines
                  title="Also Paid to You, Not Commission"
                  note="Money PayProp passed on that is not a fee, such as contractor work. Not in the commission total."
                  lines={ok.other}
                />
                <p className="mt-2 text-right text-[13px] text-muted">Total, not commission: <span className="text-ink">{money(ok.otherTotal)}</span></p>
              </>
            )}

            <p className="mt-6 text-[12px] leading-relaxed text-muted">
              Read from PayProp at {new Date(ok.readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} on{" "}
              {new Date(ok.readAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })}. Each payment sits on the day PayProp sent it.
              Net of VAT takes one sixth off, as the accounts do.
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/50 bg-accent-soft/60 px-5 py-4 text-[13px] text-ink">
      <DoodleIcon name="info" size={16} className="mt-0.5" />
      <div>
        <p>{text}</p>
        <p className="mt-1 text-[12px] text-muted">Nothing to download until every figure is in.</p>
      </div>
    </div>
  );
}

function Tile({ label, value, tint }: { label: string; value: string; tint?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line/70 px-4 py-3 ${tint ? "bg-accent-soft/70" : "bg-card"}`}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-1 text-[20px] tabular-nums text-ink">{value}</p>
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
    <section className="mt-6">
      <h3 className="text-[16px] font-normal tracking-normal text-ink">{title}</h3>
      {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
      <div className="mt-3 overflow-hidden rounded-2xl border border-line/70 bg-card">
        <div className="hidden grid-cols-[96px_1fr_180px_100px] gap-3 border-b border-line/70 px-4 py-2 text-[11px] text-muted sm:grid">
          <span>Paid on</span><span>Property</span><span>Type</span><span className="text-right">Amount</span>
        </div>
        {groups.map((g) => {
          const sum = g.lines.reduce((n, l) => n + l.amount, 0);
          return (
            <div key={g.month}>
              {byMonth && (
                <div className="flex items-baseline justify-between bg-page/60 px-4 py-2 text-[12px]">
                  <span className="text-accent-dark">{monthWords(`${g.month}-01`)}</span>
                  <span className="tabular-nums text-muted">{money(sum)}</span>
                </div>
              )}
              {g.lines.map((l, i) => (
                <div key={`${l.paidOn}-${l.propertyId}-${l.category}-${i}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-line/40 px-4 py-2.5 text-[13px] sm:grid-cols-[96px_1fr_180px_100px] sm:items-center">
                  <span className="hidden text-muted sm:block">{dayShort(l.paidOn)}</span>
                  <span className="min-w-0 truncate text-ink">{l.property}</span>
                  <span className="hidden truncate text-muted sm:block">{l.category}</span>
                  <span className="text-right tabular-nums text-ink">{money(l.amount)}</span>
                  <span className="col-span-2 text-[11px] text-muted sm:hidden">{dayShort(l.paidOn)} · {l.category}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
