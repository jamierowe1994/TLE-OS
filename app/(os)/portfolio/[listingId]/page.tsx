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
import { readJson } from "@/lib/page-cache";
import { ORDER_KEY } from "@/lib/portfolio-order";
import { rexListingUrl } from "@/lib/business/rex-links";
import { housesIn, houseByListing, roomLabel, tenantsInOrder, pickerOption, MANAGED_READERS as R, type House } from "@/lib/houses";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";
import type { Contractor, Kind, WorksOrder } from "@/lib/works-orders";
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

type Tab = "overview" | "compliance" | "maintenance" | "inspections" | "tenancy";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "pack/house" },
  { id: "compliance", label: "Compliance", icon: "shield" },
  { id: "maintenance", label: "Maintenance", icon: "setting" },
  { id: "inspections", label: "Inspections", icon: "checklist" },
  { id: "tenancy", label: "Tenancy", icon: "key" },
];


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
const pill =
  "inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-white px-3.5 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40";
const card = "rounded-[22px] border border-line/50 bg-white";

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
  const [tab, setTab] = useState<Tab>("overview");
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
      if (t === "overview") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
      window.history.replaceState(null, "", u.toString());
    } catch { /* fine */ }
  }, []);

  /* Serve notice is Michael's Section 8 checklist, on the Tenancy section. */
  const goToNotices = useCallback(() => {
    pickTab("tenancy");
    setTimeout(() => document.getElementById("notices")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [pickTab]);

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
    router.push(`/portfolio/${encodeURIComponent(order[(i + d + order.length) % order.length])}${tab === "overview" ? "" : `?tab=${tab}`}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (raising || openJob || booking || noticing || lightbox != null) return;
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
  const [certs, setCerts] = useState<Loaded<{ outstanding: number; checked: boolean; rows: number }>>({ state: "loading" });

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
    getJson<{ outstanding: number; checked: boolean; rows: { state: string }[] }>(`/api/property-file?property=${encodeURIComponent(propertyId)}`)
      .then((j) => setCerts({ state: "ready", data: { outstanding: j.outstanding ?? 0, checked: Boolean(j.checked), rows: (j.rows ?? []).filter((r) => r.state !== "not-required").length } }))
      .catch((e) => setCerts({ state: "failed", error: e.message }));
  }, [p?.listingId, propertyId, loadWorks, loadVisits, loadEnding]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p) return;
    setTenancy({ state: "loading" });
    getJson<Tenancy>(`/api/portfolio/tenancy?listing=${encodeURIComponent(p.listingId)}`)
      .then((j) => setTenancy({ state: "ready", data: j }))
      .catch((e) => setTenancy({ state: "failed", error: e.message }));
  }, [p?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── the things you do to a home ────────────────────────────────────── */
  const [raising, setRaising] = useState<Kind | null>(null);
  const [openJob, setOpenJob] = useState<WorksOrder | null>(null);
  const [booking, setBooking] = useState<Inspection | null>(null);
  const [noticing, setNoticing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

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
    if (inHand) return setBooking(inHand);
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
    setBooking(r.inspection);
  }

  const openJobs = works.state === "ready" ? works.data.orders.filter((o) => OPEN.includes(o.status)) : [];
  const openVisits = visits.state === "ready" ? visits.data.inspections.filter((i) => OPEN_VISIT.includes(i.status)) : [];
  const nextVisit = openVisits.find((i) => i.bookedAt) ?? null;
  const owedVisit = visits.state === "ready" ? visits.data.due[0] ?? null : null;
  const leaving = ending.state === "ready" ? ending.data.open[0] ?? null : null;
  const reviewDue = ending.state === "ready" ? ending.data.reviewsDue[0] ?? null : null;

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

        {/* ── the hero: the home, what to do to it, and how it stands ───── */}
        <header className="fade-up relative overflow-hidden rounded-[22px] border border-line/50 bg-accent-soft/60">
          <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-7">
            <div className="min-w-0">
              <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
                <button
                  type="button"
                  onClick={() => shots.length && setLightbox(0)}
                  aria-label={shots.length ? "See the photos" : "No photos"}
                  className="overflow-hidden rounded-2xl border border-line/50 bg-white"
                >
                  <PropertyPhoto src={shots[0] ?? null} alt="" className="aspect-[4/3] w-full object-cover" />
                </button>
                <div className="min-w-0">
                  <p className={eyebrow}>{p.test ? "Test home · only you can see it" : p.service ?? "Property"}</p>
                  <h1 className="hand mt-1.5 text-[28px] leading-[1.1] sm:text-[32px]">{title}</h1>
                  <p className="mt-1.5 text-[13px] text-muted">{sub}</p>
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
              </div>

              {/* What you would do to a home, from the home. */}
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" disabled={!canAct} onClick={() => setRaising("repair")} className={`${pill} disabled:opacity-40`}>
                  <DoodleIcon name="setting" size={13} className="text-accent-dark" /> Report a repair
                </button>
                <button type="button" disabled={!canAct} onClick={() => setRaising("planned")} className={`${pill} disabled:opacity-40`}>
                  <DoodleIcon name="calendar" size={13} className="text-accent-dark" /> Plan a job
                </button>
                <button type="button" disabled={!canAct || visits.state !== "ready"} onClick={() => void bookVisit()} className={`${pill} disabled:opacity-40`}>
                  <DoodleIcon name="checklist" size={13} className="text-accent-dark" /> Book an inspection
                </button>
                <button type="button" onClick={goToNotices} className={pill}>
                  <DoodleIcon name="file-contract" size={13} className="text-accent-dark" /> Serve notice
                </button>
                {canAct && p.onRex !== false && <ReletAction home={p} className={pill} />}
              </div>
              {actionErr && <p className="mt-2 text-[12px] text-accent-dark">{actionErr}</p>}
            </div>

            {/* At a glance: one line per board, each its own live read. */}
            <aside className="rounded-2xl border border-line/40 bg-white p-5">
              <p className="hand flex items-center gap-2 text-[15px]">
                <DoodleIcon name="magic-wand" size={15} className="text-accent-dark" />
                At a glance
              </p>
              <ul className="mt-4 space-y-3.5 text-[12.5px]">
                <Glance icon="shield" label="Compliance" onClick={() => pickTab("compliance")}>
                  {certs.state === "loading" ? <Loading label="Checking" /> : certs.state === "failed" ? <span className="text-muted">Not available</span>
                    : certs.data.outstanding > 0 ? <span className="font-semibold text-accent-dark">{certs.data.outstanding} outstanding</span>
                    : certs.data.checked && certs.data.rows > 0 ? "All in date" : <span className="text-muted">Nothing held yet</span>}
                </Glance>
                <Glance icon="setting" label="Maintenance" onClick={() => pickTab("maintenance")}>
                  {works.state === "loading" ? <Loading label="Reading" /> : works.state === "failed" ? <span className="text-muted">Not available</span>
                    : openJobs.length + works.data.carried.length > 0 ? <span className="font-semibold">{openJobs.length + works.data.carried.length} open {openJobs.length + works.data.carried.length === 1 ? "job" : "jobs"}</span>
                    : "No open jobs"}
                </Glance>
                <Glance icon="checklist" label="Inspections" onClick={() => pickTab("inspections")}>
                  {visits.state === "loading" ? <Loading label="Reading" /> : visits.state === "failed" ? <span className="text-muted">Not available</span>
                    : nextVisit ? `Booked ${stamp(nextVisit.bookedAt)}`
                    : owedVisit ? <span className={owedVisit.daysAway < 0 ? "font-semibold text-accent-dark" : ""}>{VISIT_KIND[owedVisit.kind] ?? "Visit"} {owedVisit.daysAway < 0 ? "overdue since" : "due"} {day(owedVisit.dueAt)}</span>
                    : openVisits.length ? `${openVisits.length} in hand` : "Nothing owed"}
                </Glance>
                <Glance icon="key" label="Tenancy" onClick={() => pickTab("tenancy")}>
                  {leaving ? <span className="font-semibold text-accent-dark">Leaving {leaving.moveOutOn ? day(leaving.moveOutOn) : "· date to set"}</span>
                    : tenancy.state === "loading" ? <Loading label="Reading" />
                    : tenancy.state === "ready" && tenancy.data.tenancy ? <TenancyLine t={tenancy.data.tenancy} />
                    : tenants.length ? `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}` : <span className="text-muted">No tenant on record</span>}
                </Glance>
              </ul>
            </aside>
          </div>
        </header>

        {/* ── the sections ─────────────────────────────────────────────── */}
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

        {tab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className={`${card} p-5 lg:col-span-2`}>
              {houseView && house ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                  <Fact label={lets ? "Lets on record" : "Rooms"} value={lets ? String(house.rooms.length) : `${house.rooms.length}, ${letRooms.length} let`} />
                  <Fact label={lets ? "Rent" : "Rent roll"} value={lets ? (p.rent == null ? "Not set" : `${money(p.rent)} ${p.rentPeriod === "week" ? "pw" : "pcm"}`) : roomRent ? `${money(roomRent)} pcm` : "Not set"} />
                  <Fact label="Postcode" value={p.postcode ?? "—"} />
                  <Fact label="Agent" value={p.agent?.name ?? "—"} />
                  <Fact label="On the books since" value={day(house.members.map((m) => m.onBooksSince).filter(Boolean).sort()[0] ?? null)} />
                  <Fact label="Service" value={house.house?.service ?? p.service ?? "Not set"} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                  <Fact label="Rent" value={p.rent == null ? "Not set" : `${money(p.rent)} ${p.rentPeriod === "week" ? "per week" : "pcm"}`} />
                  <Fact label="Let type" value={p.letType ?? "—"} />
                  <Fact label="Let since" value={day(p.letSince)} />
                  <Fact label="On the books since" value={day(p.onBooksSince)} />
                  <Fact label="Agent" value={p.agent?.name ?? "—"} />
                  <Fact label="Postcode" value={p.postcode ?? "—"} />
                </div>
              )}
            </section>

            <section className={`${card} p-5`}>
              <p className={`${eyebrow} mb-3`}>{houseView && house && !lets ? "Rooms" : tenants.length === 1 ? "Tenant" : "Tenants"}</p>
              {houseView && house && !lets ? (
                <ul className="overflow-hidden rounded-xl border border-line/50">
                  {house.rooms.map((r) => (
                    <li key={r.listingId} className="border-b border-line/40 last:border-0">
                      <button type="button" onClick={() => setRoom(r.listingId)} className="grid w-full grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-[12.5px] transition-colors hover:bg-box">
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

            <section className={`${card} p-5`}>
              <p className={`${eyebrow} mb-3`}>Landlord</p>
              {landlord ? (
                <div className="text-[13px]">
                  <PartyCard p={landlord} plain />
                  {landlord.email && landlord.email.includes("@") && (
                    <LandlordJobEmails key={landlord.email} landlord={landlord.email} name={landlord.name} className="mt-3 border-t border-line/40 pt-3" />
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">No landlord on record for this home.</p>
              )}
            </section>

            {shots.length > 1 && (
              <section className={`${card} p-5 lg:col-span-2`}>
                <p className={`${eyebrow} mb-3`}>Photos</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  {shots.map((src, i) => (
                    <button key={src + i} type="button" onClick={() => setLightbox(i)} aria-label={`Photo ${i + 1}`} className="group overflow-hidden rounded-xl border border-line/60 transition-colors hover:border-ink">
                      <PropertyPhoto src={src} alt="" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {everything && !p.test && p.onRex !== false && (
              <p className="text-[11.5px] text-muted lg:col-span-2">
                <a href={rexListingUrl(p.listingId, "leased")} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Open the record behind this home</a>
              </p>
            )}
          </div>
        )}

        {tab === "compliance" && (
          <div>
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
          <section className={`${card} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="hand flex items-center gap-2 text-[16px]"><DoodleIcon name="setting" size={16} className="text-accent-dark" /> Maintenance</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!canAct} onClick={() => setRaising("repair")} className={`${pill} disabled:opacity-40`}>Report a repair</button>
                <button type="button" disabled={!canAct} onClick={() => setRaising("planned")} className={`${pill} disabled:opacity-40`}>Plan a job</button>
              </div>
            </div>
            {works.state === "loading" ? <Loading label="Reading the jobs on this home" /> : works.state === "failed" ? <Failed error={works.error} /> : (
              <JobsList orders={works.data.orders} carried={works.data.carried} onOpen={setOpenJob} />
            )}
          </section>
        )}

        {tab === "inspections" && (
          <section className={`${card} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="hand flex items-center gap-2 text-[16px]"><DoodleIcon name="checklist" size={16} className="text-accent-dark" /> Inspections</h2>
              <button type="button" disabled={!canAct || visits.state !== "ready"} onClick={() => void bookVisit()} className={`${pill} disabled:opacity-40`}>Book an inspection</button>
            </div>
            {visits.state === "loading" ? <Loading label="Reading the visits on this home" /> : visits.state === "failed" ? <Failed error={visits.error} /> : (
              <VisitsList data={visits.data} />
            )}
          </section>
        )}

        {tab === "tenancy" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className={`${card} p-5`}>
              <p className={`${eyebrow} mb-3`}>The tenancy</p>
              {tenancy.state === "loading" ? <Loading label="Reading the tenancy" /> : tenancy.state === "failed" ? <Failed error={tenancy.error} /> : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
                  <Fact label="Tenants" value={tenants.length ? tenants.map((t) => t.name).join(", ") : "None on record"} />
                  <Fact label="Rent" value={p.rent == null ? "Not set" : `${money(p.rent)} ${p.rentPeriod === "week" ? "per week" : "pcm"}`} />
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
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className={eyebrow}>Moving out</p>
                <button type="button" disabled={!canAct || !tenants.length} onClick={() => setNoticing(true)} className={`${pill} disabled:opacity-40`}>
                  <DoodleIcon name="logout" size={13} className="text-accent-dark" /> Tenant gave notice
                </button>
              </div>
              {ending.state === "loading" ? <Loading label="Reading reviews and move-outs" /> : ending.state === "failed" ? <Failed error={ending.error} /> : (
                <EndingList data={ending.data} />
              )}
            </section>

            {/* Rent review (Section 13) and Serve notice (Section 8): Michael's
                checklists, filled in here and decided on his Sections tab
                (components/sections). A house let by the room is a tenancy
                per room, so those start from the room. */}
            <div id="notices" className={`${card} scroll-mt-6 p-5 lg:col-span-2`}>
              {houseView && house && !lets ? (
                <>
                  <p className={`${eyebrow} mb-2`}>Rent review and notices</p>
                  <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">Each room is its own tenancy. Pick a room at the top to start its rent review or notice.</p>
                </>
              ) : (
                <HomeNotices
                  key={p.listingId}
                  home={{
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
                  }}
                />
              )}
            </div>

            {reviewDue && (
              <section className={`${card} p-5 lg:col-span-2`}>
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
      </div>

      {lightbox != null && <PhotoLightbox photos={shots} start={lightbox} name={title} onClose={() => setLightbox(null)} />}

      {raising && raiseHome && (
        <RaiseJob
          kind={raising}
          home={raiseHome}
          contractors={works.state === "ready" ? works.data.contractors : []}
          onClose={() => setRaising(null)}
          onRaised={(o) => {
            setRaising(null);
            loadWorks();
            pickTab("maintenance");
            /* Straight on to telling the landlord, as on Maintenance. */
            setOpenJob(o);
          }}
        />
      )}

      {openJob && (
        <JobDrawer
          order={openJob}
          contractors={works.state === "ready" ? works.data.contractors : []}
          canCorporate={works.state === "ready" && works.data.canCorporate}
          onClose={() => setOpenJob(null)}
          onChanged={(o) => { setOpenJob(o); loadWorks(); }}
        />
      )}

      {booking && visits.state === "ready" && (
        <BookVisit
          inspection={booking}
          team={visits.data.team}
          me={visits.data.me}
          onClose={() => setBooking(null)}
          onBooked={() => { setBooking(null); loadVisits(); pickTab("inspections"); }}
        />
      )}

      {noticing && propertyId && (
        <NoticeSheet
          propertyId={propertyId}
          propertyName={house ? house.name : p.name}
          tenants={tenants}
          landlord={landlord?.name ?? ""}
          rent={p.rent == null ? "" : `${money(p.rent)} ${p.rentPeriod === "week" ? "pw" : "pcm"}`}
          onClose={() => setNoticing(false)}
          onSaved={() => { setNoticing(false); loadEnding(); pickTab("tenancy"); }}
        />
      )}
    </SaveScopeProvider>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────── */

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-[13px]">{value}</p>
    </div>
  );
}

function Glance({ icon, label, onClick, children }: { icon: string; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="group flex w-full items-start gap-3 text-left">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft/70 text-accent-dark">
          <DoodleIcon name={icon} size={13} />
        </span>
        <span className="min-w-0">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted group-hover:text-ink">{label}</span>
          <span className="block">{children}</span>
        </span>
      </button>
    </li>
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
        <button type="button" onClick={() => onOpen(o)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-box sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,220px)_auto]">
          <span className="hidden text-[11.5px] text-muted sm:block">#{o.ref} · {o.kind === "repair" ? "Repair" : "Planned"}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{o.title}</span>
            <span className="block truncate text-[11.5px] text-muted">{o.category} · reported {shortDay(o.reportedAt ?? o.createdAt)}</span>
          </span>
          <span className={`hidden truncate text-[12px] sm:block ${next.hot ? "font-semibold text-accent-dark" : "text-muted"}`}>{next.text}</span>
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

function BookVisit({ inspection, team, me, onClose, onBooked }: { inspection: Inspection; team: Person[]; me: Person | null; onClose: () => void; onBooked: () => void }) {
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
    <Modal title="Book an inspection" eyebrowText={`${VISIT_KIND[inspection.kind] ?? "Visit"} · ${inspection.propertyName}`} onClose={onClose}>
      <BookForm inspection={inspection} team={team} me={me} busy={busy} onMove={move} />
      {err && <p className="mt-3 text-[12.5px] text-accent-dark">{err}</p>}
      <p className="mt-4 text-[11.5px] text-muted">
        The full visit sheet, with the write-up and the report, is on <Link href={`/inspections?open=${encodeURIComponent(inspection.id)}`} className="underline underline-offset-2">Inspections</Link>.
      </p>
    </Modal>
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
    <Modal title="Tenant gave notice" eyebrowText={propertyName} onClose={onClose}>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Record the notice the {tenants.length > 1 ? "tenants have" : "tenant has"} given. It goes onto Move-outs with the day they leave, so the check-out, keys, meters, deposit and re-let follow from there. A notice from the landlord is Serve notice, on this page.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>Notice given on</span>
          <input type="date" value={served} onChange={(e) => setServed(e.target.value)} className={field} />
        </label>
        <label>
          <span className={label}>They leave on</span>
          <input type="date" value={leaving} min={served} onChange={(e) => setLeaving(e.target.value)} className={field} />
        </label>
        <label className="sm:col-span-2">
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
    </Modal>
  );
}

function Modal({ title, eyebrowText, onClose, children }: { title: string; eyebrowText: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />
      <div className="fade-up relative w-full max-w-xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted">{eyebrowText}</p>
            <h2 className="mt-1 text-[22px] leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
