"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import LineIcon from "@/components/LineIcon";
import { searchMatches } from "@/lib/search-match";

/**
 * HUDDLES in the OS (Susan via James, 12 Oct 2026): the team chat from the
 * phone app's Chats > Play, on the desktop, under Dashboard on the sidebar.
 * The same rooms and the same messages - lib/chats and /api/m/rooms - so a
 * post on the phone is here on the next read, and the other way round.
 *
 *   General   everybody's. Tick "Ask as a Question" and the post becomes a
 *             question others answer in its own thread.
 *   Huddles   small groups you start with the colleagues you pick (nearest
 *             first by the patch each set on the phone); invite more, or leave.
 *
 * Wide, the rooms are a column on the left and the open one fills the rest;
 * on a phone-width window it is one or the other, with a back arrow.
 * ?room=<id> and ?thread=<id> keep your place on a refresh.
 */

type Room = { id: string; kind: "general" | "huddle"; name: string; members: number; last: { body: string; who: string; at: string } | null; unread: number };
type Msg = { id: string; authorId: string; author: string; body: string; question: boolean; at: string; replies: number };
type Open = { room: { id: string; kind: "general" | "huddle"; name: string }; me: string; messages: Msg[]; members: Array<{ id: string; name: string }> };
type Person = { id: string; name: string; photo: string | null; town: string | null; miles: number | null };

const GENERAL = "general";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const dayOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const first = (name: string) => name.split(" ")[0] ?? name;
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function Face({ name, size = 36, tone = "pink", photo }: { name: string; size?: number; tone?: "pink" | "sage"; photo?: string | null }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${tone === "sage" ? "bg-sage/35 text-brown" : "bg-accent-soft text-accent-dark"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-[12.5px] text-muted">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </div>
  );
}

function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-dark px-1.5 text-[11px] font-semibold text-white">{n > 99 ? "99+" : n}</span>;
}

const readUrl = () => {
  const sp = new URLSearchParams(window.location.search);
  return { room: sp.get("room"), thread: sp.get("thread") };
};

