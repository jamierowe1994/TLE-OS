"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The magic link lands HERE. The email that brought them was the GDPR
 * notice wearing its best clothes — "we've added you to our system, here's
 * how we look after your details, and here's your account" — and this page
 * finishes the job: their email is already known and locked, they choose a
 * password, and the portal opens.
 */

const RED = "#e31f36";

export default function TenantWelcome() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [gdprOpen, setGdprOpen] = useState(false);
  const [err, setErr] = useState("");

  function create() {
    if (pw.length < 8) return setErr("Your password needs at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    try {
      localStorage.setItem("tle-tenant-portal", JSON.stringify({ name: "Sophie Turner", passwordSet: true }));
    } catch { /* fine */ }
    router.push("/tenant");
  }

  return (
    <div className="mx-auto max-w-md py-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: RED }}>
        Welcome
      </p>
      <h1 className="mt-2 text-[26px] font-bold leading-tight">
        Let&apos;s set up your account, Sophie
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-black/60">
        We&apos;ve registered you with The Lettings Experts. Choose a password and
        you&apos;ll be able to see the homes we have, your viewings, and manage
        everything in one place.
      </p>

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/50">
            Your email
          </span>
          <span className="flex items-center gap-2 rounded-lg border border-black/15 bg-[#fafafa] px-3.5 py-3 text-[13.5px] text-black/60">
            🔒 sophie.turner@gmail.com
          </span>
          <span className="mt-1 block text-[10.5px] text-black/40">
            This is the address we hold for you — it&apos;s your sign-in.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/50">
            Choose a password
          </span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3.5 py-3 text-[13.5px] outline-none transition-colors focus:border-black/50"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/50">
            And again
          </span>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3.5 py-3 text-[13.5px] outline-none transition-colors focus:border-black/50"
          />
        </label>

        {err && <p className="text-[12px] font-semibold" style={{ color: RED }}>{err}</p>}

        <button
          type="button"
          onClick={create}
          className="w-full rounded-lg py-3.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: RED }}
        >
          Create my account
        </button>
      </div>

      {/* The GDPR notice, present and honest — the email's other half. */}
      <div className="mt-8 rounded-xl border border-black/10 bg-[#fafafa] p-4">
        <button
          type="button"
          onClick={() => setGdprOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left text-[12.5px] font-bold"
        >
          How we look after your details
          <span className="text-black/40">{gdprOpen ? "−" : "+"}</span>
        </button>
        {gdprOpen && (
          <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-black/60">
            <p>
              We hold your name, contact details and what you&apos;re looking for so we
              can find you a home. That&apos;s the only reason we hold them.
            </p>
            <p>
              We never sell your details. We share them only where a tenancy needs it —
              referencing, deposit protection, the landlord of a home you apply for.
            </p>
            <p>
              You can ask for a copy of what we hold, correct it, or ask us to delete it
              at any time — reply to any of our emails or write to
              hello@thelettingexperts.co.uk.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
