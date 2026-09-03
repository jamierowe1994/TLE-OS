"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One email from the catalogue, shown as it arrives.
 *
 * ── Why an iframe with srcDoc ─────────────────────────────────────────────
 *
 * The same choice /admin/emails already made, and for the same two reasons.
 * The document exists in memory, so a route serving raw email HTML would be a
 * second place the same thing could be read from; and email markup is tables
 * and inline styles written for Outlook, which would fight this page's CSS if
 * it were dropped into the document. `sandbox=""` with no allow flags means
 * nothing in it can run or navigate.
 *
 * ── Loaded on demand ──────────────────────────────────────────────────────
 *
 * A folder can hold five emails and rendering all of them on arrival would be
 * five requests for something nobody has asked to look at yet. It fetches when
 * opened, once.
 */
export default function EmailCard({ emailId }: { emailId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const asked = useRef(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  /* The same test send Admin → Emails has: this exact email, to the person
     pressing the button and nobody else - the route reads the recipient from
     the session, not the request. For the video nudge it links to a demo
     appraisal that exists, so the button in the inbox goes somewhere real
     and the recorder can be run through end to end. */
  async function sendToMe() {
    setSending(true);
    setSent(null);
    try {
      const r = await fetch("/api/admin/emails/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: emailId }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; to?: string; error?: string };
      if (j.ok) setSent({ tone: "ok", text: `Sent to ${j.to}. Check your inbox.` });
      else setSent({ tone: "err", text: j.error ?? `That didn't send (${r.status}).` });
    } catch {
      setSent({ tone: "err", text: "That didn't send. Try again in a moment." });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    setState("loading");
    fetch(`/api/admin/emails?id=${encodeURIComponent(emailId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? `That did not load (${r.status}).`);
        setSubject(j.subject ?? "");
        setHtml(j.html ?? "");
        setState("ready");
      })
      .catch((e) => {
        setError((e as Error).message);
        setState("error");
      });
  }, [open, emailId]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
      >
        {open ? "Hide the email" : "Show the email"}
      </button>

      {open && (
        <div className="fade-up mt-3 rounded-xl border border-line/80 bg-box p-3">
          {state === "loading" && <p className="text-[12px] text-muted">Rendering it…</p>}

          {state === "error" && (
            <p className="text-[12px] leading-relaxed text-accent-dark">
              {error}
              <span className="mt-1 block text-muted">
                These render for owners only, which is why this can refuse even
                though the page opened.
              </span>
            </p>
          )}

          {state === "ready" && (
            <>
              {/* The subject line, which preview panes usually hide and which is
                  half of whether an email gets opened at all. */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <p className="text-[11.5px] text-muted">
                  Subject: <span className="text-ink">{subject}</span>
                </p>
                <div className="flex items-center gap-2.5">
                  {sent && (
                    <span className={`text-[11.5px] ${sent.tone === "err" ? "font-semibold text-accent-dark" : "text-muted"}`}>
                      {sent.text}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={sendToMe}
                    disabled={sending}
                    className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
                    title="A test copy, to your own inbox"
                  >
                    {sending ? "Sending…" : "Send it to myself"}
                  </button>
                </div>
              </div>
              <iframe
                srcDoc={html}
                sandbox=""
                title={`Email preview: ${subject}`}
                className="h-[560px] w-full rounded-lg border border-line/70 bg-white"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
