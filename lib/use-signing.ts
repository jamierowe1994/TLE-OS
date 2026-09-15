"use client";

import { useCallback, useState } from "react";

/**
 * Getting hold of this landlord's contract, from wherever they pressed sign.
 *
 * Two ways in and they must not drift apart: the portal knows the appraisal
 * and asks the OS to find the session that was minted when the agent sent the
 * terms, and the harness already holds a drafted contract and simply opens it.
 * James, 15 Sep 2026: the button under the presentation "is not working, it's
 * not putting up the contract still" - because that one was reading the deck's
 * own signUrl, which is null until a deck is looked up per landlord, while the
 * tile on the file was minting properly. One way of asking, now.
 *
 * It FINDS, it never mints: see app/api/landlord/sign. A landlord pressing
 * sign twice must not end up with two contracts on one property.
 */
export function useSigning({ appraisalId, url }: { appraisalId?: string | null; url?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (busy) return;
    /* Already have one: straight in, no round trip. */
    if (url) return setSigning(url);
    if (!appraisalId) {
      setNote("There is no contract on this file yet.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/landlord/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appraisalId }),
      });
      const j = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (j.ok && j.url) setSigning(j.url);
      else setNote(j.error ?? "Couldn't open the terms just now.");
    } catch {
      setNote("Couldn't open the terms just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [appraisalId, url, busy]);

  const close = useCallback(() => setSigning(null), []);

  return { open, close, signing, busy, note };
}
