"use client";

import { useState } from "react";
import WelcomeVideoRecorder from "@/components/WelcomeVideoRecorder";
import { preSendWhen, preSentWhen, type PreOnBooking } from "@/lib/pre-send-time";

/**
 * The pre-presentation, on the booking's done screen (Howard, approved by
 * James 1 Oct 2026).
 *
 * Booked by the agent doing the visit: record a video now if they like, then
 * Send - it goes this minute. Closing without choosing leaves the two-hour
 * backstop the booking queued, so it still goes.
 *
 * Booked for somebody else: a line saying who was told and when it goes. The
 * video is theirs to record, from the email or the bell.
 */
export default function PreSendOffer({ pre }: { pre: PreOnBooking }) {
  const [state, setState] = useState(pre.state);
  const [at, setAt] = useState(pre.at);
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const first = pre.landlord.split(/\s+/)[0] || "them";
  const agentFirst = pre.agentName.split(/\s+/)[0] || "The agent";

  async function send(mode: "send" | "decline") {
    setBusy(true);
    setNote(null);
    const r = (await fetch("/api/appraisals/video-chase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: pre.appraisalId, mode }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "That didn't send." }))) as { ok?: boolean; sent?: boolean; held?: boolean; at?: string | null; detail?: string; error?: string };
    if (r.ok && r.sent) {
      setState("sent");
      setAt(r.at ?? new Date().toISOString());
    } else {
      setNote(r.detail ?? r.error ?? "That didn't send.");
    }
    setBusy(false);
  }

  const box = "mt-6 w-full max-w-md rounded-2xl border border-line/60 bg-card p-5 text-left";
  const primary = "rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60";
  const ghost = "rounded-full border border-line/80 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-60";

  if (state === "sent") {
    return (
      <div className={box}>
        <p className="text-[13.5px] font-semibold">Pre-presentation sent</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          It went to {first} {at ? preSentWhen(at) : "just now"}
          {pre.self ? "." : `. ${agentFirst} has been told.`}
        </p>
      </div>
    );
  }

  if (!pre.self) {
    return (
      <div className={box}>
        <p className="text-[13.5px] font-semibold">Pre-presentation</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {state === "queued" && at
            ? `It goes to ${first} ${preSendWhen(at)}. ${
                !pre.told
                  ? `${agentFirst} has no account here to be told, so it goes on its own.`
                  : new Date(at).getTime() - Date.now() < 30 * 60 * 1000
                    ? `The visit is close, so it is not waiting. ${agentFirst} has been told.`
                    : `${agentFirst} has been told, with a link to record a video first or send it sooner.`
              }${pre.detail ? ` ${pre.detail}` : ""}`
            : pre.detail ?? "It is not on its way yet. Send it from the appraisal."}
        </p>
      </div>
    );
  }

  if (!pre.deck) {
    return (
      <div className={box}>
        <p className="text-[13.5px] font-semibold">Pre-presentation</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{pre.detail ?? "It is made when the appraisal is opened."}</p>
      </div>
    );
  }

  return (
    <div className={box}>
      <p className="text-[13.5px] font-semibold">{recorded ? "Send your pre-presentation" : "Record a video for your pre-presentation?"}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        {recorded
          ? `Your video is on the front of it. Send it to ${first} now.`
          : `Optional. A short video from you on the front of it is what makes it yours. Then send it to ${first} straight away.`}
        {state === "queued" && at ? ` If you close this, it goes on its own ${preSendWhen(at)}.` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <WelcomeVideoRecorder
          compact
          token={pre.deck.token}
          address={pre.address}
          label="Record a video"
          className={recorded ? ghost : primary}
          onDone={() => setRecorded(true)}
        />
        {recorded ? (
          <button type="button" onClick={() => void send("send")} disabled={busy} className={primary}>
            {busy ? "Sending…" : "Send it now"}
          </button>
        ) : (
          <button type="button" onClick={() => void send("decline")} disabled={busy} className={ghost}>
            {busy ? "Sending…" : "Send it without a video"}
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-[11.5px] text-accent-dark">{note}</p>}
    </div>
  );
}
