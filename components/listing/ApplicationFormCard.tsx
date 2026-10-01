"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";

/**
 * The listing's application form, to copy or to send (Howard's ticket,
 * approved by James 1 Oct 2026).
 *
 * The link is /tenant/apply?listing=<id>: the applicant fills it in with no
 * account, and it lands with the listing's agent and on /offers. Send
 * application form emails it to each address typed in (lib/send-as-agent, so
 * the customer email switch decides whether it really goes).
 *
 * The form only. The tenant passport is never minted or linked from here.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ApplicationFormCard({ listingId }: { listingId: string }) {
  const [info, setInfo] = useState<{ url: string | null; onMarket: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [results, setResults] = useState<{ email: string; sent: boolean; detail: string }[] | null>(null);

  useEffect(() => {
    let live = true;
    setInfo(null);
    setOpen(false);
    setEmails([]);
    setResults(null);
    setProblem(null);
    fetch(`/api/listings/application-form?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; url?: string | null; onMarket?: boolean }) => {
        if (live) setInfo({ url: j.url ?? null, onMarket: Boolean(j.onMarket) });
      })
      .catch(() => live && setInfo({ url: null, onMarket: false }));
    return () => {
      live = false;
    };
  }, [listingId]);

  /** Whatever is in the box becomes chips: commas, spaces, semicolons or new lines between. */
  function take(text: string): string[] {
    const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const add = parts.filter((p) => !emails.includes(p));
    if (add.length) setEmails((cur) => [...cur, ...add.filter((p, i) => add.indexOf(p) === i)]);
    return parts;
  }

  async function copy() {
    if (!info?.url) return;
    try {
      await navigator.clipboard.writeText(info.url);
    } catch {
      /* Older browsers: select it for them to copy by hand. */
      const el = document.getElementById("apply-link") as HTMLInputElement | null;
      el?.select();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function send() {
    const all = [...emails, ...typed.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)];
    const list = all.filter((e, i) => all.indexOf(e) === i);
    setTyped("");
    setEmails(list);
    const bad = list.filter((e) => !EMAIL.test(e));
    if (!list.length) return setProblem("Add at least one email address.");
    if (bad.length) return setProblem(`${bad.join(", ")} ${bad.length === 1 ? "doesn't" : "don't"} look like an email address.`);
    setBusy(true);
    setProblem(null);
    setResults(null);
    try {
      const r = await fetch("/api/listings/application-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, emails: list }),
      });
      const j = (await r.json().catch(() => ({}))) as { results?: { email: string; sent: boolean; detail: string }[]; error?: string };
      if (j.results) {
        setResults(j.results);
        /* What went is done; what didn't stays in the box to try again. */
        setEmails(j.results.filter((x) => !x.sent).map((x) => x.email));
      } else setProblem(j.error ?? "That didn't send. Try again.");
    } catch {
      setProblem("That didn't send - the connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5" data-steve="listing.application-form">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="hand flex items-center gap-2.5 text-[15px]">
          <DoodleIcon name="doc" size={15} className="text-accent-dark" />
          Application Form
        </h3>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        The form for this home. Applicants fill it in without an account, and it comes to the listing&apos;s agent with every adult&apos;s answers.
      </p>

      {info === null ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Reading the link&hellip;
        </p>
      ) : !info.url ? (
        <p className="mt-3 text-[12px] text-muted">This listing has no application form yet.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="apply-link"
              readOnly
              value={info.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-xl border border-line/70 bg-page px-3 py-2 text-[12px] text-muted outline-none"
            />
            <div className="flex shrink-0 items-center gap-2">
              <PressButton
                onClick={() => void copy()}
                className="press-ring flex items-center gap-1.5 rounded-full border border-ink/25 px-3.5 py-2 text-[11.5px] font-semibold"
              >
                <DoodleIcon name="link" size={13} />
                {copied ? "Copied" : "Copy link"}
              </PressButton>
              <a
                href={info.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line/70 px-3.5 py-2 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
              >
                Open
              </a>
            </div>
          </div>
          {!info.onMarket && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-accent-dark">
              This home isn&apos;t on the market, so the form says it&apos;s closed. It opens when the listing goes live.
            </p>
          )}

          {!open ? (
            <PressButton
              onClick={() => setOpen(true)}
              disabled={!info.onMarket}
              className={`press-ring mt-4 flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white ${info.onMarket ? "bg-[var(--brown)]" : "cursor-not-allowed bg-[var(--brown)]/40"}`}
            >
              <DoodleIcon name="mail" size={14} />
              Send application form
            </PressButton>
          ) : (
            <div className="mt-4 rounded-2xl border border-line/60 bg-page p-3.5">
              <label htmlFor="apply-to" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Send it to
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/80 bg-white px-2.5 py-2 focus-within:border-ink">
                {emails.map((e) => (
                  <span
                    key={e}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] ${EMAIL.test(e) ? "bg-accent-soft/60" : "bg-accent-dark/15 text-accent-dark"}`}
                  >
                    {e}
                    <button type="button" aria-label={`Remove ${e}`} onClick={() => setEmails((cur) => cur.filter((x) => x !== e))} className="text-muted hover:text-ink">
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  id="apply-to"
                  autoFocus
                  value={typed}
                  inputMode="email"
                  placeholder={emails.length ? "Another address" : "name@example.com"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/[\s,;]$/.test(v)) {
                      take(v);
                      setTyped("");
                    } else setTyped(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (typed.trim()) {
                        take(typed);
                        setTyped("");
                      } else void send();
                    } else if (e.key === "Backspace" && !typed && emails.length) {
                      setEmails((cur) => cur.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    if (typed.trim()) {
                      take(typed);
                      setTyped("");
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (/[\s,;]/.test(text.trim())) {
                      e.preventDefault();
                      take(text);
                    }
                  }}
                  className="min-w-[160px] flex-1 bg-transparent py-0.5 text-[12.5px] outline-none"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">One or more. Each gets their own email with the link to this home&apos;s form.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <PressButton
                  onClick={() => void send()}
                  disabled={busy || (!emails.length && !typed.trim())}
                  className={`press-ring flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white ${busy || (!emails.length && !typed.trim()) ? "cursor-not-allowed bg-ink/30" : "bg-ink"}`}
                >
                  <DoodleIcon name="mail" size={14} />
                  {busy ? "Sending…" : `Send${emails.length > 1 ? ` to ${emails.length}` : ""}`}
                </PressButton>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setProblem(null);
                    setResults(null);
                  }}
                  className="rounded-full px-3 py-2 text-[12px] font-semibold text-muted hover:text-ink"
                >
                  Close
                </button>
              </div>
              {problem && <p className="mt-2.5 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-2.5 text-[11.5px] leading-relaxed">{problem}</p>}
              {results && (
                <ul className="mt-3 space-y-1.5">
                  {results.map((r) => (
                    <li key={r.email} className="flex items-start gap-2 text-[11.5px] leading-snug">
                      <span aria-hidden className={`mt-0.5 ${r.sent ? "text-accent-dark" : "text-muted"}`}>{r.sent ? "✓" : "!"}</span>
                      <span className="min-w-0">
                        <span className="font-semibold">{r.email}</span>
                        <span className="text-muted"> - {r.sent ? "sent." : "not sent."} {r.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
