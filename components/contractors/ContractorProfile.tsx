"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contractor, Status, WorksOrder } from "@/lib/works-orders";
import { OPEN, STATUS_LABEL, pounds } from "@/components/maintenance/works-ui";
import { hhmm } from "@/lib/london-clock";
import { useSlideOver } from "@/lib/use-slide-over";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import ContractorMark from "@/components/contractors/ContractorMark";
import { LogInvoice } from "@/components/contractors/InvoiceForm";
import { coverWords, credentialsOf, jobHref, liabilityOf, longDay, siteHref, siteLabel } from "@/components/contractors/credentials";

/* Kept here too, so Maintenance's Log work already done still finds it. */
export { LogInvoice } from "@/components/contractors/InvoiceForm";

type Stats = { jobs: number; open: number; quotedPence: number; invoicedPence: number; paidPence: number; outstandingPence: number; lastJobAt: string | null };
type Profile = { contractor: Contractor; stats: Stats; jobs: WorksOrder[]; everyone?: boolean };

/**
 * One contractor, pulled out: who they are, what they have done for us, what
 * is owed - and, since 19 Oct 2026, a way to log an invoice they emailed in
 * for work that never had a job on the OS (Rhiannon: contractors "don't do
 * technology", so the invoice arrives by email and somebody has to put it on).
 *
 * Made a proper record (James, 21 Oct 2026: "If I click a contractor it's a
 * completely blank page"): the firm's logo and name with the things you do
 * to them across the top, the figures under it, their jobs down the left and
 * their credentials, how to reach them and who is booked in down the right.
 *
 * The jobs are this person's own unless they are the office (lib/contractor-
 * scope), and the figures are counted over the jobs shown.
 */

const box = "rounded-2xl border border-line/70 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const action = "inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-white px-3.5 py-2 text-[12.5px] transition-colors hover:border-ink/50 disabled:opacity-50";

const STATUS_TONE: Record<Status, "neutral" | "accent" | "good" | "warn"> = {
  reported: "warn", approval: "warn", approved: "neutral", scheduled: "accent", done: "good", invoiced: "warn", paid: "good", cancelled: "neutral",
};

/** A job's own day: booked for, done, invoiced, paid - whichever it is at. */
function whenOf(o: WorksOrder): string {
  const at = o.status === "scheduled" ? o.scheduledAt : o.status === "paid" ? o.paidAt : o.status === "invoiced" ? o.invoicedAt : o.status === "done" ? o.completedAt : o.reportedAt;
  if (!at) return "";
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const said = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Europe/London" });
  const verb = o.status === "scheduled" ? "booked" : o.status === "paid" ? "paid" : o.status === "invoiced" ? "invoiced" : o.status === "done" ? "done" : "reported";
  return `${verb} ${said}${o.status === "scheduled" && o.scheduledAt ? ` · ${hhmm(o.scheduledAt)}` : ""}`;
}

