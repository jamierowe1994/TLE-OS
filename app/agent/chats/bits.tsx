"use client";

import { useEffect, useRef, useState } from "react";

/** Shared by every Chats screen: the time words, a face, the bubbles and the box. */

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function Face({ name, tone = "pink", size = 48, photo }: { name: string; tone?: "pink" | "sage" | "coral"; size?: number; photo?: string | null }) {
  const bg = tone === "sage" ? "var(--m-green-wash)" : tone === "coral" ? "var(--m-coral)" : "var(--m-pink-wash)";
  const ink = tone === "sage" ? "var(--m-sage-ink)" : tone === "coral" ? "#fff" : "var(--m-coral)";
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold" style={{ width: size, height: size, background: bg, color: ink, fontSize: size * 0.32 }}>
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export interface Bubble {
  id: string;
  mine: boolean;
  body: string;
  at: string;
  /** Shown above a bubble from someone else in a group. */
  who?: string;
  /** Extra line under it: "Question · 3 answers". */
  foot?: React.ReactNode;
  onTap?: () => void;
}

/** The conversation, oldest at the top, scrolled to the newest. */
export function Bubbles({ items, empty }: { items: Bubble[]; empty: string }) {
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items.length]);
  if (!items.length) return <p className="py-10 text-center text-[14.5px] text-muted">{empty}</p>;
  return (
    <ol className="flex flex-col gap-2 pb-28 pt-2">
      {items.map((b, i) => {
        const prev = items[i - 1];
        const showWho = !b.mine && b.who && (!prev || prev.who !== b.who || prev.mine);
        return (
          <li key={b.id} className={`flex flex-col ${b.mine ? "items-end" : "items-start"}`}>
            {showWho && <span className="mb-1 ml-3 mt-2 text-[12.5px] font-semibold text-muted">{b.who}</span>}
            <button
              type="button"
              onClick={b.onTap}
              disabled={!b.onTap}
              className="max-w-[82%] whitespace-pre-wrap break-words rounded-[22px] px-4 py-2.5 text-left text-[15.5px] leading-snug disabled:cursor-default"
              style={
                b.mine
                  ? { background: "var(--m-coral)", color: "#fff", borderBottomRightRadius: 8 }
                  : { background: "var(--m-card)", borderBottomLeftRadius: 8 }
              }
            >
              {b.body}
              {b.foot && <span className={`mt-1.5 block text-[12.5px] font-semibold ${b.mine ? "text-white/85" : ""}`} style={b.mine ? undefined : { color: "var(--m-coral)" }}>{b.foot}</span>}
            </button>
            <span className={`mt-1 text-[11.5px] text-muted ${b.mine ? "mr-2" : "ml-3"}`}>{when(b.at)}</span>
          </li>
        );
      })}
      <div ref={end} />
    </ol>
  );
}

/** The box above the tab bar, as Steve's. Enter sends; shift-enter is a new line. */
export function Composer({ placeholder, onSend, extra }: { placeholder: string; onSend: (text: string) => Promise<boolean>; extra?: React.ReactNode }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onSend(t);
    setBusy(false);
    if (ok) setText("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+63px)] z-30 px-4 pb-2 pt-3"
      style={{ background: "linear-gradient(to top, var(--m-bg) 72%, transparent)" }}
    >
      {extra && <div className="mx-auto mb-2 max-w-[560px]">{extra}</div>}
      <div className="mx-auto flex max-w-[560px] items-end gap-2 rounded-[26px] border p-1.5 pl-4" style={{ background: "var(--m-card)", borderColor: "var(--m-line)" }}>
        <textarea
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
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-snug outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Send"
          className="m-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-35"
          style={{ background: "var(--m-coral)" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
          </svg>
        </button>
      </div>
    </form>
  );
}

/** The bar at the top of a conversation: back, who, and what it is about. */
export function ChatHead({ back, title, line, right }: { back: string; title: string; line?: string; right?: React.ReactNode }) {
  return (
    <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 flex items-center gap-3 px-4 pb-3 pt-1" style={{ background: "var(--m-bg)" }}>
      <a href={back} aria-label="Back" className="m-round m-press shrink-0">
        <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      <span className="min-w-0 flex-1">
        <span className="m-title block truncate text-[20px] leading-tight">{title}</span>
        {line && <span className="block truncate text-[13px] text-muted">{line}</span>}
      </span>
      {right}
    </div>
  );
}
