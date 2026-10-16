"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";

/**
 * SEND OUT LOGINS (Sean McMahon, agent call, 16 Oct 2026; lib/tenant-logins).
 *
 * The review before anything goes. Every sitting tenant on the homes asked
 * for - one home from its page, or the agent's whole book from Properties -
 * with a tick, their email, and when they were last sent a login. Nobody is
 * ticked who has been sent one before, or who has no email. See the email
 * shows exactly what the tenant gets, footer and all; Send goes one by one
 * and says what happened to each.
 */

type Row = { listingId: string; home: string; locality: string; name: string; email: string | null; lastSentAt: string | null; sends: number; agent: string };
type Result = { listingId: string; email: string; name: string; sent: boolean; detail: string };
type Info = { rows: Row[]; customerEmail: boolean; viewingAs: boolean; via: "mailbox" | "ours"; sender: string };

const key = (r: { listingId: string; email: string | null }) => `${r.listingId}|${r.email ?? ""}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

export default function SendLogins({ listings, title, onClose }: { listings?: string[]; title?: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{ subject: string; to: string; html: string; footer: boolean } | "loading" | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const whole = !listings;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview) setPreview(null);
      else if (!sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending, preview]);

  useEffect(() => {
    /* An empty list is nobody, not the whole book. */
    const q = listings ? `?listing=${encodeURIComponent(listings.join(",") || "none")}` : "";
    fetch(`/api/portfolio/logins${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) { setFailed(j?.error ?? "The tenants couldn't be read."); return; }
        setInfo(j);
        /* Ticked to start with: everyone with an email who has never had one. */
        setPicked(new Set((j.rows as Row[]).filter((r) => r.email && !r.lastSentAt).map(key)));
      })
      .catch(() => setFailed("The tenants couldn't be read. Try again in a minute."));
  }, [listings?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    if (!info) return [];
    const s = search.trim().toLowerCase();
    return s ? info.rows.filter((r) => `${r.home} ${r.locality} ${r.name} ${r.email ?? ""} ${r.agent}`.toLowerCase().includes(s)) : info.rows;
  }, [info, search]);
  const reachable = shown.filter((r) => r.email);
  const ticked = info ? info.rows.filter((r) => r.email && picked.has(key(r))) : [];
  const noEmail = info ? info.rows.filter((r) => !r.email).length : 0;
  const allShownTicked = reachable.length > 0 && reachable.every((r) => picked.has(key(r)));

  function toggle(r: Row) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(key(r))) n.delete(key(r)); else n.add(key(r));
      return n;
    });
  }
  function toggleAll() {
    setPicked((p) => {
      const n = new Set(p);
      for (const r of reachable) if (allShownTicked) n.delete(key(r)); else n.add(key(r));
      return n;
    });
  }
  async function see(r: Row) {
    setPreview("loading");
    const j = await fetch(`/api/portfolio/logins?preview=${encodeURIComponent(r.listingId)}&email=${encodeURIComponent(r.email ?? "")}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setPreview(j?.ok ? { subject: j.subject, to: j.to, html: j.html, footer: Boolean(j.footer) } : null);
  }
  async function send() {
    if (sending || !ticked.length) return;
    setSending(true);
    setSendErr(null);
    const j = await fetch("/api/portfolio/logins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ picks: ticked.map((r) => ({ listingId: r.listingId, email: r.email })) }),
    }).then((x) => x.json()).catch(() => null);
    setSending(false);
    if (!j?.ok) { setSendErr(j?.error ?? "The logins couldn't be sent just now. Try again in a minute."); return; }
    setResults(j.results ?? []);
  }

  const firstTicked = ticked[0] ?? reachable[0] ?? null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={() => !sending && onClose()} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[760px] rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] leading-tight">Send Out Logins</h2>
            <p className="mt-1 text-[12.5px] text-muted">{title ?? (whole ? "Every sitting tenant in your book" : "The tenants on this home")}</p>
          </div>
          <button type="button" onClick={() => !sending && onClose()} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>

        <p className="text-[12.5px] leading-relaxed">
          Each tenant gets an email from you with a button into their tenant account, so they can report repairs and follow them online. No password: the button signs them in for 14 days, and after that they sign in with their email.
        </p>

        {failed ? (
          <p className="mt-4 rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">{failed}</p>
        ) : !info ? (
          <p className="mt-5 flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the tenants{whole ? " in your book" : ""}…</p>
        ) : results ? (
          <Results results={results} onClose={onClose} />
        ) : (
          <>
            {/* How it goes, and whether it can. */}
            <div className="mt-4 space-y-2">
              {!info.customerEmail && (
                <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">
                  <strong>Email to landlords and tenants is switched off.</strong> Nothing will reach a tenant until it is on in Admin, Switches. Sends to our own addresses still go, for testing.
                </p>
              )}
              {info.viewingAs && (
                <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px]">You&apos;re viewing as somebody. Logins go under the name of the person who presses send, so stop viewing as them first.</p>
              )}
              <p className="flex items-start gap-2 rounded-xl bg-box px-4 py-2.5 text-[12px] text-muted">
                <DoodleIcon name="mail" size={13} className="mt-0.5 shrink-0 text-accent-dark" />
                {info.via === "mailbox"
                  ? `From ${info.sender}'s own Outlook, with your email footer, so replies come back to you.`
                  : `From The Letting Experts, under your name with your address to reply to. Your email footer goes on once your Outlook is connected in Profile.`}
              </p>
            </div>

            {info.rows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12.5px] text-muted">No sitting tenants on {whole ? "your book" : "this home"}.</p>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {whole && (
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a home, tenant or agent" className="min-w-0 flex-1 rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] outline-none focus:border-ink" />
                  )}
                  <button type="button" onClick={toggleAll} disabled={!reachable.length} className="rounded-full border border-line/80 bg-white px-3 py-2 text-[12px] font-semibold hover:border-ink disabled:opacity-40">
                    {allShownTicked ? "Untick all" : "Tick all"}{search ? " shown" : ""}
                  </button>
                </div>
                <ul className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-line/50 bg-white">
                  {shown.map((r) => (
                    <li key={key(r) + r.name} className="border-b border-line/40 last:border-0">
                      <label className={`flex items-start gap-3 px-4 py-2.5 text-[12.5px] ${r.email ? "cursor-pointer hover:bg-box" : "opacity-60"}`}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" disabled={!r.email} checked={Boolean(r.email) && picked.has(key(r))} onChange={() => toggle(r)} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{r.name}</span>
                          <span className="block truncate text-muted">{r.email ?? "No email on file, so they can't be sent one"}</span>
                          {whole && <span className="block truncate text-[11.5px] text-muted">{[r.home, r.locality].filter(Boolean).join(", ")}{r.agent ? ` · ${r.agent}` : ""}</span>}
                        </span>
                        {r.lastSentAt && <span className="shrink-0 rounded-full bg-box px-2.5 py-1 text-[11px] text-muted">Sent {day(r.lastSentAt)}</span>}
                      </label>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-4 py-3 text-[12.5px] text-muted">Nobody matches that.</li>}
                </ul>
                {noEmail > 0 && <p className="mt-2 text-[11.5px] text-muted">{noEmail} {noEmail === 1 ? "tenant has" : "tenants have"} no email on file. Add one on their card and they can be sent a login.</p>}
              </>
            )}

            {sendErr && <p className="mt-3 text-[12px] text-accent-dark">{sendErr}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PressButton onClick={() => void send()} disabled={sending || !ticked.length || info.viewingAs} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
                {sending ? `Sending ${ticked.length}…` : ticked.length ? `Send ${ticked.length} ${ticked.length === 1 ? "login" : "logins"}` : "Tick who to send to"}
              </PressButton>
              {firstTicked && (
                <button type="button" onClick={() => void see(firstTicked)} className="text-[12.5px] font-semibold underline underline-offset-2">See the email</button>
              )}
              <button type="button" onClick={onClose} disabled={sending} className="text-[12px] text-muted underline">Cancel</button>
            </div>
          </>
        )}

      </div>
      {preview && (
        <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto p-3 sm:p-6">
          <button type="button" aria-label="Close the preview" onClick={() => setPreview(null)} className="fixed inset-0 cursor-default bg-ink/40" />
          <div className="relative w-full max-w-[680px] rounded-2xl border border-line/70 bg-page p-4 shadow-xl sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              {preview === "loading" ? (
                <p className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Drawing the email…</p>
              ) : (
                <div className="min-w-0 text-[12.5px]">
                  <p className="truncate"><span className="text-muted">To</span> {preview.to}</p>
                  <p className="truncate"><span className="text-muted">Subject</span> <strong>{preview.subject}</strong></p>
                  <p className="mt-0.5 text-[11.5px] text-muted">The button goes nowhere in this preview. Each tenant gets their own link.{preview.footer ? " Your footer is under it, as it leaves your Outlook." : ""}</p>
                </div>
              )}
              <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted hover:text-ink">✕</button>
            </div>
            {preview !== "loading" && <iframe title="The login email" srcDoc={preview.html} sandbox="" className="h-[70vh] w-full rounded-xl border border-line/50 bg-white" />}
          </div>
        </div>
      )}
    </div>
  );
}

function Results({ results, onClose }: { results: Result[]; onClose: () => void }) {
  const sent = results.filter((r) => r.sent);
  const not = results.filter((r) => !r.sent);
  return (
    <div className="mt-4">
      <p className="text-[14px] font-semibold">{sent.length === results.length ? `All ${sent.length} sent.` : `${sent.length} of ${results.length} sent.`}</p>
      {not.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-xl border border-line/50 bg-white p-3 text-[12px]">
          {not.map((r) => (
            <li key={`${r.listingId}|${r.email}`}><strong>{r.name || r.email}</strong> <span className="text-muted">{r.email}</span><br /><span className="text-accent-dark">{r.detail}</span></li>
          ))}
        </ul>
      )}
      {sent.length > 0 && <p className="mt-3 text-[12px] text-muted">{sent[0].detail}</p>}
      <PressButton onClick={onClose} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">Done</PressButton>
    </div>
  );
}
