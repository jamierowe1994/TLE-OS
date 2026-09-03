"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { ViewMessage } from "@/lib/landlord-view";

/**
 * "Message your agent", live: the thread with their agent, in a sheet over
 * the page. What they write is stored on their file and emailed to the
 * agent, whose reply comes back by email for now - the sheet says so, so
 * nobody sits waiting for a bubble that will not appear. When the agent's
 * side of the thread lands in the OS, only this sheet changes.
 */
export default function MessageTile({
  appraisalId,
  agentName,
  messages,
  label,
  sub,
  icon,
}: {
  appraisalId: string | null;
  agentName: string | null;
  messages: ViewMessage[];
  label: string;
  sub: string;
  icon: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [thread, setThread] = useState<ViewMessage[]>(messages);
  const first = agentName?.split(/\s+/)[0] ?? "your agent";

  useEffect(() => setThread(messages), [messages]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/landlord/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appraisalId, text: body }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; emailed?: boolean; message?: { id: string; sentAt: string } };
      if (!j.ok) {
        setErr(j.error ?? "That didn't send.");
        return;
      }
      setThread((t) => [...t, { id: j.message?.id ?? String(Date.now()), from: "landlord", body, sentAt: j.message?.sentAt ?? new Date().toISOString(), emailed: Boolean(j.emailed) }]);
      setText("");
      router.refresh();
    } catch {
      setErr("That didn't send. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center rounded-2xl border border-line/60 bg-white px-3 py-4 text-center transition-colors hover:border-ink/40"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name={icon} size={18} />
        </span>
        <span className="mt-3 text-[13px] font-semibold leading-tight">{label}</span>
        <span className="mt-1 text-[11.5px] leading-snug text-muted">{thread.length ? `${thread.length} in your thread` : sub}</span>
        <span className="mt-2.5 text-[13px] text-muted">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[130]">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-ink/35" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)]">
            <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
              <div>
                <h2 className="text-[20px] leading-tight">Message {first}</h2>
                <p className="mt-1 text-[12px] text-muted">
                  Goes to {first}&rsquo;s inbox. Replies come back to your email for now.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {thread.length === 0 && <p className="text-[12.5px] text-muted">Nothing yet. Ask anything about the property.</p>}
              {thread.map((m) => (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${m.from === "landlord" ? "ml-auto bg-ink text-white" : "bg-[#f3f3f1]"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-[10.5px] ${m.from === "landlord" ? "text-white/60" : "text-muted"}`}>
                    {when(m.sentAt)}
                    {m.from === "landlord" && !m.emailed ? " · on your file, not yet emailed" : ""}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-line/70 px-5 py-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={`Ask ${first} anything`}
                className="w-full resize-none rounded-xl border border-line/80 bg-panel px-3.5 py-2.5 text-[13.5px] outline-none focus:border-accent"
              />
              {err && <p className="mt-2 text-[12px] font-semibold text-accent-dark">{err}</p>}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={send}
                  disabled={busy || !text.trim()}
                  className="rounded-full bg-ink px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
