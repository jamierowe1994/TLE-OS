"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Check, CheckId, Finding, PlcCase } from "@/lib/plc";

/**
 * The PLC handover, both sides of it, on one screen.
 *
 * ── Why a harness and not two pages ────────────────────────────────────────
 *
 * The handover only makes sense as a loop: an agent submits, a compliance
 * officer decides, it comes back. Built as two separate screens the loop can
 * only be walked by logging out and back in as somebody else, which means in
 * practice nobody walks it and the seams between the halves are found by
 * Kirstie, live, on a real tenancy.
 *
 * So this page holds a "you are" switch and flips it at the moments the real
 * product would change hands: pressing Submit lands you on Kirstie's side,
 * deciding puts you back on the agent's. It is one page playing two people.
 *
 * It reads and writes the REAL store through the REAL routes. Nothing here is
 * mocked, which is the point - the only fiction is that one person is pressing
 * both sets of buttons.
 *
 * ── What splits out when this ships ────────────────────────────────────────
 *
 * The two halves below are already separate components taking a case and a
 * callback. Shipping means mounting <AgentSide/> on the application record and
 * <ComplianceSide/> in Kirstie's pre-tenancy screen, and deleting the switch.
 * Nothing else moves.
 */

/* ──────────────────────────────── plumbing ─────────────────────────────── */

