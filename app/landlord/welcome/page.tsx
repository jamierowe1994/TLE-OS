"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The landlord's magic link lands here — sent when the terms of business
 * come back signed. Same one-email-two-jobs bundle as the tenant side:
 * the GDPR notice, dressed as the welcome it also is.
 */

const RED = "#e31f36";

export default function LandlordWelcome() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [gdprOpen, setGdprOpen] = useState(false);
  const [err, setErr] = useState("");

  function create() {
    if (pw.length < 8) return setErr("Your password needs at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    try {
      localStorage.setItem("tle-landlord-portal", JSON.stringify({ name: "Raj Chauhan", passwordSet: true }));
    } catch { /* fine */ }
    router.push("/landlord");
  }

  return (
    <div className="mx-auto max-w-md py-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: RED }}>
        Welcome aboard
      </p>
      <h1 className="mt-2 text-[26px] font-bold leading-tight">
        Your landlord account, Raj
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-black/60">
        Your terms of business are signed — thank you. Set a password and you can
        follow everything: the letting, the offers, your documents, the money and
        the upkeep, all in one place.
      </p>

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/50">
            Your email
          </span>
          <span className="flex items-center gap-2 rounded-lg border border-black/15 bg-[#fafafa] px-3.5 py-3 text-[13.5px] text-black/60">
            🔒 raj.chauhan@outlook.com
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
          Open my account
        </button>
      </div>

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
              We hold your contact details, your properties and your instructions so we
              can let and manage them — that&apos;s the whole reason.
            </p>
            <p>
              We share details only where the tenancy needs it: deposit protection,
              referencing, the tenant of your property. Never sold, ever.
            </p>
            <p>
              Ask for a copy, a correction or deletion any time —
              hello@thelettingexperts.co.uk.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
