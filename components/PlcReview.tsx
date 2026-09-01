"use client";

import { useState } from "react";
import type { Check, CheckId, Finding, PlcCase } from "@/lib/plc";

/**
 * The compliance side of a PLC handover, and the pieces it is built from.
 *
 * Lifted out of the dry-run harness so it can be mounted in Kirstie's own
 * screen without a second copy existing. That mattered more than it sounds:
 * the harness is how anybody walks the loop before a real tenancy does, and a
 * harness driving a DIFFERENT component from the one compliance actually use
 * tests nothing.
 *
 * So there is one review panel. The harness mounts it beside the agent side;
 * the pre-tenancy queue mounts it under a list. Neither owns it.
 */

/* ──────────────────────────────── plumbing ─────────────────────────────── */

export type Loaded = {
  case: PlcCase;
  checks: Check[];
  missing: CheckId[];
  summary: string | null;
  scanConfigured: boolean;
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `That didn't work (${res.status}).`);
  }
  return body as T;
}

export const prettyDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

/** A case started before anybody was signed in has no agent on it. Naming
 *  them in a sentence addressed TO them reads as a bug, so it does not. */
const who = (name: string) => (name && name !== "Unassigned" ? name : "the agent who submitted it");

export const prettyWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/* ────────────────────────────── small pieces ───────────────────────────── */

