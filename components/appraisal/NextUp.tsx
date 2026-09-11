"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import TermsSigning from "@/components/TermsSigning";
import ValuationSteps from "@/components/appraisal/ValuationSteps";
import WelcomeVideoRecorder from "@/components/WelcomeVideoRecorder";
import { mintPreAppraisalDeck } from "@/components/DeckRail";
import { PRE_APPRAISAL_LEAD_WORDS, bodyFor, subjectFor } from "@/lib/appraisal-email";
import { effectiveStage, needsValuation, type MarketAppraisal } from "@/lib/market-appraisal";

/**
 * THE ONE BOX THAT CHANGES (James, 11 Sep 2026).
 *
 * The third card on the appraisal page is not a fixed panel. It is whatever
 * the file needs next: make the pre-appraisal deck, build the presentation
 * to take with you, record the figure, build the post-appraisal, get the
 * terms signed, book the take-on, gather the compliance, and finally the
 * listing. One card, hot-swapped on the stage, so an agent opening the file
 * sees the next move without reading the spine.
 *
 * It is the OS's first green card: the palette's sage, the way the landlord
 * portal uses it for "what comes after". It is also kept SHORT - one
 * question at a time for the valuation, the signing panel behind a button -
 * because whatever height this box takes, the two cards beside it are
 * stretched to match.
 */

export interface SentDeck {
  token: string;
  kind: string;
  url: string;
  createdAt: string;
  opens: number;
}

export const SAGE_INK = "#56634a";
export const SAGE_WASH = "#f1f4ec";
export const SAGE = "#b3bea5";

