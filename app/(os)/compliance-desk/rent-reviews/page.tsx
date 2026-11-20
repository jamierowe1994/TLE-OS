"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Mast, Tabs, type Tone } from "@/components/new-look/Parts";
import FloatSheet, { FloatCard, FloatCardHead } from "@/components/new-look/FloatSheet";
import {
  RESPONSE_LABEL, STATUS_LABEL, dayWords, increaseOf, periodOf, pounds, ukToday,
  type RentReview, type ReviewStatus, type TenantResponse,
} from "@/lib/rent-review-rules";

/**
 * RENT REVIEWS: Scotland's rent-increase notices, on Michael's desk (20 Nov 2026).
 *
 * The agents send the prescribed notice from the home (lib/rent-reviews); it
 * arrives here. Unlike a Section 13 there is nothing to approve: the law's
 * dates are checked as the agent types and again on the server, and the
 * notice has gone by the time it is listed. What is left for the office:
 *
 *   PayProp updated   accounts were emailed to amend the invoices from the
 *                     day the new rent starts; tick it once they have.
 *   The tenant's reply  Part 3: accepted, says the notice was short, or
 *                     referring it to a Rent Officer (21 days to do so).
 *
 * Everything the agent answered is here, with their reason, what similar
 * homes rent for, the evidence and the notice itself. Nothing here sends.
 */

