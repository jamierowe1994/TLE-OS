"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import {
  bodyFor,
  confirmBodyFor,
  confirmSubjectFor,
  icsFor,
  postBodyFor,
  postSubjectFor,
  subjectFor,
  type AppraisalInvite,
} from "@/lib/appraisal-email";
import EmailPopout from "@/components/EmailPopout";
import SendHandoff from "@/components/SendHandoff";
import { campaignsFor, CAMPAIGNS, lastDay, type Campaign } from "@/lib/campaigns";
import {
  APPRAISAL_STEPS,
  EMPTY_CASE,
  LOST_REASONS,
  NURTURE_REASONS,
  OUTCOMES,
  isOutcome,
  needsAttention,
  stageIndex,
  type AppraisalCase,
  type AppraisalDoc,
  type AppraisalOutcome,
  type AppraisalStage,
  type Touch,
} from "@/lib/appraisal";

/**
 * The appraisal, taking over the screen.
 *
 * Booking one turns a lead into a job of work, and a job of work squeezed
 * under the lead's own timeline was three grey buttons and a paragraph. So
 * while a record is at the appraisal step this REPLACES the process card and
 * the notes: the process still exists — it's named at the top — but the thing
 * in front of you is the only thing you can do anything about. Notes lose
 * nothing, because every note here goes to the contact log, which is the same
 * record read from the other end.
 *
 * It fits the screen exactly and never grows past it. Only the log scrolls,
 * inside its own column. A panel that pushes the page is a panel whose bottom
 * half nobody ever sees.
 *
 * The endings stay reachable from every stage. A landlord can say yes on the
 * doorstep, and a system that makes you walk through "post-appraisal" to
 * record that is a system people stop using.
 */

const money = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

/** Digits only — landlords say "1,300" and "£1300 pcm" and mean the same thing. */
const num = (v: string) => (v.trim() ? Number(v.replace(/\D/g, "")) || null : null);

const INPUT =
  "w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

/** The stage rail — named, because four dots never told anyone where they were. */
/**
 * The appointment itself, stated once at the top of whichever step you are on.
 *
 * Every action on these two steps is about a specific date and time, and an
 * agent should never have to remember which one while deciding whether to
 * schedule an email against it.
 */
function Appointment({ c }: { c: AppraisalCase }) {
  if (!c.bookedFor && !c.bookedAt) return null;
  const mins = c.bookedMinutes;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/70 bg-card px-4 py-3">
      <DoodleIcon name="calendar" size={16} className="text-accent-dark" />
      <p className="min-w-0 flex-1 text-[13px]">
        {c.bookedFor ?? "Booked"}
        {mins ? <span className="text-muted"> · {mins} minutes</span> : null}
      </p>
    </div>
  );
}

/**
 * One way forward, as a card rather than a button in a row.
 *
 * The old step showed its options as a line of small buttons under a
 * paragraph, which made three quite different decisions look like one toolbar.
 * Sending now, queueing for Thursday and skipping altogether deserve equal
 * width and a sentence each — the sentence is what stops the wrong one being
 * clicked out of habit.
 */
function Choice({
  icon,
  title,
  body,
  onClick,
  disabled,
  done,
  doneLabel,
  note,
  row,
}: {
  icon: string;
  title: string;
  body: string;
  onClick: () => void;
  disabled?: boolean;
  done?: boolean;
  doneLabel?: string;
  note?: string;
  /**
   * Landscape: icon, name and reason on ONE line, stacked under each other.
   *
   * For a set of ALTERNATIVES rather than a set of jobs. Three columns made
   * "send it", "queue it for Friday" and "don't" look like a toolbar of equal
   * small things to be scanned across; stacked rectangles read as a list you
   * come down and stop at, which is what choosing one of three actually is.
   */
  row?: boolean;
}) {
  const tone = done
    ? "border-emerald-600/40 bg-card"
    : disabled
      ? "cursor-not-allowed border-line/60 opacity-55"
      : "border-line/70 bg-card hover:border-ink/40";

  if (row) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3.5 text-left transition-colors ${tone}`}
      >
        <DoodleIcon
          name={icon}
          size={15}
          className={done ? "text-emerald-700" : "text-accent-dark"}
        />
        <span className="shrink-0 text-[12.5px] font-semibold">{title}</span>
        {/* min-w-0 on a flex child is what lets long copy wrap instead of
            stretching the card past the panel. */}
        <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">
          {note ?? body}
        </span>
        {done && doneLabel && (
          <span className="shrink-0 rounded-full border border-emerald-600/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {doneLabel}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-full flex-col rounded-2xl border p-4 text-left transition-colors ${tone}`}
    >
      <span className="flex w-full items-center gap-2">
        <DoodleIcon name={icon} size={15} className={done ? "text-emerald-700" : "text-accent-dark"} />
        <span className="text-[12.5px] font-semibold">{title}</span>
        {done && doneLabel && (
          <span className="ml-auto rounded-full border border-emerald-600/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {doneLabel}
          </span>
        )}
      </span>
      <span className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{note ?? body}</span>
    </button>
  );
}