export default function Huddles() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string>(GENERAL);
  const [thread, setThread] = useState<string | null>(null);
  /* On a narrow window: the list, or the open room. */
  const [showRoom, setShowRoom] = useState(false);
  const [picker, setPicker] = useState<null | { invite: string | null }>(null);

  /* The chat fills the window below the header, so the box you type in is
     always on screen; measured, because the header's height varies by width. */
  const frame = useRef<HTMLDivElement | null>(null);
  const [frameH, setFrameH] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = frame.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFrameH(Math.max(460, Math.round(window.innerHeight - top - 28)));
    };
    fit();
    const t = window.setTimeout(fit, 700);
    window.addEventListener("resize", fit);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", fit);
    };
  }, []);

  const loadRooms = useCallback(() => {
    fetch("/api/m/rooms", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; rooms?: Room[] }) => {
        if (!j.ok) throw new Error(j.error ?? "Your huddles did not load.");
        setRooms(j.rooms ?? []);
        setListError(null);
      })
      .catch((e: Error) => setListError(e.message));
  }, []);

  useEffect(() => {
    const u = readUrl();
    if (u.room) {
      setRoomId(u.room);
      setShowRoom(true);
    }
    setThread(u.thread);
    loadRooms();
    const t = window.setInterval(loadRooms, 30_000);
    const onPop = () => {
      const p = readUrl();
      setRoomId(p.room ?? GENERAL);
      setThread(p.thread);
      setShowRoom(Boolean(p.room));
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("popstate", onPop);
    };
  }, [loadRooms]);

  const go = (room: string, q: string | null = null) => {
    setRoomId(room);
    setThread(q);
    setShowRoom(true);
    const sp = new URLSearchParams();
    if (room !== GENERAL || q) sp.set("room", room);
    if (q) sp.set("thread", q);
    const qs = sp.toString();
    window.history.pushState(null, "", qs ? `/huddles?${qs}` : "/huddles");
  };

  const general = rooms?.find((r) => r.kind === "general") ?? null;
  const huddles = rooms?.filter((r) => r.kind === "huddle") ?? [];

  return (
    <>
      <PageHeader
        title="Huddles"
        blurb="Talk to the team. General is open to everyone; a huddle is the people you pick. The same chats as Chats on the TLE OS app."
        illustration="/illustrations/app/crescent.webp"
        hideArtOnPhone
        illustrationHeight={150}
      />

      <div ref={frame} style={{ height: frameH ?? 560 }} className="fade-up mt-5 flex overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-card">
        {/* The rooms. */}
        <aside className={`${showRoom ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-line/70 md:w-[300px] md:border-r`}>
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
            <h2 className="font-heading text-[15px] text-ink">Your Chats</h2>
            <button
              type="button"
              onClick={() => setPicker({ invite: null })}
              className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] font-semibold text-page transition-opacity hover:opacity-85"
            >
              <span className="text-[15px] leading-none">+</span> Start a Huddle
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {listError && !rooms ? (
              <div className="m-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">
                {listError}{" "}
                <button type="button" onClick={loadRooms} className="font-semibold underline">
                  Try again
                </button>
              </div>
            ) : !rooms ? (
              <Spinner label="Loading your huddles" />
            ) : (
              <>
                <RoomRow
                  active={roomId === GENERAL}
                  onClick={() => go(GENERAL)}
                  face={
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-dark text-white">
                      <LineIcon name="message" size={18} />
                    </span>
                  }
                  name="General"
                  line={general?.last ? `${first(general.last.who)}: ${general.last.body}` : "Open to everyone"}
                  at={general?.last?.at ?? null}
                  unread={general?.unread ?? 0}
                />
                <p className="mb-1 mt-4 px-2 text-[11.5px] font-medium text-muted">Huddles</p>
                {huddles.length ? (
                  huddles.map((r) => (
                    <RoomRow
                      key={r.id}
                      active={roomId === r.id}
                      onClick={() => go(r.id)}
                      face={<Face name={r.name} size={40} tone="sage" />}
                      name={r.name}
                      line={r.last ? `${first(r.last.who)}: ${r.last.body}` : `${r.members} people · say hello`}
                      at={r.last?.at ?? null}
                      unread={r.unread}
                    />
                  ))
                ) : (
                  <p className="mx-2 rounded-xl bg-panel px-3 py-3 text-[12.5px] leading-snug text-muted">No huddles yet. Start one with the agents near you.</p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* The open room. */}
        <section className={`${showRoom ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          <RoomPane
            key={`${roomId}|${thread ?? ""}`}
            id={roomId}
            thread={thread}
            onBack={() => (thread ? go(roomId) : (setShowRoom(false), window.history.pushState(null, "", "/huddles")))}
            onOpenThread={(q) => go(roomId, q)}
            onSent={loadRooms}
            onInvite={() => setPicker({ invite: roomId })}
            onLeft={() => {
              loadRooms();
              go(GENERAL);
              setShowRoom(false);
            }}
          />
        </section>
      </div>

      {picker && (
        <PeoplePicker
          invite={picker.invite}
          onClose={() => setPicker(null)}
          onDone={(id) => {
            setPicker(null);
            loadRooms();
            go(id);
          }}
        />
      )}
    </>
  );
}

function RoomRow({ active, onClick, face, name, line, at, unread }: { active: boolean; onClick: () => void; face: React.ReactNode; name: string; line: string; at: string | null; unread: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${active ? "bg-[var(--launch-active,#f1f1f0)]" : "hover:bg-panel"}`}
    >
      {face}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`truncate text-[13.5px] text-ink ${unread ? "font-semibold" : "font-medium"}`}>{name}</span>
          {at && <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(at)}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "text-ink" : "text-muted"}`}>{line}</span>
          <Count n={unread} />
        </span>
      </span>
    </button>
  );
}

function RoomPane({
  id,
  thread,
  onBack,
  onOpenThread,
  onSent,
  onInvite,
  onLeft,
}: {
  id: string;
  thread: string | null;
  onBack: () => void;
  onOpenThread: (q: string) => void;
  onSent: () => void;
  onInvite: () => void;
  onLeft: () => void;
}) {
  const [data, setData] = useState<Open | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState(false);

  const url = `/api/m/rooms/${encodeURIComponent(id)}${thread ? `?thread=${encodeURIComponent(thread)}` : ""}`;
  const load = useCallback(
    () =>
      fetch(url, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; error?: string } & Partial<Open>) => {
          if (!j.ok || !j.room) throw new Error(j.error ?? "The chat did not load.");
          setData({ room: j.room, me: j.me ?? "", messages: j.messages ?? [], members: j.members ?? [] });
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [url]
  );

  useEffect(() => {
    void load().then(onSent);
    const t = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const general = data?.room.kind === "general";
  const question = thread ? data?.messages.find((m) => m.id === thread) ?? null : null;

  const send = async (text: string, asQuestion: boolean): Promise<string | null> => {
    const j = (await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, question: !thread && asQuestion, replyTo: thread }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection. Your message was not sent." }))) as { ok?: boolean; error?: string; message?: Msg };
    if (!j.ok || !j.message) return j.error ?? "Your message was not sent.";
    setData((d) => (d ? { ...d, messages: [...d.messages, j.message!] } : d));
    onSent();
    return null;
  };

  const leave = async () => {
    if (!window.confirm(`Leave ${data?.room.name ?? "this huddle"}? You can be invited back.`)) return;
    await fetch(`/api/m/rooms/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    onLeft();
  };

  const title = thread ? "Question" : (data?.room.name ?? (id === GENERAL ? "General" : "Huddle"));
  const line = thread ? (question ? `Asked by ${question.author}` : "") : general ? "Open to everyone" : data ? `${data.members.length} people` : "";

  return (
    <>
      <header className="relative flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={`${thread ? "flex" : "flex md:hidden"} h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted transition-colors hover:text-ink`}
        >
          <LineIcon name="arrow-left" size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-[16px] text-ink">{title}</h2>
          {line && <p className="truncate text-[12px] text-muted">{line}</p>}
        </div>
        {data && !general && !thread && (
          <button
            type="button"
            onClick={() => setPeople((p) => !p)}
            aria-expanded={people}
            className="flex h-8 items-center gap-1.5 rounded-full border border-line/80 px-3 text-[12px] font-medium text-ink transition-colors hover:bg-panel"
          >
            <LineIcon name="user" size={14} />
            People
          </button>
        )}
        {people && data && (
          <div className="absolute right-4 top-[calc(100%+6px)] z-20 w-[260px] rounded-xl border border-line/70 bg-card p-2 shadow-[0_16px_36px_-16px_rgba(0,0,0,0.35)]">
            <p className="px-2 pb-1 pt-1 text-[11.5px] font-medium text-muted">In this huddle</p>
            <ul className="max-h-[240px] overflow-y-auto">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 px-2 py-1.5">
                  <Face name={m.name} size={26} />
                  <span className="truncate text-[13px] text-ink">{m.name}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1 border-t border-line/60 pt-1.5">
              <button
                type="button"
                onClick={() => {
                  setPeople(false);
                  onInvite();
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-panel"
              >
                Invite More People
              </button>
              <button type="button" onClick={leave} className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-accent-dark hover:bg-panel">
                Leave the Huddle
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-panel/50 px-4" onClick={() => people && setPeople(false)}>
        {error && !data ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              Try again
            </button>
          </div>
        ) : !data ? (
          <Spinner label="Opening the chat" />
        ) : (
          <Bubbles
            messages={data.messages}
            me={data.me}
            inThread={Boolean(thread)}
            onOpenThread={onOpenThread}
            empty={thread ? "No answers yet. Be the first." : general ? "Nobody has said anything yet. Start it off." : "Say hello to your huddle."}
          />
        )}
      </div>

      {data && <Composer key={`${id}|${thread ?? ""}`} placeholder={thread ? "Write an answer..." : general ? "Say something to everyone..." : `Message ${data.room.name}...`} canAsk={general && !thread} onSend={send} />}
    </>
  );
}

function Bubbles({ messages, me, inThread, onOpenThread, empty }: { messages: Msg[]; me: string; inThread: boolean; onOpenThread: (id: string) => void; empty: string }) {
  const end = useRef<HTMLDivElement | null>(null);
  const count = messages.length;
  const firstPaint = useRef(true);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: firstPaint.current ? "auto" : "smooth" });
    firstPaint.current = false;
  }, [count]);

  const rows = useMemo(() => {
    const out: Array<{ day: string } | { msg: Msg; showWho: boolean }> = [];
    let lastDay = "";
    messages.forEach((m, i) => {
      const day = dayOf(m.at);
      if (day !== lastDay) {
        out.push({ day });
        lastDay = day;
      }
      const prev = messages[i - 1];
      const mine = m.authorId === me;
      out.push({ msg: m, showWho: !mine && (!prev || prev.authorId !== m.authorId || dayOf(prev.at) !== day) });
    });
    return out;
  }, [messages, me]);

  if (!messages.length) return <p className="py-16 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ol className="mx-auto flex max-w-[760px] flex-col gap-1.5 py-4">
      {rows.map((r) => {
        if ("day" in r)
          return (
            <li key={`d-${r.day}`} className="my-2 text-center text-[11px] font-medium text-muted">
              {r.day}
            </li>
          );
        const m = r.msg;
        const mine = m.authorId === me;
        const isQuestion = m.question && !inThread;
        const bubble = `max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-[13.5px] leading-snug ${
          mine ? "rounded-br-md bg-accent-dark text-white" : "rounded-bl-md bg-card text-ink shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-line/50"
        }`;
        const foot = isQuestion ? (
          <span className={`mt-1.5 block text-[11.5px] font-semibold ${mine ? "text-white/85" : "text-accent-dark"}`}>
            Question · {m.replies ? `${m.replies} ${m.replies === 1 ? "answer" : "answers"}` : "Answer it"}
          </span>
        ) : null;
        return (
          <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
            {r.showWho && <span className="mb-1 ml-3 mt-2 text-[11.5px] font-medium text-muted">{m.author}</span>}
            {isQuestion ? (
              <button type="button" onClick={() => onOpenThread(m.id)} className={`${bubble} transition-opacity hover:opacity-90`}>
                {m.body}
                {foot}
              </button>
            ) : (
              <div className={bubble}>{m.body}</div>
            )}
            <span className={`mt-0.5 text-[10.5px] text-muted ${mine ? "mr-2" : "ml-3"}`}>{timeOf(m.at)}</span>
          </li>
        );
      })}
      <div ref={end} />
    </ol>
  );
}

