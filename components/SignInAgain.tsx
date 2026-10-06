"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Signing in again, right where the work stopped.
 *
 * 6 Oct 2026, in front of the whole team: Lianna pressed Create the listing
 * and was told to "Connect your listings account on your Profile first". Nobody
 * in the room knew what that meant - James included, who guessed it was a
 * duplicate. It was her REX sign-in, which had lapsed half an hour earlier.
 *
 * So the screen that needs the sign-in asks for it, there and then, and
 * carries on once it has it. It names REX on purpose: an agent has to know
 * which email and password to type, and "your listings account" told nobody.
 *
 * The password goes to /api/rex/session, which hands it to REX's own login
 * and keeps only the pass REX gives back (lib/rex-user).
 */
export default function SignInAgain({
  onDone,
  doing = "carry on",
  compact = false,
}: {
  /** Called once the sign-in has worked, so the caller can try again. */
  onDone: () => void;
  /** What happens next, for the button: "create the listing". */
  doing?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lapsed, setLapsed] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);
  const passwordBox = useRef<HTMLInputElement>(null);

  /* It turns up at the foot of a scrolling panel, below the fold: bring it
     into view and put the cursor where the typing starts. */
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    emailBox.current?.focus({ preventScroll: true });
  }, []);

  /* The email they used last time, so it is one box, not two. */
  useEffect(() => {
    fetch("/api/rex/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { email?: string }) => {
        if (s?.email) {
          setEmail((e) => e || s.email!);
          setLapsed(true);
          passwordBox.current?.focus({ preventScroll: true });
        }
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/rex/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "That email and password were not accepted.");
      setPassword("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That email and password were not accepted.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-line/80 bg-white px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-ink";

  return (
    <form ref={box} onSubmit={submit} className="rounded-2xl border border-[var(--brown)]/25 bg-accent-soft/40 p-4">
      <div className="flex items-start gap-3">
        <DoodleIcon name="key" size={18} className="mt-0.5 shrink-0 text-accent-dark" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">Sign in Again to Carry On</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {lapsed
              ? "Your REX sign-in has run out, so this can't be saved under your name yet. "
              : "This needs your REX sign-in, so the work is saved under your name. "}
            Pop in your REX email and password and it carries straight on.
            {compact ? "" : " While you keep using the OS you won't be asked again."}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <input
          ref={emailBox}
          className={field}
          type="email"
          autoComplete="username"
          placeholder="Your REX email"
          aria-label="Your REX email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          ref={passwordBox}
          className={field}
          type="password"
          autoComplete="current-password"
          placeholder="Your REX password"
          aria-label="Your REX password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="mt-2 text-[11.5px] text-accent-dark">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] leading-snug text-muted">Your password goes to REX and is never kept here.</p>
        <button
          type="submit"
          disabled={busy || !email.trim() || !password}
          className="press-ring rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Signing in…" : `Sign in and ${doing}`}
        </button>
      </div>
    </form>
  );
}
