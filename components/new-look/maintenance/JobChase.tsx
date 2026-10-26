"use client";

import { useEffect, useState } from "react";
import FloatSheet, { FloatCard, FloatCardHead, FloatChoice, FloatFoot } from "@/components/new-look/FloatSheet";
import { CHASE_FINAL_DAYS, CHASE_FIRST_DAYS, CHASE_GRACE_HOURS, chaseBlock, chaseLive, type WorksChase } from "@/lib/works-chase-rules";
import type { Tile } from "@/components/maintenance/job-page";
import type { WorksEvent, WorksOrder } from "@/lib/works-orders";
import type { JobView } from "@/components/new-look/maintenance/JobPageNew";

/**
 * Chase the contractor, on the new-look job page (Sean McMahon, 26 Oct 2026:
 * "is there any way I can just touch a button and remind that contractor, in
 * a polite way?"). An action beside Set the Date, a line on the job
 * saying when the next reminder goes with a way to stop it, and the sheet:
 * send one now, or set up the reminder and the final reminder on dates.
 *
 * 48 hours after the final with no word, nothing is cancelled on its own
 * (James, on the call): the line turns into the question, place it
 * elsewhere or keep waiting. Server: POST /api/works-orders/<id>/chase.
 */

const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
const shortTime = (iso: string) =>
  `${short(iso)}, ${new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}`;

/** The chase on this job, if it is on this job's contractor. One that was on somebody else is history. */
export function chaseFor(o: WorksOrder): WorksChase | null {
  return o.chase && o.chase.contractorId === o.contractorId ? o.chase : null;
}

/** Where a running chase is, in a few words. */
function chaseWords(c: WorksChase): string {
  if (c.silentAt) return `No word ${CHASE_GRACE_HOURS} hours after the final reminder`;
  if (c.nextKind === "silent" && c.nextAt) return `Final reminder sent ${short(c.finalAt ?? c.nextAt)} · they have until ${shortTime(c.nextAt)}`;
  if (c.nextKind && c.nextAt) return `${c.nextKind === "final" ? "Final reminder" : "Reminder"} due ${short(c.nextAt)}`;
  if (c.remindedAt) return `Reminder sent ${short(c.remindedAt)} · nothing else set up`;
  return "Chasing";
}

/** The action row, under Scheduling beside Set the Date. */
export function chaseTile(o: WorksOrder, open: () => void): Tile {
  const c = chaseFor(o);
  const live = chaseLive(c);
  const blocked = chaseBlock(o);
  return {
    key: "chase",
    label: "Chase the Contractor",
    what: live ? chaseWords(c) : "A reminder now, or on dates you pick",
    icon: "clock",
    off: live ? undefined : blocked ?? undefined,
    run: open,
  };
}

type Saved = { order: WorksOrder; events: WorksEvent[] };

