"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "Emails with them", on a record (15 Sep 2026). The agent's own emails with
 * this person, read live from their Outlook by /api/mailbox/thread - so the
 * reply to a confirmation is on the lead, not only in one inbox.
 */

type Line = { id: string; subject: string; fromName: string; direction: "in" | "out"; at: string; preview: string; unread: boolean; link: string | null };

function when(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MailThread({ email, firstName }: { email: string | null | undefined; firstName: string }) {
  const [state, setState] = useState<{ loading: boolean; lines: Line[]; said: string | null }>({ loading: true, lines: [], said: null });

  useEffect(() => {
    const address = (email ?? "").trim();
    if (!address) {
      setState({ loading: false, lines: [], said: `No email address on ${firstName}'s record yet.` });
      return;
    }
    let gone = false;
    setState({ loading: true, lines: [], said: null });
    fetch(`/api/mailbox/thread?email=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; messages?: Line[]; detail?: string }) => {
        if (gone) return;
        if (j.ok) setState({ loading: false, lines: j.messages ?? [], said: (j.messages ?? []).length ? null : `No emails with ${firstName} in your Outlook yet.` });
        else setState({ loading: false, lines: [], said: j.detail ?? "Your emails could not be read just now." });
      })
      .catch(() => { if (!gone) setState({ loading: false, lines: [], said: "Your emails could not be read just now." }); });
    return () => { gone = true; };
  }, [email, firstName]);

  return (
    <section className="mt-4 border-t border-line/70 pt-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Emails with {firstName}</p>
      {state.loading ? (
        <p className="mt-2 text-[11.5px] text-muted">Reading your Outlook…</p>
      ) : state.said ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{state.said}</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {state.lines.map((m) => (
            <li key={m.id} className="flex items-start gap-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.direction === "in" ? "bg-accent-soft/70" : "bg-panel"}`}>
                <DoodleIcon name="mail" size={13} className={m.direction === "in" ? "text-accent-dark" : "text-muted"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[12px] ${m.unread ? "font-semibold" : ""}`}>
                    {m.direction === "in" ? `${m.fromName}: ` : "You: "}
                    {m.subject}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted">{when(m.at)}</span>
                </span>
                {m.preview && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{m.preview}</span>}
                {m.link && (
                  <a href={m.link} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[10.5px] text-muted underline underline-offset-2 hover:text-ink">
                    Open in Outlook
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
