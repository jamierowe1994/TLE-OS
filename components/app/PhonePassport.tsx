"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/app/AppIcon";
import { Sheet } from "@/app/agent/bits";

/**
 * SEND A RENTAL PASSPORT FROM THE APP (Kirstie Mulholland, ticket fe8ebdad,
 * 16 Oct 2026: "an option to book a viewing and send a rental passport via
 * the app").
 *
 * The same send as the lead's Send passport on the desk
 * (/api/tenant/passport/invite): one passport per tenant, from the agent's own
 * mailbox, and only when the agent presses Send (James, 1 Oct 2026). Asks once
 * first, so a tap in a pocket never emails anybody. Says Done when they have
 * finished it, and Send Again once it has gone.
 */

type State = { sent: boolean; done: boolean; invitedAt: string | null };

export default function PhonePassport({
  name,
  email,
  listingId = null,
  address = "",
  className = "",
  quiet = false,
}: {
  name: string;
  email: string;
  /** The home it is for: a Scottish one leaves nationality off (lib/passport-scotland). */
  listingId?: string | null;
  address?: string;
  className?: string;
  /** The plain button, where another action on the card is the main one. */
  quiet?: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const first = name.trim().split(/\s+/)[0] || "them";

  useEffect(() => {
    if (!email) return;
    let dead = false;
    const qs = new URLSearchParams({ email });
    if (listingId) qs.set("home", listingId);
    fetch(`/api/tenant/passport/invite?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; sent?: boolean; done?: boolean; invitedAt?: string | null }) => {
        if (!dead && j.ok) setState({ sent: Boolean(j.sent), done: Boolean(j.done), invitedAt: j.invitedAt ?? null });
      })
      .catch(() => !dead && setState({ sent: false, done: false, invitedAt: null }));
    return () => {
      dead = true;
    };
  }, [email, listingId]);

  if (!email) {
    return <p className={`text-[13.5px] text-muted ${className}`}>No email on their record, so a rental passport can&apos;t go yet.</p>;
  }

  async function send() {
    setBusy(true);
    setSaid(null);
    const j = await fetch("/api/tenant/passport/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, again: Boolean(state?.sent), home: listingId ?? undefined, address }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; error?: string; alreadySent?: boolean; invitedAt?: string }>)
      .catch(() => null);
    setBusy(false);
    if (!j?.ok) return setSaid({ ok: false, text: j?.error ?? "That didn't send - the connection dropped. Try again." });
    setState((s) => ({ done: s?.done ?? false, sent: true, invitedAt: j.invitedAt ?? new Date().toISOString() }));
    setSaid({ ok: true, text: j.alreadySent ? "It had already gone to them." : `Sent to ${email}.` });
    setAsking(false);
  }

  const when = state?.invitedAt ? new Date(state.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

  return (
    <div className={className}>
      {state?.done ? (
        <p className="flex items-center gap-2 text-[14.5px] font-medium" style={{ color: "var(--m-sage-ink)" }}>
          <AppIcon name="checklist" size={17} /> Rental passport done
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSaid(null);
            setAsking(true);
          }}
          disabled={state === null}
          className={`m-btn m-press w-full disabled:opacity-60 ${state?.sent || quiet ? "" : "m-btn-primary"}`}
        >
          <AppIcon name="doc" size={17} />
          {state === null ? "Checking their passport" : state.sent ? "Send Passport Again" : "Send Rental Passport"}
        </button>
      )}
      {state?.sent && !state.done && when && <p className="mt-1.5 px-1 text-[12.5px] text-muted">Sent {when}, not finished yet.</p>}
      {said && (
        <p className="mt-2 px-1 text-[13.5px]" style={{ color: said.ok ? "var(--m-sage-ink)" : "var(--m-coral)" }}>
          {said.text}
        </p>
      )}

      {asking && (
        <Sheet label="Send rental passport" onClose={() => setAsking(false)}>
          <h2 className="m-title text-[26px] leading-tight">{state?.sent ? `Send ${first} the passport again?` : `Send ${first} a rental passport?`}</h2>
          <p className="mt-2 text-[15px] leading-snug text-muted">
            They fill in their details once - who is moving, income, pets, right to rent - and it comes back to you. It goes from your email to{" "}
            <span className="font-medium" style={{ color: "var(--m-ink)" }}>{email}</span>.
          </p>
          {said && !said.ok && (
            <p className="mt-3 text-[14px]" style={{ color: "var(--m-coral)" }}>
              {said.text}
            </p>
          )}
          <button type="button" onClick={() => void send()} disabled={busy} className="m-btn m-btn-primary m-press mt-5 w-full disabled:opacity-60">
            <AppIcon name="mail" size={17} /> {busy ? "Sending" : "Send It"}
          </button>
          <button type="button" onClick={() => setAsking(false)} className="m-btn m-press mt-2 w-full">
            Not Now
          </button>
        </Sheet>
      )}
    </div>
  );
}
