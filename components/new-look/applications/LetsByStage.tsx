"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";
import SteveFace from "@/components/SteveFace";
import { Badge, Ico, type Tone } from "@/components/new-look/Parts";
import { searchMatches } from "@/lib/search-match";
import { PORTAL_STAGES, propolyDealUrl } from "@/lib/business/propoly-stages";
import {
  AMBER_PILL,
  GREEN_PILL,
  RED_PILL,
  agoLabel,
  cardStatus,
  daysSince,
  fmtDate,
  isStale,
  isSwapDeal,
  lastActivity,
  type WaitingLet,
} from "@/components/applications/LetsBoard";
import type { PreTenancyDeal } from "@/app/api/pretenancy/deals/route";

/**
 * The lets in progress in the new look (lib/new-look "applications", Claude
 * Design 23 Oct 2026): the design's Applications screen. The same deals, the
 * same agent scoping and the same cancelled list as the old board
 * (components/applications/LetsBoard), drawn as stage tabs with counts over
 * rows grouped by stage. A row opens the let; the chevron peeks at where it
 * is up to without leaving the page.
 *
 * Read only, like the old board: moving a stage stays Kirstie's. Accepted
 * lets not in Propoly yet sit first, under To Hand Over, rather than in a tab
 * in the corner.
 */

type Deal = PreTenancyDeal;
type StageId = "all" | "handover" | string;

const toneOf = (pill: string): Tone => (pill === GREEN_PILL ? "good" : pill === RED_PILL ? "accent" : pill === AMBER_PILL ? "warning" : "neutral");

/** The house outline, for a let with no photo. */
function Thumb({ src }: { src: string | null }) {
  return (
    <span className="nl-apps-thumb" aria-hidden>
      {src ? (
        <PropertyPhoto src={src} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg width="26" height="20" viewBox="0 0 56 44" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M4 42h48M10 42V20L28 6l18 14v22M23 42V30h10v12" />
        </svg>
      )}
    </span>
  );
}

