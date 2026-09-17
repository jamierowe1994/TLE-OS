"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick, PressButton } from "@/components/Bits";

/**
 * One property, out to the book - Mail the database on a listing.
 *
 * The mirror of Email properties on a lead: there, one person and many
 * properties; here, one property and many people. An agent does it every
 * time something new goes live.
 *
 * REAL SINCE 17 SEP 2026. It used to list the demo book and say "Sent to 3
 * applicants" with nothing sent, so an agent would believe the home had been
 * marketed. Now the people are the tenant enquiries of the last 90 days who
 * asked about a similar home nearby (app/api/listings/email-out), the email
 * is the real Homes That Fit as the server draws it, and Send reports what
 * actually went, including "switched off".
 *
 * The list is MATCHED, not everybody. Blasting every tenant with a £1,650
 * flat is how a database learns to ignore you, so the reason is printed on
 * every row, and the agent unticks anyone who should not get it.
 */

type Listing = {
  id: string; name: string; locality: string; rent: number | null; rentPeriod?: "month" | "week" | null;
};

type Person = {
  email: string;
  name: string;
  askedAbout: string;
  askedRent: number | null;
  askedPer: string;
  askedAt: string | null;
  why: string[];
};

type Found =
  | { state: "loading" }
  | { state: "failed"; said: string }
  | { state: "ready"; people: Person[]; total: number; alreadySent: number; days: number; perPress: number };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

