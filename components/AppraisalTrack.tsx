"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import {
  bodyFor,
  icsFor,
  postBodyFor,
  postSubjectFor,
  subjectFor,
  type AppraisalInvite,
} from "@/lib/appraisal-email";
import EmailPopout from "@/components/EmailPopout";
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
  const [composing, setComposing] = useState<null | "pre" | "post">(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
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
              {step && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (c.state === "pre" && invite) return setComposing("pre");
                      if (c.state === "post" && invite) return setComposing("post");
                      advance();
                    }}
                    className="rounded-full bg-ink px-5 py-2.5 text-[12.5px] text-page"
                  >
                    {c.state === "pre"
                      ? "Send the pre-appraisal"
                      : c.state === "post"
                        ? "Send the follow-up"
                        : step.cta}
                  </button>
                  {(c.state === "pre" || c.state === "post") && (
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

      {composing && invite && (
        <EmailPopout
          title={composing === "pre" ? "Before the visit" : "After the visit"}
          to={landlordEmail}
          contactId={landlordContactId}
          subject={composing === "pre" ? subjectFor(invite) : postSubjectFor(invite)}
          body={
            composing === "pre"
              ? bodyFor(invite)
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
            ) : undefined
          }
          onClose={() => setComposing(null)}
          onSent={() => {
            // The confirmation moves it on; the follow-up doesn't — after the
            // visit the next move is theirs, and the case waits on the answer.
            if (composing === "pre") {
              patch({ confirmationSentAt: new Date().toISOString(), state: "visit" });
            }
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
