"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The side panel on a record (10 Oct 2026): Messages, Notes and Activity.
 *
 * James: it comes out from the right and pushes the record over to make room,
 * rather than covering it; Messages reads like a phone chat - emails and texts
 * as bubbles, ours on the right, theirs on the left - and an email bubble
 * opens to the email itself and its thread. Notes are the agent's own notes on
 * the file. Activity is the record's existing log.
 *
 * The host lays it out (see LeadDrawer, ListingDrawer): on a wide screen it is
 * a column beside the record, on a phone it covers the sheet. This component
 * is only what goes inside the column.
 */

export type PanelTab = "messages" | "notes" | "activity";

export type ConvItem = {
  id: string;
  channel: "email" | "text" | "portal" | "call" | "whatsapp" | "visit";
  direction: "in" | "out" | "event";
  at: string;
  subject: string;
  text: string;
  by: string;
  openable: boolean;
  link?: string | null;
  unread?: boolean;
};

export type NoteRow = { id: string; author: string; when: string; text: string; badge?: string | null };

type FullEmail = {
  subject: string;
  from: string;
  to: string;
  at: string;
  html: string;
  link: string | null;
  thread: { id: string; from: string; at: string; preview: string; current: boolean }[];
};

const dayOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const Spinner = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted">
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
    {label}
  </div>
);

