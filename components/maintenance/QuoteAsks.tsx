"use client";

import { useEffect, useMemo, useState } from "react";
import type { Move, QuoteAsk, RankedContractor, WorksOrder } from "@/lib/works-orders";
import { pounds, stamp, toPence } from "@/components/maintenance/works-ui";

/**
 * Quotes from several contractors at once (Sean McMahon, 21 Oct 2026: Forth
 * said the job was too far, he put All Trade on it, and could not send them
 * the request).
 *
 *   AskForQuotes   the send screen: tick one or more from the book, nearest
 *                  first by trade, see the email as each will get it, send.
 *   QuoteBoard     every contractor asked and where they are: still to
 *                  answer (send again, key their price in, they can't do it),
 *                  quoted (take it), can't do it, taken, gone elsewhere.
 *
 * Every button is one Move on PATCH /api/works-orders/<id>; the server
 * writes the timeline, sends the emails (each on the contractor's own link,
 * the home's agent copied in) and closes the others when one is taken.
 */

const field = "wn-field w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[13px] outline-none focus:border-ink";
const btn = "wn-btn rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-50";
const primary = "wn-primary rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50";
const label = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted";
const names = (list: string[]) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

type Preview = { subject: string; html: string; to: string } | { error: string };

export function AskForQuotes({ o, send, busy, onBack, sendLabel }: {
  o: WorksOrder;
  /** Resolves true once the server has taken it. */
  send: (m: Move) => Promise<unknown>;
  busy: boolean;
  onBack?: () => void;
  sendLabel?: string;
}) {
  const [ranked, setRanked] = useState<RankedContractor[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});

  useEffect(() => {
    let live = true;
    fetch(`/api/contractors?for=${encodeURIComponent(o.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) { if (j?.ok) setRanked(j.ranked ?? []); else setErr(j?.error ?? "Could not read the book."); } })
      .catch(() => { if (live) setErr("Could not read the book."); });
    return () => { live = false; };
  }, [o.id]);

  const asked = useMemo(() => new Map(o.quoteAsks.map((a) => [a.contractorId, a])), [o.quoteAsks]);
  const list = ranked ?? [];
  const shown = showAll ? list : list.slice(0, 8);
  const chosen = picked.map((id) => list.find((c) => c.id === id)).filter((c): c is RankedContractor => !!c);
  const noEmail = chosen.filter((c) => !c.email?.includes("@"));
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  /* The email as the contractor being looked at will get it. */
  const look = viewing && picked.includes(viewing) ? viewing : picked[0] ?? null;
  useEffect(() => {
    if (!look || previews[look]) return;
    let live = true;
    fetch("/api/works-orders/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: o.id, contractorId: look, template: "quote" }) })
      .then((r) => r.json())
      .then((j) => { if (live) setPreviews((cur) => ({ ...cur, [look]: j?.ok ? { subject: j.subject, html: j.html, to: j.to } : { error: j?.error ?? "The preview could not be written." } })); })
      .catch(() => { if (live) setPreviews((cur) => ({ ...cur, [look]: { error: "The preview could not be written." } })); });
    return () => { live = false; };
  }, [look, o.id, previews]);
  const preview = look ? previews[look] : null;

  return (
    <div className="space-y-3">
      <div>
        <span className={label}>Who to ask</span>
        <p className="mb-2 text-[11.5px] text-muted">Tick as many as you like. Each gets the job on a link of their own, so every reply is tracked against their name.</p>
        {err && <p className="text-[12px] text-accent-dark">{err}</p>}
        {ranked === null && !err && (
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden /> Finding the nearest {o.category ? o.category.toLowerCase() : "trades"} people…
          </p>
        )}
        {ranked && ranked.length === 0 && <p className="text-[12.5px] text-muted">Nobody in your book or the company&apos;s yet. Add one under Contractors first.</p>}
        {shown.length > 0 && (
          <ul className="divide-y divide-line/50 overflow-hidden rounded-xl border border-line/80 bg-white">
            {shown.map((c) => {
              const on = picked.includes(c.id);
              const was = asked.get(c.id);
              return (
                <li key={c.id}>
                  <label className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${on ? "bg-accent-soft/40" : "hover:bg-panel/60"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="h-4 w-4 shrink-0 accent-[var(--ink)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{c.name}{c.contact ? <span className="text-muted"> · {c.contact}</span> : null}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {c.trade}{c.fits ? "" : " · different trade"}{c.miles != null ? ` · ${c.miles < 10 ? c.miles.toFixed(1) : Math.round(c.miles)} miles` : ""}{c.ownerId ? "" : " · company"}{c.email?.includes("@") ? "" : " · no email"}
                      </span>
                    </span>
                    {was && <AskChip a={was} />}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > 8 && <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-[11.5px] text-muted underline underline-offset-2 hover:text-ink">{showAll ? "Show the nearest eight" : `Show all ${list.length}`}</button>}
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line for the timeline (optional)" className={field} />

      {chosen.length > 0 && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={label}>The email</span>
            {chosen.length > 1 && (
              <span className="flex flex-wrap gap-1">
                {chosen.map((c) => (
                  <button key={c.id} type="button" onClick={() => setViewing(c.id)} className={`rounded-full px-2.5 py-0.5 text-[11px] ${look === c.id ? "bg-ink text-page" : "border border-line/80 bg-white text-muted hover:text-ink"}`}>{c.name}</button>
                ))}
              </span>
            )}
          </div>
          {!preview ? (
            <div className="flex h-32 items-center justify-center gap-2 rounded-xl border border-line/60 bg-white text-[12px] text-muted">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden /> Writing the email…
            </div>
          ) : "error" in preview ? (
            <p className="rounded-xl border border-line/60 bg-white px-4 py-3 text-[12.5px] text-accent-dark">{preview.error}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line/60 bg-white">
              <p className="border-b border-line/50 px-4 py-2 text-[12px]"><span className="text-muted">To:</span> {preview.to || "no email in the book"}</p>
              <p className="border-b border-line/50 px-4 py-2 text-[12px]"><span className="text-muted">Subject:</span> {preview.subject}</p>
              <iframe title="The quote request" srcDoc={preview.html} sandbox="" className="block h-[340px] w-full bg-white" />
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted">The home&apos;s agent is copied in. No tenants&apos; details go until a quote is approved.</p>
          {noEmail.length > 0 && <p className="mt-1.5 rounded-lg border border-accent-dark/40 bg-accent-soft/40 px-3 py-2 text-[12px]">{names(noEmail.map((c) => c.name))} {noEmail.length === 1 ? "has" : "have"} no email in the book, so nothing can be sent to them. They&apos;re still listed, so you can ring and key their price in.</p>}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onBack && <button type="button" onClick={onBack} className={btn}>Back</button>}
        <button
          type="button"
          disabled={busy || !chosen.length}
          onClick={() => void send({ action: "request_quote", contractorIds: picked, note: note.trim() || undefined })}
          className={primary}
        >
          {busy ? "Sending…" : sendLabel ?? (chosen.length > 1 ? `Send to ${chosen.length} contractors` : chosen.length === 1 ? `Send to ${chosen[0].name}` : "Pick who to ask")}
        </button>
      </div>
    </div>
  );
}

const CHIP: Record<QuoteAsk["state"], string> = {
  asked: "border border-line/80 bg-white text-ink/70",
  quoted: "bg-[#f1f4ec] text-[#56634a]",
  declined: "bg-panel text-muted",
  accepted: "bg-sage text-white",
  closed: "bg-panel text-muted",
};

function AskChip({ a }: { a: QuoteAsk }) {
  const words = a.state === "asked" ? (a.sends > 1 ? `Asked ${a.sends} times` : "Asked") : a.state === "quoted" ? `Quoted ${pounds(a.quotePence)}` : a.state === "declined" ? "Can't do it" : a.state === "accepted" ? "Taken" : "Gone elsewhere";
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${CHIP[a.state]}`}>{words}</span>;
}

/** Every contractor asked, and what each needs next. */
export function QuoteBoard({ o, move, busy, onAskMore }: { o: WorksOrder; move: (m: Move) => Promise<unknown>; busy: boolean; onAskMore: () => void }) {
  const [open, setOpen] = useState<{ id: string; what: "price" | "decline" } | null>(null);
  const [val, setVal] = useState("");
  const asks = o.quoteAsks;
  const quoted = asks.filter((a) => a.state === "quoted" && a.quotePence != null);
  const lowest = quoted.length > 1 ? Math.min(...quoted.map((a) => a.quotePence!)) : null;
  const waiting = asks.filter((a) => a.state === "asked").length;
  const go = async (m: Move) => { await move(m); setOpen(null); setVal(""); };

  return (
    <div className="space-y-3">
      <p className="text-[13px]">
        {quoted.length
          ? `${quoted.length} ${quoted.length === 1 ? "quote" : "quotes"} in${waiting ? `, ${waiting} still to answer` : ""}. Take one and the others are thanked and told it's gone elsewhere.`
          : waiting
            ? `Waiting on ${waiting === 1 ? asks.find((a) => a.state === "asked")!.contractorName : `${waiting} contractors`}. They can send it from their own link, or key it in here when they reply.`
            : "Nobody is left to answer. Ask another contractor."}
      </p>
      <ul className="divide-y divide-line/50 overflow-hidden rounded-xl border border-line/80 bg-white">
        {asks.map((a) => (
          <li key={a.id} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{a.contractorName}</span>
                <span className="block truncate text-[11px] text-muted">
                  {a.state === "declined"
                    ? `Can't do it${a.declineNote ? `: ${a.declineNote}` : ""}`
                    : a.state === "quoted" || a.state === "accepted"
                      ? `${a.quoteNote ? `${a.quoteNote} · ` : ""}in ${stamp(a.quotedAt)}`
                      : a.state === "closed"
                        ? `Told ${stamp(a.outcomeAt)}`
                        : `Sent ${stamp(a.lastSentAt)}${a.sends > 1 ? ` · ${a.sends} times` : ""}`}
                </span>
              </span>
              {lowest != null && a.quotePence === lowest && a.state === "quoted" && <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#56634a]">Lowest</span>}
              <AskChip a={a} />
              <span className="flex flex-wrap gap-1.5">
                {a.state === "quoted" && <button type="button" disabled={busy} onClick={() => void go({ action: "accept_quote", askId: a.id })} className={primary}>Take this quote</button>}
                {a.state === "asked" && (
                  <>
                    <button type="button" disabled={busy} onClick={() => { setOpen({ id: a.id, what: "price" }); setVal(""); }} className={btn}>Key in their price</button>
                    <button type="button" disabled={busy} onClick={() => void go({ action: "resend_quote", askId: a.id })} className={btn}>Send again</button>
                  </>
                )}
                {(a.state === "asked" || a.state === "quoted") && <button type="button" disabled={busy} onClick={() => { setOpen({ id: a.id, what: "decline" }); setVal(""); }} className={btn}>Can&apos;t do it</button>}
                {a.state === "declined" && <button type="button" disabled={busy} onClick={() => void go({ action: "request_quote", contractorIds: [a.contractorId] })} className={btn}>Ask again</button>}
              </span>
            </div>
            {open?.id === a.id && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  autoFocus
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  inputMode={open.what === "price" ? "decimal" : "text"}
                  placeholder={open.what === "price" ? "£ their quote" : "Why, if they said (too far, too busy)"}
                  className={`${field} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  disabled={busy || (open.what === "price" && !(toPence(val) > 0))}
                  onClick={() => void go(open.what === "price" ? { action: "ask_quote_in", askId: a.id, quotePence: toPence(val), note: "Keyed in off their reply." } : { action: "ask_declined", askId: a.id, note: val.trim() || undefined })}
                  className={primary}
                >
                  {open.what === "price" ? "Add it" : "They can't do it"}
                </button>
                <button type="button" onClick={() => setOpen(null)} className={btn}>Back</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted">Within the landlord&apos;s {pounds(o.authorityPence)} a quote is approved as it&apos;s taken. Over it, the landlord is sent it to approve.</p>
        <button type="button" disabled={busy} onClick={onAskMore} className={btn}>Ask another contractor</button>
      </div>
    </div>
  );
}
