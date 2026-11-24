"use client";

import { useEffect, useRef, useState } from "react";
import SteveFace from "@/components/SteveFace";
import { SOURCE_ADMIN, SOURCE_SAYS, type FindAnswer, type FindOutcome, type FindWho, type FoundPerson } from "@/lib/steve-find-shared";

/**
 * STEVE FINDS WHAT'S MISSING: the card (lib/steve-find-shared).
 *
 * He looks the moment the card opens, says what he found and where, and asks
 * "Is this the right person?". Nothing on it can be typed or changed: the
 * agent says yes or no. Used by the report form (HelpDock), where a "no" or
 * "nothing found" hands back to the form so the report goes with its
 * pictures, and by Find It on a home's blank boxes, where it files the
 * report itself.
 *
 * Styles: app/new-look/steve-panel.css (sv-find).
 */

type Phase =
  | { at: "looking" }
  | { at: "answer"; answer: FindAnswer }
  | { at: "saving"; answer: Extract<FindAnswer, { state: "found" }> }
  | { at: "saved"; home: string; saved: number }
  | { at: "failed"; error: string };

const ADDS: Record<FoundPerson["adds"][number], string> = { name: "name", email: "email", phone: "mobile" };

export function outcomeOf(answer: FindAnswer | null, said: "no" | "nothing"): FindOutcome | undefined {
  if (!answer) return undefined;
  if (answer.state === "found") return { said, looked: answer.looked, found: answer.people.map(({ who, name, email, phone, source }) => ({ who, name, email, phone, source })) };
  if (answer.state === "none") return { said, looked: answer.looked };
  return undefined;
}

/** The line a report to James carries, so he doesn't look again. */
export function outcomeLine(o: FindOutcome | undefined): string {
  if (!o) return "";
  /* James's ticket list may name REX; the agent's screens never do. */
  const places = [...new Set(o.looked.map((l) => (l === "the home's file" ? "REX" : l)))];
  const where = places.length > 1 ? `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}` : places[0] || "the usual places";
  if (o.said === "no" && o.found?.length) {
    const people = o.found.map((p) => `${p.who} ${p.name}${p.email ? `, ${p.email}` : ""}${p.phone ? `, ${p.phone}` : ""} (from ${SOURCE_ADMIN[p.source]})`).join("; ");
    return `Steve looked in ${where}, and found ${people}. They said that isn't right.`;
  }
  return `Steve looked in ${where} and found nothing he could be sure of.`;
}

