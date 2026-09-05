"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import {
  NURTURE_REASONS,
  OUTCOMES,
  TOUCH_KINDS,
  type TouchKind,
  type TouchOutcome,
} from "@/lib/lead-spine";

/**
 * Writing down what just happened with a lead.
 *
 * Two shapes, one sheet. "Log an attempt" is what it was (call, text,
 * visit, email) and how it went, with a line if there is one to add - it is
 * meant to take five seconds with the phone still in the other hand. "Add to
 * nurture" is a reason and a button, because the point of the branch is that
 * a lead going quiet gets written down rather than forgotten.
 *
 * It posts to /api/leads/[id]/touches and hands back the fresh log, so the
 * spine on the drawer re-reads itself from what was saved, not from what
 * the screen assumed.
 */

export type LogMode = "attempt" | "nurture";

export default function LogTouch({
  leadId,
  leadName,
  mode,
  initialKind = "call",
  onClose,
  onLogged,
}: {
  leadId: string;
  leadName: string;
  mode: LogMode;
  initialKind?: TouchKind;
  onClose: () => void;
  onLogged: (result: unknown) => void;
}) {
  const [kind, setKind] = useState<TouchKind>(initialKind);
  const [outcome, setOutcome] = useState<TouchOutcome | null>(null);
  const [body, setBody] = useState("");
  const [reason, setReason] = useState(NURTURE_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomes = OUTCOMES.filter((o) => o.for.includes(kind));
  useEffect(() => {
    /* Changing the kind changes what "how did it go" can mean. */
    setOutcome((cur) => (cur && outcomes.some((o) => o.id === cur) ? cur : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = mode === "nurture" ? Boolean(reason) : Boolean(outcome);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/touches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "nurture"
            ? { kind: "nurture", body: reason + (body.trim() ? ` - ${body.trim()}` : "") }
            : { kind, outcome, body }
        ),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error ?? "That didn't save.");
        setBusy(false);
        return;
      }
      onLogged(j);
    } catch {
      setError("That didn't save - the connection dropped.");
      setBusy(false);
    }
  }

  const first = leadName.split(" ")[0] || "them";

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative w-full max-w-md rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        {mode === "attempt" ? (
          <>
            <h2 className="hand text-[20px]">Log the attempt</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              What you did to reach {first}, and how it went. Unanswered counts - three of those is information.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {TOUCH_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                    kind === k.id
                      ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
                      : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  <DoodleIcon name={k.icon} size={13} />
                  {k.label}
                </button>
              ))}
            </div>

            <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-wide text-muted">How did it go</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {outcomes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOutcome(o.id)}
                  className={`rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                    outcome === o.id
                      ? "border-ink bg-ink font-semibold text-page"
                      : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Anything worth remembering - what they said, when to try again…"
              rows={3}
              className="mt-4 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
            />
          </>
        ) : (
          <>
            <h2 className="hand text-[20px]">Add to nurture</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              {first} is not saying no and not answering. They stay warm here instead of dying in a call list,
              and come straight back on the spine the moment they reply.
            </p>
            <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Why</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {NURTURE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                    reason === r
                      ? "border-ink bg-ink font-semibold text-page"
                      : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Anything else - when to try again, what they are waiting on…"
              rows={2}
              className="mt-4 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
            />
          </>
        )}

        {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
          >
            Cancel
          </button>
          <PressButton
            onClick={save}
            disabled={!canSave || busy}
            className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-semibold ${
              canSave && !busy ? "bg-accent-dark text-page" : "cursor-not-allowed bg-line/40 text-muted"
            }`}
          >
            <DoodleIcon name={mode === "nurture" ? "clock" : "checklist"} size={14} />
            {busy ? "Saving…" : mode === "nurture" ? "Add to nurture" : "Log it"}
          </PressButton>
        </div>
      </div>
    </div>
  );
}
