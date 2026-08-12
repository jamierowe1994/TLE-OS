"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { bodyFor, icsFor, subjectFor, type AppraisalInvite } from "@/lib/appraisal-email";
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

/** The stage rail — named, because four dots never told anyone where they were. */
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
  /* The confirmation, opened on the pre-appraisal step. The body is editable
     because no template survives contact with a real landlord. */
  const [draft, setDraft] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [touchKind, setTouchKind] = useState<Touch["kind"]>("call");

  const at = stageIndex(c.state);
  const step = isOutcome(c.state) ? null : APPRAISAL_STEPS[at];
  const flag = needsAttention(c);
  const outcome = isOutcome(c.state) ? OUTCOMES.find((o) => o.id === c.state)! : null;

  const patch = (p: Partial<AppraisalCase>) => onChange({ ...c, ...p });

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

  const emailStage = c.state === "pre" && !!invite;
  const body = draft ?? (invite ? bodyFor(invite) : "");

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

              {/* The confirmation, full height — it's the whole job at this
                  step, and a ten-line box in a corner was unreadable. */}
              {emailStage && invite && (
                <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-line/70 bg-card">
                  <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line/60 px-4 py-2.5">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                      To
                    </span>
                    <span className="text-[12px]">{landlordEmail || "no email on file"}</span>
                  </div>
                  <div className="border-b border-line/60 px-4 py-2.5 text-[13px] font-semibold">
                    {subjectFor(invite)}
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 text-[12.5px] leading-relaxed outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-4 py-3">
                    <button
                      type="button"
                      disabled={sending || !landlordEmail}
                      onClick={async () => {
                        setSending(true);
                        setSendMsg(null);
                        try {
                          const res = await fetch("/api/appraisal-email", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              to: landlordEmail,
                              contactId: landlordContactId,
                              subject: subjectFor(invite),
                              text: body,
                            }),
                          });
                          const j = await res.json();
                          if (!res.ok) throw new Error(j.error ?? "Send failed.");
                          setSendMsg("Sent — it's on their REX timeline too.");
                          patch({ confirmationSentAt: new Date().toISOString(), state: "visit" });
                        } catch (e) {
                          setSendMsg(e instanceof Error ? e.message : "Send failed.");
                        } finally {
                          setSending(false);
                        }
                      }}
                      className="rounded-full bg-ink px-4 py-2 text-[12.5px] text-page disabled:opacity-50"
                    >
                      {sending ? "Sending…" : "Send the confirmation"}
                    </button>
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
                      className="rounded-full border border-line/80 px-3.5 py-2 text-[12px]"
                    >
                      Calendar invite
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(body)}
                      className="rounded-full border border-line/80 px-3.5 py-2 text-[12px]"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={advance}
                      className="ml-auto text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Already sent — move on
                    </button>
                  </div>
                  {sendMsg && (
                    <p className="border-t border-line/60 bg-accent-soft/50 px-4 py-2 text-[11.5px] text-accent-dark">
                      {sendMsg}
                    </p>
                  )}
                </div>
              )}

              {/* The write-up. Same idea: at this step it IS the work. */}
              {c.state === "post" && (
                <div className="mt-3 flex min-h-0 flex-1 flex-col">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                        Valued at (pcm)
                      </span>
                      <input
                        inputMode="numeric"
                        value={c.valuation ?? ""}
                        onChange={(e) =>
                          patch({
                            valuation: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null,
                          })
                        }
                        placeholder="1,250"
                        className="w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                        Fee quoted (%)
                      </span>
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
                        className="w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                        Follow up on
                      </span>
                      <input
                        type="date"
                        value={c.nextActionAt?.slice(0, 10) ?? ""}
                        onChange={(e) => patch({ nextActionAt: e.target.value || null })}
                        className="w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                      />
                    </label>
                  </div>
                  <textarea
                    value={c.summary}
                    onChange={(e) => patch({ summary: e.target.value })}
                    placeholder="What they're weighing up, who else they're seeing, when they want to be on the market…"
                    className="mt-3 min-h-0 w-full flex-1 resize-none rounded-2xl border border-line/70 bg-card px-4 py-3 text-[12.5px] leading-relaxed outline-none focus:border-ink"
                  />
                </div>
              )}

              {/* Every other step: one button, and nothing to fill in. */}
              {!emailStage && c.state !== "post" && step && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={advance}
                    className="rounded-full bg-ink px-5 py-2.5 text-[12.5px] text-page"
                  >
                    {step.cta}
                  </button>
                </div>
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
