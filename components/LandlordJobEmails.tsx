"use client";

import { useEffect, useState } from "react";
import Segmented from "@/components/Segmented";
import { useSaveReporter } from "@/components/SaveChip";
import type { JobEmails, LandlordPref } from "@/lib/landlord-prefs";
import type { WorksOrder } from "@/lib/works-orders";

/**
 * "Emails to Sarah about jobs: Every job / Only over £250 / None - we ring
 * them", saved as it is pressed (lib/landlord-prefs, 6 Oct 2026).
 *
 * On the job sheet it is read through the job; on a Portfolio card through
 * the landlord's email. Given the job, it also says the one thing the choice
 * changes for the agent: a quote awaiting a landlord who is not emailed has
 * to be rung for.
 */

const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export default function LandlordJobEmails({ job, landlord, name, order, className = "" }: {
  /** The works order id - the job sheet. */
  job?: string;
  /** The landlord's email - a Portfolio card. */
  landlord?: string;
  name: string;
  /** The job itself, for the "ring them for approval" line. */
  order?: Pick<WorksOrder, "status" | "quotePence" | "authorityPence">;
  className?: string;
}) {
  const reporter = useSaveReporter();
  const [pref, setPref] = useState<LandlordPref | null>(null);
  const [hasEmail, setHasEmail] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const first = (name || "").trim().split(/\s+/)[0] || "the landlord";
  const query = job ? `job=${encodeURIComponent(job)}` : landlord ? `landlord=${encodeURIComponent(landlord)}` : "";

  useEffect(() => {
    if (!query) return;
    let live = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/works-orders/landlord-pref?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j.ok) return setErr(j.error ?? "Couldn't read their email choice.");
        setHasEmail(j.hasEmail !== false);
        setPref(j.pref);
        setAmount(String(j.pref?.overAmount ?? 250));
      })
      .catch(() => live && setErr("Couldn't read their email choice."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [query]);

  async function save(jobEmails: JobEmails, overAmount: number) {
    const before = pref;
    setPref((p) => (p ? { ...p, jobEmails, overAmount } : p));
    setErr(null);
    const settle = reporter.begin("Landlord emails");
    const r = await fetch("/api/works-orders/landlord-pref", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(job ? { job } : { landlord }), jobEmails, overAmount, name }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      const problem = r?.error ?? "That didn't save.";
      setPref(before);
      setErr(problem);
      settle({ ok: false, problem, retry: () => void save(jobEmails, overAmount) });
      return;
    }
    setPref(r.pref);
    setAmount(String(r.pref.overAmount));
    settle({ ok: true });
  }

  if (!query || (!loading && !hasEmail)) return null;
  if (loading) return <p className={`text-[12px] text-muted ${className}`}>Reading {first}'s email choice…</p>;
  if (!pref) return err ? <p className={`text-[12px] text-accent-dark ${className}`}>{err}</p> : null;

  const over = pref.overAmount;
  const commitAmount = () => {
    const n = Math.round(Number(amount.replace(/[£,\s]/g, "")));
    if (!Number.isFinite(n) || n < 1) { setAmount(String(over)); return; }
    if (n !== over) void save("over", n);
  };
  /* The same rule the server holds an approval by (landlordHold). */
  const quote = order?.quotePence ?? order?.authorityPence ?? 0;
  const ring = order?.status === "approval" && (pref.jobEmails === "none" || (pref.jobEmails === "over" && quote <= over * 100));

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12px] text-muted">Emails to {first} about jobs</span>
        <Segmented<JobEmails>
          value={pref.jobEmails}
          onChange={(v) => { if (v !== pref.jobEmails) void save(v, over); }}
          options={[
            { id: "all", label: "Every job" },
            { id: "over", label: <><span className="sm:hidden">Over £{over}</span><span className="hidden sm:inline">Only over £{over}</span></>, title: `Only jobs over £${over}` },
            { id: "none", label: <><span className="sm:hidden">None</span><span className="hidden sm:inline">None - we ring them</span></>, title: "None - we ring them" },
          ]}
        />
        {pref.jobEmails === "over" && (
          <label className="flex items-center gap-1 text-[12px] text-muted">
            Over £
            <input
              value={amount}
              inputMode="numeric"
              onChange={(e) => setAmount(e.target.value)}
              onBlur={commitAmount}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Only email them about jobs over this many pounds"
              className="figures w-16 rounded-lg border border-line/80 bg-box px-2 py-1 text-[12.5px] text-ink outline-none focus:border-ink"
            />
          </label>
        )}
      </div>
      {pref.jobEmails !== "all" && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          {pref.jobEmails === "none" ? `No job emails to ${first}.` : `Job emails to ${first} only when the quote is over £${over}.`} The tenant and the contractor are still told. A quote that needs their yes comes to you to ring.
        </p>
      )}
      {ring && (
        <p className="mt-2 text-[12.5px] font-semibold text-accent-dark">
          Ring {first} for approval of {pounds(order?.quotePence)} - {pref.jobEmails === "none" ? "they've asked not to be emailed" : `they only want emails about jobs over £${over}`}.
        </p>
      )}
      {err && <p className="mt-1.5 text-[12px] text-accent-dark">{err}</p>}
    </div>
  );
}
