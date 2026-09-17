"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * WHERE THE CONTRACT HAS GOT TO, AND THE WAY TO CHASE IT.
 *
 * The third card on the appraisal page once there is a figure and a deck. It
 * reads DocuSeal every time it renders rather than trusting anything we store,
 * so it can say "opened twice, not signed" and mean it.
 *
 * ── The nudge is the point ────────────────────────────────────────────────
 *
 * James, 15 Sep 2026: "every time they need to send a nudge, they have to go
 * to someone with a DocuSign account. I'd love to be able to send a nudge for
 * that contract on that file." So the reminder is a button on the file, for
 * the agent whose deal it is, and it says who it went to.
 *
 * It refuses politely rather than hiding: sending locked, contract not ready,
 * agent's half unsigned, landlord already signed - each one says so in a
 * sentence an agent can act on.
 */

type Party = {
  role: "agent" | "landlord";
  name: string | null;
  email: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
};

type State = {
  ok?: boolean;
  connected?: boolean;
  sendUnlocked?: boolean;
  parties?: Party[];
  sent?: { firstSentAt: string; lastSentAt: string; count: number; to: string } | null;
  nudge?: { count: number; autoCount: number; lastAt: string | null; lastBy: string | null } | null;
  nextNudgeAt?: string | null;
  views?: { presentation: number; contract: number };
  error?: string;
};

/** The eye and a number - how often the landlord has opened it in their file. */
function Seen({ n, what }: { n: number; what: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${what} opened ${n} time${n === 1 ? "" : "s"} by the landlord`}>
      <svg viewBox="0 0 24 24" aria-hidden className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
      <span className="font-semibold text-ink">{n}</span>
      <span>{what}</span>
    </span>
  );
}

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;

const ago = (iso: string | null) => {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export default function TermsCard({
  appraisalId,
  landlord,
  primary,
  ghost,
}: {
  appraisalId: string;
  landlord: string;
  /** The card's own button classes, so this matches whatever it sits inside. */
  primary: string;
  ghost: string;
}) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const r = await fetch(`/api/appraisals/${appraisalId}/terms`, { cache: "no-store" });
      setState((await r.json()) as State);
    } catch {
      setState({ ok: false, error: "Couldn't read the contract just now." });
    }
  }, [appraisalId]);

  useEffect(() => {
    void read();
  }, [read]);

  async function nudge(first: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      /* The first send is the whole pack; after that it is a nudge - a short
         reminder whose button opens the contract on their file. */
      const r = await fetch(`/api/appraisals/${appraisalId}/${first ? "terms" : "nudge"}`, { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (j.ok) {
        setSaid(j.message ?? "Sent.");
        void read();
      } else {
        setError(j.error ?? "Couldn't send it just now.");
      }
    } catch {
      setError("Couldn't send it just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const prepare = (
    <Link href={`/market-appraisals/${appraisalId}/send`} className={primary}>
      Prepare the presentation and sign <span aria-hidden>→</span>
    </Link>
  );

  /* Reading, or DocuSeal is not connected here: the way forward is the same
     screen either way, so it is never a dead card. */
  if (!state) return <p className="text-[12.5px] text-muted">Reading the contract…</p>;
  if (state.connected === false) return prepare;

  const agent = state.parties?.find((p) => p.role === "agent");
  const landlordParty = state.parties?.find((p) => p.role === "landlord");

  /* Nothing minted yet - or the agent has not signed - so the job is the
     preparing, not the chasing. */
  if (!landlordParty || !agent?.completedAt) {
    return (
      <div>
        {prepare}
        {agent && !agent.completedAt && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            The contract is drawn up and waiting on your signature. Nothing has gone to {landlord}.
          </p>
        )}
      </div>
    );
  }

  const sent = landlordParty.sentAt;
  const opened = landlordParty.openedAt;
  const signedIt = landlordParty.completedAt;
  const views = state.views ?? { presentation: 0, contract: 0 };
  const nudged = state.nudge;
  const nextAt = state.nextNudgeAt;

  return (
    <div>
      {sent && (
        <p className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
          <Seen n={views.presentation} what="presentation" />
          <Seen n={views.contract} what="contract" />
        </p>
      )}
      <ul className="mb-3.5 space-y-1 text-[11.5px] leading-relaxed text-muted">
        <li>You signed it on {day(agent.completedAt)}.</li>
        <li>
          {sent ? `Sent to ${landlordParty.email} ${ago(sent)}.` : `Not emailed to ${landlordParty.email} yet.`}
        </li>
        {signedIt ? (
          <li className="font-semibold text-ink">{landlord} signed it on {day(signedIt)}.</li>
        ) : (
          <>
            <li>{opened ? `They opened it ${ago(opened)}, and have not signed.` : "They have not opened it."}</li>
            {nudged?.count ? (
              <li>
                Nudged {nudged.count === 1 ? "once" : nudged.count === 2 ? "twice" : `${nudged.count} times`}, last {ago(nudged.lastAt)}
                {nudged.lastBy === "automatic" ? " (automatic)" : nudged.lastBy ? ` by ${nudged.lastBy}` : ""}.
              </li>
            ) : null}
            {sent && nextAt && <li>Next automatic nudge {day(nextAt)}.</li>}
          </>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {!signedIt && (
          <button type="button" onClick={() => nudge(!sent)} disabled={busy || state.sendUnlocked === false} className={primary}>
            {busy ? "Sending…" : sent ? "Nudge to sign" : "Send it to them"}
          </button>
        )}
        <Link href={`/market-appraisals/${appraisalId}/send`} className={ghost}>
          Open the contract
        </Link>
      </div>

      {state.sendUnlocked === false && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
          Sending is switched off on this environment, so the button is inert. Everything else here is live.
        </p>
      )}
      {said && <p className="mt-2.5 text-[11.5px] font-semibold">{said}</p>}
      {error && <p className="mt-2.5 text-[11.5px] leading-relaxed text-accent-dark">{error}</p>}
    </div>
  );
}
