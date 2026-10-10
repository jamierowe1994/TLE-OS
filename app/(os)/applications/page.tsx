"use client";

import { useEffect, useMemo, useState } from "react";
import { BoardSkeleton } from "@/components/Skeleton";
import dynamic from "next/dynamic";
import { whenIdle } from "@/lib/when-idle";
import { dropJson, peekJson, readJson } from "@/lib/page-cache";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import GuideButton from "@/components/GuideButton";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import StageTabs from "@/components/StageTabs";
import LetsBoard from "@/components/applications/LetsBoard";
import PropertyPhoto from "@/components/PropertyPhoto";
import type { Check } from "@/components/ApplicationDrawer";
/* Off the first load, fetched while the board sits idle. */
const loadApplicationDrawer = () => import("@/components/ApplicationDrawer");
const ApplicationDrawer = dynamic(loadApplicationDrawer, { ssr: false });
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

/**
 * A LET IN PROGRESS (7 Oct 2026, James): "just because we've got an offer on
 * a property doesn't mean it should move to applications" - the home is still
 * taking viewings until the offer is accepted. So this board is accepted
 * offers only, accepted in REX or by the agent in the OS (lib/offer-decisions).
 * Open offers live on their listing (Listings > Offers in), and ?open=<id>
 * still opens any application by name, accepted or not.
 */
const isLet = (a: Application) => a.status === "accepted" || (a.status !== "unsuccessful" && a.osDecision?.decision === "accepted");

/** Accepted here, and REX still to be told by hand. */
const rexToMark = (a: Application) => a.status !== "accepted" && a.osDecision?.decision === "accepted";

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
  /* Accepted here: a let in progress like any other (9 Oct 2026). It was
     "Mark in REX", as if nothing could happen until REX caught up. */
  if (rexToMark(a))
    return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>Accepted</span>;
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

/* Received, Communicated and Unsuccessful went on 7 Oct 2026: an offer that
   is not accepted is on its listing, not here. */
const STAGES = [
  { key: "rex", label: "Mark in REX", icon: "mail", blurb: "Accepted in the OS. REX still has to be marked accepted by hand." },
] as const;

/* Closed: REX still calls these open and they are not - the tenant has moved
   in, or the home went to someone else or came off the market. Worked out
   live by the route (closedReasons in lib/applications); nothing is written
   back to REX. Kept findable here rather than hidden, so a count that dropped
   from 162 to 63 can be checked by anyone who doubts it. */
type StageKey = (typeof STAGES)[number]["key"] | "attention" | "closed";

const gbp = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

/** An offer saved in the OS and accepted there, with no REX application yet. */
type OsAccepted = { id: string; name: string; address: string; listingId: string | null; amount: number | null; moveIn: string | null; by: string; at: string };
/* A let only Propoly knows about (lib/propoly-only-lets, 9 Oct 2026). */
type PropolyOnly = { id: string; address: string; locality: string; tenants: string; status: string; stage: string; offer: number | null; moveIn: string | null; received: string | null; agentName: string | null; href: string; external: boolean };
type AppsAnswer = { applications?: Application[]; osAccepted?: OsAccepted[]; propolyOnly?: PropolyOnly[]; error?: string; scope?: string; everything?: boolean; stale?: boolean };
const APPS_URL = "/api/applications?limit=200";

/**
 * One fetch, however many times this mounts - lib/page-cache shares the read
 * between mounts (and with the nav's prefetch), and holds the last good
 * answer so coming back paints the board at once while it reads again.
 *
 * The call took ~3 seconds against 200 applications, and the component
 * mounts more than once on the way to a settled page. A failure is never
 * held, so a single "wouldn't answer" doesn't stick.
 */