export default function ContractorProfile({ id, ownerName, onClose, onEdit, onChanged, canEdit }: {
  id: string;
  /** Whose book they are in, by name, when it is somebody else's (the office's view). */
  ownerName?: string | null;
  onClose: () => void;
  onEdit: (c: Contractor) => void;
  onChanged?: () => void;
  canEdit: (c: Contractor) => boolean;
}) {
  const { shown, close } = useSlideOver(true, onClose, id);
  const [d, setD] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [logo, setLogo] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/contractors?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.ok) { setD(j); setErr(null); } else setErr(j.error ?? "Could not read them."); })
      .catch(() => live && setErr("Could not read them."));
    return () => { live = false; };
  }, [id, nonce]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const refreshLogo = useCallback(async () => {
    if (!d) return;
    setLogo({ busy: true, note: null });
    const r = await fetch("/api/contractors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: d.contractor.id, action: "refresh_logo" }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setD({ ...d, contractor: { ...d.contractor, logoUrl: r.contractor?.logoUrl ?? "" } });
      setLogo({ busy: false, note: "Logo read off their website." });
      onChanged?.();
    } else setLogo({ busy: false, note: r?.error ?? "Their website couldn't be read just now." });
  }, [d, onChanged]);

  const c = d?.contractor;
  const whose = c ? (c.ownerId ? (ownerName ? `${ownerName}'s contractor` : "Your contractor") : "Company contractor") : "Contractor";
  const jobs = useMemo(() => [...(d?.jobs ?? [])].sort((a, b) => (b.reportedAt ?? b.createdAt).localeCompare(a.reportedAt ?? a.createdAt)), [d]);
  const openJobs = jobs.filter((o) => OPEN.includes(o.status));
  const doneJobs = jobs.filter((o) => !OPEN.includes(o.status));
  const upcoming = jobs.filter((o) => o.status === "scheduled" && o.scheduledAt && Date.parse(o.scheduledAt) >= Date.now() - 12 * 3600_000).sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1));
  const creds = c ? credentialsOf(c) : [];
  const pl = c ? liabilityOf(c) : null;
  const site = c ? siteHref(c.website) : null;
  const DONE_SHOWN = 8;

  return (
    <div className="so-root fixed inset-0 z-[130]" data-shown={shown}>
      <button aria-label="Close" onClick={close} data-shown={shown} className="so-scrim absolute inset-0 cursor-default bg-ink/35" />
      <aside data-shown={shown} className="so-panel absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] lg:w-[calc(100%-17rem)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5 sm:px-6">
          <p className={eyebrow}>{whose}{c && !c.active ? " · not active" : ""}</p>
          <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-muted hover:text-ink">
            <DoodleIcon name="cross" size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {!d && !err && (
            <p className="flex items-center justify-center gap-2 py-24 text-[12.5px] text-muted">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading their record…
            </p>
          )}
          {err && !d && (
            <div className={`${box} p-5 text-[13px]`}>
              {err} <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-2 underline">Try again</button>
            </div>
          )}

          {c && d && (
            <div className="space-y-5">
              {/* ── who they are, and what you do to them ───────────────── */}
              <section className={`${box} p-4 sm:p-6`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <ContractorMark name={c.name} logoUrl={c.logoUrl} size={76} />
                  <div className="min-w-0 flex-1">
                    <h1 className="hand text-[26px] leading-[1.1] sm:text-[30px]">{c.name}</h1>
                    <p className="mt-1 text-[13px] text-muted">{[c.trade, c.contact ? `ask for ${c.contact}` : ""].filter(Boolean).join(" · ")}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Pill tone={c.active ? "good" : "neutral"}>{c.active ? "Active - offered on jobs" : "Not active"}</Pill>
                      {creds.map((x) => <Pill key={x.key} tone="neutral">{x.label} {x.value}</Pill>)}
                      {pl && <Pill tone={pl.tone}>{pl.pill}</Pill>}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setLogging((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">
                    <DoodleIcon name="coin" size={13} />Log an invoice
                  </button>
                  {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className={action}><DoodleIcon name="call" size={13} />Call</a>}
                  {c.email && <a href={`mailto:${c.email}`} className={action}><DoodleIcon name="mail" size={13} />Email</a>}
                  {site && <a href={site} target="_blank" rel="noopener noreferrer" className={action}><DoodleIcon name="link" size={13} />Website</a>}
                  {canEdit(c) && <button type="button" onClick={() => onEdit(c)} className={action}><DoodleIcon name="pencil" size={13} />Edit</button>}
                  {site && (
                    <button type="button" disabled={logo.busy} onClick={() => void refreshLogo()} className={action}>
                      {logo.busy ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" /> : <DoodleIcon name="camera" size={13} />}
                      {logo.busy ? "Reading their website…" : c.logoUrl ? "Refresh logo" : "Find their logo"}
                    </button>
                  )}
                </div>
                {logo.note && <p className="mt-2 text-[11.5px] text-muted">{logo.note}</p>}
              </section>

              {/* ── the figures, off the jobs shown ─────────────────────── */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure icon="setting" label="Jobs" value={String(d.stats.jobs)} sub={d.stats.open ? `${d.stats.open} open` : "none open"} />
                <Figure icon="file-contract" label="Quoted" value={pounds(d.stats.quotedPence)} sub="the quotes logged" />
                <Figure icon="coin" label="Invoiced" value={pounds(d.stats.invoicedPence)} sub={`${pounds(d.stats.paidPence)} paid`} />
                <Figure icon="wallet" label="Owed to them" value={pounds(d.stats.outstandingPence)} sub={d.stats.outstandingPence ? "invoices waiting" : "nothing waiting"} hot={d.stats.outstandingPence > 0} />
              </div>

              {logging && (
                <LogInvoice
                  contractor={c}
                  onClose={() => setLogging(false)}
                  onSaved={() => { setLogging(false); setNonce((n) => n + 1); onChanged?.(); }}
                />
              )}

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                {/* ── their jobs ───────────────────────────────────────── */}
                <section className={`${box} min-w-0 p-4 sm:p-5`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[16px]">Their Jobs</h2>
                    <span className="text-[11.5px] text-muted">{jobs.length ? `${openJobs.length} open · ${doneJobs.length} finished` : ""}</span>
                  </div>
                  {d.everyone === false && <p className="mt-1 text-[11.5px] text-muted">Your own jobs with them: on the homes in your book, or ones you raised.</p>}
                  {jobs.length === 0 ? (
                    <div className="mt-4 flex flex-col items-center rounded-xl bg-box px-4 py-10 text-center">
                      <DoodleIcon name="setting" size={22} className="text-muted" />
                      <p className="mt-2 text-[13px]">No jobs with them yet</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">Put them on a job and it shows here, or log an invoice they sent in.</p>
                    </div>
                  ) : (
                    <>
                      {openJobs.length > 0 && <JobList title="Open" rows={openJobs} />}
                      {doneJobs.length > 0 && <JobList title="Finished" rows={showAll ? doneJobs : doneJobs.slice(0, DONE_SHOWN)} />}
                      {doneJobs.length > DONE_SHOWN && (
                        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[12px] text-muted underline hover:text-ink">
                          {showAll ? "Show fewer" : `Show all ${doneJobs.length} finished`}
                        </button>
                      )}
                    </>
                  )}
                </section>

                {/* ── down the right ───────────────────────────────────── */}
                <div className="min-w-0 space-y-5">
                  <section className={`${box} p-4 sm:p-5`}>
                    <h2 className="text-[16px]">Credentials</h2>
                    <div className="mt-3 space-y-3 text-[12.5px]">
                      {creds.length === 0 ? (
                        <p className="text-muted">No registration numbers on file.{canEdit(c) ? " Add them with Edit." : ""}</p>
                      ) : creds.map((x) => (
                        <div key={x.key} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={eyebrow}>{x.label}</p>
                            <p className="figures mt-0.5 break-words text-[13px]">{x.value}</p>
                          </div>
                          {x.register && <a href={x.register.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11.5px] text-muted underline hover:text-ink">Check on {x.register.name}</a>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-line/60 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={eyebrow}>Public liability</p>
                        {pl && pl.state !== "none" && <Pill tone={pl.tone}>{pl.state === "expired" ? "Expired" : pl.state === "soon" ? "Expires soon" : pl.state === "ok" ? "In date" : "No expiry given"}</Pill>}
                      </div>
                      {pl?.state === "none" ? (
                        <p className="mt-1.5 text-[12.5px] text-muted">No insurance on file.{canEdit(c) ? " Add it with Edit." : ""}</p>
                      ) : (
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
                          <Line k="Insurer" v={c.publicLiabilityInsurer || "Not given"} />
                          <Line k="Policy number" v={c.publicLiabilityNumber || "Not given"} />
                          <Line k="Cover" v={coverWords(c.publicLiabilityCoverPence) || "Not given"} />
                          <Line k="Expires" v={c.publicLiabilityExpiry ? longDay(c.publicLiabilityExpiry) : "Not given"} hot={pl?.state === "expired" || pl?.state === "soon"} />
                        </dl>
                      )}
                    </div>
                  </section>

                  <section className={`${box} p-4 sm:p-5`}>
                    <h2 className="text-[16px]">How to Reach Them</h2>
                    <div className="mt-3 space-y-2.5 text-[12.5px]">
                      <Reach icon="user" k="Ask for" v={c.contact} />
                      <Reach icon="call" k="Phone" v={c.phone} href={c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : undefined} />
                      <Reach icon="mail" k="Email" v={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
                      <Reach icon="link" k="Website" v={siteLabel(c.website)} href={site ?? undefined} external />
                      <Reach icon="home" k="Address" v={c.address} />
                    </div>
                    {c.notes && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-box px-3 py-2.5 text-[12.5px] leading-relaxed">{c.notes}</p>}
                    {c.createdBy && <p className="mt-3 text-[11px] text-muted">Added by {c.createdBy}.</p>}
                  </section>

                  <section className={`${box} p-4 sm:p-5`}>
                    <h2 className="text-[16px]">Booked In</h2>
                    {upcoming.length === 0 ? (
                      <p className="mt-2 text-[12.5px] text-muted">Nothing booked with them.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-line/50">
                        {upcoming.map((o) => (
                          <li key={o.id}>
                            <a href={jobHref(o.id)} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                              <DateChip iso={o.scheduledAt!} />
                              <span className="min-w-0">
                                <span className="block truncate text-[13px]">{o.propertyName}</span>
                                <span className="block truncate text-[10.5px] text-muted">#{o.ref} · {o.title} · {hhmm(o.scheduledAt!)}</span>
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Figure({ icon, label, value, sub, hot = false }: { icon: string; label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className={`${box} flex min-w-0 items-start gap-3 p-3.5 sm:p-4`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={14} /></span>
      <span className="min-w-0">
        <span className={`block ${eyebrow}`}>{label}</span>
        <span className={`figures block truncate text-[19px] font-semibold leading-tight ${hot ? "text-accent-dark" : ""}`}>{value}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </div>
  );
}

function JobList({ title, rows }: { title: string; rows: WorksOrder[] }) {
  return (
    <div className="mt-4">
      <p className={eyebrow}>{title}</p>
      <ul className="mt-1.5 divide-y divide-line/50">
        {rows.map((o) => {
          const amount = o.invoicePence != null ? pounds(o.invoicePence) : o.quotePence != null ? `${pounds(o.quotePence)} quoted` : "";
          return (
            <li key={o.id}>
              <a href={jobHref(o.id)} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] group-hover:underline">{o.propertyName || "A home"}</span>
                  <span className="block truncate text-[11px] text-muted">#{o.ref} · {o.title}</span>
                </span>
                <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <Pill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Pill>
                  <span className="whitespace-nowrap text-[11px] text-muted">{whenOf(o)}</span>
                </span>
                <span className={`figures col-span-2 text-[13px] sm:col-span-1 sm:min-w-[84px] sm:text-right ${amount ? "" : "hidden sm:block"}`}>{amount}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Line({ k, v, hot = false }: { k: string; v: string; hot?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className={`mt-0.5 break-words ${hot ? "font-semibold text-accent-dark" : ""}`}>{v}</dd>
    </div>
  );
}

function Reach({ icon, k, v, href, external = false }: { icon: string; k: string; v: string; href?: string; external?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={12} /></span>
      <span className="min-w-0">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</span>
        <span className="block break-words text-[13px]">
          {!v ? <span className="text-muted">Not given</span> : href ? <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="hover:underline">{v}</a> : v}
        </span>
      </span>
    </div>
  );
}

export function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  const dd = d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" });
  const mm = d.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" });
  return (
    <span className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-line/70 bg-box py-1 leading-none">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted">{wd}</span>
      <span className="figures mt-0.5 text-[17px] font-semibold">{dd}</span>
      <span className="text-[9.5px] text-muted">{mm}</span>
    </span>
  );
}
