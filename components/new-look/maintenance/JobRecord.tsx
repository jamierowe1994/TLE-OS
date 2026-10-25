"use client";

import { useState } from "react";
import Link from "next/link";
import EmailPerson from "@/components/EmailPerson";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import { Ico, Tabs } from "@/components/new-look/Parts";
import { openDocument } from "@/lib/doc-sheet";
import type { Contractor, WorksOrder } from "@/lib/works-orders";
import { PAID_HOW, day, pounds, stamp } from "@/components/maintenance/works-ui";
import { TABS, engineerFacts, jobFiles, tel, type TabId } from "@/components/maintenance/job-page";
import type { JobView } from "@/components/new-look/maintenance/JobPageNew";

/**
 * The new-look job page's actions down the right and its record below the
 * stepper (components/new-look/maintenance/JobPageNew). Drawing only: every
 * press is one of the page's own handlers.
 */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`nl-jb-chev${open ? " is-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ── the actions ──────────────────────────────────────────────────────── */

/** Each group its own card; its actions as hairline rows with an arrow. The group holding the next step opens by itself. */
export function JobGroups({ v }: { v: JobView }) {
  return (
    <>
      {v.groups.map((g) => {
        const on = v.isOpen(g.id);
        const hasNext = g.id === v.nextGroup;
        return (
          <section key={g.id} className={`nl-jb-group${hasNext ? " has-next" : ""}`}>
            <button type="button" className="nl-jb-group-head" aria-expanded={on} onClick={() => v.toggleGroup(g.id)}>
              <span className="nl-jb-group-t">
                <b>{g.title}</b>
                <small>{g.blurb}</small>
              </span>
              {hasNext && !on && <span className="nl-jb-next-word">Next</span>}
              <Chevron open={on} />
            </button>
            {on && (
              <ul className="nl-jb-acts">
                {g.items.map((t) => {
                  const isNext = t.key === v.nextTile;
                  return (
                    <li key={t.key}>
                      <button type="button" disabled={!!t.off} onClick={t.run} title={t.off ?? t.what} className={`nl-jb-act${isNext ? " is-next" : ""}`}>
                        <span className="nl-jb-act-t">
                          <b>{t.label}</b>
                          <small>{isNext ? `Next · ${t.off ?? t.what}` : t.off ?? t.what}</small>
                        </span>
                        {t.done && !isNext ? (
                          <span className="nl-jb-act-done" title="Done"><Ico name="check" size={15} /><span className="sr-only">Done</span></span>
                        ) : (
                          <span className="nl-jb-act-go"><Ico name="arrow" size={15} /></span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

/* ── the record: updates, details, people, files ───────────────────────── */

export function JobRecord({ v }: { v: JobView }) {
  const { o, events, busy } = v;
  return (
    <section className="nl-jb-sec nl-jb-record" aria-label="The job's record">
      <div className="nl-jb-tabrow">
        <Tabs<TabId>
          label="The job's record"
          value={v.tab}
          onChange={v.setTab}
          items={TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === "files" ? o.files.length || null : t.id === "updates" ? events.length || null : null }))}
        />
        <span className="nl-jb-tabacts">
          {v.tab === "updates" && <button type="button" className="nl-link" onClick={() => v.openPop({ kind: "form", form: "note" })}><Ico name="plus" size={13} /> Add a note</button>}
          {v.tab === "details" && <button type="button" className="nl-link" onClick={() => v.openPop({ kind: "form", form: "edit" })}><Ico name="pen" size={13} /> Edit</button>}
          {v.tab === "files" && o.status !== "cancelled" && <button type="button" className="nl-link" onClick={() => v.openPop({ kind: "cert" })}>Add a certificate</button>}
          {v.tab === "files" && <button type="button" className="nl-link" disabled={busy} onClick={() => v.fileRef.current?.click()}><Ico name="upload" size={13} /> {busy ? "Uploading…" : "Add a file or photo"}</button>}
        </span>
      </div>

      <div className="nl-pane" key={v.tab}>
        {v.tab === "updates" && (
          events.length === 0 ? (
            <p className="nl-jb-calm">Nothing on the timeline yet.</p>
          ) : (
            <ol className="nl-jb-tl">
              {events.map((e) => (
                <li key={e.id}>
                  <p>{e.text}</p>
                  <span>{stamp(e.at)} · {e.by}</span>
                </li>
              ))}
            </ol>
          )
        )}
        {v.tab === "details" && <Details o={o} />}
        {v.tab === "people" && <People v={v} />}
        {v.tab === "files" && <Files o={o} onPhoto={(photos, start) => v.setLightbox({ photos, start })} />}
      </div>
    </section>
  );
}

function Details({ o }: { o: WorksOrder }) {
  const figures: { k: string; v: string; quiet?: boolean; hot?: boolean }[] = [
    { k: "Landlord's Authority", v: pounds(o.authorityPence) },
    { k: "Quote", v: o.quotePence != null ? pounds(o.quotePence) : "None yet", quiet: o.quotePence == null },
    {
      k: "Approved",
      v: o.approvedAt ? `${o.approvedBy || "Yes"} · ${day(o.approvedAt)}` : o.status === "approval" ? "Waiting on the landlord" : o.quotePence == null || o.quotePence <= o.authorityPence ? "Within authority" : "Not yet",
      quiet: !o.approvedAt,
      hot: o.status === "approval",
    },
    ...(o.payee ? [{ k: "Paying", v: o.payee === "agent" ? `${o.raisedBy || "The agent"} (paid it themselves)` : o.contractorName || "The contractor" }] : []),
    { k: "Invoice", v: o.invoicePence != null ? `${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}` : "None yet", quiet: o.invoicePence == null },
    /* Invoice in, on the payment run, paid - for everyone to see (James, 21 Oct 2026), as words. */
    ...(o.invoicePence != null ? [{ k: "Payment Run", v: o.payrunAt ? `On it since ${day(o.payrunAt)}` : o.status === "paid" ? "Paid without it" : "Not on it yet", quiet: !o.payrunAt }] : []),
    ...(o.accountsToldAt ? [{ k: "Accounts Told", v: day(o.accountsToldAt) }] : []),
    ...(o.landlordInvoiceAnswer ? [{ k: "Landlord Says", v: o.landlordInvoiceAnswer === "pay" ? "From the rent" : o.landlordInvoiceAnswer === "direct" ? "Paying direct" : "A query", hot: o.landlordInvoiceAnswer === "query" }] : []),
    ...(o.paidAt ? [{ k: "Paid", v: `${day(o.paidAt)} · ${PAID_HOW.find((h) => h.id === o.paidHow)?.label ?? ""}` }] : []),
  ];
  return (
    <div className="nl-jb-details">
      <p className={`nl-jb-desc${o.description ? "" : " is-quiet"}`}>{o.description || "No detail recorded."}</p>
      <dl className="nl-jb-dl">
        <div><dt>Reported</dt><dd>{`${o.reportedAt ? day(o.reportedAt) : "Not recorded"}${o.reportedBy ? ` by ${o.reportedBy.toLowerCase()}` : ""}`}</dd></div>
        {o.raisedBy && <div><dt>Raised By</dt><dd>{o.raisedBy}</dd></div>}
        <div><dt>Access</dt><dd className={o.access ? "" : "is-quiet"}>{o.access || "No access notes"}</dd></div>
        {o.completedAt && <div><dt>Done</dt><dd>{`${stamp(o.completedAt)}${o.completionNote ? ` · ${o.completionNote}` : ""}`}</dd></div>}
      </dl>
      <h3 className="nl-jb-h3">Money</h3>
      <dl className="nl-jb-money">
        {figures.map((f) => (
          <div key={f.k}>
            <dt>{f.k}</dt>
            <dd className={f.hot ? "is-hot" : f.quiet ? "is-quiet" : ""}>{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── people ───────────────────────────────────────────────────────────── */

/** A number to press and an email that opens the OS's own email window. */
export function Reach({ phone, email, name, role, address, buttons = false }: { phone: string; email: string; name?: string; role?: "landlord" | "tenant"; address?: string; buttons?: boolean }) {
  const cls = buttons ? "nl-btn nl-btn--sm nl-btn--secondary nl-jb-reach-btn" : "nl-jb-reach-line";
  return (
    <div className={buttons ? "nl-jb-reach is-buttons" : "nl-jb-reach"}>
      {phone ? <a href={`tel:${tel(phone)}`} className={cls}><Ico name="phone" size={14} /><span className="truncate">{phone}</span></a> : <span className="nl-jb-reach-none">No number on file</span>}
      {email ? (
        <EmailPerson email={email} name={name} role={role} address={address} className={cls}><Ico name="mail" size={14} /><span className="truncate">{email}</span></EmailPerson>
      ) : (
        <span className="nl-jb-reach-none">No email on file</span>
      )}
    </div>
  );
}

function Person({ title, action, children, wide = false }: { title: string; action?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`nl-jb-person${wide ? " is-wide" : ""}`}>
      <div className="nl-jb-person-h">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function People({ v }: { v: JobView }) {
  const { o, tenants } = v;
  return (
    <div className="nl-jb-people">
      <Engineer v={v} c={v.contractor} />

      <Person title={tenants.length > 1 ? `Tenants (${tenants.length})` : "Tenant"}>
        {tenants.length === 0 ? (
          <p className="nl-jb-quiet-line">None on the job.</p>
        ) : (
          tenants.map((t, i) => (
            <div key={`${t.name}-${i}`} className={i ? "nl-jb-person-more" : ""}>
              <p className="nl-jb-name">{t.name || "Unnamed"}{t.room ? <span className="nl-jb-quiet-inline"> · {t.room}</span> : null}</p>
              <Reach phone={t.phone} email={t.email} name={t.name} role="tenant" address={o.propertyName} />
            </div>
          ))
        )}
        {o.access && <p className="nl-jb-note"><span>Access</span>{o.access}</p>}
        {o.quietTenants && <p className="nl-jb-quiet-line">A discreet job: no automatic email goes to the tenants.</p>}
        {o.tenantHappy && <p className={`nl-jb-state${o.tenantHappy === "yes" ? " is-good" : " is-hot"}`}>{o.tenantHappy === "yes" ? "Happy" : "Not happy"}{o.tenantHappyAt ? ` · ${day(o.tenantHappyAt)}` : ""}</p>}
      </Person>

      <Person title="Landlord" wide>
        <p className="nl-jb-name">{o.landlord || "No landlord named"}</p>
        {o.landlordSkipped ? (
          <p className="nl-jb-quiet-line">Not involved in this one.</p>
        ) : o.landlordMobile || o.landlordEmail ? (
          <Reach phone={o.landlordMobile} email={o.landlordEmail} name={o.landlord} role="landlord" address={o.propertyName} />
        ) : (
          <p className="nl-jb-state is-hot">No mobile or email yet.</p>
        )}
        {!o.landlordSkipped && (
          <p className="nl-jb-state">
            <span className={o.landlordToldAt ? "" : "is-hot"}>{o.landlordToldAt ? `Told ${day(o.landlordToldAt)}` : "Not told yet"}</span>
            {o.arranging === "landlord" && <span> · Organising it{o.landlordFollowUpAt ? `, follow up ${day(o.landlordFollowUpAt)}` : ""}</span>}
            {o.arranging === "us" && <span> · We&apos;re arranging it</span>}
          </p>
        )}
        {o.landlordEmail.includes("@") && (
          <div className="nl-jb-old nl-jb-person-more">
            <LandlordJobEmails key={o.landlordEmail} job={o.id} name={o.landlord} order={o} compact />
          </div>
        )}
      </Person>
    </div>
  );
}

/** The engineer going out: their firm, how to reach them, what they're registered for, and their record. */
function Engineer({ v, c }: { v: JobView; c: Contractor | null }) {
  const { o, busy, unsent } = v;
  const [copied, setCopied] = useState(false);
  const { regs, insured, quoting, link, out } = engineerFacts(o, c);
  const reading = v.trades === null;
  const onResend = v.canResend ? v.resendOrder : undefined;
  return (
    <Person
      title="The Engineer"
      action={
        v.open || onResend ? (
          <span className="nl-jb-person-acts">
            {onResend && !unsent && <button type="button" disabled={busy} onClick={onResend} className="nl-link" title={`Emails ${o.contractorName} the works order again, with their page link`}>Send again</button>}
            {v.open && <button type="button" onClick={v.pickContractor} className="nl-link">{quoting ? "Ask another" : o.contractorId ? "Change" : "Pick"}</button>}
          </span>
        ) : null
      }
    >
      {!o.contractorId && !o.contractorName ? (
        <p className="nl-jb-quiet-line">{quoting && out.length ? `Out for quotes with ${out.length} contractors: ${out.map((a) => a.contractorName).join(", ")}. Whoever's quote is taken goes on the job.` : "Nobody on the job yet."}</p>
      ) : (
        <>
          <div className="nl-jb-eng">
            {c?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.logoUrl} alt="" className="nl-jb-eng-logo" />
            )}
            <div className="min-w-0">
              {o.contractorId ? (
                <Link href={`/contractors?open=${encodeURIComponent(o.contractorId)}`} className="nl-jb-name nl-jb-name-link" title="Their record under Contractors">{o.contractorName || c?.name || "The contractor"}</Link>
              ) : (
                <p className="nl-jb-name">{o.contractorName}</p>
              )}
              <p className="nl-jb-quiet-line">{[c?.trade, c?.contact].filter(Boolean).join(" · ") || (reading ? "Reading their details…" : "")}</p>
            </div>
          </div>
          {c ? <Reach phone={c.phone} email={c.email} name={c.contact || c.name} address={o.propertyName} /> : !reading && o.contractorId ? <p className="nl-jb-quiet-line">Their details are in another agent&apos;s book.</p> : null}
          {unsent && onResend && (
            <div className="nl-jb-warn">
              <p>{o.contractorName} hasn&apos;t been sent the works order. It went to {o.orderSentToName || "the last contractor"}.</p>
              <button type="button" disabled={busy} onClick={onResend} className="nl-btn nl-btn--sm nl-btn--primary">{busy ? "Sending…" : `Send it to ${o.contractorName}`}</button>
            </div>
          )}
          {(regs.length > 0 || insured) && (
            <dl className="nl-jb-dl is-tight">
              {regs.length > 0 && <div><dt>Registered</dt><dd>{regs.join(" · ")}</dd></div>}
              {insured && <div><dt>Public Liability</dt><dd>{insured}</dd></div>}
            </dl>
          )}
          <p className="nl-jb-state">
            <span className={o.contractorConfirmedAt ? "is-good" : "is-hot"}>{o.contractorConfirmedAt ? `Confirmed ${day(o.contractorConfirmedAt)}` : o.contractorContactedAt ? `Contacted ${day(o.contractorContactedAt)}` : quoting ? "Asked for a quote" : "Not contacted"}</span>
            {o.scheduledAt && <span> · Booked {stamp(o.scheduledAt)}</span>}
          </p>
          {link && (
            <button type="button" className="nl-link nl-jb-person-more" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "Copied" : "Copy their job page link"}
            </button>
          )}
        </>
      )}
    </Person>
  );
}

