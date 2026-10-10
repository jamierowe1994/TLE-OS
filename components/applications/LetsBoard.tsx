"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PickOne from "@/components/PickOne";
import BoardLoading from "@/components/business/BoardLoading";
import { useSlideOver } from "@/lib/use-slide-over";
import { PORTAL_STAGES, PORTAL_STAGE_BY_KEY, propolyDealUrl } from "@/lib/business/propoly-stages";
import type { PreTenancyDeal } from "@/app/api/pretenancy/deals/route";

/**
 * An agent's own lets, as a board (James, 10 Oct 2026).
 *
 * "When they click applications ... we should have their own version of their
 * own board. They'll only be able to see the properties on their board, but
 * then they'll be able to click into each individual one and see where each
 * one's at, what stage. Exactly the same style as Kirstie's side of it."
 *
 * Same columns, same cards and the same stage reading as Kirstie's board
 * (app/(os)/pre-tenancy), from the same route asked with ?mine=1, which gives
 * an agent only the deals they are the property manager on (the office, asking
 * for the whole business, sees every one). A card opens the let here, in its
 * own panel - never Kirstie's board, which is her working space. Read only:
 * moving a stage or ticking the checklist stays hers.
 */

type Deal = PreTenancyDeal;

const GREEN_PILL = "bg-[#f1f4ec] text-[#56634a]";
const RED_PILL = "bg-[#fdefec] text-[#9d4340]";
const AMBER_PILL = "bg-amber-50 text-amber-700";
const QUIET_PILL = "bg-page text-muted";

/** The same soft tint per column as Kirstie's board. */
const COLUMN_TINT: Record<string, string> = {
  deal_started: "bg-[#fdefec]/70",
  holding_fee: "bg-amber-50/70",
  referencing: "bg-orange-50/70",
  plc: "bg-[#f1f4ec]",
  deposit: "bg-sky-50/70",
  tenancy_agreement: "bg-[#f1f4ec]",
  rent_payment: "bg-[#f1f4ec]",
  move_day: "bg-[#fdefec]/70",
};

const STAGE_DOODLE: Record<string, string> = {
  deal_started: "rocket",
  holding_fee: "coin",
  referencing: "search",
  plc: "shield",
  deposit: "bank",
  tenancy_agreement: "file-contract",
  rent_payment: "wallet",
  move_day: "key",
};

const stageLabel = (key: string) => PORTAL_STAGE_BY_KEY[key]?.label ?? key.replace(/_/g, " ");
const londonDay = (at: Date) => at.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const isOverdue = (d: Deal) => d.statusKey !== "cancelled" && d.app.startDate != null && d.app.startDate < londonDay(new Date());
const daysSince = (iso?: string | null) => {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86_400_000;
};
const fmtDate = (iso: string | null | undefined, year = false) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
};
const agoLabel = (iso: string | null) => {
  const days = daysSince(iso);
  if (!Number.isFinite(days)) return "";
  if (days < 1) return "Today";
  const n = Math.floor(days);
  return n === 1 ? "1 day ago" : `${n} days ago`;
};
const lastActivity = (d: Deal) =>
  [d.portal.lastNote?.at ?? null, d.portal.override?.at ?? null, d.app.dateReceived].filter((x): x is string => !!x).sort().at(-1) ?? null;
/* Kirstie's board hides deals that should have finished before 2026 (stale records). */
const isStale = (d: Deal) => {
  const ref = d.app.startDate ?? d.app.dateReceived;
  return ref != null && ref < "2026-01-01";
};

