"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";

/**
 * After the viewing, from the lead (Dan Richards, 16 Oct 2026: "I want to
 * progress it ... because the viewer wants to offer but I don't have a
 * 'viewing done' button", and "I can't find the new 'send offer form'
 * button").
 *
 * The tenant track ends at Viewings, so a lead who had been round sat on
 * "Book a viewing" with nowhere to go. The two ways on already existed, on the
 * listing and the viewing - this puts them on the lead, for the home they saw:
 *
 *   Make an offer    - the offer form (/offers/new), this person and this home
 *                      already chosen, for the agent to fill in with them.
 *   Send offer form  - emails them the listing's offer link (offer-link-invite,
 *                      POST /api/listings/application-form kind "offer"), the
 *                      same send as the listing's Offer Link card. The customer
 *                      email switch still decides whether it really goes.
 *
 * Either way the offer lands on the listing's Offers tab. It is not an
 * application until it is accepted there (lib/application-journey).
 */
export default function OfferFromViewing({
  listingId,
  address,
  name,
  email,
  small = false,
}: {
  listingId: string | null;
  address: string;
  name: string;
  email: string;
  /** The compact pair on a viewing line; the full one in Next up. */
  small?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  if (!listingId) {
    return small ? null : (
      <p className="text-[12px] leading-relaxed text-muted">
        This viewing isn&apos;t tied to a listing in the OS, so make the offer from the listing itself.
      </p>
    );
  }
  if (!email) {
    return (
      <p className={`${small ? "text-[11px]" : "text-[12px]"} leading-relaxed text-muted`}>
        Add their email address to make an offer or send the offer form.
      </p>
    );
  }

  const offerHref = `/offers/new?${new URLSearchParams({ listing: listingId, name, email })}`;

  async function send() {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fetch("/api/listings/application-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, emails: [email], kind: "offer" }),
      });
      const j = (await r.json().catch(() => ({}))) as { results?: { sent: boolean; detail: string }[]; error?: string };
      const one = j.results?.[0];
      if (one) setSaid({ ok: one.sent, text: one.sent ? `Offer form sent to ${email}.` : one.detail || "It did not send." });
      else setSaid({ ok: false, text: j.error ?? "That didn't send. Try again." });
      if (one?.sent) setAsking(false);
    } catch {
      setSaid({ ok: false, text: "That didn't send - the connection dropped. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const primary = small
    ? "inline-flex items-center gap-1.5 rounded-full bg-brown px-2.5 py-1 text-[10.5px] font-semibold text-white"
    : "press-ring inline-flex items-center gap-2 rounded-full bg-brown px-5 py-2.5 text-[13px] font-semibold text-white";
  const secondary = small
    ? "inline-flex items-center gap-1.5 rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold transition-colors hover:border-accent-dark hover:text-accent-dark"
    : "inline-flex items-center gap-2 rounded-full border border-brown/60 px-5 py-2.5 text-[13px] font-semibold text-brown transition-colors hover:bg-brown hover:text-white";

  return (
    <div className={small ? "mt-1.5" : ""}>
      <div className={`flex flex-wrap items-center ${small ? "gap-1.5" : "gap-2.5"}`}>
        <a href={offerHref} className={primary}>
          <DoodleIcon name="coin" size={small ? 11 : 14} />
          Make an offer
        </a>
        {!asking && (
          <button type="button" onClick={() => { setAsking(true); setSaid(null); }} className={secondary}>
            <DoodleIcon name="mail" size={small ? 11 : 14} />
            Send offer form
          </button>
        )}
      </div>
      {asking && (
        <div className={`${small ? "mt-2 p-2.5" : "mt-3 p-3.5"} rounded-2xl border border-line/70 bg-white`}>
          <p className={`${small ? "text-[11.5px]" : "text-[12.5px]"} leading-relaxed`}>
            Email the offer form for <span className="font-semibold">{address}</span> to <span className="font-semibold">{email}</span>? They fill it in themselves, with no account, and it comes back to you under the listing&apos;s Offers.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <PressButton
              onClick={() => void send()}
              disabled={busy}
              className="press-ring inline-flex items-center gap-1.5 rounded-full bg-brown px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              <DoodleIcon name="mail" size={12} />
              {busy ? "Sending…" : "Send it"}
            </PressButton>
            <button
              type="button"
              onClick={() => { setAsking(false); setSaid(null); }}
              className="rounded-full px-3 py-2 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {said && (
        <p className={`mt-2 ${small ? "text-[11px]" : "text-[12px]"} leading-relaxed ${said.ok ? "text-muted" : "text-accent-dark"}`}>{said.text}</p>
      )}
    </div>
  );
}
