"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PickOne from "@/components/PickOne";
import { searchMatches } from "@/lib/search-match";
import BoardLoading from "@/components/business/BoardLoading";
import { PORTAL_STAGES, PORTAL_STAGE_BY_KEY } from "@/lib/business/propoly-stages";
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

/** An accepted let with no deal in Propoly yet (James, 12 Oct 2026). Not a
 *  deal, so not a column: a tab in the bottom-left corner says how many are
 *  waiting to be handed over, and each opens its file to push. */
export type WaitingLet = { id: string; property: string; locality: string; image: string | null; tenant: string; agent: string | null; moveIn: string | null; swap: boolean };

const GREEN_PILL = "bg-[#f1f4ec] text-[#56634a]";
const RED_PILL = "bg-[#fdefec] text-[#9d4340]";
const AMBER_PILL = "bg-amber-50 text-amber-700";
const QUIET_PILL = "bg-page text-muted";

/* One grey for every column (James, 11 Oct 2026: "make the backgrounds the
   same grey ... a little bit more uniform"), white cards on it, and the stage
   told apart by a small coloured bar beside its name. */
const STAGE_MARK: Record<string, string> = {
  deal_started: "#cfa096",
  holding_fee: "#e0a54a",
  referencing: "#5aa1d6",
  plc: "#7fb3a8",
  deposit: "#8c7fd1",
  tenancy_agreement: "#6b8fd6",
  rent_payment: "#86b06a",
  move_day: "#4f9a62",
};

