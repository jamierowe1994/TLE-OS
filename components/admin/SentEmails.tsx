"use client";

import { useCallback, useEffect, useState } from "react";
import { when } from "@/lib/admin-client";

/**
 * Every email that left, and each one as it was received (/api/admin/sent-emails).
 *
 * It lived on Activity. In the new look it is Emails > Sent (24 Oct 2026),
 * beside the catalogue of what we would send, and Activity keeps to who did
 * what. The old look still draws it on Activity, from these same parts, so
 * there is one reader of the list and one way of opening an email.
 *
 * Admin > Emails answers a different question: what a template looks like
 * NOW, rendered from today's code. This is what a named person actually
 * received on a particular afternoon.
 */

export type Sent = { id: string; to: string; subject: string; sentAt: string };
export type Opened = { id: string; to: string; subject: string; html: string; sentAt: string };

/** The list (null while it loads), whether it failed, and opening one. Asks nothing until enabled. */
export function useSentEmails(enabled = true) {
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Opened | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    fetch("/api/admin/sent-emails", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { emails?: Sent[] } | null) => setSent(j?.emails ?? []))
      .catch(() => {
        setSent((s) => s ?? []);
        setFailed(true);
      });
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  async function openEmail(id: string) {
    setLoadingId(id);
    setOpenFailed(null);
    const j = await fetch(`/api/admin/sent-emails?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setLoadingId(null);
    if (j?.html) setOpen(j as Opened);
    else setOpenFailed(id);
  }

  return { sent, failed, load, open, setOpen, loadingId, openEmail, openFailed };
}

export type SentEmails = ReturnType<typeof useSentEmails>;

/** The old look's card, exactly as Activity drew it. */
export function SentEmailsOld({ s }: { s: SentEmails }) {
  const sent = s.sent ?? [];
  return (
    <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
      <h2 className="hand text-[17px] leading-tight">Emails sent</h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        Open one to see it exactly as it was received, not as the template looks today.
        Sign-in links are removed from the stored copy, so the button is there but cannot be
        used.
      </p>
      {sent.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">
          Nothing sent since this started being recorded.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {sent.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-2 text-[12px] last:border-0"
            >
              <span className="min-w-0">
                <button
                  type="button"
                  onClick={() => void s.openEmail(m.id)}
                  className="underline decoration-line hover:decoration-ink"
                >
                  {m.subject || "(no subject)"}
                </button>
                <span className="text-muted"> · {m.to}</span>
              </span>
              <span className="shrink-0 text-muted">
                {s.loadingId === m.id ? "Opening…" : when(m.sentAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The old look's pull-out, exactly as Activity drew it. */
export function SentEmailDrawerOld({ s }: { s: SentEmails }) {
  const open = s.open;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={() => s.setOpen(null)}
        className="absolute inset-0 cursor-default bg-ink/35"
      />
      <div className="fade-up absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] lg:w-[76%] xl:w-[68%]">
        <div className="flex items-start justify-between gap-3 border-b border-line/60 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px]">{open.subject}</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              To {open.to} · {when(open.sentAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => s.setOpen(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
        {/* An IFRAME, not dangerouslySetInnerHTML. The stored copy is a
            whole HTML document with its own body styling, and injecting it
            into this page would let email CSS loose on the admin screen.
            Sandboxed with no allow-* flags: it renders and can do nothing
            else — no scripts, no forms, no navigation. */}
        <iframe
          title={open.subject}
          srcDoc={open.html}
          sandbox=""
          className="flex-1 border-0 bg-white"
        />
      </div>
    </div>
  );
}
