"use client";

import { useMemo, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";

/**
 * After the viewing: how was it, and do you want it?
 *
 * Built on Howard's JotForm, deliberately. His four questions are reproduced
 * WORD FOR WORD, because they already work and because his Power Automate flow
 * writes them into REX as one feedback note in that order — change the wording
 * here and the note in REX stops matching every one recorded before it.
 *
 * What is new is the second half. His form has a "price indicator", which is a
 * hint. An offer is a commitment, and it needs a rule his form has no way to
 * enforce: NOTHING ABOVE THE ASKING PRICE. Rent is not an auction, the landlord
 * has advertised a figure, and a portal that lets someone bid £1,400 on a
 * £1,250 flat creates an expectation the business then has to take away.
 *
 * The tenant lands here from the email, already signed in, with the property
 * they actually saw — never a blank form asking which one they mean.
 */

const RED = "#e31f36";

/** The viewing this feedback belongs to. Live, this comes from the link's
 *  token; the sample stands in so the page can be seen and judged. */
const VIEWING = {
  tenant: "Sophie Turner",
  property: "Flat 2, Mercer Street",
  locality: "Manchester M4",
  askingPcm: 995,
  viewedOn: "Tuesday 18 August",
  agent: "Rhiannon Carter",
};

/** Howard's questions, in his order and his words. */
const QUESTIONS = [
  { key: "liked", q: "What did you like most about the property?" },
  { key: "info", q: "Is there anything you’d like more information on?" },
  { key: "concerns", q: "Are there any concerns or points you’d like to discuss?" },
  { key: "compare", q: "How does it compare to other properties you’ve seen?" },
] as const;

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function TenantFeedback() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [interested, setInterested] = useState<"yes" | "no" | null>(null);
  const [offer, setOffer] = useState(String(VIEWING.askingPcm));
  const [moveIn, setMoveIn] = useState("");
  const [term, setTerm] = useState("12 months");
  const [sent, setSent] = useState(false);

  const offerNum = Number(offer.replace(/[£,\s]/g, ""));
  const offerError = useMemo(() => {
    if (interested !== "yes") return null;
    if (!offer.trim()) return "Tell us what you’d like to offer.";
    if (!Number.isFinite(offerNum) || offerNum <= 0) return "That doesn’t look like an amount.";
    // The rule. Stated as a fact about the property, not as a telling-off.
    if (offerNum > VIEWING.askingPcm) {
      return `The advertised rent is ${gbp(VIEWING.askingPcm)} a month, so an offer can’t be above that. You can offer ${gbp(VIEWING.askingPcm)} or less.`;
    }
    return null;
  }, [interested, offer, offerNum]);

  const answered = QUESTIONS.filter((q) => (answers[q.key] ?? "").trim()).length;
  const canSend = answered > 0 && interested !== null && !offerError;

  if (sent) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-[22px] text-white"
            style={{ background: RED }}
          >
            ✓
          </div>
          <h1 className="mt-4 text-[20px] font-bold">Thank you, Sophie</h1>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-black/60">
            {interested === "yes"
              ? `Your feedback and your offer of ${gbp(offerNum)} a month have gone to ${VIEWING.agent}. She’ll put it to the landlord and come back to you — usually the same day.`
              : `Your feedback has gone to ${VIEWING.agent}. It helps us find you somewhere that fits, and it helps the landlord understand how the property is being received.`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      {/* What you saw — never a blank form asking which property they mean. */}
      <div className="flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-4">
        <PropertyPhoto src={null} className="h-16 w-20 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
            You viewed this on {VIEWING.viewedOn}
          </p>
          <p className="mt-0.5 truncate text-[15px] font-bold">{VIEWING.property}</p>
          <p className="text-[12.5px] text-black/50">
            {VIEWING.locality} · {gbp(VIEWING.askingPcm)} pcm
          </p>
        </div>
      </div>

      <h1 className="mt-8 text-[22px] font-bold leading-tight">
        How did you find it?
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-black/60">
        Four quick questions. Whatever you say goes straight to {VIEWING.agent} — and
        an honest answer is more use to you than a polite one.
      </p>

      <div className="mt-6 space-y-4">
        {QUESTIONS.map((q) => (
          <label key={q.key} className="block">
            <span className="text-[13.5px] font-semibold">{q.q}</span>
            <textarea
              rows={3}
              value={answers[q.key] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-black/12 bg-white p-3 text-[13.5px] outline-none focus:border-black/35"
            />
          </label>
        ))}
      </div>

      {/* ---- the offer ---- */}
      <div className="mt-9 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-[16px] font-bold">Would you like to take it?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-black/60">
          No obligation — saying yes puts an offer to the landlord, and you can still
          change your mind.
        </p>

        <div className="mt-4 flex gap-2.5">
          {(["yes", "no"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setInterested(v)}
              className="flex-1 rounded-xl border px-4 py-3 text-[13.5px] font-semibold transition-colors"
              style={
                interested === v
                  ? { background: RED, borderColor: RED, color: "#fff" }
                  : { borderColor: "rgba(0,0,0,.12)" }
              }
            >
              {v === "yes" ? "Yes, I’d like to offer" : "Not this one"}
            </button>
          ))}
        </div>

        {interested === "yes" ? (
          <div className="mt-5 space-y-4 border-t border-black/8 pt-5">
            <label className="block">
              <span className="text-[13px] font-semibold">Your offer, per month</span>
              <span className="mt-0.5 block text-[12px] text-black/50">
                Advertised at {gbp(VIEWING.askingPcm)} a month. Offers at or below that.
              </span>
              <input
                inputMode="numeric"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                className="mt-2 w-40 rounded-xl border bg-white p-3 text-[15px] font-semibold outline-none"
                style={{ borderColor: offerError ? RED : "rgba(0,0,0,.12)" }}
              />
              {offerError ? (
                <span className="mt-1.5 block text-[12.5px]" style={{ color: RED }}>
                  {offerError}
                </span>
              ) : null}
            </label>

            <div className="flex flex-wrap gap-4">
              <label className="block">
                <span className="text-[13px] font-semibold">When could you move in?</span>
                <input
                  type="date"
                  value={moveIn}
                  onChange={(e) => setMoveIn(e.target.value)}
                  className="mt-2 rounded-xl border border-black/12 bg-white p-3 text-[13.5px] outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold">How long for?</span>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="mt-2 rounded-xl border border-black/12 bg-white p-3 text-[13.5px] outline-none"
                >
                  <option>6 months</option>
                  <option>12 months</option>
                  <option>24 months</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!canSend}
        onClick={() => setSent(true)}
        className="mt-6 w-full rounded-xl px-5 py-3.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-35"
        style={{ background: RED }}
      >
        {interested === "yes" ? "Send feedback and offer" : "Send feedback"}
      </button>
      <p className="mt-2 text-center text-[11.5px] text-black/45">
        {answered} of {QUESTIONS.length} questions answered
        {interested === null ? " · let us know if you’d like to offer" : ""}
      </p>
    </main>
  );
}
