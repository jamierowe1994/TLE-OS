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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
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
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-medium text-orange-900">
            Compliance sent this back
          </p>
          <p className="mt-1 text-sm text-orange-800">{c.decisionNote}</p>
          <p className="mt-2 text-xs text-orange-700">
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            Approved by {c.decidedBy}
          </p>
          {c.decisionNote && (
            <p className="mt-1 text-sm text-emerald-800">{c.decisionNote}</p>
          )}
          <p className="mt-2 text-xs text-emerald-700">
            {prettyWhen(c.decidedAt)}
          </p>
        </div>
      )}

      {c.state === "declined" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-900">
            Declined by {c.decidedBy}
          </p>
          <p className="mt-1 text-sm text-rose-800">{c.decisionNote}</p>
        </div>
      )}

      {(c.state === "submitted" || c.state === "scanning" || c.state === "reviewing") && (
        <div className="rounded-xl border border-line bg-box p-4 text-sm text-muted">
          With compliance since {prettyWhen(c.submittedAt)}. You will get it back with a decision.
        </div>
      )}

      <section className="rounded-xl border border-line p-4">
        <h2 className="text-base tracking-normal text-ink">
          The Tenancy
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Move-in date</span>
            <input
              type="date"
              value={moveIn}
              disabled={!editable}
              onChange={(e) => setMoveIn(e.target.value)}
              onBlur={() => moveIn !== (c.moveInDate ?? "") && saveDetails({ moveInDate: moveIn })}
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm disabled:opacity-50"
            />
            <span className="mt-1 block text-xs text-muted">
              Every date check is measured against this, not against today.
            </span>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">
              Anything compliance should know
            </span>
            <textarea
              rows={3}
              value={note}
              disabled={!editable}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== c.agentNote && saveDetails({ agentNote: note })}
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base tracking-normal">Submission Documents</h2>
          <span className="text-xs text-muted">
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
                className="border-b border-line px-4 py-3 last:border-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-ink">
                      {check.label}
                      {short && (
                        <span className="rounded bg-box px-1.5 py-0.5 text-[11px] text-muted">
                          missing
                        </span>
                      )}
                      {check.scan === "none" && (
                        <span className="rounded bg-box px-1.5 py-0.5 text-[11px] text-muted">
                          not scanned
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{check.needs}</p>
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
                            <span className="text-muted">
                              {d.addedBy} · {prettyDate(d.addedAt)}
                            </span>
                            {editable && (
                              <button
                                type="button"
                                onClick={() => unfile(d.key)}
                                className="text-muted underline hover:text-rose-600"
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
          <span className="text-xs text-muted">
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
      /* ?case=<id> is how the wizard's "See where it is up to" arrives, so a
         handover just sent opens on itself rather than on whatever happens to
         be newest. Read once, on the first load, so it cannot fight a
         selection the user makes afterwards. */
      const asked = new URLSearchParams(window.location.search).get("case");
      setId((prev) => prev ?? (asked && res.cases.some((c) => c.id === asked) ? asked : null) ?? res.cases[0]?.id ?? null);
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
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Dry run</p>
        <h1 className="mt-1 text-2xl tracking-normal text-ink">
          PLC Handover
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Both sides of the handover on one screen. Submitting takes you to the compliance view;
          deciding sends you back to the agent. Everything you press writes to the real store.
        </p>
      </header>

      {/* The switch. Two buttons rather than a toggle, because "which one am I
          looking at" has to be answerable at a glance from across a desk. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
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
                ? "bg-ink text-page"
                : "text-muted hover:bg-box"
            }`}
          >
            You are: {label}
          </button>
        ))}
        <span className="ml-auto pr-2 text-xs text-muted">
          Nothing here is sent to anybody. It is one browser playing two people.
        </span>
      </div>

      <section className="mb-6 rounded-xl border border-line p-4">
        <h2 className="text-base tracking-normal">Start a Handover</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            placeholder="Application reference"
            value={form.applicationRef}
            onChange={(e) => setForm({ ...form, applicationRef: e.target.value })}
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
          />
          <input
            placeholder="Property address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.moveInDate}
            onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
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
                  ? "border-ink"
                  : "border-line text-muted hover:bg-box"
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
        <p className="text-sm text-muted">
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
