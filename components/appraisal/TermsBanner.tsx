"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ChangeFees from "@/components/appraisal/ChangeFees";
import { Badge, Ico } from "@/components/new-look/Parts";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * THE TERMS OF BUSINESS, ONE BANNER, on the appraisal's Documents tab (James,
 * 24 Oct 2026: "under Documents, on Listings, we have this really nice thing").
 * The new look only; the old page keeps its card in Next Up.
 *
 * Send, Sent, Signed, as the listing's banner has it, from what DocuSeal says
 * right now (GET /api/appraisals/[id]/terms, the same read as TermsCard):
 *   - one tick when it has gone to the landlord, two once they have opened it
 *     (DocuSeal's opened time, or their own file counting a contract open);
 *   - Nudge once it has gone (POST /api/appraisals/[id]/nudge, the same
 *     reminder the automatic 2/5/9-day nudges send);
 *   - Change the fees and Draw them up again, to redo and reissue;
 *   - before anything is sent, the fees the contract cannot go without are
 *     asked for first, rather than a Send that the next screen refuses.
 */

type Party = { role: "agent" | "landlord"; name: string | null; email: string; status: string; sentAt: string | null; openedAt: string | null; completedAt: string | null };
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

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "");

function DocGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z" />
      <path d="M13.5 3.5V8H18M9 12.5h6M9 16h6" />
    </svg>
  );
}

/** One tick sent, two ticks read - the way a message app says it. */
function Ticks({ read }: { read: boolean }) {
  return (
    <span className={`nl-tob-ticks${read ? " is-read" : ""}`} title={read ? "Opened by the landlord" : "Sent, not opened yet"} aria-label={read ? "Read" : "Sent"}>
      <svg viewBox="0 0 28 16" width="24" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 8.5l4 4 8.5-9" />
        {read ? <path d="M12 12.5l8.5-9" /> : null}
      </svg>
      {read ? "Read" : "Sent"}
    </span>
  );
}

/** What the contract cannot be drawn up without, in the agent's words. */
export function feesMissing(ma: Pick<MarketAppraisal, "valuation" | "serviceLevel" | "feePct">): string[] {
  return [
    ma.valuation == null && "the rent agreed",
    !ma.serviceLevel && "the service",
    (ma.serviceLevel === "full_managed" || ma.serviceLevel === "rent_collect") && ma.feePct == null && "the management fee",
  ].filter((x): x is string => Boolean(x));
}

