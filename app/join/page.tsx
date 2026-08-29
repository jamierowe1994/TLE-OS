"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Joining — one page, two states.
 *
 * Without a token it asks for a work email. With one it asks for a name and a
 * password. The same URL either way, because the link in the email lands here
 * and a person who bookmarks it should get something sensible rather than a
 * dead form.
 *
 * Deliberately OUTSIDE the (os) layout: no sidebar, no navigation, nothing to
 * click except the thing you came to do. It also has to work for somebody who
 * has never seen the OS and has no account to render a sidebar from.
 *
 * ── The password field ────────────────────────────────────────────────────
 *
 * Typed once, not twice, with a show/hide toggle. Confirm-password fields were
 * designed for an era before that toggle existed, and they now mostly catch
 * people who pasted correctly into both boxes. Length is checked as you type
 * rather than on submit, so nobody writes out a passphrase and is told after
 * the fact.
 *
 * The password goes to /api/auth/verify/complete and nowhere else. It is never
 * put in a URL, never logged, and nobody at TLE can read it.
 */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-line/80 bg-panel p-7">{children}</div>
      <p className="mt-4 text-center text-[11px] text-muted">The Letting Experts</p>
    </main>
  );
}

function AskForEmail() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  /* A wrong DOMAIN is said out loud — it is a policy, not a fact about any
     person, so it leaks nothing and saves them staring at an empty inbox. */
  const [wrongDomain, setWrongDomain] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await r.json()) as { wrongDomain?: boolean; message?: string };
      if (j.wrongDomain) {
        setWrongDomain(j.message ?? "That address isn't a Lettings Experts one.");
        return;
      }
      setSent(true);
    } catch {
      /* The answer is the same either way, so a network failure shows the same
         screen rather than inviting somebody to hammer the button. */
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Panel>
        <h1 className="hand text-[22px] leading-tight">Check your email</h1>
        <p className="mt-3 text-[13px] leading-relaxed">
          If that address can have an account, a link is on its way. It works once and
          lasts 24 hours.
        </p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Nothing arrives? Check junk first. If it&apos;s still not there, the address may
          not be set up for an account yet — ask James.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-[12px] underline"
        >
          Use a different address
        </button>
      </Panel>
    );
  }

  return (
    <Panel>
      <h1 className="hand text-[22px] leading-tight">Set up your account</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        Your work email address. We&apos;ll send a link to confirm it&apos;s yours.
      </p>
      {wrongDomain && (
        <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3.5 text-[12.5px] leading-relaxed">
          {wrongDomain}
        </p>
      )}

      <form onSubmit={submit} className="mt-5">
        <label htmlFor="email" className="text-[10px] uppercase tracking-wider text-muted">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setWrongDomain(null); }}
          className="mt-1.5 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[14px]"
          placeholder="you@thelettingexperts.co.uk"
        />
        <button
          type="submit"
          disabled={busy || !email.includes("@")}
          className="mt-4 w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send me a link"}
        </button>
      </form>
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        We&apos;ll never email you a password. You choose your own, and nobody here can
        see it.
      </p>
    </Panel>
  );
}

function ChoosePassword({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/verify/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) router.push("/profile");
      else setError(j.error ?? "That didn't work.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h1 className="hand text-[22px] leading-tight">Choose your password</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        Address confirmed. Two things and you&apos;re in.
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px] leading-relaxed">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-5">
        <label htmlFor="name" className="text-[10px] uppercase tracking-wider text-muted">
          Your name
        </label>
        <input
          id="name"
          required
          autoFocus
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[14px]"
          placeholder="As it should appear to landlords"
        />

        <label htmlFor="password" className="mt-4 block text-[10px] uppercase tracking-wider text-muted">
          Password
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
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
        <p className={`mt-1.5 text-[11px] ${tooShort ? "text-accent-dark" : "text-muted"}`}>
          At least 10 characters — this one guards the whole company&apos;s data.
          {tooShort ? ` ${10 - password.length} to go.` : ""}
        </p>

        <button
          type="submit"
          disabled={busy || !name.trim() || password.length < 10}
          className="mt-4 w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Setting up…" : "Create my account"}
        </button>
      </form>
    </Panel>
  );
}

/**
 * No token, no join.
 *
 * The "give us your email and we'll send a link" form has gone: it let anybody
 * with a Lettings Experts address start the process themselves, which is not
 * what invite-only means. An invite now begins in the admin centre, and this
 * page only finishes it.
 */
function Join() {
  const token = useSearchParams().get("token");
  if (token) return <ChoosePassword token={token} />;
  return (
    <Panel>
      <h1 className="hand text-[22px] leading-tight">You&apos;ll need an invite</h1>
      <p className="mt-3 text-[13px] leading-relaxed">
        TLE OS is invite only. When somebody adds you, a link arrives by email and brings
        you back here to set your password.
      </p>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Already have an account?{" "}
        <a href="/sign-in" className="underline">Sign in</a>. Forgotten your password?{" "}
        <a href="/reset" className="underline">Reset it</a>.
      </p>
    </Panel>
  );
}

export default function JoinPage() {
  /* useSearchParams needs a Suspense boundary, or the whole route opts out of
     static rendering and Next says so at build time. */
  return (
    <Suspense fallback={<Panel><p className="text-[12.5px] text-muted">Loading…</p></Panel>}>
      <Join />
    </Suspense>
  );
}
