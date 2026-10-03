"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorLine, HomeHero, Spinner, TopBar } from "../bits";
import { Face, ago } from "./bits";

/**
 * CHATS (James, 3 Oct 2026): "half social media, half social app, half TLE
 * OS". Two halves:
 *
 *   Work  every conversation a landlord or tenant started through their
 *         portal - the agent's own, newest first, unread on top of the count
 *   Play  General (open to everybody, ask a question and others answer),
 *         huddles (small groups you start), and Find Your Local Agents
 */

type Thread = {
  key: string;
  kind: "landlord" | "tenant";
  name: string;
  about: string;
  last: { body: string; from: "customer" | "agent"; at: string };
  unread: number;
};
type Room = { id: string; kind: "general" | "huddle"; name: string; members: number; last: { body: string; who: string; at: string } | null; unread: number };

type Half = "work" | "play";

export default function PhoneChats() {
  const [half, setHalf] = useState<Half>("work");
  const [data, setData] = useState<{ work: Thread[]; rooms: Room[]; unread: { work: number; play: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetch("/api/m/chats", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; work?: Thread[]; rooms?: Room[]; unread?: { work: number; play: number } }) => {
        if (!j.ok) throw new Error(j.error ?? "Your chats did not load.");
        setData({ work: j.work ?? [], rooms: j.rooms ?? [], unread: j.unread ?? { work: 0, play: 0 } });
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("half") === "play") setHalf("play");
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const pick = (h: Half) => {
    setHalf(h);
    window.history.replaceState(null, "", h === "play" ? "/agent/chats?half=play" : "/agent/chats");
  };

  const general = data?.rooms.find((r) => r.kind === "general") ?? null;
  const huddles = data?.rooms.filter((r) => r.kind === "huddle") ?? [];

  return (
    <main>
      <TopBar />

      {/* The curved crescent for Chats (James, 3 Oct 2026). */}

      <HomeHero title="Chats" line="Your landlords, your tenants and your team." src="/illustrations/app/crescent.webp" height={196} right={-22} bottom={14} />

      <div className="relative z-[1] -mt-5 grid grid-cols-2 gap-1 rounded-full p-1 shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]" style={{ background: "var(--m-card)" }}>
        {(["work", "play"] as const).map((h) => {
          const n = data ? data.unread[h] : 0;
          return (
            <button
              key={h}
              type="button"
              onClick={() => pick(h)}
              aria-pressed={half === h}
              className="flex h-12 items-center justify-center gap-2 rounded-full text-[15.5px] font-medium transition-colors"
              style={half === h ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : undefined}
            >
              {h === "work" ? "Work" : "Play"}
              {n > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold text-white" style={{ background: "var(--m-coral)" }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorLine text={error} onRetry={load} />
        </div>
      ) : !data ? (
        <Spinner label="Loading your chats" className="py-8" />
      ) : half === "work" ? (
        <Work threads={data.work} />
      ) : (
        <Play general={general} huddles={huddles} />
      )}
    </main>
  );
}

function Work({ threads }: { threads: Thread[] }) {
  if (!threads.length) {
    return (
      <div className="mt-4 flex flex-col items-center rounded-[22px] px-6 py-8 text-center" style={{ background: "var(--m-card)" }}>
        <img src="/illustrations/notioly/inbox.svg" alt="" className="m-ill h-[110px] w-auto" />
        <p className="mt-2 text-[16px] font-medium">No Messages Yet</p>
        <p className="mt-1 text-[14px] text-muted">When a landlord or tenant writes through their portal, it lands here.</p>
      </div>
    );
  }
  return (
    <>
      <p className="mb-2 mt-5 px-1 text-[15px] font-medium">{threads.length} {threads.length === 1 ? "Conversation" : "Conversations"}</p>
      <ul className="grid grid-cols-1 gap-2.5">
        {threads.map((t) => {
          const [kind, id] = t.key.split(":");
          return (
            <li key={t.key}>
              <Link href={`/agent/chats/${kind}/${encodeURIComponent(id!)}`} className="m-press flex items-center gap-3 rounded-[22px] px-4 py-3.5" style={{ background: "var(--m-card)" }}>
                <Face name={t.name} tone={t.kind === "landlord" ? "pink" : "sage"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[16px] ${t.unread ? "font-bold" : "font-semibold"}`}>{t.name}</span>
                    <span className="shrink-0 rounded-full px-2 py-[2px] text-[11.5px] font-medium" style={t.kind === "landlord" ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : { background: "var(--m-green-wash)", color: "var(--m-sage-ink)" }}>
                      {t.kind === "landlord" ? "Landlord" : "Tenant"}
                    </span>
                    <span className="ml-auto shrink-0 text-[12px] text-muted">{ago(t.last.at)}</span>
                  </span>
                  {t.about && t.kind === "landlord" && <span className="block truncate text-[12.5px] text-muted">{t.about}</span>}
                  <span className={`mt-0.5 flex items-center gap-2 text-[14px] ${t.unread ? "font-medium" : "text-muted"}`}>
                    <span className="min-w-0 flex-1 truncate">
                      {t.last.from === "agent" ? "You: " : ""}
                      {t.last.body}
                    </span>
                    {t.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold text-white" style={{ background: "var(--m-coral)" }}>
                        {t.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Play({ general, huddles }: { general: Room | null; huddles: Room[] }) {
  return (
    <>
      {/* General: the one room everybody is in. */}
      <Link
        href="/agent/chats/room/general"
        className="m-press relative mt-5 block overflow-hidden rounded-[26px] p-5"
        style={{ background: "linear-gradient(160deg, #f2b496 0%, #e98a76 100%)", color: "#fff" }}
      >
        <span aria-hidden className="absolute -right-8 -top-8 h-36 w-36 rounded-full" style={{ border: "1.5px solid rgba(255,255,255,0.45)" }} />
        <span aria-hidden className="absolute -right-2 top-6 h-24 w-24 rounded-full" style={{ border: "1.5px solid rgba(255,255,255,0.35)" }} />
        <span className="relative flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/85">
          Open to Everyone
          {general && general.unread > 0 && <span className="rounded-full bg-white px-2 py-[1px] text-[11.5px] font-bold" style={{ color: "var(--m-coral)" }}>{general.unread} new</span>}
        </span>
        <span className="m-title relative mt-1 block text-[28px]">General</span>
        <span className="relative mt-1 block text-[14.5px] text-white/90">
          {general?.last ? `${general.last.who.split(" ")[0]}: ${general.last.body}` : "Ask a question, share a win, help each other out."}
        </span>
      </Link>

      <div className="mb-2 mt-6 flex items-center justify-between px-1">
        <p className="text-[15px] font-medium">Your Huddles</p>
        <Link href="/agent/chats/team?start=1" className="text-[14px] font-semibold" style={{ color: "var(--m-coral)" }}>
          + Start a Huddle
        </Link>
      </div>
      {huddles.length ? (
        <ul className="grid grid-cols-1 gap-2.5">
          {huddles.map((r) => (
            <li key={r.id}>
              <Link href={`/agent/chats/room/${encodeURIComponent(r.id)}`} className="m-press flex items-center gap-3 rounded-[22px] px-4 py-3.5" style={{ background: "var(--m-card)" }}>
                <Face name={r.name} tone="sage" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[16px] ${r.unread ? "font-bold" : "font-semibold"}`}>{r.name}</span>
                    {r.last && <span className="ml-auto shrink-0 text-[12px] text-muted">{ago(r.last.at)}</span>}
                  </span>
                  <span className={`mt-0.5 flex items-center gap-2 text-[14px] ${r.unread ? "font-medium" : "text-muted"}`}>
                    <span className="min-w-0 flex-1 truncate">{r.last ? `${r.last.who.split(" ")[0]}: ${r.last.body}` : `${r.members} people · say hello`}</span>
                    {r.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold text-white" style={{ background: "var(--m-coral)" }}>
                        {r.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[22px] px-4 py-4 text-[14px] text-muted" style={{ background: "var(--m-card)" }}>
          No huddles yet. Start one with the agents near you.
        </p>
      )}

      {/* Find Your Local Agents */}
      <Link href="/agent/chats/team" className="m-press mt-4 flex items-center gap-3.5 rounded-[22px] px-4 py-4" style={{ background: "var(--m-green-wash)" }}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-card)", color: "var(--m-sage-ink)" }}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="m-title block text-[18px]">Find Your Local Agents</span>
          <span className="block text-[13.5px]" style={{ color: "var(--m-sage-ink)" }}>The team nearest your patch, to chat or huddle with.</span>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </>
  );
}
