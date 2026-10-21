"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * EMAILS ON A PLC (lib/mail-threads, 21 Oct 2026).
 *
 * PlcEmails     the pack's own section: every thread the OS started or that
 *               somebody linked, each message as it was logged, Link an Email
 *               (one of your own Outlook conversations about the home), and
 *               Check Now for when five minutes is too long to wait.
 * ThreadView    one thread, full screen over the home's page, opened from its
 *               latest activity.
 */

export type Msg = {
  id: string; fromName: string; fromEmail: string; to: { name: string; email: string }[]; cc: { name: string; email: string }[];
  subject: string; preview: string; text: string; at: string; direction: "in" | "out"; ours: boolean; hasAttachments: boolean;
};
export type Thread = {
  id: string; caseId: string | null; address: string; subject: string; startedHow: "os" | "linked"; startedWhat: string; startedBy: string;
  mailbox: string; mailboxUserId: string; createdAt: string; lastPolledAt: string | null; note: string | null; stopped: boolean; waiting: boolean;
  messages: Msg[];
};
type Candidate = { conversationId: string; subject: string; from: string; at: string; preview: string; count: number; linked: boolean };

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const people = (l: { name: string; email: string }[]) => l.map((a) => a.name || a.email).join(", ");

function Spinner({ label }: { label: string }) {
  return <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />{label}</p>;
}

/* Where a reply's quoted history starts: Outlook's "From: … Sent:" block, Gmail's "On … wrote:", a line of underscores, or "> " lines. */
const QUOTE = /^(From: .+\n(?:.*\n){0,2}?Sent: |On .{6,200} wrote:\s*$|-{2,}\s*Original Message\s*-{2,}|_{10,}|>)/im;
function splitQuoted(text: string): [string, string] {
  const t = text.replace(/\r\n/g, "\n").trim();
  const m = QUOTE.exec(t);
  return m && m.index > 0 ? [t.slice(0, m.index).trim(), t.slice(m.index).trim()] : [t, ""];
}

/* The preview is one line, so its quoted part starts mid-line. */
export const oneLine = (preview: string) => preview.replace(/\s(From: .{0,200}?Sent: |On .{6,160}? wrote:|-{2,}\s*Original Message|_{10,}|>\s?).*$/i, "").trim().slice(0, 220);

function MessageRow({ m }: { m: Msg }) {
  const [open, setOpen] = useState(false);
  const [quoted, setQuoted] = useState(false);
  const [fresh, earlier] = splitQuoted(m.text || m.preview);
  return (
    <li className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] ${m.ours ? "border-line/50 bg-page" : "border-line/70 bg-white"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="block w-full text-left">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 break-words">
            <strong className="font-semibold">{m.fromName || m.fromEmail}</strong>
            {m.ours ? <span className="ml-1.5 rounded-full bg-box px-2 py-0.5 text-[10.5px] text-muted">Our team</span> : null}
            {m.hasAttachments ? <DoodleIcon name="folder" size={11} className="ml-1.5 inline-block text-muted" /> : null}
          </span>
          <span className="shrink-0 text-[11.5px] text-muted">{when(m.at)}</span>
        </span>
        <span className="mt-0.5 block text-[11.5px] text-muted">To {people(m.to) || "nobody named"}{m.cc.length ? `, copied to ${people(m.cc)}` : ""}</span>
        {!open && <span className="mt-1 block text-ink/80">{oneLine(m.preview) || "(no words)"}</span>}
      </button>
      {open && (
        <div className="mt-2">
          <p className="text-[11.5px] text-muted">{m.subject}</p>
          <p className="mt-1 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">{fresh || m.preview}</p>
          {earlier && (
            <>
              <button type="button" onClick={() => setQuoted((q) => !q)} className="mt-1.5 text-[11.5px] font-semibold text-accent-dark underline-offset-2 hover:underline">
                {quoted ? "Hide the earlier emails" : "Show the earlier emails quoted in it"}
              </button>
              {quoted && <p className="mt-1 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-line pl-3 text-[12px] text-muted">{earlier}</p>}
            </>
          )}
          {m.hasAttachments && <p className="mt-1.5 text-[11.5px] text-muted">It had attachments. They stay in Outlook and aren&apos;t copied here.</p>}
        </div>
      )}
    </li>
  );
}

