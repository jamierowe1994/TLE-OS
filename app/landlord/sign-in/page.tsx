"use client";

import { useState } from "react";

/**
 * The landlord's front door. One box, their email, and a link in reply.
 *
 * No password, and no "no account found": whatever is typed gets the same
 * sentence, because the form must not double as a way of checking which
 * addresses are landlords of ours. The email only goes to an address that is
 * on a property we manage or an appraisal we have booked.
 */
export default function LandlordSignIn() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [dev, setDev] = useState<{ link: string; note: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/landlord/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await r.json()) as { message?: string; devLink?: string; devNote?: string };
      setSent(j.message ?? "If that address is one we hold for a landlord, your link is on its way.");
      if (j.devLink) setDev({ link: j.devLink, note: j.devNote ?? "" });
    } catch {
      setSent("Something went wrong sending that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl items-center gap-10 py-14 md:grid-cols-[1fr_260px]">
      <div className="fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Landlord account</p>
        <h1 className="mt-2 text-[30px] leading-tight">Your property file</h1>
        <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          Type the email address we hold for you and we&rsquo;ll send you a link. No password to
          remember: the link signs you in, works once, and lasts a day.
        </p>

        {sent ? (
          <div className="mt-8 rounded-2xl border border-line/80 bg-panel p-5">
            <h2 className="text-[17px]">Check your email</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{sent}</p>
            <p className="mt-3 text-[12px] text-muted">
              Nothing arrived after a few minutes? Check your junk folder, or{" "}
              <button type="button" onClick={() => { setSent(null); setDev(null); }} className="font-semibold text-ink underline">
                try a different address
              </button>
              .
            </p>
            {dev && (
              <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-[12px]">
                <p className="font-semibold">Not sent, because this isn&rsquo;t production.</p>
                <p className="mt-1 text-muted">{dev.note}</p>
                <a href={dev.link} className="mt-2 block break-all font-semibold text-accent-dark underline">
                  Open the link here instead
                </a>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Your email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-line/80 bg-box px-4 py-3 text-[13.5px] outline-none transition-colors focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-accent-dark py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send me my link"}
            </button>
            <p className="text-[12px] leading-relaxed text-muted">
              We&rsquo;ll use the address on your file with us. If you&rsquo;re not sure which that is, ask your agent.
            </p>
          </form>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/illustrations/notioly/looking-out-the-window.svg" alt="" className="hidden w-full md:block" />
    </div>
  );
}
