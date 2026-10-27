"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/app/AppIcon";
import { feedbackLabel, type Appt, type ViewingFeedback } from "@/lib/diary";
import { Sheet, whatsappHref, WhatsAppIcon } from "@/app/agent/bits";
import PhonePassport from "@/components/app/PhonePassport";

/**
 * AFTER THE VIEWING, ON THE DOORSTEP (Dan Richards, ticket 9a7e07c5,
 * 17 Oct 2026): "apart from calling and messaging the applicants, we can't do
 * anything further to progress it in the moment, which is where the key
 * 'buying' behaviours exist".
 *
 * On the app's viewing screen, from the day of the viewing:
 *
 *   Viewing Done   - how it landed, saved the same way the desk's viewing
 *                    drawer saves it (/api/viewings/feedback), so the viewing
 *                    leaves Feedback Due everywhere. Saves to the OS only.
 *   Send Offer Link - the listing's offer form by email, the same send as the
 *                    lead's Send offer form (/api/listings/application-form,
 *                    kind "offer"), asked once first.
 *   WhatsApp       - the same link in their WhatsApp chat, from the agent's
 *                    own phone; nothing goes until they press send there.
 *   Rental passport - components/app/PhonePassport.
 */

/* The desk's own labels, word for word: the desk reads them back to know an
   offer is coming (components/ViewingDrawer FEEDBACK_OPTIONS). What the phone
   shows is its own wording. */
const OUTCOMES: Array<{ choice: string; label: string; says: string; attended: boolean }> = [
  { choice: "loved", label: "Loved it — offer expected", says: "Loved It - Offer Expected", attended: true },
  { choice: "offer", label: "Offer received", says: "Offer Received", attended: true },
  { choice: "thinking", label: "Thinking about it", says: "Thinking About It", attended: true },
  { choice: "notforthem", label: "Not for them", says: "Not for Them", attended: true },
  { choice: "", label: "No-show", says: "They Didn't Turn Up", attended: false },
];

/** The desk's words, with any long dash the agent never typed made a plain one. */
const plain = (s: string) => s.replace(/\s*[—–]\s*/g, " - ");

