"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PhotoLightbox from "@/components/PhotoLightbox";
import PropertyFile from "@/components/PropertyFile";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import RoomPicker from "@/components/RoomPicker";
import ReletAction from "@/components/portfolio/ReletAction";
import HomeNotices from "@/components/sections/HomeNotices";
import SaveChip, { SaveScopeProvider, useSaveReporter, useSaveScope } from "@/components/SaveChip";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import RaiseJob from "@/components/maintenance/RaiseJob";
import JobDrawer from "@/components/maintenance/JobDrawer";
import { OPEN, STATUS_LABEL, day as shortDay, nextFor } from "@/components/maintenance/works-ui";
import BookForm, { type Person } from "@/components/inspections/BookForm";
import PortfolioMap from "@/components/PortfolioMap";
import { SPECS, STATUS_LABEL as NOTICE_STATUS, type Notice } from "@/lib/section-notices-spec";
import { readJson } from "@/lib/page-cache";
import { ORDER_KEY } from "@/lib/portfolio-order";
import { rexListingUrl } from "@/lib/business/rex-links";
import { housesIn, houseByListing, roomLabel, tenantsInOrder, pickerOption, MANAGED_READERS as R, type House } from "@/lib/houses";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";
import type { Contractor, WorksOrder } from "@/lib/works-orders";
import type { CarriedJob } from "@/lib/works-carried";
import type { DueVisit, Inspection } from "@/lib/inspections";
import type { DueReview, Review } from "@/lib/tenancy-reviews";
import type { MoveOut, OpenMoveOut } from "@/lib/move-outs";

/**
 * One home, the whole of it, on one page.
 *
 * James, 7 Oct 2026: "rather than you having to go to the maintenance page
 * and then report a repair, you should be able to find the property, because
 * that's what you would do." Portfolio's slide-out became this page. What
 * the separate boards hold for this home is drawn here, and the things you
 * would do to a home - report a repair, plan a job, book a visit, record a
 * notice, re-let it - are buttons at the top. The boards stay where they
 * were; whether to hide them is a call for after the agents have used this.
 *
 * Every section reads its own source and says so while it reads; one that
 * fails says it failed and the rest of the page stands. Nothing is a sample.
 */

type Tab = "maintenance" | "compliance" | "inspections" | "tenancy";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "maintenance", label: "Maintenance", icon: "setting" },
  { id: "compliance", label: "Compliance", icon: "shield" },
  { id: "inspections", label: "Inspections", icon: "checklist" },
  { id: "tenancy", label: "Tenancy", icon: "key" },
];

/** What the action box at the top right is showing, when not the latest activity. */
type Action =
  | { kind: "repair" | "planned" }
  | { kind: "inspection"; inspection: Inspection }
  | { kind: "notices" }
  | { kind: "tenant-notice" };
const ACTION_TITLE: Record<Action["kind"], string> = {
  repair: "Report a repair",
  planned: "Plan a job",
  inspection: "Book an inspection",
  notices: "Rent review and notices",
  "tenant-notice": "Tenant gave notice",
};
const MAPS = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

/** One line on the latest activity list. */
type Activity = { key: string; at: string; icon: string; title: string; sub: string; hot?: boolean; go?: () => void };
const REVIEW_OUTCOME: Record<string, string> = {
  increase: "Rent increased", renewed: "Renewed, same rent", no_change: "No change", ending: "Tenancy ending", other: "Reviewed",
};


type Loaded<T> = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; data: T };

type Book = { ok: boolean; error?: string; properties: ManagedProperty[]; everything?: boolean };
type Works = { orders: WorksOrder[]; contractors: Contractor[]; carried: CarriedJob[]; canCorporate: boolean };
type Visits = { inspections: Inspection[]; due: DueVisit[]; team: Person[]; me: Person | null };
type Tenancy = {
  ready: boolean;
  error?: string | null;
  tenancy: { startDate: string | null; endDate: string | null; depositId: string | null } | null;
  protection: "protected" | "without" | null;
};
type Ending = { reviewsDue: DueReview[]; reviewsDone: Review[]; open: OpenMoveOut[]; done: MoveOut[] };

const money = (n: number | null | undefined) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const day = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
};
const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const ymd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const VISIT_KIND: Record<string, string> = {
  check_in: "Check-in", interim: "Property visit", hmo: "HMO check", void: "Empty property check", check_out: "Check-out", follow_up: "Re-visit",
};
const VISIT_STATUS: Record<string, string> = {
  due: "Due", arranging: "Arranging", booked: "Booked", visited: "Visited", reported: "Written up", no_access: "No access", closed: "Closed", cancelled: "Cancelled",
};
const OPEN_VISIT = ["due", "arranging", "booked", "visited", "reported", "no_access"];

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!j?.ok) throw new Error(j?.error ?? "That could not be read just now.");
  return j as T;
}

const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const card = "rounded-xl border border-line/50 bg-white";
/** The outlined boxes the page is built from - white, a fine line, gentle corners. */
const box = "rounded-2xl border border-line/70 bg-white";

function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
      {label}
    </p>
  );
}
function Failed({ error }: { error: string }) {
  return <p className="text-[12.5px] text-accent-dark">{error}</p>;
}

