"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * The front door: one shared access code, sent to Susan and Howard by hand,
 * and then a choice of which workspace to open.
 *
 * The choice is NOT security — everyone through the door can reach everything
 * by typing the address. It's here because the alternative was one navigation
 * listing every job in the company, and a marketing person shouldn't have to
 * scroll past compliance to find their own screen. When real logins arrive
 * the roles behind this stay the same shape; only the door changes.
 */

const WAYS_IN = [
  {
    id: "agents",
    label: "Agents",
    detail: "Leads, viewings, applications — the day.",
    href: "/dashboard",
  },
  {
    id: "marketing",
    label: "Marketing",
    detail: "The campaigns and the words that go out.",
    href: "/marketing",
  },
  {
    id: "admin",
    label: "Admin",
    detail: "Compliance, the portfolio, the money.",
    href: "/compliance",
  },
];

function Door() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Someone already inside, coming back to change workspace, shouldn't be
     asked for the code again — they'd have to go and find the message it
     arrived in. */
  const [choosing, setChoosing] = useState(params.get("switch") === "1");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setWrong(false);
    const res = await fetch("/api/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    if (res?.ok) setChoosing(true);
    else setWrong(true);
    setBusy(false);
  }

  function go(href: string) {
    router.push(href);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="fade-up w-full max-w-sm text-center">
        <h1 className="hand text-5xl">TLE OS</h1>

        {!choosing ? (
          <>
            <p className="mt-2 text-sm text-muted">
              Internal preview — enter the access code you were sent.
            </p>
            <form onSubmit={submit} className="mt-8">
              <input
                type="password"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Access code"
                className="w-full rounded-2xl border border-line bg-card px-5 py-3.5 text-center text-sm outline-none focus:border-ink"
              />
              {wrong && (
                <p className="mt-3 text-xs font-medium text-accent-dark">
                  That&apos;s not it — check the code and try again.
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-2xl bg-ink px-5 py-3.5 text-sm font-semibold text-page transition-opacity disabled:opacity-50"
              >
                {busy ? "Checking…" : "Come in"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">Which are you here to do?</p>
            <div className="mt-8 space-y-2.5">
              {WAYS_IN.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => go(w.href)}
                  className="w-full rounded-2xl border border-line bg-card px-5 py-4 text-left transition-colors hover:border-ink/40"
                >
                  <span className="block text-[14px] font-semibold">{w.label}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">{w.detail}</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-muted">
              A shortcut, not a permission — everything is still one preview, and you can
              come back here to switch.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function KeyPage() {
  return (
    <Suspense fallback={null}>
      <Door />
    </Suspense>
  );
}
