"use client";

import { useState } from "react";
import FloatSheet, { FloatCard, FloatCardHead, FloatFoot } from "@/components/new-look/FloatSheet";
import { captureScreen } from "@/lib/screenshot";
import { trail, trailAsText } from "@/lib/trail";
import type { Problem } from "@/lib/toast";

/**
 * What opens when a red "didn't work" toast is pressed (James, 8 Nov 2026).
 *
 * Why it didn't work, in plain English, what to do about it, and the ticket
 * as one press: anything they want to add, then Send. The page, the last
 * few things they did, what the server said and a picture of the screen go
 * with it on their own, because "half the problem is that they don't like
 * submitting tickets ... they have to try and recreate the process to
 * remember what happened". It files through /api/bugs like every report.
 */
export default function ProblemSheet({ problem, onClose }: { problem: Problem; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "sent" | "failed">("ready");

  async function send() {
    if (state === "sending" || state === "sent") return;
    setState("sending");
    const steps = trailAsText();
    const body = [
      `${problem.action.toUpperCase()} DIDN'T WORK - sent from the "didn't work" toast.`,
      `\nWhat they were told:\n${problem.why}`,
      notes.trim() ? `\nWhat they added:\n${notes.trim()}` : "",
      steps ? `\nThe last few steps:\n${steps}` : "",
      `\nThe call:\n${problem.technical}`,
    ]
      .filter(Boolean)
      .join("\n");
    const filed = await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body,
        kind: "bug",
        path: window.location.pathname + window.location.search,
        context: {
          failed: true,
          action: problem.action,
          technical: problem.technical,
          trail: trail(),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          ua: navigator.userAgent.slice(0, 160),
        },
      }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ id?: string }>) : null))
      .catch(() => null);
    if (!filed) {
      setState("failed");
      return;
    }
    setState("sent");
    /* The picture after the words, with this panel kept out of it, so what
       arrives is the screen they were on. */
    const sheet = document.querySelector<HTMLElement>(".nl-fs-wrap");
    sheet?.setAttribute("data-hide-from-shot", "");
    const shot = await captureScreen().catch(() => null);
    sheet?.removeAttribute("data-hide-from-shot");
    if (shot && filed.id) {
      await fetch("/api/bugs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: filed.id, shot }) }).catch(() => {});
    }
  }

  return (
    <FloatSheet
      title="What Went Wrong"
      size="lg"
      onClose={onClose}
      dismissible={state !== "sending"}
      question={`${problem.action} didn't work`}
      lede={problem.why}
      foot={
        <FloatFoot left={state === "sent" ? <span>Sent. You don&apos;t need to do anything else.</span> : <span>Nothing is sent until you press Submit.</span>}>
          {state === "sent" ? (
            <button type="button" className="nl-btn nl-btn--primary" onClick={onClose}>
              Close
            </button>
          ) : (
            <>
              <button type="button" className="nl-btn nl-btn--quiet" onClick={onClose} disabled={state === "sending"}>
                Not now
              </button>
              <button type="button" className="nl-btn nl-btn--primary" onClick={() => void send()} disabled={state === "sending"} data-steve="problem.send">
                {state === "sending" ? "Sending…" : state === "failed" ? "Try sending again" : "Submit as a ticket"}
              </button>
            </>
          )}
        </FloatFoot>
      }
    >
      <FloatCard>
        <FloatCardHead title="What to Do" />
        <p className="text-[14px] leading-[21px]">{problem.next}</p>
      </FloatCard>
      {state === "sent" ? (
        <FloatCard>
          <FloatCardHead title="Sent to James" />
          <p className="text-[14px] leading-[21px]">
            It went with the page you were on, the last few things you pressed and a picture of the screen, so nobody has to ask you to remember any of it.
          </p>
        </FloatCard>
      ) : (
        <FloatCard>
          <FloatCardHead title="Send It as a Ticket" aside="Optional" />
          <label className="nl-fs-label" htmlFor="problem-notes">
            Anything to add? <em>What you expected, or who it's for</em>
          </label>
          <textarea id="problem-notes" className="nl-fs-input mt-1.5" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I was putting 12 Beech Grove on Rightmove" />
          <p className="nl-fs-hint mt-3">Goes with it on its own: this page, the last few things you pressed, what the system said back, and a picture of the screen.</p>
          {state === "failed" && <p className="nl-fs-err mt-2">That didn&apos;t send either. Check your connection and try once more.</p>}
        </FloatCard>
      )}
    </FloatSheet>
  );
}