export default function PropertyPage() {
  const params = useParams<{ listingId: string }>();
  const listingId = decodeURIComponent(String(params.listingId ?? ""));
  const router = useRouter();

  const [book, setBook] = useState<Loaded<Book>>({ state: "loading" });
  const [tab, setTab] = useState<Tab>("maintenance");
  const [room, setRoom] = useState<string>("house");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);

  /* Same read as the Portfolio list, so arriving from it paints at once. */
  useEffect(() => {
    let live = true;
    readJson<Book>("/api/portfolio", (j) => Boolean(j?.ok))
      .then((j) => { if (live) setBook(j.ok ? { state: "ready", data: j } : { state: "failed", error: j.error ?? "The book could not be read." }); })
      .catch((e) => { if (live) setBook({ state: "failed", error: e instanceof Error ? e.message : "The book could not be read." }); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && TABS.some((x) => x.id === t)) setTab(t as Tab);
      const o = JSON.parse(sessionStorage.getItem(ORDER_KEY) ?? "[]");
      if (Array.isArray(o)) setOrder(o.map(String));
    } catch { /* fine */ }
  }, []);
  const pickTab = useCallback((t: Tab) => {
    setTab(t);
    try {
      const u = new URL(window.location.href);
      if (t === "maintenance") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
      window.history.replaceState(null, "", u.toString());
    } catch { /* fine */ }
  }, []);

  const properties = book.state === "ready" ? book.data.properties : [];
  const everything = book.state === "ready" && Boolean(book.data.everything);
  const home = useMemo(() => properties.find((p) => String(p.listingId) === listingId) ?? null, [properties, listingId]);
  const house: House | null = useMemo(() => {
    if (!home) return null;
    return houseByListing(housesIn(properties, R), R).get(String(home.listingId)) ?? null;
  }, [properties, home]);

  /* Opened on a room: land on that room, as the slide-out did. */
  useEffect(() => {
    if (!home || !house) { setRoom("house"); return; }
    const opened = house.rooms.find((r) => r.listingId === home.listingId);
    setRoom(opened && house.house?.listingId !== home.listingId ? opened.listingId : "house");
  }, [home, house]);

  const roomP = house && room !== "house" ? house.rooms.find((r) => r.listingId === room) ?? null : null;
  /* What the page describes: a room, the house's own record, or the home. */
  const p: ManagedProperty | null = roomP ?? house?.house ?? (house ? house.rooms[0] : home);
  const saves = useSaveScope(p?.listingId ?? listingId);

  const step = (d: number) => {
    const i = order.indexOf(listingId);
    if (i < 0 || order.length < 2) return;
    router.push(`/portfolio/${encodeURIComponent(order[(i + d + order.length) % order.length])}${tab === "maintenance" ? "" : `?tab=${tab}`}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (action || openJob || lightbox != null) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── what the boards hold for this home ─────────────────────────────── */
  const propertyId = p?.propertyId ?? null;
  const [works, setWorks] = useState<Loaded<Works>>({ state: "loading" });
  const [visits, setVisits] = useState<Loaded<Visits>>({ state: "loading" });
  const [ending, setEnding] = useState<Loaded<Ending>>({ state: "loading" });
  const [tenancy, setTenancy] = useState<Loaded<Tenancy>>({ state: "loading" });
  const [certs, setCerts] = useState<Loaded<{ outstanding: number; checked: boolean; rows: number; filed: { label: string; at: string }[] }>>({ state: "loading" });
  const [notices, setNotices] = useState<Loaded<Notice[]>>({ state: "loading" });

  const loadWorks = useCallback(() => {
    if (!propertyId) return;
    getJson<Works & { carried?: CarriedJob[] }>(`/api/works-orders?property=${encodeURIComponent(propertyId)}`)
      .then((j) => setWorks({ state: "ready", data: { orders: j.orders ?? [], contractors: j.contractors ?? [], carried: (j.carried ?? []).filter((c) => c.propertyId === propertyId), canCorporate: Boolean(j.canCorporate) } }))
      .catch((e) => setWorks({ state: "failed", error: e.message }));
  }, [propertyId]);
  const loadVisits = useCallback(() => {
    if (!propertyId) return;
    getJson<Visits>(`/api/inspections?property=${encodeURIComponent(propertyId)}`)
      .then((j) => setVisits({ state: "ready", data: { inspections: j.inspections ?? [], due: (j.due ?? []).filter((d) => d.propertyId === propertyId), team: j.team ?? [], me: j.me ?? null } }))
      .catch((e) => setVisits({ state: "failed", error: e.message }));
  }, [propertyId]);
  const loadEnding = useCallback(() => {
    if (!propertyId) return;
    Promise.all([
      getJson<{ due: DueReview[]; done: Review[] }>("/api/tenancy-reviews"),
      getJson<{ open: OpenMoveOut[]; done: MoveOut[] }>("/api/move-outs"),
    ])
      .then(([rv, mo]) =>
        setEnding({
          state: "ready",
          data: {
            reviewsDue: (rv.due ?? []).filter((d) => d.propertyId === propertyId),
            reviewsDone: (rv.done ?? []).filter((d) => d.rexPropertyId === propertyId),
            open: (mo.open ?? []).filter((m) => m.propertyId === propertyId),
            done: (mo.done ?? []).filter((m) => m.rexPropertyId === propertyId),
          },
        })
      )
      .catch((e) => setEnding({ state: "failed", error: e.message }));
  }, [propertyId]);

  useEffect(() => {
    if (!p) return;
    if (!propertyId) {
      const none = { state: "failed" as const, error: "There is no property record behind this home yet, so there is nothing to show here." };
      setWorks(none); setVisits(none); setEnding(none); setCerts(none);
      return;
    }
    setWorks({ state: "loading" }); setVisits({ state: "loading" }); setEnding({ state: "loading" }); setCerts({ state: "loading" });
    loadWorks();
    loadVisits();
    loadEnding();
    getJson<{ outstanding: number; checked: boolean; rows: { state: string; label: string; files: { uploadedAt: string | null }[] }[] }>(`/api/property-file?property=${encodeURIComponent(propertyId)}`)
      .then((j) => setCerts({
        state: "ready",
        data: {
          outstanding: j.outstanding ?? 0,
          checked: Boolean(j.checked),
          rows: (j.rows ?? []).filter((r) => r.state !== "not-required").length,
          filed: (j.rows ?? []).flatMap((r) => (r.files ?? []).filter((f) => f.uploadedAt).map((f) => ({ label: r.label, at: f.uploadedAt as string }))),
        },
      }))
      .catch((e) => setCerts({ state: "failed", error: e.message }));
  }, [p?.listingId, propertyId, loadWorks, loadVisits, loadEnding]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNotices = useCallback(() => {
    if (!p) return;
    getJson<{ notices: Notice[] }>(`/api/section-notices?listing=${encodeURIComponent(p.listingId)}`)
      .then((j) => setNotices({ state: "ready", data: j.notices ?? [] }))
      .catch((e) => setNotices({ state: "failed", error: e.message }));
  }, [p?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p) return;
    setNotices({ state: "loading" });
    loadNotices();
    setTenancy({ state: "loading" });
    getJson<Tenancy>(`/api/portfolio/tenancy?listing=${encodeURIComponent(p.listingId)}`)
      .then((j) => setTenancy({ state: "ready", data: j }))
      .catch((e) => setTenancy({ state: "failed", error: e.message }));
  }, [p?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── the things you do to a home ────────────────────────────────────── */
  const [action, setAction] = useState<Action | null>(null);
  const [openJob, setOpenJob] = useState<WorksOrder | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  /* An action opens in the box at the top right; on a phone that box is
     above the details, so bring it into view. */
  const act = useCallback((a: Action | null) => {
    setAction(a);
    setActionErr(null);
    if (a) setTimeout(() => document.getElementById("action-box")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 40);
  }, []);

  if (book.state === "loading") {
    return (
      <div className="py-16">
        <Loading label="Opening the property…" />
      </div>
    );
  }
  if (book.state === "failed") {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">The book could not be read</p>
        <p className="mt-2 text-[12.5px] text-muted">{book.error}</p>
        <Link href="/portfolio" className="mt-4 inline-block text-[12.5px] underline">Back to Properties</Link>
      </div>
    );
  }
  if (!home || !p) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">This home isn&apos;t in your book</p>
        <p className="mt-2 text-[12.5px] text-muted">It may belong to another agent, or the link is wrong.</p>
        <Link href="/portfolio" className="mt-4 inline-block text-[12.5px] underline">Back to Properties</Link>
      </div>
    );
  }

  const lets = house?.kind === "lets";
  const houseView = Boolean(house) && !roomP;
  const title = house ? house.name : p.name;
  const shots = p.images.length ? p.images : p.image ? [p.image] : [];
  const landlord = house ? house.house?.landlord ?? house.rooms.find((r) => r.landlord)?.landlord ?? null : p.landlord;
  const tenants: Party[] = house ? (roomP || lets ? tenantsInOrder(house, roomP ?? house.rooms[0], R) : []) : p.tenants;
  const letRooms = house ? house.rooms.filter((r) => r.tenants.length > 0) : [];
  const roomRent = house ? house.rooms.reduce((a, r) => a + (r.rentMonthly ?? 0), 0) : 0;
  const sub = [
    house ? house.locality : p.locality,
    p.postcode && !(house ? house.locality : p.locality).includes(p.postcode) ? p.postcode : null,
    house && !lets ? `shared house · ${house.rooms.length} ${house.rooms.length === 1 ? "room" : "rooms"}, ${letRooms.length} let` : null,
  ].filter(Boolean).join(" · ");
  const canAct = !p.test && Boolean(propertyId);

  const raiseHome = propertyId
    ? { id: propertyId, name: house ? house.name : p.name, locality: p.locality, landlord: landlord?.name, tenant: tenants[0]?.name ?? null }
    : null;

  /* Book a visit: the one already in hand, or a new one raised for this home. */
  async function bookVisit() {
    if (!p || !propertyId || visits.state !== "ready") return;
    setActionErr(null);
    const inHand = visits.data.inspections.find((i) => ["due", "arranging", "no_access"].includes(i.status));
    if (inHand) return act({ kind: "inspection", inspection: inHand });
    const owed = visits.data.due[0];
    const t = tenants[0];
    const r = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: owed?.kind ?? "interim",
        propertyName: house ? house.name : p.name,
        locality: p.locality,
        propertyId,
        listingId: p.listingId,
        landlord: landlord?.name ?? "",
        landlordEmail: landlord?.email ?? "",
        tenant: owed?.tenant || t?.name || "",
        tenantEmail: owed?.tenantEmail || t?.email || "",
        tenantPhone: owed?.tenantPhone || t?.phone || "",
        tenancyStart: owed?.tenancyStart ?? (tenancy.state === "ready" ? tenancy.data.tenancy?.startDate ?? null : null),
        dueAt: owed?.dueAt ?? new Date().toISOString(),
        rexpmTaskId: owed?.taskId ?? null,
        osPropertyId: owed?.osPropertyId ?? null,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return setActionErr(r?.error ?? "The visit could not be raised.");
    loadVisits();
    act({ kind: "inspection", inspection: r.inspection });
  }

  const openJobs = works.state === "ready" ? works.data.orders.filter((o) => OPEN.includes(o.status)) : [];
  const openVisits = visits.state === "ready" ? visits.data.inspections.filter((i) => OPEN_VISIT.includes(i.status)) : [];
  /* Only a visit still to happen is "booked"; one already made is history. */
  const nextVisit = openVisits.find((i) => i.bookedAt && !i.visitedAt && new Date(i.bookedAt).getTime() > Date.now()) ?? null;
  const owedVisit = visits.state === "ready" ? visits.data.due[0] ?? null : null;
  const leaving = ending.state === "ready" ? ending.data.open[0] ?? null : null;
  const reviewDue = ending.state === "ready" ? ending.data.reviewsDue[0] ?? null : null;
  const rentLine = p.rent == null ? null : `${money(p.rent)} ${p.rentPeriod === "week" ? "pw" : "pcm"}`;

  /* ── the latest activity: every board's newest, one list ─────────────── */
  const reading = [works, visits, ending, notices, certs].some((x) => x.state === "loading");
  const activity: Activity[] = [];
  if (works.state === "ready") {
    for (const o of works.data.orders) {
      const next = nextFor(o);
      activity.push({ key: `job-${o.id}`, at: o.reportedAt ?? o.createdAt, icon: o.kind === "repair" ? "setting" : "calendar", title: `${o.kind === "repair" ? "Repair" : "Planned job"} · ${o.title}`, sub: `${STATUS_LABEL[o.status]} · ${next.text}`, hot: next.hot && OPEN.includes(o.status), go: () => setOpenJob(o) });
    }
    for (const c of works.data.carried) {
      if (c.reportedOn) activity.push({ key: `carried-${c.taskId}`, at: c.reportedOn, icon: "setting", title: c.title, sub: `${c.progress || "Not started"} · from the old system`, hot: c.overdue, go: () => pickTab("maintenance") });
    }
  }
  if (visits.state === "ready") {
    for (const i of visits.data.inspections) {
      const at = i.closedAt ?? i.reportedAt ?? i.visitedAt ?? i.bookedAt ?? i.createdAt;
      activity.push({ key: `visit-${i.id}`, at, icon: "checklist", title: VISIT_KIND[i.kind] ?? "Visit", sub: `${VISIT_STATUS[i.status] ?? i.status}${i.bookedAt && !i.visitedAt ? ` · ${stamp(i.bookedAt)}` : ""}`, hot: i.status === "no_access", go: () => router.push(`/inspections?open=${encodeURIComponent(i.id)}`) });
    }
  }
  if (notices.state === "ready") {
    for (const n of notices.data) {
      activity.push({ key: `notice-${n.id}`, at: n.servedAt ?? n.decidedAt ?? n.submittedAt ?? n.createdAt, icon: n.kind === "s13" ? "coin" : "file-contract", title: `${SPECS[n.kind].button} · ${SPECS[n.kind].short}`, sub: `${NOTICE_STATUS[n.status]} · ${n.agentName}`, hot: n.status === "returned", go: () => act({ kind: "notices" }) });
    }
  }
  if (ending.state === "ready") {
    for (const r of ending.data.reviewsDone) activity.push({ key: `review-${r.id}`, at: r.doneAt, icon: "key", title: "Tenancy review", sub: `${REVIEW_OUTCOME[r.outcome] ?? "Reviewed"} · ${r.doneBy}`, go: () => pickTab("tenancy") });
    for (const m of ending.data.open) activity.push({ key: `leaving-${m.key}`, at: m.moveOutAt ?? new Date().toISOString(), icon: "logout", title: m.moveOutOn ? `Leaving ${day(m.moveOutOn)}` : "Leaving, date to set", sub: m.progress, hot: true, go: () => pickTab("tenancy") });
    for (const m of ending.data.done) activity.push({ key: `moved-${m.id}`, at: m.doneAt, icon: "logout", title: m.outcome === "moved_out" ? "Moved out" : m.outcome === "staying" ? "Notice withdrawn" : "Move-out closed", sub: m.tenant || m.doneBy, go: () => pickTab("tenancy") });
  }
  if (certs.state === "ready") {
    for (const f of certs.data.filed) activity.push({ key: `cert-${f.label}-${f.at}`, at: f.at, icon: "shield", title: `${f.label} filed`, sub: "Certificate on the file", go: () => pickTab("compliance") });
  }
  const latest = activity.filter((a) => a.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  const chip = "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-white px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40";
  const tile = "flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-xl border border-line/60 bg-white p-3.5 text-left text-[12.5px] font-semibold leading-tight transition-colors hover:border-ink/40 disabled:opacity-40";
  const tileText = (label: string, what: string) => (
    <span className="block">
      <span className="block">{label}</span>
      <span className="mt-0.5 block text-[11.5px] font-normal leading-snug text-muted">{what}</span>
    </span>
  );
  const tileIcon = (name: string) => (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={name} size={14} /></span>
  );
  const noticeHome = {
    listingId: String(p.listingId),
    propertyId: p.propertyId,
    label: house ? `${house.name}${roomP ? ` · ${roomLabel(roomP)}` : ""}` : p.name,
    test: Boolean(p.test),
    address: [p.address || p.name, p.postcode && !(p.address || p.name).toUpperCase().includes(p.postcode.toUpperCase()) ? p.postcode : ""].filter(Boolean).join(", "),
    landlord: landlord?.name ?? "",
    tenants: tenants.map((t) => t.name),
    agent: p.agent?.name ?? null,
    rentMonthly: p.rentMonthly,
    letSince: p.letSince,
  };
  const roomsOnly = houseView && Boolean(house) && !lets;

  return (
    <SaveScopeProvider scope={saves}>
      <div className="space-y-5">
        {/* ── back, and ‹ › through the list it was opened from ─────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Link href="/portfolio" className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
              <span aria-hidden>←</span> Properties
            </Link>
            <SaveChip scope={saves} className="bg-white" />
          </div>
          {order.includes(listingId) && order.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-[11.5px] text-muted">{order.indexOf(listingId) + 1} of {order.length}</span>
              <button type="button" aria-label="Previous property" onClick={() => step(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">‹</button>
              <button type="button" aria-label="Next property" onClick={() => step(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">›</button>
            </div>
          )}
        </div>

        {/* Three rows, each a box on the left and its partner on the right,
            the same height side by side (James, 7 Oct 2026): the photos and
            the name beside the actions; the facts and the people beside the
            latest activity; the sections beside the map. On a phone they
            simply stack, actions straight after the photos. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── 1. the photos and the name ──────────────────────────────── */}
          <section className={`${box} min-w-0 p-3 lg:col-start-1 lg:row-start-1`}>
              <div className={`grid gap-2 ${shots.length > 1 ? "sm:grid-cols-[minmax(0,1fr)_140px] 2xl:grid-cols-[minmax(0,1fr)_170px]" : ""}`}>
                {/* The three down the side are square; the big one takes their
                    height, so it never sets the box's height itself. */}
                <button
                  type="button"
                  onClick={() => shots.length && setLightbox(0)}
                  aria-label={shots.length ? "See the photos" : "No photos"}
                  className={`group relative aspect-[16/10] overflow-hidden rounded-xl bg-box ${shots.length > 1 ? "sm:aspect-auto" : ""}`}
                >
                  <PropertyPhoto src={shots[0] ?? null} alt="" width={1400} height={875} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]" />
                  {shots.length > 0 && (
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] font-semibold backdrop-blur">
                      <DoodleIcon name="pack/photo" size={12} /> {shots.length} {shots.length === 1 ? "photo" : "photos"}
                    </span>
                  )}
                </button>
                {shots.length > 1 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
                    {[0, 1, 2].map((i) => {
                      const src = shots[i + 1];
                      if (!src) return <span key={i} aria-hidden className="aspect-square rounded-xl bg-box" />;
                      const more = i === 2 && shots.length > 4 ? shots.length - 4 : 0;
                      return (
                        <button key={src + i} type="button" onClick={() => setLightbox(i + 1)} aria-label={more ? `${more} more photos` : `Photo ${i + 2}`} className="group relative aspect-square overflow-hidden rounded-xl bg-box">
                          <PropertyPhoto src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                          {more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-[18px] font-semibold text-white">+{more}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            <div className="px-2 pb-1.5 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h1 className="hand min-w-0 text-[28px] leading-[1.1] sm:text-[32px]">{title}</h1>
                <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" />
                  {p.test ? "Test home" : p.service ?? "Service not set"}
                </span>
              </div>
              {(houseView && house && !lets ? roomRent > 0 : rentLine) && (
                <p className="figures mt-1.5 text-[20px] font-semibold">{houseView && house && !lets ? `${money(roomRent)} pcm across the rooms` : rentLine}</p>
              )}
              <p className="mt-1 text-[13px] text-muted">{sub}</p>
              {house && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRoom("house")}
                    className={`rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${room === "house" ? "border-accent-dark bg-accent-dark text-page" : "border-line/80 bg-white hover:border-ink"}`}
                  >
                    The house
                  </button>
                  <RoomPicker
                    options={house.rooms.map((r) => ({ id: r.listingId, ...pickerOption(house, r, R) }))}
                    value={room === "house" ? null : room}
                    onChange={setRoom}
                    placeholder={lets ? "Tenants" : "Rooms"}
                  />
                </div>
              )}

            </div>
          </section>

          {/* ── the actions, level with the photos ─────────────────────── */}
            <section className={`${box} flex flex-col p-4 lg:col-start-2 lg:row-start-1`}>
              <p className={`${eyebrow} mb-3 px-1`}>Actions</p>
              <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2">
                <button type="button" disabled={!canAct} onClick={() => act({ kind: "repair" })} className={tile}>{tileIcon("setting")}{tileText("Report a repair", "Tenant and landlord told at each step")}</button>
                <button type="button" disabled={!canAct} onClick={() => act({ kind: "planned" })} className={tile}>{tileIcon("calendar")}{tileText("Plan a job", "A service or certificate, by a date")}</button>
                <button type="button" disabled={!canAct || visits.state !== "ready"} onClick={() => void bookVisit()} className={tile}>{tileIcon("checklist")}{tileText("Book an inspection", "A date, who goes, and telling the tenant")}</button>
                <button type="button" onClick={() => act({ kind: "notices" })} className={tile}>{tileIcon("file-contract")}{tileText("Serve notice", "Section 8, checked by compliance")}</button>
                <button type="button" onClick={() => act({ kind: "notices" })} className={tile}>{tileIcon("coin")}{tileText("Rent review", "Section 13 rent increase")}</button>
                <button type="button" disabled={!canAct || !tenants.length} onClick={() => act({ kind: "tenant-notice" })} className={tile}>{tileIcon("logout")}{tileText("Tenant gave notice", "Starts the move-out")}</button>
                <button type="button" disabled={!propertyId} onClick={() => { pickTab("compliance"); setTimeout(() => document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} className={tile}>{tileIcon("shield")}{tileText("Add a certificate", "Read and filed on the home")}</button>
                {canAct && p.onRex !== false ? (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-3.5">{tileIcon("pack/house")}</span>
                    <ReletAction home={p} className="flex h-full min-h-[72px] w-full items-end gap-1 rounded-xl border border-line/60 bg-white p-3.5 pb-[34px] text-left text-[12.5px] font-semibold leading-tight transition-colors hover:border-ink/40" />
                    <span className="pointer-events-none absolute bottom-3.5 left-3.5 right-3.5 truncate text-[11.5px] leading-snug text-muted">Back on Listings, same home</span>
                  </div>
                ) : null}
              </div>
            </section>

          {/* ── 2. the facts and the people ────────────────────────────── */}
          <section className={`${box} min-w-0 p-4 sm:p-5 lg:col-start-1 lg:row-start-2`}>
              <p className={eyebrow}>General info</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
                <Info icon="key" text={p.letType ?? "Let type not set"} />
                <Info icon="calendar" text={p.letSince ? `Let since ${day(p.letSince)}` : "Let date not set"} />
                <Info icon="user" text={p.agent?.name ?? "No agent"} />
                <Info icon="clock" text={`On the books since ${day(houseView && house ? house.members.map((m) => m.onBooksSince).filter(Boolean).sort()[0] ?? null : p.onBooksSince)}`} />
              </div>

              {/* How it stands: one chip per board, each opens its section. */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={chip} onClick={() => pickTab("compliance")}>
                  <DoodleIcon name="shield" size={12} className="text-accent-dark" />
                  {certs.state === "loading" ? <Loading label="Compliance" /> : certs.state === "failed" ? "Compliance not available"
                    : certs.data.outstanding > 0 ? <b className="font-semibold text-accent-dark">{certs.data.outstanding} certificates outstanding</b>
                    : certs.data.checked && certs.data.rows > 0 ? "Certificates all in date" : "No certificates held yet"}
                </button>
                <button type="button" className={chip} onClick={() => pickTab("maintenance")}>
                  <DoodleIcon name="setting" size={12} className="text-accent-dark" />
                  {works.state === "loading" ? <Loading label="Jobs" /> : works.state === "failed" ? "Jobs not available"
                    : openJobs.length + works.data.carried.length > 0 ? <b className="font-semibold">{openJobs.length + works.data.carried.length} open {openJobs.length + works.data.carried.length === 1 ? "job" : "jobs"}</b>
                    : "No open jobs"}
                </button>
                <button type="button" className={chip} onClick={() => pickTab("inspections")}>
                  <DoodleIcon name="checklist" size={12} className="text-accent-dark" />
                  {visits.state === "loading" ? <Loading label="Inspections" /> : visits.state === "failed" ? "Inspections not available"
                    : nextVisit ? `Inspection ${stamp(nextVisit.bookedAt)}`
                    : owedVisit ? <b className={`font-semibold ${owedVisit.daysAway < 0 ? "text-accent-dark" : ""}`}>{VISIT_KIND[owedVisit.kind] ?? "Visit"} {owedVisit.daysAway < 0 ? "overdue" : `due ${day(owedVisit.dueAt)}`}</b>
                    : "No inspection owed"}
                </button>
                <button type="button" className={chip} onClick={() => pickTab("tenancy")}>
                  <DoodleIcon name="key" size={12} className="text-accent-dark" />
                  {leaving ? <b className="font-semibold text-accent-dark">Leaving {leaving.moveOutOn ? day(leaving.moveOutOn) : "· date to set"}</b>
                    : tenancy.state === "loading" ? <Loading label="Tenancy" />
                    : tenancy.state === "ready" && tenancy.data.tenancy ? <TenancyLine t={tenancy.data.tenancy} />
                    : `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}`}
                </button>
              </div>
            <div className="mt-5 grid gap-4 2xl:grid-cols-2">
              <section className={`${card} p-3.5 sm:p-5`}>
                <p className={`${eyebrow} mb-3`}>{roomsOnly ? "Rooms" : tenants.length === 1 ? "Tenant" : "Tenants"}</p>
                {roomsOnly && house ? (
                  <ul className="overflow-hidden rounded-xl border border-line/50">
                    {house.rooms.map((r) => (
                      <li key={r.listingId} className="border-b border-line/40 last:border-0">
                        <button type="button" onClick={() => setRoom(r.listingId)} className="grid w-full grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-[12.5px] transition-colors hover:bg-box">
                          <span className="font-semibold">{roomLabel(r)}</span>
                          <span className="min-w-0 truncate">{r.tenants[0]?.name ?? <span className="text-muted">Empty</span>}</span>
                          <span className="figures text-right">{r.rent == null ? <span className="text-muted">—</span> : `${money(r.rent)}${r.rentPeriod === "week" ? " pw" : ""}`}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : tenants.length ? (
                  <ul className="space-y-2">{tenants.map((t) => <PartyCard key={t.contactId} p={t} />)}</ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">No tenant on record. It is empty, or the let has not been recorded.</p>
                )}
                {tenants.length > 0 && (
                  <div className="mt-3 rounded-xl bg-box px-4 py-3 text-[12.5px]">
                    {tenancy.state === "loading" ? <Loading label="Reading the tenancy dates" />
                      : tenancy.state === "failed" ? <span className="text-muted">The tenancy dates could not be read.</span>
                      : tenancy.data.tenancy ? <TenancyLine t={tenancy.data.tenancy} long />
                      : <span className="text-muted">{tenancy.data.ready ? "No tenancy dates on record for this home." : tenancy.data.error ?? "The tenancy dates are still being read. Look again in a minute."}</span>}
                  </div>
                )}
              </section>

              <section className={`${card} p-3.5 sm:p-5`}>
                <p className={`${eyebrow} mb-3`}>Landlord</p>
                {landlord ? (
                  <div className="text-[13px]">
                    <PartyCard p={landlord} plain />
                    {landlord.email && landlord.email.includes("@") && (
                      <LandlordJobEmails key={landlord.email} compact landlord={landlord.email} name={landlord.name} className="mt-3 border-t border-line/40 pt-3" />
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">No landlord on record for this home.</p>
                )}
              </section>
            </div>
          </section>

          {/* ── on this home, level with the facts ─────────────────────── */}
            <section id="action-box" className="scroll-mt-5 rounded-2xl border border-accent-dark/15 bg-accent-soft/60 p-5 lg:col-start-2 lg:row-start-2">
              {action ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <button type="button" onClick={() => act(null)} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink">
                      <span aria-hidden>←</span> Latest activity
                    </button>
                    {action.kind !== "repair" && action.kind !== "planned" && (
                      <button type="button" onClick={() => act(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 bg-white text-[12px] text-muted hover:text-ink">✕</button>
                    )}
                  </div>
                  {action.kind !== "repair" && action.kind !== "planned" && action.kind !== "notices" && <h2 className="hand mb-3 text-[18px] leading-tight">{ACTION_TITLE[action.kind]}</h2>}
                  {(action.kind === "repair" || action.kind === "planned") && raiseHome ? (
                    <RaiseJob
                      key={action.kind}
                      inline
                      kind={action.kind}
                      home={raiseHome}
                      contractors={works.state === "ready" ? works.data.contractors : []}
                      onClose={() => act(null)}
                      onRaised={(o) => {
                        act(null);
                        loadWorks();
                        pickTab("maintenance");
                        /* Straight on to telling the landlord, as on Maintenance. */
                        setOpenJob(o);
                      }}
                    />
                  ) : action.kind === "inspection" && visits.state === "ready" ? (
                    <BookVisit
                      inspection={action.inspection}
                      team={visits.data.team}
                      me={visits.data.me}
                      onBooked={() => { act(null); loadVisits(); pickTab("inspections"); }}
                    />
                  ) : action.kind === "notices" ? (
                    roomsOnly ? (
                      <p className="text-[12.5px] text-muted">Each room is its own tenancy. Pick a room on the left to start its rent review or notice.</p>
                    ) : (
                      <HomeNotices key={`panel-${p.listingId}`} home={noticeHome} stacked />
                    )
                  ) : action.kind === "tenant-notice" && propertyId ? (
                    <NoticeSheet
                      propertyId={propertyId}
                      propertyName={house ? house.name : p.name}
                      tenants={tenants}
                      landlord={landlord?.name ?? ""}
                      rent={rentLine ?? ""}
                      onClose={() => act(null)}
                      onSaved={() => { act(null); loadEnding(); pickTab("tenancy"); }}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <p className={eyebrow}>On this home</p>
                  <h2 className="hand mt-1 text-[18px] leading-tight">Latest activity</h2>
                  {latest.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {latest.map((a) => (
                        <li key={a.key}>
                          <button type="button" onClick={a.go} className="flex w-full items-start gap-3 rounded-xl bg-white px-3.5 py-3 text-left transition-colors hover:bg-white/70">
                            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.hot ? "bg-accent-dark text-white" : "bg-accent-soft text-accent-dark"}`}>
                              <DoodleIcon name={a.icon} size={12} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-semibold">{a.title}</span>
                              <span className={`block truncate text-[11.5px] ${a.hot ? "text-accent-dark" : "text-muted"}`}>{a.sub}</span>
                            </span>
                            <span className="shrink-0 pt-0.5 text-[11px] text-muted">{shortDay(a.at)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : reading ? (
                    <div className="mt-3"><Loading label="Reading what has happened here" /></div>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-white px-4 py-5 text-center text-[12.5px] text-muted">Nothing recorded on this home yet. Pick an action and it shows here.</p>
                  )}
                  {reading && latest.length > 0 && <div className="mt-3"><Loading label="Still reading" /></div>}
                </>
              )}
              {actionErr && <p className="mt-3 text-[12px] text-accent-dark">{actionErr}</p>}
            </section>

          {/* ── 3. the sections ────────────────────────────────────────── */}
          <section id="sections" className={`${box} min-w-0 scroll-mt-5 p-5 lg:col-start-1 lg:row-start-3`}>
            <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${tab === t.id ? "border-ink bg-ink text-page" : "border-line/70 bg-white hover:border-ink/40"}`}
                >
                  <DoodleIcon name={t.icon} size={13} />
                  {t.label}
                  {t.id === "maintenance" && works.state === "ready" && openJobs.length > 0 && <span className={`rounded-full px-1.5 text-[10.5px] ${tab === t.id ? "bg-page/20" : "bg-accent-soft text-accent-dark"}`}>{openJobs.length}</span>}
                  {t.id === "compliance" && certs.state === "ready" && certs.data.outstanding > 0 && <span className={`rounded-full px-1.5 text-[10.5px] ${tab === t.id ? "bg-page/20" : "bg-accent-soft text-accent-dark"}`}>{certs.data.outstanding}</span>}
                </button>
              ))}
            </nav>
            {tab === "compliance" && (
              <div className="mt-4 [&>section]:rounded-none [&>section]:border-0 [&>section]:p-0">
                {houseView && house && !house.house && !lets && (
                  <p className="mb-2 text-[11.5px] text-muted">This house is held as its rooms only, so the file below is the first room&apos;s. Every room shares the house&apos;s certificates.</p>
                )}
                {propertyId ? (
                  <PropertyFile key={propertyId} propertyId={propertyId} propertyName={house ? `${house.name}${roomP ? ` · ${roomLabel(roomP)}` : ""}` : p.name} screen="the property page" />
                ) : (
                  <p className={`${card} p-5 text-[12.5px] text-muted`}>There is no property record behind this home yet, so there are no certificates to check.</p>
                )}
              </div>
            )}

            {tab === "maintenance" && (
              <section className="mt-4">
                {works.state === "loading" ? <Loading label="Reading the jobs on this home" /> : works.state === "failed" ? <Failed error={works.error} /> : (
                  <JobsList orders={works.data.orders} carried={works.data.carried} onOpen={setOpenJob} />
                )}
              </section>
            )}

            {tab === "inspections" && (
              <section className="mt-4">
                {visits.state === "loading" ? <Loading label="Reading the visits on this home" /> : visits.state === "failed" ? <Failed error={visits.error} /> : (
                  <VisitsList data={visits.data} />
                )}
              </section>
            )}

            {tab === "tenancy" && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <section className={`${card} p-5`}>
                  <p className={`${eyebrow} mb-3`}>The tenancy</p>
                  {tenancy.state === "loading" ? <Loading label="Reading the tenancy" /> : tenancy.state === "failed" ? <Failed error={tenancy.error} /> : (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
                      <Fact label="Tenants" value={tenants.length ? tenants.map((t) => t.name).join(", ") : "None on record"} />
                      <Fact label="Rent" value={rentLine ?? "Not set"} />
                      <Fact label="Started" value={tenancy.data.tenancy?.startDate ? day(tenancy.data.tenancy.startDate) : day(p.letSince)} />
                      <Fact label="Ends" value={tenancy.data.tenancy ? (tenancy.data.tenancy.endDate ? day(tenancy.data.tenancy.endDate) : "Rolling, no end date") : "—"} />
                      <Fact label="Deposit" value={tenancy.data.tenancy?.depositId ? `Registered · ${tenancy.data.tenancy.depositId}` : "—"} />
                      <Fact label="Rent and legal protection" value={tenancy.data.protection === "protected" ? "On" : tenancy.data.protection === "without" ? "Not taken" : "—"} />
                    </dl>
                  )}
                  {tenancy.state === "ready" && !tenancy.data.ready && (
                    <p className="mt-3 text-[11.5px] text-muted">{tenancy.data.error ?? "The tenancy dates are still being read. Look again in a minute."}</p>
                  )}
                </section>

                <section className={`${card} p-5`}>
                  <p className={`${eyebrow} mb-3`}>Moving out</p>
                  {ending.state === "loading" ? <Loading label="Reading reviews and move-outs" /> : ending.state === "failed" ? <Failed error={ending.error} /> : (
                    <EndingList data={ending.data} />
                  )}
                </section>

                {/* Rent review (Section 13) and Serve notice (Section 8):
                    Michael's checklists, decided on his Sections tab. Here
                    for the record; the bell's notice links open them here. */}
                <div id="notices" className={`${card} scroll-mt-6 p-5 md:col-span-2`}>
                  {roomsOnly ? (
                    <>
                      <p className={`${eyebrow} mb-2`}>Rent review and notices</p>
                      <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">Each room is its own tenancy. Pick a room at the top to start its rent review or notice.</p>
                    </>
                  ) : (
                    <HomeNotices key={p.listingId} home={noticeHome} />
                  )}
                </div>

                {reviewDue && (
                  <section className={`${card} p-5 md:col-span-2`}>
                    <p className={`${eyebrow} mb-2`}>Tenancy review</p>
                    <p className="text-[13px]">
                      {reviewDue.dueOn ? `Due ${day(reviewDue.dueOn)}` : "Due, no date set"}
                      {reviewDue.agreement ? <span className="text-muted"> · {reviewDue.agreement}</span> : null}
                    </p>
                    {reviewDue.why && <p className="mt-1 text-[12px] text-muted">{reviewDue.why}</p>}
                    <Link href="/tenancy-reviews" className="mt-3 inline-block text-[12px] underline underline-offset-2">Record the review</Link>
                  </section>
                )}
              </div>
            )}

          </section>

          {MAPS && p.lat != null && p.lng != null && (
            <section className={`${box} h-[260px] overflow-hidden lg:col-start-2 lg:row-start-3 lg:self-start`}>
              <PortfolioMap properties={[p]} attention={new Set()} onOpen={() => {}} />
            </section>
          )}

            {everything && !p.test && p.onRex !== false && (
              <p className="text-[11.5px] text-muted lg:col-start-1 lg:row-start-4">
                <a href={rexListingUrl(p.listingId, "leased")} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Open the record behind this home</a>
              </p>
            )}
        </div>
      </div>

      {lightbox != null && <PhotoLightbox photos={shots} start={lightbox} name={title} onClose={() => setLightbox(null)} />}

      {openJob && (
        <JobDrawer
          order={openJob}
          contractors={works.state === "ready" ? works.data.contractors : []}
          canCorporate={works.state === "ready" && works.data.canCorporate}
          onClose={() => setOpenJob(null)}
          onChanged={(o) => { setOpenJob(o); loadWorks(); }}
        />
      )}
    </SaveScopeProvider>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────── */

function Info({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <DoodleIcon name={icon} size={13} className="text-muted" />
      {text}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-[13px]">{value}</p>
    </div>
  );
}

function TenancyLine({ t, long = false }: { t: { startDate: string | null; endDate: string | null }; long?: boolean }) {
  const ends = t.endDate ? new Date(`${t.endDate}T12:00:00`) : null;
  const soon = ends ? ends.getTime() - Date.now() < 60 * 86_400_000 : false;
  if (!long) return <span className={soon ? "font-semibold text-accent-dark" : ""}>{ends ? `Ends ${day(t.endDate)}` : t.startDate ? `Since ${day(t.startDate)}, rolling` : "Rolling"}</span>;
  return (
    <span>
      {t.startDate ? <>Started <b className="font-semibold">{day(t.startDate)}</b></> : "Start not on record"}
      {" · "}
      {ends ? <span className={soon ? "font-semibold text-accent-dark" : ""}>ends {day(t.endDate)}</span> : <span className="text-muted">rolling, no end date</span>}
    </span>
  );
}

function PartyCard({ p, plain = false }: { p: Party; plain?: boolean }) {
  const body = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-semibold">{p.name}</span>
      {p.phone && <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="text-[12px] text-muted hover:text-ink">{p.phone}</a>}
      {p.email && <a href={`mailto:${p.email}`} className="truncate text-[12px] text-muted hover:text-ink">{p.email}</a>}
    </div>
  );
  if (plain) return body;
  return <li className="rounded-xl border border-line/50 px-4 py-3 text-[13px]">{body}</li>;
}

function JobsList({ orders, carried, onOpen }: { orders: WorksOrder[]; carried: CarriedJob[]; onOpen: (o: WorksOrder) => void }) {
  const [showClosed, setShowClosed] = useState(false);
  const open = orders.filter((o) => OPEN.includes(o.status));
  const closed = orders.filter((o) => !OPEN.includes(o.status));
  if (!orders.length && !carried.length) {
    return <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12.5px] text-muted">No jobs on this home yet. Report a repair or plan a job and it lands here.</p>;
  }
  const row = (o: WorksOrder) => {
    const next = nextFor(o);
    return (
      <li key={o.id} className="border-b border-line/40 last:border-0">
        <button type="button" onClick={() => onOpen(o)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-box 2xl:grid-cols-[90px_minmax(0,1fr)_minmax(0,240px)_auto]">
          <span className="hidden text-[11.5px] text-muted 2xl:block">#{o.ref} · {o.kind === "repair" ? "Repair" : "Planned"}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{o.title}</span>
            <span className="block truncate text-[11.5px] text-muted">{o.category} · reported {shortDay(o.reportedAt ?? o.createdAt)}</span>
            <span className={`mt-0.5 block truncate text-[11.5px] 2xl:hidden ${next.hot ? "font-semibold text-accent-dark" : "text-muted"}`}>{next.text}</span>
          </span>
          <span className={`hidden truncate text-[12px] 2xl:block ${next.hot ? "font-semibold text-accent-dark" : "text-muted"}`}>{next.text}</span>
          <Pill tone={o.status === "done" || o.status === "paid" ? "good" : next.hot ? "accent" : "neutral"}>{STATUS_LABEL[o.status]}</Pill>
        </button>
      </li>
    );
  };
  return (
    <div className="space-y-4">
      {open.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-line/50">{open.map(row)}</ul>
      ) : (
        <p className="text-[12.5px] text-muted">Nothing open on this home.</p>
      )}
      {carried.length > 0 && (
        <div>
          <p className={`${eyebrow} mb-2`}>Still open from the old system</p>
          <ul className="overflow-hidden rounded-xl border border-line/50">
            {carried.map((c) => (
              <li key={c.taskId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line/40 px-4 py-3 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{c.title}</span>
                  <span className="block truncate text-[11.5px] text-muted">{c.category} · {c.progress || "Not started"}{c.managedBy ? ` · with ${c.managedBy}` : ""}</span>
                </span>
                <span className={`text-[11.5px] ${c.overdue ? "font-semibold text-accent-dark" : "text-muted"}`}>{c.dueOn ? `${c.overdue ? "Overdue" : "Due"} ${day(c.dueOn)}` : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">Taken on from the Maintenance board.</p>
        </div>
      )}
      {closed.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-[12px] text-muted underline-offset-2 hover:underline">
            {showClosed ? "Hide finished jobs" : `${closed.length} finished ${closed.length === 1 ? "job" : "jobs"}`}
          </button>
          {showClosed && <ul className="mt-2 overflow-hidden rounded-xl border border-line/50">{closed.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}

function VisitsList({ data }: { data: Visits }) {
  const open = data.inspections.filter((i) => OPEN_VISIT.includes(i.status));
  const past = data.inspections.filter((i) => !OPEN_VISIT.includes(i.status));
  const row = (i: Inspection) => (
    <li key={i.id} className="border-b border-line/40 last:border-0">
      <Link href={`/inspections?open=${encodeURIComponent(i.id)}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-box sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{VISIT_KIND[i.kind] ?? "Visit"}</span>
          <span className="block truncate text-[11.5px] text-muted">#{i.ref}{i.inspector ? ` · ${i.inspector}` : ""}</span>
        </span>
        <span className="hidden text-[12px] text-muted sm:block">
          {i.visitedAt ? `Visited ${day(i.visitedAt)}` : i.bookedAt ? `Booked ${stamp(i.bookedAt)}` : i.dueAt ? `Due ${day(i.dueAt)}` : ""}
        </span>
        <Pill tone={i.status === "closed" || i.status === "reported" ? "good" : i.status === "no_access" ? "accent" : "neutral"}>{VISIT_STATUS[i.status] ?? i.status}</Pill>
      </Link>
    </li>
  );
  return (
    <div className="space-y-4">
      {data.due.map((d) => (
        <div key={d.key} className={`rounded-xl border px-4 py-3 text-[12.5px] ${d.daysAway < 0 ? "border-accent-dark/50 bg-accent-soft/30" : "border-line/60"}`}>
          <span className="font-semibold">{VISIT_KIND[d.kind] ?? "Visit"} {d.daysAway < 0 ? "overdue since" : "due"} {day(d.dueAt)}</span>
          <span className="text-muted"> · {d.why}</span>
        </div>
      ))}
      {open.length > 0 && <ul className="overflow-hidden rounded-xl border border-line/50">{open.map(row)}</ul>}
      {past.length > 0 && (
        <div>
          <p className={`${eyebrow} mb-2`}>Past visits</p>
          <ul className="overflow-hidden rounded-xl border border-line/50">{past.map(row)}</ul>
        </div>
      )}
      {!data.due.length && !data.inspections.length && (
        <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12.5px] text-muted">No visits on this home yet, and none owed.</p>
      )}
    </div>
  );
}

