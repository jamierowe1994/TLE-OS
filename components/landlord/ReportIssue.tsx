"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "Report a problem", on the maintenance page. A landlord noticing something
 * on a visit, or passing on what a tenant told them direct. It folds open
 * under the button, asks what and how urgent, and goes to the agent through
 * the same thread as a message - stored on the file and emailed - so it is
 * logged the moment it is sent. The sample has nothing behind it and says so.
 */

const SAGE_INK = "#56634a";

const URGENCY = [
  { id: "Emergency", sub: "No heating, a leak, no power" },
  { id: "Urgent", sub: "Hard to live with" },
  { id: "Routine", sub: "Everything else" },
];

export default function ReportIssue({ properties, sample = false, agentFirst }: { properties: string[]; sample?: boolean; agentFirst: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [urgency, setUrgency] = useState("Routine");
  const [property, setProperty] = useState(properties[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);

  async function send() {
    const what = text.trim();
    if (!what) return;
    if (sample) {
      setNote({ text: `On the sample nothing is sent. A real landlord's report goes to ${agentFirst} and onto their file, and shows here as a job.`, err: false });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      /* A job on the maintenance board first, a note to the agent second
         (22 Sep 2026). It used to be a message only, and said Sent regardless. */
      const res = await fetch("/api/landlord/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: what, urgency, property }) });
      const j = (await res.json()) as { ok?: boolean; error?: string; ref?: string };
      if (!j.ok) throw new Error(j.error ?? "That didn't send.");
      setNote({ text: `Logged as job ${j.ref ?? ""} and sent to ${agentFirst}. We'll be in touch the same working day, and it shows below.`.replace("  ", " "), err: false });
      setText("");
      router.refresh();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "That didn't send.", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: SAGE_INK }}
      >
        <DoodleIcon name="setting" size={15} className="text-white" />
        Report a problem
        <span className="text-[11px] opacity-70">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-5 rounded-2xl border border-white/80 bg-white/80 p-5">
          {properties.length > 1 && (
            <label className="block">
              <span className="text-[12px] font-semibold">Which property?</span>
              <select value={property} onChange={(e) => setProperty(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line/70 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-ink/40">
                {properties.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          <label className="mt-3 block">
            <span className="text-[12px] font-semibold">What&rsquo;s the problem?</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Where it is, what it is doing, and since when."
              className="mt-1.5 w-full resize-y rounded-xl border border-line/70 bg-white px-3 py-2.5 text-[13px] outline-none placeholder:text-muted focus:border-ink/40"
            />
          </label>
          <p className="mt-3 text-[12px] font-semibold">How urgent?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {URGENCY.map((u) => {
              const on = urgency === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUrgency(u.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-left text-[12px] transition-colors ${on ? "border-transparent text-white" : "border-line/70 bg-white text-muted hover:text-ink"}`}
                  style={on ? { background: SAGE_INK } : undefined}
                >
                  <span className="font-semibold">{u.id}</span>
                  <span className={`ml-1.5 ${on ? "opacity-80" : ""}`}>· {u.sub}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-[12px] ${note?.err ? "font-semibold text-accent-dark" : "text-muted"}`}>
              {note ? note.text : "Goes straight to your agent, and is logged the moment you send it."}
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !text.trim()}
              className="rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: SAGE_INK }}
            >
              {busy ? "Sending…" : "Send it to " + agentFirst}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
