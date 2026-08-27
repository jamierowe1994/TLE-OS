"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Forgotten password — the same two-state shape as /join.
 *
 * Without a token: ask for the address. With one: ask for the new password,
 * and only that. Nothing asks for the OLD password, because the whole premise
 * is that it is gone; a form that asks for it is a form somebody stares at.
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
      const r = await fetch("/api/auth/reset/start", {
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
      /* same answer either way — see the route */
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
          If there&apos;s an account on that address, a reset link is on its way. It works
          once and lasts an hour.
        </p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Check junk if it doesn&apos;t appear.
        </p>
        <Link href="/sign-in" className="mt-4 inline-block text-[12px] underline">
          Back to sign in
        </Link>
      </Panel>
    );
  }

  return (
    <Panel>
      <h1 className="hand text-[22px] leading-tight">Forgotten your password</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        Your work email. We&apos;ll send a link to set a new one.
      </p>
      {wrongDomain && (
        <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3.5 text-[12.5px] leading-relaxed">
          {wrongDomain}
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
          onChange={(e) => { setEmail(e.target.value); setWrongDomain(null); }}
          className="mt-1.5 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[14px]"
        />
        <button
          type="submit"
          disabled={busy || !email.includes("@")}
          className="mt-4 w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send me a link"}
        </button>
      </form>
      <p className="mt-5 border-t border-line/70 pt-4 text-[12px] text-muted">
        <Link href="/sign-in" className="underline">Back to sign in</Link>
      </p>
    </Panel>
  );
}

function NewPassword({ token }: { token: string }) {
  const router = useRouter();
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
      const r = await fetch("/api/auth/reset/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) router.replace("/dashboard");
      else setError(j.error ?? "That didn't work.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h1 className="hand text-[22px] leading-tight">Choose a new password</h1>
      {error && (
        <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px] leading-relaxed">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="mt-5">
        <label htmlFor="password" className="text-[10px] uppercase tracking-wider text-muted">
          New password
        </label>
        <div className="relative mt-1.5">
          <input
            id="password"
            type={show ? "text" : "password"}
            required
            autoFocus
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
          At least 10 characters.{tooShort ? ` ${10 - password.length} to go.` : ""}
        </p>
        <button
          type="submit"
          disabled={busy || password.length < 10}
          className="mt-4 w-full rounded-lg bg-accent-dark py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save and sign in"}
        </button>
      </form>
    </Panel>
  );
}

function Reset() {
  const token = useSearchParams().get("token");
  return token ? <NewPassword token={token} /> : <AskForEmail />;
}

export default function ResetPage() {
  return (
    <Suspense fallback={<Panel><p className="text-[12.5px] text-muted">Loading…</p></Panel>}>
      <Reset />
    </Suspense>
  );
}
