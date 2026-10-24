"use client";

import { Badge } from "@/components/new-look/Parts";
import { ErrorLine, Loading, Section, Spin, Tab, nd, when as at } from "@/components/new-look/admin/bits";

/**
 * Admin > System > REX status in the new look (24 Oct 2026).
 *
 * The same five parts as the old page - the state and the switch, the
 * planned window, the copy, the morning catch-up and the waiting changes -
 * on hairlines. Every button calls the page's own `act`, so the API calls and
 * guards are the old page's exactly. This tab is where REX's state is set;
 * Wiring now reads it from here (lib/wiring-truth) instead of from env vars.
 */

export type RexMode = "auto" | "down" | "up";
export type Status = {
  down: boolean;
  reason: "forced" | "planned" | "detected" | null;
  setting: { mode: RexMode; plannedFrom: string | null; plannedUntil: string | null; setBy: string; setAt: string | null };
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
export type Row = {
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
export type Item = { id: string; label: string; detail: string; at: string | null; href?: string };
export type PhaseCheck = { key: string; label: string; what: string; items: Item[]; error: string | null };
export type Hand = { id: string; what: string; summary: string; who: string; at: string; recordKind: string | null; recordId: string | null; href: string | null };
export type PhaseRun = { key: string; sent: number; stopped: { id: string; label: string; error: string } | null; skippedBecause?: string };
export type CatchupProgress = { running: boolean; by: string; startedAt: string | null; finishedAt: string | null; phase: string | null; results: PhaseRun[] };
export type Run = { running: boolean; planned: number; done: number; failed: number; current: string | null; lastError: string | null; deadline: string | null };

const when = (iso: string | null | undefined) => (iso ? at(iso, { weekday: "short" }) : "-");

const REASON: Record<string, string> = {
  forced: "you set it to down",
  planned: "it is inside the planned window",
  detected: "REX stopped answering",
};

const STATE_TONE: Record<Row["state"], "accent" | "neutral" | "good" | "warning"> = {
  waiting: "warning",
  failed: "accent",
  sent: "good",
  held: "neutral",
  skipped: "neutral",
};

export default function RexStatusNew(p: {
  s: Status | null;
  denied: boolean;
  rows: Row[];
  run: Run | null;
  busy: boolean;
  flash: string | null;
  from: string;
  until: string;
  setFrom: (v: string) => void;
  setUntil: (v: string) => void;
  check: { since: string; phases: PhaseCheck[]; hand: Hand[] } | null;
  checking: boolean;
  checkFailed: boolean;
  catchup: CatchupProgress | null;
  openPhase: string | null;
  setOpenPhase: (v: string | null) => void;
  act: (body: Record<string, unknown>, done?: string) => Promise<void>;
  lookAgain: () => void;
}) {
  const { s, denied, rows, run, busy, flash, from, until, setFrom, setUntil, check, checking, checkFailed, catchup, openPhase, setOpenPhase, act, lookAgain } = p;

  if (!s) {
    return <Tab>{denied ? <p className="nl-empty">Only an owner can see this, or REX status could not be read.</p> : <Loading what="Reading REX status…" />}</Tab>;
  }

  const mode = s.setting.mode;
  const waiting = rows.filter((r) => r.state === "waiting" || r.state === "failed");
  const done = rows.filter((r) => !(r.state === "waiting" || r.state === "failed")).slice(0, 40);
  const phaseLabel = (key: string | null) => check?.phases.find((x) => x.key === key)?.label ?? key ?? "starting";

  return (
    <Tab>
      {denied && <ErrorLine>The last refresh failed, so what shows may be out of date. This tab asks again every ten seconds.</ErrorLine>}
      {flash && (
        <p className="nl-adm-flash nl-adm-gapb" role="status">
          {nd(flash)}
        </p>
      )}

      <Section title="REX Right Now" aside={<Badge tone={s.down ? "accent" : "good"}>{s.down ? "Down: screens show the copy" : "Answering"}</Badge>}>
        <ul className="nl-adm-rows">
          <li>
            <div className="nl-adm-row-main">
              <p className="nl-meta">
                {s.down
                  ? `Down because ${REASON[s.reason ?? ""] ?? "REX status says so"}. Nothing is sent to REX; reads come from the copy and armed changes wait.`
                  : "Every read goes to REX and is kept as the copy. Three failures in two minutes and it switches to the copy by itself."}
                {s.trippedAt ? ` Stopped answering at ${when(s.trippedAt)}; asked again once a minute.` : ""}
              </p>
              <p className="nl-meta">
                Last good answer {when(s.lastOkAt)}
                {s.lastFailAt ? `. Last failure ${when(s.lastFailAt)} (${s.lastFailWhat})` : ""}
                {s.down ? `. Served from the copy ${s.servedCount}, not in the copy ${s.missedCount}` : ""}.
              </p>
              {s.down && s.missedWhat.length > 0 && <p className="nl-meta">Not in the copy: {s.missedWhat.map((m) => `${m.what} ${m.n}`).join(", ")}</p>}
              <p className="nl-meta">
                {s.setting.setAt ? `Last changed by ${s.setting.setBy || "somebody"}, ${when(s.setting.setAt)}. ` : ""}
                Force up ignores the planned window and the detection. Put it back to Automatic once REX is settled.
              </p>
            </div>
            <div className="nl-adm-row-side">
              <div role="radiogroup" aria-label="REX status" className="nl-toggle nl-adm-seg">
                {(["auto", "down", "up"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    disabled={busy || mode === m}
                    onClick={() => void act({ action: "mode", mode: m }, m === "auto" ? "Back to automatic." : m === "down" ? "REX set to down." : "REX set to up.")}
                    className={mode === m ? "is-on" : undefined}
                  >
                    {m === "auto" ? "Automatic" : m === "down" ? "Force Down" : "Force Up"}
                  </button>
                ))}
              </div>
            </div>
          </li>
        </ul>
      </Section>

      <Section title="Planned Window">
        <p className="nl-meta">Inside it the OS doesn&apos;t try REX at all. After it ends, the first good answer from REX switches screens back.</p>
        <div className="nl-adm-form">
          <label className="nl-field">
            <span>From</span>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="nl-field">
            <span>Until</span>
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || !from || !until}
            onClick={() => void act({ action: "mode", plannedFrom: new Date(from).toISOString(), plannedUntil: new Date(until).toISOString() }, "Planned window saved.")}
            className="nl-btn nl-btn--secondary"
          >
            Save Window
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
              className="nl-btn nl-btn--quiet"
            >
              Clear
            </button>
          )}
        </div>
        <p className="nl-meta nl-adm-after">{s.setting.plannedFrom ? `Saved: ${when(s.setting.plannedFrom)} to ${when(s.setting.plannedUntil)}.` : "No window saved."}</p>
      </Section>

      <Section title="The Copy" aside={run?.running && <Badge tone="warning">Taking it now</Badge>}>
        <p className="nl-meta">Every screen staff opened in the last day and a half, asked again as that person, one at a time. It takes a while; screens carry on as normal.</p>
        <ul className="nl-adm-rows">
          <li>
            <div className="nl-adm-row-main">
              <p className="nl-meta">
                {s.snapshot ? `${s.snapshot.rows.toLocaleString("en-GB")} answers kept (${s.snapshot.mb} MB), newest ${when(s.snapshot.newest)}.` : "No copy is kept yet."}
              </p>
              {s.lastRun && (
                <p className="nl-meta">
                  Last run started {when(s.lastRun.startedAt)}, finished {when(s.lastRun.finishedAt)}: {s.lastRun.steps} screens, {s.lastRun.kept} answers
                  {s.lastRun.failed ? `, ${s.lastRun.failed} screens failed` : ""}
                  {s.lastRun.note ? ` (${nd(s.lastRun.note)})` : ""}.
                </p>
              )}
              {run?.running && (
                <p className="nl-meta">
                  <Spin /> {run.done} of {run.planned} asked{run.failed ? `, ${run.failed} failed` : ""}. Now: {run.current}
                </p>
              )}
            </div>
            <div className="nl-adm-row-side">
              <button type="button" disabled={busy || run?.running || s.down} onClick={() => void act({ action: "snapshot" }, "Taking the copy now. This page updates as it goes.")} className="nl-btn nl-btn--primary nl-btn--sm">
                Take the Copy Now
              </button>
            </div>
          </li>
        </ul>
      </Section>

      <Section title="Morning Catch-up" aside={catchup?.running && <Badge tone="warning">Sending</Badge>}>
        <p className="nl-meta">
          Once REX is back and the waiting changes have gone: every phase of a file, in order, for anything made while REX was down that is still not in REX. Each record goes in with the agent&apos;s own REX sign-in, through the same step the screen uses, so it is never sent twice. The first refusal stops the run.
        </p>
        <div className="nl-adm-row-acts">
          <button type="button" disabled={checking} onClick={lookAgain} className="nl-btn nl-btn--secondary nl-btn--sm">
            {checking ? "Looking…" : check ? "Look Again" : "Check What Is Missing"}
          </button>
          {check && (
            <button
              type="button"
              disabled={busy || s.down || catchup?.running || !check.phases.some((x) => x.items.length)}
              onClick={() => void act({ action: "catchup", since: check.since }, "Catch-up started. This page shows each phase as it goes.")}
              className="nl-btn nl-btn--primary nl-btn--sm"
            >
              Send Everything, in Order
            </button>
          )}
        </div>
        {checkFailed && !checking && <ErrorLine onRetry={lookAgain}>What is missing could not be read.</ErrorLine>}
        {s.down && check && <p className="nl-meta nl-adm-after">REX is still down, so nothing can be sent yet.</p>}
        {catchup && (catchup.running || catchup.results.length > 0) && (
          <ul className="nl-adm-rows nl-adm-after">
            {catchup.results.map((r) => (
              <li key={r.key}>
                <div className="nl-adm-row-main">
                  <span className="nl-strong">{phaseLabel(r.key)}</span>
                  <p className="nl-meta">
                    {r.sent} sent
                    {r.skippedBecause ? `. Not run: ${r.skippedBecause}` : ""}
                    {r.stopped ? `. Stopped at ${r.stopped.label}: ${nd(r.stopped.error)}` : ""}
                  </p>
                </div>
                {r.stopped && r.stopped.id && !catchup.running && (
                  <div className="nl-adm-row-side">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act({ action: "catchup-skip", phase: r.key, id: r.stopped!.id }, `${r.stopped!.label} left out. Send again to carry on.`).then(lookAgain)}
                      className="nl-btn nl-btn--secondary nl-btn--sm"
                    >
                      Skip This One
                    </button>
                  </div>
                )}
              </li>
            ))}
            {catchup.running && (
              <li>
                <p className="nl-meta">
                  <Spin /> Now: {phaseLabel(catchup.phase)}…
                </p>
              </li>
            )}
          </ul>
        )}
        {check && (
          <>
            <p className="nl-meta nl-adm-after">Looking at everything since {when(check.since)} (half an hour before REX went).</p>
            <ul className="nl-adm-rows nl-adm-after">
              {check.phases.map((ph, i) => {
                const open = openPhase === ph.key;
                return (
                  <li key={ph.key}>
                    <div className="nl-adm-row-main">
                      <button type="button" className="nl-link" aria-expanded={open} disabled={!ph.items.length} onClick={() => setOpenPhase(open ? null : ph.key)}>
                        {i + 1}. {ph.label}
                      </button>
                      <p className="nl-meta">{nd(ph.error ?? ph.what)}</p>
                      {open && ph.items.length > 0 && (
                        <ul className="nl-lines nl-adm-after">
                          {ph.items.slice(0, 50).map((it) => (
                            <li key={it.id}>
                              <span>
                                {it.href ? (
                                  <a href={it.href} className="nl-link">
                                    {it.label}
                                  </a>
                                ) : (
                                  <span className="nl-strong">{it.label}</span>
                                )}
                                <span className="nl-meta"> {nd(it.detail)}</span>
                              </span>
                            </li>
                          ))}
                          {ph.items.length > 50 && (
                            <li>
                              <span className="nl-meta">and {ph.items.length - 50} more</span>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                    <div className="nl-adm-row-side">
                      <Badge tone={ph.error ? "accent" : ph.items.length ? "warning" : "good"}>{ph.error ? "Couldn't look" : ph.items.length ? `${ph.items.length} to send` : "Nothing missing"}</Badge>
                      {ph.items.length > 0 && (
                        <button type="button" disabled={busy || s.down || catchup?.running} onClick={() => void act({ action: "catchup", phase: ph.key, since: check.since }, `${ph.label}: sending.`)} className="nl-btn nl-btn--secondary nl-btn--sm">
                          Send This Phase
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <h3 className="nl-adm-sub">Redo by Hand</h3>
            <p className="nl-meta">REX turned these away and the screen kept nothing to send again: a new listing, photos, publishing, an application. Open the file, do it again, then tick it off. Landlord terms aren&apos;t here: DocuSeal never needed REX.</p>
            <ul className="nl-adm-rows nl-adm-after">
              {check.hand.map((h) => (
                <li key={h.id}>
                  <div className="nl-adm-row-main">
                    <span className="nl-strong">{nd(h.summary)}</span>
                    <p className="nl-meta">
                      {h.recordId &&
                        (h.href ? (
                          <>
                            <a href={h.href} className="nl-link">
                              {h.recordKind} {h.recordId}
                            </a>
                            {", "}
                          </>
                        ) : (
                          `${h.recordKind} ${h.recordId}, `
                        ))}
                      {h.who}, {when(h.at)}
                    </p>
                  </div>
                  <div className="nl-adm-row-side">
                    <button type="button" disabled={busy} onClick={() => void act({ action: "hand-done", id: h.id }, "Ticked off.").then(lookAgain)} className="nl-btn nl-btn--secondary nl-btn--sm">
                      Done
                    </button>
                  </div>
                </li>
              ))}
              {!check.hand.length && (
                <li>
                  <p className="nl-meta">Nothing to redo by hand.</p>
                </li>
              )}
            </ul>
          </>
        )}
      </Section>

      <Section title="Waiting for REX" aside={<Badge tone={waiting.length ? "warning" : "neutral"}>{`${waiting.length} waiting`}</Badge>}>
        <p className="nl-meta">Changes made while REX was down. Sent in order once it answers; the first refusal stops the run until you try again or skip it.</p>
        {waiting.length > 0 && (
          <div className="nl-adm-row-acts nl-adm-gapb">
            <button type="button" disabled={busy || s.down} onClick={() => void act({ action: "replay" })} className="nl-btn nl-btn--primary nl-btn--sm">
              Send Now
            </button>
          </div>
        )}
        <ul className="nl-adm-rows">
          {[...waiting, ...done].map((r) => (
            <li key={r.id}>
              <div className="nl-adm-row-main">
                <div className="nl-adm-row-line">
                  <span className="nl-mono">#{r.id}</span>
                  <span className="nl-strong">{nd(r.summary)}</span>
                </div>
                <p className="nl-meta">
                  {r.recordKind ? `${r.recordKind} ${r.recordId}. ` : ""}
                  {r.actorName || "The office"}
                  {r.asPerson ? " (as themselves)" : ""}, {when(r.queuedAt)}
                  {r.sentAt ? `. Sent ${when(r.sentAt)}` : ""}
                </p>
                {r.error && <p className="nl-meta">{nd(r.error)}</p>}
                {r.state === "failed" && (
                  <div className="nl-adm-row-acts">
                    <button type="button" disabled={busy} onClick={() => void act({ action: "retry", id: r.id }, "Back in the queue.")} className="nl-btn nl-btn--secondary nl-btn--sm">
                      Try Again
                    </button>
                    <button type="button" disabled={busy} onClick={() => void act({ action: "skip", id: r.id }, "Skipped.")} className="nl-btn nl-btn--quiet nl-btn--sm">
                      Skip It
                    </button>
                  </div>
                )}
              </div>
              <div className="nl-adm-row-side">
                <Badge tone={STATE_TONE[r.state]}>{r.state.charAt(0).toUpperCase() + r.state.slice(1)}</Badge>
              </div>
            </li>
          ))}
          {!rows.length && (
            <li>
              <p className="nl-meta">Nothing has waited yet.</p>
            </li>
          )}
        </ul>
      </Section>
    </Tab>
  );
}
