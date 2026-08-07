"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The front door: one shared access code, sent to Susan and Howard by hand. */
export default function KeyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

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
    if (res?.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setWrong(true);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="fade-up w-full max-w-sm text-center">
        <h1 className="hand text-5xl">TLE OS</h1>
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
      </div>
    </main>
  );
}
