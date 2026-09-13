"use client";

// /pretenancy — Kirstie's move-in board (the pre-tenancy half of the duo
// admin login). A kanban of every live deal across ALL TLE agents: one
// column per stage, little card piles (address · tenant · agent) that scale
// to hundreds of move-ins a month. Clicking a card opens a near-full-screen
// workspace panel from the left — the CRM view: progression, checklist,
// tenant contacts and the full two-way notes thread with the agent, all
// visible without digging.
//
// Sits inside Kirstie's workspace (app/(os)/pre-tenancy/layout): the OS
// session and the workspace gate decide who sees it, so the board carries no
// login, no profile menu and no rail of its own - the stages run as a strip
// above the deals, and the workspace rail beside it is the navigation.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import PasswordInput from "@/components/business/PasswordInput";
import { NotesThread } from "@/components/business/DealNotes";
import DoodleIcon from "@/components/business/DoodleIcon";
import { BRAND } from "@/lib/business/brand";
import { formatGBP } from "@/lib/business/format";
import {
  CHECKLIST_ITEMS,
  DEPOSIT_SCHEMES,
  PROPOLY_APP_URL,
  PORTAL_STAGES,
  PORTAL_STAGE_BY_KEY,
  portalStageOf,
} from "@/lib/business/propoly-stages";
import type {
  DealEmail,
  DealMeta,
  DealNote,
  DealPortalOverlay,
  DealTask,
  MailboxStatus,
  UserProfile,
} from "@/lib/business/types";
import type { AgentApplication } from "@/lib/business/rex-stats";
import { rexListingUrl } from "@/lib/business/rex-links";
import { stageEvidence } from "@/lib/business/stage-evidence";
import { dealAlerts, type DealAlert } from "@/lib/business/deal-alerts";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import PreTenancyHero from "@/components/pretenancy/Hero";

/* ------------------------------- data shapes ------------------------------- */

interface BoardDeal {
  /** Move-in slipped 30+ days with nobody reactivating it. Kept out of the
   *  stage tabs entirely and gathered in Archive under the three-dot menu. */
  archived?: boolean;
  app: AgentApplication;
  statusKey: string;
  effectiveStatusKey: string;
  /** The OS's PLC pack for this address - what the PLC stage now reads. */
  plc?: { id: string; state: string; label: string; who: string; decidedBy: string | null; decidedAt: string | null } | null;
  /** The holding fee and deposit matched in PayProp to this deal's tenant. */
  money?: {
    holding: { status: string; amount: number; on: string | null; matchedBy: string; tenantName: string; note: string } | null;
    deposit: { status: string; amount: number; on: string | null; matchedBy: string; tenantName: string; depositId: string | null; note: string } | null;
  };
  agentName: string | null;
  agentEmail: string | null;
  portal: DealPortalOverlay;
  /** "Fully managed" | "Let only" | "Rent collect", from PayProp. null when
   *  PayProp has no unambiguous match — an absence, never a guess. */
  serviceLevel?: string | null;
  /** PLC/RLP from PayProp instructions. null = not recorded, never "no". */
  rlp?: { status: "protected" | "without"; evidence: string } | null;
  /** Live PayProp tenancy for this address (deposit ref + actual start). */
  tenancy?: { startDate: string | null; depositId: string | null } | null;
  /** Landlord ToB signing state from REX's DocuSign log. */
  tobStatus?: { status: string; sentAt: string | null; completedAt: string | null } | null;
  compliance?: {
    outstanding: number;
    expired: number;
    problems: string[];
    checked: boolean;
  } | null;
  /** Claim-vs-record verification checks, computed server-side. */
  flags?: Array<{ kind: string; label: string }>;
  /** Scheme detected from the deposit's PayProp payee — a suggestion only. */
  schemeSuggestion?: { scheme: string; evidence: string } | null;
  /** "Holding deposit" invoice in PayProp for this property. */
  holdingInvoice?: { amount: number; fromDate: string | null } | null;
  /** Rent that actually arrived, from PayProp's Owner rows. Evidence beside a
   *  stage, never a trigger for one — the address join is loose. */
  rentReceived?: { amount: number; on: string; paidOut: boolean } | null;
  /** A PayProp rent schedule starting — the independent check on move day. */
  rentSchedule?: { from: string; rent: number } | null;
  /** Rent owed on a tenancy that has already started. Never a pre-move-in
   *  invoice — the route drops those, or most of this board would read as
   *  in arrears. */
  arrears?: { owed: number; lastPayment: string | null } | null;
}

interface BoardSummary {
  /** Whether PayProp's money reports loaded at all. Without this, "no rent
   *  anywhere" and "not looked yet" render identically, and only one of them
   *  means anything. */
  moneyCoverage?: {
    loaded: boolean;
    months: string[];
    withRent: number;
    withSchedule: number;
    inArrears?: number;
    arrearsLoaded?: boolean;
    total: number;
  };
  pipelineTotal: number;
  byStage: { key: string; label: string; count: number }[];
  overdue: number;
  undated: number;
  completedMtd: number | null;
  forecastByMonth: Record<string, number> | null;
}

const enterAt = (ms: number) =>
  ({ "--enter-delay": `${ms}ms` }) as React.CSSProperties;

const STAGE_PILL: Record<string, string> = {
  deal_started: "border-line bg-page text-muted",
  holding_fee: "border-amber-200 bg-amber-50 text-amber-700",
  referencing: "border-sky-200 bg-sky-50 text-sky-700",
  plc: "border-cyan-200 bg-cyan-50 text-cyan-700",
  deposit: "border-violet-200 bg-violet-50 text-violet-700",
  tenancy_agreement: "border-indigo-200 bg-indigo-50 text-indigo-700",
  rent_payment: "border-emerald-200 bg-emerald-50 text-emerald-700",
  move_day: "border-green-300 bg-green-50 text-green-800",
  cancelled: "border-line bg-page text-muted",
};

// Per-stage visual identity for the category row, tabs and tiles: a coloured
// icon chip (soft bg + icon colour) and a solid dot colour. Colour-coded so
// the eye can track a deal's stage at a glance.
interface StageVisual {
  iconBg: string;
  iconText: string;
  dot: string;
}
const STAGE_VISUAL: Record<string, StageVisual> = {
  deal_started: { iconBg: "bg-slate-100", iconText: "text-slate-600", dot: "bg-slate-400" },
  holding_fee: { iconBg: "bg-amber-100", iconText: "text-amber-600", dot: "bg-amber-400" },
  referencing: { iconBg: "bg-sky-100", iconText: "text-sky-600", dot: "bg-sky-400" },
  plc: { iconBg: "bg-cyan-100", iconText: "text-cyan-600", dot: "bg-cyan-400" },
  deposit: { iconBg: "bg-violet-100", iconText: "text-violet-600", dot: "bg-violet-400" },
  tenancy_agreement: { iconBg: "bg-indigo-100", iconText: "text-indigo-600", dot: "bg-indigo-400" },
  rent_payment: { iconBg: "bg-emerald-100", iconText: "text-emerald-600", dot: "bg-emerald-400" },
  move_day: { iconBg: "bg-green-100", iconText: "text-green-700", dot: "bg-green-500" },
  cancelled: { iconBg: "bg-gray-100", iconText: "text-gray-400", dot: "bg-gray-300" },
  all: { iconBg: "bg-slate-100", iconText: "text-slate-600", dot: "bg-slate-400" },
  slipped: { iconBg: "bg-red-100", iconText: "text-red-600", dot: "bg-red-500" },
};
function stageVisual(key: string): StageVisual {
  return STAGE_VISUAL[key] ?? STAGE_VISUAL.deal_started;
}

// One simple stroke icon per stage. `d` paths are drawn inside a 24-box.

/** Which doodle stands for each stage. Same hand-drawn pack the rest of the
 *  portal uses, so the board stops looking like a different product. */
const STAGE_DOODLE: Record<string, string> = {
  deal_started: "rocket",
  holding_fee: "coin",
  referencing: "search",
  plc: "shield",
  deposit: "bank",
  tenancy_agreement: "file-contract",
  rent_payment: "wallet",
  move_day: "key",
  slipped: "clock",
  all: "grid",
  cancelled: "cross",
};

function StageIcon({ stageKey, size = 16 }: { stageKey: string; size?: number; className?: string }) {
  return <DoodleIcon name={STAGE_DOODLE[stageKey] ?? "rocket"} size={size} />;
}

/* --------------------------- movement detection --------------------------- */
// Red = needs the pre-tenancy team's attention (an unanswered agent message,
// or a slipped move-in). Green = recent movement that's ticking along fine.
// Both are derived from data we already hold — no read-state to maintain.

const RECENT_DAYS = 5;
const AWAITING_DAYS = 14;

function daysSince(iso?: string | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86_400_000;
}

function dealNeedsAttention(d: BoardDeal): boolean {
  if (isOverdue(d)) return true;
  const ln = d.portal.lastNote;
  // The agent messaged and the ball is in pre-tenancy's court.
  return !!ln && ln.authorRole === "agent" && daysSince(ln.at) <= AWAITING_DAYS;
}

function dealHasUpdate(d: BoardDeal): boolean {
  if (dealNeedsAttention(d)) return false;
  const noteRecent = d.portal.lastNote != null && daysSince(d.portal.lastNote.at) <= RECENT_DAYS;
  const movedRecent = d.portal.override != null && daysSince(d.portal.override.at) <= RECENT_DAYS;
  return noteRecent || movedRecent;
}

/** "red" | "green" | null for a set of deals (red wins). */
function movementOf(deals: BoardDeal[]): "red" | "green" | null {
  let green = false;
  for (const d of deals) {
    if (dealNeedsAttention(d)) return "red";
    if (dealHasUpdate(d)) green = true;
  }
  return green ? "green" : null;
}

