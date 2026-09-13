"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
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

/* The two colours that carry state on every pre-tenancy screen (the board,
   the drawer, the dashboard): green is fine or done, red is late, wrong or
   waiting on a person. Amber is the in-between - with somebody else. */
export const PLC_GREEN = "bg-[#f1f4ec] text-[#56634a]";
export const PLC_RED = "bg-[#fdefec] text-[#9d4340]";
export const PLC_AMBER = "bg-amber-50 text-amber-700";

export function Pill({ state }: { state: PlcCase["state"] }) {
  const tone: Record<PlcCase["state"], string> = {
    assembling: "bg-page text-muted",
    submitted: PLC_AMBER,
    scanning: PLC_AMBER,
    reviewing: PLC_RED,
    approved: PLC_GREEN,
    deferred: PLC_AMBER,
    declined: PLC_RED,
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
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone[state]}`}>
      {label[state]}
    </span>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-[#fdefec] px-4 py-2.5 text-[13px] text-[#9d4340]">
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
    plain: "border-line/80 bg-card text-ink hover:border-ink/40",
    primary: "border-transparent bg-accent-dark text-white hover:opacity-90",
    danger: "border-transparent bg-[#fdefec] text-[#9d4340] hover:bg-[#f9e2dd]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

function Head({ icon, title, tone = "neutral" }: { icon: string; title: string; tone?: "neutral" | "pink" }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-normal">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone === "pink" ? "bg-white/80 text-[#9d4340]" : "bg-accent-soft text-accent-dark"}`}>
        <DoodleIcon name={icon} size={14} />
      </span>
      {title}
    </h2>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold">{value}</p>
    </div>
  );
}

/* ───────────────────────────── the compliance side ─────────────────────── */

/** Renders its own <li>, so the caller keys it and does NOT wrap it — an li
 *  inside an li is a hydration error, not just untidy markup. */