function book() {
  return readJson<AppsAnswer>(APPS_URL, (j) => !j.error && Array.isArray(j.applications));
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
  useEffect(() => whenIdle(() => { void loadApplicationDrawer(); }), []);
  const [apps, setApps] = useState<Application[] | null>(() => peekJson<AppsAnswer>(APPS_URL)?.applications ?? null);
  const [osAccepted, setOsAccepted] = useState<OsAccepted[]>(() => peekJson<AppsAnswer>(APPS_URL)?.osAccepted ?? []);
  const [propolyOnly, setPropolyOnly] = useState<PropolyOnly[]>(() => peekJson<AppsAnswer>(APPS_URL)?.propolyOnly ?? []);
  /* Offers still waiting on a decision, across the listings - they live there now. */
  const [openOffers, setOpenOffers] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/offers/open", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; total?: number }) => setOpenOffers(j.ok ? (j.total ?? 0) : null))
      .catch(() => null);
  }, []);
  const [error, setError] = useState<string | null>(null);
  /* Customer updates still to tell, for the header link. */
  const [updatesOpen, setUpdatesOpen] = useState(0);
  useEffect(() => {
    fetch("/api/customer-updates?all=1&open=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; updates?: unknown[] }) => setUpdatesOpen(j.ok ? (j.updates ?? []).length : 0))
      .catch(() => null);
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  /* Each agent's own board of lets, like Kirstie's, is what Applications opens
     on (James, 10 Oct 2026); the list is a press away. */
  const [view, setView] = useState<"board" | "list">("board");
  const [boardDeal, setBoardDeal] = useState<string | null>(null);
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
  const [scope, setScope] = useState<{ label: string; everything: boolean } | null>(() => {
    const held = peekJson<AppsAnswer>(APPS_URL);
    return held?.scope ? { label: held.scope, everything: Boolean(held.everything) } : null;
  });

  useEffect(() => {
    let live = true;
    let again = 0;
    book()
      .then((d) => {
        if (!live) return;
        /* A held board answered while the server rebuilds it: read once more
           in a few seconds and take the rebuilt one. */
        if (d.stale) {
          again = window.setTimeout(() => {
            dropJson(APPS_URL);
            book().then((k) => { if (live && !k.error && k.applications) setApps(k.applications); }).catch(() => undefined);
          }, 4000);
        }
        if (d.error) setError(d.error);
        if (d.scope) setScope({ label: d.scope, everything: Boolean(d.everything) });
        setApps(d.applications ?? []);
        setOsAccepted(d.osAccepted ?? []);
        setPropolyOnly(d.propolyOnly ?? []);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
      window.clearTimeout(again);
    };
  }, []);

  const all = apps ?? [];
  /* The board is lets in progress; `all` keeps every application so ?open= can still find one. */
  const lets = useMemo(() => all.filter(isLet), [all]);
  const agents = useMemo(() => [...new Set(lets.map((a) => a.agent).filter((x): x is string => Boolean(x)))].sort(), [lets]);
  const mine = useMemo(() => (fAgent ? lets.filter((a) => a.agent === fAgent) : lets), [lets, fAgent]);
  /* Propoly names people its own way (Kirstie is Mulholland there, Wallington
     in the book), so the agent filter matches on the first name. */
  const propolyMine = useMemo(() => {
    if (!fAgent) return propolyOnly;
    const first = fAgent.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return propolyOnly.filter((p) => (p.agentName ?? "").trim().split(/\s+/)[0]?.toLowerCase() === first);
  }, [propolyOnly, fAgent]);
  /* Latest activity (James, 6 Oct 2026): the application somebody last did
     something on comes first - accepted, a comment, the PLC pack moving -
     rather than the newest created. Read when the button is first pressed. */
  const [byActivity, setByActivity] = useState(false);
  const [activityAt, setActivityAt] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!byActivity || activityAt) return;
    let live = true;
    fetch("/api/activity", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && d.ok && setActivityAt(d.applications ?? {}))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [byActivity, activityAt]);
  const rows = useMemo(() => {
    const picked =
      stage === "open"
        ? mine.filter(isOpen)
        : stage === "attention"
          ? mine.filter((a) => needsAttention(a) !== null)
          : stage === "closed"
            ? mine.filter((a) => a.closed)
            : mine.filter((a) => rexToMark(a) && !a.closed);
    if (!byActivity) return picked;
    const at = (a: Application) => {
      const ours = activityAt?.[String(a.id)] ?? "";
      const rex = a.updatedAt ? new Date(a.updatedAt * 1000).toISOString() : "";
      return ours > rex ? ours : rex;
    };
    return [...picked].sort((a, b) => at(b).localeCompare(at(a)));
  }, [mine, stage, byActivity, activityAt]);
  useEffect(() => { setPage(0); }, [stage, fAgent, byActivity]);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const shown = rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const counts = useMemo(() => ({
    open: mine.filter(isOpen).length + propolyMine.length,
    attention: mine.filter((a) => needsAttention(a) !== null).length,
    closed: mine.filter((a) => a.closed).length,
    by: (k: string) => (k === "rex" ? mine.filter((a) => rexToMark(a) && !a.closed).length + osAccepted.length : 0),
  }), [mine, osAccepted, propolyMine]);
  const open = all.find((a) => a.id === openId) ?? null;
  /* Asked for by name but not on the board (an accepted let whose move-in has
     passed is cut from it): fetch that one and add it, rather than opening
     nothing. */
  useEffect(() => {
    if (!openId || !apps || open) return;
    let live = true;
    fetch(`${APPS_URL}&include=${encodeURIComponent(openId)}&tests=0`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AppsAnswer) => {
        const hit = d.applications?.find((a) => a.id === openId);
        if (live && hit) setApps((cur) => (cur && !cur.some((a) => a.id === hit.id) ? [...cur, hit] : cur));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [openId, apps, open]);

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
            ? `${scope.label}'s lets in progress. An offer comes here once it is accepted; until then it is on its listing.`
            : "Every let in progress. An offer comes here once it is accepted; until then it is on its listing, still taking viewings."
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
          <span className="flex flex-wrap items-center gap-2">
            {/* Who should hear what, across every let (2 Oct 2026). */}
            <Link
              href="/applications/updates"
              className="flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
            >
              Customer updates
              {updatesOpen ? <span className="figures rounded-full bg-accent px-1.5 text-[10.5px] text-white">{updatesOpen}</span> : null}
            </Link>
            <GuideButton
              id="applications"
              className="flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
            />
          </span>
        }
      />

      <div className="mt-2 mb-4 flex items-center gap-1.5">
        {(["board", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] transition ${view === v ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-accent hover:bg-accent-soft"}`}
          >
            {v === "board" ? "Board" : "List"}
          </button>
        ))}
      </div>

      {view === "board" && (
        <LetsBoard
          everything={Boolean(scope?.everything)}
          matchApplication={(d) => {
            const lid = d.app.listingId ? Number(d.app.listingId) : null;
            const name = d.app.propertyName.trim().toLowerCase();
            const hit = (apps ?? []).find((a) => isLet(a) && ((lid != null && a.listingId === lid) || a.property.trim().toLowerCase() === name));
            return hit?.id ?? null;
          }}
          onOpenApplication={setOpenId}
          openDeal={boardDeal}
          onDealClosed={() => setBoardDeal(null)}
        />
      )}

      {view === "list" && (<>
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
            label: "In progress",
            icon: "analytics",
            count: apps === null ? null : counts.open,
            blurb: "Accepted, and working through to a tenancy",
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
            blurb: "Moved in, or it came off the market after it was accepted.",
          },
          {
            id: "attention" as const,
            label: "Needs attention",
            icon: "bell",
            count: apps === null ? null : counts.attention,
            blurb: "Rent over 40% of income, or adverse credit",
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
            { id: "offers" as const, icon: "coin", n: openOffers ?? 0, title: "Open offers", sub: "Waiting on a decision. They are on their listings - Listings, Offers in." },
            { id: "attention" as const, icon: "bell", n: counts.attention, title: "Need attention", sub: "Rent over 40% of income, or credit to talk about." },
            { id: "rex" as const, icon: "checklist", n: counts.by("rex"), title: "Mark in REX", sub: "Accepted here. REX still has to be marked accepted." },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => (f.id === "offers" ? (window.location.href = "/listings?stage=offers") : setStage(stage === f.id ? "open" : f.id))}
              className={`fade-up flex items-start gap-3 rounded-[22px] border p-4 text-left transition-colors ${stage === f.id ? "border-accent/70 bg-accent-soft/40" : "border-line/50 bg-white hover:border-ink/40"}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                <DoodleIcon name={f.icon} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="figures block text-[24px] leading-none">{apps === null || (f.id === "offers" && openOffers === null) ? "•" : f.n}</span>
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
                <DoodleIcon name="rocket" size={14} /> Keep lets moving
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Accept or decline offers on the listing. Once one is accepted it comes here, and every row opens the file with its next step.
              </p>
              {/* The gap sits OUTSIDE the button: pt-2 on the button padded its
                  inside and left it touching the text (19 Sep 2026). */}
              <div className="mt-auto pt-3">
                <button type="button" onClick={() => { setStage("open"); setFAgent(null); }} className={`${primary} w-full`}>
                  View every let <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4">
        <section className={`fade-up min-w-0 ${card} p-5`}>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="hand text-[17px]">
              {stage === "open"
                ? "Lets in progress"
                : stage === "attention"
                  ? "Needs attention"
                  : stage === "closed"
                    ? "Closed"
                    : STAGES.find((st) => st.key === stage)?.label}
              <span className="figures ml-2 text-[14px] text-muted">{rows.length + (stage === "open" ? propolyMine.length : 0)}</span>
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {stage !== "open" && (
                <button type="button" onClick={() => setStage("open")} className="text-[11.5px] text-muted underline transition-colors hover:text-ink">
                  Show every let
                </button>
              )}
              <button
                type="button"
                onClick={() => setByActivity((v) => !v)}
                aria-pressed={byActivity}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                  byActivity ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-accent hover:bg-accent-soft"
                }`}
              >
                Activity
              </button>
              {scope?.everything && agents.length > 1 && (
                <PickOne tone="pink" label="All agents" icon="user" options={agents.map((a) => ({ id: a, label: a }))} value={fAgent} onChange={setFAgent} />
              )}
            </div>
          </div>

          {/* Accepted in the OS, with no application in REX behind them yet
              (7 Oct 2026). Each opens its offer; the handover needs the REX
              application, which is still made by hand. */}
          {(stage === "open" || stage === "rex") && osAccepted.length > 0 && (
            <div className="mb-4 rounded-[18px] border border-accent/40 bg-accent-soft/30 p-4">
              <p className="text-[12.5px] font-semibold">Accepted here, not in REX yet</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">Create the application in REX and accept it there, so the handover can start.</p>
              <ul className="mt-2.5 divide-y divide-line/40">
                {osAccepted.map((o) => (
                  <li key={o.id}>
                    <Link href={`/offers/${encodeURIComponent(o.id)}`} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-white/60">
                      <span className="min-w-0 flex-1">
                        <span className="hand block truncate text-[13.5px]">{o.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {o.address} · accepted by {o.by} {new Date(o.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}
                        </span>
                      </span>
                      {o.amount != null && <span className="figures whitespace-nowrap text-[13px]">{gbp(o.amount)} pcm</span>}
                      <span aria-hidden className="text-[13px] text-muted/70">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Let through Propoly alone (9 Oct 2026): found a tenant without
              marketing it, so there is no application on the book. Shown from
              Propoly, under the agent Propoly names, and opened there. */}
          {stage === "open" && propolyMine.length > 0 && (
            <div className="mb-4 rounded-[18px] border border-line/60 bg-white p-4">
              <p className="text-[12.5px] font-semibold">Let Through Propoly</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                In Propoly with no application here, so they are shown from Propoly. Open one to see where it is up to.
              </p>
              <ul className="mt-2.5 divide-y divide-line/40">
                {propolyMine.map((p) => (
                  <li key={p.id}>
                    {/* Opens on the board, in place (10 Oct 2026). */}
                    <button
                      type="button"
                      onClick={() => { setBoardDeal(p.id); setView("board"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-page/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="hand block truncate text-[13.5px]">{p.address}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {p.tenants}
                          {p.status ? ` · ${p.status}` : ""}
                          {p.moveIn ? ` · moving in ${new Date(`${p.moveIn}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                          {scope?.everything && p.agentName ? ` · ${p.agentName}` : ""}
                        </span>
                      </span>
                      {p.offer != null && <span className="figures whitespace-nowrap text-[13px]">{gbp(p.offer)} pcm</span>}
                      <span className="hidden whitespace-nowrap rounded-full border border-line/60 px-2 py-0.5 text-[10.5px] text-muted sm:inline-block">Propoly</span>
                      <span aria-hidden className="text-[13px] text-muted/70">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {apps === null ? (
            <BoardSkeleton label="Loading applications…" count={6} />
          ) : error ? (
            <p className="py-10 text-center text-[12.5px] text-muted">{error}</p>
          ) : rows.length === 0 && !(stage === "rex" && osAccepted.length) && !(stage === "open" && propolyMine.length) ? (
            <p className="py-10 text-center text-[12.5px] text-muted">
              {stage === "attention"
                ? "Nothing needs a hand. Rare, and good."
                : stage === "open"
                  ? "No lets in progress. Accepted offers come here from their listing."
                  : "Nothing at this stage."}
            </p>
          ) : rows.length === 0 ? null : (
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
      </>)}

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
          // Only once the offer is accepted - in REX or here (9 Oct 2026: an
          // accept in the OS never showed it, and the file stalled). Before
          // that there is nothing to push, and offering it invites somebody
          // to jump the gun.
          aside={isLet(open) ? <HandoffPanel applicationId={open.id} /> : undefined}
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
            accepted on a home that is now let or withdrawn. Open covers every open application in REX, however old; the other tabs show the latest 200 as well.
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
