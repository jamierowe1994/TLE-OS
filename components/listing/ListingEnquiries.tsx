"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { Tag } from "@/components/ListingTags";
import PassportAnswers from "@/components/passport/PassportAnswers";

/**
 * A LISTING'S ENQUIRIES, WITH THEIR PASSPORTS (James, 8 Oct 2026).
 *
 * The people who asked about the home from Rightmove, Zoopla and the rest -
 * not offers ("no one's offered on the property, so it's not an offer").
 * Each row says where their tenant passport is, live from
 * /api/tenant/passport/status: Not sent, Sent, Filling in, Passport done.
 * A done one (or one being filled in) opens as a list of answers.
 *
 * Send passports: tick who, read the email they will get, then send. Each
 * goes on its own through POST /api/tenant/passport/invite - from the
 * agent's own mailbox, behind the customer email switch, one passport per
 * tenant - and the row turns to Sent. Nothing goes until Send is pressed.
 */

export type Enquiry = { id: string; name: string; source: string; received: string; receivedAt?: string; email: string; phone: string; message?: string };
type Status = { state: "none" | "sent" | "started" | "done"; invitedAt: string | null; submittedAt: string | null };
type Result = { email: string; name: string; ok: boolean; said: string };

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

function StatusPill({ s, onOpen }: { s: Status | undefined; onOpen: () => void }) {
  if (!s || s.state === "none") return <Tag tone="neutral">Not sent</Tag>;
  if (s.state === "sent") return <Tag tone="accent">{`Sent${s.invitedAt ? ` ${short(s.invitedAt)}` : ""}`}</Tag>;
  if (s.state === "started")
    return (
      <button type="button" onClick={onOpen} className="rounded-full border border-accent-dark/60 bg-white px-2.5 py-1 text-[11px] font-semibold text-accent-dark hover:bg-accent-soft">
        Filling in
      </button>
    );
  return (
    <button type="button" onClick={onOpen} className="rounded-full bg-accent-dark px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90" title="Open their answers">
      ✓ Passport done
    </button>
  );
}

