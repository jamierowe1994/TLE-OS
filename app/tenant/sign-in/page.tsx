"use client";

import { useState } from "react";

const RED = "#e31f36";

/**
 * The tenant's sign-in: the email on their deal, a link, no password.
 * The same words as the landlord's, in the tenant portal's corporate type.
 */
export default function TenantSignIn() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [dev, setDev] = useState<{ link: string; note: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/tenant/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await r.json()) as { message?: string; devLink?: string; devNote?: string };
      setSent(j.message ?? "If that address is one we hold for a tenant, your link is on its way.");
      if (j.devLink) setDev({ link: j.devLink, note: j.devNote ?? "" });
    } catch {
      setSent("Something went wrong sending that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">Your account</p>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight">Sign in to your tenancy</h1>
      <p className="mt-3 text-[13.5px] leading-relaxed text-black/60">
        Type the email address you gave us and we&rsquo;ll send you a link. No password: the link signs
        you in, works once, and lasts a day.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-black/10 bg-[#fafafa] p-5">
          <h2 className="text-[17px] font-semibold">Check your email</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-black/60">{sent}</p>
          <p className="mt-3 text-[12px] text-black/60">
            Nothing after a few minutes? Check your junk folder, or{" "}
            <button type="button" onClick={() => { setSent(null); setDev(null); }} className="font-semibold text-black underline">
              try a different address
            </button>
            .
          </p>
          {dev && (
            <div className="mt-4 rounded-xl border border-dashed border-black/20 p-3 text-[12px]">
              <p className="font-semibold">Not sent, because this isn&rsquo;t production.</p>
              <p className="mt-1 text-black/60">{dev.note}</p>
              <a href={dev.link} className="mt-2 block break-all font-semibold underline" style={{ color: RED }}>
                Open the link here instead
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-black/50">Your email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-[13.5px] outline-none transition-colors focus:border-black/40"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: RED }}
          >
            {busy ? "Sending…" : "Send me my link"}
          </button>
          <p className="text-[12px] leading-relaxed text-black/50">
            It has to be the email on your application. If you&rsquo;re not sure which that is, ask your agent.
          </p>
        </form>
      )}
    </div>
  );
}