export default function EmailToTenants({
  open,
  onClose,
  listing,
}: {
  open: boolean;
  onClose: () => void;
  listing: Listing | null;
}) {
  const [found, setFound] = useState<Found>({ state: "loading" });
  const [chosen, setChosen] = useState<string[]>([]);
  const [find, setFind] = useState("");
  const [stage, setStage] = useState<"pick" | "review" | "sent">("pick");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentSaid, setSentSaid] = useState("");
  const [sentCount, setSentCount] = useState(0);

  const id = listing?.id ?? null;
  useEffect(() => {
    if (!open || !id) return;
    let live = true;
    setFound({ state: "loading" });
    setChosen([]);
    setFind("");
    setStage("pick");
    setPreview(null);
    setSendError(null);
    setSentSaid("");
    fetch(`/api/listings/email-out?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; said?: string; people?: Person[]; total?: number; alreadySent?: number; days?: number; perPress?: number }) => {
        if (!live) return;
        if (!j.ok || !Array.isArray(j.people)) {
          setFound({ state: "failed", said: j.said ?? "The matches did not load. Try again in a minute." });
          return;
        }
        const perPress = j.perPress ?? 50;
        setFound({ state: "ready", people: j.people, total: j.total ?? j.people.length, alreadySent: j.alreadySent ?? 0, days: j.days ?? 90, perPress });
        /* Everybody matched is ticked, up to what one press may send. */
        setChosen(j.people.slice(0, perPress).map((p) => p.email));
      })
      .catch(() => live && setFound({ state: "failed", said: "The matches did not load. Try again in a minute." }));
    return () => {
      live = false;
    };
  }, [open, id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !listing) return null;

  const people = found.state === "ready" ? found.people : [];
  const perPress = found.state === "ready" ? found.perPress : 50;
  const picked = people.filter((p) => chosen.includes(p.email));
  const tooMany = picked.length > perPress;
  const needle = find.trim().toLowerCase();
  const visible = people.filter((p) => !needle || `${p.name} ${p.email} ${p.askedAbout}`.toLowerCase().includes(needle));
  const per = listing.rentPeriod === "week" ? "per week" : "pcm";

  async function openReview() {
    setStage("review");
    setPreview(null);
    setPreviewError(null);
    try {
      const r = await fetch("/api/listings/email-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: listing!.id, emails: picked.map((p) => p.email), preview: true }),
      });
      const j = (await r.json()) as { ok?: boolean; subject?: string; html?: string; said?: string };
      if (j.ok && j.html) setPreview({ subject: j.subject ?? "", html: j.html });
      else setPreviewError(j.said ?? "The email could not be drawn.");
    } catch {
      setPreviewError("The email could not be drawn.");
    }
  }

  async function send() {
    if (!picked.length || tooMany || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch("/api/listings/email-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: listing!.id, emails: picked.map((p) => p.email) }),
      });
      const j = (await r.json()) as { ok?: boolean; said?: string; sent?: number };
      if (j.ok) {
        setSentSaid(j.said ?? "");
        setSentCount(j.sent ?? picked.length);
        setStage("sent");
      } else setSendError(j.said ?? "It did not send.");
    } catch {
      setSendError("It did not send - the OS could not be reached.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />

      <div className="fade-up relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "sent" ? "On its way" : stage === "review" ? "Review email" : "Email this property out"}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {listing.name}
              {listing.rent != null && ` · £${listing.rent.toLocaleString("en-GB")} ${per}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {stage === "sent" && (
            <div className="flex flex-col items-center py-8 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">
                Sent to {sentCount} {sentCount === 1 ? "person" : "people"}
              </p>
              {sentSaid && <p className="mt-1.5 max-w-sm text-[12.5px] text-muted">{sentSaid}</p>}
            </div>
          )}

          {stage === "pick" && found.state === "loading" && (
            <div className="flex items-center gap-2.5 py-10 text-[12.5px] text-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
              Finding the people this home suits…
            </div>
          )}

          {stage === "pick" && found.state === "failed" && <p className="py-6 text-[12.5px] leading-relaxed text-accent-dark">{found.said}</p>}

          {stage === "pick" && found.state === "ready" && (
            <>
              <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
                {found.total
                  ? `${found.total} ${found.total === 1 ? "person" : "people"} asked about a similar home nearby in the last ${found.days} days${
                      found.total > perPress ? `. The ${perPress} most recent are ticked, the most one send can take` : ", and are ticked"
                    }. Untick anyone who should not get it.`
                  : `Nobody who enquired in the last ${found.days} days asked about a similar home nearby.`}
                {found.alreadySent > 0 && ` ${found.alreadySent} more ${found.alreadySent === 1 ? "has" : "have"} already been sent this one.`}
              </p>
              {people.length > 8 && (
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Search by name, email or the home they asked about"
                  className="mb-3 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                />
              )}
              <ul className="space-y-2.5">
                {visible.map((p) => {
                  const on = chosen.includes(p.email);
                  return (
                    <li key={p.email}>
                      <button
                        type="button"
                        onClick={() => setChosen((c) => (on ? c.filter((x) => x !== p.email) : [...c, p.email]))}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                          on ? "border-accent-dark bg-accent-soft/40" : "border-line/60"
                        }`}
                      >
                        <span
                          className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            on ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                          }`}
                        >
                          {on && "✓"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="hand block truncate text-[13px]">{p.name}</span>
                          <span className="block truncate text-[10.5px] text-muted">
                            Asked about {p.askedAbout}
                            {p.askedRent != null && `, £${p.askedRent.toLocaleString("en-GB")} ${p.askedPer}`}
                            {p.askedAt && ` · ${when(p.askedAt)}`}
                          </span>
                        </span>
                        {/* Why they're here - a suggestion that won't say why
                            is a suggestion nobody trusts. */}
                        <span className="hidden shrink-0 gap-1.5 sm:flex">
                          {p.why.map((w) => (
                            <span key={w} className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] font-semibold text-accent-dark">
                              {w}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {people.length > 0 && !visible.length && <p className="py-6 text-center text-[12px] text-muted">Nobody matches that search.</p>}
              </ul>
            </>
          )}

          {stage === "review" && (
            /* The email itself, as the server renders it. Each person gets
               their own, with their own name and passport button. */
            <div>
              {preview ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Subject</p>
                  <p className="mt-1 text-[14px] font-semibold">{preview.subject}</p>
                  <iframe title="The email" srcDoc={preview.html} className="mt-3 h-[480px] w-full rounded-2xl border border-line/70 bg-white" />
                  <p className="mt-3 text-[10.5px] text-muted">
                    Sent individually, not as one thread - {picked.length} separate email{picked.length === 1 ? "" : "s"}, so nobody sees
                    anybody else&apos;s address.
                  </p>
                </>
              ) : previewError ? (
                <p className="text-[12.5px] text-accent-dark">{previewError}</p>
              ) : (
                <p className="text-[12.5px] text-muted">Drawing the email&hellip;</p>
              )}
            </div>
          )}
        </div>

        {stage !== "sent" && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
            <button
              type="button"
              onClick={() => (stage === "review" ? setStage("pick") : openReview())}
              disabled={!picked.length}
              className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-40"
            >
              {stage === "review" ? "← Back" : "Review email"}
            </button>
            {(sendError || tooMany) && (
              <p className="order-first min-w-0 basis-full text-[12px] leading-snug text-accent-dark sm:order-none sm:flex-1 sm:basis-auto sm:text-right">
                {sendError ?? `${perPress} at most in one send. Untick ${picked.length - perPress}.`}
              </p>
            )}
            <PressButton
              onClick={send}
              className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                picked.length && !tooMany ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <DoodleIcon name="mail" size={15} />
                {sending ? "Sending…" : `Send to ${picked.length || "…"}`}
              </span>
            </PressButton>
          </div>
        )}
      </div>
    </div>
  );
}
