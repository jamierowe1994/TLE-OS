"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PersonQuestions from "@/components/offers/PersonQuestions";
import { emptyPerson, missingFrom, type PersonAnswers } from "@/lib/offer-people-shape";

/**
 * ONE ADULT'S PART OF AN OFFER (James, 14 Oct 2026).
 *
 * The link the lead tenant, or the agent, sends to another adult moving in:
 * the same questions the lead answered, about this person, with no account.
 * It joins the offer the moment it is sent (app/api/tenant/offer-part).
 */

const field = "mt-1.5 block h-12 w-full min-w-0 rounded-[12px] border border-black/15 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark";
const label = "text-[13px] font-semibold";

type Part = { name: string; leadName: string; property: string; filled: boolean; answers: PersonAnswers };

export default function OfferPartPage() {
  const { token } = useParams<{ token: string }>();
  const [part, setPart] = useState<Part | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [answers, setAnswers] = useState<PersonAnswers>(emptyPerson());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/tenant/offer-part/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string } & Part) => {
        if (!j.ok) return setProblem(j.error ?? "That link isn't right.");
        setPart(j);
        setAnswers({ ...emptyPerson(j.name), ...j.answers, name: j.answers.name || j.name });
      })
      .catch(() => setProblem("This page didn't load. Try again in a minute."));
  }, [token]);

  async function send() {
    setErr("");
    const gaps = missingFrom(answers);
    if (gaps.length) return setErr(`Still needed: ${gaps.join(", ")}.`);
    setBusy(true);
    const r = await fetch(`/api/tenant/offer-part/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't send. Try again in a minute.");
    setDone(true);
  }

  const first = answers.name.trim().split(/\s+/)[0];
  const lead = part?.leadName.trim().split(/\s+/)[0] || "Your housemate";

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      {problem ? (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
          <h1 className="text-[22px] font-bold">This Link Isn&apos;t Working</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-black/60">{problem} Ask whoever sent it for a new one.</p>
        </div>
      ) : !part ? (
        <p className="flex items-center gap-2 text-[13.5px] text-black/60">
          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-accent-dark" />
          Opening your part of the offer…
        </p>
      ) : done ? (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-dark text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h1 className="mt-4 text-[22px] font-bold">Thanks{first ? `, ${first}` : ""}</h1>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-black/60">
            Your part is with the offer on {part.property}. The agent puts it to the landlord and comes back to {lead}.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Your part of the offer</p>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight">{part.property}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-black/60">
            {lead} has made an offer on {part.property} with you moving in too. The landlord needs the same from you as from {lead}: who you are, your work and income, and your right to rent. It takes about two minutes.
          </p>
          {part.filled && (
            <p className="mt-3 rounded-[12px] bg-accent-soft/70 px-3.5 py-2.5 text-[12.5px] leading-snug">Your part is already in. Change anything here and send it again.</p>
          )}
          <div className="mt-6 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
            <PersonQuestions value={answers} onChange={setAnswers} self field={field} label={label} />
          </div>
          <p className="mt-4 text-[12px] leading-snug text-black/55">
            Your answers go only to The Letting Experts, for this offer and the referencing that follows it.
          </p>
          {err && <p className="mt-3 text-[13px] text-[#9d4340]">{err}</p>}
          <button type="button" disabled={busy} onClick={() => void send()} className="mt-4 flex w-full items-center justify-center rounded-full bg-accent-dark py-3.5 text-[14.5px] font-semibold text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send my part"}
          </button>
        </>
      )}
    </div>
  );
}
