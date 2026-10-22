"use client";

import { useEffect, useState } from "react";
import type { InspectionEvent } from "@/lib/inspections";

/**
 * WHAT WAS SENT, AND TO WHOM (Rhiannon, 21 Oct 2026, ticket cf2d722c: "it
 * just says booked once I put the date in but I didn't see if an email was
 * sent to the tenant and what it says and if it went to the landlord").
 *
 * Two pieces. EmailPreview reads one email - as it would go, before booking,
 * or as it went, from the copy kept on the visit - and draws it as the
 * person gets it. SentEmails lists every email the visit has sent, newest
 * first, each with who it went to and a "See the email".
 */

/* Same words as lib/inspection-emails viaWords, which is server-only. */
const VIA: Record<string, string> = { "own mailbox": "from the agent's own mailbox", "public sender": "from the Letting Experts address" };

/** Did an email of this kind actually go? Lines from before 22 Oct kept only their sentence. */
export function emailWent(events: InspectionEvent[], to: "tenant" | "landlord"): boolean {
  return events.some((e) => e.kind === "email" && (e.email ? e.email.to === to && e.email.sent : e.text.startsWith(`The ${to} was emailed`)));
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function EmailPreview({ url }: { url: string }) {
  const [said, setSaid] = useState<{ subject: string; html: string; to?: string; address?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    setSaid(null);
    setErr(null);
    fetch(url, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (gone) return;
        if (j?.ok) setSaid(j);
        else setErr(j?.error ?? "The email couldn't be shown.");
      })
      .catch(() => { if (!gone) setErr("The email couldn't be shown."); });
    return () => { gone = true; };
  }, [url]);
  if (err) return <p className="mt-2 text-[11.5px] text-accent-dark">{err}</p>;
  if (!said) {
    return (
      <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
        <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" aria-hidden />
        Writing the email…
      </p>
    );
  }
  const to = said.to ?? said.address;
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line/70 bg-white">
      <div className="border-b border-line/60 px-3 py-2 text-[11.5px]">
        {to && <p className="truncate text-muted">To {to}</p>}
        <p className="truncate font-semibold">{said.subject}</p>
      </div>
      <iframe title="The email" srcDoc={said.html} sandbox="" className="block h-[380px] w-full bg-white" />
    </div>
  );
}

export default function SentEmails({ inspectionId, events }: { inspectionId: string; events: InspectionEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const emails = events.filter((e) => e.kind === "email");
  if (!emails.length) return <p className="mt-2 text-[12px] text-muted">No emails have gone from this visit yet.</p>;
  return (
    <ul className="mt-2 space-y-2.5">
      {emails.map((e) => {
        const m = e.email;
        /* Lines from before 22 Oct 2026 kept only their sentence. */
        if (!m) {
          return (
            <li key={e.id} className="text-[12px]">
              <span className="text-muted">{when(e.at)}</span>
              <br />
              {e.text}
            </li>
          );
        }
        const who = m.to === "tenant" ? "Tenant" : "Landlord";
        return (
          <li key={e.id} className="text-[12px]">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${m.sent ? "bg-[#f1f4ec] text-[#56634a]" : "bg-accent-soft text-accent-dark"}`}
              >
                {m.sent ? `${who} emailed` : `${who} not emailed`}
              </span>
              <span className="text-muted">{when(e.at)}</span>
            </div>
            <p className="mt-1">
              {m.sent
                ? <>{m.subject ? <span className="font-semibold">{m.subject}</span> : null}{m.subject ? " - " : ""}to {m.address}{m.via ? `, ${VIA[m.via] ?? `from the ${m.via}`}` : ""}.</>
                : <>{(m.reason ?? "No reason given").replace(/\.+$/, "")}.{m.address ? ` (${m.address})` : ""}</>}
            </p>
            {m.hasCopy && (
              <>
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="mt-1 text-[11.5px] font-semibold text-accent-dark underline">
                  {open === e.id ? "Hide the email" : "See the email"}
                </button>
                {open === e.id && <EmailPreview url={`/api/inspections/${encodeURIComponent(inspectionId)}?copy=${encodeURIComponent(e.id)}`} />}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
