"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import GuideButton from "@/components/GuideButton";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import StageTabs from "@/components/StageTabs";
import PropertyPhoto from "@/components/PropertyPhoto";
import ApplicationDrawer, { type Check } from "@/components/ApplicationDrawer";
import HandoffPanel from "@/components/HandoffPanel";
import { SAGE_INK, SAGE_WASH } from "@/components/appraisal/NextUp";
import type { Application } from "@/lib/applications";

/* The appraisal file's grammar, so the two boards read as one product. */
const card = "rounded-[22px] border border-line/50 bg-white";
const primary =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brown px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90";
const secondary =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line/70 bg-white px-4 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40";
const PER_PAGE = 25;

/** The row's button. Every one opens the file, so every label says so: the
 *  file holds the next step, and nothing is sent from the list itself. They
 *  said "Send to landlord" and "Chase the landlord" until 16 Sep 2026, and a
 *  button that promises a send and only opens a drawer teaches people the
 *  labels lie. Still strong while it is waiting on us or the landlord. */
function nextAction(a: Application): { label: string; strong: boolean } {
  if (a.closed) return { label: "View application", strong: false };
  if (a.status === "received" || a.status === "communicated") return { label: "Open application", strong: true };
  if (a.status === "accepted") return { label: "View progress", strong: false };
  return { label: "View application", strong: false };
}

/** Still in play: not turned down, not moved in, home not gone elsewhere. */
const isOpen = (a: Application) => a.status !== "unsuccessful" && !a.closed;

/** Something on this one needs a person: an unanswered statutory check, or
 *  rent the applicant may not carry. Counted from the record, never asserted. */
function needsAttention(a: Application): string | null {
  if (a.status === "unsuccessful" || a.closed) return null;
  /* Not right to rent: the form only asks the lead applicant, and James
     ruled that a gap in the form, not the agent's (10 Sep 2026). */
  if (a.affordabilityPct != null && a.affordabilityPct > 40) return `Rent is ${a.affordabilityPct.toFixed(0)}% of income`;
  const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  if (lead?.keyInfo?.adverseCredit === true) return "Adverse credit disclosed";
  /* Still live on paper, but two months without a landlord's answer is an
     application that has quietly died. Worth a call either way. */
  if (a.status !== "accepted" && ageDays(a) > STALE_DAYS) return `No landlord answer in ${STALE_DAYS}+ days`;
  return null;
}

const STALE_DAYS = 60;
function ageDays(a: Application): number {
  const from = a.dateReceived ? Date.parse(a.dateReceived) : a.createdAt ? a.createdAt * 1000 : NaN;
  return Number.isFinite(from) ? (Date.now() - from) / 86_400_000 : 0;
}

function StatusPill({ a }: { a: Application }) {
  const text = a.stageLabel ?? a.statusLabel;
  if (a.closed)
    return <span className="whitespace-nowrap rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted">{a.closed}</span>;
  if (a.status === "accepted")
    return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>{text}</span>;
  if (a.status === "communicated")
    return <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">{text}</span>;
  if (a.status === "unsuccessful")
    return <span className="whitespace-nowrap rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted">{text}</span>;
  return <span className="whitespace-nowrap rounded-full border border-line/60 px-2.5 py-1 text-[11px] font-semibold text-muted">{text}</span>;
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return (
    <span className="hand flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] text-accent-dark">
      {letters.toUpperCase() || "?"}
    </span>
  );
}

/**
 * Applications — REX's own book, live.
 *
 * This page used to show five invented rows on the eight pre-tenancy stages.
 * Those eight stages are real, but they belong to the PROPOLY deal that exists
 * only after an application is accepted. The record that exists *before* that,
 * and the one this page is named for, is REX's TenancyApplication — 576 of
 * them, 457 made this year, most by Howard's JotForm flow.
 *
 * So the stages here are REX's four, verbatim, and the checklist is the four
 * checks a letting actually turns on. Nothing is mapped onto anything.
 *
 * The banner is the point of the exercise. Right to Rent is a statutory check
 * on every adult who will live in the property, and the JotForm only ever asks
 * the lead applicant — so a third of the people on these applications have no
 * recorded answer. The number is counted from the live data, not asserted.
 */