function EndingList({ data }: { data: Ending }) {
  if (!data.open.length && !data.done.length && !data.reviewsDone.some((r) => r.outcome === "ending")) {
    return <p className="text-[12.5px] text-muted">No notice on this tenancy.</p>;
  }
  return (
    <ul className="space-y-2 text-[12.5px]">
      {data.open.map((m) => (
        <li key={m.key} className="rounded-xl border border-accent-dark/40 bg-accent-soft/30 px-4 py-3">
          <p className="font-semibold">{m.moveOutOn ? `Leaving ${day(m.moveOutOn)}` : "Leaving, date to set"}{m.daysAway != null && m.daysAway >= 0 ? <span className="font-normal text-muted"> · in {m.daysAway} {m.daysAway === 1 ? "day" : "days"}</span> : null}</p>
          <p className="mt-0.5 text-muted">{[m.tenant, m.progress].filter(Boolean).join(" · ")}</p>
          <Link href="/move-outs" className="mt-2 inline-block text-[12px] underline underline-offset-2">Open the move-out</Link>
        </li>
      ))}
      {data.done.map((m) => (
        <li key={m.id} className="rounded-xl border border-line/50 px-4 py-3 text-muted">
          {m.outcome === "moved_out" ? `Moved out ${day(m.movedOutOn)}` : m.outcome === "staying" ? "Notice withdrawn, staying" : m.note || "Closed"}
          {m.tenant ? ` · ${m.tenant}` : ""}
        </li>
      ))}
    </ul>
  );
}