function Rail({ state }: { state: AppraisalCase["state"] }) {
  const at = stageIndex(state);
  return (
    <ol className="flex min-w-0 flex-1 items-stretch gap-1">
      {APPRAISAL_STEPS.map((s, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <li key={s.id} className="min-w-0 flex-1">
            <div
              className={`h-1 rounded-full ${
                done ? "bg-accent-dark" : here ? "bg-accent" : "bg-line"
              }`}
            />
            <p
              className={`mt-1.5 truncate text-[10.5px] ${
                here ? "font-semibold text-ink" : done ? "text-accent-dark" : "text-muted"
              }`}
            >
              {s.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default function AppraisalTrack({
  value,
  onChange,
  who = "You",
  invite,
  landlordEmail,
  landlordContactId,
  recordId,
  outerStep,
  onWon,
  onShowProcess,
}: {
  value?: AppraisalCase;
  onChange: (c: AppraisalCase) => void;
  who?: string;
  /** Everything the confirmation needs to write itself. */
  invite?: AppraisalInvite;
  landlordEmail?: string | null;
  landlordContactId?: string | null;
  /** The lead this case belongs to — what an enrolment is filed against. */
  recordId?: string | null;
  /** Where this sits on the LEAD's own track, so taking the screen over never
   *  loses the wider answer to "where am I". */
  outerStep?: string;
  /** Won means the lead itself moves on to terms — the appraisal is over and
   *  the next thing is a contract, not another appraisal step. */
  onWon?: () => void;
  onShowProcess?: () => void;
}) {
  const c = value ?? EMPTY_CASE;
  const [deciding, setDeciding] = useState<AppraisalOutcome | null>(null);
  const [touchText, setTouchText] = useState("");
  /* Both emails open full size rather than living in the panel — see
     EmailPopout. Which one is open, if either. */
  const [composing, setComposing] = useState<null | "confirm" | "pre" | "post">(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  /** The pause while the landlord's page is built — see SendHandoff. */
  const [handingOver, setHandingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [touchKind, setTouchKind] = useState<Touch["kind"]>("call");
  /* The landlord's own pre-appraisal page, once minted. `missing` is what the
     agent's profile is short of — worth saying before it goes out, not after
     the landlord has seen a deck with no photograph on it. */
  const [deck, setDeck] = useState<{ url: string; missing: string[] } | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  const at = stageIndex(c.state);
  const step = isOutcome(c.state) ? null : APPRAISAL_STEPS[at];
  const flag = needsAttention(c);
  const outcome = isOutcome(c.state) ? OUTCOMES.find((o) => o.id === c.state)! : null;

  const patch = (p: Partial<AppraisalCase>) => onChange({ ...c, ...p });

  /**
   * Mint the landlord's pre-appraisal page, then open the email over it.
   *
   * Minted on the way to the email rather than on a separate button, because
   * a link that exists but wasn't pasted in is worse than no link: the agent
   * thinks it went and the landlord never sees it.
   *
   * It is deliberately NOT a blocker. If the deck can't be created — no
   * database, not signed in, REX unreachable for the headshot — the email
   * still opens and still sends, just without the page. The confirmation is
   * the thing that stops no-shows; the deck is the thing that impresses.
   */
  async function openPre() {
    if (!invite) return;
    if (deck) return setComposing("pre");
    setMinting(true);
    setHandingOver(true);
    setDeckError(null);
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ref: recordId ?? "",
          recipientName: invite.landlordName,
          address: invite.address,
          whenPretty: invite.whenPretty,
          startsAt: invite.startsAt,
          minutes: invite.minutes,
        }),
      });
      const j = await res.json();
      if (j.ok) setDeck({ url: j.url, missing: j.missing ?? [] });
      else setDeckError(j.error ?? "Couldn't build the landlord's page.");
    } catch {
      setDeckError("Couldn't build the landlord's page.");
    } finally {
      /* The composer is opened by the handover, not from here. The build is
         usually quicker than the beat, and a box that appears while the words
         are still travelling is the jolt this was built to remove. */
      setMinting(false);
    }
  }

  /**
   * Two days before the visit, at 9am.
   *
   * Counted BACK from the appointment rather than forward from today, because
   * the point of the email is its distance from the visit. Never in the past:
   * a visit booked for tomorrow gets it in an hour's time instead, which is
   * still better than a queue entry that has already missed.
   */
  const scheduleFor = (() => {
    if (!c.bookedAt) return null;
    const visit = new Date(c.bookedAt);
    if (Number.isNaN(visit.valueOf())) return null;
    const when = new Date(visit);
    when.setDate(when.getDate() - 2);
    when.setHours(9, 0, 0, 0);
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    return (when < soon ? soon : when).toISOString();
  })();

  const scheduleWords = scheduleFor
    ? new Date(scheduleFor).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  async function schedulePre() {
    if (!invite || !scheduleFor) return;
    setScheduling(true);
    setScheduleMsg(null);
    try {
      /* The deck is minted NOW even though the email goes later. Building it
         at send time would mean a queue entry that can fail hours after
         anybody is watching — and a pre-appraisal without its page is the
         one thing this email is for. */
      let url: string | null = deck?.url ?? null;
      if (!url) {
        const made = await fetch("/api/presentations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ref: recordId ?? "",
            recipientName: invite.landlordName,
            address: invite.address,
            whenPretty: invite.whenPretty,
            startsAt: invite.startsAt,
            minutes: invite.minutes,
          }),
        }).then((r) => r.json());
        if (made.ok) {
          url = made.url;
          setDeck({ url: made.url, missing: made.missing ?? [] });
        }
      }

      const res = await fetch("/api/scheduled-sends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "pre-appraisal",
          ref: recordId ?? "",
          to: landlordEmail ?? "",
          contactId: landlordContactId ?? null,
          sendAt: scheduleFor,
          subject: subjectFor(invite),
          text: bodyFor({ ...invite, presentationUrl: url }),
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        setScheduleMsg(j.error ?? "Couldn't queue it.");
        return;
      }
      patch({ preScheduledFor: scheduleFor, preScheduleId: String(j.id), state: "visit" });
    } catch {
      setScheduleMsg("Couldn't queue it.");
    } finally {
      setScheduling(false);
    }
  }

  async function cancelSchedule() {
    if (c.preScheduleId) {
      await fetch(`/api/scheduled-sends?id=${encodeURIComponent(c.preScheduleId)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    patch({ preScheduledFor: null, preScheduleId: null, state: "pre" });
  }

  function advance() {
    const next = APPRAISAL_STEPS[at + 1];
    const now = new Date().toISOString();
    if (c.state === "pre") {
      patch({ state: next.id as AppraisalStage, confirmationSentAt: now });
      return;
    }
    if (!next) return;
    patch({ state: next.id as AppraisalStage });
  }

  function decide(
    id: AppraisalOutcome,
    reason: string,
    notes: string,
    when: string | null,
    campaignId: string | null
  ) {
    /* The enrolment is a row of its own, so the campaign can be asked who is
       on it. Fire and forget: a landlord is marked lost whether or not the
       marketing table is reachable, and the case keeps the id either way. */
    if (campaignId && recordId) {
      fetch("/api/enrolments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, recordId, name: who, email: landlordEmail ?? "", reason }),
      }).catch(() => {});
    }
    onChange({
      ...c,
      state: id,
      outcomeReason: reason || null,
      outcomeNotes: notes,
      campaignId,
      nextActionAt: id === "nurture" ? when : null,
      decidedAt: new Date().toISOString(),
    });
    setDeciding(null);
    // Instructed means the lead has left the appraisal behind.
    if (id === "won") onWon?.();
  }

  function addTouch() {
    const what = touchText.trim();
    if (!what) return;
    patch({
      touches: [
        { id: `t${Date.now()}`, at: new Date().toISOString(), kind: touchKind, who, what },
        ...c.touches,
      ],
    });
    setTouchText("");
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", "document");
      form.append("ref", recordId ?? "appraisal");
      const res = await fetch("/api/r2/upload", { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "That didn't upload.");
      const doc: AppraisalDoc = {
        id: `d${Date.now()}`,
        name: file.name,
        url: j.url ?? j.key ?? "",
        at: new Date().toISOString(),
      };
      patch({ docs: [doc, ...c.docs] });
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "That didn't upload.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel">
      {/* ── Where you are: on the lead's track, and within the appraisal ── */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {outerStep ? `${outerStep} · the appraisal` : "The appraisal"}
          </p>
          <h3 className="mt-0.5 text-[17px] leading-tight">
            {outcome ? outcome.label : (step?.title ?? "The appraisal")}
          </h3>
        </div>
        <div className="flex min-w-[240px] flex-1 items-end gap-4">
          <Rail state={c.state} />
          {!outcome && (
            <span className="shrink-0 pb-4 text-[10.5px] text-muted">
              Step {at + 1} of {APPRAISAL_STEPS.length}
            </span>
          )}
        </div>
        {onShowProcess && (
          <button
            type="button"
            onClick={onShowProcess}
            className="shrink-0 pb-4 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Show the whole process
          </button>
        )}
      </div>

      {flag && (
        <p className="border-b border-line/60 bg-accent-soft/50 px-5 py-2 text-[11.5px] text-accent-dark">
          {flag}
        </p>
      )}

      {/* ── The two halves: what to do now, and what's on the record ── */}
      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.35fr_1fr]">
        {/* LEFT — the job in front of you */}
        <div className="flex min-h-0 flex-col overflow-hidden border-line/60 p-5 lg:border-r">
          {deciding ? (
            <Decide
              outcome={deciding}
              onCancel={() => setDeciding(null)}
              onConfirm={(reason, notes, when, campaignId) =>
                decide(deciding, reason, notes, when, campaignId)
              }
            />
          ) : outcome ? (
            <Ended
              c={c}
              outcome={outcome}
              onReopen={() => {
                if (c.campaignId && recordId) {
                  fetch("/api/enrolments", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      campaignId: c.campaignId,
                      recordId,
                      stop: true,
                      stopReason: "Case reopened",
                    }),
                  }).catch(() => {});
                }
                patch({ state: "post", decidedAt: null, campaignId: null });
              }}
            />
          ) : (
            <>
              <p className="max-w-prose text-[12.5px] leading-relaxed text-muted">{step?.detail}</p>

              {/* ── BOOKED: the appointment, in writing and in their diary.
                  Both of these used to live inside the booker, which sent them
                  before the record had a chance to say whether they'd gone —
                  so the case looked confirmed when nothing had left. ── */}
              {c.state === "booked" && (
                <div className="mt-4 space-y-3">
                  <Appointment c={c} />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Choice
                      icon="mail"
                      title="Send the confirmation"
                      body="Short, and in writing while the call is still warm. The detail has its own email nearer the time."
                      done={Boolean(c.confirmationSentAt)}
                      doneLabel="Sent"
                      onClick={() => invite && setComposing("confirm")}
                      disabled={!invite}
                    />
                    <Choice
                      icon="calendar"
                      title="Calendar invite"
                      body="An .ics for their diary. Sent WITH the confirmation, not with the pre-appraisal — an invite that lands two days before the visit has missed most of its job."
                      done={Boolean(c.inviteSavedAt)}
                      doneLabel="Saved"
                      onClick={() => {
                        if (!invite) return;
                        const ics = icsFor(invite);
                        if (!ics) return;
                        const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "market-appraisal.ics";
                        a.click();
                        URL.revokeObjectURL(url);
                        patch({ inviteSavedAt: new Date().toISOString() });
                      }}
                      disabled={!invite?.startsAt}
                      note={!invite?.startsAt ? "No start time on the booking, so there's nothing to put in a calendar." : undefined}
                    />
                  </div>
                </div>
              )}

              {/* ── PRE: three ways out, because the right one depends on how
                  far away the visit is. Sending it the same day as the
                  confirmation is two emails in an hour and one of them gets
                  skimmed. ── */}
              {c.state === "pre" && (
                <div className="mt-4 space-y-3">
                  <Appointment c={c} />
                  {c.preScheduledFor ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-600/40 bg-card p-4">
                      <DoodleIcon name="clock" size={16} className="text-emerald-700" />
                      <p className="min-w-0 flex-1 text-[12.5px]">
                        Queued for{" "}
                        <span className="font-semibold">
                          {new Date(c.preScheduledFor).toLocaleDateString("en-GB", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                        <span className="block text-[11.5px] text-muted">
                          It goes on its own. Nothing else to do here.
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={cancelSchedule}
                        className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                      >
                        Cancel it
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <Choice
                        icon="mail"
                        row
                        title="Send it now"
                        body="Opens it full size first. Best when the visit is a day or two away."
                        onClick={() => void openPre()}
                        disabled={!invite || minting}
                      />
                      <Choice
                        icon="clock"
                        row
                        title={scheduleFor ? `Schedule for ${scheduleWords}` : "Schedule it"}
                        body="Sent on its own, two days out — when it's useful rather than convenient."
                        onClick={schedulePre}
                        disabled={!invite || !scheduleFor || scheduling}
                        note={
                          !scheduleFor
                            ? "No start time on the booking, so there's no date to count back from."
                            : undefined
                        }
                      />
                      <Choice
                        icon="cross"
                        row
                        title="Skip it"
                        body="They've had the confirmation. Moves straight on to the visit."
                        onClick={advance}
                      />
                    </div>
                  )}
                  {scheduleMsg && (
                    <p className="text-[11.5px] leading-relaxed text-accent-dark">{scheduleMsg}</p>
                  )}
                </div>
              )}

              {/* The visit: the one moment someone is standing in the
                  property. Everything the lead record never knew gets filled
                  in here, and post-appraisal reads it back rather than asking
                  twice. */}
              {c.state === "visit" && (
                <div className="mt-3 grid min-h-0 flex-1 grid-rows-[auto_auto_1fr] gap-3 overflow-y-auto pr-1">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="They want (pcm)">
                      <input
                        inputMode="numeric"
                        value={c.askingRent ?? ""}
                        onChange={(e) => patch({ askingRent: num(e.target.value) })}
                        placeholder="1,300"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Beds">
                      <input
                        inputMode="numeric"
                        value={c.bedrooms ?? ""}
                        onChange={(e) => patch({ bedrooms: num(e.target.value) })}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Baths">
                      <input
                        inputMode="numeric"
                        value={c.bathrooms ?? ""}
                        onChange={(e) => patch({ bathrooms: num(e.target.value) })}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Receptions">
                      <input
                        inputMode="numeric"
                        value={c.receptions ?? ""}
                        onChange={(e) => patch({ receptions: num(e.target.value) })}
                        className={INPUT}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Available from">
                      <input
                        type="date"
                        value={c.availableFrom ?? ""}
                        onChange={(e) => patch({ availableFrom: e.target.value || null })}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Tenant situation">
                      <input
                        value={c.tenantSituation}
                        onChange={(e) => patch({ tenantSituation: e.target.value })}
                        placeholder="Vacant · tenanted until March · notice served"
                        className={INPUT}
                      />
                    </Field>
                  </div>

                  <div className="grid min-h-0 gap-3 lg:grid-cols-2">
                    <Field label="How it went, and what it needs">
                      <textarea
                        value={c.condition}
                        onChange={(e) => patch({ condition: e.target.value })}
                        placeholder="Condition, works needed, what they said on the day…"
                        className={`${INPUT} min-h-[110px] resize-none leading-relaxed`}
                      />
                    </Field>
                    <Field label="Anything you took with you">
                      <div className="rounded-xl border border-dashed border-line/80 p-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line/80 px-3 py-1.5 text-[11.5px]">
                          {uploading ? "Uploading…" : "Add a document"}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) upload(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {uploadMsg && (
                          <p className="mt-2 text-[11px] text-accent-dark">{uploadMsg}</p>
                        )}
                        <ul className="mt-2 space-y-1">
                          {c.docs.map((d) => (
                            <li key={d.id} className="flex items-center gap-2 text-[11.5px]">
                              <DoodleIcon name="doc" size={12} className="text-muted" />
                              <span className="min-w-0 flex-1 truncate">{d.name}</span>
                              <button
                                type="button"
                                aria-label="Remove"
                                onClick={() => patch({ docs: c.docs.filter((x) => x.id !== d.id) })}
                                className="text-muted hover:text-ink"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                          {!c.docs.length && (
                            <li className="text-[11px] text-muted">
                              EPC, gas certificate, floor plan — whatever they handed over.
                            </li>
                          )}
                        </ul>
                      </div>
                    </Field>
                  </div>
                </div>
              )}

              {/* The write-up. Everything from the visit is already here —
                  asking nobody to type the same number twice is most of what
                  makes a process get used. */}
              {c.state === "post" && (
                <div className="mt-3 grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 overflow-y-auto pr-1">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Valued at (pcm)">
                      <input
                        inputMode="numeric"
                        value={c.valuation ?? ""}
                        onChange={(e) => patch({ valuation: num(e.target.value) })}
                        placeholder="1,250"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="They want (pcm)">
                      <input
                        inputMode="numeric"
                        value={c.askingRent ?? ""}
                        onChange={(e) => patch({ askingRent: num(e.target.value) })}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Fee quoted (%)">
                      <input
                        inputMode="decimal"
                        value={c.feePercent ?? ""}
                        onChange={(e) =>
                          patch({
                            feePercent: e.target.value
                              ? Number(e.target.value.replace(/[^\d.]/g, ""))
                              : null,
                          })
                        }
                        placeholder="10"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Follow up on">
                      <input
                        type="date"
                        value={c.nextActionAt?.slice(0, 10) ?? ""}
                        onChange={(e) => patch({ nextActionAt: e.target.value || null })}
                        className={INPUT}
                      />
                    </Field>
                  </div>
                  <Field label="What was said">
                    <textarea
                      value={c.summary || c.condition}
                      onChange={(e) => patch({ summary: e.target.value })}
                      placeholder="What they're weighing up, who else they're seeing, when they want to be on the market…"
                      className={`${INPUT} min-h-[120px] resize-none leading-relaxed`}
                    />
                  </Field>
                </div>
              )}

              {/* The one button that moves it on. On the two email steps it
                  opens the email full size first — nobody should send
                  something they haven't read. */}
              {/* Booked and Pre carry their own choices above — a second
                  "Send the pre-appraisal" underneath three cards, one of which
                  already says that, is how the wrong one gets pressed. */}
              {step && c.state !== "booked" && c.state !== "pre" && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (c.state === "post" && invite) return setComposing("post");
                      advance();
                    }}
                    className="rounded-full bg-ink px-5 py-2.5 text-[12.5px] text-page disabled:opacity-60"
                  >
                    {c.state === "post" ? "Send the follow-up" : step.cta}
                  </button>
                  {c.state === "post" && (
                    <button
                      type="button"
                      onClick={advance}
                      className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Skip it — move on
                    </button>
                  )}
                </div>
              )}

              {/* Booked has one way past it that isn't an email: they already
                  know, because you told them. Kept small and separate from the
                  two cards, which are the expected route. */}
              {c.state === "booked" && (
                <button
                  type="button"
                  onClick={advance}
                  className="mt-3 self-start text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  They&rsquo;ve already got it — move on
                </button>
              )}
            </>
          )}
        </div>

        {/* RIGHT — the record, and everything anyone has done about it */}
        <div className="flex min-h-0 flex-col overflow-hidden p-5">
          {(c.valuation != null || c.feePercent != null || c.bookedFor) && (
            <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-muted">
              {c.bookedFor && (
                <span>
                  Booked <span className="text-ink">{c.bookedFor}</span>
                </span>
              )}
              {c.valuation != null && (
                <span>
                  Valued <span className="text-ink">{money(c.valuation)} pcm</span>
                </span>
              )}
              {c.feePercent != null && (
                <span>
                  Fee <span className="text-ink">{c.feePercent}%</span>
                </span>
              )}
            </dl>
          )}

          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h4 className="text-[12px] font-semibold">Contact log</h4>
            <span className="text-[10.5px] text-muted">
              {c.touches.length} {c.touches.length === 1 ? "touch" : "touches"} · notes go here too
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={touchKind}
              onChange={(e) => setTouchKind(e.target.value as Touch["kind"])}
              className="rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12px] outline-none focus:border-ink"
            >
              {(["call", "email", "text", "visit", "note"] as const).map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
            <input
              value={touchText}
              onChange={(e) => setTouchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTouch()}
              placeholder="Rang, no answer — left a voicemail"
              className="min-w-[160px] flex-1 rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
            />
            <button
              type="button"
              onClick={addTouch}
              className="rounded-full border border-line/80 px-3.5 py-2 text-[12px]"
            >
              Log it
            </button>
          </div>

          {/* The only thing that scrolls, and it scrolls inside itself. */}
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {c.touches.map((t) => (
              <li key={t.id} className="flex gap-3 text-[12px]">
                <span className="w-[74px] shrink-0 text-muted">{t.at.slice(0, 10)}</span>
                <span className="w-[48px] shrink-0 text-muted">{t.kind}</span>
                <span className="min-w-0 flex-1">{t.what}</span>
              </li>
            ))}
            {!c.touches.length && (
              <li className="text-[11.5px] leading-relaxed text-muted">
                Nothing logged yet. Every call, email and note about this appraisal belongs
                here — it&apos;s what a win-back is built from if it doesn&apos;t come off.
              </li>
            )}
          </ul>
        </div>
      </div>

      <SendHandoff
        open={handingOver}
        ready={!minting}
        headline="Building their page…"
        sub={
          invite
            ? `${invite.landlordName.split(" ")[0]}'s own pre-appraisal page — who's coming, what happens on the day, and the appointment. Then the email, ready to read.`
            : undefined
        }
        onDone={() => {
          setHandingOver(false);
          setComposing("pre");
        }}
      />

      {composing && invite && (
        <EmailPopout
          title={
            composing === "confirm"
              ? "Confirming the appointment"
              : composing === "pre"
                ? "Before the visit"
                : "After the visit"
          }
          to={landlordEmail}
          contactId={landlordContactId}
          subject={
            composing === "confirm"
              ? confirmSubjectFor(invite)
              : composing === "pre"
                ? subjectFor(invite)
                : postSubjectFor(invite)
          }
          body={
            composing === "confirm"
              ? confirmBodyFor(invite)
              : composing === "pre"
              ? bodyFor({ ...invite, presentationUrl: deck?.url ?? null })
              : postBodyFor(invite, {
                  valuation: c.valuation,
                  askingRent: c.askingRent,
                  feePercent: c.feePercent,
                  availableFrom: c.availableFrom,
                  summary: c.summary || c.condition,
                })
          }
          attachments={c.docs}
          extra={
            composing === "pre" ? (
              <>
                {/* Nobody should send a page they haven't looked at — and
                    this one has their own face on it. */}
                {deck && (
                  <a
                    href={deck.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-line/80 px-4 py-2.5 text-[12px]"
                  >
                    Preview their page
                  </a>
                )}
              <button
                type="button"
                onClick={() => {
                  const ics = icsFor(invite);
                  if (!ics) return;
                  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "market-appraisal.ics";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-full border border-line/80 px-4 py-2.5 text-[12px]"
              >
                Calendar invite
              </button>
                {/* Said before it goes, not after. A deck introducing an
                    agent by monogram is fine; an agent who didn't know it
                    would is not. */}
                {deck && deck.missing.length > 0 && (
                  <span className="text-[11px] text-muted">
                    Your profile has no {deck.missing.join(" and no ")} — add it in your profile and
                    the next one will carry it.
                  </span>
                )}
                {deckError && <span className="text-[11px] text-accent-dark">{deckError}</span>}
              </>
            ) : undefined
          }
          onClose={() => setComposing(null)}
          onSent={() => {
            // The confirmation moves it on; the follow-up doesn't — after the
            // visit the next move is theirs, and the case waits on the answer.
            /* The CONFIRMATION is what moves booked → pre. The pre-appraisal
               moves pre → visit. They were one step and one flag before, which
               is why the case could say "confirmed" having sent neither. */
            if (composing === "confirm") {
              patch({ confirmationSentAt: new Date().toISOString(), state: "pre" });
            }
            if (composing === "pre") patch({ state: "visit" });
          }}
        />
      )}

      {/* ── The shortcut. The route above is the way through; this is for the
          landlord who answers on the doorstep. ── */}
      {!outcome && !deciding && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-5 py-3">
          <span className="text-[11px] text-muted">Answered already?</span>
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.detail}
              onClick={() => setDeciding(o.id)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                o.id === "won"
                  ? "border-accent-dark bg-accent-soft/40 hover:bg-accent-soft/70"
                  : "border-line/80 hover:border-ink/40"
              }`}
            >
              <DoodleIcon name={o.icon} size={13} className="text-muted" />
              {o.id === "won" ? "They're instructing — go to terms" : o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** How it ended, and the way back if it ended by accident. */
function Ended({
  c,
  outcome,
  onReopen,
}: {
  c: AppraisalCase;
  outcome: (typeof OUTCOMES)[number];
  onReopen: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="text-[13px] font-semibold">
        {outcome.label}
        {c.outcomeReason ? ` — ${c.outcomeReason}` : ""}
      </p>
      <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">{outcome.detail}</p>
      {c.outcomeNotes && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl border border-line/70 bg-card px-4 py-3 text-[12px] leading-relaxed">
          {c.outcomeNotes}
        </p>
      )}
      {c.campaignId && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-soft/60 px-3 py-1 text-[11.5px] text-accent-dark">
          <DoodleIcon name="mail" size={12} />
          On {CAMPAIGNS.find((x) => x.id === c.campaignId)?.name ?? "a campaign"}
        </p>
      )}
      {c.nextActionAt && (
        <p className="mt-2 text-[11.5px] text-muted">
          Back to them <span className="text-ink">{c.nextActionAt.slice(0, 10)}</span>
        </p>
      )}
      <button
        type="button"
        onClick={onReopen}
        className="mt-4 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px]"
      >
        Reopen
      </button>
    </div>
  );
}

/** The little form that turns a button into a recorded decision. */
function Decide({
  outcome,
  onCancel,
  onConfirm,
}: {
  outcome: AppraisalOutcome;
  onCancel: () => void;
  onConfirm: (reason: string, notes: string, when: string | null, campaignId: string | null) => void;
}) {
  const reasons = outcome === "lost" ? LOST_REASONS : outcome === "nurture" ? NURTURE_REASONS : [];
  const [reason, setReason] = useState<string>(reasons[0] ?? "");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState("");
  /* Every campaign there is, not just the ones in code: one marketing wrote
     this morning has to be offered this afternoon. Seeded from code so the
     list is never momentarily empty, and so it works with no database. */
  const [all, setAll] = useState<Campaign[]>(CAMPAIGNS);
  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((j) => Array.isArray(j.campaigns) && j.campaigns.length && setAll(j.campaigns))
      .catch(() => {});
  }, []);
  /* The campaigns marketing wrote for THIS reason. The agent picks; they
     never author one, and the list narrows as soon as a reason is chosen. */
  const offered = outcome === "won" ? [] : campaignsFor(outcome, reason, all);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-4">
      <p className="text-[12.5px] font-semibold">
        {outcome === "won"
          ? "They're instructing"
          : outcome === "nurture"
            ? "Keep it warm"
            : "Mark it lost"}
      </p>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        {!!reasons.length && (
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              Reason
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
            >
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}
        {outcome === "nurture" && (
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              Come back on
            </span>
            <input
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
            />
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            Anything worth knowing
          </span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              outcome === "lost"
                ? "Which agent, what fee they quoted — this is what a win-back is built on"
                : "What would change their mind, and when"
            }
            className="w-full resize-y rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
          />
        </label>
      </div>
      {!!offered.length && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            Put them on a campaign
          </p>
          <div className="space-y-1.5">
            {offered.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setCampaignId(campaignId === k.id ? null : k.id)}
                className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  campaignId === k.id
                    ? "border-accent-dark bg-accent-soft/50"
                    : "border-line/80 hover:border-ink/30"
                }`}
              >
                <span className="block text-[12px] font-semibold">{k.name}</span>
                <span className="block text-[11px] leading-snug text-muted">
                  {k.aim} · {k.steps.length} steps over {lastDay(k)} days
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            Optional — leave it if they want nothing from us.
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(reason, notes, when || null, campaignId)}
          className="rounded-full bg-ink px-4 py-2 text-[12.5px] text-page"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
