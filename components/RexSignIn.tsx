"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Connecting yourself to REX.
 *
 * One sign-in, and then everything the OS writes into REX carries YOUR name
 * rather than the office API account's. That's the whole reason this screen
 * exists: a note Susan wrote should say Susan.
 *
 * It asks for a password, which deserves saying plainly on the screen and not
 * just in the code: it goes to REX's own login and is never stored. What we
 * keep is the token REX hands back, encrypted, for seven days.
 */

type Session = {
  connected: boolean;
  email?: string;
  expiresAt?: string;
  expiringSoon?: boolean;
  reason?: string;
};

const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

export default function RexSignIn() {
  const [s, setS] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = () =>
    fetch("/api/rex/session")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS({ connected: false }));

  useEffect(() => {
    load();
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
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!j.ok) setError(j.error ?? "That didn't work.");
      else {
        setPassword("");
        setOpen(false);
        await load();
      }
    } catch {
      setError("That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-line/80 bg-card px-3 py-2 text-[12.5px] outline-none focus:border-ink";

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <DoodleIcon name="user" size={16} className="text-accent-dark" />
        <div className="min-w-0">
          <h3 className="text-[14px]">Your REX sign-in</h3>
          <p className="text-[11.5px] text-muted">
            {s?.connected
              ? `Connected as ${s.email} — good until ${when(s.expiresAt)}`
              : (s?.reason ?? "Not connected. Anything written to REX would go under the office account.")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {s?.connected && (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/rex/session", { method: "DELETE" });
                load();
              }}
              className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] hover:border-ink/40"
            >
              Disconnect
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-full bg-ink px-4 py-1.5 text-[11.5px] text-page"
          >
            {open ? "Cancel" : s?.connected ? "Sign in again" : "Connect to REX"}
          </button>
        </div>
      </div>

      {s?.expiringSoon && !open && (
        <p className="mt-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">
          Your sign-in runs out within a day. Renew it now and nothing will interrupt you
          mid-job.
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-2.5 sm:max-w-sm">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              Your REX email
            </span>
            <input
              className={field}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              Your REX password
            </span>
            <input
              className={field}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-[11.5px] text-accent-dark">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="justify-self-start rounded-full bg-ink px-4 py-2 text-[12px] text-page disabled:opacity-50"
          >
            {busy ? "Asking REX…" : "Connect"}
          </button>
          <p className="text-[10.5px] leading-relaxed text-muted">
            Your password goes straight to REX and is never stored here — what we keep is the
            pass REX hands back, encrypted. It renews itself quietly whenever you use the OS,
            so this should be the only time you see this. It only expires if you stay away for
            a fortnight, and nobody can act as you from it once it has.
          </p>
        </form>
      )}
    </div>
  );
}
