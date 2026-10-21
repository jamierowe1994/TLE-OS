"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * REX status (21 Oct 2026, lib/rex-outage).
 *
 * REX went offline from 2.45pm for a security upgrade, back about 8am. This is
 * where James sees whether the OS thinks REX is up, forces it either way if
 * the detection is wrong, takes the copy, and watches the changes that are
 * waiting to go to REX.
 */

type Mode = "auto" | "down" | "up";
type Status = {
  down: boolean;
  reason: "forced" | "planned" | "detected" | null;
  setting: { mode: Mode; plannedFrom: string | null; plannedUntil: string | null; setBy: string; setAt: string | null };
  copyTakenAt: string | null;
  oldestServedAt: string | null;
  servedCount: number;
  missedCount: number;
  missedWhat: Array<{ what: string; n: number }>;
  waiting: number;
  lastOkAt: string | null;
  lastFailAt: string | null;
  lastFailWhat: string | null;
  trippedAt: string | null;
  snapshot: { rows: number; newest: string | null; oldest: string | null; mb: number } | null;
  lastRun: { startedAt: string; finishedAt: string | null; by: string; steps: number; failed: number; kept: number; note?: string } | null;
};
type Row = {
  id: string;
  service: string;
  method: string;
  actorName: string;
  asPerson: boolean;
  recordKind: string | null;
  recordId: string | null;
  summary: string;
  state: "waiting" | "sent" | "failed" | "held" | "skipped";
  queuedAt: string;
  sentAt: string | null;
  error: string | null;
};
type Item = { id: string; label: string; detail: string; at: string | null; href?: string };
type PhaseCheck = { key: string; label: string; what: string; items: Item[]; error: string | null };
type Hand = { id: string; what: string; summary: string; who: string; at: string; recordKind: string | null; recordId: string | null; href: string | null };
type PhaseRun = { key: string; sent: number; stopped: { id: string; label: string; error: string } | null; skippedBecause?: string };
type CatchupProgress = { running: boolean; by: string; startedAt: string | null; finishedAt: string | null; phase: string | null; results: PhaseRun[] };
type Run = { running: boolean; planned: number; done: number; failed: number; current: string | null; lastError: string | null; deadline: string | null };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "-";

