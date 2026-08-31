"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import WelcomeVideoRecorder from "@/components/WelcomeVideoRecorder";
import { Pill } from "@/components/Wire";
import { DECK_KINDS, type DeckKind } from "@/lib/present";

/**
 * THE THREE DECKS FOR ONE APPRAISAL, in the order a landlord meets them.
 *
 * ── Why this replaced a row of buttons ────────────────────────────────────
 *
 * The appraisal page used to offer "Build the presentation" beside "Record the
 * valuation" and "Certificates" — three buttons of equal weight, in no order,
 * with nothing saying which had been done. James, 31 Aug: the spine across the
 * top makes it obvious WHERE a landlord is, and then the buttons underneath
 * threw that away.
 *
 * So the decks are laid out as a sequence with state on each one: what it is,
 * whether it exists, whether it has been opened, and the one action that moves
 * it on. An agent should be able to answer "what have they actually seen?"
 * without opening anything.
 *
 * ── Two honest gates ──────────────────────────────────────────────────────
 *
 * 1. **Nothing here sends.** The pre-appraisal is meant to go out by itself the
 *    day before, and it cannot yet: Resend refuses every non-TLE domain at the
 *    transport (lib/email-policy) and REX MailMerge refuses without
 *    REX_ALLOW_WRITES. Both are deliberate. The card says so rather than
 *    offering a Send button that would throw.
 * 2. **Post-appraisal is locked until a valuation exists.** Shown as locked
 *    WITH the reason, because a card that is simply absent reads as a page
 *    missing something rather than a step that is waiting. The valuation panel
 *    sits directly above, so the way to unlock it is the next thing on screen.
 */

interface SentDeck {
  token: string;
  kind: string;
  url: string;
  createdAt: string;
  authorName: string;
  opens: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

export default function DeckRail({
  appraisalId,
  refId,
  address,
  postcode,
  landlord,
  appointmentAt,
  hasValuation,
}: {
  appraisalId: string;
  /** What os_presentations.ref is keyed on — the lead where there is one. */
  refId: string;
  address: string;
  postcode: string;
  landlord: string;
  appointmentAt: string | null;
  /** Gates the post-appraisal deck. Always false today — nothing writes one. */
  hasValuation: boolean;
}) {
  const [sent, setSent] = useState<SentDeck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/presentations?ref=${encodeURIComponent(refId)}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as { ok?: boolean; sent?: SentDeck[]; error?: string };
      if (j.ok && j.sent) setSent(j.sent);
      else setError(j.error ?? "Couldn't read the decks for this appraisal.");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Newest of each kind. A deck is re-minted whenever an agent rebuilds it, so
     the list can hold several of one kind — the most recent is the one that
     matters and the rest are history, not choices. */
  const latest = (kind: DeckKind): SentDeck | null =>
    sent?.find((s) => s.kind === kind) ?? null;

  async function mintPre() {
    setMinting(true);
    setError(null);
    try {
      const r = await fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ref: refId,
          kind: "pre-appraisal",
          recipientName: landlord,
          address,
          postcode,
          /* The appointment IS the pre-appraisal deck's job, so it is passed
             rather than left to the deck's own "we'll confirm a time" fallback. */
          whenPretty: appointmentAt
            ? new Date(appointmentAt).toLocaleString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "numeric",
                minute: "2-digit",
              })
            : "",
          startsAt: appointmentAt,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) setError(j.error ?? "Couldn't create the pre-appraisal deck.");
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMinting(false);
    }
  }

  const pre = latest("pre-appraisal");
  const appraisal = latest("appraisal");
  const post = latest("post-appraisal");

  const Card = ({
    kind,
    children,
    deck,
    locked,
  }: {
    kind: DeckKind;
    children: React.ReactNode;
    deck: SentDeck | null;
    locked?: string;
  }) => {
    const meta = DECK_KINDS.find((k) => k.id === kind)!;
    return (
      <div
        className={`rounded-2xl border p-5 ${
          locked ? "border-line/60 bg-panel/50" : "border-line/80 bg-panel"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold">{meta.label}</p>
            <p className="mt-1 text-[11.5px] leading-snug text-muted">{meta.blurb}</p>
          </div>
          <span className="shrink-0">
            {locked ? (
              <Pill tone="neutral">Waiting</Pill>
            ) : deck ? (
              <Pill tone="accent">{deck.opens > 0 ? `Opened ${deck.opens}×` : "Not opened"}</Pill>
            ) : (
              <Pill tone="neutral">Not made</Pill>
            )}
          </span>
        </div>

        {deck && (
          <p className="mt-3 text-[11px] text-muted">
            Made {when(deck.createdAt)} by {deck.authorName}
            {deck.firstOpenedAt ? ` · first opened ${when(deck.firstOpenedAt)}` : ""}
          </p>
        )}
        {locked && <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{locked}</p>}

        <div className="mt-4">{children}</div>
      </div>
    );
  };

  const btn = "rounded-lg px-3.5 py-2 text-[12.5px]";
  const primary = `${btn} bg-accent-dark font-semibold text-white`;
  const ghost = `${btn} border border-line/80`;

  if (error && !sent) {
    return (
      <div className="rounded-2xl border border-accent-dark/40 bg-accent-soft/30 p-5">
        <p className="text-[12.5px]">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-3 text-[12px]">
          {error}
        </p>
      )}

      <Card kind="pre-appraisal" deck={pre}>
        {pre ? (
          <>
            <div className="flex flex-wrap gap-2">
              <a href={pre.url} target="_blank" rel="noreferrer" className={ghost}>
                Review the deck
              </a>
            </div>
            {/* THE RECORDER MOVES HERE from the lead drawer, where it only
                appeared inside the email composer and only after a deck had
                been minted — so in practice nobody found it. This is the
                screen an agent opens the day before a visit. */}
            <div className="mt-3 border-t border-line/70 pt-3">
              <WelcomeVideoRecorder compact token={pre.token} address={address} />
            </div>
          </>
        ) : (
          <button type="button" onClick={mintPre} disabled={minting} className={primary}>
            {minting ? "Making it…" : "Make the pre-appraisal deck"}
          </button>
        )}
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
          This is the one that goes out on its own, the day before. Sending is switched off
          across the OS, so nothing reaches a landlord yet — the deck and the video can be
          prepared and reviewed now.
        </p>
      </Card>

      <Card kind="appraisal" deck={appraisal}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/market-appraisals/${appraisalId}/build`} className={primary}>
            {appraisal ? "Rebuild it" : "Build the presentation"}
          </Link>
          {appraisal && (
            <a href={appraisal.url} target="_blank" rel="noreferrer" className={ghost}>
              Review the deck
            </a>
          )}
        </div>
      </Card>

      <Card
        kind="post-appraisal"
        deck={post}
        locked={
          hasValuation
            ? undefined
            : "It carries the figure you agreed and the terms to sign, so it cannot be built until a valuation has been recorded against this appraisal."
        }
      >
        {hasValuation ? (
          <Link href={`/market-appraisals/${appraisalId}/build?kind=post-appraisal`} className={primary}>
            {post ? "Rebuild it" : "Build the post-appraisal"}
          </Link>
        ) : (
          <span className="text-[11px] text-muted">
            Record the rent agreed in the panel above and this unlocks.
          </span>
        )}
      </Card>
    </div>
  );
}
