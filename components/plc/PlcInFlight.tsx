"use client";

import { useState } from "react";
import { PLC_STATES, resubmittedOf, type PlcCase } from "@/lib/plc";
import { prettyWhen } from "@/components/PlcReview";

/**
 * A PACK THAT IS WITH COMPLIANCE, FROM THE AGENT'S SIDE (James, 11 Nov 2026).
 *
 * "When a plc is going can we have two buttons - the ability to resubmit a plc
 * with new details. We should give them the option to view the process of the
 * plc and then adjust the details ... then give them the ability to cancel."
 *
 * Until now this screen said "with the compliance team" and nothing else: no
 * stage, nobody's name, and a locked pack, so a wrong move-in date meant
 * ringing compliance to send it back. Now it shows where the pack has got to,
 * step by step, and offers the two moves, any time before approval:
 *
 *   Resubmit With New Details   takes the pack back to the agent. They change
 *                               what they need (the people, the documents, the
 *                               dates) and send it again. Compliance's checks
 *                               so far are cleared and they start again.
 *   Cancel the PLC              calls it off, with a reason. It leaves
 *                               compliance's queue; its documents are kept so
 *                               it can be started again.
 *
 * Each asks once before it happens, saying what it does to compliance's work.
 */

type Stage = { title: string; who: string; state: "done" | "now" | "todo"; note: string | null };

function stagesOf(c: PlcCase): Stage[] {
  const who = (id: PlcCase["state"]) => PLC_STATES.find((s) => s.id === id)?.who ?? "";
  const again = resubmittedOf(c);
  const read = Boolean(c.scannedAt) || c.state === "reviewing" || c.state === "checked";
  const checked = Boolean(c.checkedAt) || c.state === "checked";
  return [
    { title: again ? "Sent Again" : "Sent", who: c.agentName || "You", state: "done", note: c.submittedAt ? prettyWhen(c.submittedAt) : null },
    {
      title: "Documents Read",
      who: "TLE OS",
      state: read ? "done" : "now",
      note: read ? (c.scannedAt ? prettyWhen(c.scannedAt) : null) : "Reading the documents for dates and details",
    },
    {
      title: "First Check",
      who: checked && c.checkedBy ? c.checkedBy : who("reviewing"),
      state: checked ? "done" : read ? "now" : "todo",
      note: checked ? (c.checkedAt ? prettyWhen(c.checkedAt) : null) : read ? "Every document is being checked against the pack" : null,
    },
    {
      title: "Final Approval",
      who: who("checked"),
      state: c.state === "checked" ? "now" : "todo",
      note: c.state === "checked" ? "Checked once, waiting on the final sign-off" : null,
    },
    { title: "Approved", who: "Then it is back with you", state: "todo", note: null },
  ];
}

export default function PlcInFlight({
  kase,
  busy,
  onTakeBack,
  onCancel,
}: {
  kase: PlcCase;
  busy: boolean;
  onTakeBack: () => void;
  onCancel: (reason: string) => void;
}) {
  const [asking, setAsking] = useState<null | "resubmit" | "cancel">(null);
  const [reason, setReason] = useState("");
  const stages = stagesOf(kase);
  const now = stages.find((s) => s.state === "now");

  return (
    <div>
      <h1 className="text-2xl tracking-normal text-ink">This Is With the Compliance Team</h1>
      <p className="mt-2 text-sm text-muted">{kase.address}</p>
      <p className="mt-4 text-sm text-muted">
        {now ? `Now: ${now.title.toLowerCase()}, with ${now.who}.` : "Waiting on compliance."} They usually come back within 48 hours.
      </p>

      <ol className="mt-6 rounded-xl border border-line bg-white" aria-label="Where this PLC has got to">
        {stages.map((s, i) => (
          <li key={s.title} className={`flex items-start gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`} aria-current={s.state === "now" ? "step" : undefined}>
            <span
              aria-hidden
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                s.state === "done" ? "bg-ink text-white" : s.state === "now" ? "border-2 border-accent-dark text-accent-dark" : "border border-line text-muted"
              }`}
            >
              {s.state === "done" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${s.state === "todo" ? "text-muted" : "text-ink"}`}>
                {s.title}
                {s.state === "now" && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-dark">Now</span>}
              </p>
              <p className="text-xs text-muted">
                {s.who}
                {s.note ? ` · ${s.note}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {asking === "resubmit" ? (
        <div className="mt-6 rounded-xl border border-line bg-box p-4">
          <p className="text-sm text-ink">Take it back to change it?</p>
          <p className="mt-1 text-sm text-muted">
            It comes back to you with everything on it. Change the tenants, the landlord, the documents or the dates, then send it again. What compliance has
            checked so far is cleared, and they check it again from the start.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onTakeBack} disabled={busy} className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white transition hover:border-accent hover:bg-accent disabled:opacity-50">
              {busy ? "One moment…" : "Yes, take it back"}
            </button>
            <button type="button" onClick={() => setAsking(null)} disabled={busy} className="rounded-lg border border-line px-4 py-2.5 text-sm transition hover:bg-white">
              Leave it with them
            </button>
          </div>
        </div>
      ) : asking === "cancel" ? (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-900">Cancel this PLC?</p>
          <p className="mt-1 text-sm text-rose-800">
            It leaves compliance&apos;s queue and they are told why. Its documents are kept, so you can start it again later without uploading them twice.
          </p>
          <label className="mt-3 block text-xs text-rose-900" htmlFor="plc-cancel-why">
            Why is it being cancelled?
          </label>
          <textarea
            id="plc-cancel-why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. The tenant has pulled out"
            className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-ink"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onCancel(reason)}
              disabled={busy || reason.trim().length < 3}
              className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm text-white transition hover:bg-rose-800 disabled:opacity-50"
            >
              {busy ? "One moment…" : "Cancel the PLC"}
            </button>
            <button type="button" onClick={() => setAsking(null)} disabled={busy} className="rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm transition hover:bg-rose-100">
              Keep it going
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => setAsking("resubmit")} className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white transition hover:border-accent hover:bg-accent">
            Resubmit With New Details
          </button>
          <button type="button" onClick={() => setAsking("cancel")} className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm text-rose-800 transition hover:bg-rose-50">
            Cancel the PLC
          </button>
        </div>
      )}
    </div>
  );
}