export default function AfterViewing({
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
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSaid, setSaveSaid] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string | null; onMarket: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);
  const listingId = appt.listingId ?? null;
  const first = (appt.who || "").trim().split(/\s+/)[0] || "them";
  const address = appt.where || "the home";

  useEffect(() => {
    if (!listingId) return;
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
  }, [listingId]);

  /* From the day itself: the agent is often stood in the home before the
     end time, and that is when they want it. */
  if (appt.kind !== "viewing" || appt.day > 0) return null;

  async function save(o: (typeof OUTCOMES)[number]) {
    setSaving(true);
    setSaveSaid(null);
    const j = await fetch("/api/viewings/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        viewingId: appt.id,
        attended: o.attended,
        choice: o.choice,
        label: o.label,
        note: "",
        applicant: appt.who ?? "",
        address: appt.where ?? "",
        listingId,
      }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; error?: string }>)
      .catch(() => null);
    setSaving(false);
    if (!j?.ok) return setSaveSaid(j?.error ?? "That didn't save - the connection dropped. Try again.");
    const f: ViewingFeedback = {
      id: `os-feedback-${appt.id}`,
      date: new Date().toISOString().slice(0, 10),
      type: "Viewing",
      interest: null,
      note: null,
      who: appt.who ? [appt.who] : [],
      agent: null,
      source: "os",
      outcome: o.attended ? o.label : "No-show",
    };
    setFeedback(f);
    setPicking(false);
    try {
      const held = JSON.parse(sessionStorage.getItem(diaryKey) ?? "[]") as Appt[];
      sessionStorage.setItem(diaryKey, JSON.stringify(held.map((a) => (a.id === appt.id ? { ...a, feedback: f } : a))));
    } catch {
      /* The diary is read again next time. */
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
      setAsking(false);
    } else {
      setSent({ ok: false, text: one?.detail || j?.error || "That didn't send - the connection dropped. Try again." });
    }
  }

  const waText = link?.url
    ? `Hi ${first}, thanks for coming to see ${address}. If you'd like to make an offer, you can do it here: ${link.url}`
    : "";
  const wa = phone && link?.url && link.onMarket ? whatsappHref(phone, waText) : null;
  const outcome = feedback ? plain(feedbackLabel(feedback)) : null;

  return (
    <section className="mt-6">
      <p className="m-eyebrow mb-2 px-1">After the Viewing</p>
      <div className="m-group p-4">
        {/* How it went. */}
        {feedback && !picking ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-green-wash)", color: "var(--m-sage-ink)" }}>
              <AppIcon name="checklist" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Viewing done</span>
              <span className="block text-[13.5px] capitalize text-muted">{outcome}</span>
            </span>
            {feedback.source !== "rex" && (
              <button type="button" onClick={() => setPicking(true)} className="text-[13.5px] font-semibold text-muted underline underline-offset-2">
                Change
              </button>
            )}
          </div>
        ) : picking ? (
          <>
            <p className="text-[15px] font-semibold">How did it go?</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {OUTCOMES.map((o) => (
                <button key={o.says} type="button" disabled={saving} onClick={() => void save(o)} className="m-btn m-press !justify-start !text-[14.5px] disabled:opacity-60">
                  {o.says}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPicking(false)} className="mt-3 w-full text-center text-[13.5px] font-semibold text-muted">
              Not Yet
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="m-btn m-btn-primary m-press w-full">
            <AppIcon name="checklist" size={17} /> Viewing Done
          </button>
        )}
        {saveSaid && (
          <p className="mt-2 text-[13.5px]" style={{ color: "var(--m-coral)" }}>
            {saveSaid}
          </p>
        )}

        {/* The offer, on the spot. */}
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--m-line)" }}>
          <p className="text-[15px] font-semibold">Want it? Send the offer link</p>
          {!listingId ? (
            <p className="mt-1 text-[13.5px] text-muted">This viewing isn&apos;t joined to a listing, so the offer link has to go from the listing on the desk.</p>
          ) : link && !link.onMarket ? (
            <p className="mt-1 text-[13.5px] text-muted">This home isn&apos;t on the market, so the offer form would tell them it&apos;s closed.</p>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-muted">They make the offer themselves on their phone. It comes back to you on the listing&apos;s Offers.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!email || !link}
                  onClick={() => {
                    setSent(null);
                    setAsking(true);
                  }}
                  className="m-btn m-btn-primary m-press flex-1 !text-[14.5px] disabled:opacity-50"
                >
                  <AppIcon name="mail" size={17} /> Email It
                </button>
                {wa && (
                  <a href={wa} className="m-btn m-press flex-1 !text-[14.5px]">
                    <WhatsAppIcon size={17} /> WhatsApp It
                  </a>
                )}
              </div>
              {!email && <p className="mt-2 text-[13px] text-muted">No email on their record, so it can only go by WhatsApp.</p>}
            </>
          )}
          {sent && (
            <p className="mt-2 text-[13.5px]" style={{ color: sent.ok ? "var(--m-sage-ink)" : "var(--m-coral)" }}>
              {sent.text}
            </p>
          )}
        </div>

        {/* Their details, if they haven't given them yet. */}
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--m-line)" }}>
          <PhonePassport name={appt.who || ""} email={email} listingId={listingId} address={appt.where || ""} quiet />
        </div>
      </div>

      {asking && (
        <Sheet label="Send the offer link" onClose={() => setAsking(false)}>
          <h2 className="m-title text-[26px] leading-tight">Email {first} the offer link?</h2>
          <p className="mt-2 text-[15px] leading-snug text-muted">
            The offer form for <span className="font-medium" style={{ color: "var(--m-ink)" }}>{address}</span> goes from your email to{" "}
            <span className="font-medium" style={{ color: "var(--m-ink)" }}>{email}</span>. They fill it in with no account needed.
          </p>
          {sent && !sent.ok && (
            <p className="mt-3 text-[14px]" style={{ color: "var(--m-coral)" }}>
              {sent.text}
            </p>
          )}
          <button type="button" onClick={() => void sendOffer()} disabled={sending} className="m-btn m-btn-primary m-press mt-5 w-full disabled:opacity-60">
            <AppIcon name="mail" size={17} /> {sending ? "Sending" : "Send It"}
          </button>
          <button type="button" onClick={() => setAsking(false)} className="m-btn m-press mt-2 w-full">
            Not Now
          </button>
        </Sheet>
      )}
    </section>
  );
}
