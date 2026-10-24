"use client";

import { useEffect, useState } from "react";

/**
 * "OPTED OUT OF ZERO DEPOSIT (FLATFAIR)", as a quiet tick (21 Oct 2026).
 *
 * Every landlord is opted in under the terms of business and the tenant
 * chooses. The few who say no are ticked here by the agent - never by the
 * landlord, so it is not on their portal or in the signing flow. Kept small
 * and muted, under the landlord's other details, so it doesn't read as a
 * choice on offer. Saved by PUT /api/people/zero-deposit (lib/zero-deposit-optout),
 * against the landlord's email or contact ref, so it is the same tick on
 * every screen that shows them.
 */

type OptOut = { reason: string | null; by: string; at: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const btn = "rounded-full border border-line/70 px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50";

export default function ZeroDepositOptOut({
  email,
  personRef,
  name,
  className = "",
  readOnly = false,
}: {
  email?: string | null;
  personRef?: string | null;
  name?: string | null;
  className?: string;
  /** Shown, not changed: said only when they have opted out (24 Oct 2026). */
  readOnly?: boolean;
}) {
  const e = (email ?? "").trim();
  const ref = (personRef ?? "").trim();
  const canSave = Boolean(e || ref);
  const [optOut, setOptOut] = useState<OptOut | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">(canSave ? "loading" : "ready");
  /* "out" = ticking it, asks for a reason first; "in" = unticking, asks once. */
  const [asking, setAsking] = useState<"out" | "in" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canSave) return setState("ready");
    let live = true;
    setState("loading");
    fetch(`/api/people/zero-deposit?${new URLSearchParams({ email: e, ref })}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; optOut?: OptOut | null }) => {
        if (!live) return;
        setOptOut(j.optOut ?? null);
        setState(j.ok ? "ready" : "failed");
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, [e, ref, canSave]);

  async function save(optedOut: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/people/zero-deposit", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, ref, name: name ?? "", optedOut, reason: optedOut ? reason : "" }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; optOut?: OptOut | null };
      if (!j.ok) return setError(j.error ?? "That didn't save.");
      setOptOut(j.optOut ?? null);
      setAsking(null);
      setReason("");
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /* Nothing to keep it against, and nothing recorded: say nothing at all. */
  if (!canSave) return null;
  if (state === "loading") return null;
  /* Read only: an opt-out is worth seeing, an empty box is not. */
  if (readOnly) {
    if (!optOut) return null;
    return (
      <div className={`py-2 ${className}`} data-steve="landlord.zero-deposit-optout">
        <span className="block text-[12px] leading-snug text-ink">Opted out of zero deposit (Flatfair)</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
          Ticked by {optOut.by}, {day(optOut.at)}
          {optOut.reason ? `  •  ${optOut.reason}` : ""}
        </span>
      </div>
    );
  }

  const ticked = Boolean(optOut) || asking === "out";
  return (
    <div className={`py-2 ${className}`} data-steve="landlord.zero-deposit-optout">
      <label className={`flex items-start gap-2.5 ${state === "failed" ? "opacity-60" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--ink)]"
          checked={ticked}
          disabled={busy || state === "failed"}
          onChange={(ev) => {
            setError(null);
            if (optOut) setAsking(ev.target.checked ? null : "in");
            else setAsking(ev.target.checked ? "out" : null);
          }}
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-[12px] leading-snug ${optOut ? "text-ink" : "text-muted"}`}>Opted out of zero deposit (Flatfair)</span>
          {optOut && (
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              Ticked by {optOut.by}, {day(optOut.at)}
              {optOut.reason ? `  •  ${optOut.reason}` : ""}
            </span>
          )}
          {state === "failed" && <span className="mt-0.5 block text-[11px] text-muted">Couldn&apos;t check this just now.</span>}
        </span>
      </label>

      {asking === "out" && (
        <div className="ml-6 mt-2 space-y-2">
          <p className="text-[11px] leading-snug text-muted">
            Every landlord is opted in under the terms of business and the tenant chooses. Only tick this if the landlord has told you they won&apos;t take it. Their lets will take a deposit.
          </p>
          <input
            type="text"
            value={reason}
            maxLength={300}
            placeholder="Why, if they said (optional)"
            onChange={(ev) => setReason(ev.target.value)}
            className="w-full border-0 border-b-[1.5px] border-ink/25 bg-transparent px-1 py-1 text-[12.5px] outline-none transition focus:border-ink/70"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void save(true)}>
              {busy ? "Saving…" : "Record the opt-out"}
            </button>
            <button type="button" className="text-[11.5px] text-muted underline-offset-2 hover:underline" disabled={busy} onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {asking === "in" && (
        <div className="ml-6 mt-2 space-y-2">
          <p className="text-[11px] leading-snug text-muted">Take the opt-out off? Their tenants can choose zero deposit again.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void save(false)}>
              {busy ? "Saving…" : "Take it off"}
            </button>
            <button type="button" className="text-[11.5px] text-muted underline-offset-2 hover:underline" disabled={busy} onClick={() => setAsking(null)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {error && <p className="ml-6 mt-1 text-[11.5px] leading-snug text-accent-dark">{error}</p>}
    </div>
  );
}
