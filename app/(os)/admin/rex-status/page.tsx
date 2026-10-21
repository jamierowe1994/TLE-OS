"use client";

import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(() => {
    fetch("/api/admin/rex-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { status: Status; queue: Row[]; run: Run }) => {
        setS(j.status);
        setRows(j.queue);
        setRun(j.run);
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
                <Pill tone={r.state === "failed" ? "accent" : "neutral"}>{r.state}</Pill>
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
