"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
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
 * The appraisal, opened up.
 *
 * It sits INSIDE the landlord track rather than replacing it: the lead's own
 * five dots stay where they are, and this is what the appraisal dot contains.
 * Two rails one above the other would read as two pipelines, so this one is
 * deliberately quieter — smaller dots, no numbers, indented under its parent.
 *
 * The endings are always reachable. A landlord can say no on the doorstep, and
 * a system that makes you walk through "post-appraisal" to record that is a
 * system people stop using.
 */

const money = (n: number | null) =>
  n == null ? "—" : `£${n.toLocaleString("en-GB")}`;

function Rail({ state }: { state: AppraisalCase["state"] }) {
  const at = stageIndex(state);
  return (
    <div className="flex items-center gap-1.5">
      {APPRAISAL_STEPS.map((s, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <span key={s.id} className="flex items-center gap-1.5">
            <span
              title={s.title}
              className={`h-2 w-2 rounded-full ${
                done ? "bg-accent-dark" : here ? "bg-accent ring-4 ring-accent-soft" : "bg-line"
              }`}
            />
            {i < APPRAISAL_STEPS.length - 1 && (
              <span className={`h-px w-6 ${done ? "bg-accent-dark/50" : "bg-line"}`} />
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function AppraisalTrack({
  value,
  onChange,
  who = "You",
}: {
  value?: AppraisalCase;
  onChange: (c: AppraisalCase) => void;
  who?: string;
}) {
  const c = value ?? EMPTY_CASE;
  const [deciding, setDeciding] = useState<AppraisalOutcome | null>(null);
  const [touchText, setTouchText] = useState("");
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

  function decide(id: AppraisalOutcome, reason: string, notes: string, when: string | null) {
    onChange({
      ...c,
      state: id,
      outcomeReason: reason || null,
      outcomeNotes: notes,
      nextActionAt: id === "nurture" ? when : null,
      decidedAt: new Date().toISOString(),
    });
    setDeciding(null);
  }

  function addTouch() {
    const what = touchText.trim();
    if (!what) return;
    const t: Touch = {
      id: `t${Date.now()}`,
      at: new Date().toISOString(),
      kind: touchKind,
      who,
      what,
    };
    patch({ touches: [t, ...c.touches] });
    setTouchText("");
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <DoodleIcon name="home" size={17} className="text-accent-dark" />
          <h3 className="text-[14px]">The appraisal</h3>
        </div>
        <div className="flex items-center gap-3">
          <Rail state={c.state} />
          {outcome && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">
              {outcome.label}
            </span>
          )}
        </div>
      </div>

      {flag && (
        <p className="mb-4 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">
          {flag}
        </p>
      )}

      {/* ── Where it is, and the one thing that moves it ── */}
      {step && (
        <div className="mb-4">
          <p className="text-[13px] font-semibold">{step.title}</p>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted">{step.detail}</p>

          {c.state === "post" ? (
            <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Valued at (pcm)
                </span>
                <input
                  inputMode="numeric"
                  value={c.valuation ?? ""}
                  onChange={(e) =>
                    patch({ valuation: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })
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
                    patch({ feePercent: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, "")) : null })
                  }
                  placeholder="10"
                  className="w-full rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  What was said
                </span>
                <textarea
                  rows={3}
                  value={c.summary}
                  onChange={(e) => patch({ summary: e.target.value })}
                  placeholder="What they're weighing up, who else they're seeing, when they want to be on the market…"
                  className="w-full resize-y rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-ink"
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
          ) : null}

          {at < APPRAISAL_STEPS.length - 1 && (
            <button
              type="button"
              onClick={advance}
              className="mt-3 rounded-full bg-ink px-4 py-2 text-[12.5px] text-page"
            >
              {step.cta}
            </button>
          )}
        </div>
      )}

      {/* ── How it ended ── */}
      {outcome && (
        <div className="mb-4 rounded-xl border border-line/60 p-4">
          <p className="text-[13px] font-semibold">
            {outcome.label}
            {c.outcomeReason ? ` — ${c.outcomeReason}` : ""}
          </p>
          {c.outcomeNotes && (
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
              {c.outcomeNotes}
            </p>
          )}
          <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-muted">
            {c.valuation != null && (
              <span>
                Valued at <span className="text-ink">{money(c.valuation)} pcm</span>
              </span>
            )}
            {c.nextActionAt && (
              <span>
                Back to them <span className="text-ink">{c.nextActionAt.slice(0, 10)}</span>
              </span>
            )}
          </dl>
          <button
            type="button"
            onClick={() => patch({ state: "post", decidedAt: null })}
            className="mt-3 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px]"
          >
            Reopen
          </button>
        </div>
      )}

      {/* ── The endings, always available ── */}
      {!outcome && (
        <div className="mb-4 flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.detail}
              onClick={() => setDeciding(o.id)}
              className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40"
            >
              <DoodleIcon name={o.icon} size={13} className="text-muted" />
              {o.label}
            </button>
          ))}
        </div>
      )}

      {deciding && (
        <Decide
          outcome={deciding}
          onCancel={() => setDeciding(null)}
          onConfirm={(reason, notes, when) => decide(deciding, reason, notes, when)}
        />
      )}

      {/* ── Everything anyone has done about it ── */}
      <div className="border-t border-line/60 pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h4 className="text-[12px] font-semibold">Contact log</h4>
          <span className="text-[10.5px] text-muted">
            {c.touches.length} {c.touches.length === 1 ? "touch" : "touches"}
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
            className="min-w-[200px] flex-1 rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={addTouch}
            className="rounded-full border border-line/80 px-3.5 py-2 text-[12px]"
          >
            Log it
          </button>
        </div>
        {c.touches.length > 0 && (
          <ul className="mt-3 space-y-2">
            {c.touches.slice(0, 6).map((t) => (
              <li key={t.id} className="flex gap-3 text-[12px]">
                <span className="w-[74px] shrink-0 text-muted">{t.at.slice(0, 10)}</span>
                <span className="w-[52px] shrink-0 text-muted">{t.kind}</span>
                <span className="min-w-0 flex-1">{t.what}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
  onConfirm: (reason: string, notes: string, when: string | null) => void;
}) {
  const reasons = outcome === "lost" ? LOST_REASONS : outcome === "nurture" ? NURTURE_REASONS : [];
  const [reason, setReason] = useState<string>(reasons[0] ?? "");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState("");

  return (
    <div className="mb-4 rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-4">
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
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(reason, notes, when || null)}
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
