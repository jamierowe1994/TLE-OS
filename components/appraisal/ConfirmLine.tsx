"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import ConfirmSheet from "@/components/ConfirmSheet";

/**
 * Has the landlord been sent their confirmation? On the appointment card.
 *
 * Booking no longer sends it (17 Sep 2026), so the file says where it stands
 * and offers the email: Not sent yet, Sent on Wednesday, or The time has
 * changed since. Arriving with ?confirm=1 - straight from booking - opens the
 * email at once, and the parameter is dropped so a refresh does not reopen it.
 */
type Status = { loading: true } | { loading: false; sentAt?: string; moved?: boolean; blocked?: string; error?: boolean };

export default function ConfirmLine({ appraisalId, appointmentAt }: { appraisalId: string; appointmentAt: string }) {
  const [status, setStatus] = useState<Status>({ loading: true });
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "draft", kind: "appraisal", id: appraisalId }),
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; alreadySent?: { at: string }; moved?: { from: string }; blocked?: string }) =>
        setStatus(d.ok ? { loading: false, sentAt: d.alreadySent?.at, moved: Boolean(d.moved), blocked: d.blocked } : { loading: false, error: true })
      )
      .catch(() => setStatus({ loading: false, error: true }));
  }, [appraisalId]);

  // Re-read when the time changes: a moved appointment needs a new email.
  useEffect(() => load(), [load, appointmentAt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirm") !== "1") return;
    setOpen(true);
    params.delete("confirm");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  const sentWords = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line/50 bg-white/60 px-3.5 py-2.5">
      <DoodleIcon name="mail" size={14} className="shrink-0 text-accent-dark" />
      <p className="min-w-0 flex-1 text-[12px] leading-snug">
        {status.loading ? (
          <span className="text-muted">Checking the confirmation…</span>
        ) : status.error ? (
          <span className="text-muted">Couldn&apos;t check the confirmation.</span>
        ) : status.sentAt ? (
          <>
            <span className="font-semibold">Confirmation sent</span>
            <span className="text-muted"> · {sentWords(status.sentAt)}</span>
          </>
        ) : status.moved ? (
          <>
            <span className="font-semibold">The time has changed</span>
            <span className="text-muted"> since they were confirmed. Send them the new time.</span>
          </>
        ) : status.blocked ? (
          <span className="text-muted">{status.blocked}</span>
        ) : (
          <>
            <span className="font-semibold">Confirmation not sent yet</span>
            <span className="text-muted"> · nothing goes until you send it</span>
          </>
        )}
      </p>
      {!status.loading && !status.error && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            status.sentAt
              ? "shrink-0 text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
              : "shrink-0 rounded-full bg-[var(--brown)] px-3.5 py-1.5 text-[11.5px] font-semibold text-white"
          }
        >
          {status.sentAt ? "See it" : "Review and send"}
        </button>
      )}
      {open && (
        <ConfirmSheet
          title="Confirm the appraisal"
          target={{ kind: "appraisal", id: appraisalId }}
          onClose={() => setOpen(false)}
          onSent={() => load()}
        />
      )}
    </div>
  );
}
