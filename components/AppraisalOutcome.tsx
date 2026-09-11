"use client";

import { useState } from "react";

/**
 * The two hand moves an appraisal has: won, and lost. Everything else is
 * read from the record (lib/appraisal-stage). A lost appraisal can be
 * reopened, because "instructed elsewhere" is sometimes followed by a call
 * back; reopening returns it to whatever the record says.
 */
export default function AppraisalOutcome({
  id,
  stage,
  why,
  size = "small",
}: {
  id: string;
  stage: string;
  why?: string | null;
  /** "large" on the appraisal file's hero, where the two moves are the only buttons. */
  size?: "small" | "large";
}) {
  const big = size === "large";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = async (outcome: "won" | "lost" | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appraisals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, outcome }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? "That didn't save.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      setBusy(false);
    }
  };

  const ended = stage === "won" || stage === "lost";
  return (
    <div className={`flex flex-wrap items-center ${big ? "mt-6 gap-3" : "mt-3 gap-2"}`}>
      {why && <span className="mr-2 text-[11.5px] text-muted">{why}</span>}
      {ended ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void set(null)}
          className={big ? "rounded-full border border-line/70 bg-white px-5 py-2.5 text-[13px] font-semibold transition hover:border-ink/40 disabled:opacity-50" : "rounded-full border border-line px-3 py-1 text-[11.5px] text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"}
        >
          Reopen
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void set("won")}
            className={big ? "rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50" : "rounded-full border border-emerald-300 px-3 py-1 text-[11.5px] font-medium text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50"}
          >
            Mark as won
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void set("lost")}
            className={big ? "rounded-full border border-line/70 bg-white px-6 py-2.5 text-[13px] font-semibold transition hover:border-ink/40 disabled:opacity-50" : "rounded-full border border-line px-3 py-1 text-[11.5px] text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"}
          >
            Mark as lost
          </button>
        </>
      )}
      {error && <span className="text-[11.5px] text-red-600">{error}</span>}
    </div>
  );
}
