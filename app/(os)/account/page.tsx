"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PressButton } from "@/components/Bits";

/**
 * Your account — the first real one in the OS.
 *
 * Sign-in sits ALONGSIDE the office access code for now rather than
 * replacing it. The code is still the front door; this is who you are once
 * you're inside. Switching the door over is a deliberate step for when the
 * team all have accounts — done the other way round, one bad deploy locks
 * everybody out of their own product.
 */

interface Me {
  id: string;
  email: string;
  name: string;
  role: "owner" | "agent";
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [anyUsers, setAnyUsers] = useState(true);
  const [hasDb, setHasDb] = useState(true);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me");
      const j = await r.json();
      setMe(j.user ?? null);
      setAnyUsers(Boolean(j.anyUsers));
      setHasDb(j.hasDb !== false);
    } catch {
      /* leave the screen as it is */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(path: "login" | "register") {
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          path === "login" ? { email, password } : { email, name, password }
        ),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "That didn't work.");
      setPassword("");
      if (path === "register" && anyUsers) {
        setNote(`${j.user.name} can now sign in.`);
        setEmail(""); setName("");
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    await load();
  }

  const field = "w-full rounded-xl border border-line/80 bg-page px-3.5 py-3 text-[13.5px] outline-none transition-colors focus:border-ink";

  return (
    <div>
      <PageHeader
        title="Your account"
        blurb="Who you are in the OS — the first thing that's really yours, kept in the company's own database rather than this browser."
      />

      <div className="max-w-md">
        {loading && <p className="text-[12.5px] text-muted">One moment…</p>}

        {!loading && !hasDb && (
          <div className="rounded-2xl border border-dashed border-line p-5">
            <p className="text-[13px] font-semibold">No database on this environment</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Accounts live in Postgres. This is the local demo, which runs without one —
              everything here works on the deployed OS.
            </p>
          </div>
        )}

        {/* ── Signed in ── */}
        {!loading && hasDb && me && (
          <div className="rounded-2xl border border-line/70 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Signed in as</p>
            <p className="mt-1 text-[19px]">{me.name}</p>
            <p className="text-[12.5px] text-muted">{me.email}</p>
            <span className="mt-2 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-[10.5px] font-bold text-accent-dark">
              {me.role === "owner" ? "Owner" : "Agent"}
            </span>
            <div className="mt-5 border-t border-line/60 pt-4">
              <PressButton
                onClick={signOut}
                className="press-ring rounded-full border border-line px-4 py-2 text-[12px] font-semibold"
              >
                Sign out
              </PressButton>
            </div>
          </div>
        )}

        {/* ── Sign in, or set up the very first account ── */}
        {!loading && hasDb && !me && (
          <div className="rounded-2xl border border-line/70 p-5">
            <p className="text-[15px] font-semibold">
              {anyUsers ? "Sign in" : "Set up the first account"}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {anyUsers
                ? "Your account is separate from the office access code — that stays the front door for now."
                : "Nobody has an account yet. The first person to set one up becomes the owner, and after that new accounts are created from inside."}
            </p>

            <div className="mt-4 space-y-3">
              {!anyUsers && (
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">Your name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">Password</span>
                <input
                  type="password"
                  autoComplete={anyUsers ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !busy) void submit(anyUsers ? "login" : "register"); }}
                  className={field}
                />
                {!anyUsers && (
                  <span className="mt-1 block text-[10.5px] text-muted">At least 10 characters.</span>
                )}
              </label>

              {err && <p className="text-[12px] font-semibold text-accent-dark">{err}</p>}

              <PressButton
                onClick={() => void submit(anyUsers ? "login" : "register")}
                disabled={busy}
                className="press-ring w-full rounded-full bg-accent-dark py-3 text-[13px] font-semibold text-page disabled:opacity-40"
              >
                {busy ? "One moment…" : anyUsers ? "Sign in" : "Create my account"}
              </PressButton>
            </div>
          </div>
        )}

        {/* ── Adding a colleague, once you're in ── */}
        {!loading && hasDb && me && (
          <div className="mt-5 rounded-2xl border border-line/70 p-5">
            <p className="text-[14px] font-semibold">Add someone from the team</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              They&apos;ll sign in with the password you set here — worth changing once
              they&apos;re in. Emailed invitations arrive with the sending work.
            </p>
            <div className="mt-4 space-y-3">
              <input
                placeholder="Their name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
              />
              <input
                placeholder="Their email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
              />
              <input
                placeholder="A starting password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
              />
              {err && <p className="text-[12px] font-semibold text-accent-dark">{err}</p>}
              {note && <p className="text-[12px] font-semibold text-accent-dark">{note}</p>}
              <PressButton
                onClick={() => void submit("register")}
                disabled={busy}
                className="press-ring rounded-full border border-line px-4 py-2 text-[12px] font-semibold disabled:opacity-40"
              >
                {busy ? "One moment…" : "Create their account"}
              </PressButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