type View = "todo" | "all" | "effect";
const TONE: Record<ReviewStatus, Tone> = { sent: "accent", payprop_updated: "info", in_effect: "good" };
const DAY = 86_400_000;
const daysUntil = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${ukToday()}T12:00:00Z`)) / DAY);
const sentDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const sentTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const file = (key: string) => `/api/r2/file?key=${encodeURIComponent(key)}`;

function until(d: string) {
  const n = daysUntil(d);
  return n > 1 ? `in ${n} days` : n === 1 ? "tomorrow" : n === 0 ? "today" : n === -1 ? "since yesterday" : `${-n} days ago`;
}

export default function RentReviews() {
  const [list, setList] = useState<RentReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("todo");
  const [open, setOpen] = useState<RentReview | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/rent-reviews/desk", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) return setError(j?.error ?? "The rent reviews couldn't be read.");
        setList(j.reviews as RentReview[]);
      })
      .catch(() => setError("The rent reviews couldn't be read."));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("open");
    if (want && list) {
      const r = list.find((x) => x.id === want);
      if (r) setOpen(r);
    }
  }, [list]);

  const counts = useMemo(() => ({
    todo: (list ?? []).filter((r) => r.status === "sent").length,
    all: (list ?? []).length,
    effect: (list ?? []).filter((r) => r.status === "in_effect").length,
  }), [list]);
  const rows = useMemo(() => (list ?? []).filter((r) => (view === "todo" ? r.status === "sent" : view === "effect" ? r.status === "in_effect" : true)), [list, view]);
  const changed = (r: RentReview) => {
    setList((l) => (l ?? []).map((x) => (x.id === r.id ? r : x)));
    setOpen(r);
  };

  return (
    <div data-look="new" className="nl-page nl-rise nl-edge rrd">
      <Mast
        eyebrow="Scotland"
        title="Rent Reviews"
        blurb="Rent-increase notices the agents have sent from Scottish homes. Accounts are emailed to amend PayProp from the day each new rent starts: tick PayProp updated once they have, and record the tenant's reply to Part 3."
      />
      <Tabs
        label="Which rent reviews"
        value={view}
        onChange={setView}
        items={[
          { id: "todo", label: "PayProp to Update", count: list ? counts.todo : null, dot: counts.todo > 0 },
          { id: "effect", label: "In Effect", count: list ? counts.effect : null },
          { id: "all", label: "All", count: list ? counts.all : null },
        ]}
      />
      {error ? (
        <div className="rrd-card" role="alert">
          <p>{error}</p>
          <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={load}>Try Again</button>
        </div>
      ) : !list ? (
        <div className="rrd-card"><span className="rrd-spin" aria-hidden /> Reading the rent reviews…</div>
      ) : !rows.length ? (
        <p className="nl-empty rrd-empty">{view === "todo" ? "Nothing to update. PayProp is up to date on every rent review sent." : view === "effect" ? "None in effect yet." : "No rent-increase notices have been sent yet."}</p>
      ) : (
        <ul className="rrd-list">
          <li className="rrd-head" aria-hidden>
            <span>Home</span><span>Rent</span><span>Starts</span><span>Sent</span><span>Status</span>
          </li>
          {rows.map((r) => {
            const a = r.answers;
            const inc = increaseOf(a.currentRent, a.currentPeriod, a.newRent, a.newPeriod);
            const went = r.recipients.filter((x) => x.sent).length;
            return (
              <li key={r.id}>
                <button type="button" className="rrd-row" onClick={() => setOpen(r)}>
                  <span className="rrd-home">
                    <b>{r.home}</b>
                    <small>{r.sentBy.name}{r.demo ? " · demo" : ""}</small>
                  </span>
                  <span className="rrd-rent">
                    <b>{pounds(a.currentRent)} → {pounds(a.newRent)}</b>
                    <small>{periodOf(a.newPeriod).per}{inc ? ` · up ${inc.pct}%` : ""}</small>
                  </span>
                  <span>
                    <b>{dayWords(a.effectiveDate)}</b>
                    <small>{until(a.effectiveDate)}</small>
                  </span>
                  <span>
                    <b>{sentDay(r.sentAt)}</b>
                    <small>{r.method === "print" ? "Printed to hand over or post" : `${went} of ${r.recipients.length} emailed`}</small>
                  </span>
                  <span className="rrd-st">
                    <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.response && <small>{RESPONSE_LABEL[r.response]}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <ReviewSheet review={open} onClose={() => setOpen(null)} onChange={changed} />}
    </div>
  );
}

function ReviewSheet({ review: r, onClose, onChange }: { review: RentReview; onClose: () => void; onChange: (r: RentReview) => void }) {
  const a = r.answers;
  const inc = increaseOf(a.currentRent, a.currentPeriod, a.newRent, a.newPeriod);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resp, setResp] = useState<TenantResponse | "">(r.response ?? "");
  const [respDate, setRespDate] = useState(r.responseDate ?? "");
  const [respNote, setRespNote] = useState(r.responseNote ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>, said: string) => {
    setBusy(true);
    setErr(null);
    setSaved(null);
    const j = await fetch(`/api/rent-reviews/${encodeURIComponent(r.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!j?.ok) return setErr(j?.error ?? "That didn't save.");
    onChange(j.review as RentReview);
    setSaved(said);
  };

  const rows: [string, React.ReactNode][] = [
    ["Tenants", a.tenantNames],
    ["Let address", a.letAddress],
    ["Landlord", <>{a.landlordName}<br /><span className="rrd-pre">{a.landlordAddress}</span></>],
    ["Agent's address", <span className="rrd-pre">{a.agentAddress}</span>],
    ["Rent", <>{pounds(a.currentRent)} {periodOf(a.currentPeriod).per} to <b>{pounds(a.newRent)} {periodOf(a.newPeriod).per}</b>{inc ? `, up ${pounds(inc.amount)} (${inc.pct}%)` : ""}</>],
    ["Starts", `${dayWords(a.effectiveDate)}, ${until(a.effectiveDate)}`],
    ["Last increase", a.notIncreased ? "Not since the tenancy began (n/a on the notice)" : dayWords(a.lastIncrease)],
    ["PRT", a.prtConfirmed ? "Confirmed by the agent as a private residential tenancy" : "Not confirmed"],
    ["By email", a.emailAgreed ? "The agent ticked that the tenancy agreement allows notices by email" : "Not agreed: printed to hand over or post recorded delivery"],
    ["Signed", `${a.signature}, ${sentDay(r.sentAt)}`],
  ];

  return (
    <FloatSheet title={r.home} onClose={onClose} size="lg" dismissible={!busy} label={`Rent review, ${r.home}`}>
      <FloatCard>
        <FloatCardHead title="Where It Stands" aside={<Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>} />
        <p className="rrd-p">
          Sent by {r.sentBy.name} on {sentDay(r.sentAt)} at {sentTime(r.sentAt)}.{r.demo ? " Demo copy: nothing was sent." : ""}
        </p>
        <div className="rrd-acts">
          {r.status === "sent" ? (
            <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy} onClick={() => void patch({ action: "payprop" }, "PayProp marked as updated.")}>PayProp Updated</button>
          ) : (
            <>
              <span className="rrd-p">PayProp updated by {r.paypropBy ?? "the office"}{r.paypropAt ? `, ${sentDay(r.paypropAt)}` : ""}.</span>
              <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={busy} onClick={() => void patch({ action: "payprop", undo: true }, "PayProp tick taken off.")}>Take the tick off</button>
            </>
          )}
          {r.pdfKey && <a className="nl-btn nl-btn--secondary nl-btn--sm" href={file(r.pdfKey)} target="_blank" rel="noopener noreferrer">Open the Notice</a>}
          <Link className="nl-btn nl-btn--quiet nl-btn--sm" href={`/portfolio/${encodeURIComponent(r.listingId)}`}>Open the Home</Link>
        </div>
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="The Tenant's Reply" aside={r.response ? RESPONSE_LABEL[r.response] : "Nothing recorded"} />
        <p className="rrd-p">From Part 3 of the notice. A tenant referring it to a Rent Officer has 21 days from receiving it.</p>
        <div className="rrd-form">
          <label>
            <span>Their answer</span>
            <select value={resp} onChange={(e) => setResp(e.target.value as TenantResponse | "")}>
              <option value="">Nothing yet</option>
              {(Object.keys(RESPONSE_LABEL) as TenantResponse[]).map((k) => <option key={k} value={k}>{RESPONSE_LABEL[k]}</option>)}
            </select>
          </label>
          <label>
            <span>Date</span>
            <input type="date" value={respDate} max={ukToday()} onChange={(e) => setRespDate(e.target.value)} disabled={!resp} />
          </label>
          <label className="rrd-wide">
            <span>Note</span>
            <textarea rows={2} value={respNote} onChange={(e) => setRespNote(e.target.value)} placeholder="What they said, the date they say they got it" />
          </label>
        </div>
        <div className="rrd-acts">
          <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy} onClick={() => void patch({ action: "response", response: resp || null, date: respDate || null, note: respNote }, "The reply is saved.")}>Save the Reply</button>
          {r.responseBy && <span className="rrd-p">Last recorded by {r.responseBy}.</span>}
        </div>
        {err && <p className="rrd-err" role="alert">{err}</p>}
        {saved && <p className="rrd-ok" role="status">{saved}</p>}
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="Why This Rent" />
        <p className="rrd-why">{a.why}</p>
        <dl className="rrd-dl">
          <div><dt>Similar homes</dt><dd>{pounds(a.marketRent)} {periodOf(a.newPeriod).per}{a.marketNote ? ` - ${a.marketNote}` : ""}</dd></div>
          <div>
            <dt>Evidence</dt>
            <dd>
              {r.evidence.length ? (
                <ul className="rrd-files">
                  {r.evidence.map((f) => <li key={f.key}><a href={file(f.key)} target="_blank" rel="noopener noreferrer">{f.name}</a></li>)}
                </ul>
              ) : "None"}
            </dd>
          </div>
        </dl>
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="The Notice" />
        <dl className="rrd-dl">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="Who Was Told" />
        <ul className="rrd-sent">
          {r.method === "print" && <li><b>The tenants</b><small>Printed by the agent, to hand over or post recorded delivery.</small></li>}
          {r.recipients.map((x) => (
            <li key={`${x.email}-${x.name}`} className={x.sent ? "" : "is-no"}><b>{x.name}</b><small>{x.email}. {x.detail}</small></li>
          ))}
          <li className={r.accounts.sentAt ? "" : "is-no"}><b>Accounts</b><small>{r.accounts.to}. {r.accounts.detail}</small></li>
        </ul>
      </FloatCard>
    </FloatSheet>
  );
}