function Caret() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="nl-apps-caret">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function LetsByStage({
  everything,
  matchApplication,
  onOpenApplication,
  q,
  onQ,
  agent,
  onAgents,
  onAgent,
  agents,
  waiting,
  waitingReady,
  extra,
}: {
  everything: boolean;
  /** The application for this let, if there is one, to open its page. */
  matchApplication: (d: Deal) => string | null;
  onOpenApplication: (id: string, order?: string[]) => void;
  q: string;
  onQ: (v: string) => void;
  agent: string | null;
  onAgent: (v: string | null) => void;
  /** The names on the deals, told to the page for its picker. */
  onAgents: (names: string[]) => void;
  agents: string[];
  /** Accepted, not in Propoly yet. */
  waiting: WaitingLet[];
  /** False while the applications those come from are still being read. */
  waitingReady: boolean;
  /** Drawn at the right of the filter row: the page's view toggle. */
  extra?: React.ReactNode;
}) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<StageId>("all");
  const [open, setOpen] = useState<string | null>(null);
  /* Lets cancelled from their own page (lib/let-cancel), as on the old board. */
  const [cancelled, setCancelled] = useState<{ refs: Set<string>; deals: Set<string> }>({ refs: new Set(), deals: new Set() });
  const [wholeBook, setWholeBook] = useState<boolean | null>(null);
  const all = wholeBook ?? everything;

  useEffect(() => {
    fetch("/api/lets/cancelled", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; refs?: string[]; deals?: string[] }) => j.ok && setCancelled({ refs: new Set(j.refs ?? []), deals: new Set(j.deals ?? []) }))
      .catch(() => undefined);
  }, []);

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
        .catch(() => {
          if (!gone) setError("Your lets didn't load. Try again in a minute.");
        });
    load(0);
    return () => {
      gone = true;
    };
  }, []);

  const names = useMemo(() => [...new Set((deals ?? []).map((d) => d.agentName).filter((n): n is string => Boolean(n)))].sort(), [deals]);
  useEffect(() => {
    onAgents(all ? names : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join("|"), all]);

  /* Every let still moving, for this agent: what the counts are made of. */
  const mine = useMemo(
    () =>
      (deals ?? []).filter(
        (d) =>
          !d.archived &&
          d.statusKey !== "cancelled" &&
          !isStale(d) &&
          !cancelled.deals.has(d.app.id) &&
          !cancelled.refs.has(d.app.id) &&
          !cancelled.refs.has(matchApplication(d) ?? "") &&
          (!all || !agent || d.agentName === agent)
      ),
    [deals, all, agent, cancelled, matchApplication]
  );
  const waitingMine = useMemo(() => waiting.filter((w) => !all || !agent || w.agent === agent), [waiting, all, agent]);
  const found = useMemo(
    () => (q.trim() ? mine.filter((d) => searchMatches(q, d.app.propertyName, d.app.locality, d.agentName, ...d.app.tenants.map((t) => t.name))) : mine),
    [mine, q]
  );
  const waitingFound = useMemo(
    () => (q.trim() ? waitingMine.filter((w) => searchMatches(q, w.property, w.locality, w.agent ?? "", w.tenant)) : waitingMine),
    [waitingMine, q]
  );

  const pageId = (d: Deal) => matchApplication(d) ?? d.app.id;
  const boardOrder = () => [...waitingFound.map((w) => w.id), ...PORTAL_STAGES.flatMap((s) => found.filter((d) => d.effectiveStatusKey === s.key).map(pageId))];
  const countOf = (key: string) => mine.filter((d) => d.effectiveStatusKey === key).length;

  /* Unknown while Propoly is read; "-" if it failed, never a number we don't have. */
  const tabs: { id: StageId; label: string; n: number | null | "-" }[] = [
    { id: "all", label: "All", n: error ? "-" : deals === null || !waitingReady ? null : mine.length + waitingMine.length },
    { id: "handover", label: "To hand over", n: waitingReady ? waitingMine.length : null },
    ...PORTAL_STAGES.map((s) => ({ id: s.key, label: s.label, n: error ? ("-" as const) : deals === null ? null : countOf(s.key) })),
  ];

  /* The underline that slides to the chosen stage, as the design has it. */
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number; ready: boolean } | null>(null);
  const measure = () => {
    const el = ref.current?.querySelector<HTMLElement>(".nl-apps-stage.is-on");
    if (el) setInd((cur) => ({ x: el.offsetLeft, w: el.offsetWidth, ready: Boolean(cur) }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [stage, tabs.map((t) => t.n ?? "").join()]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups: { id: string; label: string; deals: Deal[] }[] = PORTAL_STAGES.filter((s) => stage === "all" || stage === s.key)
    .map((s) => ({ id: s.key, label: s.label, deals: found.filter((d) => d.effectiveStatusKey === s.key) }))
    .filter((g) => g.deals.length);
  const showWaiting = (stage === "all" || stage === "handover") && waitingFound.length > 0;
  const shownCount = (stage === "all" || stage === "handover" ? waitingFound.length : 0) + groups.reduce((n, g) => n + g.deals.length, 0);
  const pick = (id: StageId) => {
    setStage(id);
    setOpen(null);
  };

  const row = (d: Deal) => {
    const lead = d.app.tenants.find((t) => t.isPrimary) ?? d.app.tenants[0];
    const st = cardStatus(d, d.effectiveStatusKey);
    const at = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === d.effectiveStatusKey));
    const days = daysSince(d.app.dateReceived);
    const isOpen = open === d.app.id;
    const go = () => onOpenApplication(pageId(d), boardOrder());
    const when = agoLabel(lastActivity(d));
    const said = [
      `${st.text}.`,
      d.app.startDate ? `Moving in ${fmtDate(d.app.startDate, true)}.` : "No move-in date yet.",
      all && d.agentName ? `With ${d.agentName}.` : null,
      when ? `Last moved ${when.toLowerCase()}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div key={d.app.id} className={`nl-apps-let${isOpen ? " is-open" : ""}`}>
        <div
          className="nl-apps-letrow"
          role="link"
          tabIndex={0}
          data-steve-row=""
          aria-label={`Open ${d.app.propertyName}`}
          onClick={go}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
        >
          <Thumb src={d.app.image} />
          <span className="min-w-0">
            <span className="nl-strong block truncate">
              {d.app.propertyName}
              {isSwapDeal(d) ? <span className="text-muted"> (tenant swap)</span> : null}
            </span>
            <span className="nl-meta block truncate">
              {lead ? lead.name : "No tenant recorded"}
              {d.app.tenants.length > 1 ? ` +${d.app.tenants.length - 1}` : ""}
              {all && d.agentName ? ` · ${d.agentName}` : ""}
            </span>
          </span>
          <span className="nl-apps-badge">
            <Badge tone={toneOf(st.tone)}>{st.text}</Badge>
          </span>
          <span className={`nl-apps-age${days > 30 && Number.isFinite(days) ? " is-old" : ""}`}>{Number.isFinite(days) ? `${Math.floor(days)} ${Math.floor(days) === 1 ? "day" : "days"}` : ""}</span>
          <span className="nl-apps-pips" aria-label={`Stage ${at + 1} of ${PORTAL_STAGES.length}`}>
            {PORTAL_STAGES.map((s, j) => (
              <i key={s.key} className={j < at ? "done" : j === at ? "now" : ""} />
            ))}
          </span>
          <button
            type="button"
            className="nl-apps-peek"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Hide" : "Peek at"} ${d.app.propertyName}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(isOpen ? null : d.app.id);
            }}
          >
            <Caret />
          </button>
        </div>
        <div className={`nl-collapse${isOpen ? " is-open" : ""}`}>
          <div>
            <div className="nl-apps-more">
              <ol className="nl-apps-journey" style={{ "--nl-steps": PORTAL_STAGES.length } as React.CSSProperties}>
                {PORTAL_STAGES.map((s, j) => (
                  <li key={s.key} className={j < at ? "done" : j === at ? "now" : ""}>
                    <i>{j < at ? <Ico name="check" size={10} /> : null}</i>
                    <span>{s.label}</span>
                  </li>
                ))}
              </ol>
              <p>{said}</p>
              {d.flags.length > 0 && (
                <p className="nl-apps-flagline">
                  {d.flags.map((f) => f.label).join(". ")}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={go}>
                  Open the let
                </button>
                <a href={propolyDealUrl(d.app.id)} target="_blank" rel="noopener noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={(e) => e.stopPropagation()}>
                  Open in Propoly
                </a>
                {d.portal.notesCount > 0 && <span className="nl-meta">{d.portal.notesCount} {d.portal.notesCount === 1 ? "note" : "notes"} from Kirstie&apos;s side</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div ref={ref} className="nl-apps-stages" role="tablist" aria-label="Where the lets are up to">
        {ind && <span aria-hidden className={`nl-apps-stage-ind${ind.ready ? " is-ready" : ""}`} style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={stage === t.id}
            className={`nl-apps-stage${stage === t.id ? " is-on" : ""}${t.n === 0 ? " is-empty" : ""}${t.id === "all" ? " is-all" : ""}`}
            onClick={() => pick(t.id)}
          >
            <span className="nl-apps-stage-n">{t.n == null ? <span className="nl-apps-dots" aria-label="Counting"><i /><i /><i /></span> : t.n}</span>
            <span className="nl-apps-stage-name">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="nl-filters nl-apps-filters">
        <label className="nl-fsearch">
          <Ico name="search" />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Search addresses and tenants" aria-label="Search lets" />
        </label>
        {agents.length > 1 && (
          <span className={`nl-fsel${agent ? " is-set" : ""}`}>
            <select aria-label="Agent" value={agent ?? ""} onChange={(e) => onAgent(e.target.value || null)}>
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="nl-fcount">{deals === null && !error ? "" : `${shownCount} ${shownCount === 1 ? "let" : "lets"}`}</span>
        {extra}
      </div>

      <div className="nl-apps-groups" key={`${stage}:${q}:${agent ?? ""}`}>
        {showWaiting && (
          <section className="nl-apps-group">
            <div className="nl-apps-group-head">
              <h2 className="nl-section-title">To Hand Over</h2>
              <span className="nl-count">{waitingFound.length}</span>
              <span className="nl-meta nl-apps-group-note">Accepted, not in Propoly yet. Open one and press Push to Propoly.</span>
            </div>
            {waitingFound.map((w) => {
              const go = () => onOpenApplication(w.id, boardOrder());
              return (
                <div key={w.id} className="nl-apps-let">
                  <div className="nl-apps-letrow is-handover" role="link" tabIndex={0} data-steve-row="" aria-label={`Open ${w.property}`} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()}>
                    <Thumb src={w.image} />
                    <span className="min-w-0">
                      <span className="nl-strong block truncate">
                        {w.property}
                        {w.swap ? <span className="text-muted"> (tenant swap)</span> : null}
                      </span>
                      <span className="nl-meta block truncate">
                        {w.tenant}
                        {w.moveIn ? ` · moving in ${fmtDate(w.moveIn)}` : ""}
                        {all && w.agent ? ` · ${w.agent}` : ""}
                      </span>
                    </span>
                    <span className="nl-apps-badge">
                      <Badge tone="accent">Not in Propoly</Badge>
                    </span>
                    <button
                      type="button"
                      className="nl-btn nl-btn--secondary nl-btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        go();
                      }}
                    >
                      Hand over
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {error ? (
          <div className="nl-apps-problem" role="alert">
            <p className="nl-block-title">Your lets didn&apos;t load</p>
            <p className="nl-meta mt-1.5 max-w-md">{error}</p>
          </div>
        ) : deals === null ? (
          <p className="nl-meta flex items-center gap-2 py-10">
            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />
            Reading your lets from Propoly…
          </p>
        ) : groups.length ? (
          groups.map((g) => (
            <section key={g.id} className="nl-apps-group">
              <div className="nl-apps-group-head">
                <h2 className="nl-section-title">{g.label}</h2>
                <span className="nl-count">{g.deals.length}</span>
              </div>
              {g.deals.map(row)}
            </section>
          ))
        ) : stage === "handover" && showWaiting ? null : (
          <div className="nl-empty">
            <SteveFace size={34} mood={q.trim() ? "surprised" : "happy"} />
            <span>
              {q.trim()
                ? "No lets match that search."
                : stage === "all"
                  ? `No lets in progress${all ? "" : " on your book"} yet. Once an offer is accepted and Kirstie starts the deal, it shows here.`
                  : stage === "handover"
                    ? "Nothing waiting to hand over. Lovely."
                    : `Nothing at ${tabs.find((t) => t.id === stage)?.label ?? "this stage"}. Lovely.`}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
