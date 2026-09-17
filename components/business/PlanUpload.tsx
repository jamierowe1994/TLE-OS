"use client";

import { useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { looksLikeAccounts, mergeAccounts, parseAccounts, parsePlan, type ParsedAccounts, type ParsedPlan, type YearPlan } from "@/lib/business/plan-import";
import { formatDate } from "@/lib/business/format";

/**
 * Upload Susan's year sheet ("H1 Actuals & H2 Forecast").
 *
 * Numbers: File → Export To → CSV. Excel: Save As → CSV. Or copy the table and
 * paste it. Nothing is saved until the preview has been read and Save pressed:
 * a sheet with the wrong year or a missing total row produces a page of
 * plausible, wrong figures, so what was matched and what wasn't is shown first.
 */
export default function PlanUpload({
  year,
  current,
  onSaved,
}: {
  year: number;
  current: { fileName: string | null; importedAt: string } | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  /* The accountant's P&L is recognised by its shape and replaces the months it
     covers; Susan's sheet replaces the whole plan. */
  const [accounts, setAccounts] = useState<ParsedAccounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function read(t: string, name: string | null) {
    setText(t);
    setFileName(name);
    setAccounts(null);
    if (looksLikeAccounts(t)) {
      setParsed(null);
      const a = parseAccounts(t, year, name);
      if ("error" in a) setError(a.error);
      else {
        setError(null);
        setAccounts(a);
      }
      return;
    }
    const r = parsePlan(t, year, name);
    if ("error" in r) {
      setError(r.error);
      setParsed(null);
    } else {
      setError(null);
      setParsed(r);
    }
  }

  async function save() {
    if (!parsed && !accounts) return;
    setBusy(true);
    setError(null);
    try {
      let body: unknown = parsed?.plan;
      if (accounts) {
        const cur = await fetch(`/api/business/plan?year=${year}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const existing = (cur as { plan: YearPlan | null } | null)?.plan ?? null;
        /* A sheet uploaded earlier keeps its months; only the accounts'
           months are replaced. Without a sheet the later months stay empty. */
        body = mergeAccounts(existing, accounts, year);
      }
      const res = await fetch("/api/business/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);
      setOpen(false);
      setParsed(null);
      setAccounts(null);
      setText("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-ink/40"
        title={current ? `Current sheet: ${current.fileName ?? "pasted"}, ${formatDate(current.importedAt)}` : undefined}
      >
        <span className="text-accent-dark">
          <DoodleIcon name="upload" size={14} />
        </span>
        {current ? "Upload a new sheet" : "Upload Susan's sheet"}
      </button>
    );
  }

  const forecastMonths = parsed ? parsed.plan.months.filter((m) => parsed.plan.basis[m] === "forecast") : [];
  return (
    <div className="card w-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Upload the {year} sheet</h3>
          <p className="mt-1 text-[12px] text-muted">
            Susan&rsquo;s year sheet, or the accountant&rsquo;s monthly P&amp;L. From Numbers: File, Export To, CSV. From
            QuickBooks: export the Profit and Loss by month to CSV. Or copy the whole table and paste it below.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-muted hover:text-ink">
          Close
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:border-ink/40"
        >
          Choose a CSV
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,.tsv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) read(await f.text(), f.name);
          }}
        />
        {fileName ? <span className="text-[12px] text-muted">{fileName}</span> : null}
      </div>
      <textarea
        value={text}
        onChange={(e) => read(e.target.value, null)}
        placeholder="…or paste the table here"
        className="mt-3 h-24 w-full rounded-xl border border-line bg-card p-3 font-mono text-[11px]"
      />
      {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      {accounts ? (
        <div className="mt-3 space-y-1.5 text-[12px]">
          <p className="text-ink">
            The accountant&rsquo;s P&amp;L, {accounts.months.length} months (
            {accounts.months.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })).join(", ")}).
            These replace the sheet&rsquo;s figures for those months; the rest of the year is left as it is.
          </p>
          {accounts.problems.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <p className="font-semibold">These months don&rsquo;t add up, so nothing will be saved:</p>
              <ul className="mt-1 list-disc pl-4">
                {accounts.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="mt-1">Export the P&amp;L to CSV from QuickBooks rather than copying it off the PDF.</p>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="mt-2 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Saving" : "Save the accounts"}
            </button>
          )}
        </div>
      ) : null}
      {parsed ? (
        <div className="mt-3 space-y-1.5 text-[12px]">
          <p className="text-ink">
            Read {parsed.matched.length} lines across {parsed.plan.months.length} months.{" "}
            {forecastMonths.length
              ? `Forecast from ${new Date(`${forecastMonths[0]}-01`).toLocaleString("en-GB", { month: "long" })}.`
              : "Every month is marked actual."}
          </p>
          {parsed.missing.length ? <p className="text-muted">Not on this sheet: {parsed.missing.join(", ")}.</p> : null}
          {parsed.unread.length ? (
            <p className="text-muted">Left out, not P&amp;L lines: {parsed.unread.slice(0, 12).join(", ")}{parsed.unread.length > 12 ? "…" : ""}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="mt-2 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving" : current ? "Replace the sheet" : "Save the sheet"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
