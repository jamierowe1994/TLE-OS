"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import {
  NURTURE_REASONS,
  TENANT_NURTURE_REASONS,
  LOST_REASONS,
  TENANT_LOST_REASONS,
  OUTCOMES,
  TOUCH_KINDS,
  type TouchKind,
  type TouchOutcome,
} from "@/lib/lead-spine";

/**
 * Writing down what just happened with a lead.
 *
 * Two shapes, one sheet. "Log an attempt" is what it was (call, text,
 * visit, email) and how it went, with a line if there is one to add - it is
 * meant to take five seconds with the phone still in the other hand. "Add to
 * nurture" is a reason and a button, because the point of the branch is that
 * a lead going quiet gets written down rather than forgotten.
 *
 * It posts to /api/leads/[id]/touches and hands back the fresh log, so the
 * spine on the drawer re-reads itself from what was saved, not from what
 * the screen assumed.
 */

export type LogMode = "attempt" | "nurture" | "lost";

/** The quick picks for a follow-up day (Howard, 1 Oct 2026: landlords "can take months"). */
const FOLLOW_UPS = [
  { label: "In 2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
];

/** A day this many days on, as YYYY-MM-DD on the agent's own calendar. A
 *  quick pick that lands on a weekend moves on to the Monday - nobody rings a
 *  landlord back on a Saturday because the maths said so. */
function dayAhead(days: number, weekday = false): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (weekday) while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LogTouch({
  leadId,
  leadName,
  leadFacts,
  mode,
  initialKind = "call",
  onClose,
  onLogged,
  onBook,
  inline = false,
  tried,
  askBooked = true,
  audience = "landlord",
}: {
  leadId: string;
  leadName: string;
  /** For the campaign enrolment nurture makes: where the emails go. */
  leadFacts?: { name: string; email: string; contactId: string | null };
  mode: LogMode;
  initialKind?: TouchKind;
  onClose: () => void;
  onLogged: (result: unknown) => void;
  /** They said yes on the call: log it, then straight into booking the appraisal. */
  onBook?: () => void;
  /** Drawn inside the Next up card rather than as a pop-out (James, 11 Sep
   *  2026: "in the box rather than a pop-out"): no overlay, the four ways of
   *  reaching them are the first thing shown, and the buttons are brown. */
  inline?: boolean;
  /** For "Send to nurture": what has already been tried, so the sheet can
   *  ask before it lets go (James, 11 Sep 2026: "Are you sure? Have you
   *  tried X, Y and Z?"). */
  tried?: { label: string; done: boolean }[];
  /** A tenant is not booking a valuation: skip that frame. */
  askBooked?: boolean;
  /** Whose nurture: a tenant gets its own reasons and is never put on a
   *  landlord campaign (Howard, 24 Sep 2026). */
  audience?: "landlord" | "tenant";
}) {
  const reasons =
    mode === "lost"
      ? audience === "tenant" ? TENANT_LOST_REASONS : LOST_REASONS
      : audience === "tenant" ? TENANT_NURTURE_REASONS : NURTURE_REASONS;
  const [kind, setKind] = useState<TouchKind>(initialKind);
  const [outcome, setOutcome] = useState<TouchOutcome | null>(null);
  const [body, setBody] = useState("");
  /* Lost is never pre-chosen: the reason is the whole point of the record. */
  const [reason, setReason] = useState(mode === "lost" ? "" : reasons[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Banked for later (Howard, 1 Oct 2026): the day to get back in touch, as
     YYYY-MM-DD, or "" for no date. The lead leaves the working boxes until
     then and comes back on the morning of it, as a task too. */
  const [followUp, setFollowUp] = useState("");
  const [pickingDay, setPickingDay] = useState(false);
  /* The attempt walks through frames (James, 11 Sep 2026): how you reached
     them, how it went, whether they booked, then anything to remember. */
  const [frame, setFrame] = useState<1 | 2 | 3 | 4>(1);
  const [booked, setBooked] = useState<boolean | null>(null);
  const engaged = outcome === "spoke" || outcome === "replied";
  const offered = TOUCH_KINDS.filter((k) => k.id !== "visit");

  const outcomes = OUTCOMES.filter((o) => o.for.includes(kind));
  useEffect(() => {
    /* Changing the kind changes what "how did it go" can mean. */
    setOutcome((cur) => (cur && outcomes.some((o) => o.id === cur) ? cur : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, inline]);

  /* Inline, the card's own colour is the chocolate brown; the pop-out keeps the OS red. */
  const primary = inline ? "bg-brown text-white" : "bg-accent-dark text-page";
  const chosen = inline ? "border-brown bg-brown/10" : "border-accent-dark bg-accent-soft/40";
  const kindIcon = inline ? "bg-brown text-white" : "bg-accent-soft text-accent-dark";

  const canSave = mode === "attempt" ? Boolean(outcome) : Boolean(reason);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/touches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "nurture"
            ? { kind: "nurture", reason, body, lead: leadFacts, side: audience, followUpOn: followUp || null }
            : mode === "lost"
              ? { kind: "lost", reason, body, side: audience }
              : { kind, outcome, body: booked ? `Booked the valuation.${body ? ` ${body}` : ""}` : body }
        ),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(j?.error ?? "That didn't save.");
        setBusy(false);
        return;
      }
      onLogged(j);
      if (booked && onBook) onBook();
    } catch {
      setError("That didn't save - the connection dropped.");
      setBusy(false);
    }
  }

  const first = leadName.split(" ")[0] || "them";

  /* Inline, the card grows and shrinks with the frame rather than jumping:
     the wrapper is given the new height to ease to (James, 11 Sep 2026:
     "growing outwards... butter smooth"). */
  const inner = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!inline || !inner.current) return;
    const el = inner.current;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    setH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [inline]);

  const body_ = (
      <div key={frame} className={inline ? "frame-grow" : undefined}>
        {mode === "attempt" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className={inline ? "text-[14px] font-semibold" : "hand text-[20px]"}>
                {frame === 1 ? (inline ? `Did you call, text, WhatsApp or email ${first}?` : `How did you reach ${first}?`) : frame === 2 ? "How did it go?" : frame === 3 ? "Did they book the valuation?" : "Anything worth remembering?"}
              </h2>
              <span className="flex items-center gap-1" aria-hidden>
                {(askBooked ? [1, 2, 3, 4] : [1, 2, 4]).map((n) => (
                  <span key={n} className={`h-1.5 rounded-full transition-all ${n === frame ? `w-4 ${inline ? "bg-brown" : "bg-accent-dark"}` : n < frame ? `w-1.5 ${inline ? "bg-brown/50" : "bg-accent-dark/50"}` : "w-1.5 bg-line"}`} />
                ))}
              </span>
            </div>
            {frame === 1 && (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {offered.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => { setKind(k.id); setOutcome(null); setBooked(null); setFrame(2); }}
                    className={`flex items-center gap-3 rounded-2xl border border-line/70 bg-card text-left transition-colors hover:border-ink/40 ${inline ? "px-3 py-2.5" : "px-4 py-3.5"}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${kindIcon}`}>
                      <DoodleIcon name={k.icon} size={14} />
                    </span>
                    <span className="text-[13.5px] font-semibold">{k.label}</span>
                  </button>
                ))}
              </div>
            )}
            {frame === 2 && (
              <div className="mt-4 grid gap-2.5">
                {outcomes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setOutcome(o.id);
                      const engages = o.id === "spoke" || o.id === "replied";
                      if (!engages) setBooked(null);
                      setFrame(engages && askBooked ? 3 : 4);
                    }}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-[13.5px] font-semibold transition-colors hover:border-ink/40 ${outcome === o.id ? chosen : "border-line/70 bg-card"}`}
                  >
                    {o.label}
                    <span aria-hidden className="text-muted">›</span>
                  </button>
                ))}
              </div>
            )}
            {frame === 3 && (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => { setBooked(true); setFrame(4); }} className={`rounded-2xl border px-4 py-4 text-[13.5px] font-semibold transition-colors hover:border-ink/40 ${booked === true ? chosen : "border-line/70 bg-card"}`}>
                  Yes, booked
                  <span className="mt-1 block text-[11.5px] font-normal text-muted">Log it, then pick the slot</span>
                </button>
                <button type="button" onClick={() => { setBooked(false); setFrame(4); }} className={`rounded-2xl border px-4 py-4 text-[13.5px] font-semibold transition-colors hover:border-ink/40 ${booked === false ? chosen : "border-line/70 bg-card"}`}>
                  Not yet
                  <span className="mt-1 block text-[11.5px] font-normal text-muted">They are thinking about it</span>
                </button>
              </div>
            )}
            {frame === 4 && (
              <>
                <p className="mt-1 text-[12.5px] text-muted">
                  {TOUCH_KINDS.find((k) => k.id === kind)?.label} · {outcomes.find((o) => o.id === outcome)?.label}
                  {booked === true ? " · booked the valuation" : booked === false ? " · not booked yet" : ""}
                </p>
                <textarea
                  autoFocus
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What they said, when to try again…"
                  rows={3}
                  className="mt-4 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
                />
              </>
            )}
          </>
        ) : (
          <>
            <h2 className="hand text-[20px]">{mode === "lost" ? `Mark ${first} as lost?` : tried ? `Send ${first} to nurture?` : "Add to nurture"}</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              {mode === "lost"
                ? `${first} comes off your working list and shows as Lost, with the reason. Nothing is sent to them. Bring them back from the lead at any time.`
                : audience === "tenant"
                ? `${first} stays on your list as in nurture, and comes straight back the moment they answer or reply. No emails go to tenants from nurture yet.`
                : `${first} is not saying no and not answering. The reason picks the campaign that keeps them warm, and they come straight back on the spine the moment they reply.`}
            </p>
            {tried && mode === "nurture" && (
              <div className="mt-4 rounded-2xl border border-line/70 bg-card p-3.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Have you tried</p>
                <ul className="mt-2 space-y-1.5">
                  {tried.map((t) => (
                    <li key={t.label} className="flex items-center gap-2.5 text-[12.5px]">
                      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] ${t.done ? "bg-sage text-white" : "border border-line text-muted"}`}>{t.done ? "✓" : "–"}</span>
                      <span className={t.done ? "" : "text-muted"}>{t.label}</span>
                      <span className="ml-auto text-[11px] text-muted">{t.done ? "yes" : "not yet"}</span>
                    </li>
                  ))}
                </ul>
                {tried.some((t) => !t.done) && (
                  <p className="mt-2.5 text-[11.5px] text-muted">{audience === "tenant" ? "A call or a message you have not tried yet is still worth one go first." : "Nurture keeps them warm by email. A call or a message you have not tried yet is still worth one go first."}</p>
                )}
              </div>
            )}
            <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Why</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                    reason === r
                      ? "border-ink bg-ink font-semibold text-page"
                      : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {mode === "nurture" && (
              <>
                <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Get back in touch</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {FOLLOW_UPS.map((f) => {
                    const day = dayAhead(f.days, true);
                    const on = followUp === day && !pickingDay;
                    return (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() => {
                          setPickingDay(false);
                          setFollowUp(on ? "" : day);
                        }}
                        className={`rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                          on ? "border-ink bg-ink font-semibold text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPickingDay((p) => !p)}
                    className={`rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                      pickingDay ? "border-ink bg-ink font-semibold text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                    }`}
                  >
                    Pick a day
                  </button>
                  {pickingDay && (
                    <input
                      type="date"
                      value={followUp}
                      min={dayAhead(1)}
                      max={dayAhead(730)}
                      onChange={(e) => setFollowUp(e.target.value)}
                      className="rounded-full border border-line/80 bg-transparent px-3 py-1.5 text-[12px] outline-none focus:border-ink"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  {followUp
                    ? `${first} leaves your working list and comes back to the top of it on ${new Date(`${followUp}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}, with a task on the lead to get in touch.`
                    : "Optional. Pick a day and they come back to the top of your Leads list that morning."}
                </p>
              </>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={mode === "lost" ? "Anything worth knowing - who they went with, what would win them back…" : "Anything else - when to try again, what they are waiting on…"}
              rows={2}
              className="mt-4 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
            />
          </>
        )}

        {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}

        <div className={`flex items-center justify-end gap-3 ${inline && frame === 1 ? "hidden" : "mt-5"}`}>
          <button
            type="button"
            onClick={mode === "attempt" && frame > 1 ? () => setFrame((f) => (f === 4 && (!engaged || !askBooked) ? 2 : (f - 1) as 1 | 2 | 3)) : onClose}
            className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
          >
            {mode === "attempt" && frame > 1 ? "← Back" : "Cancel"}
          </button>
          {(mode !== "attempt" || frame === 4) && (
          <PressButton
            onClick={save}
            disabled={!canSave || busy}
            className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-semibold ${
              canSave && !busy ? primary : "cursor-not-allowed bg-line/40 text-muted"
            }`}
          >
            <DoodleIcon name={mode === "lost" ? "cross" : mode === "nurture" ? "clock" : "checklist"} size={14} />
            {busy ? "Saving…" : mode === "lost" ? "Mark as lost" : mode === "nurture" ? (tried ? "Yes, send to nurture" : "Add to nurture") : booked ? "Log it and book" : "Log it"}
          </PressButton>
          )}
        </div>
      </div>
  );

  if (inline)
    return (
      <div className="overflow-hidden transition-[height] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]" style={h != null ? { height: h } : undefined}>
        <div ref={inner}>{body_}</div>
      </div>
    );
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative w-full max-w-md rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">{body_}</div>
    </div>
  );
}