function MovementDot({ kind, className = "" }: { kind: "red" | "green" | null; className?: string }) {
  if (!kind) return null;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${kind === "red" ? "bg-red-500" : "bg-green-500"} ${className}`}
      title={kind === "red" ? "Needs attention — unanswered message or slipped move-in" : "Recent movement"}
    />
  );
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stagePill(key: string): string {
  return STAGE_PILL[key] ?? "border-line bg-page text-muted";
}

function stageLabel(key: string): string {
  return PORTAL_STAGE_BY_KEY[key]?.label ?? key.replace(/_/g, " ");
}

const today = () => new Date().toISOString().slice(0, 10);

function isOverdue(d: BoardDeal): boolean {
  return (
    d.statusKey !== "cancelled" &&
    d.app.startDate != null &&
    d.app.startDate < today()
  );
}

// Old lingering deals (move-in — or, if undated, created — before 2026) are
// hidden for now: they're mostly stale records that should have completed.
// We'll reconcile them once PayProp is connected.
function isFrom2025(d: BoardDeal): boolean {
  const ref = d.app.startDate ?? d.app.dateReceived;
  return ref != null && ref < "2026-01-01";
}

// The dot strip shows how far through the 8-stage pipeline a deal is: e.g.
// Referencing is the 3rd stage → 3 of 8 filled.
function stageProgress(key: string): { done: number; total: number } {
  const total = PORTAL_STAGES.length;
  const idx = PORTAL_STAGES.findIndex((s) => s.key === key);
  return { done: idx >= 0 ? idx + 1 : 0, total };
}

/* --------------------------------- page --------------------------------- */

/**
 * Kirstie's view — pre-tenancy, ported from the TLE portal.
 *
 * The portal's own auth came with it and has been removed, exactly as it was
 * for Susan's figures: it called the portal's session endpoint and checked
 * isPreTenancy/isAdmin against the portal's env lists, so anybody signed into
 * TLE OS was judged on whether they were signed into a different product. The
 * inline login went with it — there is one sign-in for TLE OS and it is
 * /sign-in.
 *
 * Nothing is loosened. Middleware requires a session to reach any page, and
 * every route this screen calls requires the see:pretenancy capability.
 */
export default function PreTenancyPage() {
  const [user, setUser] = useState<UserProfile | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: { name?: string; email?: string } } | null) => {
        if (cancelled) return;
        setUser({
          name: j?.user?.name ?? "",
          email: j?.user?.email ?? "",
          isAdmin: true,
          isPreTenancy: true,
        } as UserProfile);
      })
      .catch(() => {
        if (!cancelled) setUser({ name: "", email: "", isAdmin: true, isPreTenancy: true } as UserProfile);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) return <WorkspaceLoading />;

  return <Board user={user} />;
}

function Board({ user }: { user: UserProfile }) {
  const [deals, setDeals] = useState<BoardDeal[] | null>(null);
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Which stage tab is active. Always opens on the first stage.
  const [tab, setTab] = useState<string>("deal_started");
  const [moreOpen, setMoreOpen] = useState(false);
  // Board layout: the columns (Board) or one stage as a grid of tiles (List).
  // Opens on the columns - James's mock of 12 Sep 2026 is the columns.
  const [view, setView] = useState<"tiles" | "kanban">("kanban");
  /* The chips over the columns: everything, what needs a look, what has
     not moved in a week, what moves in soon. A filter on top of `base`, so
     the columns thin rather than change shape. */
  const [chip, setChip] = useState<"all" | "attention" | "stalled" | "soon">("all");
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [tasksTodayOpen, setTasksTodayOpen] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [moveInsOpen, setMoveInsOpen] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);

  // "Tasks today" badge count — refreshed whenever the modal closes too,
  // so ticking things off updates the header straight away.
  const refreshTodayCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/my/deal-tasks?due=${today()}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { tasks: DealTask[] };
      setTodayCount(d.tasks.filter((t) => !t.done).length);
    } catch {
      // badge is decoration — ignore
    }
  }, []);

  useEffect(() => {
    void refreshTodayCount();
  }, [refreshTodayCount]);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/pretenancy/deals", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as {
        configured: boolean;
        deals: BoardDeal[] | null;
        summary: BoardSummary | null;
      };
      /* The local preview, with Propoly not connected: ?sample=1 draws the
         board on invented deals so the layout can be looked at. Never in
         production, and never when Propoly is there. */
      if (!d.configured && process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("sample") === "1") {
        const { SAMPLE_BOARD } = await import("@/lib/business/sample-board");
        setConfigured(true);
        setDeals(SAMPLE_BOARD.deals as unknown as BoardDeal[]);
        setSummary(SAMPLE_BOARD.summary as unknown as BoardSummary);
        setError(null);
        return true;
      }
      setConfigured(d.configured);
      if (d.configured && d.deals == null) {
        // Propoly cache still warming (first hit after a deploy) — keep the
        // skeletons up and let the retry loop try again shortly.
        return false;
      }
      setDeals(d.deals ?? []);
      /* ?deal=<uuid> opens that file on arrival: the feed's rows and the
         desktop alerts both land here. Only on the first load, so a later
         refresh does not yank a closed file back open. */
      try {
        const asked = new URLSearchParams(window.location.search).get("deal");
        if (asked && (d.deals ?? []).some((x: BoardDeal) => x.app.id === asked)) {
          setOpenId((cur) => cur ?? asked);
        }
      } catch {
        /* fine */
      }
      setSummary(d.summary);
      setError(null);
      return true;
    } catch {
      setError("Couldn't load the deal board — try a refresh in a minute.");
      return true; // hard error — stop retrying, the message is up
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      const settled = await load();
      // Gentle: Propoly rate-limits aggressively, so poll sparingly.
      if (!cancelled && !settled && attempts++ < 8) setTimeout(tick, 15_000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** Patch one deal's overlay/effective stage in place after a panel action. */
  const patchDeal = useCallback((id: string, patch: Partial<BoardDeal>) => {
    setDeals((prev) =>
      prev ? prev.map((d) => (d.app.id === id ? { ...d, ...patch } : d)) : prev
    );
  }, []);

  const agents = useMemo(() => {
    const names = new Set<string>();
    for (const d of deals ?? []) if (d.agentName) names.add(d.agentName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [deals]);

  // Base set: agent + search filters only. Stage is a TAB, not a filter.
  // 2025 deals are hidden for now (see isFrom2025).
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (deals ?? [])
      .filter((d) => !isFrom2025(d))
      .filter((d) => !d.archived)
      .filter((d) => d.agentName === agent || agent === "all")
      .filter((d) => {
        if (!needle) return true;
        const hay = [
          d.app.propertyName,
          d.app.locality,
          d.agentName ?? "",
          ...d.app.tenants.map((tn) => tn.name),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
  }, [deals, q, agent]);

  // Deals grouped by their effective stage (cancelled kept aside).
  const byStage = useMemo(() => {
    const m = new Map<string, BoardDeal[]>();
    for (const s of PORTAL_STAGES) m.set(s.key, []);
    const cancelled: BoardDeal[] = [];
    const slipped: BoardDeal[] = [];
    for (const d of base) {
      if (d.statusKey === "cancelled") {
        cancelled.push(d);
        continue;
      }
      if (isOverdue(d)) slipped.push(d);
      m.get(d.effectiveStatusKey)?.push(d);
    }
    return { byKey: m, cancelled, slipped };
  }, [base]);

  const activeCount = base.filter((d) => d.statusKey !== "cancelled").length;
  const undatedCount = base.filter(
    (d) => d.statusKey !== "cancelled" && d.app.startDate == null
  ).length;

  // Tabs: All + each stage + Slipped (+ Cancelled when toggled). Each carries
  // a count and a movement dot so you can see where there's action.
  const tabs = useMemo(() => {
    const sortDeals = (arr: BoardDeal[]) =>
      [...arr].sort((a, b) => {
        const oa = isOverdue(a) ? 0 : 1;
        const ob = isOverdue(b) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return (a.app.startDate ?? "9999").localeCompare(b.app.startDate ?? "9999");
      });
    const list: { key: string; label: string; deals: BoardDeal[]; movement: "red" | "green" | null }[] = [];
    // Stages first (always open on the first), then Slipped, then All, then
    // Cancelled when toggled.
    for (const s of PORTAL_STAGES) {
      const dl = byStage.byKey.get(s.key) ?? [];
      list.push({ key: s.key, label: s.label, deals: sortDeals(dl), movement: movementOf(dl) });
    }
    list.push({ key: "slipped", label: "Slipped", deals: sortDeals(byStage.slipped), movement: byStage.slipped.length ? "red" : null });
    const allActive = base.filter((d) => d.statusKey !== "cancelled");
    list.push({ key: "all", label: "All", deals: sortDeals(allActive), movement: movementOf(allActive) });
    // Archive is built from the RAW list, not `base` — base filters archived
    // deals out, which is the whole point of it.
    const archived = (deals ?? [])
      .filter((d) => d.archived)
      .filter((d) => d.agentName === agent || agent === "all");
    list.push({ key: "archive", label: "Archive", deals: sortDeals(archived), movement: null });
    if (showCancelled) {
      list.push({ key: "cancelled", label: "Cancelled", deals: byStage.cancelled, movement: null });
    }
    return list;
  }, [base, byStage, showCancelled, deals, agent]);

  // Move-ins inside the next 14 days, soonest first. Off `base`, so archived
  // and filtered-out deals never appear — the dock must agree with the board.
  const upcomingMoveIns = useMemo(() => {
    const from = today();
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    return base
      .filter((d) => d.statusKey !== "cancelled")
      .filter((d) => d.app.startDate != null && d.app.startDate >= from && d.app.startDate <= to)
      .sort((a, b) => (a.app.startDate ?? "").localeCompare(b.app.startDate ?? ""));
  }, [base]);

  /* WHAT NEEDS A LOOK — decided in one place.
     Built off base for the same reason the move-ins are: a dock that can
     disagree with the board behind it teaches people to trust neither.

     It used to filter on the server's `flags`, which meant the chip, the panel
     and (later) the digest each had their own idea of what "wrong" means. Now
     all three read lib/business/deal-alerts, which reads the same
     stageEvidence the Progression column renders. If the panel says a deposit
     is missing, the chip counts it and the email will say the same thing.

     Requires the money to have loaded — a cold PayProp cache would otherwise
     announce that every deal on the board has lost its deposit and its rent. */
  const alerts = useMemo(
    () =>
      dealAlerts(
        (base ?? []).map((d) => ({ ...d, startDate: d.app.startDate })),
        { moneyLoaded: summary?.moneyCoverage?.loaded ?? false }
      ),
    [base, summary]
  );
  /* Only the ones asking for attention. Rent arriving is good news and belongs
     in the digest, not in a chip that means "something is wrong". */
  const attention = useMemo(() => alerts.filter((a) => a.tone === "attention"), [alerts]);
  const flaggedDeals = useMemo(() => {
    const ids = new Set(attention.map((a) => a.dealId));
    return (base ?? []).filter((d) => ids.has(d.app.id));
  }, [base, attention]);

  /* Nothing has happened on the deal for a week: no note, no stage move,
     and it did not arrive this week. The same idea as the dashboard's
     48-hour queue, at the board's pace. */
  const stalled = useMemo(
    () => base.filter((d) => d.statusKey !== "cancelled" && daysSince(lastActivity(d)) >= STALLED_DAYS),
    [base]
  );
  const thisMonth = useMemo(() => {
    const ym = today().slice(0, 7);
    return base.filter((d) => d.statusKey !== "cancelled" && d.app.startDate?.startsWith(ym));
  }, [base]);
  const flaggedIds = useMemo(() => new Set(flaggedDeals.map((d) => d.app.id)), [flaggedDeals]);
  const stalledIds = useMemo(() => new Set(stalled.map((d) => d.app.id)), [stalled]);
  const soonIds = useMemo(() => new Set(upcomingMoveIns.map((d) => d.app.id)), [upcomingMoveIns]);
  const passesChip = useCallback(
    (d: BoardDeal) =>
      chip === "all" ? true : chip === "attention" ? flaggedIds.has(d.app.id) : chip === "stalled" ? stalledIds.has(d.app.id) : soonIds.has(d.app.id),
    [chip, flaggedIds, stalledIds, soonIds]
  );

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0];
  const open = openId ? (deals ?? []).find((d) => d.app.id === openId) ?? null : null;

  return (
    <div className="type-admin flex flex-col gap-5 pb-8">
      {/* ── the head: title, the line, the sofa ── */}
      <PreTenancyHero
        title="Pre-tenancy pipeline"
        blurb="Every deal from application to move-in, across every agent, with what needs attention first."
        photo="/brand/living-room.jpg"
        photoPosition="60% 40%"
        line="Smoother move-ins, happier homes"
      >
        <button type="button" onClick={() => setMoveInsOpen(true)} className="btn-press flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-black/30">
          <span className="text-accent-dark"><DoodleIcon name="calendar" size={14} /></span>
          Moving soon
          {upcomingMoveIns.length ? <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[11px]">{upcomingMoveIns.length}</span> : null}
        </button>
        <button type="button" onClick={() => setTasksTodayOpen(true)} className="btn-press flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-black/30">
          <span className="text-accent-dark"><DoodleIcon name="checklist" size={14} /></span>
          Tasks
          {todayCount ? <span className="rounded-full bg-accent-dark px-1.5 py-0.5 text-[11px] text-white">{todayCount}</span> : null}
        </button>
        <Link href="/pre-tenancy/feed" className="btn-press flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-black/30">
          <span className="text-accent-dark"><DoodleIcon name="bell" size={14} /></span>
          What moved
        </Link>
        <button type="button" onClick={() => setMailboxOpen(true)} className="btn-press flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-black/30" title="Connect your mailbox for the Emails tab">
          <span className="text-accent-dark"><DoodleIcon name="mail" size={14} /></span>
          Mailbox
        </button>
        <Link href="/pre-tenancy/knowledge?guide=board" className="flex items-center gap-2 rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-ink/40">
          <span className="text-accent-dark"><DoodleIcon name="note" size={14} /></span>
          How this works
        </Link>
      </PreTenancyHero>

      {!configured ? (
        <div className="card p-5 text-[13px] text-muted">
          Propoly isn&apos;t connected yet - the deal board appears as soon as the integration keys are in place.
        </div>
      ) : null}
      {error ? <div className="card p-5 text-[13px] text-muted">{error}</div> : null}

      {deals == null && !error ? (
        <WorkspaceLoading
          height="min-h-[calc(100vh-460px)]"
          label="Fetching the pipeline"
          note="Propoly, REX and PayProp are all being asked at once - the slowest one decides."
          slowNote="REX is usually the slow one. It is still going."
        />
      ) : deals ? (
        <>
          {/* ── the four numbers, and the view ── */}
          <div className="fade-up grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <StatTile icon="home" tone="green" value={activeCount} label="In progression" onClick={() => setChip("all")} on={chip === "all"} />
            <StatTile icon="key" tone="green" value={thisMonth.length} label="Moving this month" onClick={() => setMoveInsOpen(true)} />
            <StatTile icon="calendar" tone="red" value={todayCount ?? 0} label="Due today" onClick={() => setTasksTodayOpen(true)} />
            <StatTile icon="clock" tone="red" value={stalled.length} label={`Stalled (${STALLED_DAYS}+ days)`} onClick={() => setChip(chip === "stalled" ? "all" : "stalled")} on={chip === "stalled"} />
            <div className="flex items-center gap-2 xl:justify-end">
              <div className="flex items-center rounded-full border border-line bg-card p-1">
                <button type="button" onClick={() => setView("kanban")} className={`btn-press flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${view === "kanban" ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"}`}>
                  <DoodleIcon name="grid" size={14} /> Board
                </button>
                <button type="button" onClick={() => setView("tiles")} className={`btn-press flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${view === "tiles" ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"}`}>
                  <DoodleIcon name="list" size={14} /> List
                </button>
              </div>
              {/* Slipped, All, Archive and Cancelled: the views that are
                  not a stage, behind the three dots. */}
              <div className="relative">
                <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-label="More views" className={`btn-press flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card transition ${moreOpen ? "text-ink" : "text-muted hover:text-ink"}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx={5} cy={12} r={1.6} /><circle cx={12} cy={12} r={1.6} /><circle cx={19} cy={12} r={1.6} /></svg>
                </button>
                {moreOpen ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                    <div className="menu-pop absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-line bg-card p-1.5 shadow-lg">
                      {[tabs.find((t) => t.key === "all"), tabs.find((t) => t.key === "slipped"), tabs.find((t) => t.key === "archive")]
                        .filter((t): t is (typeof tabs)[number] => !!t)
                        .map((t) => (
                          <button key={t.key} type="button" onClick={() => { setTab(t.key); setView("tiles"); setMoreOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-page ${t.key === activeTab.key && view === "tiles" ? "font-semibold text-ink" : "text-ink"}`}>
                            <span className="flex items-center gap-2">{t.label}<MovementDot kind={t.movement} /></span>
                            <span className="text-[11px] text-muted">{t.deals.length}</span>
                          </button>
                        ))}
                      <div className="my-1 border-t border-line" />
                      <button type="button" onClick={() => { if (showCancelled && activeTab.key === "cancelled") setTab("deal_started"); setShowCancelled((v) => !v); setMoreOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] text-ink transition hover:bg-page">
                        {showCancelled ? "Hide cancelled" : "Show cancelled"}
                        <span className="text-[11px] text-muted">{byStage.cancelled.length}</span>
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* ── today's focus: the deals asking for a look ── */}
          {attention.length > 0 ? (
            <section className="fade-up card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[#9d4340]"><DoodleIcon name="target" size={17} /></span>
                  <div>
                    <h2 className="text-[17px] font-bold leading-tight">Today&apos;s focus</h2>
                    <p className="mt-0.5 text-[12px] text-muted">Deals that need your attention today.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setChecksOpen(true)} className="flex shrink-0 items-center gap-1 pt-1 text-[12px] font-semibold text-muted transition-colors hover:text-ink">
                  View all ({attention.length}) <DoodleIcon name="trend-up" size={11} />
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {attention.slice(0, 3).map((al) => {
                  const d = (deals ?? []).find((x) => x.app.id === al.dealId);
                  if (!d) return null;
                  const lead = d.app.tenants.find((t) => t.isPrimary) ?? d.app.tenants[0];
                  return (
                    <button key={al.key} type="button" onClick={() => setOpenId(d.app.id)} className="btn-press flex items-start gap-3 rounded-2xl border border-line/70 p-2.5 text-left transition hover:border-black/25">
                      <Photo src={d.app.image} className="h-[72px] w-24 shrink-0 rounded-xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{d.app.propertyName}</span>
                        <span className="block truncate text-[12px] text-muted">{lead ? lead.name : d.agentName ?? ""}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${RED_PILL}`}>{stageLabel(al.stageKey)}</span>
                          <span className="line-clamp-1 text-[11.5px] text-[#9d4340]">{al.text.split(" — ")[1] ?? al.text}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── the chips, the search and the agent ── */}
          <div className="fade-up flex flex-wrap items-center gap-2">
            <Chip on={chip === "all"} onClick={() => setChip("all")} count={activeCount}>All properties</Chip>
            <Chip on={chip === "attention"} onClick={() => setChip(chip === "attention" ? "all" : "attention")} count={flaggedDeals.length} tone="red">Needs attention</Chip>
            <Chip on={chip === "stalled"} onClick={() => setChip(chip === "stalled" ? "all" : "stalled")} count={stalled.length} tone="red">Stalled</Chip>
            <Chip on={chip === "soon"} onClick={() => setChip(chip === "soon" ? "all" : "soon")} count={upcomingMoveIns.length} tone="green">Moving soon</Chip>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property, tenant or agent…" className="w-56 rounded-full border border-line bg-card px-4 py-2 text-[12.5px] outline-none transition focus:border-black/30" />
              <select value={agent} onChange={(e) => setAgent(e.target.value)} className="rounded-full border border-line bg-card px-3.5 py-2 text-[12.5px] outline-none">
                <option value="all">All agents</option>
                {agents.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
          </div>

          {view === "kanban" ? (
            /* ── the columns: one per stage ── */
            <section className="fade-up -mx-1 overflow-x-auto px-1 pb-4">
              <div className="flex items-start gap-3">
                {[...PORTAL_STAGES.map((s) => s.key), ...(showCancelled ? ["cancelled"] : [])].map((key) => {
                  const col = tabs.find((t) => t.key === key);
                  const dealsIn = (col?.deals ?? []).filter(passesChip);
                  return (
                    <div key={key} className={`flex w-[218px] shrink-0 flex-col rounded-[18px] p-2 ${COLUMN_TINT[key] ?? "bg-panel"}`}>
                      <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                        <span className="truncate text-[13px] font-semibold text-ink">{stageLabel(key)}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <MovementDot kind={col?.movement ?? null} />
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-ink">{dealsIn.length}</span>
                        </span>
                      </div>
                      <div className="space-y-2">
                        {dealsIn.map((d) => (<DealCard key={d.app.id} d={d} stageKey={key} onOpen={() => setOpenId(d.app.id)} />))}
                        {dealsIn.length === 0 ? <p className="rounded-xl border border-dashed border-line/70 px-2 py-6 text-center text-[11px] text-muted">Nothing here</p> : null}
                      </div>
                      <a href={PROPOLY_APP_URL} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-line/70 bg-white/70 py-2 text-[12px] font-semibold text-muted transition hover:text-ink">
                        + Add deal
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            /* ── the list: one stage at a time, as tiles ── */
            <section className="fade-up">
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {tabs.filter((t) => PORTAL_STAGES.some((s) => s.key === t.key) || t.key === activeTab.key).map((t) => {
                  const activeT = t.key === activeTab.key;
                  return (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`relative flex items-center rounded-full border px-3 py-1.5 text-left text-[12.5px] transition-colors ${activeT ? "border-transparent bg-accent-soft font-semibold text-ink" : "border-line/70 text-muted hover:border-ink/40 hover:text-ink"}`}>
                      <span className={`relative shrink-0 ${activeT ? "text-accent-dark" : "text-muted"}`}>
                        <StageIcon stageKey={t.key} size={15} />
                        <MovementDot kind={t.movement} className="absolute -right-1 -top-1 ring-2 ring-page" />
                      </span>
                      <span className="ml-2 whitespace-nowrap">{t.label}</span>
                      <span className={`ml-2 shrink-0 text-[11px] ${activeT ? "text-accent-dark" : "text-muted"}`}>{t.deals.filter(passesChip).length}</span>
                    </button>
                  );
                })}
              </div>
              {activeTab.deals.filter(passesChip).length === 0 ? (
                <div className="card card-flat p-12 text-center text-[13px] text-muted">Nothing in {activeTab.label.toLowerCase()} right now.</div>
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {activeTab.deals.filter(passesChip).map((d) => (<DealTile key={d.app.id} d={d} onOpen={() => setOpenId(d.app.id)} />))}
                </div>
              )}
            </section>
          )}
        </>
      ) : null}

      {open ? (
        <DealWorkspace
          deal={open}
          onClose={() => {
            setOpenId(null);
            void refreshTodayCount();
          }}
          onPatched={(patch) => patchDeal(open.app.id, patch)}
          onOpenMailbox={() => setMailboxOpen(true)}
          moneyLoaded={summary?.moneyCoverage?.loaded ?? false}
        />
      ) : null}

      {checksOpen ? (
        <ChecksModal
          deals={flaggedDeals}
          alerts={attention}
          onClose={() => setChecksOpen(false)}
          onOpenDeal={(id: string) => {
            setChecksOpen(false);
            setOpenId(id);
          }}
        />
      ) : null}

      {moveInsOpen ? (
        <MoveInsSoonModal
          deals={upcomingMoveIns}
          onClose={() => setMoveInsOpen(false)}
          onOpenDeal={(id: string) => {
            setMoveInsOpen(false);
            setOpenId(id);
          }}
        />
      ) : null}

      {mailboxOpen ? (
        <MailboxModal user={user} onClose={() => setMailboxOpen(false)} />
      ) : null}
      {tasksTodayOpen ? (
        <TasksTodayModal
          onClose={() => {
            setTasksTodayOpen(false);
            void refreshTodayCount();
          }}
          onOpenDeal={(dealId) => {
            setTasksTodayOpen(false);
            setOpenId(dealId);
          }}
        />
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-right">
      {/* Handwritten, to answer the title across the row. Only the figure:
          handwriting at 10px uppercase is a smudge, so the label stays in
          Montserrat where it can still be read. */}
      <div className="written tnum text-[27px] leading-none text-ink">{value}</div>
      <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}

/* ------------------------------- deal tile ------------------------------- */
// A card per deal: colour-coded stage icon + property address (the icon says
// the stage, so no pill). Tenant & agent, the rent/move-in line, and a footer
// showing pipeline progress (dots filled to the current stage) + notes. A
// movement dot flags anything new or updated at a glance.

/* ── the board's small pieces ─────────────────────────────────────────── */

const STALLED_DAYS = 7;
const GREEN_PILL = "bg-[#f1f4ec] text-[#56634a]";
const RED_PILL = "bg-[#fdefec] text-[#9d4340]";
const AMBER_PILL = "bg-amber-50 text-amber-700";
const QUIET_PILL = "bg-page text-muted";

/** A soft tint per column, so the eye can tell where it is along the row. */
const COLUMN_TINT: Record<string, string> = {
  deal_started: "bg-[#fdefec]/70",
  holding_fee: "bg-amber-50/70",
  referencing: "bg-orange-50/70",
  plc: "bg-[#f1f4ec]",
  deposit: "bg-sky-50/70",
  tenancy_agreement: "bg-[#f1f4ec]",
  rent_payment: "bg-[#f1f4ec]",
  move_day: "bg-[#fdefec]/70",
  cancelled: "bg-panel",
};

/** When something last happened on the deal: a note, a stage move, or it arriving. */
function lastActivity(d: BoardDeal): string | null {
  const cands = [d.portal.lastNote?.at ?? null, d.portal.override?.at ?? null, d.app.dateReceived].filter((x): x is string => !!x);
  return cands.sort().at(-1) ?? null;
}

function agoLabel(iso: string | null): string {
  const days = daysSince(iso);
  if (!Number.isFinite(days)) return "";
  if (days < 1) return "Today";
  const n = Math.floor(days);
  return n === 1 ? "1 day ago" : `${n} days ago`;
}

/**
 * The one line on a card that says where the deal is, in a colour that says
 * whether that is fine. Green is done or received; amber is waiting on
 * somebody; red is slipped or the agent waiting on us. The same evidence
 * the panel's Progression column reads, in three words.
 */
function cardStatus(d: BoardDeal, stageKey: string): { text: string; tone: string } {
  if (isOverdue(d)) return { text: "Move-in slipped", tone: RED_PILL };
  const ln = d.portal.lastNote;
  if (ln && ln.authorRole === "agent" && daysSince(ln.at) <= AWAITING_DAYS) return { text: "Agent waiting on you", tone: RED_PILL };
  const start = d.app.startDate;
  switch (stageKey) {
    case "deal_started": return { text: "Application received", tone: QUIET_PILL };
    case "holding_fee": return d.money?.holding ? { text: "Fee received", tone: GREEN_PILL } : d.holdingInvoice ? { text: "Fee invoiced", tone: AMBER_PILL } : { text: "Awaiting fee", tone: AMBER_PILL };
    case "referencing": return { text: "References in progress", tone: AMBER_PILL };
    case "plc": return d.plc ? { text: d.plc.label, tone: d.plc.state === "approved" ? GREEN_PILL : AMBER_PILL } : { text: "PLC in progress", tone: AMBER_PILL };
    case "deposit": return d.money?.deposit ? { text: "Deposit received", tone: GREEN_PILL } : { text: "Awaiting deposit", tone: AMBER_PILL };
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
    case "cancelled": return { text: "Cancelled", tone: QUIET_PILL };
    default: return { text: stageLabel(stageKey), tone: QUIET_PILL };
  }
}

function Photo({ src, className = "" }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-page text-muted ${className}`}><DoodleIcon name="home-1" size={22} /></span>
  );
}

function StatTile({ icon, tone, value, label, onClick, on = false }: { icon: string; tone: "green" | "red"; value: number | string; label: string; onClick: () => void; on?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`btn-press flex items-center gap-4 rounded-[18px] border bg-card px-4 py-3.5 text-left transition ${on ? "border-ink/40" : "border-line/70 hover:border-black/25"}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone === "green" ? GREEN_PILL : RED_PILL}`}><DoodleIcon name={icon} size={18} /></span>
      <span className="min-w-0">
        <span className="figures block text-[24px] font-bold leading-none">{value}</span>
        <span className={`mt-1 block text-[12px] leading-tight ${tone === "red" && typeof value === "number" && value > 0 ? "text-[#9d4340]" : "text-muted"}`}>{label}</span>
      </span>
    </button>
  );
}

function Chip({ on, onClick, count, tone = "neutral", children }: { on: boolean; onClick: () => void; count: number; tone?: "neutral" | "red" | "green"; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`btn-press flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${on ? "border-transparent bg-accent-soft text-ink" : "border-line/70 bg-card text-muted hover:text-ink"}`}>
      {children}
      <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] ${on ? "bg-white/80 text-ink" : tone === "red" && count > 0 ? RED_PILL : tone === "green" && count > 0 ? GREEN_PILL : "bg-page text-muted"}`}>{count}</span>
    </button>
  );
}

/** A deal in a column: the photo, the address, whose it is, the one status
 *  line in colour, and when it last moved. */
function DealCard({ d, stageKey, onOpen }: { d: BoardDeal; stageKey: string; onOpen: () => void }) {
  const lead = d.app.tenants.find((t) => t.isPrimary) ?? d.app.tenants[0];
  const st = cardStatus(d, stageKey);
  return (
    <button type="button" onClick={onOpen} className="btn-press group flex w-full flex-col overflow-hidden rounded-2xl border border-line/60 bg-card p-2 text-left transition hover:border-black/25">
      <Photo src={d.app.image} className="aspect-[16/10] w-full rounded-xl" />
      <div className="px-1 pb-1 pt-2.5">
        <p className="truncate text-[13px] font-semibold leading-tight">{d.app.propertyName}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{lead ? lead.name : d.agentName ?? "No tenant recorded"}{d.app.tenants.length > 1 ? ` +${d.app.tenants.length - 1}` : ""}</p>
        <span className={`mt-2 inline-block max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.tone}`}>{st.text}</span>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>{agoLabel(lastActivity(d))}</span>
          {d.portal.notesCount > 0 ? <span className="flex items-center gap-1"><DoodleIcon name="message" size={11} />{d.portal.notesCount}</span> : null}
        </div>
      </div>
    </button>
  );
}

function DealTile({ d, onOpen }: { d: BoardDeal; onOpen: () => void }) {
  const attn = dealNeedsAttention(d);
  const upd = dealHasUpdate(d);

  // Stripped back on purpose. The tile sits INSIDE a stage column, so the
  // stage, the progress dots and the stage icon were all repeating what the
  // column already says. What is left is what tells one tile from another:
  // the photo, the address, whose deal it is, and whether it needs a look.
  return (
    <button
      type="button"
      onClick={onOpen}
      className="btn-press group flex w-full flex-col overflow-hidden rounded-2xl border border-line text-left transition hover:border-black/25"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/[0.03]">
        {d.app.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={d.app.image}
            alt=""
            aria-hidden
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted">
            <DoodleIcon name="home-1" size={30} />
          </span>
        )}
        {attn || upd ? (
          <span
            title={attn ? "Needs attention" : "Updated recently"}
            className={`absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
              attn ? "bg-accent" : "bg-emerald-500"
            }`}
          />
        ) : null}
      </div>
      <div className="px-3.5 py-3">
        <p className="truncate text-[13px] font-semibold leading-tight">{d.app.propertyName}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{d.agentName ?? "Unassigned"}</p>
      </div>
    </button>
  );
}

/* ------------------------------ workspace panel ------------------------------ */
// The CRM view: slides out from the left and takes ~85% of the screen.
// Three working columns — the deal itself, the progression + checklist,
// and the notes thread at full height so nothing needs digging out.

function DealWorkspace({
  deal,
  onClose,
  onPatched,
  onOpenMailbox,
  moneyLoaded,
}: {
  deal: BoardDeal;
  onClose: () => void;
  onPatched: (patch: Partial<BoardDeal>) => void;
  onOpenMailbox: () => void;
  /* Passed down rather than inferred. "No rent against anything" is a finding
     when the reports loaded and noise when they did not, and the panel has no
     way to tell the difference on its own. */
  moneyLoaded: boolean;
}) {
  const [notes, setNotes] = useState<DealNote[] | null>(null);
  const [privateNotes, setPrivateNotes] = useState<DealNote[] | null>(null);
  const [meta, setMeta] = useState<DealMeta | null>(null);
  const [effective, setEffective] = useState(deal.effectiveStatusKey);
  const [busy, setBusy] = useState(false);
  /* The sign-off panel: what the records say, then her confirm. */
  const [signingOff, setSigningOff] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The checklist drops out of the Outstanding tile rather than living on the
  // page. It is a thing you go and do, not a thing you read.
  const [checklistOpen, setChecklistOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fetchNotes = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/deals/${deal.app.id}/notes`, { cache: "no-store" });
      if (!res.ok) return false;
      const d = (await res.json()) as {
        notes?: DealNote[];
        privateNotes?: DealNote[];
        meta?: DealMeta;
        effectiveStatusKey?: string;
      };
      setNotes(d.notes ?? []);
      setPrivateNotes(d.privateNotes ?? []);
      setMeta(d.meta ?? null);
      if (d.effectiveStatusKey) setEffective(d.effectiveStatusKey);
      return true;
    } catch {
      return false;
    }
  }, [deal.app.id]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    // Retry a couple of times — right after a deploy the Propoly cache can
    // still be warming, and the route answers 503 until it's ready.
    const tick = async () => {
      const ok = await fetchNotes();
      if (cancelled) return;
      if (!ok && attempts++ < 5) {
        setTimeout(tick, 4000);
      } else if (!ok) {
        setNotes([]);
        setPrivateNotes([]);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [fetchNotes]);

  /** Push a fresh meta + effective stage into the panel AND the board card. */
  function applyMeta(m: DealMeta, eff: string) {
    setMeta(m);
    setEffective(eff);
    const done = CHECKLIST_ITEMS.filter((i) => m.checklist[i.key]?.done).length;
    onPatched({
      effectiveStatusKey: eff,
      portal: {
        ...deal.portal,
        override:
          m.stageOverride && eff !== portalStageOf(deal.statusKey)
            ? { stageKey: m.stageOverride, by: m.stageBy ?? "", at: m.stageAt ?? "" }
            : null,
        checklistDone: done,
        checklistTotal: CHECKLIST_ITEMS.length,
      },
    });
  }

  async function postMeta(body: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/deals/${deal.app.id}/meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as {
        meta?: DealMeta;
        effectiveStatusKey?: string;
        error?: string;
      };
      if (!res.ok || !d.meta) throw new Error(d.error ?? "That didn't save.");
      // Fall back to the panel's CURRENT effective stage, never the raw
      // Propoly status — raw statuses are not portal stage keys, and pushing
      // one into the board made the card vanish from every column (review).
      applyMeta(d.meta, d.effectiveStatusKey ?? effective);
      void fetchNotes(); // pick up the auto-logged activity line
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  /** Post a shared activity note or a private one; returns success. */
  async function sendNote(text: string, kind: "note" | "private"): Promise<boolean> {
    if (!text.trim() || busy) return false;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/deals/${deal.app.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), kind }),
      });
      const d = (await res.json()) as { note?: DealNote; error?: string };
      if (!res.ok || !d.note) throw new Error(d.error ?? "Couldn't add the note.");
      if (kind === "private") {
        setPrivateNotes((prev) => [...(prev ?? []), d.note!]);
        return true;
      }
      const next = [...(notes ?? []), d.note];
      setNotes(next);
      // Card badge counts the human conversation only, not system lines.
      const humanCount = next.filter((n) => (n.kind ?? "note") === "note").length;
      onPatched({
        portal: {
          ...deal.portal,
          notesCount: humanCount,
          lastNote: {
            text: d.note.text,
            authorName: d.note.authorName,
            authorRole: d.note.authorRole,
            at: d.note.createdAt,
          },
        },
      });
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't add the note.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const cancelled = deal.statusKey === "cancelled";
  const p = deal.app.propoly;
  const currentIdx = PORTAL_STAGES.findIndex((s) => s.key === effective);
  const moved = effective !== portalStageOf(deal.statusKey);
  const checklistDone = meta
    ? CHECKLIST_ITEMS.filter((i) => meta.checklist[i.key]?.done).length
    : 0;

  const lead = deal.app.tenants.find((t) => t.isPrimary) ?? deal.app.tenants[0];
  const daysToGo =
    deal.app.startDate != null
      ? Math.round((new Date(deal.app.startDate).getTime() - new Date(today()).getTime()) / 86_400_000)
      : null;
  const outstanding = CHECKLIST_ITEMS.length - checklistDone;
  const dealAge =
    deal.app.dateReceived != null
      ? Math.round((new Date(today()).getTime() - new Date(deal.app.dateReceived).getTime()) / 86_400_000)
      : null;
  const current = currentIdx >= 0 ? PORTAL_STAGES[currentIdx] : null;
  const depositValue = meta?.depositScheme?.startsWith("Flatfair")
    ? "Flatfair"
    : meta?.depositScheme
      ? p?.deposit != null
        ? formatGBP(p.deposit)
        : "—"
      : p?.depositReplacement
        ? "Flatfair"
        : p?.deposit != null
          ? formatGBP(p.deposit)
          : "—";

  /* The drawer, to James's mock of 13 Sep 2026: from the right, the head with
     the photograph and the two systems the deal lives in, four tiles, then
     the property, the progress and the working tabs side by side, and the
     three people along the foot. The page scrolls as one; only the tabs keep
     their own scroll, because a long thread should not push the people off
     the bottom. */
  return (
    <div className="fixed inset-0 z-50 bg-[#2b201d]/40" onClick={onClose}>
      <div
        className="drawer-in fixed inset-y-0 right-0 flex w-full max-w-[1320px] flex-col overflow-hidden bg-page shadow-[-20px_0_60px_-30px_rgba(40,25,20,0.5)] lg:w-[86vw] lg:rounded-l-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pb-8 pt-5 sm:px-7">
            {/* ── the head ── */}
            <div className="relative flex items-start gap-5">
              <Photo src={deal.app.image} className="hidden h-[150px] w-[160px] shrink-0 rounded-2xl sm:flex" />
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="truncate text-[32px] font-bold leading-tight">{deal.app.propertyName}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted">
                  <DoodleIcon name="home-1" size={14} />
                  {deal.app.locality}
                </p>
                <p className="mt-2 text-[13.5px]">
                  <span className="text-muted">Agent</span> <span className="ml-1 font-semibold">{deal.agentName ?? "Unassigned"}</span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${cancelled ? "bg-page text-muted" : "bg-[#fdefec] text-[#9d4340]"}`}>
                {(cancelled ? "Cancelled" : stageLabel(effective)).toUpperCase()}
              </span>
              {/* Propoly first. It carries tenancy_service_level on every
                  deal and always has — the PayProp lookup below it is the
                  fallback for a deal Propoly has not labelled, and for the
                  managed book, where there is no Propoly deal at all. */}
              {p?.service || deal.serviceLevel ? (
                <span className="rounded-full bg-page px-2.5 py-0.5 text-[10.5px] font-semibold text-muted">
                  {(p?.service ?? deal.serviceLevel ?? "").toUpperCase()}
                </span>
              ) : null}
              {/* PLC (RLP) from PayProp's instructions, exact-join or absent.
                  No pill at all when it isn't recorded — an empty state here
                  must not read as "no cover". */}
              {deal.rlp ? (
                <span
                  title={deal.rlp.evidence}
                  className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${
                    deal.rlp.status === "protected"
                      ? "border-transparent bg-[#f1f4ec] text-[#56634a]"
                      : "border-line bg-page text-muted"
                  }`}
                >
                  {deal.rlp.status === "protected" ? "PLC PROTECTED" : "NO PLC"}
                </span>
              ) : null}
              {/* A deposit registered in PayProp against this property's live
                  tenancy — its ledger reference in the tooltip. */}
              {deal.tenancy?.depositId ? (
                <span
                  title={`PayProp deposit ${deal.tenancy.depositId}${
                    deal.tenancy.startDate ? ` · tenancy from ${deal.tenancy.startDate}` : ""
                  }`}
                  className="rounded-full bg-page px-2.5 py-0.5 text-[10.5px] font-semibold text-muted"
                >
                  DEPOSIT HELD
                </span>
              ) : null}
              {/* Landlord Terms of Business, from REX's DocuSign log.
                  Three-way on the known vocabulary: completed is green,
                  sent/partially_signed amber, and anything else — failed,
                  voided, statuses REX invents later — gets its own
                  needs-a-look pill rather than masquerading as "sent"
                  (review find). */}
              {/* Can this property legally be let? Kirstie's board is the last
                  place anyone looks before a tenancy starts, so a missing gas
                  certificate belongs HERE, not two pages away. Silent when the
                  address match wasn't confident or REX didn't finish — a
                  guessed property's certificates are worse than none. */}
              {deal.compliance?.checked ? (
                deal.compliance.outstanding === 0 ? (
                  <span
                    title="Every required certificate is on file and in date"
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700"
                  >
                    COMPLIANT
                  </span>
                ) : (
                  <span
                    title={deal.compliance.problems.join(", ")}
                    className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${
                      deal.compliance.expired > 0
                        ? "border-transparent bg-[#fdefec] text-[#9d4340]"
                        : "border-transparent bg-amber-50 text-amber-700"
                    }`}
                  >
                    {deal.compliance.expired > 0
                      ? `${deal.compliance.expired} EXPIRED`
                      : `${deal.compliance.outstanding} COMPLIANCE`}
                  </span>
                )
              ) : null}

              {deal.tobStatus ? (
                deal.tobStatus.status === "completed" ? (
                  <span
                    title={
                      fmtDate(deal.tobStatus.completedAt)
                        ? `Signed ${fmtDate(deal.tobStatus.completedAt)}`
                        : "Signed"
                    }
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700"
                  >
                    TOB SIGNED
                  </span>
                ) : deal.tobStatus.status === "sent" ||
                  deal.tobStatus.status === "partially_signed" ? (
                  <span
                    title="Sent, not yet signed"
                    className="rounded-full border border-transparent bg-amber-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-amber-700"
                  >
                    TOB SENT
                  </span>
                ) : (
                  <span
                    title={`DocuSign envelope status: ${deal.tobStatus.status} — needs a look`}
                    className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-red-700"
                  >
                    TOB — CHECK
                  </span>
                )
              ) : null}

                </div>
              </div>
              {/* The street, and the line: the drawer's own masthead. */}
              <div aria-hidden className="pointer-events-none absolute bottom-0 right-[300px] hidden w-[360px] xl:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/illustrations/houses-row.webp" alt="" className="art w-full opacity-90" />
                <p className="absolute -right-[150px] top-2 w-[150px] text-[17px] leading-tight text-accent-dark" style={{ fontFamily: "var(--font-shantell), cursive", transform: "rotate(-6deg)" }}>
                  Great homes, happier tenancies
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <a href={PROPOLY_APP_URL} target="_blank" rel="noopener noreferrer" className="btn-press hidden rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:border-black/30 sm:block">
                  Open in Propoly ↗
                </a>
                {deal.app.listingId ? (
                  <a href={rexListingUrl(deal.app.listingId, "rental")} target="_blank" rel="noopener noreferrer" className="btn-press hidden rounded-xl bg-accent-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-ink transition hover:bg-accent-soft/70 sm:block">
                    Open in REX ↗
                  </a>
                ) : null}
                <button type="button" onClick={onOpenMailbox} title="Connect your mailbox for the Emails tab" className="btn-press flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-card text-muted transition hover:text-ink">
                  <DoodleIcon name="mail" size={15} />
                </button>
                <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>

        {/* ---- banners ---- */}
        {(moved && meta?.stageBy) ||
        actionError ||
        cancelled ||
        deal.archived ||
        (deal.flags ?? []).some((f) => f.kind === "scheme-missing") ? (
          <div className="mt-4 space-y-2">
            {cancelled ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
                This deal was cancelled before completion.
              </p>
            ) : null}
            {deal.archived ? (
              <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[12px] text-muted">
                Archived — the move-in date slipped more than 30 days ago.
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void postMeta({ unarchived: true })}
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  Put it back on the board
                </button>
              </p>
            ) : null}
            {moved && meta?.stageBy ? (
              <p className="rounded-xl border border-transparent bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
                Moved to <span className="font-semibold">{stageLabel(effective)}</span> by{" "}
                {meta.stageBy}
                {meta.stageAt ? ` · ${fmtDateTime(meta.stageAt)}` : ""} — Propoly itself still
                shows {stageLabel(portalStageOf(deal.statusKey))}.
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void postMeta({ stage: null })}
                  className="ml-2 font-semibold underline underline-offset-2"
                >
                  Reset to live
                </button>
              </p>
            ) : null}
            {actionError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
                {actionError}
              </p>
            ) : null}
            {/* Claim-vs-record checks. Not stored anywhere — fixing the data
                (tick the scheme, sort the PayProp record) clears the banner
                on the next load, which is the whole design. */}
            {/* Only the checks the Progression column cannot make. The banner
                used to repeat all three flags directly above a stage list that
                now says two of them per stage, in more detail and with the
                evidence attached — the same fact stated twice in two places
                reads as two problems. `scheme-missing` stays because nothing
                upstream records which scheme holds a deposit: we are the
                register, so only we can notice the gap. */}
            {(deal.flags ?? []).filter((f) => f.kind === "scheme-missing").map((f) => (
              <p
                key={f.kind}
                className="rounded-xl border border-transparent bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800"
              >
                {f.label}
              </p>
            ))}
          </div>
        ) : null}


            {/* ── the four things she looks for first ── */}
            <div className="relative mt-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <DrawerTile
                  icon="calendar"
                  tone={daysToGo != null && daysToGo < 0 && effective !== "move_day" ? "red" : "green"}
                  label="Move-in date"
                  value={fmtDate(deal.app.startDate) ?? "No date"}
                  note={daysToGo == null ? "Not set yet" : daysToGo < 0 ? `${Math.abs(daysToGo)} days ago` : daysToGo === 0 ? "Today" : `In ${daysToGo} days`}
                />
                <DrawerTile icon="trend-up" tone="green" label="Stage" value={cancelled ? "Cancelled" : stageLabel(effective)} note={currentIdx >= 0 ? `${currentIdx + 1} of ${PORTAL_STAGES.length}` : undefined} />
                <DrawerTile
                  icon="checklist"
                  tone={outstanding > 0 ? "red" : "green"}
                  label="Outstanding"
                  value={String(outstanding)}
                  note={outstanding === 0 ? "All done" : `of ${CHECKLIST_ITEMS.length} steps`}
                  onClick={() => setChecklistOpen((v) => !v)}
                  open={checklistOpen}
                />
                <DrawerTile icon="clock" tone="green" label="Deal age" value={dealAge == null ? "—" : `${dealAge} days`} note={fmtDate(deal.app.dateReceived) ? `Since ${fmtDate(deal.app.dateReceived)}` : undefined} />
              </div>

              {/* The checklist drops out of the Outstanding tile. Absolutely
                  positioned, so opening it never reflows the columns. */}
              {checklistOpen ? (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setChecklistOpen(false)} />
                  <div className="menu-pop absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-line bg-page p-4 shadow-xl">
                    <div className="mb-3 flex items-center gap-2">
                      <h3 className="text-[13px] font-bold">Pre-tenancy checklist</h3>
                      <span className="text-[11px] text-muted">{checklistDone}/{CHECKLIST_ITEMS.length} done</span>
                      <button type="button" onClick={() => setChecklistOpen(false)} aria-label="Close the checklist" className="ml-auto rounded-full p-1 text-muted transition hover:text-ink">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </div>
              <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                {CHECKLIST_ITEMS.map((item) => {
                  const tick = meta?.checklist[item.key];
                  return (
                    <label
                      key={item.key}
                      className="flex cursor-pointer select-none items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-black/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={tick?.done ?? false}
                        disabled={busy || meta == null}
                        onChange={(e) =>
                          void postMeta({ checklist: { key: item.key, done: e.target.checked } })
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-[#E31F36]"
                      />
                      <span className="min-w-0 text-[12.5px] leading-5">
                        <span className={tick?.done ? "text-muted line-through" : ""}>
                          {item.label}
                        </span>
                        {tick?.done ? (
                          <span className="ml-1.5 whitespace-nowrap text-[10px] text-muted">
                            {tick.by.split(" ")[0]} · {fmtDate(tick.at)}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* ── the property, the progress, the work ── */}
            <div className="mt-5 grid gap-4 lg:grid-cols-12">
              <section className="card lg:col-span-3 p-5">
                <DrawerHead icon="home-1" title="Property" />
                <Photo src={deal.app.image} className="mt-4 aspect-[16/11] w-full rounded-xl" />
                <p className="mt-3 text-[17px] font-bold leading-tight">{deal.app.propertyName}</p>
                <p className="text-[12.5px] text-muted">{deal.app.locality}</p>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
                  <NumberRow label="Rent (pcm)" value={deal.app.offer != null ? formatGBP(deal.app.offer) : "—"} big />
                  <NumberRow label="Deposit" value={depositValue} big />
                  <NumberRow label="Holding fee" value={p?.holdingFee != null ? formatGBP(p.holdingFee) : "—"} big />
                  <NumberRow label="Move-in date" value={fmtDate(deal.app.startDate) ?? "TBC"} big alert={isOverdue(deal)} sub={daysToGo == null ? undefined : daysToGo < 0 ? `${Math.abs(daysToGo)} days ago` : daysToGo === 0 ? "Today" : `${daysToGo} days to go`} />
                  <NumberRow label="Deal received" value={fmtDate(deal.app.dateReceived) ?? "—"} />
                  {deal.app.hasPets ? <NumberRow label="Pets" value="Yes" /> : null}
                </dl>
              {/* Which scheme holds the deposit. The portal IS the register —
                  no upstream system records this (probed 2 Aug 2026), which is
                  why it's an input rather than a readout. Ruled like every
                  other input on the surface. */}
              <div className="mt-3 border-t border-line pt-2.5">
                <label className="flex items-center gap-2">
                  <span className="shrink-0 text-[11px] text-muted">Deposit scheme</span>
                  <select
                    value={meta?.depositScheme ?? ""}
                    disabled={busy || meta == null}
                    onChange={(e) =>
                      void postMeta({ depositScheme: e.target.value || null })
                    }
                    className="min-w-0 flex-1 border-0 border-b-[1.5px] border-ink/25 bg-transparent px-1 py-1 text-[12.5px] text-ink outline-none transition focus:border-ink/70 disabled:opacity-50"
                  >
                    <option value="">Not recorded</option>
                    {DEPOSIT_SCHEMES.map((sch) => (
                      <option key={sch} value={sch}>
                        {sch}
                      </option>
                    ))}
                  </select>
                </label>
                {p?.depositReplacement && !meta?.depositScheme ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Propoly&apos;s clauses say Flatfair — no cash deposit to register.
                  </p>
                ) : null}
                {/* The auto-detected scheme, from who PayProp pays the deposit
                    to. A suggestion Kirstie confirms with one click — never
                    written on its own, because the payee join is address-
                    matched and she is the register. */}
                {!meta?.depositScheme && deal.schemeSuggestion ? (
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                    <span className="min-w-0 truncate">
                      PayProp pays this deposit to {deal.schemeSuggestion.evidence}
                    </span>
                    <button
                      type="button"
                      disabled={busy || meta == null}
                      onClick={() =>
                        void postMeta({ depositScheme: deal.schemeSuggestion!.scheme })
                      }
                      className="shrink-0 font-semibold text-ink underline decoration-dotted underline-offset-2 transition hover:text-accent disabled:opacity-50"
                    >
                      Record as {deal.schemeSuggestion.scheme}
                    </button>
                  </p>
                ) : null}
                {deal.holdingInvoice ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Holding deposit invoiced in PayProp: {formatGBP(deal.holdingInvoice.amount)}
                    {deal.holdingInvoice.fromDate ? ` (${fmtDate(deal.holdingInvoice.fromDate)})` : ""}
                  </p>
                ) : null}
              </div>
              </section>

              <section className="card flex flex-col lg:col-span-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <DrawerHead icon="info" title="Tenancy progress" />
                  {!cancelled && currentIdx >= 0 ? <span className="rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-muted">{currentIdx + 1} of {PORTAL_STAGES.length}</span> : null}
                </div>
                <ol className="mt-4">
                {PORTAL_STAGES.map((s, i) => {
                  const state = cancelled
                    ? "off"
                    : i < currentIdx
                      ? "done"
                      : i === currentIdx
                        ? "current"
                        : "todo";
                  const last = i === PORTAL_STAGES.length - 1;
                  return (
                    <li key={s.key} className="group/stage flex gap-3">
                      <div className="flex flex-col items-center">
                        {state === "done" ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f4ec]">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#56634a]" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : state === "current" ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fdefec]">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#c0504a]" />
                          </span>
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-page">
                            <span className="h-2 w-2 rounded-full bg-gray-300" />
                          </span>
                        )}
                        {!last ? (
                          <span className={`w-px flex-1 ${state === "done" ? "bg-[#b3bea5]" : "bg-line"}`} />
                        ) : null}
                      </div>
                      {/* "Move here" shares the label's line and only shows on
                          hover. On its own row it added ~20px to all eight
                          stages — 160px of height for a control used once a
                          deal. Still focusable, so it isn't mouse-only. */}
                      <div className={`min-w-0 flex-1 ${last ? "pb-1" : "pb-2"}`}>
                        <p className={`flex items-baseline gap-2 text-[13.5px] font-medium leading-6 ${state === "todo" || state === "off" ? "text-muted" : "text-ink"}`}>
                          <span className="truncate">{s.label}</span>
                          {state === "current" && !cancelled ? (
                            <span className="shrink-0 rounded-full bg-[#fdefec] px-2 py-0.5 text-[10.5px] font-semibold text-[#9d4340]">
                              Current
                            </span>
                          ) : null}
                          {/* Only Move day moves by hand (4 Sep). The other
                              seven are read from the PLC pack, the deposit and
                              PayProp, so a button here would be overruled on
                              the next load. */}
                          {!cancelled && state !== "current" && s.key === "move_day" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setSigningOff((v) => !v)}
                              className="ml-auto shrink-0 rounded-full border border-ink/25 px-2.5 py-0.5 text-[11px] font-semibold text-ink transition hover:bg-ink hover:text-white disabled:opacity-50"
                            >
                              Ready to move in
                            </button>
                          ) : null}
                        </p>
                        {/* ── The sign-off ──
                            The one act that says compliant and ready. The panel
                            reads the records back first - the pack, the deposit,
                            the rent - so she confirms with the facts in front of
                            her and not from memory. Short of something, it says
                            so and still lets her: the judgement is hers. */}
                        {signingOff && s.key === "move_day" && !cancelled ? (
                          <div className="mt-2 rounded-xl border border-line bg-card p-3 text-[12px]">
                            <p className="font-semibold">Sign this property off as compliant and ready to move in?</p>
                            <ul className="mt-2 space-y-1">
                              {[
                                deal.plc
                                  ? [deal.plc.state === "approved", `PLC pack ${deal.plc.state === "approved" ? "approved" : deal.plc.label.toLowerCase()}`]
                                  : meta?.checklist?.plc_outside?.done
                                    ? [true, "PLC checked outside the OS"]
                                    : [false, "No PLC pack in the OS"],
                                deal.money?.deposit
                                  ? [deal.money.deposit.status !== "paid", `Deposit ${deal.money.deposit.status} in PayProp`]
                                  : meta?.checklist?.deposit_registered?.done || meta?.depositScheme
                                    ? [true, "Deposit recorded on the file"]
                                    : deal.app.propoly?.depositReplacement
                                      ? [false, "Flatfair deal - not ticked done"]
                                      : [false, "No deposit seen"],
                                deal.rentReceived ? [true, "First rent received in PayProp"] : [false, "No rent seen in PayProp yet"],
                              ].map(([ok, text], i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-600" : "bg-amber-500"}`} />
                                  <span className={ok ? "" : "text-amber-800"}>{String(text)}</span>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[11px] text-muted">
                              Your name goes on it. The agent is told, and the landlord and tenant see Move-in day on their portals.
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setSigningOff(false);
                                  void postMeta({ stage: "move_day" });
                                }}
                                className="rounded-full bg-ink px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50"
                              >
                                Sign off
                              </button>
                              <button type="button" onClick={() => setSigningOff(false)} className="rounded-full border border-line px-3 py-1 text-[11.5px] text-muted">
                                Not yet
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {state === "current" ? (
                          <p className="mt-0.5 text-[12px] text-muted">{s.blurb}</p>
                        ) : null}
                        {/* WHAT AN OUTSIDE SYSTEM SAYS about this stage, under
                            the stage itself rather than in a panel of its own.
                            The pipeline records what somebody claims; this line
                            records what PayProp, REX or DocuSign can show, and
                            the two disagreeing is the thing worth seeing.

                            Amber only once the pipeline has PASSED the stage —
                            a deal at Holding fee has no deposit registered and
                            should not, and eight warnings on every new deal
                            would train her to stop reading them.

                            Not drawn on a cancelled deal: a dead file does not
                            need chasing, and the checks would all read as
                            failures. */}
                        {!cancelled ? (() => {
                          /* PLC reads the OS's own pack, which is what now
                             moves the stage. The RLP line it used to show was
                             about a different thing (rent protection) and sat
                             under the wrong heading. */
                          /* Money seen in PayProp against THIS tenant outranks
                             the address-keyed invoice guess: it is the payment,
                             matched by email, reference or name, and rechecked
                             each tick until reconciled. */
                          const moneyLine = (f: { status: string; amount: number; on: string | null; matchedBy: string; tenantName: string; depositId?: string | null } | null, what: string) =>
                            f
                              ? {
                                  tone: "ok" as const,
                                  text: `${what} £${Math.round(f.amount).toLocaleString("en-GB")} ${
                                    f.status === "held" ? `held by PayProp${f.depositId ? ` (${f.depositId})` : ""}` : f.status === "reconciled" ? `reconciled${f.on ? ` ${fmtDate(f.on)}` : ""}` : `paid${f.on ? ` ${fmtDate(f.on)}` : ""}, not yet reconciled`
                                  } - ${f.tenantName}, matched by ${f.matchedBy}.`,
                                }
                              : null;
                          const ev =
                            s.key === "holding_fee" && moneyLine(deal.money?.holding ?? null, "Holding fee")
                              ? moneyLine(deal.money?.holding ?? null, "Holding fee")!
                              : s.key === "deposit" && moneyLine(deal.money?.deposit ?? null, "Deposit")
                                ? moneyLine(deal.money?.deposit ?? null, "Deposit")!
                                : s.key === "plc"
                              ? deal.plc
                                ? {
                                    tone: (deal.plc.state === "approved" ? "ok" : deal.plc.state === "declined" ? "warn" : "none") as "ok" | "warn" | "none",
                                    text:
                                      deal.plc.state === "approved"
                                        ? `Pack approved${deal.plc.decidedBy ? ` by ${deal.plc.decidedBy}` : ""}${deal.plc.decidedAt ? ` · ${fmtDate(deal.plc.decidedAt)}` : ""}.`
                                        : `Pack ${deal.plc.label.toLowerCase()} · ${deal.plc.who}.`,
                                  }
                                : meta?.checklist?.plc_outside?.done
                                  ? { tone: "ok" as const, text: `Checked outside the OS by ${meta.checklist.plc_outside.by}${meta.checklist.plc_outside.at ? ` · ${fmtDate(meta.checklist.plc_outside.at)}` : ""}.` }
                                  : { tone: "none" as const, text: "No PLC pack in the OS yet. The agent starts it from the application, or tick \"PLC checked outside the OS\" on the checklist." }
                              : stageEvidence(
                                  s.key,
                                  { ...deal, startDate: deal.app.startDate },
                                  { reached: i <= currentIdx, moneyLoaded }
                                );
                          return (
                            <p
                              className={`mt-1 flex items-start gap-1.5 text-[11.5px] leading-relaxed ${
                                ev.tone === "warn" ? "text-amber-700" : "text-muted"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                  ev.tone === "ok"
                                    ? "bg-green-500"
                                    : ev.tone === "warn"
                                      ? "bg-amber-500"
                                      : "bg-gray-300"
                                }`}
                              />
                              <span className="min-w-0">{ev.text}</span>
                            </p>
                          );
                        })() : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
                {/* Next up: the current stage, in her words, and the checklist behind it. */}
                {!cancelled && current ? (
                  <div className="mt-4 flex items-center gap-4 rounded-2xl bg-accent-soft p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#9d4340]"><DoodleIcon name="calendar" size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Next up</p>
                      <p className="text-[14px] font-bold leading-tight">{current.label}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink/70">{current.blurb}</p>
                    </div>
                    <button type="button" onClick={() => setChecklistOpen(true)} className="btn-press shrink-0 rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white">
                      View details
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="flex min-h-0 flex-col lg:col-span-5 lg:h-[640px]">
                <WorkTabs
                  deal={deal}
                  notes={notes}
                  privateNotes={privateNotes}
                  busy={busy}
                  onSend={sendNote}
                  onOpenMailbox={onOpenMailbox}
                  onActivityChanged={() => void fetchNotes()}
                />
              </section>
            </div>

            {/* ── the people ── */}
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <PersonCard label={deal.app.tenants.length > 1 ? `Tenants (${deal.app.tenants.length})` : "Tenant"} icon="user">
                {deal.app.tenants.length ? (
                  deal.app.tenants.map((t, i) => (
                    <div key={i} className={i > 0 ? "mt-2 border-t border-line/60 pt-2" : ""}>
                      <p className="text-[15px] font-bold leading-tight">{t.name}{t.isPrimary && deal.app.tenants.length > 1 ? <span className="ml-2 rounded-full bg-page px-1.5 py-0.5 text-[9.5px] font-semibold text-muted">LEAD</span> : null}</p>
                      {t.email ? <a href={`mailto:${t.email}`} className="block truncate text-[12.5px] text-muted hover:text-ink">{t.email}</a> : null}
                      {t.phone ? <a href={`tel:${t.phone}`} className="block text-[12.5px] text-muted hover:text-ink">{t.phone}</a> : null}
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] text-muted">No tenant details recorded yet.</p>
                )}
              </PersonCard>
              <PersonCard label="Agent" icon="user">
                <p className="text-[15px] font-bold leading-tight">{deal.agentName ?? "Unassigned"}</p>
                {deal.agentEmail ? <a href={`mailto:${deal.agentEmail}`} className="block truncate text-[12.5px] text-muted hover:text-ink">{deal.agentEmail}</a> : null}
              </PersonCard>
              <PersonCard label="Landlord" icon="user">
                {p?.landlord ? (
                  <>
                    <p className="text-[15px] font-bold leading-tight">{p.landlord.name ?? "—"}</p>
                    {p.landlord.email ? <a href={`mailto:${p.landlord.email}`} className="block truncate text-[12.5px] text-muted hover:text-ink">{p.landlord.email}</a> : null}
                    {p.landlord.phone ? <a href={`tel:${p.landlord.phone}`} className="block text-[12.5px] text-muted hover:text-ink">{p.landlord.phone}</a> : null}
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Not on the deal in Propoly.</p>
                )}
              </PersonCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A heading inside the drawer's cards: the round icon and the title. */
function DrawerHead({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="flex items-center gap-2.5 text-[15px] font-bold">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={14} /></span>
      {title}
    </h3>
  );
}

function DrawerTile({ icon, tone, label, value, note, onClick, open }: { icon: string; tone: "green" | "red"; label: string; value: string; note?: string; onClick?: () => void; open?: boolean }) {
  const body = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone === "green" ? GREEN_PILL : RED_PILL}`}><DoodleIcon name={icon} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-muted">{label}</span>
        <span className={`block truncate text-[19px] font-bold leading-tight ${tone === "red" ? "text-[#9d4340]" : "text-ink"}`}>{value}</span>
        {note ? <span className="block text-[11.5px] text-muted">{note}</span> : null}
      </span>
      {onClick ? (
        <svg className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      ) : null}
    </>
  );
  const cls = "flex w-full items-center gap-3.5 rounded-[18px] border bg-card px-4 py-3.5 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={open} title="Show the pre-tenancy checklist" className={`btn-press ${cls} transition ${open ? "border-ink/40" : "border-line/70 hover:border-black/25"}`}>{body}</button>
  ) : (
    <div className={`${cls} border-line/70`}>{body}</div>
  );
}

function PersonCard({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="card flex items-start gap-3.5 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-muted">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </section>
  );
}
function NumberRow({
  label,
  value,
  big = false,
  alert = false,
  sub,
}: {
  label: string;
  value: string;
  big?: boolean;
  alert?: boolean;
  /** A quiet line under the value: "11 days to go". */
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] leading-4 text-muted">{label}</dt>
      <dd
        className={`truncate ${big ? "text-[17px] font-bold leading-6" : "text-[13px] font-medium leading-5"} ${
          alert ? "text-[#9d4340]" : "text-ink"
        }`}
      >
        {value}
        {alert ? " · slipped" : ""}
      </dd>
      {sub ? <dd className="text-[11px] text-muted">{sub}</dd> : null}
    </div>
  );
}

/* ------------------------------ work tabs ------------------------------ */
// Activity (everyone sees) · Emails (from her connected mailbox) ·
// Notes (private, only the author) · Tasks (follow-ups with dates).

type WorkTab = "activity" | "emails" | "notes" | "tasks";

function WorkTabs({
  deal,
  notes,
  privateNotes,
  busy,
  onSend,
  onOpenMailbox,
  onActivityChanged,
}: {
  deal: BoardDeal;
  notes: DealNote[] | null;
  privateNotes: DealNote[] | null;
  busy: boolean;
  onSend: (text: string, kind: "note" | "private") => Promise<boolean>;
  onOpenMailbox: () => void;
  onActivityChanged: () => void;
}) {
  const [tab, setTab] = useState<WorkTab>("activity");

  const tabs: { key: WorkTab; label: string }[] = [
    { key: "activity", label: "Activity" },
    { key: "notes", label: "Notes" },
    { key: "tasks", label: "Tasks" },
    { key: "emails", label: "Emails" },
  ];

  return (
    // Outline only, like every other panel in the file. It was the last white
    // box on a page-coloured surface, which made it read as a different kind
    // of thing from the panels stacked beside it.
    <div className="card flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-line px-2 pt-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative px-3.5 py-2.5 text-[12.5px] font-semibold transition ${
              tab === t.key ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {tab === t.key ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent-dark" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {tab === "activity" ? (
          <>
            <div className="min-h-0 flex-1">
              <NotesThread notes={notes} maxHeightClass="max-h-full lg:h-[calc(100%-8px)]" />
            </div>
            <Composer
              busy={busy}
              placeholder={`Message ${deal.agentName ? deal.agentName.split(" ")[0] : "the agent"} — they see it instantly…`}
              onSend={(text) => onSend(text, "note")}
            />
          </>
        ) : tab === "emails" ? (
          <EmailsTab deal={deal} onOpenMailbox={onOpenMailbox} />
        ) : tab === "notes" ? (
          <>
            {/* Was a bg-page pill sitting on a bg-page panel — an invisible
                box. Just the line now. */}
            <p className="px-1 pb-2 text-[11px] text-muted">
              Personal notes — nobody else can see these, not even the agent.
            </p>
            <div className="min-h-0 flex-1">
              <NotesThread
                notes={privateNotes}
                maxHeightClass="max-h-full lg:h-[calc(100%-8px)]"
              />
            </div>
            <Composer
              busy={busy}
              placeholder="Add a private note — just for you…"
              onSend={(text) => onSend(text, "private")}
            />
          </>
        ) : (
          <TasksTab deal={deal} onActivityChanged={onActivityChanged} />
        )}
      </div>
    </div>
  );
}

function Composer({
  busy,
  placeholder,
  onSend,
}: {
  busy: boolean;
  placeholder: string;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");

  async function submit() {
    if (!draft.trim()) return;
    if (await onSend(draft)) setDraft("");
  }

  return (
    // No rule above it. The field already draws its own line underneath, and
    // a divider 40px above that read as a double line.
    <div className="mt-3 flex gap-2 pt-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 border-b-[1.5px] border-ink/25 bg-transparent px-1 py-2.5 text-[13px] outline-none transition focus:border-ink/70"
      />
      <button
        type="button"
        disabled={busy || !draft.trim()}
        onClick={() => void submit()}
        className="btn-press shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-50"
        style={{ background: BRAND.accent }}
      >
        Send
      </button>
    </div>
  );
}

/* -------------------------------- emails -------------------------------- */

// Document types we can spot being discussed and suggest attaching. Matched
// against recent message text so the composer can nudge "Attach the EPC".
const DOC_HINTS: { key: string; label: string; re: RegExp }[] = [
  { key: "epc", label: "EPC certificate", re: /\bepc\b|energy performance/i },
  { key: "gas", label: "Gas safety certificate", re: /\bgas\b|cp12|gas safety/i },
  { key: "eicr", label: "EICR", re: /\beicr\b|electric(al)? (report|cert|safety)/i },
  { key: "references", label: "References", re: /referenc/i },
  { key: "agreement", label: "Tenancy agreement", re: /tenancy agreement|\bast\b|contract/i },
  { key: "inventory", label: "Inventory", re: /inventory|check[- ]?in/i },
  { key: "id", label: "ID / Right to Rent", re: /right to rent|\bid\b|passport|visa/i },
];

interface PendingAttachment {
  filename: string;
  content: string; // base64
  size: number;
}

function EmailsTab({ deal, onOpenMailbox }: { deal: BoardDeal; onOpenMailbox: () => void }) {
  const [state, setState] = useState<{
    loading: boolean;
    connected: boolean;
    noAgentEmail?: boolean;
    error?: string;
    emails: DealEmail[];
    agentName?: string | null;
    agentEmail?: string | null;
  }>({ loading: true, connected: true, emails: [] });

  // Composer
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const agentName = state.agentName || deal.agentName || "the agent";
  const agentFirst = agentName.split(" ")[0];

  const load = useCallback(() => {
    fetch(`/api/deals/${deal.app.id}/emails`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: typeof state) =>
        setState({
          loading: false,
          connected: d.connected !== false,
          noAgentEmail: d.noAgentEmail,
          error: d.error,
          emails: d.emails ?? [],
          agentName: d.agentName,
          agentEmail: d.agentEmail,
        })
      )
      .catch(() =>
        setState((s) => ({ ...s, loading: false, error: "Couldn't load emails just now." }))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.app.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the log pinned to the newest message.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.emails, composing]);

  // Suggested docs — from keywords in the most recent inbound messages.
  const suggestions = useMemo(() => {
    const text = state.emails
      .filter((e) => e.direction === "in")
      .slice(0, 5)
      .map((e) => `${e.subject} ${e.body}`)
      .join(" ");
    return DOC_HINTS.filter((h) => h.re.test(text));
  }, [state.emails]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const next: PendingAttachment[] = [];
    for (const f of Array.from(files)) {
      const buf = await f.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      next.push({ filename: f.name, content: btoa(bin), size: f.size });
    }
    setAttachments((prev) => [...prev, ...next]);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/deals/${deal.app.id}/email-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
        }),
      });
      const d = (await res.json()) as { ok?: boolean; email?: DealEmail; error?: string };
      if (!res.ok || !d.email) throw new Error(d.error ?? "Couldn't send.");
      setState((s) => ({ ...s, emails: [...s.emails, d.email!] }));
      setDraft("");
      setAttachments([]);
      setComposing(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  if (state.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-10 animate-pulse rounded-2xl bg-page ${i % 2 ? "ml-10" : "mr-10"}`} />
        ))}
        <p className="pt-1 text-center text-[11px] text-muted">Loading your emails with {agentFirst}…</p>
      </div>
    );
  }

  if (!state.connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="max-w-xs text-[13px] text-muted">
          Connect your email to message {agentFirst} here — it sends from your mailbox and
          keeps a chat log against the deal.
        </p>
        <button
          type="button"
          onClick={onOpenMailbox}
          className="btn-press rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: BRAND.accent }}
        >
          Connect your email
        </button>
      </div>
    );
  }

  if (state.noAgentEmail) {
    return (
      <p className="rounded-xl bg-page px-4 py-3 text-[12px] text-muted">
        No email address on file for {agentName}, so there&apos;s no one to message yet.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* who we're emailing */}
      <div className="flex items-center gap-2 border-b border-line pb-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold accent-text">
          {agentName.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold">Emailing {agentName}</p>
          <p className="text-[11px] text-muted">{state.agentEmail}</p>
        </div>
      </div>

      {/* chat log */}
      <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3">
        {state.error ? (
          <p className="rounded-xl bg-page px-4 py-3 text-[12px] text-muted">{state.error}</p>
        ) : state.emails.length === 0 ? (
          // The one place in this panel with room to spare, so it gets the
          // house illustration. Empty states are where it can't push anything
          // off the page — every other block here is fighting for height.
          <div className="flex flex-col items-center justify-center py-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/notioly/reminder.svg"
              alt=""
              aria-hidden
              className="h-28 w-auto opacity-70"
            />
            <p className="mt-3 text-center text-[12px] text-muted">
              No emails with {agentFirst} yet. Start the conversation below.
            </p>
          </div>
        ) : (
          state.emails.map((e) => <EmailBubble key={e.id} e={e} />)
        )}
      </div>

      {/* composer */}
      {composing ? (
        // Unboxed, like the note and task composers. It sits in normal flow at
        // the foot of the log rather than floating over it, so it never needed
        // a fill or a shadow to separate itself from anything.
        <div className="modal-pop pt-2">
          {suggestions.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Suggested</span>
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title={`Attach the ${s.label} — pick it from your files`}
                  className="rounded-full border border-line bg-page px-2 py-0.5 text-[11px] font-medium text-muted transition hover:text-ink"
                >
                  + {s.label}
                </button>
              ))}
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1 rounded-lg border border-line bg-page px-2 py-1 text-[11px]">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
                  </svg>
                  <span className="max-w-[120px] truncate">{a.filename}</span>
                  <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} className="text-muted hover:text-ink">
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              if (e.key === "Escape" && !draft) setComposing(false);
            }}
            rows={3}
            placeholder={`Write to ${agentFirst}…`}
            className="w-full resize-none border-0 border-b-[1.5px] border-ink/25 bg-transparent px-1 py-2 text-[13px] outline-none transition focus:border-ink/70"
          />
          {sendError ? <p className="mt-1 text-[12px] text-accent">{sendError}</p> : null}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach a file"
                className="btn-press flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { setComposing(false); setSendError(null); }}
                className="px-2 text-[12px] font-medium text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              className="btn-press rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition disabled:opacity-50"
              style={{ background: BRAND.accent }}
            >
              {sending ? "Sending…" : `Send to ${agentFirst}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="btn-press flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white shadow-md transition hover:shadow-lg"
            style={{ background: BRAND.accent }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            Email {agentFirst}
          </button>
        </div>
      )}
    </div>
  );
}

// Compact card for the kanban columns — the column header already says the
// stage, so this is address + tenant/agent + move-in, with a movement dot.
function EmailBubble({ e }: { e: DealEmail }) {
  const [open, setOpen] = useState(false);
  const out = e.direction === "out";
  const preview = e.body.length > 220 && !open ? e.body.slice(0, 220) + "…" : e.body;
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-left transition ${
          out
            ? "rounded-br-md bg-accent text-white"
            : "rounded-bl-md border border-line bg-white text-ink"
        }`}
      >
        <div className={`mb-0.5 flex items-baseline gap-2 text-[10px] ${out ? "text-white/70" : "text-muted"}`}>
          <span className="font-semibold">{out ? "You" : e.from.replace(/<.*>/, "").trim() || e.from}</span>
          <span>{e.date ? fmtDateTime(e.date) : ""}</span>
        </div>
        {e.subject ? <p className={`text-[12px] font-semibold ${out ? "text-white" : "text-ink"}`}>{e.subject}</p> : null}
        <p className={`whitespace-pre-wrap text-[12.5px] leading-relaxed ${out ? "text-white/95" : "text-ink"}`}>
          {preview || "(no text)"}
        </p>
      </button>
    </div>
  );
}