export default function TermsBanner({ ma, onChanged }: { ma: MarketAppraisal; onChanged?: (next?: MarketAppraisal) => void }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  const read = useCallback(async () => {
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/terms`, { cache: "no-store" });
      setState((await r.json()) as State);
    } catch {
      setState({ ok: false, error: "Couldn't read the contract just now." });
    }
  }, [ma.id]);
  useEffect(() => {
    void read();
  }, [read]);

  async function nudge() {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    const j = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/nudge`, { method: "POST" })
      .then((r) => r.json() as Promise<{ ok?: boolean; message?: string; error?: string }>)
      .catch(() => null);
    setBusy(false);
    setSaid(j?.ok ? { text: j.message ?? "Reminder sent.", bad: false } : { text: j?.error ?? "Couldn't send the reminder just now.", bad: true });
    if (j?.ok) void read();
  }

  const send = `/market-appraisals/${encodeURIComponent(ma.id)}/send`;
  const missing = feesMissing(ma);
  const landlord = state?.parties?.find((p) => p.role === "landlord") ?? null;
  const agent = state?.parties?.find((p) => p.role === "agent") ?? null;
  const signedAt = landlord?.completedAt ?? null;
  const sentAt = landlord?.sentAt ?? null;
  const readIt = Boolean(landlord?.openedAt || (state?.views?.contract ?? 0) > 0);
  /* The fees changed after the terms went: the contract out there is on the old figures. */
  const stale = Boolean(!signedAt && ma.termsSentAt && ma.valuedAt && ma.valuedAt > ma.termsSentAt);
  const phase: "loading" | "signed" | "sent" | "drawn" | "unsent" = !state ? "loading" : signedAt ? "signed" : sentAt ? "sent" : landlord && !agent?.completedAt ? "drawn" : "unsent";
  const who = ma.landlord || "The landlord";
  const nudged = state?.nudge;
  const fees = (label: string, cls = "nl-btn nl-btn--secondary nl-btn--sm") => (
    <ChangeFees appraisalId={ma.id} className={cls} onSaved={(next) => { onChanged?.(next); void read(); }}>
      {label}
    </ChangeFees>
  );

  return (
    <section className={`nl-cmp-tob${phase === "signed" ? " is-signed" : phase === "loading" ? " is-loading" : ""}`} aria-busy={phase === "loading"}>
      <span className="nl-cmp-tob-ic">{phase === "signed" ? <Ico name="check" size={18} /> : <DocGlyph />}</span>
      <div className="nl-cmp-tob-main">
        <h3 className="nl-block-title">Terms of Business</h3>
        <p className="nl-meta">
          {phase === "loading" ? (
            <span className="nl-cmp-wait">
              <span className="nl-cmp-spin" aria-hidden />
              Looking at where the contract is…
            </span>
          ) : phase === "signed" ? (
            <>Signed by {landlord?.name || who} on {day(signedAt)}.</>
          ) : phase === "sent" ? (
            stale ? (
              <>The fees changed after these went to {landlord?.email}. Draw them up again so {who} signs the new figures.</>
            ) : (
              <>
                Sent to {landlord?.email} on {day(sentAt)}
                {readIt ? `, opened${landlord?.openedAt ? " " + day(landlord.openedAt) : ""}` : ", not opened yet"}. Waiting for their signature.
                {nudged?.count ? ` Nudged ${nudged.count === 1 ? "once" : nudged.count === 2 ? "twice" : nudged.count + " times"}, last on ${day(nudged.lastAt)}${nudged.lastBy === "automatic" ? " (automatic)" : ""}.` : ""}
                {state?.nextNudgeAt ? ` Next automatic nudge ${day(state.nextNudgeAt)}.` : ""}
              </>
            )
          ) : phase === "drawn" ? (
            <>Drawn up and waiting on your signature. Nothing has gone to {who} yet.</>
          ) : missing.length ? (
            <>Add {missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}` : missing[0]} first, then they can go to {who}.</>
          ) : state?.connected === false ? (
            <>Contracts aren&apos;t connected on this system, so they can&apos;t be sent from here.</>
          ) : (
            <>{who} hasn&apos;t been sent the terms yet. The home can&apos;t go live until they&apos;re signed.</>
          )}
        </p>
        {said && <p className={`nl-meta${said.bad ? " nl-cmp-err" : ""}`}>{said.text}</p>}
        {state?.sendUnlocked === false && phase === "sent" && <p className="nl-meta">Sending is switched off on this system, so Nudge won&apos;t send.</p>}
      </div>
      <div className="nl-cmp-tob-act">
        {phase === "signed" ? (
          <>
            <span className="nl-cmp-signed">
              <Ico name="check" size={14} />
              Signed
            </span>
            <Link href={send} className="nl-btn nl-btn--quiet nl-btn--sm">Open the contract</Link>
          </>
        ) : phase === "sent" ? (
          <>
            <Ticks read={readIt} />
            {stale ? (
              <Link href={send} className="nl-btn nl-btn--primary nl-btn--sm">Draw them up again</Link>
            ) : (
              <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy || state?.sendUnlocked === false} onClick={() => void nudge()}>
                {busy ? "Sending…" : "Nudge"}
              </button>
            )}
            {fees("Change the fees", "nl-btn nl-btn--quiet nl-btn--sm")}
            {!stale && <Link href={send} className="nl-btn nl-btn--quiet nl-btn--sm">Redo and reissue</Link>}
          </>
        ) : phase === "drawn" ? (
          <>
            <Badge tone="info">Not sent</Badge>
            <Link href={send} className="nl-btn nl-btn--primary nl-btn--sm">Sign and send</Link>
            {fees("Change the fees", "nl-btn nl-btn--quiet nl-btn--sm")}
          </>
        ) : phase === "unsent" ? (
          missing.length ? (
            fees("Add the fees", "nl-btn nl-btn--primary nl-btn--sm")
          ) : (
            <>
              <Link href={send} className="nl-btn nl-btn--primary nl-btn--sm" aria-disabled={state?.connected === false}>
                Send
              </Link>
              {fees("Change the fees", "nl-btn nl-btn--quiet nl-btn--sm")}
            </>
          )
        ) : null}
      </div>
    </section>
  );
}