/* ── book a visit, in place ───────────────────────────────────────────── */

function BookVisit({ inspection, team, me, onBooked }: { inspection: Inspection; team: Person[]; me: Person | null; onBooked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reporter = useSaveReporter();
  const move = async (body: unknown, label = "Inspection") => {
    setBusy(true);
    const settle = reporter.begin(label);
    const r = await fetch(`/api/inspections/${inspection.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "That didn't work.";
      setErr(problem);
      settle({ ok: false, problem });
      return false;
    }
    settle({ ok: true });
    onBooked();
    return true;
  };
  return (
    <div>
      <p className="mb-3 text-[12px] text-muted">{VISIT_KIND[inspection.kind] ?? "Visit"} · {inspection.propertyName}</p>
      <BookForm inspection={inspection} team={team} me={me} busy={busy} onMove={move} />
      {err && <p className="mt-3 text-[12.5px] text-accent-dark">{err}</p>}
      <p className="mt-4 text-[11.5px] text-muted">
        The full visit sheet, with the write-up and the report, is on <Link href={`/inspections?open=${encodeURIComponent(inspection.id)}`} className="underline underline-offset-2">Inspections</Link>.
      </p>
    </div>
  );
}

/* ── notice, recorded from the home ───────────────────────────────────── */

function NoticeSheet({
  propertyId, propertyName, tenants, landlord, rent, onClose, onSaved,
}: {
  propertyId: string;
  propertyName: string;
  tenants: Party[];
  landlord: string;
  rent: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [served, setServed] = useState(ymd(new Date()));
  const [leaving, setLeaving] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "mt-1 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";

  async function save() {
    if (!served) return setErr("When was notice given?");
    if (!leaving) return setErr("What day do they leave?");
    if (leaving < served) return setErr("They can't leave before notice was given.");
    setBusy(true);
    setErr(null);
    const words = `Notice given by the ${tenants.length > 1 ? "tenants" : "tenant"} on ${day(served)}, leaving ${day(leaving)}.${note.trim() ? ` ${note.trim()}` : ""}`;
    const r = await fetch("/api/tenancy-reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rexPropertyId: propertyId,
        propertyName,
        tenant: tenants.map((t) => t.name).join(" & "),
        landlord,
        rentBefore: rent,
        dueOn: leaving,
        outcome: "ending",
        note: words,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "The notice could not be recorded.");
    onSaved();
  }

  return (
    <div>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Record the notice the {tenants.length > 1 ? "tenants have" : "tenant has"} given. It goes onto Move-outs with the day they leave, so the check-out, keys, meters, deposit and re-let follow from there. A notice from the landlord is Serve notice, on this page.
      </p>
      <div className="mt-4 grid gap-4">
        <label>
          <span className={label}>Notice given on</span>
          <input type="date" value={served} onChange={(e) => setServed(e.target.value)} className={field} />
        </label>
        <label>
          <span className={label}>They leave on</span>
          <input type="date" value={leaving} min={served} onChange={(e) => setLeaving(e.target.value)} className={field} />
        </label>
        <label>
          <span className={label}>Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="How it was served, the reason, anything agreed." className={field} />
        </label>
      </div>
      {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted hover:text-ink">Cancel</button>
        <PressButton onClick={() => void save()} className={`rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
          {busy ? "Recording…" : "Record notice"}
        </PressButton>
      </div>
    </div>
  );
}
