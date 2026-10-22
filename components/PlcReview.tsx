"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { CopyButton } from "@/components/Bits";
import type { AnswerGroup, TenantAnswers } from "@/lib/plc-tenant-answers";
import { finalAskNow, finalAskSent, gateOf, sentAnywayNow, type Check, type CheckId, type Finding, type PlcCase, type SentAnyway } from "@/lib/plc";

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
  /** What the person looking may do. Absent on the practice and preview
   *  screens, where one person plays every part. */
  me?: {
    canCheck: boolean;
    canApprove: boolean;
    approveBlocked: string | null;
    approvers?: string;
    /** Send to Susan for Final Approval: who it goes to, and whether this person may press it. */
    finalAsk?: { approver: { name: string; firstName: string } | null; canSend: boolean; blocked: string | null };
  };
  /** The RLP request as it would go, when the agent asked for cover. */
  rlp?: { preview: { subject: string; html: string; files: string[] }; teamSet: boolean; switchOn: boolean } | null;
  /** What the tenants said, when the screen already has it (the public
   *  preview's invented pack). Otherwise the panel reads it from
   *  /api/plc/<id>/answers itself. */
  tenantAnswers?: TenantAnswers | null;
  /** The approval's uploads still going into Propoly and REX (22 Oct 2026). */
  pushing?: { propoly: boolean; rex: boolean } | null;
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
    checked: PLC_AMBER,
    approved: PLC_GREEN,
    deferred: PLC_AMBER,
    declined: PLC_RED,
  };
  const label: Record<PlcCase["state"], string> = {
    assembling: "Assembling",
    submitted: "Submitted",
    scanning: "Scanning",
    reviewing: "First check",
    checked: "Final approval",
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

/**
 * Sent anyway (James, 16 Oct 2026). The agent went past what the reader
 * flagged, so it is the first thing on the pack: who, why, and each warning
 * they went past, before anything else is read.
 */
function SentAnywayCard({ s, checks }: { s: SentAnyway; checks: Check[] }) {
  const n = s.warnings.length;
  return (
    <section className="rounded-[18px] border border-[#e8b4ab] bg-[#fdefec] p-5">
      <Head icon="info" title="Sent Anyway" tone="pink" />
      <p className="mt-3 text-[13px] leading-relaxed text-[#9d4340]">
        {s.by} sent this past {n === 1 ? "a warning" : `${n} warnings`} from the reader on {prettyWhen(s.at)}. Check{" "}
        {n === 1 ? "it" : "these"} first.
      </p>
      <p className="mt-3 rounded-xl bg-white/80 px-4 py-3 text-[13.5px] leading-relaxed text-ink">
        <span className="block text-[11.5px] text-muted">Their reason</span>
        &ldquo;{s.reason}&rdquo;
      </p>
      <ul className="mt-3 space-y-2">
        {s.warnings.map((w, i) => (
          <li key={i} className="flex gap-3 text-[13px] text-ink">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c0504a]" />
            <span className="min-w-0">
              {w.message}
              <span className="block text-[12px] text-muted">
                {checks.find((c) => c.id === w.checkId)?.label ?? w.checkId}
                {w.documentName ? ` · ${w.documentName}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A small tag for the queue: this one was sent past the reader's warnings. */
export function SentAnywayTag({ c }: { c: Pick<PlcCase, "sentAnyway" | "submittedAt" | "state"> }) {
  if (!sentAnywayNow(c)) return null;
  return <span className="shrink-0 whitespace-nowrap rounded-full bg-[#fdefec] px-2.5 py-1 text-[11px] font-semibold text-[#9d4340]">Sent anyway</span>;
}

/** A small tag for the queue: sent to Susan and waiting on her (20 Oct 2026). */
export function FinalAskTag({ c }: { c: Pick<PlcCase, "finalAsks" | "checkedAt" | "state"> }) {
  const ask = finalAskSent(c);
  if (!ask) return null;
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      With {ask.test ? "you (test)" : firstOf(ask.toName)}
    </span>
  );
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Send to Susan for Final Approval (20 Oct 2026).
 *
 * The first check is done; the pack waits on the final approver. Whoever did
 * the check presses this and Susan is emailed a link straight to the pack.
 * Once sent it says so - "With Susan for final approval, sent 20 Oct at 14:12
 * by Kirstie" - and the button becomes Send Again, a reminder. It shows only
 * on a pack that is complete enough to approve (the server's gate decides).
 */
function FinalAskCard({
  c,
  offer,
  busy,
  notice,
  onSend,
}: {
  c: PlcCase;
  offer: NonNullable<NonNullable<Loaded["me"]>["finalAsk"]>;
  busy: boolean;
  notice: string | null;
  onSend: () => void;
}) {
  const sent = finalAskSent(c);
  const last = finalAskNow(c);
  const failed = last && !last.sent ? last : null;
  const name = offer.approver?.firstName ?? (sent ? firstOf(sent.toName) : "the approver");
  const times = (c.finalAsks ?? []).filter((a) => a.sent && c.checkedAt && a.at >= c.checkedAt).length;
  /* Susan looking at her own pack: no button, just whose turn it is. */
  const mine = !offer.canSend && !offer.blocked && Boolean(offer.approver);
  if (!sent && !offer.canSend && !offer.blocked) return null;
  return (
    <section className="rounded-[18px] border border-line/70 bg-card p-5 text-[13.5px]">
      <h2 className="flex items-center gap-2.5 text-[15px] font-normal tracking-normal">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name={sent ? "clock" : "mail"} size={14} />
        </span>
        {sent ? (mine ? "With You for Final Approval" : `With ${name} for Final Approval`) : `Send to ${name} for Final Approval`}
      </h2>
      {sent ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-amber-800" data-final-ask="sent">
          {sent.test ? "Test email to you, sent" : `Sent to ${mine ? "you" : name}`} {prettyWhen(sent.at).replace(", ", " at ")} by{" "}
          {firstOf(sent.by)}
          {times > 1 ? ` (${times} emails, the last a reminder)` : ""}.
        </p>
      ) : (
        <p className="mt-3 leading-relaxed text-ink/70">
          {name} gives the final approval. Send it and {name} gets an email with a link straight to this pack.
        </p>
      )}
      {failed && (
        <p className="mt-3 rounded-xl bg-[#fdefec] px-4 py-2.5 text-[#9d4340]">
          The last try, {prettyWhen(failed.at)} by {firstOf(failed.by)}, did not go: {failed.note || "no reason given"}.
        </p>
      )}
      {offer.canSend ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Btn onClick={onSend} busy={busy} tone={sent ? "plain" : "primary"}>
            {sent ? "Send Again" : `Send to ${name} for Final Approval`}
          </Btn>
          {sent && <span className="text-[12px] text-ink/60">Sends {name} a reminder.</span>}
        </div>
      ) : offer.blocked ? (
        <p className="mt-2 text-[12px] text-ink/60">{offer.blocked}</p>
      ) : null}
      {notice && last?.sent && <p className="mt-2 text-[12px] font-semibold text-[#56634a]" role="status">{notice}</p>}
    </section>
  );
}

/** How often an open pack with files waiting to read asks whether they are in. */
const WAITING_POLL_MS = 30_000;
/** How often an approved pack whose files are still going in asks whether they are done. */
const PUSH_POLL_MS = 4_000;

/** Renders its own <li>, so the caller keys it and does NOT wrap it — an li
 *  inside an li is a hydration error, not just untidy markup. */
function FindingRow({ f, checks }: { f: Finding; checks: Check[] }) {
  const label = checks.find((c) => c.id === f.checkId)?.label ?? f.checkId;
  /* Waiting to read (22 Oct 2026): not a finding about the file, so not
     amber - a quiet dot and the words, until it reads itself. */
  const dot = f.waiting
    ? "bg-muted/50"
    : {
        blocker: "bg-[#c0504a]",
        query: "bg-amber-500",
        ok: "bg-[#56634a]",
      }[f.level];
  return (
    <li className="flex gap-3 border-b border-line/60 px-5 py-3 last:border-0" data-plc-waiting={f.waiting ? "" : undefined}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-[13.5px] text-ink">{f.message}</p>
        <p className="mt-0.5 text-[12px] text-muted">
          {f.waiting && <span className="mr-1.5 inline-block rounded-full bg-box px-2 py-px text-[11px] font-semibold text-ink/70">Waiting to read</span>}
          {label}
          {f.documentName ? ` · ${f.documentName}` : ""}
          {f.foundDate ? ` · ${prettyDate(f.foundDate)}` : ""}
        </p>
      </div>
    </li>
  );
}

/* ───────────────────────────── tenant answers ──────────────────────────── */

/** One group of answers, each line with its own copy button and the group with Copy All. */
function AnswerBlock({ g }: { g: AnswerGroup }) {
  const all = g.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{g.title}</p>
        <CopyAll value={all} />
      </div>
      <ul className="mt-1 divide-y divide-line/60 rounded-xl border border-line/60 bg-white">
        {g.rows.map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex items-start gap-2 py-1.5 pl-3.5 pr-1.5 text-[13px] sm:items-center">
            <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-[12px] text-muted sm:w-44">{r.label}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words font-medium text-ink">{r.value}</span>
            </span>
            <CopyButton value={r.copy ?? r.value} label={r.label.toLowerCase()} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyAll({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked: every line is on screen to select by hand */
        }
      }}
      className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-accent-dark transition hover:bg-accent-soft"
    >
      {done ? "Copied" : "Copy All"}
    </button>
  );
}

/**
 * Tenant Answers (Kirstie, 21 Oct 2026). After the check she fills in the
 * Propoly deal, and what the tenants said - pets, smokers, who is moving in,
 * what they asked for - was in the passport, the offer and the application.
 * Here it is on the pack, in Propoly's order, each line ready to paste.
 *
 * Read from /api/plc/<id>/answers when the panel opens (lib/plc-tenant-answers),
 * so the pack itself never waits on it. Open by default once the check is
 * done, when the deal is what comes next; a click away before that.
 */
function TenantAnswersCard({ c, given, live }: { c: PlcCase; given?: TenantAnswers | null; live: boolean }) {
  const [state, setState] = useState<{ answers: TenantAnswers | null; error: string | null; loading: boolean }>({
    answers: given ?? null,
    error: null,
    loading: live && !given,
  });
  const [open, setOpen] = useState(c.state === "checked" || c.state === "approved");

  useEffect(() => {
    if (!live || given) return;
    let on = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api<{ answers: TenantAnswers }>(`/api/plc/${encodeURIComponent(c.id)}/answers`)
      .then((r) => on && setState({ answers: r.answers, error: null, loading: false }))
      .catch((e: Error) => on && setState({ answers: null, error: e.message, loading: false }));
    return () => {
      on = false;
    };
  }, [c.id, live, given]);

  if (!live && !given) return null;
  const a = state.answers;
  const tenants = a?.people.filter((p) => p.role !== "Guarantor").length ?? 0;
  const guarantors = a?.people.filter((p) => p.role === "Guarantor").length ?? 0;
  const count = [
    tenants ? `${tenants} tenant${tenants === 1 ? "" : "s"}` : "",
    guarantors ? `${guarantors} guarantor${guarantors === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(", ");

  return (
    <section className="rounded-[18px] border border-line/70 bg-card" data-plc="tenant-answers">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0">
          <Head icon="user" title="Tenant Answers" />
          <span className="mt-1.5 block text-[12px] text-muted">
            {state.loading
              ? "Reading their answers…"
              : a
                ? `What the tenants told us, in the order the Propoly deal asks for it${count ? ` · ${count}` : ""}`
                : "Their answers didn't load."}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[12px] font-semibold text-ink">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-line/60 px-5 py-4">
          {state.loading ? (
            <div className="flex items-center gap-3 py-2 text-[13px] text-muted" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
              Reading the passport, the offer and the application…
            </div>
          ) : state.error ? (
            <Note>{state.error}</Note>
          ) : !a || (!a.let.length && !a.people.some((p) => p.groups.length)) ? (
            <p className="text-[13px] text-muted">
              Nothing from the tenants on file yet: no passport, offer or application answers for the people on this let.
            </p>
          ) : (
            <div className="space-y-5">
              {a.let.length > 0 && (
                <div>
                  <p className="text-[14px] font-semibold text-ink">The Let</p>
                  {a.from.length > 0 && <p className="text-[12px] text-muted">From {a.from.join(" · ")}</p>}
                  <div className="mt-2">
                    {a.let.map((g) => (
                      <AnswerBlock key={g.title} g={g} />
                    ))}
                  </div>
                </div>
              )}
              {a.people.map((p) => (
                <div key={p.key} className="rounded-2xl bg-page p-4">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <p className="text-[14px] font-semibold text-ink">{p.name}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${p.role === "Guarantor" ? "bg-amber-50 text-amber-700" : "bg-accent-soft text-accent-dark"}`}>
                      {p.role}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">{p.from.length ? `From ${p.from.join(" · ")}` : "Nothing from them on file yet."}</p>
                  {p.groups.length > 0 && (
                    <div className="mt-3">
                      {p.groups.map((g) => (
                        <AnswerBlock key={g.title} g={g} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
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
  const [notice, setNotice] = useState<string | null>(null);
  /* One press at a time. `busy` greys the button only once React has
     rendered, so a fast double-click got two requests out first; the server
     refuses the second Send to Susan, but the refusal read as an error. */
  const inFlight = useRef(false);

  /* Files the reader was offline for read themselves once it is back (lib/
     plc-reread, started by opening the pack). Asked again quietly until they
     are in, so the lines change on screen without anybody pressing reload. */
  const waiting = c.findings.some((f) => f.waiting) || c.documents.some((d) => d.read?.waiting);
  useEffect(() => {
    if (!waiting || perform) return;
    const t = setInterval(() => {
      if (!inFlight.current) void reload().catch(() => {});
    }, WAITING_POLL_MS);
    return () => clearInterval(t);
  }, [waiting, perform, reload]);

  /* An approval's uploads run after it answers (22 Oct 2026, 10 Richmond
     Avenue took 43s with them in the way). Asked again until they are in. */
  const pushing = data.pushing ?? null;
  useEffect(() => {
    if (!pushing || perform) return;
    const t = setInterval(() => {
      if (!inFlight.current) void reload().catch(() => {});
    }, PUSH_POLL_MS);
    return () => clearInterval(t);
  }, [pushing, perform, reload]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    say(null);
    setNotice(null);
    try {
      if (perform) {
        await perform(action, extra);
      } else {
        const res = await api<{ message?: string }>(`/api/plc/${c.id}`, {
          method: "POST",
          body: JSON.stringify({ action, ...extra }),
        });
        if (res.message) setNotice(res.message);
      }
      await reload();
      /* The first check no longer closes the pack (20 Oct 2026): it lands on
         the final approval step, where Send to Susan is the next press. */
      if (action === "decide") onDecided();
    } catch (e) {
      say((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const decided = c.state === "approved" || c.state === "deferred" || c.state === "declined";
  const canCheck = data.me?.canCheck ?? true;
  const canApprove = data.me?.canApprove ?? true;
  const approvers = data.me?.approvers ?? "Kirstie, Michael or Susan";

  const anyway = sentAnywayNow(c);

  return (
    <div className="space-y-4">
      {anyway && <SentAnywayCard s={anyway} checks={data.checks} />}
      <section className="rounded-[18px] border border-line/70 bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <Fact label="From" value={c.agentName} />
          <Fact label="Move-in" value={prettyDate(c.moveInDate)} />
          <Fact label="Handed over" value={prettyWhen(c.submittedAt)} />
          <Fact label="Rent guarantee" value={c.rlpWanted === true ? "Asked for" : c.rlpWanted === false ? "Not wanted" : "Not answered"} />
        </div>
        {c.agentNote && (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-page px-4 py-3 text-[13px] leading-relaxed text-ink/80">
            {c.agentNote}
          </p>
        )}
        {/* Additional clauses (21 Oct 2026): copied into the Propoly deal by
            pre-tenancy, so laid out to copy as written. */}
        {c.clauses?.any === true && c.clauses.text.trim() ? (
          <div className="mt-4 rounded-xl bg-page px-4 py-3">
            <div className="flex items-center gap-3">
              <p className="text-[13px] font-medium text-ink">Additional clauses</p>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(c.clauses?.text ?? "")}
                className="ml-auto text-xs underline underline-offset-2 hover:text-ink"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink/80">{c.clauses.text}</p>
          </div>
        ) : c.clauses?.any === false ? (
          <p className="mt-3 text-xs text-muted">No additional clauses.</p>
        ) : null}
      </section>

      {(c.state === "submitted" || c.state === "scanning") && (
        <section className="rounded-[18px] border border-line/70 bg-card p-5">
          <Head icon="search" title="Read the pack" />
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            The scan reads dates and names out of the documents and tells you what it found. It does
            not decide anything. A person still checks it, and then {approvers} approves it.
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
            /* A reference report that covers Right to Rent is listed under both. */
            const filed = c.documents.filter((d) => d.checkId === check.id || d.covers?.includes(check.id));
            const waived = (c.waivers ?? []).find((w) => w.checkId === check.id);
            /* Optional on this let and nothing filed: an empty line about a
               PAT test on an ordinary flat is noise (6 Oct 2026). */
            if (!filed.length && !waived && gateOf(check, c.letType) === "optional") return null;
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
                        {d.label || d.name}{" "}
                        <span className="text-xs">(name only, no file attached)</span>
                      </span>
                    ) : (
                      <span key={d.key} className="inline-flex flex-wrap items-center gap-1.5">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-page px-2.5 py-1 text-[12px] font-medium underline decoration-line underline-offset-2 transition hover:text-accent-dark"
                        >
                          {d.label || d.name}
                        </a>
                        {/* Anything else, named by the agent (16 Oct 2026): their words lead, the file name follows. */}
                        {d.label && <span className="text-[11.5px] text-muted">{d.name}</span>}
                        {/* What the reader saw when it was dropped: the date
                            that matters, for checking against the file. */}
                        {d.read?.expiryDate && (
                          <span
                            className={`text-[11.5px] ${
                              c.moveInDate && d.read.expiryDate < c.moveInDate ? "text-[#c0504a]" : "text-muted"
                            }`}
                          >
                            valid until{" "}
                            {new Date(`${d.read.expiryDate}T12:00:00`).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </span>
                    )
                  )
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Step one: the first check (James, 30 Sep 2026) ──
          Josel reads every document against the pack. Passing it on is not
          an approval: nothing leaves the building and the agent is not told.
          Anything wrong goes back to the agent from here, without waiting. */}
      {c.state === "reviewing" && (
        <section className="rounded-[18px] bg-accent-soft p-5">
          <Head icon="checklist" title="First check" tone="pink" />
          <p className="mt-3 text-[13px] leading-relaxed text-ink/70">
            Check every document against the pack. When it is right, pass it to {approvers} for
            the final approval. If something is wrong, send it back to {who(c.agentName)} now.
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For the approver: anything you checked twice. For the agent: what is missing."
            className="mt-3 w-full rounded-xl border border-line/70 bg-white px-4 py-3 text-[13.5px] outline-none transition focus:border-ink/40"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Btn onClick={() => act("check", { note })} busy={busy === "check"} tone="primary" disabled={!canCheck}>
              Checked, pass for approval
            </Btn>
            <Btn onClick={() => act("decide", { decision: "deferred", note })} busy={busy === "decide"} disabled={!canCheck}>
              Send back
            </Btn>
            <Btn onClick={() => act("decide", { decision: "declined", note })} busy={busy === "decide"} tone="danger" disabled={!canCheck}>
              Decline
            </Btn>
          </div>
          <p className="mt-2 text-[12px] text-ink/60">
            Sending back or declining needs a reason: the agent reads it exactly as written.
          </p>
        </section>
      )}

      {/* The first check, on the record, once it is done. */}
      {c.checkedAt && (
        <section className="rounded-[18px] border border-line/70 bg-card p-5 text-[13.5px]">
          <p className="font-semibold text-ink">
            First check by {c.checkedBy} on {prettyWhen(c.checkedAt)}.
          </p>
          {c.checkNote && <p className="mt-1 whitespace-pre-wrap text-ink/70">{c.checkNote}</p>}
        </section>
      )}

      {c.state === "checked" && data.me?.finalAsk && (
        <FinalAskCard c={c} offer={data.me.finalAsk} busy={busy === "ask-final"} notice={notice} onSend={() => act("ask-final")} />
      )}

      {/* ── Step two: the final approval ── a named approver, and never the
          person who did the first check. */}
      {c.state === "checked" && (
        <section className="rounded-[18px] bg-accent-soft p-5">
          <Head icon="pencil" title="Final approval" tone="pink" />
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
              disabled={!canApprove}
            >
              Approve
            </Btn>
            <Btn onClick={() => act("decide", { decision: "deferred", note })} busy={busy === "decide"} disabled={!canCheck}>
              Send back
            </Btn>
            <Btn
              onClick={() => act("decide", { decision: "declined", note })}
              busy={busy === "decide"}
              tone="danger"
              disabled={!canCheck}
            >
              Decline
            </Btn>
          </div>
          <p className="mt-2 text-[12px] text-ink/60">
            {!canApprove && data.me?.approveBlocked
              ? data.me.approveBlocked
              : c.rlpWanted
                ? "The agent asked for Rent and Legal Protection. After approving, only send the request if the referencing qualifies: every tenant, or their guarantor, at an acceptable grade."
                : "Sending back or declining needs a reason. An approval does not."}
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

      {/* ── Rent and Legal Protection ──
          Only when the agent asked for it, and only after the final
          approval. An email from the approver's own Outlook to Legal for
          Landlords' RLP team, with the referencing attached. There is no API
          to request cover, so this is the step (James, 30 Sep 2026). */}
      {c.state === "approved" && c.rlpWanted && data.rlp && (
        <section className="rounded-[18px] border border-line/70 bg-card p-5 text-[13px]">
          <Head icon="shield" title="Rent and Legal Protection" />
          <p className="mt-1.5 text-[12px] text-muted">
            {c.rlpRequest
              ? c.rlpRequest.outcome === "sent"
                ? `Requested by ${c.rlpRequest.by} on ${prettyWhen(c.rlpRequest.at)}, to ${c.rlpRequest.to}. ${c.rlpRequest.note}.`
                : `The last try by ${c.rlpRequest.by} on ${prettyWhen(c.rlpRequest.at)} did not go: ${c.rlpRequest.note}`
              : "The agent asked for cover. Not requested yet."}
          </p>
          <div className="mt-3 rounded-xl bg-page px-4 py-3">
            <p className="text-[12px] text-muted">Subject</p>
            <p className="font-semibold">{data.rlp.preview.subject}</p>
            <div
              className="mt-2 text-[13px] leading-relaxed text-ink/80 [&_p]:mt-2 [&_table]:mt-2"
              dangerouslySetInnerHTML={{ __html: data.rlp.preview.html }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Btn
              onClick={() => act("rlp-send", {})}
              busy={busy === "rlp-send"}
              tone="primary"
              disabled={!data.rlp.teamSet || !data.rlp.switchOn || !canApprove || c.rlpRequest?.outcome === "sent"}
            >
              {c.rlpRequest?.outcome === "sent" ? "Requested" : "Send to Legal for Landlords"}
            </Btn>
            <Btn onClick={() => act("rlp-send", { test: true })} busy={busy === "rlp-send"}>
              Send a test to me
            </Btn>
          </div>
          {(!data.rlp.teamSet || !data.rlp.switchOn) && (
            <p className="mt-2 text-[12px] text-muted">
              {!data.rlp.teamSet
                ? "The RLP team's address isn't set yet, so only a test can go."
                : "RLP requests are switched off, so only a test can go."}
            </p>
          )}
        </section>
      )}

      {/* What the tenants said, for filling in the Propoly deal (21 Oct 2026).
          The public preview passes its own; anywhere else it is read live. */}
      <TenantAnswersCard c={c} given={data.tenantAnswers} live={!perform} />

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
                {pushing?.propoly
                  ? "Putting the files into the deal now. This updates itself."
                  : c.propolyPush
                  ? `Last pushed by ${c.propolyPush.by} on ${prettyWhen(c.propolyPush.at)}${c.propolyPush.dealId ? "" : " - no deal matched"}.`
                  : "Not pushed yet. Each file goes into the deal's matching document slot."}
              </p>
            </div>
            <Btn onClick={() => act("push-propoly")} busy={busy === "push-propoly" || Boolean(pushing?.propoly)}>
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
                {pushing?.rex
                  ? "Writing the certificates now. This updates itself."
                  : c.rexPush
                  ? `Last written by ${c.rexPush.by} on ${prettyWhen(c.rexPush.at)}${c.rexPush.propertyId ? "" : " - no property matched"}.`
                  : "Not written yet. Gas, EICR, EPC and licence go onto the property as compliance entries, with the expiry."}
              </p>
            </div>
            <Btn onClick={() => act("push-rex")} busy={busy === "push-rex" || Boolean(pushing)}>
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