function ThreadCard({ t, onStop }: { t: Thread; onStop?: (id: string) => void }) {
  const status = t.note
    ? t.note
    : t.stopped
      ? "No longer followed. What was logged stays."
      : t.waiting
        ? "Waiting for the sent email to show in Outlook."
        : `Followed in ${t.mailbox || "their"} Outlook${t.lastPolledAt ? `, last checked ${when(t.lastPolledAt)}` : ""}.`;
  return (
    <div className="rounded-2xl border border-line/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[13.5px] font-semibold">{t.subject || "(no subject)"}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">{t.startedHow === "linked" ? `Linked by ${t.startedBy}` : `${t.startedWhat} by ${t.startedBy}`}, {when(t.createdAt)}</p>
          <p className={`mt-0.5 text-[11.5px] ${t.note ? "text-accent-dark" : "text-muted"}`}>{status}</p>
        </div>
        {onStop && !t.stopped && (
          <button type="button" onClick={() => onStop(t.id)} className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[11px] text-muted hover:border-ink/40 hover:text-ink">Stop Following</button>
        )}
      </div>
      {t.messages.length > 0 ? (
        <ul className="mt-3 space-y-1.5">{t.messages.map((m) => <MessageRow key={m.id} m={m} />)}</ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line/80 px-3.5 py-2.5 text-[12px] text-muted">Nothing logged yet. Replies show here within five minutes of arriving.</p>
      )}
    </div>
  );
}

