"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { LandlordView, ViewOffer } from "@/lib/landlord-view";

/**
 * THE OFFERS, ONE AT A TIME, IN A SHEET.
 *
 * James, 16 Sep 2026: "rather than showing the offers on the homepage where it
 * says Offers ... when they click View Offers, in Your Next Step ... it should
 * pull up bottom tabs, and they'll be able to swipe between the different
 * offers that they've got. If it's just one, it'll just sit on the page."
 *
 * The homepage list it replaces was a row per offer - an amount, a name and a
 * date - which is the right shape for being TOLD about offers and the wrong
 * one for choosing between them. Choosing needs everything about one applicant
 * on screen at once, and then the next one in the same places, so the eye can
 * compare down the page rather than across a table.
 *
 * ── Approve, and no decline ────────────────────────────────────────────────
 *
 * "We won't give them a decline button, and the simple reason why is that if
 * they decline someone and they want to come back to it, it's going to be
 * really difficult." Right, and it is also the kinder design: a landlord who
 * says nothing has said nothing, and the agent is still free to talk to them
 * about anybody. A row of decline buttons turns a conversation into a
 * scoreboard.
 *
 * ── What Approve actually does ─────────────────────────────────────────────
 *
 * It tells the agent. REX and Propoly are read-only from the OS, so nothing
 * here accepts an application, and the button and the note under it say so in
 * those words. A landlord who thinks a tenancy is agreed and stops answering
 * the phone is a far worse failure than one who presses a button twice.
 */

export default function OffersSheet({
  v,
  offers,
  open,
  onClose,
}: {
  v: LandlordView;
  offers: ViewOffer[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const strip = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState(0);
  const [w, setW] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);
  /** Approved in THIS session, so the button changes without a reload. */
  const [justApproved, setJustApproved] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open, onClose]);

  /* Measured rather than assumed: the sheet is full width on a phone and
     capped on a desktop, and the strip has to agree with whichever it got. */
  useEffect(() => {
    if (!open) return;
    const measure = () => setW(strip.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  const onScroll = () => {
    const el = strip.current;
    if (!el || !w) return;
    const now = Math.max(0, Math.min(offers.length - 1, Math.round(el.scrollLeft / w)));
    if (now !== at) setAt(now);
  };

  const go = useCallback(
    (i: number) => {
      const el = strip.current;
      if (!el || !w) return;
      el.scrollTo({ left: Math.max(0, Math.min(offers.length - 1, i)) * w, behavior: "smooth" });
    },
    [w, offers.length]
  );

  async function approve(o: ViewOffer) {
    if (v.sample) {
      setNote({
        text: `On the sample nothing is filed. On a landlord's own file this tells ${first(v)} they are happy with ${o.applicants}.`,
        err: false,
      });
      return;
    }
    setBusy(o.id);
    setNote(null);
    try {
      const res = await fetch("/api/landlord/offers/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: o.id, appraisalId: v.appraisalId ?? null, p: params?.get("p") ?? null }),
      });
      const j = (await res.json()) as { ok?: boolean; told?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "That did not go through.");
      setJustApproved(o.id);
      setNote({
        text: j.told
          ? `${first(v)} has been told. They will confirm it with ${o.applicants} and come back to you.`
          : `Saved to your file. ${first(v)} will see it - the email did not go out, so give them a nudge if you do not hear back.`,
        err: false,
      });
      router.refresh();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "That did not go through.", err: true });
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;
  const many = offers.length > 1;
  const standing = justApproved ?? v.approvedOfferId ?? null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      style={{ background: "rgba(43, 32, 29, 0.5)", animation: "offers-dim 240ms ease-out both" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="The offers on your property"
    >
      <style>{`
        @keyframes offers-dim { from { opacity: 0 } to { opacity: 1 } }
        @keyframes offers-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .offers-sheet { animation: none !important } }
      `}</style>

      <div
        className="offers-sheet flex max-h-[94dvh] w-full max-w-[560px] flex-col rounded-t-[26px] bg-[#faf9f7]"
        style={{ animation: "offers-rise 360ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── the head, which stays while the offers move under it ── */}
        <div className="shrink-0 px-5 pb-1 pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mx-auto mb-4 block h-1.5 w-11 rounded-full bg-line"
          />
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[21px] leading-tight">
              {offers.length === 1 ? "The offer on your property" : `${offers.length} offers on your property`}
            </h2>
            {many && (
              <span className="shrink-0 text-[12px] text-muted">
                {at + 1} of {offers.length}
              </span>
            )}
          </div>
          {/* James: "we should also mention that there might be more offers.
              You don't have to take any offer, but at the same time, you can
              always think about it." The whole of that, in the one place a
              landlord is deciding. */}
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            More may still come in, and you do not have to take any of them. Take your time - nothing here expires.
          </p>
        </div>

        {/* ── one offer a screen ── */}
        <div
          ref={strip}
          onScroll={onScroll}
          /* min-h-0 is load-bearing: a flex child will not shrink below its
             content without it, so the sheet grew past 94dvh and took the
             Approve button off the bottom of the screen with it. */
          className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain"
          style={{ scrollSnapType: many ? "x mandatory" : undefined, scrollbarWidth: "none" }}
        >
          <div className="flex" style={{ width: w ? w * offers.length : "100%" }}>
            {offers.map((o) => (
              <section
                key={o.id}
                className="shrink-0 px-5 pb-2 pt-3"
                style={{ width: w || "100%", scrollSnapAlign: "start" }}
                aria-label={`Offer from ${o.applicants}`}
              >
                <Offer o={o} approved={standing === o.id} />
              </section>
            ))}
          </div>
        </div>

        {/* ── the dots, then the one button ── */}
        <div
          className="shrink-0 border-t border-line/60 bg-white px-5 pt-3"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          {many && (
            <div className="mb-3 flex items-center justify-center gap-2">
              {offers.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  aria-label={`Offer ${i + 1}`}
                  onClick={() => go(i)}
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: i === at ? 22 : 8,
                    background: i === at ? "var(--accent-dark, #56423e)" : "rgba(0,0,0,0.16)",
                  }}
                />
              ))}
            </div>
          )}

          {note && (
            <p
              className={`mb-3 rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed ${
                note.err ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted"
              }`}
              style={note.err ? undefined : { background: "#f1f4ec", color: "#56634a" }}
            >
              {note.text}
            </p>
          )}

          {(() => {
            const o = offers[at];
            if (!o) return null;
            const mine = standing === o.id;
            if (mine) {
              return (
                <p
                  className="flex items-center justify-center gap-2.5 rounded-full py-3.5 text-[14px] font-semibold"
                  style={{ background: "#f1f4ec", color: "#56634a" }}
                >
                  <DoodleIcon name="shield" size={15} />
                  You approved {o.applicants}
                </p>
              );
            }
            return (
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => void approve(o)}
                className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-accent-dark text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {busy === o.id ? "Telling your agent…" : `Approve ${o.applicants}`}
              </button>
            );
          })()}

          <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-muted">
            {many ? "Swipe between the offers. " : ""}
            Approving tells {first(v)} you are happy with this one - they confirm it with the tenant.
          </p>
        </div>
      </div>
    </div>
  );
}