export default function SteveFind({
  path,
  who,
  onSaved,
  onSend,
  sendLabel = "Send It to James",
  compact = false,
}: {
  path: string;
  who: FindWho | null;
  /** After a yes: the home's page reads its people again. */
  onSaved?: (saved: number) => void;
  /** A no, or nothing found: what Steve looked at goes with the report. */
  onSend: (outcome: FindOutcome | undefined) => void;
  sendLabel?: string;
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ at: "looking" });
  const asked = useRef("");

  useEffect(() => {
    const key = `${path}|${who ?? ""}`;
    if (asked.current === key) return;
    asked.current = key;
    setPhase({ at: "looking" });
    fetch("/api/assistant/find", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, who }) })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; answer?: FindAnswer; error?: string } | null) => {
        if (j?.ok && j.answer) setPhase({ at: "answer", answer: j.answer });
        else setPhase({ at: "failed", error: j?.error || "I couldn't look just now." });
      })
      .catch(() => setPhase({ at: "failed", error: "I couldn't look just now." }));
  }, [path, who]);

  async function yes(answer: Extract<FindAnswer, { state: "found" }>) {
    setPhase({ at: "saving", answer });
    const j = (await fetch("/api/assistant/find", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: answer.token }) })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; saved?: number; home?: string; error?: string } | null;
    if (j?.ok) {
      setPhase({ at: "saved", home: j.home ?? answer.home, saved: j.saved ?? 0 });
      onSaved?.(j.saved ?? 0);
    } else setPhase({ at: "failed", error: j?.error || "That couldn't be saved just now." });
  }

  const answer = phase.at === "answer" ? phase.answer : phase.at === "saving" ? phase.answer : null;

  return (
    <div className={`sv-fix sv-find${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <SteveFace size={30} mood={phase.at === "looking" || phase.at === "saving" ? "thinking" : "happy"} />
      <div className="min-w-0 flex-1">
        {phase.at === "looking" && (
          <>
            <p className="sv-fix-h">Having a Look</p>
            <p className="sv-fix-p sv-find-busy">
              <span className="sv-find-spin" aria-hidden />
              Checking PayProp, Propoly and the home's file…
            </p>
          </>
        )}

        {answer?.state === "found" && (
          <>
            <p className="sv-fix-h">Is This the Right Person?</p>
            <ul className="sv-find-people">
              {answer.people.map((p, i) => (
                <li key={i}>
                  <p className="sv-find-name">
                    <span className="sv-find-role">{p.who === "landlord" ? "Landlord" : "Tenant"}</span> {p.name}
                  </p>
                  {p.email && <p className="sv-find-line">{p.email}</p>}
                  {p.phone && <p className="sv-find-line">{p.phone}</p>}
                  <p className="sv-find-from">
                    Found in {SOURCE_SAYS[p.source]}. Adds their {p.adds.map((a) => ADDS[a]).join(" and ")}.
                  </p>
                </li>
              ))}
            </ul>
            <div className="sv-find-acts">
              <button type="button" className="sv-find-yes" disabled={phase.at === "saving"} onClick={() => void yes(answer)}>
                {phase.at === "saving" ? (
                  <>
                    <span className="sv-find-spin is-light" aria-hidden /> Saving…
                  </>
                ) : (
                  "Yes, That's Right"
                )}
              </button>
              <button type="button" className="sv-find-no" disabled={phase.at === "saving"} onClick={() => onSend(outcomeOf(answer, "no"))}>
                No, Send It to James
              </button>
            </div>
          </>
        )}

        {answer?.state === "none" && (
          <>
            <p className="sv-fix-h">I Couldn't Find It</p>
            <p className="sv-fix-p">
              {answer.why || `I looked in ${answer.looked.join(", ") || "PayProp, Propoly and the home's file"} and found nothing I could be sure of.`} I'll tell James where I looked.
            </p>
            <div className="sv-find-acts">
              <button type="button" className="sv-find-yes" onClick={() => onSend(outcomeOf(answer, "nothing"))}>
                {sendLabel}
              </button>
            </div>
          </>
        )}

        {answer?.state === "complete" && (
          <>
            <p className="sv-fix-h">Nothing's Missing Here</p>
            <p className="sv-fix-p">Every landlord and tenant on {answer.home} has an email and a mobile. If something is still wrong, send it to James.</p>
            <div className="sv-find-acts">
              <button type="button" className="sv-find-no" onClick={() => onSend(undefined)}>
                {sendLabel}
              </button>
            </div>
          </>
        )}

        {answer?.state === "not-yours" && (
          <>
            <p className="sv-fix-h">Only on Your Own Homes</p>
            <p className="sv-fix-p">I can only fill in details on a home in your name. James will look at this one.</p>
            <div className="sv-find-acts">
              <button type="button" className="sv-find-yes" onClick={() => onSend(undefined)}>
                {sendLabel}
              </button>
            </div>
          </>
        )}

        {(answer?.state === "error" || phase.at === "failed") && (
          <>
            <p className="sv-fix-h">That Didn't Work</p>
            <p className="sv-fix-p">{phase.at === "failed" ? phase.error : answer?.state === "error" ? answer.error : ""}</p>
            <div className="sv-find-acts">
              <button type="button" className="sv-find-yes" onClick={() => onSend(undefined)}>
                {sendLabel}
              </button>
            </div>
          </>
        )}

        {phase.at === "saved" && (
          <>
            <p className="sv-fix-h">Done, It's on the Home</p>
            <p className="sv-fix-p">
              {phase.saved ? `Saved on ${phase.home}. No need to wait for James.` : "Somebody had already filled it in, so nothing needed saving."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