export function Pill({ state }: { state: PlcCase["state"] }) {
  const tone: Record<PlcCase["state"], string> = {
    assembling: "bg-box text-muted",
    submitted: "bg-amber-50 text-amber-800",
    scanning: "bg-amber-50 text-amber-800",
    reviewing: "bg-sky-50 text-sky-800",
    approved: "bg-emerald-50 text-emerald-800",
    deferred: "bg-orange-50 text-orange-800",
    declined: "bg-rose-50 text-rose-800",
  };
  const label: Record<PlcCase["state"], string> = {
    assembling: "Assembling",
    submitted: "Submitted",
    scanning: "Scanning",
    reviewing: "Ready to review",
    approved: "Approved",
    deferred: "Deferred",
    declined: "Declined",
  };
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs tracking-wide ${tone[state]}`}>
      {label[state]}
    </span>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {children}
    </p>
  );
}

export function Btn({
  children,
  onClick,
  busy,
  tone = "plain",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: "plain" | "primary" | "danger";
  disabled?: boolean;
}) {
  const styles = {
    plain:
      "border-line text-ink hover:bg-box",
    primary:
      "border-ink bg-ink text-page hover:opacity-90",
    danger:
      "border-rose-300 text-rose-700 hover:bg-rose-50",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-lg border px-3.5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

/* ───────────────────────────── the compliance side ─────────────────────── */

/** Renders its own <li>, so the caller keys it and does NOT wrap it — an li
 *  inside an li is a hydration error, not just untidy markup. */
function FindingRow({ f, checks }: { f: Finding; checks: Check[] }) {
  const label = checks.find((c) => c.id === f.checkId)?.label ?? f.checkId;
  const dot = {
    blocker: "bg-rose-500",
    query: "bg-amber-500",
    ok: "bg-emerald-500",
  }[f.level];
  return (
    <li className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-sm text-ink">{f.message}</p>
        <p className="mt-0.5 text-xs text-muted">
          {label}
          {f.documentName ? ` · ${f.documentName}` : ""}
          {f.foundDate ? ` · ${prettyDate(f.foundDate)}` : ""}
        </p>
      </div>
    </li>
  );
}

export function ComplianceSide({
  data,
  reload,
  onDecided,
  say,
  perform,
}: {
  data: Loaded;
  reload: () => Promise<void>;
  onDecided: () => void;
  say: (e: string | null) => void;
  /**
   * What a button actually does. Defaults to posting to the PLC API.
   *
   * Overridden by the public preview at /preview/<token>/plc, which drives
   * this same panel against an invented pack and must not write anything.
   * A seam rather than a copy, on purpose: a demonstration of the review
   * screen that has drifted from the review screen is worse than none, and
   * the whole point of showing this to somebody is that it is the real
   * thing. Everything above this line is already prop-driven; `act` was the
   * only place the panel reached for the network on its own.
   */
  perform?: (action: string, extra: Record<string, unknown>) => Promise<void>;
}) {
  const c = data.case;
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    say(null);
    try {
      if (perform) {
        await perform(action, extra);
      } else {
        await api(`/api/plc/${c.id}`, {
          method: "POST",
          body: JSON.stringify({ action, ...extra }),
        });
      }
      await reload();
      if (action === "decide") onDecided();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const decided = c.state === "approved" || c.state === "deferred" || c.state === "declined";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">From</p>
            <p>{c.agentName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Move-in</p>
            <p>{prettyDate(c.moveInDate)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Submitted</p>
            <p>{prettyWhen(c.submittedAt)}</p>
          </div>
        </div>
        {c.agentNote && (
          <p className="mt-3 whitespace-pre-wrap border-l-2 border-line pl-3 text-sm text-muted">
            {c.agentNote}
          </p>
        )}
      </section>

      {(c.state === "submitted" || c.state === "scanning") && (
        <section className="rounded-xl border border-line p-4">
          <h2 className="text-base tracking-normal">Read the Pack</h2>
          <p className="mt-1 text-sm text-muted">
            The scan reads dates and names out of the documents and tells you what it found. It does
            not decide anything. You still approve, defer or decline.
          </p>
          {!data.scanConfigured && (
            <p className="mt-2 text-sm text-amber-700">
              The reader is not switched on in this environment, so it will only tell you what is
              missing.
            </p>
          )}
          {/* While it reads, show it reading.
              The scan is one model call PER DOCUMENT, run in sequence, so a
              full pack is a long wait behind a button that has gone grey -
              and a grey button is indistinguishable from a stuck one. The
              magnifier over the paperwork says the same thing the line under
              it says, and says it continuously.

              It replaces the two buttons rather than sitting beside them: the
              choice has been made, and leaving "Skip it" pressable mid-scan
              invites somebody to start a second thing while the first is
              still going. */}
          {busy === "scan" ? (
            <div className="mt-3 flex flex-col items-center py-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/scanning.gif"
                alt=""
                className="art h-auto w-[min(220px,55vw)] select-none motion-reduce:hidden"
                draggable={false}
              />
              {/* A GIF ignores prefers-reduced-motion, so anybody who has asked
                  for less movement gets the words and no picture. */}
              <p className="mt-3 text-sm text-muted">
                Reading the pack, one document at a time. This takes a minute on a full one.
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              <Btn onClick={() => act("scan")} busy={busy === "scan"} tone="primary">
                Run AI scan
              </Btn>
              <Btn onClick={() => act("skip-scan")} busy={busy === "skip-scan"}>
                Skip it, I will read them
              </Btn>
            </div>
          )}
        </section>
      )}

      {c.scannedAt && (
        <section className="rounded-xl border border-line">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-base tracking-normal">What the Scan Found</h2>
            <p className="mt-0.5 text-xs text-muted">
              {data.summary} · read {prettyWhen(c.scannedAt)}
            </p>
          </div>
          {c.findings.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              Nothing flagged. That is not an approval - the documents still need your eyes.
            </p>
          ) : (
            <ul>
              {c.findings.map((f, i) => (
                <FindingRow key={`${f.checkId}-${i}`} f={f} checks={data.checks} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-line">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-base tracking-normal">The Pack</h2>
        </div>
        <ul>
          {data.checks.map((check) => {
            const filed = c.documents.filter((d) => d.checkId === check.id);
            return (
              <li
                key={check.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-sm last:border-0"
              >
                {/* Full width on a phone so the filenames sit under the check
                    name rather than being squeezed into a few characters. */}
                <span className="w-full shrink-0 text-muted sm:w-44">{check.label}</span>
                {filed.length === 0 ? (
                  <span className="text-muted">nothing filed</span>
                ) : (
                  filed.map((d) =>
                    /* A placeholder is a NAME, not a file: the bytes were
                       never stored, because there was no bucket attached or
                       because this is a walkthrough. PlcDocument's own note
                       says anything showing a pack must show this, and this
                       one did not - it rendered a link to nothing, which is
                       the exact impression the flag exists to prevent. */
                    d.placeholder ? (
                      <span key={d.key} className="text-muted">
                        {d.name}{" "}
                        <span className="text-xs">(name only, no file attached)</span>
                      </span>
                    ) : (
                      <a
                        key={d.key}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-neutral-300 underline-offset-2"
                      >
                        {d.name}
                      </a>
                    )
                  )
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {c.state === "reviewing" && (
        <section className="rounded-xl border border-line p-4">
          <h2 className="text-base tracking-normal">Your Decision</h2>
          <p className="mt-1 text-sm text-muted">
            This goes back to {who(c.agentName)} exactly as you write it. It is the only thing they
            see.
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is missing, or why this is fine."
            className="mt-3 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Btn
              onClick={() => act("decide", { decision: "approved", note })}
              busy={busy === "decide"}
              tone="primary"
            >
              Approve
            </Btn>
            <Btn onClick={() => act("decide", { decision: "deferred", note })} busy={busy === "decide"}>
              Defer
            </Btn>
            <Btn
              onClick={() => act("decide", { decision: "declined", note })}
              busy={busy === "decide"}
              tone="danger"
            >
              Decline
            </Btn>
          </div>
          <p className="mt-2 text-xs text-muted">
            A deferral or a decline needs a reason. An approval does not.
          </p>
        </section>
      )}

      {decided && (
        <section className="rounded-xl border border-line p-4 text-sm">
          <p className="text-ink">
            {c.state === "approved" ? "Approved" : c.state === "deferred" ? "Deferred" : "Declined"} by{" "}
            {c.decidedBy} on {prettyWhen(c.decidedAt)}.
          </p>
          {c.decisionNote && <p className="mt-1 text-muted">{c.decisionNote}</p>}
        </section>
      )}
    </div>
  );
}
