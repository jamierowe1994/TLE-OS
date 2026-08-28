"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Signing in.
 *
 * This did not exist. `/api/auth/login` has been there for weeks with nothing
 * rendering a form into it, so the only door into the OS was the office access
 * code — which is a door into the BUILDING, not into an account. Everything
 * behind it ran as "Preview access · dev".
 *
 * Outside the (os) layout, like /join: no sidebar to render for somebody who
 * is not yet anybody.
 *
 * ── One message for both failures ─────────────────────────────────────────
 *
 * The API answers "that email and password don't match" whether the address is
 * unknown or the password is wrong, and this page shows it verbatim. Two
 * messages would let anyone with the office code work out who has an account
 * by watching which error comes back.
 *
 * ── ?next= ────────────────────────────────────────────────────────────────
 *
 * Honoured only for PATHS ON THIS SITE. An open redirect on a login page is a
 * phishing primitive: send somebody a real tle-os.co.uk sign-in link that
 * bounces them somewhere else the moment they authenticate.
 */

function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Must be a single-slash-rooted path. "//evil.com" and "https://evil.com"
  // are both absolute despite looking relative, so both are refused.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

function SignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) {
        // replace, not push: the back button should not return to a login form
        // that is now pointless and looks broken when it re-submits.
        router.replace(next);
      } else {
        setError(j.error ?? "That didn't work.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-line/80 bg-panel p-7">
        <h1 className="hand text-[22px] leading-tight">Sign in</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">TLE OS</p>

        {error && (
          <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px] leading-relaxed">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="mt-5">
          <label htmlFor="email" className="text-[10px] uppercase tracking-wider text-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[14px]"
          />

          <label htmlFor="password" className="mt-4 block text-[10px] uppercase tracking-wider text-muted">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line/80 bg-box py-2.5 pl-3 pr-16 text-[14px]"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-muted"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          <label className="mt-3.5 flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-[#e31f36]"
            />
            Stay signed in on this device
          </label>

          <button
            type="submit"
            disabled={busy || !email.includes("@") || !password}
            className="mt-4 w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-[12px]">
          <Link href="/reset" className="text-muted underline">Forgotten your password?</Link>
        </p>

        {/* No "set one up" link, deliberately. TLE OS is INVITE ONLY: having a
            Lettings Experts address is not the same as being meant to be in
            here, and a self-serve doorway quietly makes it so. The /join route
            still exists — it is where an invite link lands — but you have to
            have been sent one. */}
        <p className="mt-4 border-t border-line/70 pt-4 text-[11.5px] leading-relaxed text-muted">
          Accounts are by invite. If you should have one and don&apos;t, ask James.
        </p>
      </div>
      <p className="mt-4 text-center text-[11px] text-muted">The Letting Experts</p>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="p-10 text-[12.5px] text-muted">Loading…</main>}>
      <SignIn />
    </Suspense>
  );
}