async function post(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Partial<Saved>> {
  const r = await fetch(`/api/works-orders/${encodeURIComponent(id)}/chase`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((x) => x.json())
    .catch(() => null);
  return r ?? { ok: false, error: "That didn't work. Try again in a minute." };
}

/**
 * The line on the job: what's next and Stop; 48 hours after the final, the
 * question; once taken off them, pick who does it instead.
 */
export function ChaseBar({ v, onOpen, onSaved }: { v: JobView; onOpen: () => void; onSaved: (s: Saved) => void }) {
  const { o } = v;
  const c = chaseFor(o);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /* Nothing running, and the works order went a few days ago with nothing
     back: say so, with the button, rather than wait for somebody to notice. */
  const sentAt = o.contractorConfirmedAt || o.contractorContactedAt;
  const quietDays = sentAt ? Math.floor((Date.now() - new Date(sentAt).getTime()) / 86_400_000) : 0;
  const released = !!c?.stoppedAt && /^taken off/i.test(c.stoppedWhy);
  if (!(c && !c.stoppedAt) && !released && !chaseBlock(o) && quietDays >= 3) {
    const been = !!o.scheduledAt;
    return (
      <div className="nl-jb-chase" role="status">
        <span className="nl-jb-chase-dot is-idle" aria-hidden />
        <p>
          <b>Nothing back from {o.contractorName || "the contractor"}</b>
          <span>{been ? `Booked for ${short(o.scheduledAt!)}, and nobody has said it's done.` : `The works order went ${quietDays} days ago and there's no date yet.`}</span>
        </p>
        <div className="nl-jb-chase-acts">
          <button type="button" className="nl-btn nl-btn--sm nl-btn--secondary" onClick={onOpen}>Chase them</button>
        </div>
      </div>
    );
  }
  if (!c) return null;
  const name = o.contractorName || c.contractorName || "The contractor";
  const run = async (action: string) => {
    setBusy(action);
    setErr(null);
    const r = await post(o.id, { action });
    setBusy(null);
    if (r.order && r.events) onSaved({ order: r.order, events: r.events });
    if (!r.ok) { setErr(r.error ?? "That didn't work."); return; }
    if (action === "release") v.pickContractor();
  };

  /* Taken off them: the job still names them until somebody else is picked. */
  if (c.stoppedAt && /^taken off/i.test(c.stoppedWhy) && v.open) {
    return (
      <div className="nl-jb-chase is-warn" role="status">
        <p><b>{name} has been told it&apos;s off.</b> Pick who does it instead.</p>
        <div className="nl-jb-chase-acts">
          <button type="button" className="nl-btn nl-btn--sm nl-btn--primary" onClick={v.pickContractor}>Pick a contractor</button>
        </div>
      </div>
    );
  }
  if (!chaseLive(c)) return null;

  if (c.silentAt) {
    return (
      <div className="nl-jb-chase is-warn" role="alert">
        <p>
          <b>No word from {name}.</b> It&apos;s been {CHASE_GRACE_HOURS} hours since the final reminder{c.finalAt ? ` on ${short(c.finalAt)}` : ""}. Nothing has been cancelled. Take it off them and place it elsewhere, or keep waiting.
        </p>
        <div className="nl-jb-chase-acts">
          <button type="button" className="nl-btn nl-btn--sm nl-btn--primary" disabled={!!busy} onClick={() => void run("release")}>
            {busy === "release" ? "Telling them…" : "Place it elsewhere"}
          </button>
          <button type="button" className="nl-btn nl-btn--sm nl-btn--secondary" disabled={!!busy} onClick={() => void run("keep_waiting")}>
            {busy === "keep_waiting" ? "Saving…" : "Keep waiting"}
          </button>
        </div>
        <p className="nl-jb-chase-small">Place it elsewhere emails {name} that the job is cancelled with them, then asks you who does it instead.</p>
        {err && <p className="nl-jb-said is-err" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="nl-jb-chase" role="status">
      <span className="nl-jb-chase-dot" aria-hidden />
      <p>
        <b>Chasing {name}</b>
        <span>{chaseWords(c)}{c.nextKind === "reminder" && c.finalDays ? `, then the final ${c.finalDays} day${c.finalDays === 1 ? "" : "s"} later` : ""}. Stops when they come back.</span>
      </p>
      <div className="nl-jb-chase-acts">
        <button type="button" className="nl-link" onClick={onOpen}>Change</button>
        <button type="button" className="nl-link" disabled={!!busy} onClick={() => void run("stop")}>{busy === "stop" ? "Stopping…" : "Stop chasing"}</button>
      </div>
      {err && <p className="nl-jb-said is-err" role="alert">{err}</p>}
    </div>
  );
}

/** Send one now, or set them up on dates. */
export function ChaseSheet({ v, onClose, onSaved }: { v: JobView; onClose: () => void; onSaved: (s: Saved) => void }) {
  const { o } = v;
  const c = chaseFor(o);
  const live = chaseLive(c) ? c : null;
  const blocked = live ? null : chaseBlock(o);
  const name = o.contractorName || "the contractor";
  const [first, setFirst] = useState(String(live?.firstDays ?? CHASE_FIRST_DAYS));
  const [final, setFinal] = useState(String(live?.finalDays ?? CHASE_FINAL_DAYS));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ kind: "reminder" | "final"; state: "loading" | "failed" | "ready"; subject?: string; html?: string; to?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!preview || preview.state !== "loading") return;
    let on = true;
    fetch(`/api/works-orders/${encodeURIComponent(o.id)}/chase?kind=${preview.kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (on) setPreview(j?.ok ? { kind: preview.kind, state: "ready", subject: j.subject, html: j.html, to: j.to } : { kind: preview.kind, state: "failed", error: j?.error ?? "The email could not be shown." }); })
      .catch(() => { if (on) setPreview({ kind: preview.kind, state: "failed", error: "The email could not be shown just now." }); });
    return () => { on = false; };
  }, [preview, o.id]);

  const run = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    setErr(null);
    setSaid(null);
    const r = await post(o.id, body);
    setBusy(null);
    if (r.order && r.events) onSaved({ order: r.order, events: r.events });
    if (!r.ok) { setErr(r.error ?? "That didn't work."); return; }
    /* Taken off them: straight on to who does it instead. */
    if (key === "release") { onClose(); v.pickContractor(); return; }
    setSaid(done);
  };
  const days = (s: string) => { const n = Math.round(Number(s)); return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null; };
  const firstN = days(first), finalN = days(final);
  const finalGone = !!live?.finalAt;

  if (preview) {
    return (
      <FloatSheet
        title={preview.kind === "final" ? "The Final Reminder" : "The Reminder"}
        lede={preview.state === "ready" ? `What ${name} gets${preview.to ? `, at ${preview.to}` : ""}, in your name.` : undefined}
        onBack={() => setPreview(null)}
        onClose={onClose}
        size="lg"
        screenKey={`preview-${preview.kind}`}
      >
        <FloatCard className="nl-jb-chase-mail">
          {preview.state === "loading" && <p className="nl-jb-said" role="status"><span className="nl-bo-spin" aria-hidden /> Writing it out…</p>}
          {preview.state === "failed" && <p className="nl-fs-err" role="alert">{preview.error}</p>}
          {preview.state === "ready" && (
            <>
              <p className="nl-jb-chase-subj"><span>Subject</span>{preview.subject}</p>
              <iframe title={preview.subject} srcDoc={preview.html} className="nl-jb-chase-frame" sandbox="" />
            </>
          )}
        </FloatCard>
        <FloatFoot>
          <button type="button" className="nl-btn nl-btn--secondary" onClick={() => setPreview(null)}>Back</button>
        </FloatFoot>
      </FloatSheet>
    );
  }

  return (
    <FloatSheet
      title="Chase the Contractor"
      lede={
        blocked
          ? `Nothing to chase just now: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}.`
          : `${name} hasn't come back on job #${o.ref}. Reminders go in your name, and stop by themselves the moment they give a date, mark it done, or send a certificate or invoice.`
      }
      onClose={onClose}
      dismissible={!busy}
      screenKey="chase"
    >
      {live && (
        <FloatCard>
          <FloatCardHead title="Now" aside={live.setBy ? `Set up by ${live.setBy}` : undefined} />
          {live.silentAt ? (
            <>
              <p className="nl-jb-chase-now">
                It&apos;s been {CHASE_GRACE_HOURS} hours since the final reminder{live.finalAt ? ` on ${short(live.finalAt)}` : ""} and nothing has come back. Nothing has been cancelled.
              </p>
              <div className="nl-fs-choices">
                <FloatChoice
                  title={busy === "release" ? "Telling them…" : "Place it elsewhere"}
                  text={`Emails ${name} that the job is cancelled with them, then you pick who does it instead.`}
                  disabled={!!busy}
                  onClick={() => void run("release", { action: "release" }, "")}
                />
                <FloatChoice
                  title={busy === "keep_waiting" ? "Saving…" : "Keep waiting"}
                  text="Leaves it with them and stops the chasing. Nothing is sent."
                  disabled={!!busy}
                  onClick={() => void run("keep_waiting", { action: "keep_waiting" }, `Left with ${name}. Nothing more goes to them.`)}
                />
              </div>
            </>
          ) : (
            <>
              <p className="nl-jb-chase-now">{chaseWords(live)}.</p>
              <button type="button" className="nl-link" disabled={!!busy} onClick={() => void run("stop", { action: "stop" }, "Stopped. Nothing more goes to them.")}>
                {busy === "stop" ? "Stopping…" : "Stop chasing"}
              </button>
            </>
          )}
        </FloatCard>
      )}

      {!blocked && (
        <>
          <FloatCard>
            <FloatCardHead title="Send a Reminder Now" />
            <div className="nl-fs-choices">
              <FloatChoice
                title={busy === "reminder" ? "Sending…" : "Send a reminder now"}
                text="Polite: when the works order went, and could they let us know a date."
                disabled={!!busy}
                onClick={() => void run("reminder", { action: "send", kind: "reminder" }, `Reminder sent to ${name}.`)}
              />
              <FloatChoice
                title={busy === "final" ? "Sending…" : "Send the final reminder"}
                text={`Unless they come back within ${CHASE_GRACE_HOURS} hours, it's cancelled with them, placed elsewhere and not paid.`}
                disabled={!!busy}
                onClick={() => void run("final", { action: "send", kind: "final" }, `Final reminder sent to ${name}. If nothing comes back in ${CHASE_GRACE_HOURS} hours, you'll be asked what to do.`)}
              />
            </div>
            <p className="nl-jb-chase-sees">
              <button type="button" className="nl-link" onClick={() => setPreview({ kind: "reminder", state: "loading" })}>See the reminder</button>
              <button type="button" className="nl-link" onClick={() => setPreview({ kind: "final", state: "loading" })}>See the final reminder</button>
            </p>
          </FloatCard>

          {!finalGone && (
            <FloatCard>
              <FloatCardHead title={live?.firstDays != null ? "Change the Reminders" : "Set up Reminders"} />
              <div className="nl-jb-chase-days">
                <label className="nl-jb-chase-day">
                  <span className="nl-fs-label">{live?.remindedAt ? "Reminder" : "First reminder after"}</span>
                  {live?.remindedAt ? (
                    <span className="nl-jb-chase-fixed">Sent {short(live.remindedAt)}</span>
                  ) : (
                    <span className="nl-jb-chase-in"><input className="nl-fs-input" inputMode="numeric" value={first} onChange={(e) => setFirst(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} aria-label="Days to the first reminder" /> days</span>
                  )}
                </label>
                <label className="nl-jb-chase-day">
                  <span className="nl-fs-label">Final reminder</span>
                  <span className="nl-jb-chase-in"><input className="nl-fs-input" inputMode="numeric" value={final} onChange={(e) => setFinal(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} aria-label="Days from the first reminder to the final" /> days after that</span>
                </label>
              </div>
              <p className="nl-fs-hint">Sent on weekdays between 8am and 6pm. {CHASE_GRACE_HOURS} hours after the final with no word, you&apos;re told here and in your notifications. Nothing is cancelled on its own.</p>
            </FloatCard>
          )}
        </>
      )}

      {err && <p className="nl-fs-say is-err" role="alert">{err}</p>}
      {said && !err && <p className="nl-fs-say" role="status">{said}</p>}

      <FloatFoot>
        <button type="button" className="nl-btn nl-btn--secondary" disabled={!!busy} onClick={onClose}>{said ? "Done" : "Close"}</button>
        {!blocked && !finalGone && (
          <button
            type="button"
            className="nl-btn nl-btn--primary"
            disabled={!!busy || (!live?.remindedAt && firstN == null) || finalN == null}
            onClick={() => void run("set", { action: "set", firstDays: firstN ?? CHASE_FIRST_DAYS, finalDays: finalN }, "Reminders set. The dates are on the job.")}
          >
            {busy === "set" ? "Saving…" : live?.firstDays != null ? "Save the dates" : "Set up reminders"}
          </button>
        )}
      </FloatFoot>
    </FloatSheet>
  );
}
