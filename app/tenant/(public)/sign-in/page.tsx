"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PassportScene from "@/components/PassportScene";
import { EMPTY_PASSPORT, type PassportData } from "@/lib/passport-shape";

/**
 * The tenant's front door.
 *
 * Their passport is the thing they made with us, so it is the thing they
 * see: standing on the desk, the way it does while they fill it in, with
 * the sign-in beside it. The page runs the tenant surface's pink edge to
 * edge (globals.css, data-tenant-door), the headline is the passport's -
 * a lead and one word in brown with a rule under it - and the form is two
 * fields and a button. Email and password first; a one-time link for
 * anyone without a password or who has forgotten it.
 *
 * The card on the desk is a blank one, not somebody's: no name, no photo.
 * It is the object, not a person.
 */

const BROWN = "var(--accent-dark)";

const BLANK: PassportData = { ...EMPTY_PASSPORT, nationality: "", legalName: "", knownAs: "" };

const input =
  "w-full rounded-[12px] border border-line/80 bg-white px-4 py-3.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-muted/60 focus:border-[var(--accent-dark)] focus:shadow-[0_0_0_3px_rgba(86,66,62,0.10)]";
const label = "mb-1.5 block text-[13px] font-semibold";
const button =
  "flex w-full items-center justify-center gap-2 rounded-[12px] py-3.5 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60";

export default function TenantSignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [password, setPassword] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [dev, setDev] = useState<{ link: string; note: string } | null>(null);

  /* Email and password: the account they made at the end of their passport. */
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setPwErr("");
    try {
      const r = await fetch("/api/tenant/session/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) {
        router.replace("/tenant");
        router.refresh();
        return;
      }
      setPwErr(j.error ?? "That email and password don't match.");
    } catch {
      setPwErr("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  /* A one-time link instead. The same sentence whatever is typed, so the
     form never says which addresses are tenants of ours. */
  async function sendLink(e: React.FormEvent) {
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

  const emailField = (
    <label className="block">
      <span className={label}>Your email</span>
      <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
    </label>
  );

  return (
    <div data-tenant-door className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 py-10 sm:px-8 lg:min-h-[calc(100vh-8.5rem)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:px-12 lg:py-6">
      {/* ── the door ── */}
      <div className="fade-up">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em] text-muted">Your tenant area</p>
        <h1 className="hand mt-3 text-[44px] leading-[0.98] sm:text-[52px]">
          Welcome{" "}
          <span className="inline-block" style={{ color: BROWN, boxShadow: `inset 0 -0.14em 0 0 #fdf1ee, inset 0 -0.2em 0 0 ${BROWN}` }}>
            back
          </span>
        </h1>

        {mode === "password" ? (
          <>
            <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">
              Your home, your viewings and where everything is up to, in one place. Sign in with the email and password you chose when you made your passport.
            </p>
            <form onSubmit={signIn} className="mt-8 space-y-4">
              {emailField}
              <label className="block">
                <span className={label}>Your password</span>
                <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
              </label>
              {pwErr && <p className="text-[13px] font-medium" style={{ color: "#9d4340" }}>{pwErr}</p>}
              <button type="submit" disabled={busy} className={button} style={{ background: BROWN }}>
                {busy ? "Signing in…" : "Sign in"}
                {!busy && <Arrow />}
              </button>
            </form>
            <p className="mt-5 text-[13px] leading-relaxed text-muted">
              No password, or forgotten it?{" "}
              <button type="button" onClick={() => setMode("link")} className="font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                Email me a sign-in link
              </button>
            </p>
          </>
        ) : sent ? (
          <div className="mt-6 rounded-[18px] border border-line/70 bg-white/70 p-5 backdrop-blur">
            <h2 className="text-[19px] font-bold">Check your email</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{sent}</p>
            <p className="mt-3 text-[12.5px] text-muted">
              Nothing after a few minutes? Check your junk folder, or{" "}
              <button type="button" onClick={() => { setSent(null); setDev(null); }} className="font-semibold text-ink underline decoration-ink/30 underline-offset-4">
                try a different address
              </button>
              .
            </p>
            {dev && (
              <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-[12px]">
                <p className="font-semibold">Not sent, because this isn&rsquo;t production.</p>
                <p className="mt-1 text-muted">{dev.note}</p>
                <a href={dev.link} className="mt-2 block break-all font-semibold underline" style={{ color: BROWN }}>
                  Open the link here instead
                </a>
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">
              Type the email you gave us and we&rsquo;ll send you a link. No password: it signs you in, works once, and lasts a day.
            </p>
            <form onSubmit={sendLink} className="mt-8 space-y-4">
              {emailField}
              <button type="submit" disabled={busy} className={button} style={{ background: BROWN }}>
                {busy ? "Sending…" : "Send me my link"}
                {!busy && <Arrow />}
              </button>
            </form>
            <p className="mt-5 text-[13px] leading-relaxed text-muted">
              It has to be the email on your passport. Got your password?{" "}
              <button type="button" onClick={() => setMode("password")} className="font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                Sign in with it
              </button>
            </p>
          </>
        )}

        <p className="mt-10 text-[12.5px] text-muted">
          New to us? Your agent sends you a passport to fill in, and your account is made at the end of it.
        </p>
      </div>

      {/* ── the passport on the desk ── */}
      <div className="hidden h-[560px] lg:block" aria-hidden>
        <PassportScene data={BLANK} focus={null} side="front" />
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
