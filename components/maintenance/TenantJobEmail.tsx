"use client";

import { useEffect, useState } from "react";
import WorksOrderEmail, { type MailField, type MailWords } from "@/components/maintenance/WorksOrderEmail";
import { TENANT_FIRST_NAME } from "@/lib/works-catalogue";

/**
 * The email a job's tenants are about to get, written in place before the
 * button that sends it (Lianna Denholm, 16 Nov 2026: "Tenant confirmation on
 * maintenance, I cannot amend this before sending"). Confirm the Contractor
 * on the job's page; the raise screen has its own copy in RaiseJob.
 *
 * Reports the agent's words up only once they differ from the original, so
 * an untouched email goes exactly as it always did. Draws nothing when the
 * tenants get no email (a discreet job, nobody with an address).
 */
type Ready = { subject: string; html: string; to: { name: string; email: string }[]; text: (MailWords & { heading?: string }) | null; fields: MailField[] };

export default function TenantJobEmail({ orderId, contractorId, onEdit }: { orderId: string; contractorId: string; onEdit: (w: MailWords | null) => void }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "none" } | { kind: "error"; error: string } | ({ kind: "ready" } & Ready)>({ kind: "loading" });
  const [words, setWords] = useState<MailWords | null>(null);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    setWords(null);
    onEdit(null);
    fetch("/api/works-orders/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, contractorId, audience: "tenant", editable: true }),
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
  }, [orderId, contractorId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <p className="nl-wo-k mb-2">The email to the {to.length > 1 ? "tenants" : "tenant"} <em>Goes when you press They&apos;ve confirmed</em></p>
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
          const j = await fetch("/api/works-orders/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, contractorId, audience: "tenant", edit: w }) }).then((r) => r.json()).catch(() => null);
          return j?.ok && j.html ? (j.html as string) : null;
        }}
      />
    </div>
  );
}