export default function ListingEnquiries({ enquiries }: { enquiries: Enquiry[] }) {
  const [statuses, setStatuses] = useState<Record<string, Status> | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [viewing, setViewing] = useState<{ email: string; name: string } | null>(null);

  const emails = useMemo(() => [...new Set(enquiries.map((e) => e.email.trim().toLowerCase()).filter(emailOk))], [enquiries]);
  const readStatuses = useCallback(() => {
    if (!emails.length) return setStatuses({});
    fetch("/api/tenant/passport/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails }) })
      .then((r) => r.json())
      .then((j: { ok?: boolean; statuses?: Record<string, Status> }) => setStatuses(j.ok ? (j.statuses ?? {}) : {}))
      .catch(() => setStatuses({}));
  }, [emails]);
  useEffect(() => {
    setStatuses(null);
    readStatuses();
  }, [readStatuses]);

  const statusOf = (e: Enquiry) => statuses?.[e.email.trim().toLowerCase()];
  /* One row a person: the same tenant can enquire twice. */
  const people = useMemo(() => {
    const seen = new Set<string>();
    return enquiries.filter((e) => {
      const k = e.email.trim().toLowerCase() || e.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [enquiries]);
  const sendable = (e: Enquiry) => emailOk(e.email) && (statusOf(e)?.state ?? "none") === "none";
  const notSent = people.filter(sendable);
  const counts = useMemo(() => {
    const c = { none: 0, sent: 0, started: 0, done: 0 };
    for (const e of people) c[statusOf(e)?.state ?? "none"]++;
    return c;
  }, [people, statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const startPicking = () => {
    setResults(null);
    setChosen(new Set(notSent.map((e) => e.email.trim().toLowerCase())));
    setPicking(true);
  };
  const recipients = people.filter((e) => chosen.has(e.email.trim().toLowerCase()));

  async function openReview() {
    setReviewing(true);
    setPreview(null);
    const first = recipients[0];
    const j = await fetch("/api/tenant/passport/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preview: true, name: first?.name ?? "" }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; subject?: string; html?: string }>)
      .catch(() => null);
    if (j?.ok && j.html) setPreview({ subject: j.subject ?? "", html: j.html });
  }

  async function sendAll() {
    if (sending) return;
    setSending(true);
    const out: Result[] = [];
    for (const e of recipients) {
      const j = await fetch("/api/tenant/passport/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: e.name, email: e.email.trim() }),
      })
        .then((r) => r.json() as Promise<{ ok?: boolean; alreadySent?: boolean; invitedAt?: string; error?: string; said?: string }>)
        .catch(() => null);
      out.push({
        email: e.email,
        name: e.name,
        ok: Boolean(j?.ok),
        said: !j ? "The connection dropped." : j.ok ? (j.alreadySent ? `Already sent ${j.invitedAt ? short(j.invitedAt) : "before"}.` : "Sent.") : (j.error ?? "It didn't send."),
      });
      setResults([...out]);
    }
    setSending(false);
    setReviewing(false);
    setPicking(false);
    setChosen(new Set());
    readStatuses();
  }

  const sentCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5" data-steve="listing.enquiries">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="hand flex items-center gap-2.5 text-[15px]">
          <DoodleIcon name="target" size={15} className="text-accent-dark" />
          Enquiries · {people.length}
          {enquiries.length > people.length && <span className="text-[11.5px] font-normal text-muted">({enquiries.length} enquiries from {people.length} people)</span>}
        </h3>
        {people.length > 0 &&
          (picking ? (
            <button type="button" onClick={() => setPicking(false)} className="rounded-full px-3 py-2 text-[11.5px] font-semibold text-muted hover:text-ink">
              Cancel
            </button>
          ) : (
            <PressButton
              onClick={startPicking}
              className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-white"
            >
              <DoodleIcon name="user" size={13} />
              Send passports
            </PressButton>
          ))}
      </div>

      {/* Where the passports are, at a glance. */}
      {people.length > 0 && (
        <p className="mb-2 text-[11.5px] text-muted">
          {statuses === null
            ? "Checking their passports…"
            : [
                counts.done && `${counts.done} done`,
                counts.started && `${counts.started} filling in`,
                counts.sent && `${counts.sent} sent`,
                counts.none && `${counts.none} not sent`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      )}

      {results && (
        <div className="mb-3 rounded-2xl border border-line/60 bg-page px-4 py-3 text-[12px] leading-relaxed">
          <p className="font-semibold">
            {sentCount} passport{sentCount === 1 ? "" : "s"} sent{results.length > sentCount ? `, ${results.length - sentCount} didn't go` : ""}.
          </p>
          {results.filter((r) => !r.ok).map((r) => (
            <p key={r.email} className="text-accent-dark">
              {r.name}: {r.said}
            </p>
          ))}
        </div>
      )}

      {people.length ? (
        <ul className="divide-y divide-line/40">
          {people.map((e) => {
            const k = e.email.trim().toLowerCase();
            const can = sendable(e);
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                {picking && (
                  <input
                    type="checkbox"
                    aria-label={`Send ${e.name} a passport`}
                    checked={chosen.has(k)}
                    disabled={!can}
                    onChange={() => toggle(k)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent-dark)] disabled:opacity-30"
                  />
                )}
                <a href={`/leads?open=${encodeURIComponent(e.id)}`} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 transition-colors hover:bg-page sm:grid-cols-[minmax(0,1.2fr)_96px_minmax(0,1fr)_80px]">
                  <span className="min-w-0">
                    <span className="hand block truncate text-[13px]">{e.name}</span>
                    <span className="block truncate text-[10.5px] text-muted">{[e.phone, e.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                  </span>
                  <span className="hidden sm:block"><Tag tone="neutral">{e.source}</Tag></span>
                  <span className="hidden min-w-0 truncate text-[11px] text-muted sm:block">{e.message || "-"}</span>
                  <span className="text-right text-[11px] text-muted">{e.received}</span>
                </a>
                <span className="shrink-0">
                  {!emailOk(e.email) ? (
                    <Tag tone="neutral">No email</Tag>
                  ) : statuses === null ? (
                    <span className="text-[11px] text-muted">…</span>
                  ) : (
                    <StatusPill s={statusOf(e)} onOpen={() => setViewing({ email: e.email.trim(), name: e.name })} />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-[12px] text-muted">No enquiries on this listing yet.</p>
      )}

      {/* The pick, held at the foot while they tick. */}
      {picking && (
        <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line/60 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)]">
          <span className="min-w-0 flex-1 text-[12.5px]">
            <span className="font-semibold">{recipients.length} picked</span>
            <span className="text-muted"> · only people not sent one yet can be picked</span>
          </span>
          <button type="button" onClick={() => setChosen(new Set(notSent.map((e) => e.email.trim().toLowerCase())))} className="text-[12px] font-semibold text-muted hover:text-ink">
            All not sent ({notSent.length})
          </button>
          <button type="button" onClick={() => setChosen(new Set())} className="text-[12px] font-semibold text-muted hover:text-ink">
            Clear
          </button>
          <PressButton
            onClick={() => recipients.length && void openReview()}
            disabled={!recipients.length}
            className={`press-ring rounded-full px-4 py-2 text-[12.5px] font-semibold ${recipients.length ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
          >
            Review and send ({recipients.length})
          </PressButton>
        </div>
      )}

      {/* Read it, then send: who it goes to and the email they will get. */}
      {reviewing &&
        createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" data-steve-never>
            <button aria-label="Close" onClick={() => !sending && setReviewing(false)} className="absolute inset-0 cursor-default bg-ink/45" />
            <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
              <div className="shrink-0 border-b border-line/70 px-6 py-4">
                <h2 className="text-[19px] leading-tight">Send Passports to {recipients.length} {recipients.length === 1 ? "Person" : "People"}</h2>
                <p className="mt-0.5 text-[12px] text-muted">Each gets their own email and their own passport link, from you.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Going to</p>
                <ul className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
                  {recipients.map((e) => {
                    const r = results?.find((x) => x.email === e.email);
                    return (
                      <li key={e.email} className="flex items-center gap-3 border-b border-line/40 px-4 py-2 last:border-b-0">
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">
                          <span className="font-semibold">{e.name}</span> <span className="text-muted">{e.email}</span>
                        </span>
                        {r ? <span className={`text-[11.5px] font-semibold ${r.ok ? "text-[#56634a]" : "text-accent-dark"}`}>{r.ok ? "✓ Sent" : r.said}</span> : sending ? <span className="text-[11px] text-muted">Waiting…</span> : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The email{recipients[0] ? `, as ${recipients[0].name.split(/\s+/)[0]} will get it` : ""}</p>
                {preview ? (
                  <>
                    <p className="mt-2 text-[12.5px]"><span className="text-muted">Subject:</span> <span className="font-semibold">{preview.subject}</span></p>
                    <iframe title="The passport email" srcDoc={preview.html} sandbox="" className="mt-2 h-[420px] w-full rounded-2xl border border-line/60 bg-white" />
                  </>
                ) : (
                  <p className="mt-2 text-[12px] text-muted">Getting the email ready…</p>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
                <button type="button" disabled={sending} onClick={() => setReviewing(false)} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50">
                  Back
                </button>
                <PressButton
                  onClick={() => void sendAll()}
                  disabled={sending || !preview}
                  className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${!sending && preview ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
                >
                  {sending ? `Sending ${results?.length ?? 0} of ${recipients.length}…` : `Send to ${recipients.length}`}
                </PressButton>
              </div>
            </div>
          </div>,
          document.body
        )}

      <PassportAnswers email={viewing?.email ?? null} name={viewing?.name} onClose={() => setViewing(null)} />
    </section>
  );
}
