"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorLine, Sheet, Spinner } from "../../../bits";
import { Bubbles, ChatHead, Composer, Face, type Bubble } from "../../bits";

/**
 * A room of the team's chat (3 Oct 2026).
 *
 *   General   everybody's. Tick "Ask as a question" and the post becomes a
 *             question others answer in its own thread (?thread=<id>), the
 *             forum half James asked for.
 *   Huddle    the people you picked. The member count opens who is in it,
 *             Invite more (from Find Your Local Agents) and Leave.
 */

type Msg = { id: string; authorId: string; author: string; body: string; question: boolean; at: string; replies: number };

export default function PhoneRoom() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const router = useRouter();
  const [thread, setThread] = useState<string | null>(null);
  const [data, setData] = useState<{ room: { id: string; kind: "general" | "huddle"; name: string }; me: string; messages: Msg[]; members: Array<{ id: string; name: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asQuestion, setAsQuestion] = useState(false);
  const [people, setPeople] = useState(false);

  useEffect(() => {
    setThread(new URLSearchParams(window.location.search).get("thread"));
  }, []);

  const url = `/api/m/rooms/${encodeURIComponent(id)}${thread ? `?thread=${encodeURIComponent(thread)}` : ""}`;
  const load = () =>
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; room?: { id: string; kind: "general" | "huddle"; name: string }; me?: string; messages?: Msg[]; members?: Array<{ id: string; name: string }> }) => {
        if (!j.ok || !j.room) throw new Error(j.error ?? "The chat did not load.");
        setData({ room: j.room, me: j.me ?? "", messages: j.messages ?? [], members: j.members ?? [] });
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    setData(null);
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const open = (q: string | null) => {
    setThread(q);
    window.history.pushState(null, "", q ? `?thread=${encodeURIComponent(q)}` : window.location.pathname);
  };
  useEffect(() => {
    const onPop = () => setThread(new URLSearchParams(window.location.search).get("thread"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const send = async (text: string) => {
    const j = (await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, question: !thread && asQuestion, replyTo: thread }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false }))) as { ok?: boolean; message?: Msg };
    if (!j.ok || !j.message) return false;
    setData((d) => (d ? { ...d, messages: [...d.messages, j.message!] } : d));
    setAsQuestion(false);
    return true;
  };

  const leave = async () => {
    await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    router.push("/agent/chats?half=play");
  };

  const general = data?.room.kind === "general";
  const question = thread ? data?.messages.find((m) => m.id === thread) : null;
  const items: Bubble[] = (data?.messages ?? []).map((m) => ({
    id: m.id,
    mine: m.authorId === data?.me,
    who: m.author,
    body: m.body,
    at: m.at,
    foot: m.question && !thread ? `Question · ${m.replies ? `${m.replies} ${m.replies === 1 ? "answer" : "answers"}` : "Answer it"}` : undefined,
    onTap: m.question && !thread ? () => open(m.id) : undefined,
  }));

  return (
    <main>
      <ChatHead
        back={thread ? `/agent/chats/room/${encodeURIComponent(id)}` : "/agent/chats?half=play"}
        title={thread ? "Question" : data?.room.name ?? "Chat"}
        line={thread ? question?.author : general ? "Open to everyone" : data ? `${data.members.length} people` : undefined}
        right={
          data && !general && !thread ? (
            <button type="button" onClick={() => setPeople(true)} aria-label="Who is in it" className="m-round m-press">
              <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2" />
              </svg>
            </button>
          ) : undefined
        }
      />

      {error ? (
        <ErrorLine text={error} />
      ) : !data ? (
        <Spinner label="Opening the chat" className="py-8" />
      ) : (
        <>
          <Bubbles items={items} empty={general ? "Nobody has said anything yet. Start it off." : "Say hello to your huddle."} />
          <Composer
            placeholder={thread ? "Write an answer..." : general ? "Say something to everyone..." : "Message the huddle..."}
            onSend={send}
            extra={
              general && !thread ? (
                <button
                  type="button"
                  onClick={() => setAsQuestion((x) => !x)}
                  aria-pressed={asQuestion}
                  className="flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium shadow-[0_6px_16px_-10px_rgba(80,50,40,0.5)]"
                  style={asQuestion ? { background: "var(--m-coral)", color: "#fff" } : { background: "var(--m-card)" }}
                >
                  <span className="text-[15px] leading-none">?</span> Ask as a Question
                </button>
              ) : undefined
            }
          />
        </>
      )}

      {people && data && (
        <Sheet label="Who is in it" onClose={() => setPeople(false)}>
          <h2 className="m-title mb-3 px-1 text-[24px]">{data.room.name}</h2>
          <ul className="m-group">
            {data.members.map((m) => (
              <li key={m.id} className="m-row flex items-center gap-3 px-4 py-3">
                <Face name={m.name} size={38} />
                <span className="text-[15.5px] font-medium">{m.name}</span>
              </li>
            ))}
          </ul>
          <Link href={`/agent/chats/team?invite=${encodeURIComponent(id)}`} className="m-btn m-btn-primary m-press mt-4 w-full">
            Invite More People
          </Link>
          <button type="button" onClick={leave} className="m-btn m-press mt-2.5 w-full" style={{ color: "var(--accent-dark)" }}>
            Leave the Huddle
          </button>
        </Sheet>
      )}
    </main>
  );
}