/* -------------------------------- tasks -------------------------------- */

/** "Add to calendar" — a one-event ICS file the browser downloads. */
function downloadIcs(task: DealTask) {
  const day = (task.dueDate ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TLE Portal//Pre-Tenancy//EN",
    "BEGIN:VEVENT",
    `UID:${task.id}@tle-portal`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `SUMMARY:${esc(task.title)} — ${esc(task.dealLabel)}`,
    `DESCRIPTION:${esc(`Pre-tenancy follow-up for ${task.dealLabel} (TLE portal)`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `follow-up-${day}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------ date picker ------------------------------ */
// A softer, animated calendar for follow-up dates — bubbles up from the
// trigger with rounded corners and quick-pick shortcuts, instead of the
// browser's stock date input.

const DP_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DP_DOW = ["M", "T", "W", "T", "F", "S", "S"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CAL_W = 264;
const CAL_H = 340;

function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [view, setView] = useState(() => (selected ? new Date(selected) : new Date()));
  const btnRef = useRef<HTMLButtonElement>(null);
  // Fixed position, computed from the trigger and clamped to the viewport so
  // the calendar is never clipped by the scrolling panel it lives in.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const todayIso = today();

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.left), window.innerWidth - CAL_W - 8);
      // Prefer above the trigger; drop below if there isn't room.
      const above = r.top - CAL_H - 8;
      const top = above >= 8 ? above : Math.min(r.bottom + 8, window.innerHeight - CAL_H - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  // Monday-first grid.
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const label = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Set a date";

  const pick = (d: Date) => {
    onChange(toIso(d));
    setOpen(false);
  };
  const quick = (addDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    pick(d);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn-press flex items-center gap-2 rounded-xl border bg-transparent px-3 py-2.5 text-[13px] outline-none transition ${
          value ? "border-line text-ink" : "border-line text-muted"
        } hover:border-gray-400`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x={3} y={4.5} width={18} height={16} rx={2.5} />
          <path d="M3 9h18M8 3v3M16 3v3" />
        </svg>
        {label}
      </button>

      {open && typeof document !== "undefined" ? (
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              className="cal-pop fixed z-[61] w-[264px] rounded-2xl border border-line bg-card p-3 shadow-xl"
              style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            >
            {/* month header */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView(new Date(year, month - 1, 1))}
                className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-page hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="text-[13px] font-semibold">{DP_MONTHS[month]} {year}</span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView(new Date(year, month + 1, 1))}
                className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-page hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>

            {/* day-of-week */}
            <div className="grid grid-cols-7 gap-1">
              {DP_DOW.map((d, i) => (
                <span key={i} className="py-1 text-center text-[10px] font-semibold uppercase text-muted">{d}</span>
              ))}
            </div>

            {/* days */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const iso = toIso(d);
                const isSel = iso === value;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(d)}
                    style={{ ["--cal-delay" as string]: `${i * 6}ms` }}
                    className={`cal-day flex h-8 items-center justify-center rounded-full text-[12.5px] transition ${
                      isSel
                        ? "font-semibold text-white"
                        : isToday
                          ? "font-semibold accent-text"
                          : "text-ink hover:bg-page"
                    }`}
                  >
                    <span className={isSel ? "flex h-8 w-8 items-center justify-center rounded-full" : ""} style={isSel ? { background: BRAND.accent } : undefined}>
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* quick picks */}
            <div className="mt-2 flex gap-1.5 border-t border-line pt-2">
              {[
                { label: "Today", days: 0 },
                { label: "Tomorrow", days: 1 },
                { label: "+1 week", days: 7 },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => quick(q.days)}
                  className="btn-press flex-1 rounded-lg bg-page px-2 py-1.5 text-[11px] font-medium text-muted transition hover:text-ink"
                >
                  {q.label}
                </button>
              ))}
            </div>
            </div>
          </>,
          document.body
        )
      ) : null}
    </div>
  );
}

function TasksTab({
  deal,
  onActivityChanged,
}: {
  deal: BoardDeal;
  onActivityChanged: () => void;
}) {
  const [tasks, setTasks] = useState<DealTask[] | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deals/${deal.app.id}/tasks`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { tasks?: DealTask[] }) => !cancelled && setTasks(d.tasks ?? []))
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, [deal.app.id]);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${deal.app.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), dueDate: due || null }),
      });
      const d = (await res.json()) as { task?: DealTask; error?: string };
      if (!res.ok || !d.task) throw new Error(d.error ?? "Couldn't add the follow-up.");
      setTasks((prev) => [...(prev ?? []), d.task!]);
      setTitle("");
      onActivityChanged(); // the follow-up is logged as an activity line
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the follow-up.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: DealTask, done: boolean) {
    setTasks((prev) =>
      prev ? prev.map((t) => (t.id === task.id ? { ...t, done } : t)) : prev
    );
    try {
      await fetch("/api/my/deal-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, done }),
      });
    } catch {
      // revert on failure
      setTasks((prev) =>
        prev ? prev.map((t) => (t.id === task.id ? { ...t, done: !done } : t)) : prev
      );
    }
  }

  const overdueDay = today();

  return (
    <>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {tasks == null ? (
          <div className="h-16 animate-pulse rounded-xl bg-page" />
        ) : tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-[12px] text-muted">
            No follow-ups on this deal yet. Set one below — it shows under
            &quot;Tasks today&quot; when the day comes.
          </p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => void toggle(t, e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-line accent-[#E31F36]"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] ${t.done ? "text-muted line-through" : "font-medium"}`}>
                  {t.title}
                </p>
                {t.dueDate ? (
                  <p
                    className={`text-[11px] ${
                      !t.done && t.dueDate < overdueDay
                        ? "font-semibold text-red-600"
                        : "text-muted"
                    }`}
                  >
                    Due {fmtDate(t.dueDate)}
                    {!t.done && t.dueDate < overdueDay ? " · overdue" : ""}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => downloadIcs(t)}
                title="Add to calendar"
                className="btn-press shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:text-ink"
              >
                Add to calendar
              </button>
            </div>
          ))
        )}
      </div>

      {error ? <p className="mt-2 text-[12px] text-accent">{error}</p> : null}
      {/* Same as the note composer — one line, under the field, not two. */}
      <div className="mt-3 flex flex-wrap gap-2 pt-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="Add a follow-up — e.g. Chase references…"
          className="min-w-0 flex-1 border-0 border-b-[1.5px] border-ink/25 bg-transparent px-1 py-2.5 text-[13px] outline-none transition focus:border-ink/70"
        />
        <DatePicker value={due} onChange={setDue} />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void add()}
          className="btn-press shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-50"
          style={{ background: BRAND.accent }}
        >
          Add
        </button>
      </div>
    </>
  );
}

