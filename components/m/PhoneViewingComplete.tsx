"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { feedbackLabel, type Appt, type ViewingFeedback } from "@/lib/diary";
import { waAppLink } from "@/lib/whatsapp-link";

/**
 * VIEWING COMPLETE, IN ONE TAP (Dan Richards, agents' call, 20 Oct 2026).
 *
 * On the /m appointment screen, once a viewing's start time has come: one
 * press marks it done, then the agent can go straight on to how it landed and
 * the offer link, or leave both for later.
 *
 * Every save goes the way the desk's viewing drawer saves (/api/viewings/
 * feedback, os_viewing_feedback, one row per viewing, the latest wins), so the
 * viewing leaves Feedback Due everywhere and the desk shows the same words.
 * The OS only, like the desk: nothing new is written to REX.
 *
 *   Viewing Complete   - saved as attended, "Viewing complete".
 *   How Did It Land?   - Howard's four questions and "are they offering?",
 *                        saved over it in the desk's own format.
 *   They Didn't Turn Up - the desk's No-show, asked once first because it
 *                        starts the "shall we rebook?" email.
 *   Send the offer link - the same send as the app's (/api/listings/
 *                        application-form, kind "offer"), asked once first.
 */

/* Howard's four questions, word for word and in his order, as the desk's
   viewing drawer and the tenant's own feedback page ask them
   (components/ViewingDrawer HOWARD_QUESTIONS). */
const QUESTIONS = [
  { key: "liked", q: "What did you like most about the property?" },
  { key: "info", q: "Is there anything you’d like more information on?" },
  { key: "concerns", q: "Are there any concerns or points you’d like to discuss?" },
  { key: "compare", q: "How does it compare to other properties you’ve seen?" },
] as const;

/* The desk's labels, word for word: the desk reads them back to know an offer
   is coming (components/ViewingDrawer FEEDBACK_OPTIONS). What the phone shows
   is its own wording. */
const OFFERING = [
  { choice: "loved", label: "Loved it — offer expected", says: "Loved It - Offer Expected", offer: true },
  { choice: "offer", label: "Offer received", says: "Offer Received", offer: true },
  { choice: "thinking", label: "Thinking about it", says: "Thinking About It", offer: false },
  { choice: "notforthem", label: "Not for them", says: "Not for Them", offer: false },
];

/** Marked done, with nothing said yet about how it went. */
const DONE = { choice: "done", label: "Viewing complete" };

/** The desk's words, with any long dash the agent never typed made a plain one. */
const plain = (s: string) => s.replace(/\s*[—–]\s*/g, " - ");

