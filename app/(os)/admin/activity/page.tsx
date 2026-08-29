"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { loadAdmin, when, AUDIT_KIND, type AdminData } from "@/lib/admin-client";

/**
 * Sign-ins, failed sign-ins, resets, every view-as — and every email that left.
 *
 * ── Why the emails are here rather than in the catalogue ──────────────────
 *
 * James, 29 Aug: "I should be able to click on the email to Francesca and be
 * able to click it to open it to see if it's actually what's been sent."
 *
 * Admin → Emails answers a different question. It shows what a template looks
 * like NOW, rendered from today's code. This shows what a named person
 * actually received on a particular afternoon, which is the only version worth
 * anything when somebody says the invite looked wrong. The two would agree
 * today and disagree by Friday.
 */

type Sent = { id: string; to: string; subject: string; sentAt: string };
type Opened = { id: string; to: string; subject: string; html: string; sentAt: string };

export default function AdminActivity() {
  const [d, setD] = useState<AdminData | null>(null);
  const [denied, setDenied] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);
  const [open, setOpen] = useState<Opened | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadAdmin().then((x) => (x ? setD(x) : setDenied(true)));
  }, []);

  useEffect(() => {
    fetch("/api/admin/sent-emails", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { emails?: Sent[] } | null) => setSent(j?.emails ?? []))
      .catch(() => {});
  }, []);

  async function openEmail(id: string) {
    setLoadingId(id);
    const j = await fetch(`/api/admin/sent-emails?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setLoadingId(null);
    if (j?.html) setOpen(j as Opened);
  }

  if (denied)
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Activity"
        blurb="Who's signed in, who couldn't, every view-as, and every email that went out."
      />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Emails sent</h2>
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
            {sent.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-2 text-[12px] last:border-0"
              >
                <span className="min-w-0">
                  <button
                    type="button"
                    onClick={() => void openEmail(s.id)}
                    className="underline decoration-line hover:decoration-ink"
                  >
                    {s.subject || "(no subject)"}
                  </button>
                  <span className="text-muted"> · {s.to}</span>
                </span>
                <span className="shrink-0 text-muted">
                  {loadingId === s.id ? "Opening…" : when(s.sentAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Who did what</h2>
        {d.audit.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing recorded yet. The log was created today, so it starts from here.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {d.audit.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-2 text-[12px] last:border-0"
              >
                <span>
                  <span className="text-muted">{AUDIT_KIND[a.kind] ?? a.kind}</span>{" "}
                  {a.actorEmail || "(unknown)"}
                  {a.subjectEmail ? ` → ${a.subjectEmail}` : ""}
                  {a.detail ? <span className="text-muted"> · {a.detail}</span> : null}
                </span>
                <span className="shrink-0 text-muted">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <div className="fixed inset-0 z-[130]">
          <button
            aria-label="Close"
            onClick={() => setOpen(null)}
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
                onClick={() => setOpen(null)}
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
      )}
    </>
  );
}