function FindingRow({ f, checks }: { f: Finding; checks: Check[] }) {
  const label = checks.find((c) => c.id === f.checkId)?.label ?? f.checkId;
  const dot = {
    blocker: "bg-[#c0504a]",
    query: "bg-amber-500",
    ok: "bg-[#56634a]",
  }[f.level];
  return (
    <li className="flex gap-3 border-b border-line/60 px-5 py-3 last:border-0">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-[13.5px] text-ink">{f.message}</p>
        <p className="mt-0.5 text-[12px] text-muted">
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
    <div className="space-y-4">
      <section className="rounded-[18px] border border-line/70 bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact label="From" value={c.agentName} />
          <Fact label="Move-in" value={prettyDate(c.moveInDate)} />
          <Fact label="Handed over" value={prettyWhen(c.submittedAt)} />
        </div>
        {c.agentNote && (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-page px-4 py-3 text-[13px] leading-relaxed text-ink/80">
            {c.agentNote}
          </p>
        )}
      </section>

      {(c.state === "submitted" || c.state === "scanning") && (
        <section className="rounded-[18px] border border-line/70 bg-card p-5">
          <Head icon="search" title="Read the pack" />
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
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
        <section className="rounded-[18px] border border-line/70 bg-card">
          <div className="border-b border-line/60 px-5 py-4">
            <Head icon="search" title="What the scan found" />
            <p className="mt-1.5 text-[12px] text-muted">
              {data.summary} · read {prettyWhen(c.scannedAt)}
            </p>
          </div>
          {c.findings.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted">
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

      <section className="rounded-[18px] border border-line/70 bg-card">
        <div className="border-b border-line/60 px-5 py-4">
          <Head icon="doc" title="The pack" />
        </div>
        <ul>
          {data.checks.map((check) => {
            const filed = c.documents.filter((d) => d.checkId === check.id);
            const waived = (c.waivers ?? []).find((w) => w.checkId === check.id);
            return (
              <li
                key={check.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 px-5 py-2.5 text-[13px] last:border-0"
              >
                {/* The dot says whether the check has anything behind it,
                    before the words do: green filed, red nothing, quiet
                    waived. Full width on a phone so the filenames sit under
                    the check name. */}
                <span className={`h-2 w-2 shrink-0 rounded-full ${filed.length ? "bg-[#56634a]" : waived ? "bg-line" : "bg-[#c0504a]"}`} />
                <span className="w-full shrink-0 font-medium sm:w-44">{check.label}</span>
                {filed.length === 0 ? (
                  <span className="text-muted">{waived ? `not needed · ${waived.reason}` : "nothing filed"}</span>
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
                        className="rounded-full bg-page px-2.5 py-1 text-[12px] font-medium underline decoration-line underline-offset-2 transition hover:text-accent-dark"
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
        <section className="rounded-[18px] bg-accent-soft p-5">
          <Head icon="pencil" title="Your decision" tone="pink" />
          <p className="mt-3 text-[13px] leading-relaxed text-ink/70">
            This goes back to {who(c.agentName)} exactly as you write it. It is the only thing they
            see.
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is missing, or why this is fine."
            className="mt-3 w-full rounded-xl border border-line/70 bg-white px-4 py-3 text-[13.5px] outline-none transition focus:border-ink/40"
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
          <p className="mt-2 text-[12px] text-ink/60">
            A deferral or a decline needs a reason. An approval does not.
          </p>
        </section>
      )}

      {decided && (
        <section className={`rounded-[18px] p-5 text-[13.5px] ${c.state === "approved" ? "bg-[#f1f4ec]" : "bg-[#fdefec]"}`}>
          <p className="font-semibold text-ink">
            {c.state === "approved" ? "Approved" : c.state === "deferred" ? "Deferred" : "Declined"} by{" "}
            {c.decidedBy} on {prettyWhen(c.decidedAt)}.
          </p>
          {c.decisionNote && <p className="mt-1 text-ink/70">{c.decisionNote}</p>}
        </section>
      )}

      {/* ── Into Propoly ──
          The approved pack's files, placed in the deal's document slots so
          Kirstie generates the agreement without uploading them again. Runs
          on approval when the switch is on; this is the by-hand run and the
          record of the last one, file by file. */}
      {c.state === "approved" && (
        <section className="rounded-[18px] border border-line/70 bg-card p-5 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Head icon="upload" title="Into Propoly" />
              <p className="mt-1.5 text-[12px] text-muted">
                {c.propolyPush
                  ? `Last pushed by ${c.propolyPush.by} on ${prettyWhen(c.propolyPush.at)}${c.propolyPush.dealId ? "" : " - no deal matched"}.`
                  : "Not pushed yet. Each file goes into the deal's matching document slot."}
              </p>
            </div>
            <Btn onClick={() => act("push-propoly")} busy={busy === "push-propoly"}>
              {c.propolyPush ? "Push again" : "Push documents to Propoly"}
            </Btn>
          </div>
          {c.propolyPush && c.propolyPush.results.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {c.propolyPush.results.map((r, i) => (
                <li key={i} className="flex items-start gap-3 py-2 text-xs">
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 ${
                      r.outcome === "uploaded" || r.outcome === "already"
                        ? PLC_GREEN
                        : r.outcome === "failed"
                          ? PLC_RED
                          : "bg-page text-muted"
                    }`}
                  >
                    {r.outcome === "uploaded" ? "uploaded" : r.outcome === "already" ? "already there" : r.outcome}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">{r.name}</span>
                    {r.type && <span className="text-muted"> · {r.type.replace(/^Deal|Attachment$/g, "")}</span>}
                    <span className="block text-muted">{r.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Into REX ──
          The same certificates, written into REX's compliance table with
          the file and the expiry, so the tracker, the chases and REX PM
          stop calling them missing. Runs on approval when its switch is on;
          this is the by-hand run and the record of the last one. */}
      {c.state === "approved" && (
        <section className="rounded-[18px] border border-line/70 bg-card p-5 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Head icon="upload" title="Into REX" />
              <p className="mt-1.5 text-[12px] text-muted">
                {c.rexPush
                  ? `Last written by ${c.rexPush.by} on ${prettyWhen(c.rexPush.at)}${c.rexPush.propertyId ? "" : " - no property matched"}.`
                  : "Not written yet. Gas, EICR, EPC and licence go onto the property as compliance entries, with the expiry."}
              </p>
            </div>
            <Btn onClick={() => act("push-rex")} busy={busy === "push-rex"}>
              {c.rexPush ? "Write again" : "Write certificates to REX"}
            </Btn>
          </div>
          {c.rexPush && c.rexPush.results.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {c.rexPush.results.map((r, i) => (
                <li key={i} className="flex items-start gap-3 py-2 text-xs">
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 ${
                      r.outcome === "uploaded" || r.outcome === "already"
                        ? PLC_GREEN
                        : r.outcome === "failed"
                          ? PLC_RED
                          : "bg-page text-muted"
                    }`}
                  >
                    {r.outcome === "uploaded" ? "written" : r.outcome}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">{r.name}</span>
                    {r.type && <span className="text-muted"> · {r.type.replace(/_/g, " ")}</span>}
                    <span className="block text-muted">{r.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {c.rexPush && c.rexPush.results.length === 0 && (
            <p className="mt-2 text-xs text-muted">Nothing in this pack is a certificate REX holds.</p>
          )}
        </section>
      )}
    </div>
  );
}