const STAGES = [
  { key: "received", label: "Received", icon: "message", blurb: "In, and not yet put to the landlord." },
  { key: "communicated", label: "Communicated", icon: "mail", blurb: "With the landlord, waiting on their decision." },
  { key: "accepted", label: "Accepted", icon: "checklist", blurb: "Landlord has said yes. The deal opens from here." },
  { key: "unsuccessful", label: "Unsuccessful", icon: "cross", blurb: "Turned down, or the applicant withdrew." },
] as const;

/* Closed: REX still calls these open and they are not - the tenant has moved
   in, or the home went to someone else or came off the market. Worked out
   live by the route (closedReasons in lib/applications); nothing is written
   back to REX. Kept findable here rather than hidden, so a count that dropped
   from 162 to 63 can be checked by anyone who doubts it. */
type StageKey = (typeof STAGES)[number]["key"] | "attention" | "closed";

const gbp = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

/**
 * One fetch, however many times this mounts.
 *
 * The call takes ~3 seconds against 200 applications, and the component
 * mounts more than once on the way to a settled page — the dev double-invoke,
 * then the shell. Each mount was starting its own copy of the same request.
 *
 * Holding the PROMISE rather than the result means a later mount joins the
 * call already in flight instead of racing it.
 */
let inFlight: Promise<{ applications?: Application[]; error?: string; scope?: string; everything?: boolean }> | null = null;
function book() {
  inFlight ??= fetch("/api/applications?limit=200")
    .then((r) => r.json())
    // A failure must not be cached — the next mount should try again.
    .catch((e: Error) => {
      inFlight = null;
      throw e;
    });
  /* Shared between the mounts of ONE visit, then let go. It was held for the
     life of the tab: come back an hour later and it was the same list, and a
     single "wouldn't answer" stuck until a hard reload. */
  const mine = inFlight;
  void mine.then(
    (j) => window.setTimeout(() => { if (inFlight === mine) inFlight = null; }, j?.error ? 0 : 5000),
    () => undefined
  );
  return inFlight;
}

/** The four checks, read off the live record rather than counted. */
function checksFor(a: Application): Check[] {
  const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  const k = lead?.keyInfo;
  const everyone = a.applicants.length;
  const answered = a.applicants.filter((p) => p.keyInfo?.rightToRent === true).length;
  return [
    {
      label: `Right to rent - ${answered} of ${everyone} applicant${everyone === 1 ? "" : "s"}`,
      done: everyone > 0 && answered === everyone,
      note:
        answered < everyone
          ? "The form only ever asks the lead applicant. The others were never asked."
          : undefined,
    },
    {
      label: "Landlord reference, last 2 years",
      done: k?.landlordRef === true,
      note: k?.landlordRef === false ? "None available. Worth a guarantor conversation." : undefined,
    },
    {
      label: "Guarantor available if needed",
      done: k?.guarantor === true,
      note:
        k?.guarantor === true && lead?.guarantorCount === 0
          ? "Offered, but the form doesn't ask who, so nobody is named yet."
          : undefined,
    },
    {
      label: "No adverse credit",
      done: k?.adverseCredit === false,
      note: k?.adverseCredit === true ? k.adverseCreditNote?.slice(0, 180) ?? "Disclosed." : undefined,
    },
  ];
}

