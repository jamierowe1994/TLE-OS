"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The tenant reporting something broken, and what they have reported already.
 *
 * ── Why the emergency route is a phone number, not a dropdown ────────────
 *
 * Emergency on a works order means attend within 24 hours, and the clock
 * starts when it is reported. A form that lets a tenant choose it lets a
 * tenant start the agency's own clock, and within a fortnight everything is an
 * emergency. So every report from here lands routine and an agent re-grades it
 * on reading - which is exactly what happens on the phone today - and a real
 * emergency is told to ring, because a burst pipe is not a form.
 *
 * Their own words go on the job verbatim. An agent triaging "the boiler makes
 * a banging noise when the heating comes on" can tell what it is; the same
 * thing squeezed into a category cannot.
 */

type Job = { id: string; ref: number; title: string; reportedAt: string; status: string };

const WHERE = [
  "Kitchen", "Bathroom", "Living room", "Bedroom", "Hallway", "Outside", "Garden",
  "Boiler / heating", "Electrics", "Somewhere else",
];

export default function ReportRepair({
  agentPhone,
  agentName,
  sample = false,
}: {
  agentPhone: string | null;
  agentName: string | null;
  /** The harness at /tenant/demo has no tenant session, so it must not call
   *  the route and must not pretend the button works. Shown, explained, inert
   *  - a demo that 401s is worse than one that says what it is. */
  sample?: boolean;
}) {
  const [where, setWhere] = useState(WHERE[0]);
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);

  const load = useCallback(() => {
    if (sample) { setJobs([]); return; }
    fetch("/api/tenant/maintenance", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setJobs(j.ok ? j.jobs : []))
      .catch(() => setJobs([]));
  }, [sample]);
  useEffect(load, [load]);

  async function send() {
    if (sample) { setErr("This is the sample portal, so nothing is sent from here."); return; }
    if (what.trim().length < 4) {
      setErr("Tell us a little more about what is wrong.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const j = await fetch("/api/tenant/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ what, where }),
      }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "That did not send.");
      setDone(j.ref);
      setWhat("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            className="rounded-xl border border-line/60 bg-white px-3.5 py-2.5 text-[14px]"
          >
            {WHERE.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
        <textarea
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          rows={4}
          placeholder="What is wrong? When did it start? Anything you have already tried."
          className="w-full rounded-xl border border-line/60 bg-white px-3.5 py-2.5 text-[14px]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Report it"}
          </button>
          {/* Said next to the button rather than in small print underneath it:
              somebody with a burst pipe should not be filling this in. */}
          <p className="text-[12.5px] text-muted">
            Something dangerous or flooding?{" "}
            {agentPhone ? (
              <>
                Ring {agentName ? agentName.split(/\s+/)[0] : "us"} on{" "}
                <a href={`tel:${agentPhone.replace(/\s+/g, "")}`} className="font-semibold underline">
                  {agentPhone}
                </a>{" "}
                instead.
              </>
            ) : (
              <>Ring us instead - a form is not the right thing for an emergency.</>
            )}
          </p>
        </div>
        {done != null && (
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-[13px] font-semibold text-accent-dark">
            Reported, and it is with us. Your reference is {done}.
          </p>
        )}
        {err && <p className="text-[13px] font-semibold text-accent-dark">{err}</p>}
      </div>

      <div className="mt-7 border-t border-line/60 pt-5">
        <h3 className="text-[15px] font-bold">What you have reported</h3>
        {jobs == null ? (
          <p className="mt-2 text-[13.5px] text-muted">Looking…</p>
        ) : jobs.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/50">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{j.title}</span>
                  <span className="block text-[12.5px] text-muted">
                    Reported {new Date(j.reportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ref {j.ref}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-line/60 px-3 py-1 text-[12px] font-semibold">{j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
