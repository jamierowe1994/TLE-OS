"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DoorFrame from "@/components/DoorFrame";

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
  /* And no backslash or control character anywhere (Rig run 4, P-088): a
     browser reads "/\evil.example" as "//evil.example", and drops tabs and
     newlines, so "/\t/evil.example" was another way off the site. Then the
     belt and braces: whatever it resolves to must still be this site. */
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return "/dashboard";
  /* Rendered on the server too, where there is no window: the checks above
     have already ruled out every way off the site we know of. */
  if (typeof window === "undefined") return raw;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

function SignIn() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  /* Sent here because an owner locked their access (lib/lockout). Same
     words as the sign-in refusal, so it reads the same either way in. */
  const locked = params.get("locked") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(locked ? "Your access to TLE OS has been paused. Speak to James." : null);

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
      const j = (await r.json()) as { ok?: boolean; error?: string; user?: { role?: string } };
      if (j.ok) {
        // replace, not push: the back button should not return to a login form
        // that is now pointless and looks broken when it re-submits.
        /* Kirstie lands on the activity feed, not the agents' dashboard.
           James, 4 Sep: "when she logs in... the first thing that she sees
           will be the activity log." Only when nothing asked for a
           particular page: a link she followed still goes where it said. */
        const asked = new URLSearchParams(window.location.search).get("next");
        /* An agent signing in on a PHONE lands on the phone view (16 Sep
           2026): they are on a viewing and want their diary, not a desktop
           dashboard squeezed onto a small screen. Width and a touch pointer
           together, so a narrow laptop window is not a phone. The full OS is
           one tap away from the phone view's menu. */
        const phone = window.matchMedia("(max-width: 640px) and (pointer: coarse)").matches;
        /* A full load, not router.replace (2 Oct 2026): the tab may still hold
           the boards of whoever was signed in before - their session ran out
           and middleware brought them here mid-session. A fresh page holds
           nobody's (see lib/page-cache). replace, so Back skips the form. */
        window.location.replace(
          /* Michael lands on his own dashboard, as Kirstie does on hers (20 Sep 2026),
             and marketing on the Marketing Hub (28 Sep 2026): the dashboard is an
             agent's REX work, and a marketing account has no REX. */
          !asked && j.user?.role === "pretenancy" ? "/pre-tenancy/dashboard" : !asked && j.user?.role === "compliance" ? "/compliance-desk" : !asked && j.user?.role === "marketing" ? "/marketing-hub" : !asked && phone ? "/m" : next
        );
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
    <DoorFrame art="street" note="Accounts are by invite. If you should have one and don't, ask James. Coffee usually speeds it up.">
      <h1>Sign In</h1>
      <p className="door-lead mt-2 text-[14px] leading-relaxed text-muted">Use your work email.</p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[13px] leading-relaxed">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-6 grid gap-4">
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2"
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <div className="relative mt-2">
            <input
              id="password"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-16"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-pressed={show}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-[13px]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Stay signed in on this device
        </label>

        <button type="submit" disabled={busy || !email.includes("@") || !password} className="mt-1">
          {busy ? (
            <>
              <span className="door-spin" aria-hidden />
              Signing In
            </>
          ) : (
            <>
              Sign In
              <svg className="door-arrow" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M0 5h14M10 1l4 4-4 4" />
              </svg>
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-[13px]">
        <Link href="/reset" className="text-muted underline">Forgotten your password?</Link>
      </p>

      {/* No "set one up" link, deliberately. TLE OS is INVITE ONLY: having a
          Letting Experts address is not the same as being meant to be in
          here, and a self-serve doorway quietly makes it so. The /join route
          still exists — it is where an invite link lands — but you have to
          have been sent one. The line saying so sits under the card (the
          note prop of DoorFrame). */}
    </DoorFrame>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<DoorFrame art="street"><p className="text-[12.5px] text-muted">Loading…</p></DoorFrame>}>
      <SignIn />
    </Suspense>
  );
}
