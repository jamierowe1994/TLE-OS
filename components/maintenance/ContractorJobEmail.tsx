"use client";

import { useEffect, useRef, useState } from "react";
import WorksOrderEmail, { type MailField, type MailWords } from "@/components/maintenance/WorksOrderEmail";
import type { ContractorWords, WorksOrder } from "@/lib/works-orders";
import { isoOf } from "@/components/maintenance/TenantJobEmail";

/**
 * The email a job's contractor is about to get, written in place before the
 * button that sends it (James, 17 Nov 2026: the tenants' emails could be
 * changed first, "do the changes for the contractors too"). On the job's
 * page: Confirm the Contractor, Send the works order, setting or moving the
 * date, Cancel the job, Contacted and the two reminders. The raise screen has
 * its own copy in RaiseJob.
 *
 * Reports the agent's words up only once they differ from the original, so
 * an untouched email goes exactly as it always did, and tagged with the
 * email they were written for, so a button that sends two only rewords that
 * one. Draws nothing when the contractor gets no email (no address on their
 * record). A new date redraws the email but keeps the agent's words.
 */
export type ContractorStep = "confirm" | "resend" | "schedule" | "cancel" | "contact" | "reminder" | "final";

type Ready = { subject: string; html: string; to: string; name: string; template: string; text: (MailWords & { heading?: string }) | null; fields: MailField[] };

/** What the email adds after the agent's words, which can't be changed here. */
const AFTER: Record<ContractorStep, string> = {
  confirm: "Then, as always: the button to tell us the date and time, the line about quoting the works order number on the invoice, and your name and number.",
  resend: "Then, as always: the button to tell us the date and time, the line about quoting the works order number on the invoice, and your name and number.",
  schedule: "Then your name and number, as always.",
  cancel: "Then your name and number, as always.",
  contact: "Then your name and number, as always.",
  reminder: "Then, as always: the job's details, the tenants, the button to their page, and your name and number.",
  final: "Then, as always: the job's details, the button to their page, and your name and number.",
};

export default function ContractorJobEmail({ orderId, contractorId, step, scheduledAt, goes, onEdit }: {
  orderId: string;
  contractorId: string;
  step: ContractorStep;
  scheduledAt?: string | null;
  /** "Goes when you press They've confirmed". */
  goes: string;
  onEdit: (w: ContractorWords | null) => void;
}) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "none" } | { kind: "error"; error: string } | ({ kind: "ready" } & Ready)>({ kind: "loading" });
  const [words, setWords] = useState<MailWords | null>(null);
  const job = `${orderId}|${contractorId}|${step}`;
  const lastJob = useRef(job);

  useEffect(() => {
    let live = true;
    /* Another job, contractor or button starts afresh; only a new date keeps the words. */
    if (lastJob.current !== job) { lastJob.current = job; setWords(null); onEdit(null); }
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    fetch("/api/works-orders/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, contractorId, audience: "contractor", contractorStep: step, editable: true, scheduledAt: scheduledAt ?? null }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.ok) return setState({ kind: "error", error: j?.error ?? "The email to the contractor could not be written." });
        if (j.none) return setState({ kind: "none" });
        setState({ kind: "ready", subject: j.subject, html: j.html, to: j.to ?? "", name: j.contractorName ?? "", template: j.template ?? "", text: j.text ?? null, fields: Array.isArray(j.fields) ? j.fields : [] });
      })
      .catch(() => { if (live) setState({ kind: "error", error: "The email to the contractor could not be written." }); });
    return () => { live = false; };
  }, [job, scheduledAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.kind === "none") return null;
  const ready = state.kind === "ready" ? state : null;
  const original = ready?.text ?? null;
  const change = (w: MailWords | null) => {
    setWords(w);
    onEdit(w && original && ready && (w.body !== original.body || w.subject !== original.subject) ? { ...w, template: ready.template } : null);
  };

  return (
    <div className="mt-3">
      <p className="nl-wo-k mb-2">The email to {ready?.name || "the contractor"} <em>{goes}</em></p>
      <WorksOrderEmail
        contractor={{ name: ready?.name || "The contractor", email: ready?.to ?? "" }}
        heading={original?.heading ?? ""}
        what={step === "confirm" || step === "resend" ? "The works order" : "The email to the contractor"}
        loadingText={step === "confirm" || step === "resend" ? "Writing the works order…" : "Writing the email to the contractor…"}
        fixedNote={AFTER[step]}
        state={ready ? { kind: "ready", original: ready.text, fields: ready.fields, html: ready.html } : state.kind === "error" ? state : { kind: "loading" }}
        words={words}
        onWords={change}
        dirtyDetails={false}
        onReset={() => change(null)}
        renderAs={async (w) => {
          const j = await fetch("/api/works-orders/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, contractorId, audience: "contractor", contractorStep: step, edit: w, scheduledAt: scheduledAt ?? null }) }).then((r) => r.json()).catch(() => null);
          return j?.ok && j.html ? (j.html as string) : null;
        }}
      />
    </div>
  );
}

/**
 * The booking a date the agent sets or moves sends the contractor, written
 * in place under the date (James, 17 Nov 2026).
 */
export function ContractorDateEmail({ o, at, goes, onEdit }: { o: Pick<WorksOrder, "id" | "contractorId">; at: string | undefined | null; goes: string; onEdit: (w: ContractorWords | null) => void }) {
  const iso = isoOf(at);
  if (!o.contractorId || !iso) return null;
  return <ContractorJobEmail orderId={o.id} contractorId={o.contractorId} step="schedule" scheduledAt={iso} goes={goes} onEdit={onEdit} />;
}