/** Where one stage stands, in Kirstie's three words and her colours. */
function stageStatus(d: Deal, stageKey: string): { text: string; tone: string } {
  const start = d.app.startDate;
  switch (stageKey) {
    case "deal_started": return { text: "Application received", tone: QUIET_PILL };
    case "holding_fee": return d.money?.holding || d.app.propoly?.holdingPaid?.status === "paid" ? { text: "Fee received", tone: GREEN_PILL } : d.holdingInvoice ? { text: "Fee invoiced", tone: AMBER_PILL } : { text: "Awaiting fee", tone: AMBER_PILL };
    case "referencing": return { text: "References in progress", tone: AMBER_PILL };
    case "plc": return d.plc ? { text: d.plc.label, tone: d.plc.state === "approved" ? GREEN_PILL : AMBER_PILL } : { text: "PLC in progress", tone: AMBER_PILL };
    case "deposit":
      if (d.flatbond?.done) return { text: d.flatbond.product === "flatbond" ? "Flatfair plan active" : "Deposit registered", tone: GREEN_PILL };
      if (d.flatbond?.status === "pending_tenant_action") return { text: "Tenant to pay in Flatfair", tone: AMBER_PILL };
      return d.money?.deposit ? { text: "Deposit received", tone: GREEN_PILL } : d.flatbond ? { text: "Set up in Flatfair", tone: AMBER_PILL } : { text: "Awaiting deposit", tone: AMBER_PILL };
    case "tenancy_agreement": return d.tobStatus?.status === "completed" ? { text: "Agreement signed", tone: GREEN_PILL } : d.tobStatus?.sentAt ? { text: "Agreement sent", tone: AMBER_PILL } : { text: "Agreement to send", tone: AMBER_PILL };
    case "rent_payment": return d.rentReceived ? { text: "First rent received", tone: GREEN_PILL } : { text: "Awaiting first payment", tone: AMBER_PILL };
    case "move_day": {
      if (!start) return { text: "Move-in date TBC", tone: AMBER_PILL };
      const diff = Math.round((new Date(`${start}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
      if (diff < 0) return { text: "Completed", tone: GREEN_PILL };
      if (diff === 0) return { text: "Moving in today", tone: GREEN_PILL };
      if (diff === 1) return { text: "Move-in tomorrow", tone: GREEN_PILL };
      return { text: `Move-in ${fmtDate(start)}`, tone: GREEN_PILL };
    }
    default: return { text: stageLabel(stageKey), tone: QUIET_PILL };
  }
}

/** The card's one line: slipped first, then where its stage stands. */
function cardStatus(d: Deal, stageKey: string): { text: string; tone: string } {
  if (isOverdue(d) && stageKey !== "move_day") return { text: "Move-in slipped", tone: RED_PILL };
  return stageStatus(d, stageKey);
}

function Photo({ src, className = "" }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-page text-muted ${className}`}><DoodleIcon name="home-1" size={22} /></span>
  );
}

function DealCard({ d, stageKey, onOpen }: { d: Deal; stageKey: string; onOpen: () => void }) {
  const lead = d.app.tenants.find((t) => t.isPrimary) ?? d.app.tenants[0];
  const st = cardStatus(d, stageKey);
  return (
    <button type="button" onClick={onOpen} className="btn-press group flex w-full flex-col overflow-hidden rounded-2xl border border-line/60 bg-card p-2 text-left transition hover:border-black/25">
      <Photo src={d.app.image} className="aspect-[16/10] w-full rounded-xl" />
      <div className="px-1 pb-1 pt-2.5">
        <p className="truncate text-[13px] font-semibold leading-tight">{d.app.propertyName}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{lead ? lead.name : "No tenant recorded"}{d.app.tenants.length > 1 ? ` +${d.app.tenants.length - 1}` : ""}</p>
        <span className={`mt-2 inline-block max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.tone}`}>{st.text}</span>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>{agoLabel(lastActivity(d))}</span>
          {d.portal.notesCount > 0 ? <span className="flex items-center gap-1"><DoodleIcon name="message" size={11} />{d.portal.notesCount}</span> : null}
        </div>
      </div>
    </button>
  );
}

/** One let, opened in place: every stage, where it is, and what is next. */
function LetPanel({ d, applicationId, onOpenApplication, onClose: closeNow }: { d: Deal; applicationId: string | null; onOpenApplication: (id: string) => void; onClose: () => void }) {
  const { shown, close } = useSlideOver(true, closeNow, d.app.id);
  const at = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === d.effectiveStatusKey));
  const current = PORTAL_STAGES[at];
  const st = cardStatus(d, current.key);
  const lead = d.app.tenants.find((t) => t.isPrimary) ?? d.app.tenants[0];
  const facts: { label: string; value: string }[] = [
    { label: "Move-in", value: fmtDate(d.app.startDate, true) ?? "Not set yet" },
    { label: "Rent", value: d.app.offer != null ? `£${Math.round(d.app.offer).toLocaleString("en-GB")}${d.app.offerPeriod === "week" ? " pw" : " pcm"}` : "-" },
    { label: "Tenants", value: d.app.tenants.length ? d.app.tenants.map((t) => t.name).join(", ") : "Not recorded" },
    { label: "Service", value: d.serviceLevel ?? d.app.propoly?.service ?? "-" },
  ];
  return (
    <div className="so-root fixed inset-0 z-[130]" data-shown={shown}>
      <button aria-label="Close" onClick={close} data-shown={shown} className="so-scrim absolute inset-0 cursor-default bg-ink/35" />
      <aside
        role="dialog"
        aria-label={`Let: ${d.app.propertyName}`}
        data-shown={shown}
        className="so-panel absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-lg bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] lg:w-[min(760px,calc(100%-17rem))]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
          <div className="mb-4 flex items-center gap-2">
            <button type="button" onClick={close} title="Close (Esc)" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 bg-white text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink">✕</button>
            <span className="ml-auto flex flex-wrap justify-end gap-2">
              {applicationId && (
                <button type="button" onClick={() => onOpenApplication(applicationId)} className="press-ring inline-flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40">
                  <DoodleIcon name="checklist" size={13} /> Open the application
                </button>
              )}
              <a href={propolyDealUrl(d.app.id)} target="_blank" rel="noreferrer" className="press-ring inline-flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40">
                Open in Propoly <span aria-hidden>↗</span>
              </a>
            </span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Photo src={d.app.image} className="aspect-[16/10] w-full shrink-0 rounded-2xl sm:w-[220px]" />
            <div className="min-w-0">
              <h2 className="text-[22px] leading-tight">{d.app.propertyName}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{d.app.locality}</p>
              <p className="mt-2 text-[13px]">{lead ? lead.name : "No tenant recorded"}{d.app.tenants.length > 1 ? ` and ${d.app.tenants.length - 1} more` : ""}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold">Stage {at + 1} of {PORTAL_STAGES.length}: {current.label}</span>
                <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${st.tone}`}>{st.text}</span>
              </div>
            </div>
          </div>

          {d.flags.length > 0 && (
            <div className="mt-4 rounded-2xl bg-[#fdefec] px-4 py-3 text-[12.5px] text-[#9d4340]">
              <p className="font-semibold">Needs a look</p>
              <ul className="mt-1 list-disc pl-4">{d.flags.map((f) => <li key={f.kind}>{f.label}</li>)}</ul>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl border border-line/60 bg-white px-3.5 py-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{f.label}</p>
                <p className="mt-1 text-[13px] leading-snug">{f.value}</p>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-[22px] border border-line/60 bg-white p-5">
            <h3 className="text-[15px]">Where it&rsquo;s up to</h3>
            <ol className="mt-3 space-y-1.5">
              {PORTAL_STAGES.map((s, i) => {
                const done = i < at;
                const here = i === at;
                const line = done || here ? stageStatus(d, s.key) : null;
                return (
                  <li key={s.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${here ? "bg-accent-soft/40" : ""}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-[#f1f4ec] text-[#56634a]" : here ? "bg-accent-soft text-accent-dark" : "bg-page text-muted/60"}`}>
                      {done ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.4 L6.6 11.4 L12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : (
                        <DoodleIcon name={STAGE_DOODLE[s.key] ?? "rocket"} size={14} />
                      )}
                    </span>
                    <span className={`min-w-0 flex-1 text-[13px] ${done || here ? "font-semibold" : "text-muted"}`}>{s.label}</span>
                    {line ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${line.tone}`}>{line.text}</span> : <span className="shrink-0 text-[11px] text-muted">{i === at + 1 ? "Next" : ""}</span>}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[11.5px] leading-snug text-muted">Kirstie moves each let through these stages. Ask her in the application&rsquo;s comments if something looks stuck.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function LetsBoard({
  everything,
  matchApplication,
  onOpenApplication,
  openDeal = null,
  onDealClosed,
}: {
  /** A let the page wants opened (the Propoly box under List). */
  openDeal?: string | null;
  onDealClosed?: () => void;
  /** The owner sees the whole business, with a filter by agent; an agent only ever their own. */
  everything: boolean;
  /** The REX application for this let, if there is one, to open its file. */
  matchApplication: (d: Deal) => string | null;
  onOpenApplication: (id: string) => void;
}) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  /* The route says whose deals it sent; the page's own scope is the fallback. */
  const [wholeBook, setWholeBook] = useState<boolean | null>(null);
  const all = wholeBook ?? everything;
  useEffect(() => {
    if (openDeal) setOpenId(openDeal);
  }, [openDeal]);

  useEffect(() => {
    let gone = false;
    const load = (attempt: number) =>
      fetch("/api/pretenancy/deals?mine=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { deals?: Deal[] | null; error?: string; wholeBook?: boolean }) => {
          if (gone) return;
          if (typeof j.wholeBook === "boolean") setWholeBook(j.wholeBook);
          if (Array.isArray(j.deals)) setDeals(j.deals);
          /* A cold Propoly cache answers null: ask again rather than say "none". */
          else if (j.deals === null && attempt < 4) setTimeout(() => load(attempt + 1), 4000);
          else setError(j.error ?? "Your lets didn't load. Try again in a minute.");
        })
        .catch(() => { if (!gone) setError("Your lets didn't load. Try again in a minute."); });
    load(0);
    /* ?deal=<id>: open one let straight away (links from search and the Propoly box). */
    const wanted = new URLSearchParams(window.location.search).get("deal");
    if (wanted) setOpenId(wanted);
    return () => { gone = true; };
  }, []);

  const live = useMemo(
    () => (deals ?? []).filter((d) => !d.archived && d.statusKey !== "cancelled" && !isStale(d) && (!all || !agent || d.agentName === agent)),
    [deals, all, agent]
  );
  const open = (deals ?? []).find((d) => d.app.id === openId) ?? null;
  const agents = useMemo(() => [...new Set((deals ?? []).map((d) => d.agentName).filter((n): n is string => Boolean(n)))].sort(), [deals]);

  if (error) return <p className="rounded-[22px] border border-line/50 bg-white p-6 text-center text-[13px] text-accent-dark">{error}</p>;
  if (deals === null) return <BoardLoading />;

  return (
    <>
      {all && agents.length > 1 && (
        <div className="mb-3 flex justify-end">
          <PickOne tone="pink" label="All agents" icon="user" options={agents.map((a) => ({ id: a, label: a }))} value={agent} onChange={setAgent} />
        </div>
      )}
      {live.length === 0 ? (
        <p className="rounded-[22px] border border-line/50 bg-white p-8 text-center text-[13px] text-muted">
          No lets in progress{all ? "" : " on your book"} yet. Once an offer is accepted and Kirstie starts the deal, it shows here.
        </p>
      ) : (
        <section className="fade-up -mx-1 overflow-x-auto px-1 pb-4">
          <div className="flex items-start gap-3">
            {PORTAL_STAGES.map((s) => {
              const dealsIn = live.filter((d) => d.effectiveStatusKey === s.key);
              return (
                <div key={s.key} style={{ width: "clamp(190px, 14.4vw, 260px)" }} className={`flex shrink-0 flex-col rounded-[18px] p-2 ${COLUMN_TINT[s.key] ?? "bg-panel"}`}>
                  <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                    <span className="truncate text-[13px] font-semibold text-ink">{s.label}</span>
                    <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-ink">{dealsIn.length}</span>
                  </div>
                  <div className="space-y-2">
                    {dealsIn.map((d) => <DealCard key={d.app.id} d={d} stageKey={s.key} onOpen={() => setOpenId(d.app.id)} />)}
                    {dealsIn.length === 0 ? <p className="rounded-xl border border-dashed border-line/70 px-2 py-6 text-center text-[11px] text-muted">Nothing here</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {open && (
        <LetPanel
          d={open}
          applicationId={matchApplication(open)}
          onOpenApplication={(id) => { setOpenId(null); onOpenApplication(id); }}
          onClose={() => { setOpenId(null); onDealClosed?.(); }}
        />
      )}
    </>
  );
}