export function PlcEmails({ caseId }: { caseId: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [cands, setCands] = useState<Candidate[] | "loading" | null>(null);
  const [candErr, setCandErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/mail-threads?case=${encodeURIComponent(caseId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.ok) { setThreads(j.threads ?? []); setErr(null); } else setErr(j?.error ?? "The emails couldn't be read."); })
      .catch(() => setErr("The emails couldn't be read. Try again in a minute."));
  }, [caseId]);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const j = await fetch("/api/mail-threads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ case: caseId, ...body }) })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "That didn't work just now. Try again in a minute." }));
    return j as { ok: boolean; error?: string; threads?: Thread[]; candidates?: Candidate[]; logged?: number };
  };

  const findCandidates = async (term = search) => {
    setCands("loading");
    setCandErr(null);
    const j = await post({ action: "candidates", search: term });
    if (j.ok) setCands(j.candidates ?? []); else { setCands(null); setCandErr(j.error ?? "Your Outlook couldn't be searched."); }
  };

  const link = async (c: Candidate) => {
    setBusy(`link:${c.conversationId}`);
    const j = await post({ action: "link", conversationId: c.conversationId, subject: c.subject });
    setBusy(null);
    if (!j.ok) { setCandErr(j.error ?? "That couldn't be linked."); return; }
    setThreads(j.threads ?? []);
    setPicking(false);
    setCands(null);
  };

  const check = async () => {
    setBusy("check");
    const j = await post({ action: "check" });
    setBusy(null);
    if (j.ok) setThreads(j.threads ?? []); else setErr(j.error ?? "The check failed.");
  };

  const stop = async (id: string) => {
    setBusy(`stop:${id}`);
    const j = await post({ action: "unlink", id });
    setBusy(null);
    if (j.ok) setThreads(j.threads ?? []);
  };

  const live = (threads ?? []).filter((t) => !t.stopped).length;

  return (
    <section className="mt-4 rounded-[18px] border border-line/70 bg-card p-5 text-[13px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-normal"><DoodleIcon name="mail" size={15} className="text-accent-dark" />Emails on This Pack</h3>
          <p className="mt-1 max-w-[560px] text-[12px] leading-relaxed text-muted">
            Replies to the pack&apos;s own emails, from the tenant, the landlord, Susan or anyone here, logged every five minutes. Only these threads are read, never anyone&apos;s whole inbox.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {live > 0 && (
            <button type="button" disabled={busy === "check"} onClick={() => void check()} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40 disabled:opacity-50">
              {busy === "check" ? "Checking…" : "Check Now"}
            </button>
          )}
          <button type="button" onClick={() => { setPicking((p) => !p); if (!picking && !cands) void findCandidates(""); }} className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page">
            {picking ? "Close" : "Link an Email"}
          </button>
        </div>
      </div>

      {picking && (
        <div className="mt-3 rounded-2xl border border-line/60 bg-white p-4">
          <p className="text-[12px] text-muted">Your own Outlook conversations about this home. Pick the one to follow: its replies are logged here from now on, and what is already in it is copied in.</p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void findCandidates(); }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your Outlook, or leave blank for the address" className="min-w-0 flex-1 rounded-xl border border-line/80 px-3 py-2 text-[12.5px] outline-none focus:border-ink" />
            <button type="submit" className="shrink-0 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40">Search</button>
          </form>
          {candErr && <p className="mt-2 text-[12px] text-accent-dark">{candErr}</p>}
          {cands === "loading" ? (
            <div className="mt-3"><Spinner label="Searching your Outlook…" /></div>
          ) : cands && cands.length === 0 ? (
            <p className="mt-3 text-[12px] text-muted">Nothing in your Outlook mentions it. Try the tenant&apos;s or landlord&apos;s name.</p>
          ) : cands ? (
            <ul className="mt-3 space-y-1.5">
              {cands.map((c) => (
                <li key={c.conversationId} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line/50 px-3.5 py-2.5 text-[12.5px]">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold">{c.subject}</span>
                    <span className="block text-[11.5px] text-muted">{c.from} · {when(c.at)}{c.count > 1 ? ` · ${c.count} emails` : ""}</span>
                    <span className="block truncate text-[11.5px] text-muted">{c.preview}</span>
                  </span>
                  {c.linked ? (
                    <span className="shrink-0 text-[11.5px] text-muted">On this pack</span>
                  ) : (
                    <button type="button" disabled={busy === `link:${c.conversationId}`} onClick={() => void link(c)} className="shrink-0 rounded-full bg-accent-dark px-3 py-1 text-[11.5px] font-semibold text-page disabled:opacity-50">
                      {busy === `link:${c.conversationId}` ? "Linking…" : "Follow This"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {err ? (
          <p className="text-[12px] text-accent-dark">{err}</p>
        ) : !threads ? (
          <Spinner label="Reading the emails on this pack…" />
        ) : threads.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">
            No emails on this pack yet. Send to Susan, the RLP request and the decision to the landlord are followed once they go from your Outlook, or link a conversation of your own.
          </p>
        ) : (
          threads.map((t) => <ThreadCard key={t.id} t={t} onStop={busy?.startsWith("stop:") ? undefined : (id) => void stop(id)} />)
        )}
      </div>
    </section>
  );
}

export function ThreadView({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[760px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-normal leading-tight">Email Thread</h2>
            <p className="mt-1 text-[12.5px] text-muted">{thread.address}{thread.caseId ? " · on the PLC pack" : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-muted hover:text-ink"><DoodleIcon name="cross" size={13} /></button>
        </div>
        <ThreadCard t={thread} />
        {thread.caseId && (
          <a href={`/pre-tenancy/plc?case=${encodeURIComponent(thread.caseId)}`} className="mt-3 inline-block text-[12.5px] font-semibold text-accent-dark underline-offset-2 hover:underline">Open the PLC Pack</a>
        )}
      </div>
    </div>
  );
}
