"use client";

import { useEffect, useState } from "react";

/**
 * The agent's side of a compliance query (20 Oct 2026, the agents' call:
 * "when Josselle writes a note ... can agents write back, so it's logged?").
 * The answers so far and a box to add one. Each answer is kept on the record
 * and emailed to whoever raised the query (/api/compliance/query-reply).
 */

type Reply = { id: string; body: string; by: string; at: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function QueryThread({ kind, id }: { kind: "certificate" | "landlord_document"; id: string }) {
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/compliance/query-reply?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setReplies(j?.ok ? (j.replies as Reply[]) : []); })
      .catch(() => live && setReplies([]));
    return () => { live = false; };
  }, [kind, id]);

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setSaid(null);
    try {
      const j = await fetch("/api/compliance/query-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, body }) }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "That didn't save.");
      setReplies((r) => [...(r ?? []), j.reply as Reply]);
      setBody("");
      setOpen(false);
      setSaid({ ok: true, text: j.said });
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5">
      {(replies ?? []).map((r) => (
        <p key={r.id} className="mt-1 rounded-lg bg-box px-2.5 py-1.5 text-[12px] leading-snug">
          <span className="font-semibold">{r.by}</span> <span className="text-muted">{when(r.at)}</span>
          <span className="mt-0.5 block whitespace-pre-wrap">{r.body}</span>
        </p>
      ))}
      {open ? (
        <div className="mt-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Your answer: what you've done, or why it's fine as it is"
            className="w-full rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink/40"
          />
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !body.trim()} onClick={() => void send()} className="rounded-full bg-ink px-3.5 py-1 text-[11.5px] font-semibold text-page disabled:opacity-40">
              {busy ? "Sending" : "Send answer"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px]">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setSaid(null); }} className="mt-1 text-[11.5px] font-semibold text-accent-dark underline-offset-2 hover:underline">
          Answer the query
        </button>
      )}
      {said && <p className={`mt-1 text-[11.5px] ${said.ok ? "text-muted" : "text-accent-dark"}`}>{said.text}</p>}
    </div>
  );
}
