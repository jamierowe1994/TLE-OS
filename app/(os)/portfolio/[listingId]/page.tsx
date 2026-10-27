"use client";
import OsAddressLine from "@/components/OsAddressLine";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import RaiseJob, { type RaiseDraft } from "@/components/maintenance/RaiseJob";
import { OPEN, day as shortDay, nextFor, statusLabel } from "@/components/maintenance/works-ui";
import BookForm, { type Person } from "@/components/inspections/BookForm";
import SentEmails from "@/components/inspections/SentEmails";
import RentBox from "@/components/portfolio/RentBox";
import ServiceTag from "@/components/portfolio/ServiceTag";
import HomeAgent from "@/components/portfolio/HomeAgent";
import HomeKeys from "@/components/portfolio/HomeKeys";
import HomeSource from "@/components/portfolio/HomeSource";
import ContactBlock from "@/components/ContactBlock";
import TenantCard from "@/components/new-look/TenantCard";
import HomeLandlords from "@/components/HomeLandlords";
import { ChangeLandlordButton, ListingChangedLandlord } from "@/components/landlord/ChangeLandlord";
import { HomeRightToRent } from "@/components/RightToRentField";
import SendLogins from "@/components/portfolio/SendLogins";
import Guarantors from "@/components/Guarantors";
import { SPECS, STATUS_LABEL as NOTICE_STATUS, type Notice, type NoticeKind } from "@/lib/section-notices-spec";
import type { PropertyDraft } from "@/lib/property-drafts";
import { readJson } from "@/lib/page-cache";
import { ORDER_KEY } from "@/lib/portfolio-order";
import { rexListingUrl } from "@/lib/business/rex-links";
import { housesIn, houseByListing, roomLabel, tenantsInOrder, pickerOption, MANAGED_READERS as R, type House } from "@/lib/houses";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";
import type { Contractor, WorksOrder } from "@/lib/works-orders";
import type { CarriedJob } from "@/lib/works-carried";
import type { DueVisit, Inspection, InspectionEvent } from "@/lib/inspections";
import type { DueReview, Review } from "@/lib/tenancy-reviews";
import type { MoveOut, OpenMoveOut } from "@/lib/move-outs";
import PastTenancies from "@/components/portfolio/PastTenancies";
import PastTenantPeople from "@/components/portfolio/PastTenantPeople";
import SendToTenants from "@/components/portfolio/SendToTenants";
import SendRecord from "@/components/portfolio/SendRecord";
import { oneLine, ThreadView, type Thread } from "@/components/MailThreads";
import { PropolyMailView, type PropolyMail } from "@/components/MoveInPack";
import RecordFiles from "@/components/portfolio/RecordFiles";
import FileDocuments from "@/components/FileDocuments";
import RecordPastVisit from "@/components/inspections/RecordPastVisit";
import TenantChange from "@/components/portfolio/TenantChange";
import TakeOnTile from "@/components/portfolio/TakeOnTile";
import HomeNotes from "@/components/portfolio/HomeNotes";
import { useNewLook } from "@/lib/use-new-look";
import { Badge, Tabs, Menu, Ico, type MenuItem, type Tone } from "@/components/new-look/Parts";
import PhotoGrid from "@/components/new-look/PhotoGrid";
import type { IncomingLet } from "@/app/api/portfolio/incoming/route";

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

/* "overview" is the new look's first tab (lib/new-look "property"); the old page has no such tab. */
type Tab = "overview" | "maintenance" | "compliance" | "inspections" | "tenancy" | "documents" | "notes";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "maintenance", label: "Maintenance", icon: "setting" },
  { id: "compliance", label: "Compliance", icon: "shield" },
  { id: "inspections", label: "Inspections", icon: "checklist" },
  { id: "tenancy", label: "Tenancy", icon: "key" },
  /* Kirstie Mulholland, 19 Oct 2026: somewhere for everything that isn't a
     certificate, and a way to add it once the let has gone through. */
  { id: "documents", label: "Documents", icon: "folder" },
  /* Sean McMahon, 20 Oct 2026: a tenant's email or a query, and nowhere on
     the home to note it. */
  { id: "notes", label: "Notes", icon: "note" },
];

/** The pop-up open over the page: an action, picked up from a draft or fresh. */
type Action =
  | { kind: "repair" | "planned"; draft?: PropertyDraft }
  | { kind: "inspection"; inspection: Inspection }
  | { kind: "notices"; start: NoticeKind }
  | { kind: "tenant-notice"; draft?: PropertyDraft }
  | { kind: "swap" }
  | { kind: "swap-open" }
  | { kind: "past-visit" };
const DRAFT_TITLE: Record<string, string> = { repair: "Report a repair", planned: "Plan a certificate", "tenant-notice": "Tenant gave notice" };

/** One line on the latest activity list. */
type Activity = { key: string; at: string; icon: string; title: string; sub: string; hot?: boolean; go?: () => void; unfinished?: boolean; bin?: () => void };
const REVIEW_OUTCOME: Record<string, string> = {
  increase: "Rent increased", renewed: "Renewed, same rent", no_change: "No change", ending: "Tenancy ending", other: "Reviewed",
};


type Loaded<T> = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; data: T };
/** A tenant swap under way on the home (GET /api/tenant-swaps, 16 Oct 2026). */
type SwapUnderWay = {
  application: string;
  swap: { kind?: string; label?: string; rereference?: string[]; leaving: string[]; staying: string[]; joining: string[]; moveIn: string; rentPcm: number | null; rentPortion: number | null; by: string; at: string };
  plc: { state: string; label: string; who: string; short: string } | null;
};

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
/* The dashboard's hover (block-pop in globals.css): the box steps up and
   left and a hard ink slab shows on the right and bottom. Written out here
   rather than the class, so it can stand still while a box holds a pop-up -
   a moved box would carry a fixed pop-up inside it along with it. */
const pop =
  "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [&:hover:not(:has(.fixed))]:-translate-x-[3px] [&:hover:not(:has(.fixed))]:-translate-y-[3px] [&:hover:not(:has(.fixed))]:shadow-[6px_6px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]";