/* ------------------------------ tasks today ------------------------------ */

/** The fortnight ahead, soonest first — the other question she asks all day. */
function ChecksModal({
  deals,
  alerts,
  onClose,
  onOpenDeal,
}: {
  deals: BoardDeal[];
  /* The reasons, from the same place the Progression column gets them. The
     modal used to render the server's `flags`, so a deal could be listed here
     for one reason and show a different one when you opened it. */
  alerts: DealAlert[];
  onClose: () => void;
  onOpenDeal: (dealId: string) => void;
}) {
  const byDeal = new Map<string, DealAlert[]>();
  for (const a of alerts) {
    const cur = byDeal.get(a.dealId);
    if (cur) cur.push(a);
    else byDeal.set(a.dealId, [a]);
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="modal-pop w-full max-w-lg rounded-2xl bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-accent">
            <DoodleIcon name="search" size={20} />
          </span>
          <h2 className="text-[15px] font-semibold">Worth a check</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-full border border-line p-1.5 text-muted transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Where the pipeline and the money systems disagree. Fixing the data
          clears the check by itself — there is nothing to dismiss.
        </p>
        <ul className="mt-4 max-h-[60vh] space-y-1.5 overflow-y-auto">
          {deals.map((d) => (
            <li key={d.app.id}>
              <button
                type="button"
                onClick={() => onOpenDeal(d.app.id)}
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-left transition hover:border-black/25"
              >
                <span className="block truncate text-[13px] font-medium text-ink">
                  {d.app.propertyName}
                  <span className="ml-2 font-normal text-muted">
                    {d.agentName ?? "Unassigned"}
                  </span>
                </span>
                {(byDeal.get(d.app.id) ?? []).map((a) => (
                  <span key={a.key} className="mt-1 block text-[11.5px] leading-snug text-amber-800">
                    {a.text}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MoveInsSoonModal({
  deals,
  onClose,
  onOpenDeal,
}: {
  deals: BoardDeal[];
  onClose: () => void;
  onOpenDeal: (dealId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="modal-pop w-full max-w-lg rounded-2xl bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-accent">
            <DoodleIcon name="calendar" size={20} />
          </span>
          <h2 className="text-[15px] font-semibold">Moving in the next 14 days</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-full border border-line p-1.5 text-muted transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {deals.length === 0 ? (
          <p className="mt-5 text-[13px] text-muted">
            Nothing due to move in for a fortnight.
          </p>
        ) : (
          <ul className="mt-4 max-h-[60vh] space-y-1.5 overflow-y-auto">
            {deals.map((d) => (
              <li key={d.app.id}>
                <button
                  type="button"
                  onClick={() => onOpenDeal(d.app.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left transition hover:border-black/25"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {d.app.propertyName}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {d.agentName ?? "Unassigned"} · {stageLabel(d.effectiveStatusKey)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-ink">
                    {fmtDate(d.app.startDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TasksTodayModal({
  onClose,
  onOpenDeal,
}: {
  onClose: () => void;
  onOpenDeal: (dealId: string) => void;
}) {
  const [tasks, setTasks] = useState<DealTask[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/my/deal-tasks?due=${today()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { tasks?: DealTask[] }) => !cancelled && setTasks(d.tasks ?? []))
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(task: DealTask, done: boolean) {
    setTasks((prev) =>
      prev ? prev.map((t) => (t.id === task.id ? { ...t, done } : t)) : prev
    );
    try {
      await fetch("/api/my/deal-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, done }),
      });
    } catch {
      setTasks((prev) =>
        prev ? prev.map((t) => (t.id === task.id ? { ...t, done: !done } : t)) : prev
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="modal-pop w-full max-w-lg rounded-2xl bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">
            Tasks today ·{" "}
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-line p-1.5 text-muted transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          {tasks == null ? (
            <div className="h-16 animate-pulse rounded-xl bg-page" />
          ) : tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
              Nothing due today. Set follow-ups from any deal&apos;s Tasks tab.
            </p>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => void toggle(t, e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-line accent-[#E31F36]"
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] ${t.done ? "text-muted line-through" : "font-medium"}`}>
                    {t.title}
                  </p>
                  <p className="truncate text-[11px] text-muted">{t.dealLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenDeal(t.dealId)}
                  className="btn-press shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:text-ink"
                >
                  Open deal
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- profile menu + mailbox ------------------------- */

const MAIL_PRESETS: { key: string; label: string; host: string }[] = [
  { key: "google", label: "Google Workspace / Gmail", host: "imap.gmail.com" },
  { key: "m365", label: "Microsoft 365 / Outlook", host: "outlook.office365.com" },
  { key: "other", label: "Other (enter server)", host: "" },
];

function MailboxModal({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [email, setEmail] = useState(user.email);
  const [preset, setPreset] = useState("google");
  const [host, setHost] = useState("imap.gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/mailbox", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MailboxStatus) => !cancelled && setStatus(d))
      .catch(() => !cancelled && setStatus({ connected: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  function pickPreset(key: string) {
    setPreset(key);
    const p = MAIL_PRESETS.find((x) => x.key === key);
    if (p && p.host) setHost(p.host);
    if (p && !p.host) setHost("");
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, imapHost: host.trim() }),
      });
      const d = (await res.json()) as { error?: string; connected?: boolean; imapHost?: string };
      if (!res.ok) throw new Error(d.error ?? "Couldn't connect.");
      setStatus({ connected: true, email: email.trim(), imapHost: host.trim() });
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/me/mailbox", { method: "DELETE" });
      setStatus({ connected: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="modal-pop w-full max-w-md rounded-2xl bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Profile &amp; email</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-line p-1.5 text-muted transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="mt-1.5 text-[12px] text-muted">
          Signed in as <span className="font-medium text-ink">{user.email}</span>
        </p>

        <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Email connection
        </h3>

        {status == null ? (
          <div className="mt-3 h-16 animate-pulse rounded-xl bg-page" />
        ) : status.connected ? (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-[13px] font-medium text-green-800">
              Connected — {status.email}
            </p>
            <p className="mt-0.5 text-[11px] text-green-700">
              Emails to and from a deal&apos;s tenants now appear on its Emails tab.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="mt-2 text-[12px] font-semibold text-green-800 underline underline-offset-2"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            <p className="text-[12px] text-muted">
              Sign in with an <span className="font-medium text-ink">app password</span>{" "}
              (not your normal password) — in Gmail: Google Account → Security →
              2-Step Verification → App passwords.
            </p>
            <select
              value={preset}
              onChange={(e) => pickPreset(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[13px] outline-none"
            >
              {MAIL_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {preset === "other" ? (
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="IMAP server, e.g. imap.yourhost.co.uk"
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] outline-none transition focus:border-gray-400"
              />
            ) : null}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] outline-none transition focus:border-gray-400"
            />
            <PasswordInput placeholder="App password" value={password} onChange={setPassword} />
            {error ? <p className="text-[12px] text-accent">{error}</p> : null}
            <button
              type="button"
              disabled={busy || !email.trim() || !password || !host.trim()}
              onClick={() => void connect()}
              className="btn-press w-full rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50"
            >
              {busy ? "Checking the sign-in…" : "Connect email"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