export default function Applications() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /* ?open=<id>: the PLC wizard sends people back here to a named
     application, and this is what opens it. Read once, on arrival. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("open");
    if (wanted) setOpenId(wanted);
  }, []);
  /* "open" is every application still in play. Unsuccessful is a stage like
     any other now, reached by clicking it, so the old show/hide toggle went
     with it - two ways to say the same thing, one of which was a link. */
  const [stage, setStage] = useState<StageKey | "open">("open");
  const [page, setPage] = useState(0);
  const [fAgent, setFAgent] = useState<string | null>(null);
  /* Whose book this is - "the whole business" for an owner, the agent's own
     name otherwise - so the page can say so rather than leave somebody to
     wonder why they see less than they used to. */
  const [scope, setScope] = useState<{ label: string; everything: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    book()
      .then((d) => {
        if (!live) return;
        if (d.error) setError(d.error);
        if (d.scope) setScope({ label: d.scope, everything: Boolean(d.everything) });
        setApps(d.applications ?? []);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const all = apps ?? [];
  const agents = useMemo(() => [...new Set(all.map((a) => a.agent).filter((x): x is string => Boolean(x)))].sort(), [all]);
  const mine = useMemo(() => (fAgent ? all.filter((a) => a.agent === fAgent) : all), [all, fAgent]);
  const rows = useMemo(
    () =>
      stage === "open"
        ? mine.filter(isOpen)
        : stage === "attention"
          ? mine.filter((a) => needsAttention(a) !== null)
          : stage === "closed"
            ? mine.filter((a) => a.closed)
            : stage === "unsuccessful"
              ? mine.filter((a) => a.status === stage)
              : mine.filter((a) => a.status === stage && !a.closed),
    [mine, stage]
  );
  useEffect(() => { setPage(0); }, [stage, fAgent]);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const shown = rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const counts = useMemo(() => ({
    open: mine.filter(isOpen).length,
    attention: mine.filter((a) => needsAttention(a) !== null).length,
    closed: mine.filter((a) => a.closed).length,
    by: (k: string) => mine.filter((a) => a.status === k && (k === "unsuccessful" || !a.closed)).length,
  }), [mine]);
  const open = all.find((a) => a.id === openId) ?? null;

  /* The right-to-rent banner that used to sit here - "34 of 120 people on
     the 92 open applications have no recorded right-to-rent answer" - was
     removed on 10 Sep 2026. James: "that's a me problem, not an agent
     problem". It measured a gap in how the JotForm collects the answer, not
     anything the agent reading the screen could act on, and a permanent red
     panel about somebody else's plumbing is how a screen teaches people to
     ignore its warnings. The per-application check on each row stays, because
     that one IS theirs to chase. */



  return (
    <>
      <PageHeader
        title="Applications"
        blurb={
          scope && !scope.everything
            ? `${scope.label}'s applications. See where each deal is, what needs attention, and take the next step.`
            : "Track every application in one place. See where each deal is, what needs attention, and take the next step."
        }
        /* The line runs THROUGH her, at the waist. She is drawn full length
           and set at twice the shared height, so 250 still shows above the
           rule - the same as every other screen - and the rest is cut off
           rather than hanging below it. No dip and no shadow: the line is not
           bearing her weight, it is crossing her. */
        illustration="/illustrations/applicant.webp"
        illustrationHeight={500}
        illustrationAspect={0.34}
        seat={0.5}
        illustrationCrop
        lineBreak="none"
        actions={
          <GuideButton
            id="applications"
            className="flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
          />
        }
      />

      {/* ── The pipeline, and the filter for it. Same shape as Market
             Appraisals and Listings - see components/StageTabs. It used to be
             four numbers that looked clickable and were not. ── */}
      <StageTabs
        label="Application statuses"
        allId="open"
        value={stage}
        onChange={setStage}
        stages={[
          {
            id: "open" as const,
            label: "All open",
            icon: "analytics",
            count: apps === null ? null : counts.open,
            blurb: "Everything still in play",
          },
          ...STAGES.map((st) => ({
            id: st.key as StageKey,
            label: st.label,
            icon: st.icon,
            count: apps === null ? null : counts.by(st.key),
            blurb: st.blurb,
          })),
          {
            id: "closed" as const,
            label: "Closed",
            icon: "key",
            count: apps === null ? null : counts.closed,
            blurb: "Moved in, or the home went to someone else or came off the market.",
          },
          {
            id: "attention" as const,
            label: "Needs attention",
            icon: "bell",
            count: apps === null ? null : counts.attention,
            blurb: "Rent over 40% of income, adverse credit, or no landlord answer in 60 days",
          },
        ]}
      />

      {/* ── What to focus on today: three doors, each a stage, and a nudge.
             A row above the list rather than a column beside it: beside it
             the list lost the room for its own columns at 1440 wide. ── */}
      <section className="mt-4">
        <h2 className="hand mb-3 text-[17px] leading-tight">What to focus on today</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { id: "communicated" as const, icon: "clock", n: counts.by("communicated"), title: "Awaiting landlord decision", sub: "With the landlord. Chase the ones going quiet." },
            { id: "attention" as const, icon: "bell", n: counts.attention, title: "Need attention", sub: "Rent over 40% of income, credit to talk about, or gone quiet." },
            { id: "accepted" as const, icon: "checklist", n: counts.by("accepted"), title: "Ready to progress", sub: "The landlord has said yes. The deal opens from here." },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStage(stage === f.id ? "open" : f.id)}
              className={`fade-up flex items-start gap-3 rounded-[22px] border p-4 text-left transition-colors ${stage === f.id ? "border-accent/70 bg-accent-soft/40" : "border-line/50 bg-white hover:border-ink/40"}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                <DoodleIcon name={f.icon} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="figures block text-[24px] leading-none">{apps === null ? "•" : f.n}</span>
                <span className="mt-1 block text-[12.5px] font-semibold leading-snug">{f.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{f.sub}</span>
              </span>
              <span className="mt-1 text-[13px] text-muted/70">›</span>
            </button>
          ))}
          <div className="fade-up relative overflow-hidden rounded-[22px] p-4" style={{ background: SAGE_WASH }}>
            <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-white/50" />
            <div className="relative flex h-full flex-col">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: SAGE_INK }}>
                <DoodleIcon name="rocket" size={14} /> Keep applications moving
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                A quicker process means happier tenants and fewer fall-throughs. Every row opens the file with its next step.
              </p>
              <button type="button" onClick={() => { setStage("open"); setFAgent(null); }} className={`${primary} mt-auto w-full pt-2`}>
                View all applications <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4">
        <section className={`fade-up min-w-0 ${card} p-5`}>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="hand text-[17px]">
              {stage === "open"
                ? "Open applications"
                : stage === "attention"
                  ? "Needs attention"
                  : stage === "closed"
                    ? "Closed"
                    : STAGES.find((st) => st.key === stage)?.label}
              <span className="figures ml-2 text-[14px] text-muted">{rows.length}</span>
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {stage !== "open" && (
                <button type="button" onClick={() => setStage("open")} className="text-[11.5px] text-muted underline transition-colors hover:text-ink">
                  Show all open
                </button>
              )}
              {scope?.everything && agents.length > 1 && (
                <PickOne tone="pink" label="All agents" icon="user" options={agents.map((a) => ({ id: a, label: a }))} value={fAgent} onChange={setFAgent} />
              )}
            </div>
          </div>

          {apps === null ? (
            <p className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Loading applications&hellip;
            </p>
          ) : error ? (
            <p className="py-10 text-center text-[12.5px] text-muted">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-muted">
              {stage === "attention" ? "Nothing needs a hand. Rare, and good." : "Nothing at this stage."}
            </p>
          ) : (
            <ul className="space-y-3">
              {shown.map((a) => {
                const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
                const others = a.applicants.length - 1;
                const flag = needsAttention(a);
                const act = nextAction(a);
                const on = a.id === openId;
                return (
                  <li key={a.id}>
                    {/* A row opens the file. The button at its end says what
                        the file wants next, and opens the same file - one
                        door, labelled by what is behind it. */}
                    <div data-steve-row=""
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(on ? null : a.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(on ? null : a.id); } }}
                      className={`grid cursor-pointer items-center gap-x-4 gap-y-3 rounded-[22px] border p-3.5 pr-4 transition-colors sm:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(150px,1fr)_minmax(0,1.7fr)_118px_auto_auto] ${
                        on ? "border-accent/70 bg-accent-soft/40" : "border-line/50 bg-white hover:border-ink/40"
                      }`}
                    >
                      <Initials name={lead?.name ?? "?"} />
                      <div className="min-w-0">
                        <p className="hand truncate text-[14px] leading-tight">{lead?.name ?? "—"}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          {others > 0 ? <span>+ {others} other{others === 1 ? "" : "s"}</span> : <span>Sole applicant</span>}
                          {flag && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-dark" title={flag}>
                              <DoodleIcon name="bell" size={10} /> Needs attention
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-center gap-3 sm:col-span-2 xl:col-span-1">
                        <PropertyPhoto src={a.image} className="h-12 w-16 shrink-0 rounded-xl" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold" title={a.property}>{a.property}</p>
                          {/* Below xl the offer and move-in ride this line;
                              there is no room for a column of their own
                              beside the focus panel. */}
                          <p className="truncate text-[11px] text-muted">
                            {a.locality}
                            <span className="xl:hidden">
                              {a.offerAmount ? ` · ${gbp(a.offerAmount)} pcm` : ""}
                              {a.startDate ? ` · move in ${new Date(a.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="hidden xl:block">
                        <p className="figures whitespace-nowrap text-[13px]">{a.offerAmount ? `${gbp(a.offerAmount)} pcm` : "—"}</p>
                        <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted">
                          {a.startDate ? `Move in ${new Date(a.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "No move-in date"}
                        </p>
                      </div>
                      <div className="flex items-center sm:col-span-2 xl:col-span-1 xl:justify-end">
                        <StatusPill a={a} />
                      </div>
                      <div className="sm:col-span-2 xl:col-span-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setOpenId(a.id); }}
                          className={`${act.strong ? primary : secondary} w-full xl:w-auto xl:px-3.5`}
                        >
                          {act.label}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {rows.length > PER_PAGE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-4">
              <p className="text-[11px] text-muted">
                Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, rows.length)} of {rows.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30">‹</button>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} type="button" onClick={() => setPage(i)} className={`figures flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] transition-colors ${i === page ? "bg-accent-soft font-semibold text-accent-dark" : "text-muted hover:text-ink"}`}>{i + 1}</button>
                ))}
                <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30">›</button>
              </div>
            </div>
          )}
        </section>

      </div>

      {open && (
        <ApplicationDrawer
          app={{
            id: open.id,
            tenant: (open.applicants.find((p) => p.isPrimary) ?? open.applicants[0])?.name ?? "—",
            applicants: open.applicants.map((p) => ({
              name: p.name,
              contactId: p.contactId,
              email: p.email,
              phone: p.phone,
              isPrimary: p.isPrimary,
              income: p.incomePerYear,
              employment: p.keyInfo?.employment ?? p.employmentRex,
              job: p.keyInfo?.job ?? null,
              company: p.keyInfo?.company ?? null,
              rightToRent: p.keyInfo?.rightToRent ?? null,
              landlordRef: p.keyInfo?.landlordRef ?? null,
              guarantor: p.keyInfo?.guarantor ?? null,
              adverseCredit: p.keyInfo?.adverseCredit ?? null,
            })),
            property: open.property,
            propertyId: open.propertyId,
            locality: open.locality,
            image: open.image,
            rent: open.offerAmount ? `${gbp(open.offerAmount)} pcm` : "—",
            moveIn: open.startDate ?? "—",
            stageKey: open.status,
            ticked: 0,
            agent: open.agent ?? "—",
            flag:
              open.affordabilityPct != null && open.affordabilityPct > 40
                ? `Rent is ${open.affordabilityPct.toFixed(0)}% of income`
                : undefined,
            activity: [
              open.dateReceived
                ? { when: open.dateReceived, what: "Application received.", by: open.createdBy ?? "—" }
                : null,
              open.dateAccepted
                ? { when: open.dateAccepted, what: "Landlord accepted.", by: open.agent ?? "—" }
                : null,
              /* "N/A" is what the form writes when nothing was said - not a comment. */
              open.conditions && !/^\s*(n\/?a|none|-)\s*\.?$/i.test(open.conditions)
                ? { when: "with the application", what: open.conditions, by: "Applicant", note: true }
                : null,
            ].filter((x): x is NonNullable<typeof x> => x !== null),
          }}
          stages={[...STAGES]}
          checklist={checksFor(open)}
          // Only once the landlord has said yes. Before that there is no deal
          // to hand over, and offering one invites somebody to jump the gun.
          aside={open.status === "accepted" ? <HandoffPanel applicationId={open.id} /> : undefined}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* The caveats about what the record does and does not hold. Still true,
          still worth reading; folded so the board stays clean (James, 12 Sep
          2026). Agent-facing, so no system names but Propoly, which agents
          already work in (16 Sep 2026). */}
      <details className="mt-5 text-[11px] text-muted">
        <summary className="cursor-pointer select-none font-semibold hover:text-ink">About these figures</summary>
        <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-muted">
          <li>
            <span className="font-semibold">Open leaves out the ones that have finished.</span> An
            application stays open on paper after the tenant moves in, or after the home goes to
            someone else. Those sit under Closed: accepted with the move-in date passed, or not
            accepted on a home that is now let or withdrawn. Open covers the latest 200 applications.
          </li>
          <li>
            These are the four application statuses, live. Once an application is accepted, the{" "}
            <span className="font-semibold">eight pre-tenancy stages</span> (holding fee,
            referencing, PLC, deposit, move day) come from its deal in Propoly, and show on the
            application&apos;s own track when you open it.
          </li>
          <li>
            <span className="font-semibold">Right to rent, landlord reference, guarantor and
            credit</span> are read from the application form, which only asks the lead applicant.
          </li>
          <li>
            <span className="font-semibold">No guarantor is named on any application yet.</span>{" "}
            The form asks whether the applicant can provide one, but not who.
          </li>
          <li>
            <span className="font-semibold">Referencing is followed up by hand for now.</span>{" "}
            No referencing results come into the OS yet.
          </li>
        </ul>
      </details>
    </>
  );
}
