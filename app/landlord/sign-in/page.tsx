"use client";

import { useState } from "react";

const RED = "#e31f36";

/**
 * The landlord's front door. One box, their email, and a link in reply.
 *
 * No password, and no "no account found": whatever is typed gets the same
 * sentence, because the form must not double as a way of checking which
 * addresses are landlords of ours. The email only goes to an address that is
 * the owner contact on a property we manage.
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
    <div className="mx-auto max-w-md py-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: RED }}>
        Landlord account
      </p>
      <h1 className="mt-2 text-[26px] font-bold leading-tight">Your property file</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-black/60">
        Type the email address we hold for you and we&rsquo;ll send you a link. No password to
        remember: the link signs you in, works once, and lasts a day.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-black/10 bg-[#fafafa] p-5">
          <p className="text-[14px] font-bold">Check your email</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-black/60">{sent}</p>
          <p className="mt-3 text-[12px] text-black/50">
            Nothing arrived after a few minutes? Check your junk folder, or{" "}
            <button type="button" onClick={() => { setSent(null); setDev(null); }} className="font-semibold underline">
              try a different address
            </button>
            .
          </p>
          {dev && (
            <div className="mt-4 rounded-lg border border-dashed border-black/20 p-3 text-[12px]">
              <p className="font-bold">Not sent, because this isn&rsquo;t production.</p>
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
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/50">
              Your email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-black/15 px-3.5 py-3 text-[13.5px] outline-none transition-colors focus:border-black/50"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg py-3.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: RED }}
          >
            {busy ? "Sending…" : "Send me my link"}
          </button>
          <p className="text-[12px] leading-relaxed text-black/50">
            We&rsquo;ll use the address on your file with us. If you&rsquo;re not sure which that is,
            ask your agent.
          </p>
        </form>
      )}
    </div>
  );
}
