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
import {
  api,
  Btn,
  ComplianceSide,
  Note,
  Pill,
  prettyDate,
  prettyWhen,
  type Loaded,
} from "@/components/PlcReview";

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
