"use client";

import { useEffect, useState } from "react";
import { ErrorLine, Spinner, dialable, whatsappHref, WhatsAppIcon } from "../bits";
import { Bubbles, ChatHead, Composer, type Bubble } from "./bits";

/**
 * One customer conversation (3 Oct 2026): a landlord on their property file,
 * or a tenant in their portal. The agent replies here; the server stores it
 * and emails it to them with a link back into the conversation.
 */

type Msg = { id: string; from: "customer" | "agent"; body: string; at: string };

export default function CustomerThread({ kind, id }: { kind: "landlord" | "tenant"; id: string }) {
  const [t, setT] = useState<{ title: string; about: string; phone: string | null; email: string | null; messages: Msg[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const url = `/api/m/chats/${kind}/${encodeURIComponent(id)}`;

  const load = () =>
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; title?: string; about?: string; phone?: string | null; email?: string | null; messages?: Msg[] }) => {
        if (!j.ok) throw new Error(j.error ?? "The conversation did not load.");
        setT({ title: j.title ?? "", about: j.about ?? "", phone: j.phone ?? null, email: j.email ?? null, messages: j.messages ?? [] });
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const send = async (text: string) => {
    setNote(null);
    const j = (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Nothing was sent." }))) as { ok?: boolean; error?: string; message?: Msg; emailed?: boolean };
    if (!j.ok || !j.message) {
      setNote(j.error ?? "That did not send.");
      return false;
    }
    setT((x) => (x ? { ...x, messages: [...x.messages, j.message!] } : x));
    if (!j.emailed) setNote("Saved here. The email to them did not go - they will see it when they next open their portal.");
    return true;
  };

  const first = (t?.title ?? "").split(/\s+/)[0] || "them";
  const tel = dialable(t?.phone ?? "");
  const items: Bubble[] = (t?.messages ?? []).map((m) => ({ id: m.id, mine: m.from === "agent", body: m.body, at: m.at }));

  return (
    <main>
      <ChatHead
        back="/agent/chats"
        title={t?.title ?? (kind === "landlord" ? "Landlord" : "Tenant")}
        line={t ? (kind === "landlord" ? t.about : "From the tenant portal") : undefined}
        right={
          t && (
            <span className="flex shrink-0 gap-2">
              {whatsappHref(t.phone ?? "") && (
                <a href={whatsappHref(t.phone ?? "")!} aria-label={`WhatsApp ${first}`} className="m-round m-press">
                  <WhatsAppIcon size={18} />
                </a>
              )}
              {tel && (
                <a href={`tel:${tel}`} aria-label={`Call ${first}`} className="m-round m-press">
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                  </svg>
                </a>
              )}
            </span>
          )
        }
      />
      {error ? (
        <ErrorLine text={error} />
      ) : !t ? (
        <Spinner label="Opening the conversation" className="py-8" />
      ) : (
        <>
          <Bubbles items={items} empty={`Nothing yet. Say hello to ${first}.`} />
          <Composer
            placeholder={`Reply to ${first}...`}
            onSend={send}
            extra={note ? <p className="rounded-[14px] px-3 py-2 text-[13px]" style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}>{note}</p> : undefined}
          />
        </>
      )}
    </main>
  );
}