/** datetime-local wants local wall time without a zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const REASON: Record<string, string> = {
  forced: "you set it to down",
  planned: "inside the planned window",
  detected: "REX stopped answering",
};

export default function RexStatusPage() {
  const [s, setS] = useState<Status | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [check, setCheck] = useState<{ since: string; phases: PhaseCheck[]; hand: Hand[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [catchup, setCatchup] = useState<CatchupProgress | null>(null);
  const [openPhase, setOpenPhase] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/rex-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { status: Status; queue: Row[]; run: Run; catchup: CatchupProgress }) => {
        setS(j.status);
        setRows(j.queue);
        setRun(j.run);
        setCatchup(j.catchup);
        setFrom((f) => f || toLocalInput(j.status.setting.plannedFrom));
        setUntil((u) => u || toLocalInput(j.status.setting.plannedUntil));
      })
      .catch(() => setDenied(true));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/rex-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) setFlash(j.error ?? "That didn't work.");
      else if (j.report) {
        const rep = j.report as { sent: number; held: number; stopped: { id: string; what: string; error: string } | null; skippedBecause?: string };
        setFlash(
          rep.skippedBecause
            ? `Not sent: ${rep.skippedBecause}.`
            : rep.stopped
              ? `Sent ${rep.sent}, then stopped at #${rep.stopped.id}: ${rep.stopped.error}`
              : `Sent ${rep.sent}${rep.held ? `, ${rep.held} kept back (no longer switched on)` : ""}.`
        );
      } else if (done) setFlash(done);
    } finally {
      setBusy(false);
      load();
    }
  };

  const lookAgain = useCallback(() => {
    setChecking(true);
    fetch("/api/admin/rex-status?catchup=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCheck({ since: j.since, phases: j.phases, hand: j.hand }))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  /* A run finishing: look again, so the counts say what is left. */
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && catchup && !catchup.running) lookAgain();
    wasRunning.current = Boolean(catchup?.running);
  }, [catchup, lookAgain]);

  if (denied) return <p className="text-[12.5px] text-muted">Only an owner can see this.</p>;
  if (!s) return <p className="text-[12.5px] text-muted">Loading…</p>;

  const mode = s.setting.mode;
  const waiting = rows.filter((r) => r.state === "waiting" || r.state === "failed");
  const done = rows.filter((r) => !(r.state === "waiting" || r.state === "failed")).slice(0, 40);

  return (
    <>
      <PageHeader
        illustration="/illustrations/people/lending-a-hand.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="REX Status"
        blurb="Whether the OS is asking REX or showing the copy, the copy itself, and the changes waiting to go to REX."
      />

      {flash && <p className="fade-up mt-4 rounded-[18px] border border-line/50 bg-white p-3 text-[12.5px]">{flash}</p>}

      <section className="fade-up mt-6 rounded-[22px] border border-line/50 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13.5px]">{s.down ? "REX is down - screens show the copy" : "REX is answering"}</span>
          <Pill tone={s.down ? "accent" : "neutral"}>{s.down ? "down" : "up"}</Pill>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          {s.down
            ? `Down because ${REASON[s.reason ?? ""] ?? "it is"}. Nothing is sent to REX; reads come from the copy and armed changes wait.`
            : "Every read goes to REX and is kept as the copy. Three failures in two minutes and it switches to the copy by itself."}
          {s.trippedAt ? ` Stopped answering at ${when(s.trippedAt)}; asked again once a minute.` : ""}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Last good answer {when(s.lastOkAt)}
          {s.lastFailAt ? ` · last failure ${when(s.lastFailAt)} (${s.lastFailWhat})` : ""}
          {s.down ? ` · served from the copy ${s.servedCount}, not in the copy ${s.missedCount}` : ""}
        </p>
        {s.down && s.missedWhat.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">
            Not in the copy: {s.missedWhat.map((m) => `${m.what} ${m.n}`).join(" · ")}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["auto", "down", "up"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy || mode === m}
              onClick={() => act({ action: "mode", mode: m }, m === "auto" ? "Back to automatic." : m === "down" ? "REX set to down." : "REX set to up.")}
              className={`rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-60 ${mode === m ? "bg-accent-dark font-semibold text-white" : "border border-line/80"}`}
            >
              {m === "auto" ? "Automatic" : m === "down" ? "Force down" : "Force up"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {s.setting.setAt ? `Last changed by ${s.setting.setBy || "somebody"} on ${when(s.setting.setAt)}. ` : ""}
          Force up ignores the planned window and the detection. Put it back to Automatic once REX is settled.
        </p>
      </section>

      <section className="fade-up mt-3 rounded-[22px] border border-line/50 bg-white p-4">
        <span className="text-[13.5px]">Planned Window</span>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          Inside it the OS does not try REX at all. After it ends, the first good answer from REX switches screens back.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-muted">
            From
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 block rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] text-ink" />
          </label>
          <label className="text-[11px] text-muted">
            Until
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-0.5 block rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] text-ink" />
          </label>
          <button
            type="button"
            disabled={busy || !from || !until}
            onClick={() => act({ action: "mode", plannedFrom: new Date(from).toISOString(), plannedUntil: new Date(until).toISOString() }, "Planned window saved.")}
            className="rounded-lg border border-accent-dark/50 px-3 py-1.5 text-[12px] text-accent-dark disabled:opacity-40"
          >
            Save window
          </button>
          {s.setting.plannedFrom && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFrom("");
                setUntil("");
                void act({ action: "mode", plannedFrom: null, plannedUntil: null }, "Planned window cleared.");
              }}
              className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px]"
            >
              Clear
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {s.setting.plannedFrom ? `Saved: ${when(s.setting.plannedFrom)} to ${when(s.setting.plannedUntil)}.` : "No window saved."}
        </p>
      </section>

      <section className="fade-up mt-3 rounded-[22px] border border-line/50 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13.5px]">The Copy</span>
          {run?.running && <Pill tone="accent">taking it now</Pill>}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          Every screen staff opened in the last day and a half, asked again as that person, one at a time. Takes a while; screens carry on as normal.
        </p>
        {s.snapshot && (
          <p className="mt-1 text-[12px]">
            {s.snapshot.rows.toLocaleString("en-GB")} answers kept ({s.snapshot.mb} MB), newest {when(s.snapshot.newest)}.
          </p>
        )}
        {s.lastRun && (
          <p className="mt-1 text-[12px]">
            Last run started {when(s.lastRun.startedAt)}, finished {when(s.lastRun.finishedAt)}: {s.lastRun.steps} screens, {s.lastRun.kept} answers
            {s.lastRun.failed ? `, ${s.lastRun.failed} screens failed` : ""}
            {s.lastRun.note ? ` (${s.lastRun.note})` : ""}.
          </p>
        )}
        {run?.running && (
          <p className="mt-1 text-[12px] text-muted">
            {run.done} of {run.planned} asked{run.failed ? `, ${run.failed} failed` : ""}. Now: {run.current}
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            disabled={busy || run?.running || s.down}
            onClick={() => act({ action: "snapshot" }, "Taking the copy now. This page updates as it goes.")}
            className="rounded-lg bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            Take the copy now
          </button>
        </div>
      </section>

      <section className="fade-up mt-3 rounded-[22px] border border-line/50 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13.5px]">Morning Catch-up</span>
          {catchup?.running && <Pill tone="accent">sending</Pill>}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          Once REX is back and the waiting changes have gone: every phase of a file, in order, for anything made while REX was down that is still not in REX. Each record goes in with the agent&rsquo;s own REX sign-in, through the same step the screen uses, so it is never sent twice. The first refusal stops the run.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={checking} onClick={lookAgain} className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] disabled:opacity-40">
            {checking ? "Looking…" : check ? "Look again" : "Check what is missing"}
          </button>
          {check && (
            <button
              type="button"
              disabled={busy || s.down || catchup?.running || !check.phases.some((p) => p.items.length)}
              onClick={() => act({ action: "catchup", since: check.since }, "Catch-up started. This page shows each phase as it goes.")}
              className="rounded-lg bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              Send everything, in order
            </button>
          )}
        </div>
        {s.down && check && <p className="mt-2 text-[11px] text-muted">REX is still down, so nothing can be sent yet.</p>}
        {catchup && (catchup.running || catchup.results.length > 0) && (
          <ul className="mt-3 space-y-1 text-[12px]">
            {catchup.results.map((r) => (
              <li key={r.key}>
                {check?.phases.find((p) => p.key === r.key)?.label ?? r.key}: {r.sent} sent
                {r.skippedBecause ? ` - not run, ${r.skippedBecause}` : ""}
                {r.stopped ? ` - stopped at ${r.stopped.label}: ${r.stopped.error}` : ""}
                {r.stopped && r.stopped.id && !catchup.running && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: "catchup-skip", phase: r.key, id: r.stopped!.id }, `${r.stopped!.label} left out. Send again to carry on.`).then(lookAgain)}
                    className="ml-2 rounded-lg border border-line/80 px-2 py-0.5 text-[11px]"
                  >
                    Skip this one
                  </button>
                )}
              </li>
            ))}
            {catchup.running && <li className="text-muted">Now: {check?.phases.find((p) => p.key === catchup.phase)?.label ?? catchup.phase ?? "starting"}…</li>}
          </ul>
        )}
        {check && (
          <>
            <p className="mt-3 text-[11px] text-muted">Looking at everything since {when(check.since)} (half an hour before REX went).</p>
            <ul className="mt-2 space-y-1.5">
              {check.phases.map((p, i) => (
                <li key={p.key} className="rounded-xl border border-line/50 p-2.5 text-[12px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <button type="button" onClick={() => setOpenPhase(openPhase === p.key ? null : p.key)} className="text-left">
                      {i + 1}. {p.label}
                    </button>
                    <div className="flex items-center gap-2">
                      <Pill tone={p.items.length ? "accent" : "neutral"}>{p.error ? "could not look" : p.items.length ? `${p.items.length} to send` : "nothing missing"}</Pill>
                      {p.items.length > 0 && (
                        <button
                          type="button"
                          disabled={busy || s.down || catchup?.running}
                          onClick={() => act({ action: "catchup", phase: p.key, since: check.since }, `${p.label}: sending.`)}
                          className="rounded-lg border border-line/80 px-2.5 py-1 text-[11.5px] disabled:opacity-40"
                        >
                          Send this phase
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{p.error ?? p.what}</p>
                  {openPhase === p.key && p.items.length > 0 && (
                    <ul className="mt-1.5 space-y-1 border-t border-line/40 pt-1.5">
                      {p.items.slice(0, 50).map((it) => (
                        <li key={it.id} className="text-[11.5px]">
                          {it.href ? <a href={it.href} className="underline">{it.label}</a> : it.label}
                          <span className="text-muted"> · {it.detail}</span>
                        </li>
                      ))}
                      {p.items.length > 50 && <li className="text-[11px] text-muted">and {p.items.length - 50} more</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <span className="text-[12.5px] font-semibold">Redo by Hand</span>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                REX turned these away and the screen kept nothing to send again - a new listing, photos, publishing, an application. Open the file, do it again, then tick it off. Landlord terms are not here: DocuSeal never needed REX.
              </p>
              <ul className="mt-2 space-y-1.5">
                {check.hand.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line/50 p-2.5 text-[12px]">
                    <span>
                      {h.summary}
                      {h.recordId ? (h.href ? <a href={h.href} className="ml-1 underline">{h.recordKind} {h.recordId}</a> : <span className="text-muted"> · {h.recordKind} {h.recordId}</span>) : null}
                      <span className="text-muted"> · {h.who}, {when(h.at)}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act({ action: "hand-done", id: h.id }, "Ticked off.").then(lookAgain)}
                      className="rounded-lg border border-line/80 px-2.5 py-1 text-[11.5px]"
                    >
                      Done
                    </button>
                  </li>
                ))}
                {!check.hand.length && <li className="text-[12px] text-muted">Nothing to redo by hand.</li>}
              </ul>
            </div>
          </>
        )}
      </section>

      <section className="fade-up mt-3 rounded-[22px] border border-line/50 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13.5px]">Waiting for REX</span>
          <Pill tone={waiting.length ? "accent" : "neutral"}>{waiting.length}</Pill>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          Changes made while REX was down. Sent in order once it answers; the first refusal stops the run until you Try again or Skip it.
        </p>
        {waiting.length > 0 && (
          <button
            type="button"
            disabled={busy || s.down}
            onClick={() => act({ action: "replay" })}
            className="mt-3 rounded-lg bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            Send now
          </button>
        )}
        <ul className="mt-3 space-y-1.5">
          {[...waiting, ...done].map((r) => (
            <li key={r.id} className="rounded-xl border border-line/50 p-2.5 text-[12px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  #{r.id} {r.summary}
                  {r.recordKind ? <span className="text-muted"> · {r.recordKind} {r.recordId}</span> : null}
                </span>
                <Pill tone={r.state === "failed" ? "accent" : "neutral"}>{r.state.replace("_", " ")}</Pill>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                {r.actorName || "the office"}
                {r.asPerson ? " (as themselves)" : ""} · {when(r.queuedAt)}
                {r.sentAt ? ` · sent ${when(r.sentAt)}` : ""}
              </p>
              {r.error && <p className="mt-0.5 text-[11px]">{r.error}</p>}
              {r.state === "failed" && (
                <div className="mt-1.5 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => act({ action: "retry", id: r.id }, "Back in the queue.")} className="rounded-lg border border-line/80 px-2.5 py-1 text-[11.5px]">
                    Try again
                  </button>
                  <button type="button" disabled={busy} onClick={() => act({ action: "skip", id: r.id }, "Skipped.")} className="rounded-lg border border-line/80 px-2.5 py-1 text-[11.5px]">
                    Skip it
                  </button>
                </div>
              )}
            </li>
          ))}
          {!rows.length && <li className="text-[12px] text-muted">Nothing has waited yet.</li>}
        </ul>
      </section>
    </>
  );
}
