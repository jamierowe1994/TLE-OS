"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * LET HERE, STILL ON THE PORTALS (Sean McMahon, ticket 5474011a, 24 Nov 2026:
 * "Properties that have been let are still appearing on the portals as
 * available", reported three times).
 *
 * A let or withdrawn listing whose last upload to the portals went before it
 * was marked let, so Rightmove, OnTheMarket and Zoopla never heard and kept
 * showing it as available. /api/listings/publish says so as `neverTold`
 * (lib/advert-offline portalsNeverToldOff, switch listing_portal_state); off,
 * it never does and this draws nothing. The button is the existing take-off
 * (action "off"), which sends the portals a fresh upload. Shown on the
 * listing page's Has Been Let / Off the Market notice, and in the drawer.
 */
export default function StillOnPortals({ listingId, home, className = "", style }: { listingId: string; home: string; className?: string; style?: CSSProperties }) {
  const [info, setInfo] = useState<{ neverTold: boolean; state: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/listings/publish?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; neverTold?: boolean; listingState?: string | null }>)
      .then((j) => live && setInfo(j.ok ? { neverTold: Boolean(j.neverTold), state: j.listingState ?? null } : null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [listingId, tick]);

  async function takeOff() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/listings/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: Number(listingId), action: "off" }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setNote(
        j.ok
          ? { ok: true, text: "Done. The portals have been sent the change, and it leaves Rightmove, OnTheMarket and Zoopla within the hour." }
          : { ok: false, text: j.error ?? "The portals did not take it. Try again in a minute." }
      );
      if (j.ok) setTick((n) => n + 1);
    } catch {
      setNote({ ok: false, text: "That didn't go through - the connection dropped. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!info?.neverTold && !note) return null;
  const what = info?.state === "leased" ? "let" : "off the market";
  return (
    <div className={`nl-confirm text-left ${className}`} style={style} data-still-on-portals data-steve-never>
      {info?.neverTold ? (
        <>
          <p>
            {`${home} is ${what}, but Rightmove, OnTheMarket and Zoopla were never told, so they can still show it as available. Taking it off sends them the change, and it leaves their sites within the hour.`}
          </p>
          <button type="button" disabled={busy} onClick={() => void takeOff()} className="nl-btn nl-btn--sm nl-btn--danger">
            {busy ? "Telling the portals…" : "Take It Off the Portals"}
          </button>
        </>
      ) : null}
      {note && <p className={note.ok ? "text-[var(--sage-ink)]" : "text-[var(--accent-dark)]"}>{note.text}</p>}
    </div>
  );
}