/* ── files ────────────────────────────────────────────────────────────── */

function Files({ o, onPhoto }: { o: WorksOrder; onPhoto: (photos: string[], start: number) => void }) {
  if (o.files.length === 0) {
    return <p className="nl-jb-calm">Nothing on the job yet. Photos of the fault, quotes, invoices and certificates go here, and on the home&apos;s Documents too.</p>;
  }
  const { url, photos, docs, urls } = jobFiles(o);
  return (
    <div className="nl-jb-files">
      {photos.length > 0 && (
        <div className="nl-jb-photos">
          {photos.map((p, i) => (
            <button key={p.key} type="button" onClick={() => onPhoto(urls, i)} title={`${p.name} · ${p.by} · ${day(p.at)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={p.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <ul className="nl-jb-docs">
          {docs.map((fl) => (
            <li key={fl.key}>
              <button type="button" onClick={() => openDocument({ key: fl.key, name: fl.name, label: `Job #${o.ref}`, property: o.propertyName, url: url(fl.key) })}>
                <span className="truncate">{fl.name}</span>
                {fl.kind && <span className="nl-jb-doc-kind">{fl.kind === "invoice" ? "Invoice" : "Quote"}</span>}
              </button>
              <span className="nl-jb-doc-by">{fl.by} · {day(fl.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
