"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The landlord conversation, on the appraisal file (James, 17 Sep 2026).
 *
 * Opening it marks their messages read, which takes the "new" off the list.
 * A reply is emailed to them with a button into the thread on their file.
 */
type Msg = { id: string; from: "landlord" | "agent"; body: string; sentAt: string; readAt: string | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function AppraisalMessages({ appraisalId, landlord, onRead }: { appraisalId: string; landlord: string; onRead?: () => void }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}/messages?read=1`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; messages?: Msg[] };
      setMessages(j.ok ? j.messages ?? [] : []);
      onRead?.();
    } catch {
      setMessages([]);
    }
  }, [appraisalId, onRead]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const j = (await r.json()) as { ok?: boolean; message?: Msg; emailed?: boolean; to?: string | null; error?: string };
      if (!j.ok || !j.message) throw new Error(j.error ?? "It didn't send.");
      setMessages((m) => [...(m ?? []), j.message!]);
      setText("");
      setNote(j.emailed ? `Sent, and emailed to ${j.to}.` : "Saved to their file. The email didn't go - customer email may be switched off.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "It didn't send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5">
      <h2 className="hand flex items-center gap-3 text-[17px] leading-tight">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="message" size={16} />
        </span>
        Messages with {landlord}
      </h2>

      <div ref={list} className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {messages === null ? (
          <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted">
            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
            Opening the conversation…
          </p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted">Nothing yet. Anything {landlord} sends from their property file lands here, and you&apos;re emailed.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.from === "agent" ? "bg-[#56423e] text-white" : "bg-[#f3efed]"}`}>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.body}</p>
                <p className={`mt-1 text-[10.5px] ${m.from === "agent" ? "text-white/65" : "text-muted"}`}>
                  {m.from === "agent" ? "You" : landlord} · {when(m.sentAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-end gap-2 border-t border-line/50 pt-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          rows={2}
          placeholder={`Reply to ${landlord}…`}
          className="min-h-[44px] flex-1 resize-y rounded-2xl border border-line/70 bg-white px-4 py-2.5 text-[13px] outline-none focus:border-ink/40"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-full bg-accent-dark px-5 py-3 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      {note && <p className="mt-2 text-[11.5px] text-muted">{note}</p>}
    </section>
  );
}