const first = (v: LandlordView) => v.agent?.name.split(/\s+/)[0] ?? "your agent";

/** One applicant, everything in the same place on every card. */
function Offer({ o, approved }: { o: ViewOffer; approved: boolean }) {
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  /* Under 30% of income is the usual affordability line, so the figure is
     coloured against it rather than left as a number nobody can place. */
  const easy = o.affordabilityPct != null && o.affordabilityPct <= 35;

  const rows: Array<[string, string]> = [
    ["Who", o.who],
    ...(o.moveIn ? ([["Wants to move in", day(o.moveIn)!]] as Array<[string, string]>) : []),
    ...(o.term ? ([["Tenancy", o.term]] as Array<[string, string]>) : []),
    ...(o.employment ? ([["Work", o.employment]] as Array<[string, string]>) : []),
    ...(o.income ? ([["Household income", o.income]] as Array<[string, string]>) : []),
    ...(o.guarantor != null ? ([["Guarantor", o.guarantor ? "Offered" : "None offered"]] as Array<[string, string]>) : []),
    ...(o.landlordRef != null
      ? ([["Landlord reference", o.landlordRef ? "Available" : "Not available"]] as Array<[string, string]>)
      : []),
    ...(o.received ? ([["Received", day(o.received)!]] as Array<[string, string]>) : []),
  ];

  return (
    <div>
      {/* ── the money, first and biggest ── */}
      <div className="rounded-[22px] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Offered</p>
            <p className="mt-1 text-[30px] leading-none">{o.amount}</p>
            <p className="mt-2 text-[14px] font-semibold">{o.applicants}</p>
          </div>
          <span
            className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold"
            style={
              approved
                ? { background: "#f1f4ec", color: "#56634a" }
                : o.status === "accepted"
                  ? { background: "#f1f4ec", color: "#56634a" }
                  : { background: "var(--accent-soft, #fdefec)", color: "var(--accent-dark, #56423e)" }
            }
          >
            {approved ? "You approved this" : o.statusLabel}
          </span>
        </div>

        {o.affordabilityPct != null && (
          <div className="mt-4 border-t border-line/60 pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted">Rent against their income</span>
              <span className="text-[15px] font-semibold" style={{ color: easy ? "#56634a" : undefined }}>
                {Math.round(o.affordabilityPct)}%
              </span>
            </div>
            <span className="mt-2 block h-[6px] w-full overflow-hidden rounded-full bg-black/[0.07]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(4, Math.min(100, o.affordabilityPct))}%`,
                  background: easy ? "#b3bea5" : "var(--accent-dark, #56423e)",
                }}
              />
            </span>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              {easy
                ? "Comfortably within what referencing looks for, which is about a third."
                : "Above the third of income referencing usually looks for. Your agent will talk you through it."}
            </p>
          </div>
        )}
      </div>

      {/* ── the rest, same order on every card ── */}
      <dl className="mt-3 rounded-[22px] bg-white px-5 py-1">
        {rows.map(([k, val]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 border-b border-line/50 py-3 last:border-b-0">
            <dt className="shrink-0 text-[12.5px] text-muted">{k}</dt>
            <dd className="text-right text-[13.5px] font-medium">{val}</dd>
          </div>
        ))}
      </dl>

      {o.conditions && (
        <div className="mt-3 rounded-[22px] p-5" style={{ background: "var(--accent-soft, #fdefec)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-dark/60">What they asked for</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed">{o.conditions}</p>
        </div>
      )}
    </div>
  );
}
