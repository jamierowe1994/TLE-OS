"use client";

import { useState } from "react";

/**
 * The landlord's front door, the working half: their email in, a link in reply.
 *
 * No password, and no "no account found": whatever is typed gets the same
 * sentence, because the form must not double as a way of checking which
 * addresses are landlords of ours. The email only goes to an address that is
 * on a property we manage or an appraisal we have booked.
 *
 * Shared by the two drawings of the page (SignInClassic, SignInCalm) so there
 * is one copy of what is sent and what is said.
 */
export function useLandlordLink() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [dev, setDev] = useState<{ link: string; note: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/landlord/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await r.json()) as { message?: string; devLink?: string; devNote?: string };
      setSent(j.message ?? "If that address is one we hold for a landlord, your link is on its way.");
      if (j.devLink) setDev({ link: j.devLink, note: j.devNote ?? "" });
    } catch {
      setSent("Something went wrong sending that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const again = () => {
    setSent(null);
    setDev(null);
  };

  return { email, setEmail, busy, sent, dev, submit, again };
}
