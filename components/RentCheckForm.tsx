"use client";

import { useState } from "react";

/** The form on the rent-check page. Name, email, a number if they like, and the opt-in. */
export default function RentCheckForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(true);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/r/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone, message, consent, company }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.reason ?? "That did not go through.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-4 rounded-3xl border border-line/80 bg-[#fbfbfa] p-6">
        <p className="hand text-[20px]">Thank you{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          One of the team will put your rent check together and be in touch within a working day.
        </p>
      </div>
    );
  }

  const field = "w-full rounded-2xl border border-line/80 bg-white px-4 py-3 text-[14px] outline-none focus:border-ink";

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required autoComplete="name" className={field} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" type="email" required autoComplete="email" className={field} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" type="tel" autoComplete="tel" className={field} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything we should know? (optional)" rows={2} className={`${field} resize-none`} />
      {/* Not for people. A field a person never sees and a script fills. */}
      <input value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent-dark)]" />
        Email me the rent check and occasional updates on the local market. Unsubscribe any time.
      </label>
      {error && <p className="text-[12.5px] text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-full bg-ink px-5 py-3.5 text-[14px] font-semibold text-white disabled:opacity-40">
        {busy ? "Sending..." : "Send me the rent check"}
      </button>
    </form>
  );
}
