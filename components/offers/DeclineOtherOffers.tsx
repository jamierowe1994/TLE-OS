"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import CustomerUpdates from "@/components/CustomerUpdates";

/**
 * DECLINE OTHER OFFERS (James, 22 Oct 2026): "the option to reject the other
 * offers" from the listing, once one is accepted, rather than only from inside
 * Take It Offline.
 *
 * The house rule stands (9 Oct 2026, lib/offer-hold): the others are HELD
 * until the accepted tenant's holding fee is in, in case they drop out. So
 * this says so first, and before the fee it is the agent's own "decline
 * anyway". Then it is the same road Take It Offline takes - POST
 * /api/offers/release-others declines each one and drafts a "not this one"
 * with homes on nearby - and the drafts open right here, each to read,
 * change and send from the agent (components/CustomerUpdates), or ring instead.
 * Nothing reaches a tenant until they press Send.
 */

type Offer = { ref: string; name: string; amount: number | null; people: number };
type Fee = { settled: boolean; paidAt: string | null; words: string };

const gbp = (n: number | null) => (n == null ? "" : `£${n.toLocaleString("en-GB")}`);
const first = (n: string) => n.trim().split(/[\s&]+/)[0] || "there";

export default function DeclineOtherOffers({
  listingId,
  home,
  acceptedName,
  onClose,
  onDone,
}: {
  listingId: string;
  home: string;
  /** The accepted offer's name, for the hold line. */
  acceptedName: string;
  onClose: () => void;
  /** Declined: the Offers list reads again. */
  onDone: () => void;
}) {
  const [letId, setLetId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const a = (await fetch(`/api/listings/offline?listing=${encodeURIComponent(listingId)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null)) as { ok?: boolean; acceptedId?: string | null; error?: string } | null;
      if (!live) return;
      const id = a?.acceptedId ?? null;
      if (!id) {
        setErr(a?.error ?? "The accepted offer couldn't be found on this home just now. Try again in a minute.");
        setOffers([]);
        return;
      }
      setLetId(id);
      const j = (await fetch(`/api/offers/release-others?application=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null)) as { ok?: boolean; fee?: Fee; offers?: Offer[]; error?: string } | null;
      if (!live) return;
      if (!j?.ok) {
        setErr(j?.error ?? "The other offers couldn't be read just now.");
        setOffers([]);
        return;
      }
      setFee(j.fee ?? null);
      setOffers(j.offers ?? []);
      setPicked(new Set((j.offers ?? []).map((o) => o.ref)));
    })();
    return () => {
      live = false;
    };
  }, [listingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const chosen = (offers ?? []).filter((o) => picked.has(o.ref));
  const held = fee ? !fee.settled : false;

  async function decline() {
    if (!letId || !chosen.length || busy) return;
    setBusy(true);
    setErr(null);
    const j = (await fetch("/api/offers/release-others", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: letId, refs: chosen.map((o) => o.ref), reason: held ? "early" : undefined }),
    })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; declined?: number; error?: string } | null;
    setBusy(false);
    if (!j?.ok) return setErr(j?.error ?? "That didn't save - the connection dropped. Try again.");
    setDeclined(j.declined ?? chosen.length);
    onDone();
  }

  const body = (
    <div role="dialog" aria-modal="true" aria-label="Decline other offers" className="fixed inset-0 z-[150] flex items-center justify-center p-4" data-steve-never>
      <button type="button" aria-label="Close" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="shrink-0 border-b border-line/70 px-6 py-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{home}</p>
          <h2 className="mt-0.5 text-[19px] leading-tight">{declined == null ? "Decline Other Offers" : "Read and Send Each One"}</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {offers === null ? (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Reading the other offers and the holding fee…
            </p>
          ) : declined != null ? (
            <>
              <p className="flex items-start gap-2.5 rounded-xl bg-[#e8eedf] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#3f5a32]">
                <span aria-hidden className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#3f5a32] text-[10px] text-white">✓</span>
                <span>
                  {declined} {declined === 1 ? "offer" : "offers"} declined. Nothing has been sent yet: press Email them on each to read it, change anything, and send it from you. Or ring them and note it.
                </span>
              </p>
              <div className="mt-4">
                {letId && <CustomerUpdates applicationId={letId} openOnly />}
              </div>
            </>
          ) : !offers.length ? (
            <p className="text-[12.5px] leading-relaxed text-muted">{err ?? "No other offers are waiting on this home."}</p>
          ) : (
            <>
              {/* The hold rule, said before anything is pressed. */}
              {held ? (
                <div className="rounded-2xl border border-accent-dark/30 bg-accent-soft px-4 py-3 text-[12.5px] leading-relaxed">
                  <p className="font-semibold">Held until {acceptedName}&apos;s holding fee is in</p>
                  <p className="mt-1 text-ink/75">
                    {fee?.words}. We keep the other offers open until it is, in case {first(acceptedName)} drops out and you need to go back to one of them. Decline them now anyway?
                  </p>
                </div>
              ) : (
                <p className="rounded-2xl bg-[#e8eedf] px-4 py-3 text-[12.5px] leading-relaxed text-[#3f5a32]">
                  {fee?.words ?? "Holding fee in"}, so the other offers can go.
                </p>
              )}

              <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Offers to decline</p>
              <ul className="mt-2 space-y-1.5">
                {offers.map((o) => (
                  <li key={o.ref}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line/60 bg-white px-3 py-2.5 text-[12.5px]">
                      <input
                        type="checkbox"
                        className="accent-[var(--brown)]"
                        checked={picked.has(o.ref)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(o.ref);
                            else n.delete(o.ref);
                            return n;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      {o.amount != null && <span className="figures shrink-0 text-muted">{gbp(o.amount)}</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">Untick anyone you want to keep as a back-up.</p>

              <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">What they&apos;ll read</p>
              <div className="mt-2 rounded-xl border border-dashed border-line/80 bg-white px-3.5 py-3 text-[12px] leading-relaxed text-muted">
                <p className="font-semibold text-ink">{home}: not this time</p>
                <p className="mt-1">
                  Hi {first(chosen[0]?.name ?? offers[0].name)}, I&apos;m sorry to tell you the landlord has decided not to go ahead with your application for {home}. It happens, and it isn&apos;t the end of your search. Your details are still with us, so your next application can go in quickly.
                </p>
                <p className="mt-1">Then the homes we have on nearby at a similar rent, and &quot;Reply with any you&apos;d like to see and I&apos;ll book it in straight away.&quot;</p>
              </div>
              <p className="mt-2 text-[11px] text-muted">Each one is drafted for you to read, change and send next. Nothing goes from this screen.</p>
              {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50"
          >
            {declined != null ? "Done" : "Cancel"}
          </button>
          {declined == null && (offers?.length ?? 0) > 0 && (
            <PressButton
              onClick={() => void decline()}
              disabled={busy || !chosen.length}
              className={`press-ring flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-semibold ${!busy && chosen.length ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
            >
              <DoodleIcon name="mail" size={13} className={!busy && chosen.length ? "invert" : ""} />
              {busy ? "Declining…" : `${held ? "Decline Anyway" : "Decline"} (${chosen.length}) and Draft Emails`}
            </PressButton>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