export default function NextUp({
  ma,
  decks,
  onSaved,
  onDecksChanged,
  onAttach,
}: {
  ma: MarketAppraisal;
  /** The decks for this appraisal: undefined while reading, null if that failed. */
  decks: SentDeck[] | null | undefined;
  /** A figure was recorded or the record otherwise changed. */
  onSaved: (next: MarketAppraisal) => void;
  /** A deck was made here, or terms were signed, so the page re-reads. */
  onDecksChanged?: () => void;
  /** Show the property file (the AML step's attach button). */
  onAttach?: () => void;
}) {
  const refId = ma.leadId ?? ma.id;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);

  const latest = (kind: string) => decks?.find((s) => s.kind === kind) ?? null;
  const pre = latest("pre-appraisal");
  const deck = latest("appraisal");
  const post = latest("post-appraisal");

  const stage = effectiveStage(ma);
  const visitPassed = Boolean(ma.appointmentAt && new Date(ma.appointmentAt) < new Date());
  const missingFigure = needsValuation(ma);
  const tick = (id: string) => (ma.ticks ?? []).find((t) => t.id === id)?.done ?? false;
  const termsSigned = tick("terms-signed") || stage === "takeon" || stage === "aml" || stage === "won";

  async function makePre() {
    setBusy(true);
    setError(null);
    const r = await mintPreAppraisalDeck({ refId, landlord: ma.landlord, address: ma.address, postcode: ma.postcode, appointmentAt: ma.appointmentAt });
    if (!r.ok) setError(r.error);
    else onDecksChanged?.();
    setBusy(false);
  }

  /* ── The pre-presentation is pre-made (James, 11 Sep 2026) ──────────────
     Nobody presses "Make the deck" any more. A file with a date and no
     pre-presentation makes one the first time it is opened, and once the
     deck exists the email that carries it is put on the queue for the day
     before the visit - so the page can say "goes out on Thursday" and mean
     it. Each happens once per open; a failure is shown, not retried. */
  const minted = useRef(false);
  useEffect(() => {
    if (minted.current || decks === undefined || pre || !ma.appointmentAt || busy) return;
    if (stage !== "pre_appraisal" || new Date(ma.appointmentAt) <= new Date()) return;
    minted.current = true;
    void makePre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, pre, ma.appointmentAt, stage]);

  const queued = useRef(false);
  useEffect(() => {
    if (queued.current || !pre || !ma.landlordEmail || !ma.preSend || ma.preSend.state !== "none" || !ma.preSend.at) return;
    if (stage !== "pre_appraisal") return;
    queued.current = true;
    const invite = {
      landlordName: ma.landlord,
      address: ma.address,
      whenPretty: ma.appointmentAt
        ? new Date(ma.appointmentAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
        : "",
      startsAt: ma.appointmentAt,
      minutes: 45,
      agentName: ma.agent || "The Letting Experts",
      agentPhone: "0161 883 2525",
      presentationUrl: pre.url,
    };
    fetch("/api/scheduled-sends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "pre-appraisal", ref: refId, to: ma.landlordEmail, sendAt: ma.preSend.at,
        subject: subjectFor(invite), text: bodyFor(invite),
      }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string }) => { if (j.ok) onDecksChanged?.(); else setError(j.error ?? "Couldn't schedule the pre-presentation."); })
      .catch(() => setError("Couldn't schedule the pre-presentation."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre, ma.landlordEmail, ma.preSend?.state, stage]);

  const [declining, setDeclining] = useState(false);
  async function decline() {
    setDeclining(true);
    setError(null);
    const r = await fetch("/api/appraisals/video-chase", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: ma.id, mode: "decline" }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "That didn't save." }));
    if (!r.ok) setError(r.error ?? "That didn't save.");
    else onDecksChanged?.();
    setDeclining(false);
  }

  const sendWords = ma.preSend?.state === "sent"
    ? `went to ${ma.landlord}${ma.preSend.at ? ` on ${new Date(ma.preSend.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}` : ""}`
    : ma.preSend?.state === "queued" && ma.preSend.at
      ? `goes to ${ma.landlord} on ${new Date(ma.preSend.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${PRE_APPRAISAL_LEAD_WORDS} the visit`
      : !ma.landlordEmail
        ? "cannot go out on its own - there is no email for the landlord on this file"
        : ma.preSend?.at
          ? `goes to ${ma.landlord} ${PRE_APPRAISAL_LEAD_WORDS} the visit`
          : "has not gone out";

  const primary =
    "inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60";
  const ghost =
    "inline-flex items-center gap-2 rounded-full border border-line/70 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40";

  type Card = { icon: string; eyebrow?: string; title: string; sub?: string; body?: React.ReactNode };
  let card: Card;

  if (decks === undefined) {
    card = { icon: "clock", title: "Reading the file…" };
  } else if (stage === "lost") {
    card = { icon: "cross", eyebrow: "Outcome", title: "Marked lost", sub: "Reopen it from the top of the page if they call back." };
  } else if (stage === "won") {
    card = {
      icon: "star",
      eyebrow: "Outcome",
      title: "Won",
      sub: "This is a listing now.",
      body: (
        <Link href="/listings" className={primary}>
          Open Listings <span aria-hidden>→</span>
        </Link>
      ),
    };
  } else if (stage === "aml") {
    const items = (ma.ticks ?? []).filter((t) => t.stage === "aml");
    card = {
      icon: "shield",
      title: "AML and compliance",
      body: (
        <>
          {items.length > 0 && (
            <ul className="mb-3.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {items.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[12px]">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${t.done ? "text-white" : "border border-line/70 bg-white text-transparent"}`}
                    style={t.done ? { background: SAGE_INK } : undefined}
                  >
                    ✓
                  </span>
                  <span className={t.done ? "" : "text-muted"}>{t.label}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={onAttach} className={primary}>
            <DoodleIcon name="upload" size={14} /> Attach a certificate
          </button>
        </>
      ),
    };
  } else if (stage === "takeon") {
    card = {
      icon: "pack/photo",
      title: "Book the take-on visit",
      sub: "Terms are signed. The photographs and the description come from this visit - a diary entry, so nothing to press here yet.",
    };
  } else if (missingFigure || (visitPassed && ma.valuation == null)) {
    card = { icon: "pencil", title: "Record the figure", body: <ValuationSteps appraisal={ma} onSaved={onSaved} /> };
  } else if (ma.valuation != null && !post) {
    card = {
      icon: "magic-wand",
      title: "Build the post-appraisal deck",
      sub: "The deck they saw, plus the figure and the terms to sign.",
      body: (
        <Link href={`/market-appraisals/${ma.id}/build?kind=post-appraisal`} className={primary}>
          Build the post-appraisal <span aria-hidden>→</span>
        </Link>
      ),
    };
  } else if (ma.valuation != null && post && !termsSigned) {
    card = {
      icon: "file-contract",
      title: "Get the terms signed",
      sub: post.opens > 0 ? `The post-appraisal deck has been opened ${post.opens} time${post.opens === 1 ? "" : "s"}.` : "The post-appraisal deck is made and not yet opened.",
      body: signing ? (
        <TermsSigning appraisalId={ma.id} landlord={ma.landlord} onSigned={() => onDecksChanged?.()} />
      ) : (
        <button type="button" onClick={() => setSigning(true)} className={primary}>
          Send the terms for signature <span aria-hidden>→</span>
        </button>
      ),
    };
  } else if (!pre) {
    card = ma.appointmentAt && new Date(ma.appointmentAt) > new Date()
      ? { icon: "mail", title: "Preparing your pre-presentation…", sub: "It is made from the file. Nothing to press." }
      : {
          icon: "mail",
          title: "Make the pre-presentation",
          sub: ma.appointmentAt ? "The visit has been, so it will not go out on its own." : "There is no date on this appraisal, so it cannot be scheduled.",
          body: (
            <button type="button" onClick={makePre} disabled={busy} className={primary}>
              {busy ? "Making it…" : "Make it anyway"}
            </button>
          ),
        };
  } else if (stage === "pre_appraisal" && ma.videoState !== "recorded" && ma.videoState !== "declined") {
    /* The one choice at this stage: a video from you on the front of the
       pre-presentation, or send it as it is. Either way it goes. */
    card = {
      icon: "magic-wand",
      title: "Record a personalised video for your appraisal",
      sub: `Your pre-presentation is ready and ${sendWords}. A short video from you on the front of it is what makes it yours.`,
      body: (
        <div className="flex flex-wrap items-center gap-2">
          <WelcomeVideoRecorder compact token={pre.token} address={ma.address} label="Record a video" className={primary} onDone={() => onDecksChanged?.()} />
          <button type="button" onClick={() => void decline()} disabled={declining} className={ghost}>
            {declining ? "Saving…" : "Send it without a video"}
          </button>
        </div>
      ),
    };
  } else if (!deck) {
    card = {
      icon: "magic-wand",
      title: "Build your presentation",
      sub: `The deck you take with you on the day.${
        stage === "pre_appraisal"
          ? ` Your pre-presentation ${sendWords}${
              (ma.preSend?.state === "queued" || ma.preSend?.state === "sent")
                ? ma.videoState === "recorded" ? ", with your video on it" : ma.videoState === "declined" ? ", without a video" : ""
                : ""
            }.`
          : ""
      }`,
      body: (
        <Link href={`/market-appraisals/${ma.id}/build`} className={primary}>
          Build the presentation <span aria-hidden>→</span>
        </Link>
      ),
    };
  } else {
    card = {
      icon: "rocket",
      title: "Ready for the visit",
      sub: "Show the deck, then record the figure here while it is fresh.",
      body: (
        <a href={deck.url} target="_blank" rel="noreferrer" className={ghost}>
          Open the presentation
        </a>
      ),
    };
  }

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-[22px] p-5" style={{ background: SAGE_WASH }}>
      {/* Soft curves bottom right, the way the landlord's "next step" card has them. */}
      <span aria-hidden className="pointer-events-none absolute -bottom-20 -right-14 h-48 w-48 rounded-full" style={{ background: `${SAGE}33` }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 right-16 h-44 w-44 rounded-full bg-white/50" />

      <div className="relative">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
            <DoodleIcon name={card.icon} size={16} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: SAGE_INK }}>
              {card.eyebrow ?? "Next up"}
            </p>
            <h2 className="hand mt-0.5 text-[18px] leading-tight">{card.title}</h2>
            {card.sub && <p className="mt-1 text-[12px] leading-relaxed text-muted">{card.sub}</p>}
          </div>
        </div>
        {card.body && <div className="mt-4">{card.body}</div>}
        {error && <p className="mt-2 text-[11.5px] text-accent-dark">{error}</p>}
      </div>
    </section>
  );
}
