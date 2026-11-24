"use client";

import { useState } from "react";
import SteveFace from "@/components/SteveFace";
import SteveFind, { outcomeLine } from "@/components/steve/SteveFind";
import { useNewLook } from "@/lib/use-new-look";
import type { FindOutcome } from "@/lib/steve-find-shared";

/**
 * FIND IT on a home whose landlord or tenants have a gap (James, 24 Nov 2026:
 * "when it reads as blank, it goes and finds the data from the other
 * system"). One quiet line above the people; pressed, Steve's card
 * (components/steve/SteveFind) looks and asks. A "no" or "nothing found"
 * files the report to James itself, with where he looked.
 *
 * Shown only behind the "stevefind" switch, and only when something is blank.
 */
export default function FindMissing({ path, home, gaps, onSaved }: { path: string; home: string; gaps: string | null; onSaved: () => void }) {
  const on = useNewLook("stevefind") === true;
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<"" | "sending" | "sent" | "failed">("");
  if (!on || (!gaps && !open)) return null;

  async function send(outcome: FindOutcome | undefined) {
    setSent("sending");
    const ok = await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: [`Details missing on ${home}: ${gaps ?? "a landlord or tenant"}. Sent from Find It.`, outcomeLine(outcome)].filter(Boolean).join("\n\n"),
        path,
        kind: "bug",
        context: { viewport: `${window.innerWidth}x${window.innerHeight}`, deflect: { offered: "find", steveFind: outcome } },
      }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    setSent(ok ? "sent" : "failed");
  }

  return (
    <div className="mb-3">
      {!open ? (
        <div className="sv-fix sv-find is-compact" role="note">
          <SteveFace size={30} mood="happy" />
          <div className="min-w-0 flex-1">
            <p className="sv-fix-h">Something's Missing Here</p>
            <p className="sv-fix-p">{gaps}. Steve can look for it in PayProp, Propoly and the home's file.</p>
            <div className="sv-find-acts">
              <button type="button" className="sv-find-yes is-fit" data-steve="home.find-missing" onClick={() => setOpen(true)}>
                Find It
              </button>
            </div>
          </div>
        </div>
      ) : sent === "sent" ? (
        <p className="nl-meta" role="status">Sent to James, with where Steve looked.</p>
      ) : (
        <>
          <SteveFind
            compact
            path={path}
            who={null}
            sendLabel={sent === "sending" ? "Sending…" : "Send It to James"}
            onSaved={() => onSaved()}
            onSend={(o) => void send(o)}
          />
          {sent === "failed" && <p className="nl-meta mt-1 text-accent-dark">That didn't send. Use Report in Steve's corner instead.</p>}
        </>
      )}
    </div>
  );
}
