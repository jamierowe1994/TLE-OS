"use client";

import { useEffect, useRef, useState } from "react";
import PersonQuestions from "@/components/offers/PersonQuestions";
import { emptyPerson, missingForLink, missingFrom, sharedContact, type Contact, type OtherAdult, type PersonAnswers } from "@/lib/offer-people-shape";
import { SCOTLAND } from "@/lib/passport-shape";
import { toast } from "@/lib/toast";

/**
 * The other adults moving in, on an offer (James, 14 Oct 2026). For each one:
 * fill their part in now, or leave it to them and send them their own link
 * once the offer is in. The tenant's offer sheet and the agent's recorder
 * both use this, so a joint offer reads the same from either side.
 */

/** The adults beyond the lead, kept in step with who is ticked as moving in. */
export function useOtherAdults(names: string[], seeds: Partial<PersonAnswers>[] = []): [OtherAdult[], (next: OtherAdult[]) => void] {
  /* What their passport already says about them (each adult's credit, 14 Oct
     2026) arrives filled in, so nobody is asked twice. */
  const fresh = (n: string, i: number): OtherAdult => ({ mode: "fill", answers: { ...emptyPerson(n), ...(seeds[i] ?? {}) } });
  const [others, setOthers] = useState<OtherAdult[]>(() => names.map(fresh));
  /* The count as well as the names: two blank names and one read the same joined. */
  const key = `${names.length}:${names.join("|")}`;
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    setOthers((cur) =>
      names.map((n, i) => {
        /* Keep what was typed: the same person by name, or the same place in the list when the passport gives no name. */
        const same = (n.trim() ? cur.find((o) => o.answers.name.trim() === n.trim()) : null) ?? (!n.trim() && cur[i] ? cur[i] : null);
        return same ?? fresh(n, i);
      })
    );
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [others, setOthers];
}

/** What still stops the offer going, for the sender: null when it can go. The lead's own details, where known, so nobody else is given them. */
export function othersProblem(others: OtherAdult[], scottish = false, lead?: Contact): string | null {
  for (const [i, o] of others.entries()) {
    const who = o.answers.name.trim() || `Adult ${i + 2}`;
    const gaps = o.mode === "fill" ? missingFrom(o.answers, scottish ? SCOTLAND : {}) : missingForLink(o.answers);
    if (gaps.length) return `${o.mode === "fill" ? `For ${who}, still needed` : `To send ${who} a link, add`}: ${gaps.join(", ")}.`;
  }
  return sharedContact([...(lead ? [lead] : []), ...others.filter((o) => o.mode === "fill").map((o) => o.answers)]);
}

export default function OtherAdults({
  others,
  onChange,
  actor,
  field,
  label,
  scottish = false,
}: {
  others: OtherAdult[];
  onChange: (next: OtherAdult[]) => void;
  /** Who is filling in the offer: the lead tenant, or the agent for them. */
  actor: "lead" | "agent";
  field: string;
  label: string;
  /** A Scottish home: no Right to rent asked (James, 15 Oct 2026). */
  scottish?: boolean;
}) {
  if (!others.length) return null;
  const put = (i: number, o: OtherAdult) => onChange(others.map((x, n) => (n === i ? o : x)));
  return (
    <div className="space-y-3">
      {others.map((o, i) => {
        const first = o.answers.name.trim().split(/\s+/)[0] || `Adult ${i + 2}`;
        return (
          <div key={i} className="rounded-[16px] border border-line/70 bg-white p-4">
            <p className="text-[14px] font-semibold">{o.answers.name.trim() || `Adult ${i + 2}`}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted">
              The landlord needs the same from {first} as from {actor === "lead" ? "you" : "the lead tenant"}: who they are, their work and income{scottish ? "" : ", and right to rent"}.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-full bg-page p-1">
              {(["fill", "link"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => put(i, { ...o, mode: m })}
                  aria-pressed={o.mode === m}
                  className={`rounded-full px-3 py-2 text-[12.5px] font-semibold transition-colors ${o.mode === m ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-muted"}`}
                >
                  {m === "fill" ? (actor === "lead" ? "I'll fill it in" : "Fill it in for them") : `${first} fills it in`}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {o.mode === "fill" ? (
                <PersonQuestions value={o.answers} onChange={(a) => put(i, { ...o, answers: a })} field={field} label={label} noRightToRent={scottish} />
              ) : (
                <>
                  <label className="block">
                    <span className={label}>Their full name</span>
                    <input value={o.answers.name} onChange={(e) => put(i, { ...o, answers: { ...o.answers, name: e.target.value } })} placeholder="First and last name" autoComplete="off" className={field} />
                  </label>
                  <p className="mt-2 text-[12px] leading-snug text-muted">
                    Once the offer is sent you get {first === `Adult ${i + 2}` ? "their" : `${first}'s`} own link to copy and send. They fill in their part there, with no account, and it joins the offer.
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The links to send, once the offer is in. */
export function PartLinks({ links, actor }: { links: { name: string; url: string }[]; actor: "lead" | "agent" }) {
  if (!links.length) return null;
  const copy = async (url: string, name: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast(`${name.split(/\s+/)[0]}'s link is copied. Send it to them by text or email.`);
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  return (
    <div className="mt-4 rounded-[16px] border border-line/70 bg-white p-4 text-left">
      <p className="text-[13.5px] font-semibold">{actor === "lead" ? "Now send each of them their part" : "Send each of them their part"}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-muted">Their own link, to fill in what the landlord needs. It joins the offer as soon as they finish.</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.url} className="flex items-center justify-between gap-3 rounded-[12px] bg-page px-3 py-2.5">
            <span className="min-w-0 truncate text-[13px] font-semibold">{l.name}</span>
            <span className="flex shrink-0 gap-1.5">
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button type="button" onClick={() => void navigator.share({ title: "Your part of the offer", url: l.url }).catch(() => null)} className="rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12px] font-semibold">
                  Share
                </button>
              )}
              <button type="button" onClick={() => void copy(l.url, l.name)} className="rounded-full bg-accent-dark px-3 py-1.5 text-[12px] font-semibold text-white">
                Copy link
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