const nowHm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function PhoneViewingComplete({
  appt,
  email,
  phone,
  diaryKey,
}: {
  appt: Appt;
  email: string;
  phone: string;
  /** The phone's held copy of the diary, so a reopened screen shows the answer. */
  diaryKey: string;
}) {
  const [feedback, setFeedback] = useState<ViewingFeedback | null | undefined>(appt.feedback);
  /** How it landed, open on the screen. */
  const [landing, setLanding] = useState(false);
  const [askNoShow, setAskNoShow] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"done" | "landed" | "noshow" | null>(null);
  const [saveSaid, setSaveSaid] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string | null; onMarket: boolean } | null>(null);
  const [askOffer, setAskOffer] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);
  const listingId = appt.listingId ?? null;
  const first = (appt.who || "").trim().split(/\s+/)[0] || "them";
  const address = appt.where || "the home";
  const isViewing = appt.kind === "viewing";
  /* From the moment it starts: the agent is often still in the home before
     the end time, and that is when they want it. */
  const started = appt.day < 0 || (appt.day === 0 && nowHm() >= appt.start);
  const attended = Boolean(feedback && feedback.outcome !== "No-show");

  useEffect(() => {
    if (!isViewing || !listingId || !attended) return;
    let dead = false;
    fetch(`/api/listings/application-form?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; offerUrl?: string | null; onMarket?: boolean }) => {
        if (!dead) setLink({ url: j.offerUrl ?? null, onMarket: Boolean(j.onMarket) });
      })
      .catch(() => !dead && setLink({ url: null, onMarket: false }));
    return () => {
      dead = true;
    };
  }, [isViewing, listingId, attended]);

  if (!isViewing || (!started && !feedback)) return null;

  async function save(kind: "done" | "landed" | "noshow", f: { attended: boolean; choice: string; label: string; note: string }) {
    setSaving(kind);
    setSaveSaid(null);
    const j = await fetch("/api/viewings/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        viewingId: appt.id,
        ...f,
        applicant: appt.who ?? "",
        address: appt.where ?? "",
        listingId,
      }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; error?: string }>)
      .catch(() => null);
    setSaving(null);
    if (!j?.ok) {
      setSaveSaid(j?.error ?? "That didn't save - the connection dropped. Try again.");
      return false;
    }
    const saved: ViewingFeedback = {
      id: `os-feedback-${appt.id}`,
      date: new Date().toISOString().slice(0, 10),
      type: "Viewing",
      interest: null,
      note: f.note || null,
      who: appt.who ? [appt.who] : [],
      agent: null,
      source: "os",
      outcome: f.attended ? f.label : "No-show",
    };
    setFeedback(saved);
    try {
      const held = JSON.parse(sessionStorage.getItem(diaryKey) ?? "[]") as Appt[];
      sessionStorage.setItem(diaryKey, JSON.stringify(held.map((a) => (a.id === appt.id ? { ...a, feedback: saved } : a))));
    } catch {
      /* The diary is read again next time. */
    }
    return true;
  }

  async function complete() {
    if (await save("done", { attended: true, ...DONE, note: "" })) setLanding(true);
  }

  async function saveLanding() {
    const opt = OFFERING.find((o) => o.choice === choice);
    /* Howard's questions first, in his order, then anything else - the desk's
       own format, so the record reads the same wherever it was written. */
    const qa = QUESTIONS.map((h) => ({ q: h.q, a: (answers[h.key] ?? "").trim() })).filter((x) => x.a);
    const note = [...qa.map((x) => `${x.q}\n${x.a}`), notes.trim()].filter(Boolean).join("\n\n");
    const ok = await save("landed", { attended: true, choice: opt?.choice ?? DONE.choice, label: opt?.label ?? DONE.label, note });
    if (ok) setLanding(false);
  }

  async function noShow() {
    if (await save("noshow", { attended: false, choice: "", label: "No-show", note: "" })) {
      setAskNoShow(false);
      setLanding(false);
    }
  }

  async function sendOffer() {
    if (!listingId) return;
    setSending(true);
    setSent(null);
    const j = await fetch("/api/listings/application-form", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId, emails: [email], kind: "offer" }),
    })
      .then((r) => r.json() as Promise<{ results?: { sent: boolean; detail: string }[]; error?: string }>)
      .catch(() => null);
    setSending(false);
    const one = j?.results?.[0];
    if (one?.sent) {
      setSent({ ok: true, text: `Offer link sent to ${email}.` });
      setAskOffer(false);
    } else {
      setSent({ ok: false, text: one?.detail || j?.error || "That didn't send - the connection dropped. Try again." });
    }
  }

  const fromRex = Boolean(feedback && feedback.source !== "os");
  const justDone = feedback?.source === "os" && feedback.outcome === DONE.label;
  const offering = OFFERING.some((o) => o.offer && o.label === feedback?.outcome);
  const filled = Boolean(choice || notes.trim() || Object.values(answers).some((a) => a.trim()));
  const waText = link?.url ? `Hi ${first}, thanks for coming to see ${address}. If you'd like to make an offer, you can do it here: ${link.url}` : "";
  const wa = phone && link?.url && link.onMarket ? waAppLink(phone, waText) : null;

  const primary = "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-white disabled:opacity-60";
  const secondary = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line/70 bg-card text-[14.5px] font-medium active:bg-panel disabled:opacity-60";
  const quiet = "flex h-11 w-full items-center justify-center text-[14px] font-medium text-muted";
  const error = saveSaid && (
    <p role="alert" className="mt-2 text-[13.5px] text-accent-dark">
      {saveSaid}
    </p>
  );

  /* Not marked yet: the one tap, and the other way it can have gone. */
  if (!feedback) {
    return (
      <div className="mt-4">
        {askNoShow ? (
          <div className="rounded-[20px] border border-line/70 bg-card p-4">
            <p className="text-[17px] font-semibold">Mark it as a no-show?</p>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">{first === "them" ? "They" : first} didn&apos;t turn up. It goes on the record the same way as from the desk.</p>
            <button type="button" disabled={saving !== null} onClick={() => void noShow()} className={`${primary} mt-3`} style={{ background: "var(--brown)" }}>
              {saving === "noshow" ? "Saving" : "Yes, Mark as No-show"}
            </button>
            <button type="button" onClick={() => setAskNoShow(false)} className={quiet}>
              Not Now
            </button>
            {error}
          </div>
        ) : (
          <>
            <button type="button" disabled={saving !== null} onClick={() => void complete()} className={primary} style={{ background: "var(--brown)" }}>
              <DoodleIcon name="checklist" size={18} /> {saving === "done" ? "Saving" : "Viewing Complete"}
            </button>
            <button type="button" disabled={saving !== null} onClick={() => setAskNoShow(true)} className={quiet}>
              They Didn&apos;t Turn Up
            </button>
            {error}
          </>
        )}
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-[20px] border border-line/70 bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: attended ? "var(--sage)" : "var(--accent-soft)" }}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
            {attended ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            )}
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-snug">{attended ? "Viewing Complete" : "No-show"}</span>
          <span className="block text-[13.5px] text-muted">
            {justDone ? "Saved. How it landed is still to add." : attended ? plain(feedbackLabel(feedback)) : "They didn't turn up."}
          </span>
        </span>
        {!fromRex && !landing && !justDone && (
          <button type="button" onClick={() => setLanding(true)} className="h-10 shrink-0 px-1 text-[13.5px] font-medium text-muted underline underline-offset-2">
            Change
          </button>
        )}
      </div>
      {fromRex && feedback.note && <p className="mt-3 whitespace-pre-line border-t border-line/50 pt-3 text-[13.5px] leading-relaxed">{feedback.note}</p>}

      {/* How it landed: straight on from the tap, or later from here. */}
      {!fromRex && !landing && justDone && (
        <button type="button" onClick={() => setLanding(true)} className={`${secondary} mt-4`}>
          <DoodleIcon name="message" size={17} /> How Did It Land?
        </button>
      )}
      {!fromRex && landing && (
        <div className="mt-4 border-t border-line/50 pt-4">
          <p className="text-[17px] font-semibold">How did it land?</p>
          <p className="mt-1 text-[13.5px] leading-snug text-muted">
            Fill this in for {first} if they told you. Leave any question they didn&apos;t answer.
          </p>
          <div className="mt-3 space-y-3">
            {QUESTIONS.map((h) => (
              <label key={h.key} className="block">
                <span className="text-[14px] font-medium">{h.q}</span>
                <textarea
                  value={answers[h.key] ?? ""}
                  onChange={(e) => setAnswers((cur) => ({ ...cur, [h.key]: e.target.value }))}
                  rows={2}
                  className="mt-1.5 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[16px] leading-snug outline-none focus:border-ink"
                />
              </label>
            ))}
          </div>
          <p className="mt-4 text-[14px] font-medium">Are they offering?</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {OFFERING.map((o) => (
              <button
                key={o.choice}
                type="button"
                aria-pressed={choice === o.choice}
                onClick={() => setChoice((c) => (c === o.choice ? "" : o.choice))}
                className={`flex h-12 items-center gap-3 rounded-xl border px-3.5 text-left text-[14.5px] ${
                  choice === o.choice ? "border-accent-dark bg-accent-soft/50" : "border-line/70"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    choice === o.choice ? "border-accent-dark bg-accent-dark" : "border-line"
                  }`}
                >
                  {choice === o.choice && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {o.says}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything else they said, in their words."
            className="mt-3 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[16px] leading-snug outline-none focus:border-ink"
          />
          <button
            type="button"
            disabled={!filled || saving !== null}
            onClick={() => void saveLanding()}
            className={`${primary} mt-3`}
            style={{ background: "var(--brown)" }}
          >
            {saving === "landed" ? "Saving" : "Save Feedback"}
          </button>
          <button type="button" disabled={saving !== null} onClick={() => setAskNoShow(true)} className={quiet}>
            They Didn&apos;t Turn Up
          </button>
          <button type="button" onClick={() => setLanding(false)} className={quiet}>
            {justDone ? "Skip for Now" : "Not Now"}
          </button>
          {askNoShow && (
            <div className="mt-2 rounded-xl bg-panel p-3">
              <p className="text-[14px]">Mark it as a no-show instead?</p>
              <button type="button" disabled={saving !== null} onClick={() => void noShow()} className={`${secondary} mt-2`}>
                {saving === "noshow" ? "Saving" : "Yes, Mark as No-show"}
              </button>
            </div>
          )}
          {error}
        </div>
      )}
      {!landing && error}

      {/* The offer, on the spot. */}
      {attended && (
        <div className="mt-4 border-t border-line/50 pt-4">
          <p className="text-[15px] font-semibold">{offering ? `${first === "them" ? "They're" : `${first}'s`} offering - send the offer link` : "Want it? Send the offer link"}</p>
          {!listingId ? (
            <p className="mt-1 text-[13.5px] text-muted">This viewing isn&apos;t joined to a listing, so the offer link has to go from the listing on the full OS.</p>
          ) : !link ? (
            <p className="mt-1 text-[13.5px] text-muted">Checking the listing</p>
          ) : !link.onMarket ? (
            <p className="mt-1 text-[13.5px] text-muted">This home isn&apos;t on the market, so the offer form would tell them it&apos;s closed.</p>
          ) : askOffer ? (
            <div className="mt-2">
              <p className="text-[14px] leading-snug">
                The offer form for <span className="font-semibold">{address}</span> goes from your email to <span className="font-semibold">{email}</span>. They fill it in with no account needed.
              </p>
              <button type="button" disabled={sending} onClick={() => void sendOffer()} className={`${primary} mt-3`} style={{ background: "var(--brown)" }}>
                <DoodleIcon name="mail" size={17} /> {sending ? "Sending" : "Send It"}
              </button>
              <button type="button" onClick={() => setAskOffer(false)} className={quiet}>
                Not Now
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-muted">They make the offer themselves on their phone. It comes back to you on the listing&apos;s Offers.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!email}
                  onClick={() => {
                    setSent(null);
                    setAskOffer(true);
                  }}
                  className={`${secondary} flex-1`}
                >
                  <DoodleIcon name="mail" size={17} /> Email It
                </button>
                {wa && (
                  <a href={wa} className={`${secondary} flex-1`}>
                    <DoodleIcon name="message" size={17} /> WhatsApp It
                  </a>
                )}
              </div>
              {!email && <p className="mt-2 text-[13px] text-muted">No email on their record{wa ? ", so it can only go by WhatsApp" : ""}.</p>}
            </>
          )}
          {sent && (
            <p className="mt-2 text-[13.5px]" style={{ color: sent.ok ? "var(--ink)" : "var(--accent-dark)" }}>
              {sent.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
