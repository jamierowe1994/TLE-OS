"use client";

import { useEffect, useMemo, useState } from "react";
import FloatSheet, { FloatCard, FloatCardHead, FloatDone, FloatFoot } from "@/components/new-look/FloatSheet";
import Compose from "@/components/Compose";
import type { WorksOrder } from "@/lib/works-orders";

/**
 * CHECK A CONTRACTOR'S INVOICE (James, 24 Nov 2026, after Sean McMahon's
 * complaint of 23 Nov: invoices "by-passing the agent").
 *
 * The invoice on the left, the figures on the right. The agent can pass it
 * on as it is, or put the total the landlord is charged above the
 * contractor's figure: the difference is the agent's own, for arranging the
 * work ("the contractor's fee is £200, you want to make it £250"). Before
 * anything is sent the agent sees, in pounds and pence, what the landlord is
 * charged, what the contractor is paid and what they are paid themselves.
 * Accounts are emailed those three figures with the invoice.
 *
 * Or it is declined, with why. Nothing is emailed to the contractor on its
 * own: an email is drafted for the agent to read, change and send, and the
 * contractor can upload a corrected invoice from the link they already have.
 *
 * Behind the "invoiceapprove" switch (lib/new-look). Without it the job
 * shows the plain card (components/maintenance/InvoiceWaiting): send it on
 * unchanged, or send it back.
 */

const NO_MERGE: Record<string, string | undefined> = {};
type Screen = "check" | "confirm" | "sent" | "why" | "declined";
type Declined = { email: string; contact: string; link: string } | null;

