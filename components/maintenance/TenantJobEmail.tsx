"use client";

import { useEffect, useRef, useState } from "react";
import WorksOrderEmail, { type MailField, type MailWords } from "@/components/maintenance/WorksOrderEmail";
import { TENANT_FIRST_NAME } from "@/lib/works-catalogue";
import type { WorksOrder } from "@/lib/works-orders";

/**
 * The email a job's tenants are about to get, written in place before the
 * button that sends it (Lianna Denholm, 16 Nov 2026: "Tenant confirmation on
 * maintenance, I cannot amend this before sending"). On the job's page:
 * Confirm the Contractor, setting or moving the date, and the two Tell the
 * tenants buttons. The raise screen has its own copy in RaiseJob.
 *
 * Reports the agent's words up only once they differ from the original, so
 * an untouched email goes exactly as it always did. Draws nothing when the
 * tenants get no email (a discreet job, nobody with an address). A new date
 * redraws the email but keeps the agent's words: the date is in the box.
 */
type Ready = { subject: string; html: string; to: { name: string; email: string }[]; text: (MailWords & { heading?: string }) | null; fields: MailField[] };

type Step = "confirm" | "schedule" | "booked" | "access";

export default function TenantJobEmail({ orderId, contractorId, onEdit, step = "confirm", scheduledAt, goes = "Goes when you press They've confirmed" }: { orderId: string; contractorId: string; onEdit: (w: MailWords | null) => void; step?: Step; scheduledAt?: string | null; goes?: string }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "none" } | { kind: "error"; error: string } | ({ kind: "ready" } & Ready)>({ kind: "loading" });
  const [words, setWords] = useState<MailWords | null>(null);
  const job = `${orderId}|${contractorId}|${step}`;
  const lastJob = useRef(job);

  useEffect(() => {
    let live = true;
    /* Another job or button starts afresh; only a new date keeps the words. */
    if (lastJob.current !== job) { lastJob.current = job; setWords(null); onEdit(null); }
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    fetch("/api/works-orders/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, contractorId, audience: "tenant", editable: true, step, scheduledAt: scheduledAt ?? null }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.ok) return setState({ kind: "error", error: j?.error ?? "The email to the tenants could not be written." });
        if (j.none) return setState({ kind: "none" });
        setState({ kind: "ready", subject: j.subject, html: j.html, to: Array.isArray(j.to) ? j.to : [], text: j.text ?? null, fields: Array.isArray(j.fields) ? j.fields : [] });
      })
      .catch(() => { if (live) setState({ kind: "error", error: "The email to the tenants could not be written." }); });
    return () => { live = false; };
  }, [job, scheduledAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.kind === "none") return null;
  const to = state.kind === "ready" ? state.to : [];
  const names = to.map((t) => (t.name ?? "").trim().split(/\s+/)[0] || "the tenant");
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "The tenants";
  const original = state.kind === "ready" ? state.text : null;
  const change = (w: MailWords | null) => {
    setWords(w);
    onEdit(w && original && (w.body !== original.body || w.subject !== original.subject) ? w : null);
  };

  return (
    <div className="mt-3">
      <p className="nl-wo-k mb-2">The email to the {to.length > 1 ? "tenants" : "tenant"} <em>{goes}</em></p>
      <WorksOrderEmail
        contractor={{ name: who, email: to.map((t) => t.email).join(", ") }}
        heading={original?.heading ?? ""}
        what="The email to the tenants"
        loadingText="Writing the email to the tenants…"
        fixedNote={`Then, as always: the box with who's coming, the job and the address, and your name.${to.length > 1 ? ` ${TENANT_FIRST_NAME} becomes each tenant's own first name, and each gets their own copy.` : names[0] ? ` ${TENANT_FIRST_NAME} becomes ${names[0]}.` : ""}`}
        state={state.kind === "ready" ? { kind: "ready", original: state.text, fields: state.fields, html: state.html } : state.kind === "error" ? state : { kind: "loading" }}
        words={words}
        onWords={change}
        dirtyDetails={false}
        onReset={() => change(null)}
        renderAs={async (w) => {
          const j = await fetch("/api/works-orders/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, contractorId, audience: "tenant", edit: w, step, scheduledAt: scheduledAt ?? null }) }).then((r) => r.json()).catch(() => null);
          return j?.ok && j.html ? (j.html as string) : null;
        }}
      />
    </div>
  );
}

/** The date as the server takes it, or null while it is half typed. */
export function isoOf(at: string | undefined | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The booking email a date the agent sets or moves sends the lead tenant,
 * written in place under the date (Lianna Denholm, 16 Nov 2026). Only on a
 * repair the tenants hear about: a planned job's booking is its own button.
 */
export function DateEmail({ o, at, goes, onEdit }: { o: Pick<WorksOrder, "id" | "kind" | "quietTenants" | "contractorId">; at: string | undefined | null; goes: string; onEdit: (w: MailWords | null) => void }) {
  const iso = isoOf(at);
  if (o.kind === "planned" || o.quietTenants || !o.contractorId || !iso) return null;
  return <TenantJobEmail orderId={o.id} contractorId={o.contractorId} step="schedule" scheduledAt={iso} goes={goes} onEdit={onEdit} />;
}