export const STAGE_DOODLE: Record<string, string> = {
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
export function stageStatus(d: Deal, stageKey: string): { text: string; tone: string } {
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
export function cardStatus(d: Deal, stageKey: string): { text: string; tone: string } {
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
    <button type="button" onClick={onOpen} className="btn-press group flex w-full flex-col overflow-hidden rounded-xl border border-black/[0.06] bg-card p-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-black/20">
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

/** The bottom-left tab: how many lets are waiting to go to Propoly, and the list on a click. */
function HandoverTab({ waiting, all, onOpenApplication }: { waiting: WaitingLet[]; all: boolean; onOpenApplication: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const n = waiting.length;
  return (
    <div ref={ref} className="pointer-events-none sticky bottom-5 z-[40] mt-4 flex" data-steve="applications.handover-tab">
      <div className="pointer-events-auto relative">
        {open && (
          <div className="fade-up absolute bottom-full left-0 mb-2 w-[min(400px,calc(100vw-2.5rem))] overflow-hidden rounded-[18px] border border-line/60 bg-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)]">
            <div className="border-b border-line/50 px-4 pb-2.5 pt-3.5">
              <p className="text-[13.5px] font-semibold">{n} {n === 1 ? "Let" : "Lets"} to Hand Over</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">Accepted, but not in Propoly yet. Open one and press Push to Propoly.</p>
            </div>
            <ul className="max-h-[min(420px,60vh)] divide-y divide-line/40 overflow-y-auto px-1.5 py-1">
              {waiting.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => { setOpen(false); onOpenApplication(w.id); }} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent-soft/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{w.property}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {w.swap ? "Tenant swap · " : ""}{w.tenant}{w.moveIn ? ` · moving in ${fmtDate(w.moveIn)}` : ""}{all && w.agent ? ` · ${w.agent}` : ""}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-[12px] font-semibold text-accent-dark">Hand over</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] py-2 pl-2 pr-4 text-[12.5px] font-semibold text-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.45)] transition-opacity hover:opacity-90"
        >
          <span className="figures flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[12px] text-[var(--brown)]">{n}</span>
          To Hand Over
          <DoodleIcon name="rocket" size={13} />
        </button>
      </div>
    </div>
  );
}

export default function LetsBoard({
  everything,
  matchApplication,
  onOpenApplication,
  q = "",
  agent: agentIn,
  onAgents,
  waiting = [],
}: {
  /** Accepted, not in Propoly yet: the bottom-left To Hand Over tab. */
  waiting?: WaitingLet[];
  /** When the page draws the agent picker on its own toolbar row, it holds the
   *  choice and is told the names; otherwise the board draws its own. */
  agent?: string | null;
  onAgents?: (names: string[]) => void;
  /** The page's search: a let shows when every word is in its address, tenants or agent. */
  q?: string;
  /** The owner sees the whole business, with a filter by agent; an agent only ever their own. */
  everything: boolean;
  /** The REX application for this let, if there is one, to open its file. */
  matchApplication: (d: Deal) => string | null;
  /** Open a let's own page - its application, or the deal when it has none -
   *  with the board's order for ‹ › there. */
  onOpenApplication: (id: string, order?: string[]) => void;
}) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownAgent, setAgent] = useState<string | null>(null);
  /* Lets cancelled from their own page (lib/let-cancel): off the board at
     once, while Kirstie cancels them in Propoly. */
  const [cancelled, setCancelled] = useState<{ refs: Set<string>; deals: Set<string> }>({ refs: new Set(), deals: new Set() });
  useEffect(() => {
    fetch("/api/lets/cancelled", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; refs?: string[]; deals?: string[] }) => j.ok && setCancelled({ refs: new Set(j.refs ?? []), deals: new Set(j.deals ?? []) }))
      .catch(() => undefined);
  }, []);
  const agent = agentIn !== undefined ? agentIn : ownAgent;
  /* The route says whose deals it sent; the page's own scope is the fallback. */
  const [wholeBook, setWholeBook] = useState<boolean | null>(null);
  const all = wholeBook ?? everything;

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
    return () => { gone = true; };
  }, []);

  const live = useMemo(
    () => (deals ?? []).filter((d) => !d.archived && d.statusKey !== "cancelled" && !isStale(d) && !cancelled.deals.has(d.app.id) && !cancelled.refs.has(d.app.id) && !cancelled.refs.has(matchApplication(d) ?? "") && (!all || !agent || d.agentName === agent) && (!q.trim() || searchMatches(q, d.app.propertyName, d.app.locality, d.agentName, ...d.app.tenants.map((t) => t.name)))),
    [deals, all, agent, q, cancelled, matchApplication]
  );
  const waitingShown = useMemo(
    () => waiting.filter((w) => (!all || !agent || w.agent === agent) && (!q.trim() || searchMatches(q, w.property, w.locality, w.agent ?? "", w.tenant))),
    [waiting, all, agent, q]
  );
  /* A card opens the let's own page (James, 12 Oct 2026): its application
     when it has one, else the deal itself. Column by column, for ‹ ›. */
  const pageId = (d: Deal) => matchApplication(d) ?? d.app.id;
  const boardOrder = () => PORTAL_STAGES.flatMap((s) => live.filter((d) => d.effectiveStatusKey === s.key).map(pageId));
  const agents = useMemo(() => [...new Set((deals ?? []).map((d) => d.agentName).filter((n): n is string => Boolean(n)))].sort(), [deals]);
  useEffect(() => {
    if (onAgents) onAgents(all ? agents : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.join("|"), all]);

  if (error) return <p className="rounded-[22px] border border-line/50 bg-white p-6 text-center text-[13px] text-accent-dark">{error}</p>;
  if (deals === null) return <BoardLoading />;

  return (
    <>
      {all && agents.length > 1 && !onAgents && (
        <div className="mb-3 flex justify-end">
          <PickOne tone="pink" label="All agents" icon="user" options={agents.map((a) => ({ id: a, label: a }))} value={agent} onChange={setAgent} />
        </div>
      )}
      {live.length === 0 ? (
        <p className="rounded-[22px] border border-line/50 bg-white p-8 text-center text-[13px] text-muted">
          {q.trim()
            ? "No let matches that search."
            : `No lets in progress${all ? "" : " on your book"} yet. Once an offer is accepted and Kirstie starts the deal, it shows here.`}
        </p>
      ) : (
        <section className="fade-up -mx-1 overflow-x-auto px-1 pb-4">
          <div className="flex items-start gap-3">
            {PORTAL_STAGES.map((s) => {
              const dealsIn = live.filter((d) => d.effectiveStatusKey === s.key);
              return (
                <div key={s.key} style={{ width: "clamp(200px, 14.4vw, 260px)" }} className="flex shrink-0 flex-col rounded-[16px] bg-[var(--board-col)] p-2">
                  <div className="flex items-center gap-2 px-1.5 pb-2.5 pt-1.5">
                    <span aria-hidden className="h-3.5 w-[3px] rounded-full" style={{ background: STAGE_MARK[s.key] ?? "var(--muted)" }} />
                    <span className="truncate text-[13px] font-medium text-ink">{s.label}</span>
                    <span className="ml-auto rounded-md bg-[var(--shell-panel)] px-1.5 py-0.5 text-[11px] font-medium text-muted">{dealsIn.length}</span>
                  </div>
                  <div className="space-y-2">
                    {dealsIn.map((d) => <DealCard key={d.app.id} d={d} stageKey={s.key} onOpen={() => onOpenApplication(pageId(d), boardOrder())} />)}
                    {dealsIn.length === 0 ? <p className="rounded-xl border border-dashed border-black/10 px-2 py-6 text-center text-[11px] text-muted">Nothing here</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {/* Accepted, not handed over (James, 12 Oct 2026): not a deal yet, so not
          on the board. It was a note under the board, and with a long
          Referencing column nobody saw it without scrolling to the bottom
          ("it should always be on the entrance screen"), so it is a tab that
          stays in the bottom-left corner of the page, with the count, and
          opens the list upwards. Sticky, not fixed: the page body animates
          with a transform, which would pin a fixed tab to the body instead. */}
      {waitingShown.length > 0 && <HandoverTab waiting={waitingShown} all={all} onOpenApplication={onOpenApplication} />}

    </>
  );
}