const money = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "160", "£160.50", "1,250" - pence, or null when it is not a figure. */
function toPence(s: string): number | null {
  const t = s.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function InvoiceCheck({ jobId, order, me, onClose, onChanged }: {
  jobId: string;
  /** The job, when the caller already holds it; otherwise it is read here. */
  order?: WorksOrder | null;
  /** The agent's own first name, for the draft to the contractor. */
  me?: string | null;
  onClose: () => void;
  /** Something was sent on or sent back: the caller reads its list again. */
  onChanged?: () => void;
}) {
  const [o, setO] = useState<WorksOrder | null>(order ?? null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("check");
  const [total, setTotal] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [declined, setDeclined] = useState<Declined>(null);
  const [writing, setWriting] = useState(false);
  const [emailed, setEmailed] = useState(false);
  /* What was passed, kept for the last screen: the job no longer has an invoice waiting by then. */
  const [passed, setPassed] = useState<{ theirs: number; share: number; told?: boolean; ref?: string } | null>(null);

  useEffect(() => {
    if (o) return;
    let live = true;
    fetch(`/api/works-orders/${encodeURIComponent(jobId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j?.ok && j.order) setO(j.order as WorksOrder); else setLoadErr(j?.error ?? "The job couldn't be read."); })
      .catch(() => { if (live) setLoadErr("The job couldn't be read."); });
    return () => { live = false; };
  }, [jobId, o]);

  const [myName, setMyName] = useState((me ?? "").trim());
  useEffect(() => {
    if (myName) return;
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (live) setMyName(String(j?.user?.name ?? j?.name ?? "").trim()); }).catch(() => {});
    return () => { live = false; };
  }, [myName]);

  const theirs = o?.invoiceWaitPence ?? passed?.theirs ?? 0;
  useEffect(() => {
    if (o?.invoiceWaitPence != null) setTotal((cur) => cur || (o.invoiceWaitPence! / 100).toFixed(2));
  }, [o?.invoiceWaitPence]);

  const file = useMemo(() => [...(o?.files ?? [])].reverse().find((f) => f.kind === "invoice") ?? null, [o?.files]);
  const fileUrl = file ? `/api/r2/file?key=${encodeURIComponent(file.key)}` : null;
  const isImage = file ? /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name) : false;

  const totalPence = toPence(total);
  const tooLow = totalPence != null && totalPence < theirs;
  const share = totalPence != null && !tooLow ? totalPence - theirs : 0;
  const who = o?.contractorName || "the contractor";
  const Who = o?.contractorName || "The contractor";
  const home = o ? [o.propertyName, o.locality].filter(Boolean).join(", ") : "";

  async function send(body: Record<string, unknown>): Promise<{ ok: boolean; order?: WorksOrder; declined?: Declined }> {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/works-orders/${encodeURIComponent(jobId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(r?.error ?? "That didn't work. Nothing was sent."); return { ok: false }; }
    onChanged?.();
    return { ok: true, order: r.order as WorksOrder, declined: (r.declined ?? null) as Declined };
  }
  async function approve() {
    if (totalPence == null || tooLow) return;
    const r = await send({ action: "invoice_approve", totalPence });
    if (!r.ok) return;
    setPassed({ theirs, share, told: Boolean(r.order?.accountsToldAt) });
    if (r.order) setO(r.order);
    setScreen("sent");
  }
  async function decline() {
    if (!why.trim()) return;
    const r = await send({ action: "invoice_decline", note: why.trim() });
    if (!r.ok) return;
    setPassed({ theirs, share: 0, ref: o?.invoiceWaitRef ?? "" });
    setDeclined(r.declined ?? null);
    if (r.order) setO(r.order);
    setScreen("declined");
  }

  const first = (declined?.contact || "").trim().split(/\s+/)[0] || "";
  const declinedRef = passed?.ref ?? o?.invoiceWaitRef ?? "";
  const draft = o
    ? `Hi${first ? ` ${first}` : ""},\n\nThanks for your invoice${declinedRef ? ` ${declinedRef}` : ""} for ${money(theirs)}, for job #${o.ref} at ${home}. I can't pass it for payment as it stands:\n\n${why.trim()}\n\nPlease send a corrected invoice using the same link as before${declined?.link ? `:\n${declined.link}` : "."}\n\nThanks,\n${myName.split(/\s+/)[0] || ""}`.trimEnd()
    : "";

  const stepNo = screen === "check" ? 1 : screen === "confirm" ? 2 : undefined;
  const question =
    screen === "check" ? "Check the Invoice"
    : screen === "confirm" ? "Confirm the Figures"
    : screen === "why" ? "Why Is It Declined?"
    : undefined;
  const lede =
    screen === "check" ? "Nothing has gone to accounts. Pass it on as it is, or put the total the landlord is charged above it."
    : screen === "confirm" ? "Check the three figures before they go to accounts."
    : screen === "why" ? `${Who} can upload a corrected invoice from the link they already have.`
    : undefined;

  /* The email to the contractor, in the usual Write an Email window. It takes
     the screen while it is open (two windows stacked put it behind this one);
     closing it comes back to the declined screen. */
  if (writing && o && declined?.email) {
    return (
      <Compose
        open
        onClose={() => setWriting(false)}
        onSent={() => { setEmailed(true); setWriting(false); }}
        to={declined.email}
        toName={declined.contact || o.contractorName}
        merge={NO_MERGE}
        subject={`Your invoice for job #${o.ref}, ${o.propertyName}`}
        body={draft}
      />
    );
  }

  return (
    <>
      <FloatSheet
        title={o ? `Job #${o.ref} · ${Who}` : "The Invoice"}
        size="xl"
        step={stepNo}
        steps={stepNo ? 2 : undefined}
        onBack={screen === "confirm" || screen === "why" ? () => { setErr(null); setScreen("check"); } : undefined}
        onClose={onClose}
        dismissible={!busy}
        screenKey={screen}
        question={question}
        lede={lede}
        foot={
          !o ? undefined
          : screen === "check" ? (
            <FloatFoot left={<button type="button" className="nl-btn" onClick={() => { setErr(null); setScreen("why"); }}>Decline the Invoice</button>}>
              <button type="button" className="nl-btn nl-btn--primary" disabled={totalPence == null || tooLow} onClick={() => { setErr(null); setScreen("confirm"); }}>Next</button>
            </FloatFoot>
          ) : screen === "confirm" ? (
            <FloatFoot left={err ? <span className="nl-ic-err" role="alert">{err}</span> : undefined}>
              <button type="button" className="nl-btn nl-btn--primary" disabled={busy} onClick={() => void approve()}>{busy ? "Sending…" : "Approve and Send to Accounts"}</button>
            </FloatFoot>
          ) : screen === "why" ? (
            <FloatFoot left={err ? <span className="nl-ic-err" role="alert">{err}</span> : <span>Nothing is emailed to {who} until you send it yourself.</span>}>
              <button type="button" className="nl-btn nl-btn--primary" disabled={busy || !why.trim()} onClick={() => void decline()}>{busy ? "Saving…" : "Decline the Invoice"}</button>
            </FloatFoot>
          ) : (
            <FloatFoot>
              <button type="button" className={screen === "declined" && declined?.email && !emailed ? "nl-btn" : "nl-btn nl-btn--primary"} onClick={onClose}>Done</button>
            </FloatFoot>
          )
        }
      >
        {!o ? (
          <FloatCard>
            {loadErr
              ? <p className="nl-ic-err" role="alert">{loadErr}</p>
              : <p className="nl-ic-wait"><span className="nl-ic-spin" aria-hidden />Opening the invoice…</p>}
          </FloatCard>
        ) : screen === "sent" ? (
          passed?.told ? (
            <FloatDone title="Sent to Accounts">
              {passed.share > 0
                ? `The landlord is charged ${money(passed.theirs + passed.share)}. ${Who} is paid ${money(passed.theirs)} and you are paid ${money(passed.share)}. Accounts have the invoice and all three figures.`
                : `${Who}'s invoice for ${money(passed.theirs)} has gone to accounts as it is, with the invoice attached.`}
            </FloatDone>
          ) : (
            <FloatCard>
              <FloatCardHead title="Approved, but Accounts Were Not Emailed" />
              <p className="nl-ic-err" role="alert">The invoice is approved and it is on the job and under To Pay, but the email to accounts did not go. Tell accounts yourself, and open the job: its timeline says why.</p>
              <p className="nl-ic-note">
                {passed && passed.share > 0
                  ? `The landlord is charged ${money(passed.theirs + passed.share)}. ${Who} is paid ${money(passed.theirs)} and you are paid ${money(passed.share)}.`
                  : `${Who} is paid ${money(passed?.theirs ?? theirs)}. Nothing was added.`}
              </p>
            </FloatCard>
          )
        ) : screen === "declined" ? (
          <>
            <FloatDone title="Declined">
              {`${Who}'s invoice for ${money(passed?.theirs ?? theirs)} is off the job and accounts were never told. They can upload a corrected one from the same link.`}
            </FloatDone>
            <FloatCard>
              <FloatCardHead title={`Tell ${Who}`} />
              {emailed ? (
                <p className="nl-ic-note">Your email to {who} has gone.</p>
              ) : declined?.email ? (
                <>
                  <p className="nl-ic-note">Nothing has been sent to them. An email is written for you with the reason and their link: read it, change it, and send it yourself.</p>
                  <p className="nl-ic-act"><button type="button" className="nl-btn nl-btn--primary" onClick={() => setWriting(true)}>Write to {who}</button></p>
                </>
              ) : (
                <p className="nl-ic-note">There is no email address for {who} on the OS, so ring them with the reason. Nothing has been sent to them.</p>
              )}
            </FloatCard>
          </>
        ) : (
          <div className="nl-ic">
            {/* ── the invoice itself ─────────────────────────────────────── */}
            <div className="nl-ic-doc">
              {fileUrl ? (
                isImage
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={fileUrl} alt={`${Who}'s invoice`} />
                  : <iframe title={`${Who}'s invoice`} src={`${fileUrl}#toolbar=0&view=FitH`} />
              ) : (
                <p className="nl-ic-nodoc">There is no invoice file on the job, only the figure {who} typed.</p>
              )}
            </div>

            {/* ── the figures ───────────────────────────────────────────── */}
            <div className="nl-ic-side">
              {screen === "check" && (
                <>
                  <FloatCard>
                    <FloatCardHead title="Their Invoice" aside={o.invoiceWaitRef ? `No. ${o.invoiceWaitRef}` : undefined} />
                    <p className="nl-ic-big">{money(theirs)}</p>
                    <p className="nl-ic-note">{Who} · {o.title}<br />{home}{o.invoiceWaitAt ? ` · uploaded ${stamp(o.invoiceWaitAt)}` : ""}</p>
                    {fileUrl && <p className="nl-ic-note"><a href={`${fileUrl}&save=1`} className="nl-link" data-leave="1">Download the invoice</a></p>}
                  </FloatCard>
                  <FloatCard>
                    <FloatCardHead title="Total the Landlord Is Charged" />
                    <label className="nl-ic-amount">
                      <span aria-hidden>£</span>
                      <input
                        inputMode="decimal"
                        value={total}
                        onChange={(e) => setTotal(e.target.value.replace(/[^\d.,]/g, ""))}
                        onBlur={() => { const p = toPence(total); if (p != null) setTotal((p / 100).toFixed(2)); }}
                        autoFocus
                        aria-label="Total the landlord is charged, in pounds"
                        aria-invalid={totalPence == null || tooLow}
                      />
                    </label>
                    {totalPence == null
                      ? <p className="nl-ic-err">Type the total in pounds and pence, like 160.00.</p>
                      : tooLow
                        ? <p className="nl-ic-err">It can&apos;t be less than {who}&apos;s {money(theirs)}. If their figure is wrong, decline the invoice.</p>
                        : <p className="nl-ic-note">Leave it at {money(theirs)} to pass the invoice on as it is. Anything above it is yours for arranging the work.</p>}
                    <dl className="nl-ic-split" aria-live="polite">
                      <div><dt>{Who} is paid</dt><dd>{money(theirs)}</dd></div>
                      <div className={share > 0 ? "is-you" : ""}><dt>You are paid</dt><dd>{money(share)}</dd></div>
                    </dl>
                  </FloatCard>
                </>
              )}
              {screen === "confirm" && (
                <FloatCard>
                  <FloatCardHead title={share > 0 ? "What Goes to Accounts" : "Passed On as It Is"} />
                  <dl className="nl-ic-split is-final">
                    <div><dt>The landlord is charged</dt><dd>{money(theirs + share)}</dd></div>
                    <div><dt>{Who} is paid</dt><dd>{money(theirs)}</dd></div>
                    <div className={share > 0 ? "is-you" : ""}><dt>You are paid</dt><dd>{money(share)}</dd></div>
                  </dl>
                  <p className="nl-ic-note">
                    {share > 0
                      ? `${Who} only ever sees their own ${money(theirs)}. Where the landlord is asked to authorise the invoice, they see ${money(theirs + share)}.`
                      : "Nothing is added. Go back to change the total."}
                  </p>
                </FloatCard>
              )}
              {screen === "why" && (
                <FloatCard>
                  <FloatCardHead title="The Reason" />
                  <p className="nl-ic-note nl-ic-what">{money(theirs)} from {who}{o.invoiceWaitRef ? `, invoice ${o.invoiceWaitRef}` : ""}</p>
                  <textarea className="nl-fs-input" rows={5} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: the quote was £120 and nothing extra was agreed." aria-label="Why the invoice is declined" autoFocus />
                  <p className="nl-ic-note">It is kept on the job, and it goes into the email written for you to send to {who}.</p>
                </FloatCard>
              )}
            </div>
          </div>
        )}
      </FloatSheet>
    </>
  );
}