/** Enter sends; Shift+Enter is a new line. */
function Composer({ placeholder, canAsk, onSend }: { placeholder: string; canAsk: boolean; onSend: (text: string, asQuestion: boolean) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [asQuestion, setAsQuestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => box.current?.focus(), []);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const problem = await onSend(t, asQuestion);
    setBusy(false);
    if (problem) setErr(problem);
    else {
      setText("");
      setAsQuestion(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      /* Room on the right for Steve's button in the corner, so the two never touch. */
      className="shrink-0 border-t border-line/70 py-3 pl-4 pr-16"
    >
      {err && <p className="mb-2 text-[12px] text-accent-dark">{err}</p>}
      <div className="mx-auto flex max-w-[760px] items-end gap-2 rounded-2xl border border-line/80 bg-page p-1.5 pl-3.5 focus-within:border-ink/40">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-snug text-ink outline-none placeholder:text-muted"
        />
        {canAsk && (
          <button
            type="button"
            onClick={() => setAsQuestion((x) => !x)}
            aria-pressed={asQuestion}
            title="Others answer it in its own thread"
            className={`mb-0.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${asQuestion ? "bg-accent-dark text-white" : "border border-line/80 text-ink hover:bg-panel"}`}
          >
            <span className="text-[13px] leading-none">?</span> Ask as a Question
          </button>
        )}
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Send"
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dark text-white transition-opacity disabled:opacity-30"
        >
          {busy ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}

/**
 * Pick colleagues: to start a huddle (then name it), or to add to one you are
 * in. The team nearest first by the patch each set on the phone; only ever a
 * town for anyone.
 */
function PeoplePicker({ invite, onClose, onDone }: { invite: string | null; onClose: () => void; onDone: (roomId: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [needle, setNeedle] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"pick" | "name">("pick");
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/m/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; people?: Person[] }) => {
        if (!j.ok) throw new Error(j.error ?? "The team did not load.");
        setPeople(j.people ?? []);
      })
      .catch((e: Error) => setError(e.message));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const n = needle.trim();
  const shown = (people ?? []).filter((p) => !n || searchMatches(n, p.name, p.town));
  const near = shown.filter((p) => p.miles != null);
  const rest = shown.filter((p) => p.miles == null);

  const save = async () => {
    setBusy(true);
    setSaveErr(null);
    const r = (await fetch(invite ? `/api/m/rooms/${encodeURIComponent(invite)}/members` : "/api/m/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invite ? { userIds: [...picked] } : { name: name.trim(), userIds: [...picked] }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "No connection." }))) as { ok?: boolean; id?: string; error?: string };
    setBusy(false);
    if (r.ok) onDone(invite ?? r.id!);
    else setSaveErr(r.error ?? "That did not work.");
  };

  const group = (title: string, list: Person[]) =>
    list.length > 0 && (
      <div key={title}>
        <p className="mb-1 mt-3 px-1 text-[11.5px] font-medium text-muted">{title}</p>
        <ul>
          {list.map((p) => {
            const on = picked.has(p.id);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => toggle(p.id)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${on ? "bg-accent-soft/50" : "hover:bg-panel"}`}>
                  <Face name={p.name} photo={p.photo} size={32} tone={p.miles != null ? "sage" : "pink"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-muted">{p.town ? (p.miles != null ? `${p.town} · ${p.miles} mi` : p.town) : "No patch set"}</span>
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line"}`}>
                    {on && (
                      <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-label={invite ? "Invite people" : "Start a huddle"} className="flex max-h-[min(640px,90dvh)] w-full max-w-[440px] flex-col rounded-2xl bg-card shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-[18px] text-ink">{invite ? "Invite People" : step === "name" ? "Name Your Huddle" : "Start a Huddle"}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {step === "name" ? `You and ${picked.size} ${picked.size === 1 ? "other" : "others"}. Something like "Northampton Crew".` : "Tick the people you want. Nearest first, by the patch each set on the app."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink">
            ×
          </button>
        </div>

        {step === "pick" ? (
          <>
            <div className="px-5">
              <label className="flex h-9 items-center gap-2 rounded-full border border-line/80 bg-page px-3">
                <LineIcon name="search" size={14} className="text-muted" />
                <input autoFocus value={needle} onChange={(e) => setNeedle(e.target.value)} type="search" placeholder="Name or town..." className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
              </label>
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto px-4 pb-2">
              {error ? (
                <p className="m-1 mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{error}</p>
              ) : !people ? (
                <Spinner label="Finding the team" />
              ) : (
                <>
                  {group("Nearest You", near)}
                  {group(near.length ? "Everyone Else" : "The Team", rest)}
                  {!shown.length && <p className="py-8 text-center text-[12.5px] text-muted">Nobody matches that.</p>}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="px-5 pb-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && void save()}
              maxLength={60}
              placeholder="Huddle name"
              className="h-10 w-full rounded-xl border border-line/80 bg-page px-3 text-[14px] text-ink outline-none focus:border-ink/40"
            />
          </div>
        )}

        <div className="border-t border-line/60 px-5 py-3">
          {saveErr && <p className="mb-2 text-[12px] text-accent-dark">{saveErr}</p>}
          <div className="flex items-center gap-2">
            {step === "name" && (
              <button type="button" onClick={() => setStep("pick")} className="h-10 rounded-full border border-line/80 px-4 text-[13px] font-medium text-ink hover:bg-panel">
                Back
              </button>
            )}
            <button
              type="button"
              disabled={!picked.size || busy || (step === "name" && !name.trim())}
              onClick={() => (invite || step === "name" ? void save() : setStep("name"))}
              className="h-10 flex-1 rounded-full bg-ink text-[13px] font-semibold text-page transition-opacity disabled:opacity-35"
            >
              {busy
                ? "Saving..."
                : !picked.size
                  ? "Tick the people you want"
                  : invite
                    ? `Add ${picked.size} to the Huddle`
                    : step === "name"
                      ? "Start the Huddle"
                      : `Next: Name It (${picked.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