const box = `${pop} rounded-2xl border border-line/70 bg-white`;

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
  const [noteCount, setNoteCount] = useState(0);
  const [room, setRoom] = useState<string>("house");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  /* The new look (lib/new-look "property", 23 Oct 2026): it opens on Overview,
     and its photos open in the shared photo grid. */
  const look = useNewLook("property");
  const firstTab = look ? "overview" : "maintenance";
  const [gridFrom, setGridFrom] = useState<DOMRect | null>(null);
  const heroRef = useRef<HTMLButtonElement | null>(null);
  const tabAsked = useRef(false);

  /* Same read as the Portfolio list, so arriving from it paints at once.
     Read again after Change address, so the new name shows (27 Oct 2026). */
  const [bookRev, setBookRev] = useState(0);
  useEffect(() => {
    let live = true;
    readJson<Book>("/api/portfolio", (j) => Boolean(j?.ok))
      .then((j) => { if (live) setBook((cur) => (j.ok ? { state: "ready", data: j } : bookRev && cur.state === "ready" ? cur : { state: "failed", error: j.error ?? "The book could not be read." })); })
      .catch((e) => { if (live) setBook((cur) => (bookRev && cur.state === "ready" ? cur : { state: "failed", error: e instanceof Error ? e.message : "The book could not be read." })); });
    return () => { live = false; };
  }, [bookRev]);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("tab");
      if (t && (TABS.some((x) => x.id === t) || t === "overview")) { setTab(t as Tab); tabAsked.current = true; }
      /* ?email=certificates (the compliance drawer's Email Certificates) opens it straight away. */
      if (sp.get("email") === "certificates") {
        /* &start=<document>: one certificate's Email Tenant, from the compliance drawer or the desk. */
        const start = sp.get("start");
        setSendOpen(start ? { start, heading: "Email Tenant" } : { start: null, heading: "Email Certificates" });
      }
      const o = JSON.parse(sessionStorage.getItem(ORDER_KEY) ?? "[]");
      if (Array.isArray(o)) setOrder(o.map(String));
    } catch { /* fine */ }
  }, []);
  /* On a phone the tabs scroll sideways; the one picked slides into view
     (Documents, the fifth, sat off the edge when Add a document opened it). */
  const tabsRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = tabsRef.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: Math.max(0, on.offsetLeft - nav.offsetLeft - 16), behavior: "smooth" });
  }, [tab, book.state]);
  const pickTab = useCallback((t: Tab) => {
    setTab(t);
    try {
      const u = new URL(window.location.href);
      if (t === firstTab) u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
      window.history.replaceState(null, "", u.toString());
    } catch { /* fine */ }
  }, [firstTab]);
  /* The new look lands on Overview unless the link asked for a tab; the old
     page has no Overview, so it falls back to Maintenance there. */
  useEffect(() => {
    if (look === true && !tabAsked.current) { tabAsked.current = true; setTab("overview"); }
    if (look === false) setTab((t) => (t === "overview" ? "maintenance" : t));
  }, [look]);

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
    router.push(`/portfolio/${encodeURIComponent(order[(i + d + order.length) % order.length])}${tab === firstTab ? "" : `?tab=${tab}`}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (action || openJob || showAll || showLogins || sendOpen || recordOpen || threadOpen || mailOpen || lightbox != null || gridFrom) return;
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
  const [certs, setCerts] = useState<Loaded<{ outstanding: number; checking: number; checked: boolean; rows: number; filed: { label: string; at: string }[] }>>({ state: "loading" });
  const [notices, setNotices] = useState<Loaded<Notice[]>>({ state: "loading" });
  /* How many notes the home holds, for the Notes tab's count before it is opened. */
  useEffect(() => {
    if (!p) return;
    let live = true;
    const sp = new URLSearchParams({ listing: String(p.listingId) });
    if (propertyId) sp.set("property", propertyId);
    fetch(`/api/property/notes?${sp}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setNoteCount((j.notes as unknown[]).length); })
      .catch(() => null);
    return () => { live = false; };
  }, [propertyId, p?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    getJson<{ outstanding: number; checking?: number; checked: boolean; rows: { state: string; label: string; files: { uploadedAt: string | null }[] }[] }>(`/api/property-file?property=${encodeURIComponent(propertyId)}`)
      .then((j) => setCerts({
        state: "ready",
        data: {
          outstanding: j.outstanding ?? 0,
          checking: j.checking ?? 0,
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
  /* A job opens on its own page, /maintenance/<id> (James, 21 Oct 2026), with
     this home's photos at the top. A row, the activity list and a raised job all go there. */
  const [openJob, setOpenJob] = useState<WorksOrder | null>(null);
  useEffect(() => { if (openJob) router.push(`/maintenance/${encodeURIComponent(openJob.id)}`); }, [openJob, router]);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showLogins, setShowLogins] = useState(false);

  /* Send to tenants (Josel, 20 Oct 2026, lib/home-send): certificates and
     documents by email, from whoever presses. Each press is kept and shows
     in the latest activity. The lets are the room, or every let of the house. */
  const [sendOpen, setSendOpen] = useState<{ start: string | null; heading?: string } | null>(null);
  /* The record of one send (Email Certificates, 20 Oct 2026): from the activity. */
  const [recordOpen, setRecordOpen] = useState<string | null>(null);
  const [sends, setSends] = useState<{ id: string; at: string; by: string; documents: string[]; results: { sent: boolean }[] }[]>([]);
  const sendListings = useMemo(() => (p ? (roomP ? [roomP] : house ? house.members : [p]).map((x) => String(x.listingId)) : []), [p, roomP, house]);
  const loadSends = useCallback(() => {
    if (!p || p.test) return;
    fetch(`/api/portfolio/send-to-tenants?history=1&listing=${encodeURIComponent(p.listingId)}&listings=${encodeURIComponent(sendListings.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setSends(j.sends ?? []); })
      .catch(() => undefined);
  }, [p?.listingId, sendListings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSends(); }, [loadSends]);

  /* Email replies on this home's PLC threads (lib/mail-threads, 21 Oct 2026):
     each message logged is a line in the latest activity, opening its thread. */
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadOpen, setThreadOpen] = useState<Thread | null>(null);
  useEffect(() => {
    if (!p || p.test) return;
    let live = true;
    fetch(`/api/mail-threads?listing=${encodeURIComponent(p.listingId)}&listings=${encodeURIComponent(sendListings.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setThreads(j.threads ?? []); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [p?.listingId, sendListings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Propoly's emails about this home, the move-in pack above all
     (lib/propoly-mail, 22 Oct 2026): read from the agents' Outlook, each a
     line in the latest activity, opening the email and its files. */
  const [propolyMail, setPropolyMail] = useState<PropolyMail[]>([]);
  const [mailOpen, setMailOpen] = useState<PropolyMail | null>(null);
  useEffect(() => {
    if (!p || p.test) return;
    let live = true;
    fetch(`/api/propoly-mail?listing=${encodeURIComponent(p.listingId)}&listings=${encodeURIComponent(sendListings.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setPropolyMail(j.mail ?? []); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [p?.listingId, sendListings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A swap made on this home (Lianna, 16 Oct 2026): she came back to the
     home for the swap's PLC check and found no sign of it here, so the
     Tenant swap tile turns into the swap under way, with the way to its PLC. */
  const [swapOn, setSwapOn] = useState<SwapUnderWay | null>(null);
  useEffect(() => {
    if (!p?.listingId) return;
    let live = true;
    setSwapOn(null);
    fetch(`/api/tenant-swaps?listingId=${encodeURIComponent(p.listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && j.swap) setSwapOn({ application: j.application, swap: j.swap, plc: j.plc ?? null }); })
      .catch(() => { /* no swap shown; making one still works */ });
    return () => { live = false; };
  }, [p?.listingId]);

  /* The let on its way in (Joe Patten, 26 Oct 2026; /api/portfolio/incoming):
     a home REX has as let with nobody on it, because its let went straight
     into Propoly, shows who is moving in and opens their let - rather than
     a greyed-out Change the tenants and no word why. New look only. */
  const [incoming, setIncoming] = useState<IncomingLet[]>([]);
  useEffect(() => {
    if (!look || !p?.listingId || p.test) return;
    let live = true;
    setIncoming([]);
    fetch(`/api/portfolio/incoming?listing=${encodeURIComponent(p.listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setIncoming(j.lets ?? []); })
      .catch(() => { /* nothing shown; the home reads as before */ });
    return () => { live = false; };
  }, [look, p?.listingId, p?.test]);

  /* ── drafts: a form started and not sent (lib/property-drafts) ───────── */
  const [drafts, setDrafts] = useState<Loaded<PropertyDraft[]>>({ state: "loading" });
  const loadDrafts = useCallback(() => {
    if (!p) return;
    getJson<{ drafts: PropertyDraft[] }>(`/api/property-drafts?listing=${encodeURIComponent(p.listingId)}`)
      .then((j) => setDrafts({ state: "ready", data: j.drafts ?? [] }))
      .catch((e) => setDrafts({ state: "failed", error: e.message }));
  }, [p?.listingId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadDrafts(); }, [loadDrafts]);
  /* One draft per open form; saves run one after another so the first
     save's id is the one every later save updates. */
  const draftId = useRef<string | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const keepDraft = (kind: PropertyDraft["kind"], data: Record<string, unknown>) => {
    if (!p) return;
    const listing = p.listingId;
    const property = p.propertyId;
    saving.current = saving.current.then(async () => {
      const r = await fetch("/api/property-drafts", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draftId.current, listingId: listing, propertyId: property, kind, data }),
      }).then((x) => x.json()).catch(() => null);
      if (r?.ok) draftId.current = r.draft.id;
    });
  };
  const binDraft = async (id: string | null) => {
    if (!id) return;
    await fetch(`/api/property-drafts?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  };

  /* Every action is a pop-up over the page (James, 7 Oct 2026); what it
     leaves behind shows in the latest activity. */
  const act = useCallback((a: Action | null) => {
    if (a) draftId.current = "draft" in a && a.draft ? a.draft.id : null;
    setAction(a);
    setActionErr(null);
  }, []);
  /* Closed without sending: whatever was typed is a draft now. */
  const closeAction = useCallback(() => {
    setAction(null);
    void saving.current.then(() => loadDrafts());
  }, [loadDrafts]);
  /* Sent: the draft has done its job. */
  const finishAction = useCallback(async () => {
    setAction(null);
    await saving.current;
    await binDraft(draftId.current);
    draftId.current = null;
    loadDrafts();
  }, [loadDrafts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (book.state === "loading") {
    return (
      <div className="py-16">
        <Loading label="Opening the property…" />
      </div>
    );
  }
  if (book.state === "failed" && look) {
    return (
      <div data-look="new" className="nl-page py-16" role="alert">
        <h1 className="nl-block-title">The book could not be read</h1>
        <p className="nl-meta mt-1.5 max-w-xl">{book.error}</p>
        <Link href="/portfolio" className="nl-btn nl-btn--secondary nl-btn--sm mt-4">Back to Properties</Link>
      </div>
    );
  }
  if (book.state === "ready" && (!home || !p) && look) {
    return (
      <div data-look="new" className="nl-page py-16">
        <h1 className="nl-block-title">This home isn&apos;t in your book</h1>
        <p className="nl-meta mt-1.5 max-w-xl">It may belong to another agent, or the link is wrong.</p>
        <Link href="/portfolio" className="nl-btn nl-btn--secondary nl-btn--sm mt-4">Back to Properties</Link>
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
  /* What the house brings in (James, 9 Oct 2026): the rooms' rents added
     up. A rent on the house's own record is not a total (see RentBox). */
  const pricedRooms = house ? house.rooms.filter((r) => r.rentMonthly).length : 0;
  const houseLine = !house || lets || roomRent <= 0 ? null : `${money(roomRent)} pcm from ${pricedRooms} ${pricedRooms === 1 ? "room" : "rooms"}`;
  const sub = [
    house ? house.locality : p.locality,
    p.postcode && !(house ? house.locality : p.locality).includes(p.postcode) ? p.postcode : null,
    house && !lets ? `shared house · ${house.rooms.length} ${house.rooms.length === 1 ? "room" : "rooms"}, ${letRooms.length} let` : null,
  ].filter(Boolean).join(" · ");
  const canAct = !p.test && Boolean(propertyId);
  /* The lets whose tenants Send out logins covers: the room picked, or every
     let of the house, or the home. */
  const loginListings = (roomP ? [roomP] : house ? house.members : [p]).filter((x) => x.tenants.length > 0).map((x) => String(x.listingId));

  /* Change landlord (Dan Richards, 17 Oct 2026, lib/landlord-change): the
     new one shows on every let of the home at once; an undo reads the book
     again so the landlord before comes back as it was. */
  const landlordChanged = (c: { id: string; name: string; email: string | null; phone: string | null }) =>
    setBook((b) => (b.state === "ready"
      ? { ...b, data: { ...b.data, properties: b.data.properties.map((x) => (x.propertyId === propertyId ? { ...x, landlord: { contactId: `changed:${c.id}`, name: c.name, email: c.email, phone: c.phone } } : x)) } }
      : b));
  const landlordUndone = () => {
    fetch("/api/portfolio", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setBook({ state: "ready", data: j }); })
      .catch(() => undefined);
  };
  const homeLine = [title, p.locality, p.postcode].filter(Boolean).join(", ");

  const raiseHome = propertyId
    ? { id: propertyId, name: house ? house.name : p.name, locality: p.locality, landlord: landlord?.name, tenant: tenants[0]?.name ?? null }
    : null;

  /* Book a visit: the one already in hand, or a new one raised for this home. */
  async function bookVisit() {
    if (!p || !propertyId || visits.state !== "ready") return;
    setActionErr(null);
    /* A property visit - the six-monthly look round on a twelve-month cycle
       (James, 7 Oct 2026) - not a check-in or check-out inspection. */
    const inHand = visits.data.inspections.find((i) => i.kind === "interim" && ["due", "arranging", "no_access"].includes(i.status));
    if (inHand) return act({ kind: "inspection", inspection: inHand });
    const owed = visits.data.due.find((d) => d.kind === "interim");
    const t = tenants[0];
    const r = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "interim",
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

  /* Book the check-out: the one already open on this home, or a new
     check-out visit due on the day they leave. Only offered once notice is in. */
  async function bookCheckout() {
    if (!p || !propertyId || visits.state !== "ready") return;
    setActionErr(null);
    const inHand = visits.data.inspections.find((i) => i.kind === "check_out" && OPEN_VISIT.includes(i.status));
    if (inHand) return act({ kind: "inspection", inspection: inHand });
    const t = tenants[0];
    const r = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "check_out",
        propertyName: house ? house.name : p.name,
        locality: p.locality,
        propertyId,
        listingId: p.listingId,
        landlord: landlord?.name ?? "",
        landlordEmail: landlord?.email ?? "",
        tenant: leaving?.tenant || t?.name || "",
        tenantEmail: t?.email || "",
        tenantPhone: t?.phone || "",
        tenancyStart: tenancy.state === "ready" ? tenancy.data.tenancy?.startDate ?? null : null,
        dueAt: leaving?.moveOutAt ?? new Date().toISOString(),
        osPropertyId: leaving?.osPropertyId ?? null,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return setActionErr(r?.error ?? "The check-out could not be raised.");
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

  /* RE-LET AND CHECK-OUT WAIT FOR NOTICE (Michael and James, 8 Oct 2026).
     "Technically they could relet that property by accident" - a new listing
     on a home whose tenant is still in contract, and Portfolio then thinks
     nobody lives there. So both buttons stay hidden until notice is in: the
     tenant has given notice (an open move-out, ours or REX PM's), or a
     Section 8 has been approved by compliance and served. Re-let also stays
     once the move-out is closed as moved out since this let began. Not "no
     tenant on the record": REX names nobody on hundreds of let homes, and the
     PayProp tenancy reads blank when it is not read yet or matches an older
     let, so blank never means empty. A board still loading, or one that
     failed, counts as no notice, and keeps both hidden. */
  const s8Served = notices.state === "ready" && notices.data.some((n) => n.kind === "s8" && n.status === "served");
  const noticeIn = Boolean(leaving) || s8Served;
  const letFrom = p.letSince ? p.letSince.slice(0, 10) : "";
  const movedOut = ending.state === "ready" && ending.data.done.some((m) => m.outcome === "moved_out" && (m.movedOutOn ?? m.doneAt.slice(0, 10)) >= letFrom);
  const mayRelet = noticeIn || movedOut;

  const rentLine = p.rent == null ? null : `${money(p.rent)} ${p.rentPeriod === "week" ? "pw" : "pcm"}`;
  /* No rent is said, never left as a dash (Lianna Denholm, 22 Oct 2026): the
     next tenancy's rent where PayProp has one set up, or why there is none. */
  const noRent = p.rentStarts ? `${money(p.rentStarts.monthly)} pcm from ${day(p.rentStarts.from)}` : p.rentUnread ? "Rent not read - PayProp couldn't be reached" : "No rent found";

  /* ── the latest activity: every board's newest, one list ─────────────── */
  const reading = [works, visits, ending, notices, certs, drafts].some((x) => x.state === "loading");
  const activity: Activity[] = [];
  if (works.state === "ready") {
    for (const o of works.data.orders) {
      const next = nextFor(o);
      activity.push({ key: `job-${o.id}`, at: o.reportedAt ?? o.createdAt, icon: o.kind === "repair" ? "setting" : "calendar", title: `${o.kind === "repair" ? "Repair" : "Planned job"} · ${o.title}`, sub: `${statusLabel(o)} · ${next.text}`, hot: next.hot && OPEN.includes(o.status), go: () => setOpenJob(o) });
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
      const draft = n.status === "draft";
      activity.push({
        key: `notice-${n.id}`,
        at: n.updatedAt ?? n.createdAt,
        icon: n.kind === "s13" ? "coin" : "file-contract",
        title: draft ? `${SPECS[n.kind].button} · not finished` : `${SPECS[n.kind].button} · ${SPECS[n.kind].short}`,
        sub: draft ? `Started by ${n.agentName} · ${SPECS[n.kind].short}` : `${NOTICE_STATUS[n.status]} · ${n.agentName}`,
        hot: n.status === "returned",
        unfinished: draft,
        go: () => act({ kind: "notices", start: n.kind }),
        bin: draft ? async () => {
          await fetch(`/api/section-notices/${encodeURIComponent(n.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "withdraw" }) }).catch(() => null);
          loadNotices();
        } : undefined,
      });
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
  for (const x of sends) {
    const went = x.results.filter((r) => r.sent).length;
    activity.push({ key: `send-${x.id}`, at: x.at, icon: "mail", title: `Sent to tenants · ${x.documents.join(", ")}`, sub: `${went} of ${x.results.length} sent · ${x.by}`, hot: went < x.results.length, go: () => setRecordOpen(x.id) });
  }
  for (const m of propolyMail) {
    const kept = m.attachments.filter((f) => f.key).length;
    activity.push({
      key: `propoly-mail-${m.id}`, at: m.at, icon: "mail",
      title: m.kind === "move-in" ? "Move-in pack sent" : "Propoly email",
      sub: `${m.subject || "(no subject)"}${kept ? ` · ${kept} ${kept === 1 ? "file" : "files"}` : ""}`.slice(0, 140),
      go: () => setMailOpen(m),
    });
  }
  for (const t of threads) {
    for (const m of t.messages) {
      activity.push({
        key: `mail-${m.id}`, at: m.at, icon: "mail",
        title: m.ours ? `Email from ${m.fromName || m.fromEmail}` : `Reply from ${m.fromName || m.fromEmail}`,
        sub: `${t.caseId ? "PLC · " : ""}${oneLine(m.preview) || m.subject}`.slice(0, 140),
        go: () => setThreadOpen(t),
      });
    }
  }
  if (drafts.state === "ready") {
    for (const d of drafts.data) {
      const what = String((d.data as RaiseDraft).title || (d.data as { leaving?: string }).leaving && `leaving ${day(String((d.data as { leaving?: string }).leaving))}` || "");
      activity.push({
        key: `draft-${d.id}`,
        at: d.updatedAt,
        icon: d.kind === "repair" ? "setting" : d.kind === "planned" ? "calendar" : "logout",
        title: `${DRAFT_TITLE[d.kind] ?? "Form"} · not finished`,
        sub: [what, `started by ${d.startedBy}`].filter(Boolean).join(" · "),
        unfinished: true,
        go: () => act(d.kind === "tenant-notice" ? { kind: "tenant-notice", draft: d } : { kind: d.kind, draft: d }),
        bin: async () => { await binDraft(d.id); loadDrafts(); },
      });
    }
  }
  /* Unfinished first - they are waiting on somebody - then newest first. */
  const allActivity = activity
    .filter((a) => a.at)
    .sort((a, b) => Number(Boolean(b.unfinished)) - Number(Boolean(a.unfinished)) || b.at.localeCompare(a.at));
  /* Five in the box; the rest in View all (James, 7 Oct 2026). */
  const latest = allActivity.slice(0, 5);

  const chip = "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-white px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40";
  /* The tiles pop too, tighter - 2px up, a 3px slab - so a lifted tile never
     reaches the one beside it. */
  const tile = "flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-xl border border-line/60 bg-white p-3.5 text-left text-[12.5px] font-semibold leading-tight transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))] disabled:pointer-events-none disabled:opacity-40";
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

  /* The pop-ups, the same in both looks: every action opens over the page. */
  const popups = (
    <>
      {lightbox != null && <PhotoLightbox photos={shots} start={lightbox} name={title} onClose={() => setLightbox(null)} />}

      {showAll && <AllActivity title={title} items={allActivity} reading={reading} onClose={() => setShowAll(false)} />}

      {/* ── the pop-ups ───────────────────────────────────────────────── */}
      {action && (action.kind === "repair" || action.kind === "planned") && raiseHome && (() => {
        const raise = (
          <RaiseJob
            key={`${action.kind}-${action.draft?.id ?? "new"}`}
            inline={!look}
            /* The new look plans a job as the Contractors page does: the
               floating boxes over a darkened page, a box per category
               (James, 27 Oct 2026). The home is this one, so it opens on
               what's wrong. */
            look={look ? "float" : undefined}
            kind={action.kind}
            home={raiseHome}
            draft={(action.draft?.data as RaiseDraft | undefined) ?? null}
            onDraft={(d) => keepDraft(action.kind, d as Record<string, unknown>)}
            contractors={works.state === "ready" ? works.data.contractors : []}
            onClose={closeAction}
            onRaised={(o) => {
              void finishAction();
              loadWorks();
              pickTab("maintenance");
              /* Straight on to telling the landlord, as on Maintenance. */
              setOpenJob(o);
            }}
          />
        );
        return look ? raise : <Modal onClose={closeAction} wide>{raise}</Modal>;
      })()}
      {action?.kind === "inspection" && visits.state === "ready" && (
        <Modal onClose={closeAction} title={action.inspection.kind === "check_out" ? "Book the check-out" : "Book a property visit"} wide>
          <BookVisit
            inspection={action.inspection}
            team={visits.data.team}
            me={visits.data.me}
            onBooked={() => { setAction(null); loadVisits(); pickTab("inspections"); }}
          />
        </Modal>
      )}
      {action?.kind === "past-visit" && visits.state === "ready" && propertyId && (
        <Modal onClose={closeAction} title="Record a past visit" wide>
          <RecordPastVisit
            home={{
              propertyName: house ? `${house.name}${roomP ? ` · ${roomLabel(roomP)}` : ""}` : p.name,
              locality: p.locality,
              propertyId,
              listingId: String(p.listingId),
              address: noticeHome.address,
              rexPropertyId: /^\d+$/.test(propertyId) ? propertyId : null,
              landlord: landlord?.name ?? "",
              landlordEmail: landlord?.email ?? "",
              tenant: tenants.map((t) => t.name).join(", "),
              tenantEmail: tenants[0]?.email ?? "",
              tenantPhone: tenants[0]?.phone ?? "",
              tenancyStart: tenancy.state === "ready" ? tenancy.data.tenancy?.startDate ?? null : null,
            }}
            open={visits.data.inspections}
            due={visits.data.due}
            me={visits.data.me?.name ?? ""}
            onCancel={closeAction}
            onDone={() => { setAction(null); loadVisits(); pickTab("inspections"); }}
          />
        </Modal>
      )}
      {sendOpen && (
        <SendToTenants
          listing={String(p.listingId)}
          listings={loginListings}
          title={roomP ? `${roomLabel(roomP)}, ${title}` : title}
          heading={sendOpen.heading}
          start={sendOpen.start}
          onClose={() => setSendOpen(null)}
          onSent={loadSends}
        />
      )}
      {recordOpen && <SendRecord id={recordOpen} onClose={() => setRecordOpen(null)} />}
      {threadOpen && <ThreadView thread={threadOpen} onClose={() => setThreadOpen(null)} />}
      {mailOpen && <PropolyMailView mail={mailOpen} onClose={() => setMailOpen(null)} />}
      {showLogins && <SendLogins listings={loginListings} title={roomP ? `${roomLabel(roomP)}, ${title}` : title} onClose={() => setShowLogins(false)} />}
      {action?.kind === "tenant-notice" && propertyId && (
        <Modal onClose={closeAction} title="Tenant gave notice">
          <NoticeSheet
            propertyId={propertyId}
            propertyName={house ? house.name : p.name}
            tenants={tenants}
            landlord={landlord?.name ?? ""}
            rent={rentLine ?? ""}
            draft={(action.draft?.data as NoticeDraft | undefined) ?? null}
            onDraft={(d) => keepDraft("tenant-notice", d as Record<string, unknown>)}
            onClose={closeAction}
            onSaved={() => { void finishAction(); loadEnding(); pickTab("tenancy"); }}
          />
        </Modal>
      )}
      {action?.kind === "swap-open" && swapOn && (
        <Modal onClose={closeAction} title={`${swapOn.swap.label ?? "Tenant swap"} under way`}>
          <SwapOpen s={swapOn} onAnother={() => act({ kind: "swap" })} canAct={canAct && tenants.length > 0} />
        </Modal>
      )}
      {action?.kind === "swap" && (
        <Modal onClose={closeAction} title="Change the tenants">
          <TenantChange listingId={String(p.listingId)} tenants={tenants} rent={p.rentMonthly ?? null} onClose={closeAction} />
        </Modal>
      )}
      {/* Michael's Section 8 / 13 checklist is its own pop-up already. */}
      {action?.kind === "notices" && !roomsOnly && (
        <HomeNotices key={`start-${action.start}-${p.listingId}`} home={noticeHome} start={action.start} bare onDone={() => { setAction(null); loadNotices(); }} />
      )}
    </>
  );

  /* ── THE NEW LOOK (lib/new-look "property", 23 Oct 2026) ────────────────
     The same home, reads, actions and pop-ups as the page below, laid out as
     the design's record: the head with its two jobs and the menu, the photo
     beside The Details, how it stands, then the tabs. Every action the old
     page's tiles held is a button in the head or a line in its menu. */
  if (look) {
    const goTab = (t: Tab, then?: () => void) => {
      pickTab(t);
      setTimeout(() => {
        document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" });
        then?.();
      }, 60);
    };
    const serviceTone: Tone = p.test ? "accent" : p.service === "Managed" ? "good" : "neutral";
    /* Nobody on the home yet, and a let on its way in: that let stands in for
       Change the tenants, which needs tenants to change. Adding the newcomers
       there would start a second Propoly deal for the same people. */
    const comingIn = !tenants.length && !swapOn ? incoming[0] ?? null : null;
    const comingNames = comingIn ? (comingIn.tenants.length ? comingIn.tenants.join(" & ") : "The new tenants") : "";
    const comingWhen = comingIn?.moveIn ? `moving in ${day(comingIn.moveIn)}` : "move-in date to set";
    const rentShown = houseView && house && !lets ? houseLine : rentLine;
    const menu: MenuItem[] = [
      { label: "Book a property visit", sub: "Every 6 months: the home and the tenant", disabled: !canAct || visits.state !== "ready", onClick: () => void bookVisit() },
      { label: "Record a past visit", sub: "Already done elsewhere. No emails", disabled: !canAct || visits.state !== "ready", onClick: () => act({ kind: "past-visit" }) },
      { label: "Serve notice", sub: roomsOnly ? "Pick a room first" : "Section 8, checked by compliance", disabled: roomsOnly, onClick: () => act({ kind: "notices", start: "s8" }) },
      { label: "Rent review", sub: roomsOnly ? "Pick a room first" : "Section 13 rent increase", disabled: roomsOnly, onClick: () => act({ kind: "notices", start: "s13" }) },
      { label: "Tenant gave notice", sub: "Starts the move-out", disabled: !canAct || !tenants.length, onClick: () => act({ kind: "tenant-notice" }) },
      swapOn
        ? { label: `${swapOn.swap.label ?? "Tenant swap"} under way`, sub: `${(swapOn.swap.joining.length ? swapOn.swap.joining : swapOn.swap.rereference ?? []).join(", ")} from ${day(swapOn.swap.moveIn)} · ${swapOn.plc?.short ?? "PLC check next"}`, onClick: () => act({ kind: "swap-open" }) }
        : comingIn
          ? { label: "New tenants on the way", sub: `${comingNames}, ${comingWhen}`, href: comingIn.href }
          : { label: "Change the tenants", sub: tenants.length ? "Add someone, swap a sharer or re-reference" : "No tenants on this home yet", disabled: !canAct || !tenants.length, onClick: () => act({ kind: "swap" }) },
      "rule",
      { label: "Send out logins", sub: "Tenant account, to report repairs", disabled: p.test || !loginListings.length, onClick: () => setShowLogins(true) },
      { label: "Email Certificates", sub: "To the tenants, kept on the record", disabled: p.test || !loginListings.length, onClick: () => setSendOpen({ start: null, heading: "Email Certificates" }) },
      { label: "Add a certificate", sub: "Read and filed on the home", disabled: !propertyId, onClick: () => goTab("compliance") },
      { label: "Add a document", sub: "An inventory, an agreement, anything else", disabled: p.test, onClick: () => goTab("documents") },
      { label: "Add a note", sub: "A call, an email, a query", disabled: !propertyId, onClick: () => goTab("notes", () => document.getElementById("home-note")?.focus({ preventScroll: true })) },
      ...(everything && !p.test && p.onRex !== false ? ["rule" as const, { label: "Open the record behind this home", href: rexListingUrl(p.listingId, "leased") }] : []),
    ];
    const outstanding = certs.state === "ready" ? certs.data.outstanding : 0;
    /* How it stands: one line per board, each opening its tab. */
    const standing: { id: Tab; label: string; state: "wait" | "hot" | "ok" | "quiet"; text: React.ReactNode }[] = [
      {
        id: "compliance",
        label: "Compliance",
        state: certs.state === "loading" ? "wait" : certs.state === "failed" ? "quiet" : certs.data.outstanding > 0 ? "hot" : certs.data.checked && certs.data.rows > 0 ? "ok" : "quiet",
        text: certs.state === "loading" ? "Reading…" : certs.state === "failed" ? "Not available"
          : certs.data.outstanding > 0 ? `${certs.data.outstanding} ${certs.data.outstanding === 1 ? "certificate" : "certificates"} outstanding`
          : certs.data.checking > 0 ? `${certs.data.checking === 1 ? "One" : certs.data.checking} with compliance for checking`
          : certs.data.checked && certs.data.rows > 0 ? "All in date" : "None held yet",
      },
      {
        id: "maintenance",
        label: "Jobs",
        state: works.state === "loading" ? "wait" : works.state === "failed" ? "quiet" : openJobs.length + works.data.carried.length > 0 ? "hot" : "ok",
        text: works.state === "loading" ? "Reading…" : works.state === "failed" ? "Not available"
          : openJobs.length + works.data.carried.length > 0 ? `${openJobs.length + works.data.carried.length} open ${openJobs.length + works.data.carried.length === 1 ? "job" : "jobs"}` : "No open jobs",
      },
      {
        id: "inspections",
        label: "Inspections",
        state: visits.state === "loading" ? "wait" : visits.state === "failed" ? "quiet" : owedVisit && owedVisit.daysAway < 0 && !nextVisit ? "hot" : "ok",
        text: visits.state === "loading" ? "Reading…" : visits.state === "failed" ? "Not available"
          : nextVisit ? `Booked ${stamp(nextVisit.bookedAt)}`
          : owedVisit ? `${VISIT_KIND[owedVisit.kind] ?? "Visit"} ${owedVisit.daysAway < 0 ? "overdue" : `due ${day(owedVisit.dueAt)}`}`
          : "None owed",
      },
      {
        id: "tenancy",
        label: "Tenancy",
        state: leaving ? "hot" : tenancy.state === "loading" ? "wait" : "ok",
        text: leaving ? `Relet · leaving ${leaving.moveOutOn ? day(leaving.moveOutOn) : "date to set"}`
          : tenancy.state === "loading" ? "Reading…"
          : tenancy.state === "ready" && tenancy.data.tenancy ? <TenancyLine t={tenancy.data.tenancy} />
          : comingIn ? `${comingNames}, ${comingWhen}`
          : `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}`,
      },
    ];
    const nlTabs: { id: Tab; label: string; count?: number | null; dot?: boolean }[] = [
      { id: "overview", label: "Overview" },
      { id: "tenancy", label: "Tenancy", dot: Boolean(leaving) },
      { id: "compliance", label: "Compliance", count: outstanding > 0 ? outstanding : null },
      { id: "maintenance", label: "Maintenance", count: works.state === "ready" && openJobs.length > 0 ? openJobs.length : null },
      { id: "inspections", label: "Inspections" },
      { id: "documents", label: "Documents" },
      { id: "notes", label: "Notes", count: noteCount > 0 ? noteCount : null },
    ];
    const tenancyRow = tenancy.state === "loading" ? "Reading…"
      : tenancy.state === "failed" ? "Not read"
      : tenancy.data.tenancy ? (tenancy.data.tenancy.endDate ? `Ends ${day(tenancy.data.tenancy.endDate)}` : "Rolling") : "Not on record";
    const changed = Boolean(landlord && landlord.contactId.startsWith("changed:") && propertyId);
    const jobEmails = landlord?.email && landlord.email.includes("@") ? (
      <LandlordJobEmails key={landlord.email} compact landlord={landlord.email} name={landlord.name} className="mt-3 border-t border-line pt-3" />
    ) : null;
    const isRecord = Boolean(landlord?.contactId.startsWith("record:"));

    /* Each tab's own buttons (James, 25 Oct 2026): what you do about that
       part of the home sits at the top of it, beside how it stands - book an
       inspection on Inspections, report a repair on Maintenance. Once notice
       is in, Inspections leads with the check-out. Every one opens the same
       pop-up as the head and the menu. */
    const ic = (name: string) => <DoodleIcon name={name} size={15} />;
    const btn = (label: string, icon: string, onClick: () => void, o: { primary?: boolean; disabled?: boolean; title?: string } = {}) => (
      <button type="button" disabled={o.disabled} onClick={onClick} title={o.title} className={`nl-btn ${o.primary ? "nl-btn--primary" : "nl-btn--secondary"}`}>
        {ic(icon)} {label}
      </button>
    );
    const closedJobs = works.state === "ready" ? works.data.orders.length - openJobs.length : 0;
    const certButton = () => document.querySelector<HTMLButtonElement>(".nl-prop-file [data-attach]")?.click();
    const docPicker = () => document.querySelector<HTMLInputElement>(".nl-prop-docs input[type=file]")?.click();
    const heads: Partial<Record<Tab, { sub: React.ReactNode; acts: React.ReactNode }>> = {
      tenancy: {
        sub: standing.find((s) => s.id === "tenancy")?.text,
        acts: (
          <>
            {btn("Tenant gave notice", "logout", () => act({ kind: "tenant-notice" }), { disabled: !canAct || !tenants.length, title: "Starts the move-out" })}
            {swapOn
              ? btn(`${swapOn.swap.label ?? "Tenancy swap"} under way`, "key", () => act({ kind: "swap-open" }), { primary: true })
              : comingIn
                ? btn("Open their let", "key", () => router.push(comingIn.href), { primary: true, title: `${comingNames}, ${comingWhen}` })
                : btn("Tenancy swap", "key", () => act({ kind: "swap" }), { primary: true, disabled: !canAct || !tenants.length, title: tenants.length ? "Add someone, swap a sharer or re-reference" : "No tenants on this home yet" })}
          </>
        ),
      },
      compliance: {
        sub: standing.find((s) => s.id === "compliance")?.text,
        acts: (
          <>
            {btn("Email certificates", "mail", () => setSendOpen({ start: null, heading: "Email Certificates" }), { disabled: p.test || !loginListings.length, title: "To the tenants, from you, kept on the record" })}
            {btn("Add a certificate", "upload", certButton, { disabled: !propertyId, title: "Read and filed on the home" })}
            {btn("Plan a certificate", "calendar", () => act({ kind: "planned" }), { primary: true, disabled: !canAct, title: "A gas safety, EICR or service, by a date" })}
          </>
        ),
      },
      maintenance: {
        sub: works.state === "ready" && closedJobs > 0
          ? <>{standing.find((s) => s.id === "maintenance")?.text} · {closedJobs} finished</>
          : standing.find((s) => s.id === "maintenance")?.text,
        acts: (
          <>
            {btn("Plan a certificate", "calendar", () => act({ kind: "planned" }), { disabled: !canAct, title: "A gas safety, EICR or service, by a date" })}
            {btn("Report a repair", "setting", () => act({ kind: "repair" }), { primary: true, disabled: !canAct, title: "Tenant and landlord told at each step" })}
          </>
        ),
      },
      inspections: {
        sub: noticeIn
          ? <>Notice is in{leaving?.moveOutOn ? ` · they leave ${day(leaving.moveOutOn)}` : ""}</>
          : standing.find((s) => s.id === "inspections")?.text,
        acts: (
          <>
            {btn("Record a past visit", "checklist", () => act({ kind: "past-visit" }), { disabled: !canAct || visits.state !== "ready", title: "Already done elsewhere. No emails" })}
            {btn("Book an inspection", "calendar", () => void bookVisit(), { primary: !(canAct && noticeIn), disabled: !canAct || visits.state !== "ready", title: "A property visit: the home and the tenant" })}
            {canAct && noticeIn && btn("Book the check-out", "logout", () => void bookCheckout(), { primary: true, disabled: visits.state !== "ready", title: leaving?.moveOutOn ? `They leave ${day(leaving.moveOutOn)}` : "Notice is in" })}
          </>
        ),
      },
      documents: {
        sub: "Inventories, agreements and anything else that isn't a certificate",
        acts: (
          <>
            {btn("Send to tenants", "mail", () => setSendOpen({ start: null }), { disabled: p.test || !loginListings.length, title: "Certificates and documents, from you, kept on the record" })}
            {btn("Add a document", "upload", docPicker, { primary: true, disabled: p.test })}
          </>
        ),
      },
      notes: {
        sub: noteCount > 0 ? `${noteCount} ${noteCount === 1 ? "note" : "notes"} on this home` : "Calls, emails and queries about this home",
        acts: btn("Add a note", "note", () => document.getElementById("home-note")?.focus(), { primary: true, disabled: !propertyId }),
      },
    };
    const head = heads[tab];

    return (
      <SaveScopeProvider scope={saves}>
        <div data-look="new" className="nl-page nl-prop-page">
          <div className="nl-rise">
            {/* Crumb, the save chip, and ‹ › through the list it was opened from. */}
            <div className="nl-crumbs">
              <Link href="/portfolio" className="nl-crumb"><Ico name="back" size={14} /> Properties</Link>
              <SaveChip scope={saves} className="bg-card" />
              {order.includes(listingId) && order.length > 1 && (
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="nl-mono mr-1">{order.indexOf(listingId) + 1} of {order.length}</span>
                  <button type="button" aria-label="Previous property" onClick={() => step(-1)} className="nl-iconbtn nl-iconbtn--sm">‹</button>
                  <button type="button" aria-label="Next property" onClick={() => step(1)} className="nl-iconbtn nl-iconbtn--sm">›</button>
                </span>
              )}
            </div>

            {/* The head: the service, the name, one line of facts, then the jobs. */}
            <div className="nl-rhead">
              <div className="nl-rhead-text">
                <div className="nl-rhead-meta">
                  <Badge tone={serviceTone}>{p.test ? "Test home" : p.service ?? "Service not set"}</Badge>
                  {/* Susan, 12 Oct 2026: the PayProp service tag (RLP or not) and the management fee. */}
                  {!p.test && <span className="nl-prop-tag"><ServiceTag listingId={String(p.listingId)} /></span>}
                  {leaving && <Badge tone="warning">Relet · leaving {leaving.moveOutOn ? day(leaving.moveOutOn) : "date to set"}</Badge>}
                </div>
                <h1 className="nl-title">{title}</h1>
                <p className="nl-rhead-sub">
                  {[sub, rentShown ?? (!(houseView && house && !lets) && !p.test ? noRent : null)].filter(Boolean).join(" · ")}
                </p>
                <div className="nl-prop-addr"><OsAddressLine propertyId={propertyId} listingId={p.listingId} shown={[title, p.locality, p.postcode].filter(Boolean).join(", ")} onChanged={() => setBookRev((n) => n + 1)} /></div>
                {house && (
                  <div className="nl-prop-rooms">
                    <button type="button" onClick={() => setRoom("house")} className={`nl-prop-room${room === "house" ? " is-on" : ""}`} aria-pressed={room === "house"}>
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
              <div className="nl-rhead-acts">
                {/* Management transfer (Dan Richards a9f80822, 19 Oct 2026): only where it applies. */}
                <TakeOnTile
                  home={{ ref: String(p.listingId), name: p.name, locality: p.locality, landlord: p.landlord, tenants, rent: p.rentMonthly }}
                  offer={!roomsOnly && (!tenants.length || !p.landlord || p.onRex === false)}
                  disabled={!canAct}
                  className="nl-btn nl-btn--secondary"
                  icon={null}
                  text={(label, what) => <span title={what}>{label}</span>}
                />
                {canAct && noticeIn && (
                  <button type="button" disabled={visits.state !== "ready"} onClick={() => void bookCheckout()} className="nl-btn nl-btn--secondary" title={leaving?.moveOutOn ? `They leave ${day(leaving.moveOutOn)}` : "Notice is in"}>
                    <Ico name="calendar" /> Book the check-out
                  </button>
                )}
                {/* Re-let waits for notice (Michael and James, 8 Oct 2026). */}
                {canAct && p.onRex !== false && mayRelet && <ReletAction home={p} className="nl-btn nl-btn--sage" />}
                <button type="button" disabled={!canAct} onClick={() => act({ kind: "planned" })} className="nl-btn nl-btn--secondary" title="A gas safety, EICR or service, by a date">
                  <Ico name="calendar" /> Plan a certificate
                </button>
                <button type="button" disabled={!canAct} onClick={() => act({ kind: "repair" })} className="nl-btn nl-btn--primary" title="Tenant and landlord told at each step">
                  <Ico name="pen" /> Report a repair
                </button>
                <Menu items={menu} label="More for this home" />
              </div>
            </div>

            {(actionErr || p.held) && (
              <div className="nl-prop-notes">
                {actionErr && <p className="nl-prop-err" role="alert">{actionErr}</p>}
                {/* Kept on the book through notice (lib/portfolio-notice, 9 Oct 2026). */}
                {p.held && (
                  <p className="nl-prop-held">
                    <b>Kept on your book until the tenants move out{p.notice?.leavingOn ? ` on ${day(p.notice.leavingOn)}` : ""}.</b>{" "}
                    The let is no longer on the main record, so this is the home as it last was. It drops off once the move-out is closed, and comes back with the next let.
                  </p>
                )}
              </div>
            )}

            {/* The photo stack beside The Details. */}
            <div className="nl-hero">
              <div className={`nl-hero-photo${gridFrom ? " is-lifted" : ""}`}>
                {shots.length > 1 && <i className="nl-hero-under u2" aria-hidden />}
                {shots.length > 1 && <i className="nl-hero-under u1" aria-hidden />}
                <button
                  type="button"
                  ref={heroRef}
                  className="nl-hero-main"
                  disabled={!shots.length}
                  onClick={() => shots.length && setGridFrom(heroRef.current?.getBoundingClientRect() ?? null)}
                  aria-label={shots.length ? `See all ${shots.length} photos` : "No photos"}
                >
                  {shots.length ? (
                    <PropertyPhoto src={shots[0]} alt="" width={1400} height={875} loading="eager" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="nl-hero-empty">
                      <svg width="72" height="56" viewBox="0 0 56 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden><path d="M4 42h48M10 42V20L28 6l18 14v22M23 42V30h10v12" /></svg>
                      No photos on record for this home.
                    </span>
                  )}
                  {shots.length > 1 && (
                    <span className="nl-hero-more"><Ico name="image" size={15} /> +{shots.length - 1} more</span>
                  )}
                </button>
              </div>

              <section className="nl-facts">
                <div className="nl-facts-head">
                  <h3 className="nl-block-title">The Details</h3>
                </div>
                <div className="nl-facts-grid">
                  {houseView && house && !lets ? (
                    <div className="nl-fact"><span>Rent{pricedRooms ? `, ${pricedRooms} ${pricedRooms === 1 ? "room" : "rooms"}` : ""}</span><b className={roomRent > 0 ? "" : "is-quiet"}>{roomRent > 0 ? `${money(roomRent)} pcm` : "No room rents yet"}</b></div>
                  ) : (
                    <div className="nl-fact"><span>Rent</span><b className={rentLine ? "" : "is-quiet"} title={rentLine ? undefined : noRent}>{rentLine ?? (p.test ? "Test home" : noRent)}</b></div>
                  )}
                  <div className="nl-fact"><span>Let type</span><b className={p.letType ? "" : "is-quiet"}>{p.letType ?? "Not set"}</b></div>
                  <div className="nl-fact"><span>Let since</span><b className={p.letSince ? "" : "is-quiet"}>{p.letSince ? day(p.letSince) : "Not set"}</b></div>
                  <div className="nl-fact"><span>Tenancy</span><b className={tenancy.state === "ready" && tenancy.data.tenancy ? "" : "is-quiet"}>{tenancyRow}</b></div>
                  <div className="nl-fact"><span>{roomsOnly ? "Rooms let" : tenants.length === 1 ? "Tenant" : "Tenants"}</span><b className={(roomsOnly ? letRooms.length : tenants.length) ? "" : "is-quiet"}>{roomsOnly && house ? `${letRooms.length} of ${house.rooms.length}` : tenants.length ? tenants.map((t) => t.name).join(", ") : comingIn ? `None yet, ${comingWhen}` : "None on record"}</b></div>
                  <div className="nl-fact"><span>On the books since</span><b>{day(houseView && house ? house.members.map((m) => m.onBooksSince).filter(Boolean).sort()[0] ?? null : p.onBooksSince).replace("—", "Not known")}</b></div>
                </div>
                {/* The agent, the key numbers and the source: each changeable in place. */}
                <div className="nl-prop-more">
                  <HomeAgent propertyId={p.test ? null : p.propertyId} agent={p.agent} movedFrom={p.agentMovedFrom} everything={everything} />
                  {/* Sean McMahon, 20 Oct 2026: the key numbers, from the key register. */}
                  {!p.test && <HomeKeys propertyId={p.propertyId} />}
                  {/* Sean McMahon, 21 Oct 2026: a re-let refused for want of a Source, settable here. */}
                  {!p.test && p.onRex !== false && <HomeSource propertyId={p.propertyId} />}
                </div>
              </section>
            </div>

            {/* How it stands: a line each, read live, each opening its tab. */}
            <div className="nl-prop-standing" aria-label="How it stands">
              {standing.map((x) => (
                <button key={x.id} type="button" onClick={() => pickTab(x.id)} className={`nl-prop-stand is-${x.state}${tab === x.id ? " is-on" : ""}`}>
                  <i aria-hidden />
                  <span className="nl-meta">{x.label}</span>
                  <b>{x.text}</b>
                </button>
              ))}
            </div>

            <div id="sections" className="scroll-mt-6">
              <Tabs label="This home" className="nl-ltabs" value={tab} onChange={pickTab} items={nlTabs} />
            </div>

            <div key={tab} className="nl-pane">
              {head && (
                <div className="nl-tabhead">
                  <div className="min-w-0">
                    <h2 className="nl-tabhead-title">{nlTabs.find((t) => t.id === tab)?.label}</h2>
                    {head.sub && <p className="nl-tabhead-sub">{head.sub}</p>}
                  </div>
                  <div className="nl-tabhead-acts">{head.acts}</div>
                </div>
              )}
              {tab === "overview" && (
                <div className="nl-bento">
                  {/* The tenants, or a shared house's rooms. */}
                  <section className="nl-cell span2">
                    <div className="nl-cell-head">
                      <h3 className="nl-block-title">{roomsOnly ? "Rooms" : tenants.length === 1 ? "Tenant" : "Tenants"}</h3>
                      {!p.test && (
                        <button type="button" className="nl-link" onClick={() => goTab("tenancy", () => document.getElementById("past-tenants")?.scrollIntoView({ behavior: "smooth", block: "start" }))}>
                          Past tenants
                        </button>
                      )}
                    </div>
                    {roomsOnly && house ? (
                      <ul className="nl-lines">
                        {house.rooms.map((r) => (
                          <li key={r.listingId}>
                            <button type="button" className="nl-line" onClick={() => setRoom(r.listingId)}>
                              <span className="nl-strong w-[70px] shrink-0">{roomLabel(r)}</span>
                              <span className="min-w-0 flex-1 truncate">{r.tenants[0]?.name ?? <span className="nl-meta">Empty</span>}</span>
                              <span className="nl-price shrink-0 text-[16px]">{r.rent == null ? <span className="nl-meta">No rent</span> : `${money(r.rent)}${r.rentPeriod === "week" ? " pw" : ""}`}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : tenants.length ? (
                      <ul className="nl-prop-people">
                        {/* Each with an Edit button (James, 27 Oct 2026). */}
                        {tenants.map((t) => <li key={t.contactId}><TenantCard contactId={t.contactId} person={{ name: t.name, email: t.email ?? null, phone: t.phone ?? null }} about={[title, p.locality, p.postcode].filter(Boolean).join(", ")} /></li>)}
                      </ul>
                    ) : comingIn ? (
                      <p className="nl-empty">
                        None yet. {comingNames} {comingIn.tenants.length === 1 ? "is" : "are"} {comingWhen}, on a let going through Propoly.{" "}
                        <Link href={comingIn.href} className="nl-link">Open their let</Link>
                      </p>
                    ) : (
                      <p className="nl-empty">No tenant on record. It is empty, or the let has not been recorded.</p>
                    )}
                    {/* Their guarantors, from the lead and the let (lib/guarantors). */}
                    {tenants.length > 0 && !roomsOnly && !p.test && <Guarantors source={{ listing: String(p.listingId) }} />}
                    {/* Overseas tenants' right to rent expiry (Kirstie, ticket 066bb29e). */}
                    {tenants.length > 0 && !roomsOnly && !p.test && (
                      <HomeRightToRent key={String(p.listingId)} listingId={String(p.listingId)} tenants={tenants.map((t) => ({ name: t.name, email: t.email }))} />
                    )}
                    {tenants.length > 0 && (
                      <p className="nl-prop-dates">
                        {tenancy.state === "loading" ? "Reading the tenancy dates…"
                          : tenancy.state === "failed" ? "The tenancy dates could not be read."
                          : tenancy.data.tenancy ? <TenancyLine t={tenancy.data.tenancy} long />
                          : tenancy.data.ready ? "No tenancy dates on record for this home." : tenancy.data.error ?? "The tenancy dates are still being read. Look again in a minute."}
                      </p>
                    )}
                  </section>

                  {/* The landlords section, the same on every screen (James, 20 Oct 2026). */}
                  <section className="nl-cell">
                    <HomeLandlords
                      homeKey={p.test ? null : propertyId}
                      address={homeLine}
                      readOnly={p.test ? "A test home keeps its own people." : null}
                      main={
                        landlord && !changed
                          ? [{
                              key: landlord.contactId,
                              name: landlord.name,
                              email: landlord.email,
                              phone: landlord.phone,
                              personRef: /^\d+$/.test(landlord.contactId) ? `rex:${landlord.contactId}` : isRecord && propertyId ? `home:${propertyId}` : null,
                              note: isRecord ? "From the home's own record in the OS - the main record names no owner." : null,
                              after: jobEmails,
                            }]
                          : []
                      }
                      mainSlot={
                        changed && landlord && propertyId ? (
                          <div className="text-[13px]">
                            <ListingChangedLandlord key={landlord.contactId} listingId={String(p.listingId)} propertyId={propertyId} address={homeLine} onChanged={landlordUndone} />
                            {jobEmails}
                          </div>
                        ) : undefined
                      }
                      mainAction={
                        propertyId && !p.test ? (
                          <ChangeLandlordButton
                            where={{ listingId: String(p.listingId), propertyId, address: homeLine }}
                            current={landlord ? { name: landlord.name, email: landlord.email, phone: landlord.phone } : null}
                            onChanged={landlordChanged}
                          />
                        ) : null
                      }
                    />
                  </section>

                  {/* Every board's newest, one list (James, 7 Oct 2026: five here, the rest in View all). */}
                  <section className="nl-cell span2" id="action-box">
                    <div className="nl-cell-head">
                      <h3 className="nl-block-title">Latest Activity</h3>
                      {allActivity.length > 0 && (
                        <button type="button" className="nl-link" onClick={() => setShowAll(true)}>
                          View all{allActivity.length > latest.length ? ` ${allActivity.length}` : ""}
                        </button>
                      )}
                    </div>
                    {drafts.state === "ready" && drafts.data.length > 0 && (
                      <p className="nl-meta -mt-1">{drafts.data.length} not finished</p>
                    )}
                    {latest.length > 0 ? (
                      <ul className="nl-prop-acts">{latest.map((a) => <NlActivityRow key={a.key} a={a} />)}</ul>
                    ) : reading ? (
                      <Loading label="Reading what has happened here" />
                    ) : (
                      <p className="nl-empty">Nothing recorded on this home yet. Pick an action and it shows here.</p>
                    )}
                    {reading && latest.length > 0 && <Loading label="Still reading" />}
                  </section>

                  {/* Rent where the map was (James, 8 Oct 2026): up to date or how far behind, live from PayProp. */}
                  {!p.test ? (
                    <RentBox
                      listingId={String(p.listingId)}
                      className="nl-cell nl-prop-rent"
                      shape={houseView && house && !lets
                        ? { kind: "rooms", rooms: house.rooms.map((r) => ({ id: String(r.listingId), label: roomLabel(r), tenant: r.tenants[0]?.name ?? null, rent: r.rent, period: r.rentPeriod, monthly: r.rentMonthly })) }
                        : { kind: "home", rent: p.rentMonthly, tenants: tenants.map((t) => t.name) }}
                    />
                  ) : (
                    <section className="nl-cell"><h3 className="nl-block-title">Rent</h3><p className="nl-meta">A test home has no rent account.</p></section>
                  )}
                </div>
              )}

              {tab === "tenancy" && (
                <div className="nl-bento nl-prop-two">
                  {comingIn && (
                    <section className="nl-cell nl-cell--manilla span2">
                      <h3 className="nl-block-title">Moving In</h3>
                      <p className="text-[14px]">
                        {comingNames}
                        <span className="nl-meta"> · {comingIn.moveIn ? `from ${day(comingIn.moveIn)}` : "move-in date to set"}{comingIn.status ? ` · ${comingIn.status}` : ""}</span>
                      </p>
                      <p className="nl-meta">Their let is going through Propoly, so they are already on it - there is nothing to add here. Everything about it is on their let.</p>
                      <Link href={comingIn.href} className="nl-link self-start">Open their let</Link>
                    </section>
                  )}

                  <section className="nl-cell">
                    <h3 className="nl-block-title">The Tenancy</h3>
                    {tenancy.state === "loading" ? <Loading label="Reading the tenancy" /> : tenancy.state === "failed" ? <Failed error={tenancy.error} /> : (
                      <dl className="nl-prop-dl">
                        <NlFact label="Tenants" value={tenants.length ? tenants.map((t) => t.name).join(", ") : comingIn ? "None yet, a let is on its way in" : "None on record"} />
                        <NlFact label="Rent" value={rentLine ?? noRent} />
                        <NlFact label="Started" value={tenancy.data.tenancy?.startDate ? day(tenancy.data.tenancy.startDate) : p.letSince ? day(p.letSince) : "-"} />
                        <NlFact label="Ends" value={tenancy.data.tenancy ? (tenancy.data.tenancy.endDate ? day(tenancy.data.tenancy.endDate) : "Rolling, no end date") : "-"} />
                        <NlFact label="Deposit" value={tenancy.data.tenancy?.depositId ? `Registered · ${tenancy.data.tenancy.depositId}` : "-"} />
                        <NlFact label="Rent and legal protection" value={tenancy.data.protection === "protected" ? "On" : tenancy.data.protection === "without" ? "Not taken" : "-"} />
                      </dl>
                    )}
                    {tenancy.state === "ready" && !tenancy.data.ready && (
                      <p className="nl-meta">{tenancy.data.error ?? "The tenancy dates are still being read. Look again in a minute."}</p>
                    )}
                  </section>

                  <section className="nl-cell">
                    <h3 className="nl-block-title">Moving Out</h3>
                    {ending.state === "loading" ? <Loading label="Reading reviews and move-outs" /> : ending.state === "failed" ? <Failed error={ending.error} /> : (
                      <NlEnding data={ending.data} />
                    )}
                  </section>

                  {reviewDue && (
                    <section className="nl-cell nl-cell--manilla span2">
                      <h3 className="nl-block-title">Tenancy Review</h3>
                      <p className="text-[14px]">
                        {reviewDue.dueOn ? `Due ${day(reviewDue.dueOn)}` : "Due, no date set"}
                        {reviewDue.agreement ? <span className="nl-meta"> · {reviewDue.agreement}</span> : null}
                      </p>
                      {reviewDue.why && <p className="nl-meta">{reviewDue.why}</p>}
                      <Link href="/tenancy-reviews" className="nl-link self-start">Record the review</Link>
                    </section>
                  )}

                  {/* Rent review (Section 13) and Serve notice (Section 8): Michael's checklists. */}
                  <section id="notices" className="nl-cell span2 scroll-mt-6">
                    {roomsOnly ? (
                      <>
                        <h3 className="nl-block-title">Rent Review and Notices</h3>
                        <p className="nl-meta">Each room is its own tenancy. Pick a room at the top to start its rent review or notice.</p>
                      </>
                    ) : (
                      <div className="nl-holder"><HomeNotices key={p.listingId} home={noticeHome} /></div>
                    )}
                  </section>

                  {/* Who lived here before, with how to reach them (Josel, 20 Oct 2026). */}
                  {!p.test && (
                    <section id="past-tenants" className="nl-cell span2 scroll-mt-6">
                      <h3 className="nl-block-title">Past Tenants</h3>
                      <PastTenantPeople key={p.listingId} listing={String(p.listingId)} listings={sendListings} about={homeLine} />
                    </section>
                  )}

                  {/* Every let this home has had since the archive started (lib/tenancy-archive). */}
                  {p.propertyId && (
                    <section className="nl-cell span2">
                      <h3 className="nl-block-title">Past Tenancies</h3>
                      <PastTenancies propertyId={p.propertyId} compact />
                    </section>
                  )}
                </div>
              )}

              {tab === "compliance" && (
                <div className="nl-holder">
                  {houseView && house && !house.house && !lets && (
                    <p className="nl-meta">This house is held as its rooms only, so the file below is the first room&apos;s. Every room shares the house&apos;s certificates.</p>
                  )}
                  {propertyId ? (
                    <div className="nl-prop-file">
                      <PropertyFile
                        key={propertyId}
                        propertyId={propertyId}
                        propertyName={house ? `${house.name}${roomP ? ` · ${roomLabel(roomP)}` : ""}` : p.name}
                        screen="the property page"
                        emailTenant={{
                          open: (start) => setSendOpen({ start, heading: "Email Tenant" }),
                          none: p.test ? "This is a test home" : loginListings.length ? null : "Nobody is living here",
                        }}
                      />
                    </div>
                  ) : (
                    <p className="nl-empty">There is no property record behind this home yet, so there are no certificates to check.</p>
                  )}
                </div>
              )}

              {tab === "maintenance" && (
                works.state === "loading" ? <Loading label="Reading the jobs on this home" /> : works.state === "failed" ? <Failed error={works.error} /> : (
                  <NlJobs orders={works.data.orders} carried={works.data.carried} onOpen={setOpenJob} />
                )
              )}

              {tab === "inspections" && (
                visits.state === "loading" ? <Loading label="Reading the visits on this home" /> : visits.state === "failed" ? <Failed error={visits.error} /> : (
                  <NlVisits data={visits.data} />
                )
              )}

              {tab === "documents" && (
                <div className="nl-holder nl-prop-docs">
                  {/* The home's documents (lib/file-documents): kept on the OS; nobody is sent anything. */}
                  <FileDocuments
                    key={p.listingId}
                    address={noticeHome.address}
                    propertyId={/^\d+$/.test(String(p.propertyId ?? "")) ? p.propertyId : null}
                    from={{ kind: "property", id: String(p.listingId) }}
                    showMissing={false}
                    dropZone
                    intro="Inventories, agreements and anything else that isn't a certificate. Kept on this home, so the office and the agent both see them, including what was added at pre-tenancy. Uploading sends nothing to the landlord or tenant."
                  />
                  {/* The clean sweep's papers, for the office (Josel, 20 Oct 2026). */}
                  {!p.test && <RecordFiles key={`record-${p.listingId}`} listing={String(p.listingId)} listings={sendListings} />}
                </div>
              )}

              {tab === "notes" && (
                <HomeNotes key={`${propertyId}-${p.listingId}`} propertyId={propertyId} listingId={String(p.listingId)} onCount={setNoteCount} />
              )}
            </div>
          </div>

          {gridFrom && <PhotoGrid photos={shots} name={title} origin={gridFrom} onClose={() => setGridFrom(null)} />}
          {popups}
        </div>
      </SaveScopeProvider>
    );
  }

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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── 1. the photos and the name ──────────────────────────────── */}
          <section className={`${box} min-w-0 p-3 xl:col-start-1 xl:row-start-1`}>
              <div className={`grid grid-cols-1 gap-2 ${shots.length > 1 ? "sm:grid-cols-[minmax(0,1fr)_140px] 2xl:grid-cols-[minmax(0,1fr)_170px]" : ""}`}>
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
                <div className="mt-2 flex flex-col items-start gap-1.5 sm:items-end">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" />
                    {p.test ? "Test home" : p.service ?? "Service not set"}
                  </span>
                  {/* Susan, 12 Oct 2026: the PayProp service tag (RLP or not) and the management fee. */}
                  {!p.test && <ServiceTag listingId={String(p.listingId)} />}
                </div>
              </div>
              {(houseView && house && !lets ? houseLine : rentLine) ? (
                <p className="figures mt-1.5 text-[20px] font-semibold">{houseView && house && !lets ? houseLine : rentLine}</p>
              ) : !(houseView && house && !lets) && !p.test ? (
                <p className="mt-1.5 text-[14px] text-muted">{noRent}</p>
              ) : null}
              <p className="mt-1 text-[13px] text-muted">{sub}</p>
              <OsAddressLine propertyId={propertyId} listingId={p.listingId} shown={[title, p.locality, p.postcode].filter(Boolean).join(", ")} onChanged={() => setBookRev((n) => n + 1)} />
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
            <section className={`${box} @container flex flex-col p-4 xl:col-start-2 xl:row-start-1`}>
              <p className={`${eyebrow} mb-3 px-1`}>Actions</p>
              {/* Two columns beside the photos; four across once the page stacks
                  below 1280px, so the photo is never squeezed (12 Oct 2026). */}
              <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2 @[40rem]:grid-cols-4">
                <button type="button" disabled={!canAct} onClick={() => act({ kind: "repair" })} className={tile}>{tileIcon("setting")}{tileText("Report a repair", "Tenant and landlord told at each step")}</button>
                <button type="button" disabled={!canAct} onClick={() => act({ kind: "planned" })} className={tile}>{tileIcon("calendar")}{tileText("Plan a certificate", "A gas safety, EICR or service, by a date")}</button>
                <button type="button" disabled={!canAct || visits.state !== "ready"} onClick={() => void bookVisit()} className={tile}>{tileIcon("checklist")}{tileText("Book a property visit", "Every 6 months: the home and the tenant")}</button>
                {/* Kayleigh Wright, 19 Oct 2026: visits done in Inventory Base, put on the home afterwards. */}
                <button type="button" disabled={!canAct || visits.state !== "ready"} onClick={() => act({ kind: "past-visit" })} className={tile}>{tileIcon("clock")}{tileText("Record a past visit", "Already done elsewhere. No emails")}</button>
                <button type="button" onClick={() => act({ kind: "notices", start: "s8" })} disabled={roomsOnly} className={tile}>{tileIcon("file-contract")}{tileText("Serve notice", "Section 8, checked by compliance")}</button>
                <button type="button" onClick={() => act({ kind: "notices", start: "s13" })} disabled={roomsOnly} className={tile}>{tileIcon("coin")}{tileText("Rent review", "Section 13 rent increase")}</button>
                <button type="button" disabled={!canAct || !tenants.length} onClick={() => act({ kind: "tenant-notice" })} className={tile}>{tileIcon("logout")}{tileText("Tenant gave notice", "Starts the move-out")}</button>
                {/* Lianna, 12 Oct 2026: one sharer out, their replacement in, no
                    viewing or offer. Any home with more than one tenant, or let
                    by the room (44 South Bridge isn't recorded as an HMO). */}
                {swapOn ? (
                  <button type="button" onClick={() => act({ kind: "swap-open" })} className={tile}>
                    {tileIcon("user")}
                    {tileText(`${swapOn.swap.label ?? "Tenant swap"} under way`, `${(swapOn.swap.joining.length ? swapOn.swap.joining : swapOn.swap.rereference ?? []).join(", ")} from ${day(swapOn.swap.moveIn)} · ${swapOn.plc?.short ?? "PLC check next"}`)}
                  </button>
                ) : (
                  /* Change the tenants (19 Oct 2026): the swap, plus Kirstie's
                     add someone and re-reference, behind one button. */
                  <button type="button" disabled={!canAct || !tenants.length} onClick={() => act({ kind: "swap" })} className={tile}>{tileIcon("user")}{tileText("Change the tenants", "Add someone, swap a sharer or re-reference")}</button>
                )}
                {/* Management transfer (Dan Richards a9f80822, 19 Oct 2026). */}
                <TakeOnTile
                  home={{ ref: String(p.listingId), name: p.name, locality: p.locality, landlord: p.landlord, tenants, rent: p.rentMonthly }}
                  offer={!roomsOnly && (!tenants.length || !p.landlord || p.onRex === false)}
                  disabled={!canAct}
                  className={tile}
                  icon={tileIcon("pack/house")}
                  text={tileText}
                />
                {/* Sean McMahon, 16 Oct 2026: tenants report repairs in their portal, as Fixflow had them do. */}
                <button type="button" disabled={p.test || !loginListings.length} onClick={() => setShowLogins(true)} className={tile}>{tileIcon("mail")}{tileText("Send out logins", "Tenant account, to report repairs")}</button>
                {/* Josel, 20 Oct 2026: certificates and documents to the tenants, from here.
                    James, same day: called Email Certificates, the in-date ones ticked. */}
                <button type="button" disabled={p.test || !loginListings.length} onClick={() => setSendOpen({ start: null, heading: "Email Certificates" })} className={tile}>{tileIcon("mail")}{tileText("Email Certificates", "To the tenants, kept on the record")}</button>
                <button type="button" disabled={!propertyId} onClick={() => { pickTab("compliance"); setTimeout(() => document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} className={tile}>{tileIcon("shield")}{tileText("Add a certificate", "Read and filed on the home")}</button>
                <button type="button" disabled={p.test} onClick={() => { pickTab("documents"); setTimeout(() => document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} className={tile}>{tileIcon("folder")}{tileText("Add a document", "An inventory, an agreement, anything else")}</button>
                <button type="button" disabled={!propertyId} onClick={() => { pickTab("notes"); setTimeout(() => { document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("home-note")?.focus({ preventScroll: true }); }, 60); }} className={tile}>{tileIcon("note")}{tileText("Add a note", "A call, an email, a query")}</button>
                {canAct && noticeIn ? (
                  <button type="button" disabled={visits.state !== "ready"} onClick={() => void bookCheckout()} className={tile}>{tileIcon("key")}{tileText("Book the check-out", leaving?.moveOutOn ? `They leave ${day(leaving.moveOutOn)}` : "Notice is in")}</button>
                ) : null}
                {canAct && p.onRex !== false && mayRelet ? (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-3.5">{tileIcon("pack/house")}</span>
                    <ReletAction home={p} className="peer flex h-full min-h-[72px] w-full items-end gap-1 rounded-xl border border-line/60 bg-white p-3.5 pb-[34px] text-left text-[12.5px] font-semibold leading-tight transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]" />
                    <span className="pointer-events-none absolute bottom-3.5 left-3.5 right-3.5 truncate text-[11.5px] leading-snug text-muted">Back on Listings, same home</span>
                  </div>
                ) : null}
              </div>
            </section>

          {/* ── 2. the facts and the people ────────────────────────────── */}
          <section className={`${box} flex min-w-0 flex-col p-4 sm:p-5 xl:col-start-1 xl:row-start-2`}>
              <p className={eyebrow}>General info</p>
              {/* Spread across the box, four even columns, each a label over its value. */}
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Info icon="key" label="Let type" text={p.letType ?? "Not set"} />
                <Info icon="calendar" label="Let since" text={p.letSince ? day(p.letSince) : "Not set"} />
                <HomeAgent propertyId={p.test ? null : p.propertyId} agent={p.agent} movedFrom={p.agentMovedFrom} everything={everything} />
                <Info icon="clock" label="On the books since" text={day(houseView && house ? house.members.map((m) => m.onBooksSince).filter(Boolean).sort()[0] ?? null : p.onBooksSince)} />
                {/* Sean McMahon, 20 Oct 2026: the key numbers, from REX's key register. */}
                {!p.test && <HomeKeys propertyId={p.propertyId} />}
                {/* Sean McMahon, 21 Oct 2026: a re-let refused for want of a Source, settable here. */}
                {!p.test && p.onRex !== false && <HomeSource propertyId={p.propertyId} />}
              </div>

              {/* How it stands: one chip per board, each opens its section. */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={chip} onClick={() => pickTab("compliance")}>
                  <DoodleIcon name="shield" size={12} className="text-accent-dark" />
                  {certs.state === "loading" ? <Loading label="Compliance" /> : certs.state === "failed" ? "Compliance not available"
                    : certs.data.outstanding > 0 ? <b className="font-semibold text-accent-dark">{certs.data.outstanding} certificates outstanding</b>
                    : certs.data.checking > 0 ? `${certs.data.checking === 1 ? "A certificate is" : `${certs.data.checking} certificates are`} with the compliance team for checking`
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
                  {leaving ? <b className="font-semibold text-accent-dark">Relet · leaving {leaving.moveOutOn ? day(leaving.moveOutOn) : "date to set"}</b>
                    : tenancy.state === "loading" ? <Loading label="Tenancy" />
                    : tenancy.state === "ready" && tenancy.data.tenancy ? <TenancyLine t={tenancy.data.tenancy} />
                    : `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}`}
                </button>
              </div>
              {/* Kept on the book through notice (lib/portfolio-notice, 9 Oct 2026). */}
              {p.held && (
                <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-2.5 text-[12.5px] leading-relaxed">
                  <strong>Kept on your book until the tenants move out{p.notice?.leavingOn ? ` on ${day(p.notice.leavingOn)}` : ""}.</strong>{" "}
                  REX no longer shows this let, so this is the home as it last did. It drops off once the move-out is closed, and comes back with the next let.
                </p>
              )}
            <div className="mt-5 grid flex-1 grid-cols-1 gap-4 2xl:grid-cols-2">
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
                  <ul className="space-y-2">{tenants.map((t) => <PartyCard key={t.contactId} p={t} role="tenant" about={[title, p.locality, p.postcode].filter(Boolean).join(", ")} />)}</ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">No tenant on record. It is empty, or the let has not been recorded.</p>
                )}
                {/* Their guarantors, from the lead and the let (lib/guarantors). */}
                {tenants.length > 0 && !roomsOnly && !p.test && <Guarantors source={{ listing: String(p.listingId) }} className="mt-3" />}
                {/* Overseas tenants' right to rent expiry (Kirstie, ticket 066bb29e). */}
                {tenants.length > 0 && !roomsOnly && !p.test && (
                  <HomeRightToRent key={String(p.listingId)} listingId={String(p.listingId)} tenants={tenants.map((t) => ({ name: t.name, email: t.email }))} className="mt-3" />
                )}
                {!p.test && (
                  <button type="button" onClick={() => { pickTab("tenancy"); setTimeout(() => document.getElementById("past-tenants")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark underline-offset-2 hover:underline">
                    <DoodleIcon name="user" size={12} />Past tenants and how to reach them
                  </button>
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
                {/* The landlords section, the same on every screen (James, 20 Oct
                    2026): the landlord, every field changeable here (REX's
                    through REX, the home's own record on the record), plus
                    additional landlords and points of contact on the home. */}
                {(() => {
                  const changed = Boolean(landlord && landlord.contactId.startsWith("changed:") && propertyId);
                  const jobEmails = landlord?.email && landlord.email.includes("@") ? (
                    <LandlordJobEmails key={landlord.email} compact landlord={landlord.email} name={landlord.name} className="mt-3 border-t border-line/40 pt-3" />
                  ) : null;
                  const isRecord = Boolean(landlord?.contactId.startsWith("record:"));
                  return (
                    <HomeLandlords
                      homeKey={p.test ? null : propertyId}
                      address={homeLine}
                      readOnly={p.test ? "A test home keeps its own people." : null}
                      main={
                        landlord && !changed
                          ? [{
                              key: landlord.contactId,
                              name: landlord.name,
                              email: landlord.email,
                              phone: landlord.phone,
                              personRef: /^\d+$/.test(landlord.contactId) ? `rex:${landlord.contactId}` : isRecord && propertyId ? `home:${propertyId}` : null,
                              note: isRecord ? "From the home's record in the OS - REX names no owner." : null,
                              after: jobEmails,
                            }]
                          : []
                      }
                      mainSlot={
                        changed && landlord && propertyId ? (
                          /* Changed in the OS to a company, an estate or a new owner
                             (Dan Richards, 17 Oct 2026): kind, who it was, Undo, papers. */
                          <div className="text-[13px]">
                            <ListingChangedLandlord key={landlord.contactId} listingId={String(p.listingId)} propertyId={propertyId} address={homeLine} onChanged={landlordUndone} />
                            {jobEmails}
                          </div>
                        ) : undefined
                      }
                      mainAction={
                        propertyId && !p.test ? (
                          <ChangeLandlordButton
                            where={{ listingId: String(p.listingId), propertyId, address: homeLine }}
                            current={landlord ? { name: landlord.name, email: landlord.email, phone: landlord.phone } : null}
                            onChanged={landlordChanged}
                          />
                        ) : null
                      }
                    />
                  );
                })()}
              </section>
            </div>
          </section>

          {/* ── on this home, level with the facts ─────────────────────── */}
            <section id="action-box" className={`${pop} scroll-mt-5 rounded-2xl border border-accent-dark/15 bg-accent-soft/60 p-5 xl:col-start-2 xl:row-start-2`}>
              {(
                <>
                  <p className={eyebrow}>On this home{drafts.state === "ready" && drafts.data.length > 0 ? ` · ${drafts.data.length} not finished` : ""}</p>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <h2 className="hand text-[18px] leading-tight">Latest activity</h2>
                    {allActivity.length > 0 && (
                      <button type="button" onClick={() => setShowAll(true)} className="shrink-0 text-[12px] font-semibold text-accent-dark underline-offset-2 hover:underline">
                        View all{allActivity.length > latest.length ? ` ${allActivity.length}` : ""}
                      </button>
                    )}
                  </div>
                  {latest.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {latest.map((a) => <ActivityRow key={a.key} a={a} />)}
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
          <section id="sections" className={`${box} min-w-0 scroll-mt-5 p-5 xl:col-start-1 xl:row-start-3`}>
            <nav ref={tabsRef} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" aria-label="Sections">
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
                  {t.id === "notes" && noteCount > 0 && <span className={`rounded-full px-1.5 text-[10.5px] ${tab === t.id ? "bg-page/20" : "bg-line/60 text-muted"}`}>{noteCount}</span>}
                  {t.id === "compliance" && certs.state === "ready" && certs.data.outstanding > 0 && <span className={`rounded-full px-1.5 text-[10.5px] ${tab === t.id ? "bg-page/20" : "bg-accent-soft text-accent-dark"}`}>{certs.data.outstanding}</span>}
                </button>
              ))}
            </nav>
            {tab === "compliance" && (
              <div className="mt-4 [&>section]:rounded-none [&>section]:border-0 [&>section]:p-0">
                {!p.test && loginListings.length > 0 && (
                  <SendBar onSend={() => setSendOpen({ start: null, heading: "Email Certificates" })} what="this home's certificates" label="Email Certificates" />
                )}
                {houseView && house && !house.house && !lets && (
                  <p className="mb-2 text-[11.5px] text-muted">This house is held as its rooms only, so the file below is the first room&apos;s. Every room shares the house&apos;s certificates.</p>
                )}
                {propertyId ? (
                  <PropertyFile
                    key={propertyId}
                    propertyId={propertyId}
                    propertyName={house ? `${house.name}${roomP ? ` · ${roomLabel(roomP)}` : ""}` : p.name}
                    screen="the property page"
                    emailTenant={{
                      open: (start) => setSendOpen({ start, heading: "Email Tenant" }),
                      none: p.test ? "This is a test home" : loginListings.length ? null : "Nobody is living here",
                    }}
                  />
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
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <section className={`${card} p-5`}>
                  <p className={`${eyebrow} mb-3`}>The tenancy</p>
                  {tenancy.state === "loading" ? <Loading label="Reading the tenancy" /> : tenancy.state === "failed" ? <Failed error={tenancy.error} /> : (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
                      <Fact label="Tenants" value={tenants.length ? tenants.map((t) => t.name).join(", ") : "None on record"} />
                      <Fact label="Rent" value={rentLine ?? noRent} />
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

                {/* Who lived here before, with how to reach them (Josel, 20 Oct 2026). */}
                {!p.test && (
                  <section id="past-tenants" className={`${card} scroll-mt-6 p-5 md:col-span-2`}>
                    <p className={`${eyebrow} mb-3`}>Past tenants</p>
                    <PastTenantPeople key={p.listingId} listing={String(p.listingId)} listings={sendListings} about={homeLine} />
                  </section>
                )}

                {/* Every let this home has had since the archive started, with
                    what was owed at the last PayProp read (lib/tenancy-archive). */}
                {p.propertyId && (
                  <section className={`${card} p-5 md:col-span-2`}>
                    <p className={`${eyebrow} mb-3`}>Past tenancies</p>
                    <PastTenancies propertyId={p.propertyId} compact />
                  </section>
                )}

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

            {tab === "notes" && (
              <section className="mt-4">
                <HomeNotes key={`${propertyId}-${p.listingId}`} propertyId={propertyId} listingId={String(p.listingId)} onCount={setNoteCount} />
              </section>
            )}

            {tab === "documents" && (
              <section className="mt-4">
                {!p.test && loginListings.length > 0 && (
                  <SendBar onSend={() => setSendOpen({ start: null })} what="this home's certificates and documents" label="Send to Tenants" />
                )}
                {/* The home's documents (lib/file-documents): what Kirstie added
                    on the deal and the agent on the listing or application for
                    this address are all here, and anything added here is on
                    theirs. Kept on the OS; nobody is sent anything. */}
                <FileDocuments
                  key={p.listingId}
                  address={noticeHome.address}
                  propertyId={/^\d+$/.test(String(p.propertyId ?? "")) ? p.propertyId : null}
                  from={{ kind: "property", id: String(p.listingId) }}
                  showMissing={false}
                  dropZone
                  intro="Inventories, agreements and anything else that isn't a certificate. Kept on this home, so the office and the agent both see them, including what was added at pre-tenancy. Uploading sends nothing to the landlord or tenant."
                />
                {/* The clean sweep's papers, for the office (Josel, 20 Oct 2026). */}
                {!p.test && <RecordFiles key={`record-${p.listingId}`} listing={String(p.listingId)} listings={sendListings} />}
              </section>
            )}

          </section>

          {/* Rent where the map was (James, 8 Oct 2026): up to date or how
              far behind, and the money in and out, live from PayProp. */}
          {!p.test && (
            <RentBox
              listingId={String(p.listingId)}
              className={`${box} xl:col-start-2 xl:row-start-3 xl:self-start`}
              shape={houseView && house && !lets
                ? { kind: "rooms", rooms: house.rooms.map((r) => ({ id: String(r.listingId), label: roomLabel(r), tenant: r.tenants[0]?.name ?? null, rent: r.rent, period: r.rentPeriod, monthly: r.rentMonthly })) }
                : { kind: "home", rent: p.rentMonthly, tenants: tenants.map((t) => t.name) }}
            />
          )}

            {everything && !p.test && p.onRex !== false && (
              <p className="text-[11.5px] text-muted xl:col-start-1 xl:row-start-4">
                <a href={rexListingUrl(p.listingId, "leased")} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Open the record behind this home</a>
              </p>
            )}
        </div>
      </div>

      {popups}
    </SaveScopeProvider>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────── */

/* Above the certificates and the documents: send them on from here. */
function SendBar({ onSend, what, label }: { onSend: () => void; what: string; label: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/60 bg-white px-4 py-3">
      <p className="min-w-0 text-[12.5px] text-muted">Email the tenants {what}, from you. You pick the files and the people, edit the email before it goes, and each send is kept on the record.</p>
      <button type="button" onClick={onSend} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">
        <DoodleIcon name="mail" size={13} />{label}
      </button>
    </div>
  );
}

function Info({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name={icon} size={13} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-[13px]">{text}</span>
      </span>
    </div>
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

/** A tenant or the landlord: the same block as every person in the OS, changeable
 *  where REX knows them (James, 12 Oct 2026). REX PM's own tenants carry no REX
 *  contact, so theirs save to the OS's own row (Sean McMahon, 21 Oct 2026:
 *  Megan at 3 Oak Place) - email and number, not the name. */
function PartyCard({ p, plain = false, role, home, about }: { p: Party; plain?: boolean; role?: string; home?: { propertyAddress?: string | null }; about?: string }) {
  const rexId = /^\d+$/.test(String(p.contactId ?? "")) ? `rex:${p.contactId}` : null;
  const pmRef = /^rexpm:[^:]+:\d+$/.test(String(p.contactId ?? "")) ? String(p.contactId) : null;
  const held = useRef({ email: p.email ?? "", phone: p.phone ?? "" });
  const saver = pmRef
    ? async (field: "name" | "email" | "phone", value: string) => {
        if (field === "name") return { ok: false, error: "Their name comes from the tenancy record, so it can't be changed here." };
        const r = await fetch("/api/people/contact", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ref: pmRef, tenantName: p.name, [field]: value, keep: held.current }),
        }).catch(() => null);
        const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; sync?: { detail?: string } } | null;
        if (!j?.ok) return { ok: false, error: j?.error ?? "That didn't save. Try again." };
        held.current = { ...held.current, [field]: value };
        return { ok: true, detail: j.sync?.detail };
      }
    : undefined;
  const body = (
    <ContactBlock
      role={role}
      home={home}
      about={about}
      person={{ name: p.name, email: p.email, phone: p.phone }}
      personRef={rexId}
      saver={saver}
    />
  );
  if (plain) return body;
  return <li className="rounded-xl border border-line/50 px-4 py-3 text-[13px]">{body}</li>;
}

function JobsList({ orders, carried, onOpen }: { orders: WorksOrder[]; carried: CarriedJob[]; onOpen: (o: WorksOrder) => void }) {
  const [showClosed, setShowClosed] = useState(false);
  const open = orders.filter((o) => OPEN.includes(o.status));
  const closed = orders.filter((o) => !OPEN.includes(o.status));
  if (!orders.length && !carried.length) {
    return <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12.5px] text-muted">No jobs on this home yet. Report a repair or plan a certificate and it lands here.</p>;
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
          <Pill tone={o.status === "done" || o.status === "paid" ? "good" : next.hot ? "accent" : "neutral"}>{statusLabel(o)}</Pill>
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
      {/* The report that came with it (a visit recorded from Inventory Base, 19 Oct 2026). */}
      {i.files?.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-3">
          {i.files.map((f) => (
            <a key={f.key} href={`/api/r2/file?key=${encodeURIComponent(f.key)}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11.5px] hover:border-ink/40">
              <DoodleIcon name="doc" size={11} className="shrink-0 text-accent-dark" />
              <span className="truncate">{f.name}</span>
            </a>
          ))}
        </div>
      )}
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
  /* Booked: what went and to whom, before the pop-up closes (ticket cf2d722c). */
  const [booked, setBooked] = useState<{ inspection: Inspection; events: InspectionEvent[] } | null>(null);
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
    if (r.inspection && Array.isArray(r.events)) setBooked({ inspection: r.inspection, events: r.events });
    else onBooked();
    return true;
  };
  if (booked) {
    const at = booked.inspection.bookedAt;
    return (
      <div>
        <p className="text-[13px] font-semibold">
          Booked{at ? ` for ${new Date(at).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}
          {booked.inspection.inspector ? ` with ${booked.inspection.inspector}` : ""}.
        </p>
        <p className="mt-3 text-[10.5px] font-bold uppercase tracking-wider text-muted">Emails</p>
        <SentEmails inspectionId={booked.inspection.id} events={booked.events} />
        <button type="button" onClick={onBooked} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
          Done
        </button>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 text-[12px] text-muted">{VISIT_KIND[inspection.kind] ?? "Visit"} · {inspection.propertyName}</p>
      <BookForm inspection={inspection} team={team} me={me} busy={busy} onMove={move} styled />
      {err && <p className="mt-3 text-[12.5px] text-accent-dark">{err}</p>}
      <p className="mt-4 text-[11.5px] text-muted">
        The full visit sheet, with the write-up and the report, is on <Link href={`/inspections?open=${encodeURIComponent(inspection.id)}`} className="underline underline-offset-2">Inspections</Link>.
      </p>
    </div>
  );
}

/* ── notice, recorded from the home ───────────────────────────────────── */

type NoticeDraft = { served?: string; leaving?: string; note?: string };

function NoticeSheet({
  propertyId, propertyName, tenants, landlord, rent, draft = null, onDraft, onClose, onSaved,
}: {
  propertyId: string;
  propertyName: string;
  tenants: Party[];
  landlord: string;
  rent: string;
  draft?: NoticeDraft | null;
  onDraft?: (d: NoticeDraft) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [served, setServed] = useState(draft?.served ?? ymd(new Date()));
  const [leaving, setLeaving] = useState(draft?.leaving ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  /* Kept as it is typed once a leaving day or a note is in. */
  const keep = useRef(onDraft);
  keep.current = onDraft;
  useEffect(() => {
    if (!keep.current || !(leaving || note.trim())) return;
    const t = setTimeout(() => keep.current?.({ served, leaving, note }), 700);
    return () => clearTimeout(t);
  }, [served, leaving, note]);
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

/**
 * The swap already made on this home (16 Oct 2026): who is going, who is
 * coming, from when and at what rent, and where its PLC check stands - with
 * the PLC check and the let one press away. The let carries the rest.
 */
function SwapOpen({ s, onAnother, canAct }: { s: SwapUnderWay; onAnother: () => void; canAct: boolean }) {
  const pounds = (n: number | null) => (n == null ? null : `£${n.toLocaleString("en-GB")}`);
  const plcHref = `/plc/start?application=${encodeURIComponent(s.application)}`;
  const plcLabel = !s.plc ? "Start the PLC check" : s.plc.state === "assembling" ? "Finish the PLC check" : s.plc.state === "deferred" ? "Answer compliance on the PLC" : "See the PLC check";
  const rows: Array<[string, string]> = [
    ["Leaving", s.swap.leaving.join(", ") || "—"],
    ["Moving in", s.swap.joining.join(", ") || "—"],
    ["Staying", s.swap.staying.join(", ") || "—"],
    ...((s.swap.rereference ?? []).length ? [["Referenced again", (s.swap.rereference ?? []).join(", ")] as [string, string]] : []),
    ["From", day(s.swap.moveIn)],
    ["Rent for the home", s.swap.rentPcm != null ? `${pounds(s.swap.rentPcm)} a month` : "—"],
    ...(s.swap.rentPortion != null ? [["Their portion", `${pounds(s.swap.rentPortion)} a month`] as [string, string]] : []),
    ["PLC check", s.plc ? s.plc.short : "Not started yet"],
  ];
  return (
    <div>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Made by {s.swap.by} on {day(s.swap.at)}. It is on Applications as its own let: the PLC check and everything after it is done from there.
      </p>
      <dl className="mt-4 grid gap-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 text-[13px]">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        {canAct && (
          <button type="button" onClick={onAnother} className="mr-auto text-[12px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
            Another change to the tenants
          </button>
        )}
        <Link href={`/applications/${encodeURIComponent(s.application)}`} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold hover:border-ink">
          Open the let
        </Link>
        <Link href={plcHref} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">
          {plcLabel}
        </Link>
      </div>
    </div>
  );
}

/** A pop-up over the page: the actions open here and leave their mark in the latest activity. */
function Modal({ title, wide = false, onClose, children }: { title?: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className={`fade-up relative w-full ${wide ? "max-w-[760px]" : "max-w-[600px]"} rounded-2xl border border-line/70 bg-page p-6 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8`}>
        {title && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-[22px] leading-tight">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** One line of activity: open it, or for a draft carry on or bin it. */
function ActivityRow({ a }: { a: Activity }) {
  return (
    <li className={`flex items-stretch rounded-xl bg-white ${a.unfinished ? "border border-dashed border-accent-dark/50" : ""}`}>
      <button type="button" onClick={a.go} className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-box/60">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.hot ? "bg-accent-dark text-white" : "bg-accent-soft text-accent-dark"}`}>
          <DoodleIcon name={a.icon} size={12} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold">{a.title}</span>
          <span className={`block truncate text-[11.5px] ${a.hot ? "text-accent-dark" : "text-muted"}`}>{a.sub}</span>
        </span>
        <span className="shrink-0 pt-0.5 text-[11px] text-muted">{a.unfinished ? "Carry on" : shortDay(a.at)}</span>
      </button>
      {a.bin && (
        <button type="button" onClick={() => void a.bin?.()} aria-label="Bin this draft" title="Bin this draft" className="flex w-10 shrink-0 items-center justify-center rounded-r-xl border-l border-dashed border-accent-dark/30 text-muted transition-colors hover:bg-accent-soft hover:text-accent-dark">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
        </button>
      )}
    </li>
  );
}

/**
 * Everything that has happened on the home, pulled out from the right
 * (James, 7 Oct 2026: five in the box, "a view all button where they can see
 * a full breakdown"). Unfinished first, then month by month, newest first.
 */
function AllActivity({ title, items, reading, onClose }: { title: string; items: Activity[]; reading: boolean; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(t); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  /* Opening one closes the drawer, so what it opens is not underneath it. */
  const rows = items.map((a) => ({ ...a, go: a.go ? () => { onClose(); a.go?.(); } : undefined }));
  const unfinished = rows.filter((a) => a.unfinished);
  const months = new Map<string, Activity[]>();
  for (const a of rows.filter((x) => !x.unfinished)) {
    const d = new Date(a.at);
    const k = Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "Undated";
    months.set(k, [...(months.get(k) ?? []), a]);
  }
  return (
    <div className="fixed inset-0 z-[150]">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/45 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-label="All activity"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[380ms] sm:rounded-l-2xl ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">All activity · {items.length}</p>
            <h2 className="hand mt-1 truncate text-[20px] leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-accent-soft/30 px-6 py-5">
          {unfinished.length > 0 && (
            <section>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-accent-dark">Not finished</p>
              <ul className="space-y-2">{unfinished.map((a) => <ActivityRow key={a.key} a={a} />)}</ul>
            </section>
          )}
          {[...months.entries()].map(([m, list]) => (
            <section key={m}>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{m}</p>
              <ul className="space-y-2">{list.map((a) => <ActivityRow key={a.key} a={a} />)}</ul>
            </section>
          ))}
          {reading && <Loading label="Still reading" />}
          {!items.length && !reading && <p className="text-[12.5px] text-muted">Nothing recorded on this home yet.</p>}
        </div>
      </aside>
    </div>
  );
}

/* ── the new look's pieces (lib/new-look "property") ─────────────────────
   The same rows as the old page's lists, drawn as the design's row lists:
   hairlines, a word with a dot for the state, the action on the right. */

function NlFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="nl-fact">
      <span>{label}</span>
      <b className="nl-prop-dl-v">{value}</b>
    </div>
  );
}

function NlActivityRow({ a }: { a: Activity }) {
  return (
    <li className={`nl-prop-act${a.unfinished ? " is-draft" : ""}${a.hot ? " is-hot" : ""}`}>
      <button type="button" onClick={a.go} className="nl-prop-act-main">
        <span className="nl-prop-act-ic" aria-hidden><DoodleIcon name={a.icon} size={13} /></span>
        <span className="min-w-0 flex-1">
          <span className="nl-strong block truncate">{a.title}</span>
          <span className="nl-meta nl-prop-act-sub block truncate">{a.sub}</span>
        </span>
        <span className="nl-mono shrink-0">{a.unfinished ? "Carry on" : shortDay(a.at)}</span>
      </button>
      {a.bin && (
        <button type="button" onClick={() => void a.bin?.()} aria-label="Bin this draft" title="Bin this draft" className="nl-iconbtn nl-iconbtn--sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
        </button>
      )}
    </li>
  );
}

function NlJobs({ orders, carried, onOpen }: { orders: WorksOrder[]; carried: CarriedJob[]; onOpen: (o: WorksOrder) => void }) {
  const [showClosed, setShowClosed] = useState(false);
  const open = orders.filter((o) => OPEN.includes(o.status));
  const closed = orders.filter((o) => !OPEN.includes(o.status));
  if (!orders.length && !carried.length) {
    return <p className="nl-prop-blank">No jobs on this home yet. Report a repair or plan a certificate and it lands here.</p>;
  }
  const row = (o: WorksOrder) => {
    const next = nextFor(o);
    const tone: Tone = o.status === "done" || o.status === "paid" ? "good" : next.hot ? "accent" : "neutral";
    return (
      <li key={o.id}>
        <button type="button" onClick={() => onOpen(o)} className="nl-prop-job">
          <span className={`nl-prop-row-ic${next.hot && OPEN.includes(o.status) ? " is-hot" : ""}`} aria-hidden>
            <DoodleIcon name={o.kind === "repair" ? "setting" : "calendar"} size={17} />
          </span>
          <span className="min-w-0">
            <span className="nl-prop-row-title">{o.title}</span>
            <span className="nl-meta block truncate">
              <span className="nl-mono">#{o.ref}</span> · {o.kind === "repair" ? "Repair" : "Planned"} · {o.category} · reported {shortDay(o.reportedAt ?? o.createdAt)}
            </span>
          </span>
          <span className={`nl-prop-job-next${next.hot ? " is-hot" : ""}`}>{next.text}</span>
          <Badge tone={tone}>{statusLabel(o)}</Badge>
        </button>
      </li>
    );
  };
  return (
    <div className="nl-holder">
      <section className="nl-prop-group">
        <h3 className="nl-prop-group-title">Open <span className="nl-meta">{open.length}</span></h3>
        {open.length > 0 ? <ul className="nl-prop-list">{open.map(row)}</ul> : <p className="nl-prop-blank">Nothing open on this home.</p>}
      </section>
      {carried.length > 0 && (
        <section className="nl-prop-group">
          <h3 className="nl-prop-group-title">Still Open from the Old System <span className="nl-meta">{carried.length}</span></h3>
          <ul className="nl-prop-list">
            {carried.map((c) => (
              <li key={c.taskId} className="nl-prop-carried">
                <span className={`nl-prop-row-ic${c.overdue ? " is-hot" : ""}`} aria-hidden><DoodleIcon name="setting" size={17} /></span>
                <span className="min-w-0">
                  <span className="nl-prop-row-title">{c.title}</span>
                  <span className="nl-meta block truncate">{c.category} · {c.progress || "Not started"}{c.managedBy ? ` · with ${c.managedBy}` : ""}</span>
                </span>
                {c.dueOn ? <Badge tone={c.overdue ? "accent" : "neutral"} bare>{c.overdue ? "Overdue" : "Due"} {day(c.dueOn)}</Badge> : <span />}
              </li>
            ))}
          </ul>
          <p className="nl-meta nl-prop-group-foot">Taken on from the Maintenance board.</p>
        </section>
      )}
      {closed.length > 0 && (
        <section className="nl-prop-group">
          <button type="button" className="nl-prop-group-title nl-prop-group-toggle" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
            Finished <span className="nl-meta">{closed.length}</span>
            <span className="nl-link ml-auto">{showClosed ? "Hide" : "Show"}</span>
          </button>
          {showClosed && <ul className="nl-prop-list nl-fade">{closed.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}

function NlVisits({ data }: { data: Visits }) {
  const open = data.inspections.filter((i) => OPEN_VISIT.includes(i.status));
  const past = data.inspections.filter((i) => !OPEN_VISIT.includes(i.status));
  const row = (i: Inspection) => (
    <li key={i.id}>
      <Link href={`/inspections?open=${encodeURIComponent(i.id)}`} className="nl-prop-visit">
        <span className={`nl-prop-row-ic${i.status === "no_access" ? " is-hot" : ""}`} aria-hidden>
          <DoodleIcon name={i.kind === "check_out" ? "logout" : i.kind === "check_in" ? "key" : "checklist"} size={17} />
        </span>
        <span className="min-w-0">
          <span className="nl-prop-row-title">{VISIT_KIND[i.kind] ?? "Visit"}</span>
          <span className="nl-meta block truncate"><span className="nl-mono">#{i.ref}</span>{i.inspector ? ` · ${i.inspector}` : ""}</span>
        </span>
        <span className="nl-meta nl-prop-visit-when">
          {i.visitedAt ? `Visited ${day(i.visitedAt)}` : i.bookedAt ? `Booked ${stamp(i.bookedAt)}` : i.dueAt ? `Due ${day(i.dueAt)}` : ""}
        </span>
        <Badge tone={i.status === "closed" || i.status === "reported" ? "good" : i.status === "no_access" ? "accent" : "neutral"}>{VISIT_STATUS[i.status] ?? i.status}</Badge>
      </Link>
      {/* The report that came with it (a visit recorded from Inventory Base, 19 Oct 2026). */}
      {i.files?.length > 0 && (
        <div className="nl-prop-visit-files">
          {i.files.map((f) => (
            <a key={f.key} href={`/api/r2/file?key=${encodeURIComponent(f.key)}`} target="_blank" rel="noopener noreferrer" className="nl-link">
              <Ico name="download" size={13} /><span className="truncate">{f.name}</span>
            </a>
          ))}
        </div>
      )}
    </li>
  );
  return (
    <div className="nl-holder">
      {data.due.map((d) => (
        <div key={d.key} className={`nl-prop-due${d.daysAway < 0 ? " is-hot" : ""}`}>
          <b>{VISIT_KIND[d.kind] ?? "Visit"} {d.daysAway < 0 ? "overdue since" : "due"} {day(d.dueAt)}</b>
          <span className="nl-meta"> · {d.why}</span>
        </div>
      ))}
      {open.length > 0 && (
        <section className="nl-prop-group">
          <h3 className="nl-prop-group-title">In Hand <span className="nl-meta">{open.length}</span></h3>
          <ul className="nl-prop-list">{open.map(row)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="nl-prop-group">
          <h3 className="nl-prop-group-title">Past Visits <span className="nl-meta">{past.length}</span></h3>
          <ul className="nl-prop-list">{past.map(row)}</ul>
        </section>
      )}
      {!data.due.length && !data.inspections.length && <p className="nl-prop-blank">No visits on this home yet, and none owed.</p>}
    </div>
  );
}

function NlEnding({ data }: { data: Ending }) {
  if (!data.open.length && !data.done.length && !data.reviewsDone.some((r) => r.outcome === "ending")) {
    return <p className="nl-meta">No notice on this tenancy.</p>;
  }
  return (
    <ul className="nl-lines">
      {data.open.map((m) => (
        <li key={m.key} className="nl-prop-leaving">
          <span className="min-w-0 flex-1">
            <span className="nl-strong block">{m.moveOutOn ? `Leaving ${day(m.moveOutOn)}` : "Leaving, date to set"}{m.daysAway != null && m.daysAway >= 0 ? <span className="nl-meta"> · in {m.daysAway} {m.daysAway === 1 ? "day" : "days"}</span> : null}</span>
            <span className="nl-meta block">{[m.tenant, m.progress].filter(Boolean).join(" · ")}</span>
          </span>
          <Link href="/move-outs" className="nl-link shrink-0">Open the move-out</Link>
        </li>
      ))}
      {data.done.map((m) => (
        <li key={m.id}>
          <span className="nl-meta">
            {m.outcome === "moved_out" ? `Moved out ${day(m.movedOutOn)}` : m.outcome === "staying" ? "Notice withdrawn, staying" : m.note || "Closed"}
            {m.tenant ? ` · ${m.tenant}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
