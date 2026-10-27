"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DoorFrame from "@/components/DoorFrame";

/**
 * "Is it still you?" (lib/email-check, 26 Oct 2026). Every few days, a code
 * to the person's own work email before they carry on. The code is sent as
 * the page opens, so the only thing to do here is type it.
 */

/** Only a path on this site, never somewhere else (an open redirect on a sign-in door is a phishing tool). */
const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard");

function Check() {
  const next = safeNext(useSearchParams().get("next"));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const asked = useRef(false);

  const send = async (again = false) => {
    setError(null);
    setNote(null);
    const j = await fetch("/api/email-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", again }) })
      .then((r) => r.json())
      .catch(() => null);
    if (j?.done) return window.location.replace(next);
    if (!j?.ok) return setError(j?.error ?? "The code couldn't be sent just now. Try again in a moment.");
    setSentTo(j.sentTo);
    if (again) setNote(j.again ? "A new code is on its way." : "One was sent a moment ago. Give it a minute.");
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void send();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const j = await fetch("/api/email-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirm", code }) })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (j?.ok) return window.location.replace(next);
    setError(j?.error ?? "That didn't work. Try again.");
  }

  return (
    <DoorFrame art="house">
      <h1 className="hand text-[26px] leading-tight">Check It&apos;s You</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        Every few days we send a code to your work email, so only you can use your account.
      </p>
      <p className="mt-4 min-h-[20px] text-[13px] leading-relaxed">
        {sentTo ? <>We&apos;ve sent a 6-digit code to <b className="font-semibold">{sentTo}</b>.</> : <span className="text-muted">Sending your code…</span>}
      </p>
      {error && <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3.5 text-[12.5px] leading-relaxed">{error}</p>}
      {note && <p className="mt-3 text-[12px] text-muted">{note}</p>}
      <form onSubmit={submit} className="mt-4">
        <label htmlFor="code" className="text-[10px] uppercase tracking-wider text-muted">Code</label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/[^\d ]/g, "")); setError(null); }}
          placeholder="123456"
          className="mt-1.5 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-center text-[22px] tracking-[0.3em]"
        />
        <button
          type="submit"
          disabled={busy || code.replace(/\D/g, "").length !== 6}
          className="mt-4 w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Checking…" : "Carry On"}
        </button>
      </form>
      <p className="mt-5 border-t border-line/70 pt-4 text-[12px] text-muted">
        Not there? Check junk, or{" "}
        <button type="button" onClick={() => void send(true)} className="underline">send a new code</button>.
        It lasts 15 minutes.
      </p>
    </DoorFrame>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <Check />
    </Suspense>
  );
}
