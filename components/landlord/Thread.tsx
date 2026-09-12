"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ViewMessage } from "@/lib/landlord-view";

/**
 * The thread with their agent, on the page rather than in a sheet: what
 * has been said, newest at the foot, and the composer under it. The same
 * store and the same email as the message sheet - what they write is kept
 * on their file and sent to the agent, whose reply comes back by email for
 * now; the page says so, so nobody waits for a bubble that will not appear.
 * When the agent's side lands in the OS, only this component changes.
 */
export default function Thread({
  appraisalId,
  agentFirst,
  messages,
  sample = false,
}: {
  appraisalId: string | null;
  agentFirst: string;
  messages: ViewMessage[];
  sample?: boolean;
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ViewMessage[]>(messages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);
  const foot = useRef<HTMLDivElement>(null);

  useEffect(() => setThread(messages), [messages]);
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "nearest" });
  }, [thread.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    if (sample) {
      setNote({ text: `On the sample nothing is sent. A real landlord's message goes to ${agentFirst}'s inbox and stays on their file here.`, err: false });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/landlord/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appraisalId, text: body }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; emailed?: boolean; message?: { id: string; sentAt: string } };
      if (!j.ok) {
        setNote({ text: j.error ?? "That didn't send.", err: true });
        return;
      }
      setThread((t) => [...t, { id: j.message?.id ?? String(Date.now()), from: "landlord", body, sentAt: j.message?.sentAt ?? new Date().toISOString(), emailed: Boolean(j.emailed) }]);
      setText("");
      router.refresh();
    } catch {
      setNote({ text: "That didn't send. Try again in a moment.", err: true });
    } finally {
      setBusy(false);
    }
  }

  /* The day as a divider, the time on each bubble. */
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const groups: Array<{ day: string; items: ViewMessage[] }> = [];
  for (const m of thread) {
    const day = dayOf(m.sentAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }

  return (
    <div className="flex min-h-[420px] flex-col">
      <div className="min-h-0 flex-1 space-y-5">
        {thread.length === 0 && (
          <p className="rounded-2xl bg-[#f8f8f6] px-4 py-3 text-[13px] text-muted">Nothing yet. Ask {agentFirst} anything about the property - it is all kept here.</p>
        )}
        {groups.map((g) => (
          <div key={g.day}>
            <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{g.day}</p>
            <div className="space-y-2.5">
              {g.items.map((m) => (
                <div key={m.id} className={`flex ${m.from === "landlord" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-[18px] px-4 py-3 text-[13.5px] leading-relaxed ${m.from === "landlord" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-accent-soft/80 text-ink"}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1.5 text-[10.5px] ${m.from === "landlord" ? "text-white/60" : "text-muted"}`}>
                      {m.from === "landlord" ? "You" : agentFirst} · {timeOf(m.sentAt)}
                      {m.from === "landlord" && !m.emailed ? " · on your file, not yet emailed" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={foot} />
      </div>

      <div className="mt-6 border-t border-line/50 pt-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          rows={3}
          placeholder={`Write to ${agentFirst}`}
          className="w-full resize-y rounded-2xl border border-line/70 bg-white px-4 py-3 text-[13.5px] outline-none placeholder:text-muted focus:border-ink/40"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-[12px] ${note?.err ? "font-semibold text-accent-dark" : "text-muted"}`}>
            {note ? note.text : `Goes to ${agentFirst}'s inbox. Replies come back to your email for now.`}
          </p>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !text.trim()}
            className="rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
