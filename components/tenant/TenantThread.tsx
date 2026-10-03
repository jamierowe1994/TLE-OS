"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The tenant's conversation with their agent (3 Oct 2026). Until today the
 * Messages page said "on their way" and offered an email link. What they write
 * is stored and their agent is emailed, and it lands in the agent's Chats on
 * the phone; the agent's replies come back here and by email.
 */

type Msg = { id: string; from: "customer" | "agent"; body: string; at: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

export default function TenantThread({ agentFirst }: { agentFirst: string | null }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  const load = () =>
    fetch("/api/tenant/messages", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; messages?: Msg[] }) => setMessages(j.ok ? j.messages ?? [] : []))
      .catch(() => setMessages([]));

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages?.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setNote(null);
    const j = (await fetch("/api/tenant/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Try again in a moment." }))) as { ok?: boolean; error?: string; message?: Msg };
    setBusy(false);
    if (!j.ok || !j.message) return setNote(j.error ?? "That did not send.");
    setMessages((m) => [...(m ?? []), j.message!]);
    setText("");
    setNote(`Sent. ${agentFirst ?? "Your agent"} will reply here and by email.`);
  };

  return (
    <div>
      <div className="max-h-[420px] space-y-2.5 overflow-y-auto py-1">
        {messages === null ? (
          <p className="text-[13.5px] text-muted">Loading your messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-muted">No messages yet. Ask {agentFirst ?? "your agent"} anything about your move and they&apos;ll reply here.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.from === "customer" ? "items-end" : "items-start"}`}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] px-4 py-2.5 text-[14.5px] leading-snug ${m.from === "customer" ? "bg-accent-dark text-white" : "bg-panel"}`}
              >
                {m.body}
              </p>
              <span className="mt-1 px-1 text-[11.5px] text-muted">
                {m.from === "agent" ? `${agentFirst ?? "Your agent"} · ` : ""}
                {when(m.at)}
              </span>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-4 flex items-end gap-2 rounded-[22px] border border-line/70 bg-white p-1.5 pl-4"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder={`Write to ${agentFirst ?? "your agent"}...`}
          className="min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug outline-none placeholder:text-muted"
        />
        <button type="submit" disabled={!text.trim() || busy} className="h-10 shrink-0 rounded-full bg-accent-dark px-5 text-[13.5px] font-semibold text-white disabled:opacity-40">
          {busy ? "Sending" : "Send"}
        </button>
      </form>
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
    </div>
  );
}