export default function RecordSidePanel({
  name,
  tab,
  onTab,
  onClose,
  conversationUrl,
  noConversation,
  notes,
  onAddNote,
  notePlaceholder,
  noteSaid,
  activity,
}: {
  /** Whose record: "Sophie" or "14 Moor Street". */
  name: string;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  /** Where the conversation is read from; null when there is nobody to have one with. */
  conversationUrl: string | null;
  /** What to say when conversationUrl is null. */
  noConversation?: string;
  notes: NoteRow[] | null;
  onAddNote: (text: string) => Promise<boolean>;
  notePlaceholder?: string;
  /** A line under the note box after a save ("Saved, and in REX too"). */
  noteSaid?: { ok: boolean; text: string } | null;
  /** The record's own activity log; the tab is left off without one. */
  activity?: React.ReactNode;
}) {
  const tabs: { key: PanelTab; label: string; icon: string }[] = [
    { key: "messages", label: "Messages", icon: "message" },
    { key: "notes", label: "Notes", icon: "note" },
    ...(activity ? [{ key: "activity" as const, label: "Activity", icon: "list" }] : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
        <div className="flex min-w-0 gap-1 rounded-full bg-page p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === t.key ? "bg-accent-dark text-white" : "text-muted hover:text-ink"
              }`}
            >
              <DoodleIcon name={t.icon} size={12} />
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close the panel"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "messages" && <Messages name={name} url={conversationUrl} none={noConversation} />}
        {tab === "notes" && <Notes rows={notes} onAdd={onAddNote} placeholder={notePlaceholder} said={noteSaid} name={name} />}
        {tab === "activity" && <div className="h-full overflow-y-auto overscroll-contain px-5 py-4">{activity}</div>}
      </div>
    </div>
  );
}

/* ── Messages ─────────────────────────────────────────────────────────── */

function Messages({ name, url, none }: { name: string; url: string | null; none?: string }) {
  const [state, setState] = useState<{ loading: boolean; items: ConvItem[]; notes: string[]; error: string | null }>({ loading: true, items: [], notes: [], error: null });
  const [open, setOpen] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url) {
      setState({ loading: false, items: [], notes: [], error: null });
      return;
    }
    let gone = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (gone) return;
        if (!r.ok || !j.ok) return setState({ loading: false, items: [], notes: [], error: j.error ?? "The messages couldn't be read just now. Try again in a minute." });
        setState({ loading: false, items: j.items ?? [], notes: j.notes ?? [], error: null });
      })
      .catch(() => !gone && setState({ loading: false, items: [], notes: [], error: "The messages couldn't be read just now. Try again in a minute." }));
    return () => { gone = true; };
  }, [url]);

  /* Newest at the bottom, like a phone: land there. */
  useEffect(() => {
    if (!state.loading) end.current?.scrollIntoView({ block: "end" });
  }, [state.loading, state.items.length]);

  const grouped = useMemo(() => {
    const out: { day: string; items: ConvItem[] }[] = [];
    for (const it of state.items) {
      const d = dayOf(it.at);
      if (!out.length || out[out.length - 1].day !== d) out.push({ day: d, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [state.items]);

  if (open && url) return <EmailView url={url} id={open} onBack={() => setOpen(null)} onOpen={setOpen} />;

  return (
    /* Room at the foot on a phone, so the newest message scrolls clear of Steve. */
    <div className="h-full overflow-y-auto overscroll-contain px-4 pb-24 pt-4 lg:pb-6">
      {!url ? (
        <p className="py-10 text-center text-[12px] leading-relaxed text-muted">{none ?? `No email or mobile for ${name} yet.`}</p>
      ) : state.loading ? (
        <Spinner label="Reading the messages…" />
      ) : state.error ? (
        <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px]">{state.error}</p>
      ) : (
        <>
          {state.notes.map((n) => (
            <p key={n} className="mb-3 rounded-xl bg-page px-3 py-2 text-[11px] leading-snug text-muted">{n}</p>
          ))}
          {!state.items.length ? (
            <p className="py-10 text-center text-[12px] text-muted">No messages with {name} yet. Emails and texts will show here as they go.</p>
          ) : (
            grouped.map((g) => (
              <div key={g.day}>
                <p className="my-3 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted">{g.day}</p>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <Bubble it={it} onOpen={() => setOpen(it.id)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <div ref={end} />
        </>
      )}
    </div>
  );
}

function Bubble({ it, onOpen }: { it: ConvItem; onOpen: () => void }) {
  if (it.direction === "event") {
    return (
      <p className="flex items-center justify-center gap-1.5 py-1 text-center text-[11px] text-muted">
        <DoodleIcon name={it.channel === "whatsapp" ? "message-2" : it.channel === "visit" ? "home" : "call"} size={11} />
        <span className="min-w-0">
          {it.text}
          {it.by ? ` · ${it.by}` : ""} · {timeOf(it.at)}
        </span>
      </p>
    );
  }
  const ours = it.direction === "out";
  const email = it.channel === "email";
  const inner = (
    <>
      {email && (
        <span className={`mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide ${ours ? "text-white/80" : "text-muted"}`}>
          <DoodleIcon name="mail" size={11} />
          Email{it.unread ? " · unread" : ""}
        </span>
      )}
      {email && <span className="block text-[12.5px] font-semibold leading-snug">{it.subject}</span>}
      {it.text && <span className={`block whitespace-pre-line text-[12.5px] leading-snug ${email ? (ours ? "mt-0.5 text-white/85" : "mt-0.5 text-ink/75") : ""}`}>{email ? clip(it.text, 160) : it.text}</span>}
      {email && <span className={`mt-1.5 block text-[10.5px] font-semibold ${ours ? "text-white/90" : "text-accent-dark"}`}>Open the email</span>}
    </>
  );
  return (
    <div className={`flex flex-col ${ours ? "items-end" : "items-start"}`}>
      {email ? (
        <button
          type="button"
          onClick={onOpen}
          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-left transition-opacity hover:opacity-90 ${ours ? "rounded-br-md bg-accent-dark text-white" : "rounded-bl-md bg-[#e9e9eb] text-[#1c1c1e]"}`}
        >
          {inner}
        </button>
      ) : (
        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${ours ? "rounded-br-md bg-accent-dark text-white" : "rounded-bl-md bg-[#e9e9eb] text-[#1c1c1e]"}`}>{inner}</div>
      )}
      <span className="mt-0.5 px-1 text-[10px] text-muted">
        {it.channel === "text" ? "Text" : it.channel === "portal" ? "Portal message" : "Email"}
        {it.by ? ` · ${it.by}` : ""} · {timeOf(it.at)}
      </span>
    </div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function EmailView({ url, id, onBack, onOpen }: { url: string; id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const [state, setState] = useState<{ email: FullEmail | null; error: string | null }>({ email: null, error: null });
  useEffect(() => {
    let gone = false;
    setState({ email: null, error: null });
    fetch(`${url}${url.includes("?") ? "&" : "?"}open=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (gone) return;
        setState(r.ok && j.ok ? { email: j.email, error: null } : { email: null, error: j.error ?? "That email couldn't be opened just now." });
      })
      .catch(() => !gone && setState({ email: null, error: "That email couldn't be opened just now." }));
    return () => { gone = true; };
  }, [url, id]);

  const e = state.email;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line/70 px-4 py-3">
        <button type="button" onClick={onBack} className="text-[11.5px] font-semibold text-accent-dark hover:underline">
          ‹ Back to the messages
        </button>
        {e && (
          <>
            <h3 className="mt-2 text-[15px] leading-snug">{e.subject}</h3>
            <p className="mt-1 text-[11px] text-muted">
              From {e.from}
              {e.to ? ` to ${e.to}` : ""} · {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
            {e.link && (
              <a href={e.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-muted underline underline-offset-2 hover:text-ink">
                Open in Outlook to reply
              </a>
            )}
          </>
        )}
      </div>
      {state.error ? (
        <p className="m-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px]">{state.error}</p>
      ) : !e ? (
        <Spinner label="Opening the email…" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {e.thread.length > 1 && (
            <div className="border-b border-line/70 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">The thread · {e.thread.length} emails</p>
              <ul className="mt-2 space-y-1">
                {e.thread.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={t.current}
                      onClick={() => onOpen(t.id)}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11.5px] ${t.current ? "bg-accent-soft/50" : "hover:bg-page"}`}
                    >
                      <span className="font-semibold">{t.from}</span>
                      <span className="text-muted"> · {new Date(t.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      <span className="block truncate text-muted">{t.preview}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* The email itself, in a sandbox: its HTML is somebody else's, so
              no script runs and no link can reach this page. */}
          <iframe title={e.subject} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#2b2b2b;margin:16px;word-wrap:break-word}img{max-width:100%;height:auto}</style>${e.html}`} className="h-[70vh] w-full border-0 bg-white" />
        </div>
      )}
    </div>
  );
}

/* ── Notes ────────────────────────────────────────────────────────────── */

function Notes({ rows, onAdd, placeholder, said, name }: { rows: NoteRow[] | null; onAdd: (t: string) => Promise<boolean>; placeholder?: string; said?: { ok: boolean; text: string } | null; name: string }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function save() {
    const t = draft.trim();
    if (!t || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onAdd(t).catch(() => false);
    setBusy(false);
    if (ok) setDraft("");
    else setFailed(true);
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line/70 p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          }}
          rows={3}
          placeholder={placeholder ?? "Add a note - what was said, what to remember…"}
          className="w-full resize-y rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[12.5px] leading-relaxed outline-none focus:border-ink/40"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className={`text-[11px] leading-snug ${failed || (said && !said.ok) ? "text-accent-dark" : "text-muted"}`} aria-live="polite">
            {failed ? "That note didn't save. Try again." : said?.text ?? ""}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!draft.trim() || busy}
            className="shrink-0 rounded-full bg-accent-dark px-4 py-1.5 text-[11.5px] font-semibold text-white transition-opacity disabled:opacity-30"
          >
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {rows === null ? (
          <Spinner label="Loading the notes…" />
        ) : !rows.length ? (
          <p className="py-8 text-center text-[12px] text-muted">No notes on {name} yet - yours will be the first.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((n) => (
              <li key={n.id} className="rounded-xl bg-panel p-3.5">
                <p className="whitespace-pre-line text-[12.5px] leading-relaxed">{n.text}</p>
                <p className="mt-2 text-[10.5px] text-muted">
                  {n.author} · {n.when}
                  {n.badge && <span className="ml-1.5 rounded-full bg-sage/40 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink/70">{n.badge}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
