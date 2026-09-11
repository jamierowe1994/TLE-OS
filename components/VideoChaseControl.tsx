"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The video nudge, on the appraisal it belongs to.
 *
 * One line: who it goes to and when, with two buttons. "Send it to me now"
 * is the test - it lands in the signed-in person's own inbox with the real
 * link, whoever the agent is. "Queue it" puts it on the schedule for two
 * days before the visit, which is what happens on its own when the
 * appraisal is booked; the button is for one booked before that was true.
 */

type Queued = { id: string; sendAt: string; state: string; toEmail: string; sentAt: string | null; error: string | null };

type Info = {
  ok: boolean;
  to?: string;
  matchedAgent?: boolean;
  sendAt?: string | null;
  queued?: Queued | null;
  recorded?: boolean;
  error?: string;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default function VideoChaseControl({ appraisalId }: { appraisalId: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState<"now" | "queue" | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = () =>
    fetch(`/api/appraisals/video-chase?id=${encodeURIComponent(appraisalId)}`)
      .then((r) => r.json() as Promise<Info>)
      .then(setInfo)
      .catch(() => setInfo({ ok: false, error: "Couldn't read the nudge." }));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appraisalId]);

  async function act(mode: "now" | "queue") {
    setBusy(mode);
    setNote(null);
    try {
      const r = await fetch("/api/appraisals/video-chase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: appraisalId, mode }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        to?: string;
        queued?: boolean;
        sendAt?: string;
        reason?: string;
      };
      if (!j.ok) {
        setNote({ tone: "err", text: j.error ?? "That didn't work." });
        return;
      }
      if (mode === "now") setNote({ tone: "ok", text: `Sent to ${j.to}. Check your inbox.` });
      else if (j.queued && j.sendAt) setNote({ tone: "ok", text: `Queued for ${day(j.sendAt)}.` });
      else setNote({ tone: "err", text: j.reason ?? "Not queued." });
      void load();
    } catch {
      setNote({ tone: "err", text: "That didn't work. Try again in a moment." });
    } finally {
      setBusy(null);
    }
  }

  if (!info) return null;
  if (!info.ok) return null;

  const queued = info.queued && info.queued.state === "queued" ? info.queued : null;
  /* "Nudge" is James's own word for it; on the file it is a reminder. */
  const status = info.recorded
    ? "Your video is on the landlord's page, so no reminder is needed."
    : info.queued?.state === "declined"
      ? "Sending without a video - no reminder will go."
      : queued
        ? `A reminder to record goes to ${queued.toEmail} on ${day(queued.sendAt)}.`
        : info.queued?.state === "sent"
          ? `The reminder to record went to ${info.queued.toEmail}${info.queued.sentAt ? ` on ${day(info.queued.sentAt)}` : ""}.`
          : info.sendAt
            ? `A reminder to record goes to ${info.to} on ${day(info.sendAt)} if nothing is recorded by then.`
            : `No reminder - the visit is too close for one.`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-line/70 bg-card px-4 py-3">
      <DoodleIcon name="mail" size={15} className="shrink-0 text-muted" />
      <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">{status}</p>
      <div className="flex shrink-0 items-center gap-2">
        {!queued && !info.recorded && info.sendAt && (
          <button
            type="button"
            onClick={() => act("queue")}
            disabled={busy !== null}
            className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
          >
            {busy === "queue" ? "Queuing…" : "Queue it"}
          </button>
        )}
        <button
          type="button"
          onClick={() => act("now")}
          disabled={busy !== null}
          className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
          title="Lands in your own inbox with the real link, whoever the agent is"
        >
          {busy === "now" ? "Sending…" : "Send it to me now"}
        </button>
      </div>
      {note && (
        <p className={`basis-full text-[11.5px] ${note.tone === "err" ? "font-semibold text-accent-dark" : "text-muted"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