type Loaded = {
  case: PlcCase;
  checks: Check[];
  missing: CheckId[];
  summary: string | null;
  scanConfigured: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
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

const prettyDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

/** A case started before anybody was signed in has no agent on it. Naming
 *  them in a sentence addressed TO them reads as a bug, so it does not. */
const who = (name: string) => (name && name !== "Unassigned" ? name : "the agent who submitted it");

const prettyWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/* ────────────────────────────── small pieces ───────────────────────────── */

function Pill({ state }: { state: PlcCase["state"] }) {
  const tone: Record<PlcCase["state"], string> = {
    assembling: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    submitted: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    scanning: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    reviewing: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    approved: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    deferred: "bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    declined: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
      {children}
    </p>
  );
}

function Btn({
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
      "border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800",
    primary:
      "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 dark:border-white dark:bg-white dark:text-neutral-900",
    danger:
      "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950",
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

/* ─────────────────────────────── the agent ─────────────────────────────── */

function AgentSide({
  data,
  reload,
  onSubmitted,
  say,
}: {
  data: Loaded;
  reload: () => Promise<void>;
  onSubmitted: () => void;
  say: (e: string | null) => void;
}) {
  const c = data.case;
  const editable = c.state === "assembling";
  const [busy, setBusy] = useState<string | null>(null);
  const [moveIn, setMoveIn] = useState(c.moveInDate ?? "");
  const [note, setNote] = useState(c.agentNote);
  const files = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setMoveIn(c.moveInDate ?? "");
    setNote(c.agentNote);
  }, [c.id, c.moveInDate, c.agentNote]);

  const saveDetails = async (patch: { moveInDate?: string; agentNote?: string }) => {
    say(null);
    try {
      await api(`/api/plc/${c.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await reload();
    } catch (e) {
      say((e as Error).message);
    }
  };

  /* Upload first, then file the key against the check. Two calls, because the
     bytes and the filing are genuinely two things and a half-done upload must
     not leave the case pointing at a file that is not there. */
  const attach = async (checkId: CheckId, file: File) => {
    setBusy(checkId);
    say(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", "document");
      form.append("ref", c.applicationRef);
      const up = await fetch("/api/r2/upload", { method: "POST", body: form });
      const stored = await up.json();
      if (!up.ok || !stored.ok) throw new Error(stored.error ?? "The upload failed.");
      await api(`/api/plc/${c.id}/documents`, {
        method: "POST",
        body: JSON.stringify({ checkId, name: stored.name, key: stored.key }),
      });
      await reload();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const unfile = async (key: string) => {
    setBusy(key);
    say(null);
    try {
      await api(`/api/plc/${c.id}/documents?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async (force: boolean) => {
    setBusy("submit");
    say(null);
    try {
      await api(`/api/plc/${c.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "submit", force }),
      });
      await reload();
      onSubmitted();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reopen = async () => {
    setBusy("reopen");
    say(null);
    try {
      await api(`/api/plc/${c.id}`, { method: "POST", body: JSON.stringify({ action: "reopen" }) });
      await reload();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {c.state === "deferred" && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950">
          <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
            Compliance sent this back
          </p>
          <p className="mt-1 text-sm text-orange-800 dark:text-orange-200">{c.decisionNote}</p>
          <p className="mt-2 text-xs text-orange-700 dark:text-orange-300">
            {c.decidedBy} · {prettyWhen(c.decidedAt)}
          </p>
          <div className="mt-3">
            <Btn onClick={reopen} busy={busy === "reopen"} tone="primary">
              Reopen and fix it
            </Btn>
          </div>
        </div>
      )}

      {c.state === "approved" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Approved by {c.decidedBy}
          </p>
          {c.decisionNote && (
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">{c.decisionNote}</p>
          )}
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
            {prettyWhen(c.decidedAt)}
          </p>
        </div>
      )}

      {c.state === "declined" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
          <p className="text-sm font-medium text-rose-900 dark:text-rose-100">
            Declined by {c.decidedBy}
          </p>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{c.decisionNote}</p>
        </div>
      )}

      {(c.state === "submitted" || c.state === "scanning" || c.state === "reviewing") && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          With compliance since {prettyWhen(c.submittedAt)}. You will get it back with a decision.
        </div>
      )}

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-base tracking-normal text-neutral-900 dark:text-neutral-100">
          The Tenancy
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Move-in date</span>
            <input
              type="date"
              value={moveIn}
              disabled={!editable}
              onChange={(e) => setMoveIn(e.target.value)}
              onBlur={() => moveIn !== (c.moveInDate ?? "") && saveDetails({ moveInDate: moveIn })}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Every date check is measured against this, not against today.
            </span>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Anything compliance should know
            </span>
            <textarea
              rows={3}
              value={note}
              disabled={!editable}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== c.agentNote && saveDetails({ agentNote: note })}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-base tracking-normal">Submission Documents</h2>
          <span className="text-xs text-neutral-500">
            {data.missing.length ? `${data.missing.length} still to attach` : "All attached"}
          </span>
        </div>

        <ul>
          {data.checks.map((check) => {
            const filed = c.documents.filter((d) => d.checkId === check.id);
            const short = data.missing.includes(check.id);
            return (
              <li
                key={check.id}
                className="border-b border-neutral-100 px-4 py-3 last:border-0 dark:border-neutral-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-100">
                      {check.label}
                      {short && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
                          missing
                        </span>
                      )}
                      {check.scan === "none" && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
                          not scanned
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">{check.needs}</p>
                    {filed.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {filed.map((d) => (
                          <li key={d.key} className="flex items-center gap-2 text-xs">
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate underline decoration-neutral-300 underline-offset-2"
                            >
                              {d.name}
                            </a>
                            <span className="text-neutral-400">
                              {d.addedBy} · {prettyDate(d.addedAt)}
                            </span>
                            {editable && (
                              <button
                                type="button"
                                onClick={() => unfile(d.key)}
                                className="text-neutral-400 underline hover:text-rose-600"
                              >
                                remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {editable && (
                    <div className="shrink-0">
                      <input
                        ref={(el) => {
                          files.current[check.id] = el;
                        }}
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) attach(check.id, f);
                          e.target.value = "";
                        }}
                      />
                      <Btn
                        onClick={() => files.current[check.id]?.click()}
                        busy={busy === check.id}
                      >
                        Attach
                      </Btn>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={() => submit(false)} busy={busy === "submit"} tone="primary">
            Submit to the PLC team
          </Btn>
          {data.missing.length > 0 && (
            <Btn onClick={() => submit(true)} busy={busy === "submit"}>
              Submit anyway
            </Btn>
          )}
          <span className="text-xs text-neutral-500">
            Once it goes you cannot change the pack until compliance send it back.
          </span>
        </div>
      )}
    </div>
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
    <li className="flex gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 dark:border-neutral-900">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-sm text-neutral-900 dark:text-neutral-100">{f.message}</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {label}
          {f.documentName ? ` · ${f.documentName}` : ""}
          {f.foundDate ? ` · ${prettyDate(f.foundDate)}` : ""}
        </p>
      </div>
    </li>
  );
}

function ComplianceSide({
  data,
  reload,
  onDecided,
  say,
}: {
  data: Loaded;
  reload: () => Promise<void>;
  onDecided: () => void;
  say: (e: string | null) => void;
}) {
  const c = data.case;
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    say(null);
    try {
      await api(`/api/plc/${c.id}`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
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
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">From</p>
            <p>{c.agentName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Move-in</p>
            <p>{prettyDate(c.moveInDate)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Submitted</p>
            <p>{prettyWhen(c.submittedAt)}</p>
          </div>
        </div>
        {c.agentNote && (
          <p className="mt-3 whitespace-pre-wrap border-l-2 border-neutral-200 pl-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
            {c.agentNote}
          </p>
        )}
      </section>

      {(c.state === "submitted" || c.state === "scanning") && (
        <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-base tracking-normal">Read the Pack</h2>
          <p className="mt-1 text-sm text-neutral-500">
            The scan reads dates and names out of the documents and tells you what it found. It does
            not decide anything. You still approve, defer or decline.
          </p>
          {!data.scanConfigured && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              The reader is not switched on in this environment, so it will only tell you what is
              missing.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <Btn onClick={() => act("scan")} busy={busy === "scan"} tone="primary">
              Run AI scan
            </Btn>
            <Btn onClick={() => act("skip-scan")} busy={busy === "skip-scan"}>
              Skip it, I will read them
            </Btn>
          </div>
        </section>
      )}

      {c.scannedAt && (
        <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-base tracking-normal">What the Scan Found</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {data.summary} · read {prettyWhen(c.scannedAt)}
            </p>
          </div>
          {c.findings.length === 0 ? (
            <p className="px-4 py-4 text-sm text-neutral-500">
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

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-base tracking-normal">The Pack</h2>
        </div>
        <ul>
          {data.checks.map((check) => {
            const filed = c.documents.filter((d) => d.checkId === check.id);
            return (
              <li
                key={check.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-100 px-4 py-2.5 text-sm last:border-0 dark:border-neutral-900"
              >
                {/* Full width on a phone so the filenames sit under the check
                    name rather than being squeezed into a few characters. */}
                <span className="w-full shrink-0 text-neutral-500 sm:w-44">{check.label}</span>
                {filed.length === 0 ? (
                  <span className="text-neutral-400">nothing filed</span>
                ) : (
                  filed.map((d) => (
                    <a
                      key={d.key}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-neutral-300 underline-offset-2"
                    >
                      {d.name}
                    </a>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {c.state === "reviewing" && (
        <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-base tracking-normal">Your Decision</h2>
          <p className="mt-1 text-sm text-neutral-500">
            This goes back to {who(c.agentName)} exactly as you write it. It is the only thing they
            see.
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is missing, or why this is fine."
            className="mt-3 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
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
          <p className="mt-2 text-xs text-neutral-500">
            A deferral or a decline needs a reason. An approval does not.
          </p>
        </section>
      )}

      {decided && (
        <section className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="text-neutral-900 dark:text-neutral-100">
            {c.state === "approved" ? "Approved" : c.state === "deferred" ? "Deferred" : "Declined"} by{" "}
            {c.decidedBy} on {prettyWhen(c.decidedAt)}.
          </p>
          {c.decisionNote && <p className="mt-1 text-neutral-600 dark:text-neutral-300">{c.decisionNote}</p>}
        </section>
      )}
    </div>
  );
}

/* ─────────────────────────────── the harness ───────────────────────────── */

export default function PlcDryRun() {
  const [cases, setCases] = useState<PlcCase[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [role, setRole] = useState<"agent" | "compliance">("agent");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ applicationRef: "", address: "", moveInDate: "" });

  const loadList = useCallback(async () => {
    try {
      const res = await api<{ cases: PlcCase[] }>("/api/plc");
      setCases(res.cases);
      setId((prev) => prev ?? res.cases[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadCase = useCallback(async () => {
    if (!id) {
      setData(null);
      return;
    }
    try {
      const res = await api<Loaded>(`/api/plc/${id}`);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  const reload = useCallback(async () => {
    await Promise.all([loadCase(), loadList()]);
  }, [loadCase, loadList]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ case: PlcCase }>("/api/plc", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setId(res.case.id);
      setForm({ applicationRef: "", address: "", moveInDate: "" });
      await loadList();
      setRole("agent");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Dry run</p>
        <h1 className="mt-1 text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
          PLC Handover
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500">
          Both sides of the handover on one screen. Submitting takes you to the compliance view;
          deciding sends you back to the agent. Everything you press writes to the real store.
        </p>
      </header>

      {/* The switch. Two buttons rather than a toggle, because "which one am I
          looking at" has to be answerable at a glance from across a desk. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2 dark:border-neutral-800">
        {(
          [
            ["agent", "Agent"],
            ["compliance", "Kirstie, compliance"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRole(key)}
            className={`rounded-lg px-3.5 py-2 text-sm transition ${
              role === key
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            You are: {label}
          </button>
        ))}
        <span className="ml-auto pr-2 text-xs text-neutral-500">
          Nothing here is sent to anybody. It is one browser playing two people.
        </span>
      </div>

      <section className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-base tracking-normal">Start a Handover</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            placeholder="Application reference"
            value={form.applicationRef}
            onChange={(e) => setForm({ ...form, applicationRef: e.target.value })}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <input
            placeholder="Property address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <input
            type="date"
            value={form.moveInDate}
            onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
        </div>
        <div className="mt-3">
          <Btn onClick={start} busy={starting} disabled={!form.applicationRef || !form.address}>
            Start it
          </Btn>
        </div>
      </section>

      {cases.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {cases.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setId(k.id)}
              /* Full width on a phone. As an inline chip the address truncates
                 to nothing and the state pill pushes past the viewport edge. */
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition sm:w-auto sm:justify-start ${
                k.id === id
                  ? "border-neutral-900 dark:border-white"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              }`}
            >
              <span className="min-w-0 truncate text-left sm:max-w-[16rem]">{k.address}</span>
              <Pill state={k.state} />
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      )}

      {!data ? (
        <p className="text-sm text-neutral-500">
          {cases.length ? "Loading…" : "Nothing yet. Start a handover above."}
        </p>
      ) : role === "agent" ? (
        <AgentSide
          data={data}
          reload={reload}
          say={setError}
          onSubmitted={() => setRole("compliance")}
        />
      ) : (
        <ComplianceSide
          data={data}
          reload={reload}
          say={setError}
          onDecided={() => setRole("agent")}
        />
      )}
    </div>
  );
}
