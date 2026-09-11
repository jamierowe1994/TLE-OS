"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PhotoLightbox from "@/components/PhotoLightbox";
import Link from "next/link";
import EmailToTenants from "@/components/EmailToTenants";
import ProcessTimeline from "@/components/ProcessTimeline";
import PortalStatsPanel from "@/components/PortalStatsPanel";
import TenancyLinkPanel from "@/components/TenancyLinkPanel";
import ListingDocuments from "@/components/ListingDocuments";
import PropertyFile from "@/components/PropertyFile";
import ViewingBooker, { type Person } from "@/components/ViewingBooker";
import { CopyButton, DoneTick, PressButton } from "@/components/Bits";
import { Tag } from "@/components/ListingTags";
import AccessRequest, { AccessSettings, NO_ACCESS, type Access } from "@/components/listing/AccessRequest";
import DropZone, { type DropKind } from "@/components/listing/DropZone";
import PickOne from "@/components/PickOne";
import { LISTING_BOOKER_LIVE } from "@/lib/viewing-sends";
import { LISTING_TRACK, listingStartingStep } from "@/lib/journey";
import type { Landlord } from "@/lib/rex-landlord";
import { LEADS, leadSide } from "@/lib/leads-sample";
import { DIARY } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import { setOpenListing } from "@/lib/open-record";
import type { TenancyLink } from "@/lib/tenancy-link";
import { saveLabel, useCaseState } from "@/lib/case-state";
import { useListingTerms } from "@/lib/use-listing-terms";

/**
 * The property record — the leads drawer's shape, aimed at a thing instead of
 * a person.
 *
 * Two actions sit above everything else because they are what an agent
 * actually does with a live listing: get it in front of people, and get people
 * through the door. Everything else on the page is reference.
 *
 * The process track carries Susan's real stages (via James, 7 Aug 2026):
 * live → viewings → offers → offer accepted → handover. It ends at handover
 * because everything after "let agreed" is the applicant's pre-tenancy
 * journey, and that runs on the Applications side with Kirstie.
 */

export type Listing = {
  /** Every photo REX holds, in its own order. Optional because the static
   *  fallback export predates the OS keeping more than the first one. */
  images?: string[];
  id: string;
  /** The REX property behind the listing. Certificates hang off this. */
  propertyId?: string | null;
  name: string;
  locality: string;
  rent: number | null;
  letAgreed: boolean;
  publicationStatus: string | null;
  availableFrom: string | null;
  epcExpiry: string | null;
  daysOnMarket: number | null;
  /** The day it went live, ISO date. Null for drafts. */
  publishedAt?: string | null;
  lastUpdated: string | null;
  imageCount: number;
  image: string | null;
  /** The sitting tenant, when the property is occupied. */
  tenant?: { name: string; email: string; phone: string } | null;
  /** The portal write-up, live from REX's `related.listing_adverts`. */
  advertHeading?: string | null;
  advertBody?: string | null;
};

/** One live advert on a public portal. Mirrors lib/rex-portal-links.ts, kept
 *  local so a client component never reaches into the REX client. */
type PortalLink = { portal: string; url: string; remoteId: string | null };

/** The landlord lookup. "REX didn't answer" is kept apart from "no landlord". */
type LandlordState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "known"; landlord: Landlord }
  | { status: "none" }
  | { status: "problem"; says: string };

type TabKey = "home" | "applications" | "viewings" | "marketing" | "compliance" | "documents";

/* SIX VIEWS, ONE RECORD (James, 11 Sep 2026). Home is the record itself -
   the hero, the landlord, at a glance, next up and the spine. The rest each
   take the whole drawer, in the order they get clicked: applications,
   viewings, marketing (the property's facts, the write-up and the photos in
   one place), compliance, documents. Home brings you back. */
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "applications", label: "Applications", icon: "coin" },
  { key: "viewings", label: "Viewings", icon: "calendar" },
  { key: "marketing", label: "Marketing", icon: "megaphone" },
  { key: "compliance", label: "Compliance", icon: "shield" },
  { key: "documents", label: "Documents", icon: "file-contract" },
];

const SAGE_INK = "#56634a";
const SAGE_WASH = "#f1f4ec";

/** One tenant on an offer — who they are and how they live. */
type TenantIn = {
  name: string;
  number: string;
  mobile: string;
  situation: string;
  /** The record this person came from. An offer with no attached file is
   *  an offer from a stranger, so this is never blank on a saved offer. */
  fromId: string;
};
const BLANK_TENANT: TenantIn = { name: "", number: "", mobile: "", situation: "", fromId: "" };

type Offer = { rent: string; tenants: TenantIn[] };

const TYPES = ["Flat", "Terraced", "Semi-detached", "Detached", "Bungalow", "Maisonette", "HMO", "Room"];

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="hand flex items-center gap-2.5 text-[15px]">
          <DoodleIcon name={icon} size={15} className="text-accent-dark" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px]">{label}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          −
        </button>
        <span className="figures w-6 text-center text-[13px]">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          +
        </button>
      </span>
    </div>
  );
}

const APPLICANTS: Person[] = LEADS.filter((l) => leadSide(l) === "tenant").map((l) => ({
  name: l.name,
  email: l.email,
  phone: l.phone,
  lat: l.lat,
  lng: l.lng,
}));

export default function ListingDrawer({
  listing,
  onClose,
  onStep,
}: {
  listing: Listing | null;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<TabKey>("home");
  const [emailing, setEmailing] = useState(false);
  /* Asked once, read by the header pill and by the Documents tab. */
  const terms = useListingTerms(listing?.id ?? null);
  const [booking, setBooking] = useState(false);

  /* Where this property is actually advertised, live from REX's portal feed
     rows. Fetched per listing rather than carried on the book: the book is one
     cached object for the whole branch and these are one call per property. */
  const [portals, setPortals] = useState<PortalLink[]>([]);
  const [portalsLoading, setPortalsLoading] = useState(false);

  /**
   * The landlord, from REX's owner relationship on the listing.
   *
   * Was `landlordFor(listing.id)` — one of five invented people, hashed off
   * the id, rendered with a name, a phone and an email exactly like a real
   * record. It also fed the Terms of Business e-sign and the PLC handover
   * package. See lib/rex-landlord.ts for what it reads and how well populated
   * it is (88% of rentals).
   */
  const [landlord, setLandlord] = useState<LandlordState>({ status: "idle" });
  /* The photo set popped out full size; null when closed. */
  const [lightbox, setLightbox] = useState<number | null>(null);
  /* How we get into the property - vacant, tenant or landlord - kept on
     the record so the hero button and the Documents tab agree. */
  const [access, setAccess, accessStatus] = useCaseState<Access>("access", listing?.id ?? null, NO_ACCESS);
  /* Photographs added here, out of R2, shown beside REX's. */
  const [uploaded, setUploaded] = useState<{ key: string; url: string }[]>([]);
  const [drop, setDrop] = useState<DropKind | null>(null);
  const [writing, setWriting] = useState(false);
  /* The certificates on the property, for the legal minimum before the
     listing can go to the portals: EPC, gas safety and EICR. */
  const [certs, setCerts] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    setCerts(null);
    if (!listing) return;
    let off = false;
    const key = listing.propertyId ? `property=${encodeURIComponent(String(listing.propertyId))}` : `address=${encodeURIComponent(listing.name)}`;
    fetch(`/api/property-file?${key}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; rows?: { type: string; state: string }[] }) => {
        if (off) return;
        if (!j.ok || !Array.isArray(j.rows)) return setCerts({});
        setCerts(Object.fromEntries(j.rows.map((r) => [r.type, r.state])));
      })
      .catch(() => !off && setCerts({}));
    return () => {
      off = true;
    };
  }, [listing, drop]);
  const [me, setMe] = useState<string>("The Letting Experts");
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user?: { name?: string }; name?: string }) => {
        const n = j.user?.name ?? j.name;
        if (n) setMe(n);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setUploaded([]);
    const id = listing?.id;
    if (!id) return;
    let off = false;
    fetch(`/api/r2/list?scope=photo&ref=${encodeURIComponent(`listing-${id}`)}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; files?: { key: string; url: string }[] }) => {
        if (!off && j.ok && Array.isArray(j.files)) setUploaded(j.files);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [listing?.id]);
  useEffect(() => {
    if (!listing) { setEnquiries(null); setLiveApps(null); return; }
    let gone = false;
    const id = String(listing.id);
    setEnquiries(null);
    setLiveApps(null);
    fetch("/api/leads", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; leads?: { id: string; name: string; source: string; received: string; receivedAt?: string; email: string; phone: string; enquiryMessage?: string; listingId?: number | string }[] }) => {
        if (gone) return;
        const mine = (j.leads ?? []).filter((l) => String(l.listingId ?? "") === id);
        setEnquiries(mine.map((l) => ({ id: l.id, name: l.name, source: l.source, received: l.received, receivedAt: l.receivedAt, email: l.email, phone: l.phone, message: l.enquiryMessage })));
      })
      .catch(() => { if (!gone) setEnquiries([]); });
    setViewings(null);
    setOpenViewing(null);
    fetch(`/api/listings/viewings?id=${encodeURIComponent(id)}${listing.propertyId ? `&property=${encodeURIComponent(String(listing.propertyId))}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; upcoming?: LiveViewing[]; past?: LiveViewing[] }) => {
        if (gone) return;
        setViewings({ upcoming: j.upcoming ?? [], past: j.past ?? [] });
      })
      .catch(() => { if (!gone) setViewings({ upcoming: [], past: [] }); });
    fetch("/api/applications?limit=300", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; applications?: { id: string; statusLabel?: string; status?: string; listingId?: string | number; applicants?: { name?: string }[]; offerAmount?: number | null; dateReceived?: number | null }[] }) => {
        if (gone) return;
        const mine = (j.applications ?? []).filter((a) => String(a.listingId ?? "") === id);
        setLiveApps(mine.map((a) => ({ id: String(a.id), statusLabel: a.statusLabel ?? a.status ?? "", applicants: (a.applicants ?? []).map((x) => x.name).filter(Boolean).join(" & "), offerAmount: a.offerAmount ?? null, dateReceived: a.dateReceived ?? null })));
      })
      .catch(() => { if (!gone) setLiveApps([]); });
    return () => { gone = true; };
  }, [listing]);

  useEffect(() => {
    if (!listing) {
      setLandlord({ status: "idle" });
      return;
    }
    let gone = false;
    setLandlord({ status: "loading" });
    fetch(`/api/listings/landlord?id=${encodeURIComponent(listing.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; landlord?: Landlord | null; problem?: string }) => {
        if (gone) return;
        if (!j.ok) setLandlord({ status: "problem", says: j.problem ?? "REX didn't answer." });
        else if (j.landlord) setLandlord({ status: "known", landlord: j.landlord });
        else setLandlord({ status: "none" });
      })
      .catch(() => {
        if (!gone) setLandlord({ status: "problem", says: "Couldn't reach REX to look the landlord up." });
      });
    return () => {
      gone = true;
    };
  }, [listing]);

  const [type, setType] = useState("");
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);
  const [receptions, setReceptions] = useState(0);
  const [furnished, setFurnished] = useState("");
  const [booked, setBooked] = useState<{ when: string; who: string }[]>([]);
  const [step, setStep] = useState(0);
  const [handingOver, setHandingOver] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  /* LIVE, from REX via the OS: the enquiries and the applications on THIS
     listing (James, 7 Sep 2026: "it's not showing the actual leads that have
     inquired about a property"). The lead book is the cached one every
     screen shares, filtered here to the listing; applications likewise. */
  const [enquiries, setEnquiries] = useState<{ id: string; name: string; source: string; received: string; receivedAt?: string; email: string; phone: string; message?: string }[] | null>(null);
  /* The listing's diary out of REX (and kept): upcoming and past viewings,
     who came and who took them (James, 7 Sep). */
  type LiveViewing = { id: string; startsAt: string; endsAt: string | null; mins: number; kind: string; title: string; type: string | null; status: string | null; cancelled: boolean; agent: string | null; contacts: { id: string; name: string; email: string | null; phone: string | null; leadId?: string | null }[]; feedbackId: string | null; description: string | null };
  const [viewings, setViewings] = useState<{ upcoming: LiveViewing[]; past: LiveViewing[] } | null>(null);
  const [openViewing, setOpenViewing] = useState<string | null>(null);
  const [liveApps, setLiveApps] = useState<{ id: string; statusLabel: string; applicants: string; offerAmount: number | null; dateReceived: number | null }[] | null>(null);
  const [topPick, setTopPick] = useState<number | null>(null);
  /* The landlord–property–tenant link, made the moment an offer is accepted
     and stored per listing in os_case_state. Null until someone accepts, at
     which point it is derived from the picked offer below. */
  const [linkState, setLinkState, linkSave] = useCaseState<TenancyLink | null>(
    "tenancy-link",
    listing?.id ?? null,
    null
  );
  const [offering, setOffering] = useState(false);

  /* The link, made from the accepted offer. Derived rather than typed again:
     the tenants on the offer ARE the tenants on the tenancy, and re-entering
     them is how the two versions drift apart. Once it exists it is owned by
     the panel, because only the panel may end it. */
  const link: TenancyLink | null = useMemo(() => {
    if (linkState) return linkState;
    const picked = topPick != null ? offers[topPick] : null;
    if (!picked || !listing) return null;
    return {
      state: "accepted",
      rexApplicationId: null,
      listingId: listing.id,
      listingName: listing.name,
      /* null, not a name. This used to carry whichever invented landlord
         `landlordFor()` hashed the listing id onto, straight into the PLC
         handover package — a compliance record naming a person who does not
         exist. Pre-tenancy fills the real one in when they have it. */
      landlord:
        landlord.status === "known"
          ? { contactId: landlord.landlord.contactId, name: landlord.landlord.name }
          : null,
      tenants: picked.tenants
        .filter((t) => t.name.trim())
        .map((t, i) => ({
          contactId: t.fromId || null,
          name: t.name.trim(),
          email: null,
          mobile: t.mobile || null,
          isPrimary: i === 0,
        })),
      offerAmount: Number(String(picked.rent).replace(/[^\d]/g, "")) || null,
      acceptedOn: new Date().toISOString().slice(0, 10),
      startDate: null,
      endDate: null,
      endedOn: null,
      endedReason: null,
      endedNotes: "",
    };
  }, [linkState, topPick, offers, listing]);
  /** Widen the search beyond people who viewed THIS property. */
  const [otherTenants, setOtherTenants] = useState(false);
  const [tenantQuery, setTenantQuery] = useState("");
  const { appts: liveDiary } = useDiary();

  /**
   * Who may be attached to an offer.
   *
   * By default only people who have actually VIEWED this property — that's
   * who offers come from nearly every time, and it keeps the list to the
   * handful that matter. "Find other tenants" widens it to everyone we hold
   * a viewing record for, searched by name.
   */
  const candidates = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; phone: string; note: string }>();
    const here = (a: { what: string; where: string }) =>
      `${a.what} ${a.where}`.toLowerCase().includes((listing?.name ?? "\u0000").toLowerCase());
    /* This listing's own diary out of REX first. The shared diary below only
       holds what the OS itself booked, so on a property REX has run sixteen
       viewings on it said "nobody has viewed this property yet" and sent the
       agent off to search - with the sixteen people sitting on the tab next
       to it. */
    if (!otherTenants) {
      for (const v of [...(viewings?.upcoming ?? []), ...(viewings?.past ?? [])]) {
        if (v.cancelled) continue;
        for (const c of v.contacts) {
          const key = c.name.trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          const when = new Date(v.startsAt);
          seen.set(key, {
            id: c.id,
            name: c.name,
            phone: c.phone ?? "",
            note: `${when.getTime() > Date.now() ? "Viewing booked" : "Viewed"} ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
          });
        }
      }
    }
    for (const a of liveDiary) {
      if (a.kind !== "viewing" || !a.who) continue;
      if (!otherTenants && !here(a)) continue;
      const key = a.who.toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        id: a.id,
        name: a.who,
        phone: a.contact?.phone ?? "",
        note: otherTenants
          ? `Viewed ${a.what.toLowerCase()}${a.where ? ` · ${a.where}` : ""}`
          : `Viewed this property${a.day < 0 ? ` ${-a.day}d ago` : a.day === 0 ? " today" : ` in ${a.day}d`}`,
      });
    }
    const all = [...seen.values()];
    const q = tenantQuery.trim().toLowerCase();
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all.slice(0, otherTenants ? 40 : 12);
  }, [liveDiary, listing?.name, otherTenants, tenantQuery, viewings]);
  const [reviewing, setReviewing] = useState(false);
  const [draftRent, setDraftRent] = useState("");
  const [draftTenants, setDraftTenants] = useState<TenantIn[]>([]);
  /* Anybody on the offer who is NOT in the list below - picked from an
     enquiry, say. They get a chip so the sheet still shows who it is for;
     everyone else is already visible, ticked, in the list itself. */
  const offSheet = useMemo(
    () =>
      draftTenants.filter(
        (t) => !candidates.some((c) => c.id === t.fromId || c.name.trim().toLowerCase() === t.name.trim().toLowerCase())
      ),
    [draftTenants, candidates]
  );

  /* The portal write-up, and the only thing on this screen that writes to REX.
     `saved` holds what REX confirmed on the way back, so the panel shows the
     stored value rather than what was typed — the book's cache can be up to
     two minutes behind a save. */
  const [editingCopy, setEditingCopy] = useState(false);
  const [copyHeading, setCopyHeading] = useState("");
  const [copyBody, setCopyBody] = useState("");
  const [savingCopy, setSavingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ heading: string | null; body: string | null } | null>(null);

  const shownHeading = saved ? saved.heading : (listing?.advertHeading ?? null);
  const shownBody = saved ? saved.body : (listing?.advertBody ?? null);

  // A different listing is a different write-up: never carry one over.
  useEffect(() => {
    setEditingCopy(false);
    setSaved(null);
    setCopyError(null);
  }, [listing?.id]);

  /* Tell Steve what they're looking at, so "how many bedrooms is this one"
     resolves without him asking which one. Cleared on unmount as well as on
     close — a drawer left open when they navigate away would otherwise keep
     answering for a property that is no longer on screen. */
  useEffect(() => {
    setOpenListing(listing?.id ?? null);
    return () => setOpenListing(null);
  }, [listing?.id]);

  /* The advert links, per listing. Cleared FIRST so stepping to the next
     property can never show the last one's Rightmove link for the moment
     before the new answer lands, and guarded by `off` because the drawer's
     arrows can step faster than REX replies. */
  useEffect(() => {
    setPortals([]);
    const id = listing?.id;
    if (!id) return;
    let off = false;
    setPortalsLoading(true);
    fetch(`/api/listings/portals?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!off && j?.ok) setPortals(Array.isArray(j.portals) ? j.portals : []);
      })
      /* A link we can't fetch is a missing button, not an error worth showing:
         the two buttons beside it still work. */
      .catch(() => {})
      .finally(() => {
        if (!off) setPortalsLoading(false);
      });
    return () => {
      off = true;
    };
  }, [listing?.id]);

  async function saveCopy() {
    if (!listing) return;
    setSavingCopy(true);
    setCopyError(null);
    try {
      const res = await fetch("/api/listings/write-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: listing.id, heading: copyHeading, body: copyBody }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "REX refused the save.");
      setSaved({ heading: j.heading ?? null, body: j.body ?? null });
      setEditingCopy(false);
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingCopy(false);
    }
  }

  useEffect(() => {
    if (!listing) return;
    setTab("home");
    setType(""); setBeds(0); setBaths(0); setReceptions(0); setFurnished("");
    setBooked([]);
    setStep(listingStartingStep(listing));
    setHandingOver(false);
    setOffers([]); setTopPick(null); setOffering(false); setReviewing(false);
  }, [listing]);

  useEffect(() => {
    if (!listing) { setShown(false); return; }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [listing]);

  useEffect(() => {
    if (!listing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listing, onClose, onStep]);

  if (!listing) return null;

  /* Every photo when REX gave us them, the single primary when it didn't, and
     an empty set for the drafts — more than half the book has no photo at all,
     so an empty gallery is the normal case, not the broken one. */
  const photos: string[] = [
    ...(listing.images?.length ? listing.images : listing.image ? [listing.image] : []),
    ...uploaded.map((u) => u.url),
  ];

  /**
   * THE LEGAL MINIMUM before "Push to the portals" lights up (James, 11 Sep
   * 2026): photographs, a description, the EPC, the gas safety and the
   * electrical certificate. A standard re-let; an HMO's extra duties come
   * later. "No gas at the property" satisfies gas.
   */
  const certOk = (t: string) => certs != null && ["valid", "expiring", "not-required"].includes(certs[t] ?? "");
  const requirements: { id: string; label: string; done: boolean; fix: () => void }[] = [
    { id: "photos", label: "Photographs on", done: photos.length > 0, fix: () => setDrop("photos") },
    { id: "description", label: "Description written", done: Boolean(shownBody), fix: () => setTab("marketing") },
    { id: "epc", label: "EPC filed", done: certOk("epc"), fix: () => setDrop("epc") },
    { id: "gas", label: "Gas safety on file", done: certOk("gas_safety"), fix: () => setTab("compliance") },
    { id: "eicr", label: "Electrical certificate (EICR) on file", done: certOk("eicr"), fix: () => setTab("compliance") },
  ];
  const readyToGoLive = certs != null && requirements.every((r) => r.done);
  const isLive = listing.publicationStatus === "published";

  /* The upcoming viewings, for an access request to hang off. */
  const upcomingOptions = (viewings?.upcoming ?? [])
    .filter((v) => !v.cancelled)
    .map((v) => ({ id: v.id, startsAt: v.startsAt, who: v.contacts.map((c) => c.name).join(", ") || v.title }));

  /** The advert, drafted by Claude from the record and the photographs. */
  async function writeForMe() {
    if (!listing) return;
    setWriting(true);
    setCopyError(null);
    try {
      const r = await fetch("/api/listings/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: listing.name,
          locality: listing.locality,
          rent: listing.rent,
          availableFrom: listing.availableFrom,
          type, beds, baths, receptions, furnished,
          photos: photos.slice(0, 4),
          current: shownBody,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; heading?: string; body?: string; error?: string };
      if (!j.ok) throw new Error(j.error ?? "The writer did not answer.");
      setCopyHeading(j.heading ?? "");
      setCopyBody(j.body ?? "");
      setEditingCopy(true);
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : "The writer did not answer.");
    } finally {
      setWriting(false);
    }
  }
  const here = LISTING_TRACK[Math.min(step, LISTING_TRACK.length - 1)];
  const advance = () => setStep((s) => Math.min(s + 1, LISTING_TRACK.length - 1));

  // What's already happened here, from the shared diary — same entries the
  // calendar shows, filtered to this property.

  /* One diary entry, opening out to its details on a click. */
  const viewingRow = (v: LiveViewing) => {
    const start = new Date(v.startsAt);
    const end = v.endsAt ? new Date(v.endsAt) : null;
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const who = v.contacts.map((c) => c.name).join(", ");
    const open = openViewing === v.id;
    const past = start.getTime() < Date.now();
    return (
      <li key={v.id} className="border-b border-line/40 last:border-0">
        <button type="button" onClick={() => setOpenViewing(open ? null : v.id)} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-page">
          <span className="w-28 shrink-0 text-[11px] text-muted">
            {start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: past ? undefined : undefined })} · {hhmm(start)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px]">{who || v.title || "Viewing"}</span>
          <Tag tone={v.cancelled ? "neutral" : past ? (v.feedbackId ? "good" : "accent") : "good"}>
            {v.cancelled ? "Cancelled" : past ? (v.feedbackId ? "Feedback in" : "Viewed") : v.status ?? "Booked"}
          </Tag>
        </button>
        {open && (
          <div className="mb-3 rounded-xl border border-line/50 bg-page px-4 py-3 text-[12px]">
            <p className="text-[13px]">
              {v.mins} minute {v.kind === "viewing" ? "viewing" : v.kind}, {start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, {hhmm(start)}{end ? ` to ${hhmm(end)}` : ""}
            </p>
            <p className="mt-1 text-muted">
              {v.type ?? v.title}{v.agent ? ` · taken by ${v.agent}` : ""}{v.status ? ` · ${v.status}` : ""}
            </p>
            {v.contacts.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {v.contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{c.name}</span>
                    {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="text-muted hover:text-ink">{c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} className="text-muted hover:text-ink">{c.email}</a>}
                    {c.leadId && <a href={`/leads?open=${encodeURIComponent(c.leadId)}`} className="rounded-full border border-line/80 px-2.5 py-0.5 text-[11px] hover:border-ink/40">Open the lead</a>}
                    <button
                      type="button"
                      onClick={() => applyFor({ id: c.id, name: c.name, phone: c.phone })}
                      className="rounded-full border border-accent-dark/50 px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark hover:border-accent-dark"
                    >
                      Make an application
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {v.description && <p className="mt-2 whitespace-pre-line text-muted">{v.description}</p>}
            {/* Access to the property for THIS viewing, where it goes through
                a person. Asked by email from the record; granted by hand when
                they ring, text or reply. */}
            {access.kind && access.kind !== "vacant" && !past && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/50 pt-2.5">
                {(() => {
                  const r = (access.requests ?? {})[v.id];
                  const who = access.kind === "tenant" ? "tenant" : "landlord";
                  return (
                    <>
                      <Tag tone={r?.grantedAt ? "good" : r ? "accent" : "neutral"}>
                        {r?.grantedAt ? `Access granted ${new Date(r.grantedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : r ? `Access requested ${new Date(r.requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Access not asked for yet"}
                      </Tag>
                      {!r?.grantedAt && (
                        <button
                          type="button"
                          onClick={() => setAccess({ ...access, requests: { ...(access.requests ?? {}), [v.id]: { viewingId: v.id, when: v.startsAt, to: r?.to ?? access.email, requestedAt: r?.requestedAt ?? new Date().toISOString(), grantedAt: new Date().toISOString() } } })}
                          className="rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40"
                        >
                          The {who} has granted access
                        </button>
                      )}
                      {!r && (
                        <button
                          type="button"
                          onClick={() => setAccess({ ...access, requests: { ...(access.requests ?? {}), [v.id]: { viewingId: v.id, when: v.startsAt, to: access.email, requestedAt: new Date().toISOString(), grantedAt: null } } })}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink"
                        >
                          Mark as requested
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  /**
   * Start an application from a named person.
   *
   * James, 10 Sep 2026: "we'll have an applications list separately, so we can
   * click on a tenant and make an application". The offer sheet already
   * insists an offer is attached to somebody we hold a record for - this just
   * arrives with that person already picked, from wherever their name was on
   * screen, rather than making the agent find them again in a list.
   */
  function applyFor(p: { id: string; name: string; phone?: string | null }) {
    setDraftTenants([{ name: p.name, number: "", mobile: p.phone ?? "", situation: "", fromId: p.id }]);
    setDraftRent(listing?.rent ? String(listing.rent) : "");
    setOffering(true);
  }

  /** The step decides what the button does, same as on a lead. */
  function fire() {
    if (here.action === "viewing") { if (LISTING_BOOKER_LIVE) setBooking(true); }
    else if (here.action === "review") offers.length && setReviewing(true);
    else if (here.action === "handoff") setHandingOver(true);
    else advance();
  }

  function saveOffer() {
    // An offer must be ATTACHED to a record we hold — fromId is what makes
    // it referenceable, chaseable and auditable later.
    const tenants = draftTenants.filter((t) => t.name.trim() && t.fromId);
    if (!draftRent.trim() || !tenants.length) return;
    setOffers((cur) => [...cur, { rent: draftRent.trim(), tenants }]);
    setOffering(false);
    setDraftRent("");
    setDraftTenants([]);
  }

  const status = listing.letAgreed
    ? { label: "Let agreed", tone: "neutral" as const }
    : listing.publicationStatus === "published"
      ? { label: "Available", tone: "good" as const }
      : { label: "Draft", tone: "accent" as const };

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-l-lg w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* The whole record scrolls, tabs included (James, 11 Sep): the row
            of buttons is only there at the top, not pinned over the page. The
            street at the foot is pinned instead, and the content keeps room
            above it so nothing is ever hidden behind the houses. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-[210px] pt-5">
        {/* Close, and the tabs. Previous / Next went (James, 11 Sep): nobody
            steps through the book from inside a record, they close and pick
            the next one. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={onClose}
            className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 bg-white text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
          <div className="ml-auto flex min-w-0 max-w-full gap-2 overflow-x-auto pb-0.5">
            {TABS.map((t) => {
              const count =
                t.key === "applications"
                  ? offers.length + (liveApps?.length ?? 0) + (enquiries?.length ?? 0)
                  : t.key === "viewings"
                    ? booked.length + (viewings?.upcoming.length ?? 0)
                    : 0;
              const on = tab === t.key;
              /* A pink dot where something needs doing on that tab, so nobody
                 has to guess which one to open (James, 11 Sep). */
              const needs =
                t.key === "applications"
                  ? (enquiries?.length ?? 0) > 0 || (liveApps ?? []).some((a) => !/accept|unsuccess|withdraw|declin/i.test(a.statusLabel))
                  : t.key === "viewings"
                    ? (viewings?.upcoming ?? []).some((v) => !v.cancelled && access.kind && access.kind !== "vacant" && !(access.requests ?? {})[v.id]?.grantedAt) ||
                      (viewings?.past ?? []).some((v) => !v.cancelled && !v.feedbackId)
                    : t.key === "marketing"
                      ? photos.length === 0 || !shownBody
                      : t.key === "compliance"
                        ? certs != null && !(certOk("epc") && certOk("gas_safety") && certOk("eicr"))
                        : t.key === "documents"
                          ? (terms.status === "ready" && !terms.signed) || !access.kind
                          : false;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                    on ? "bg-[var(--brown)] text-white" : "border border-line/60 bg-white text-muted hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  <DoodleIcon name={t.icon} size={13} className={on ? "text-white" : "text-accent-dark"} />
                  {t.label}
                  {count > 0 && (
                    <span className={`figures rounded-full px-1.5 text-[10.5px] ${on ? "bg-white/20 text-white" : "bg-page text-muted"}`}>{count}</span>
                  )}
                  {needs && !on && (
                    <span aria-label="Needs attention" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>


          {tab === "home" && (
          <div key="record" className="fade-up">
          {/* ── THE HERO (James, 11 Sep 2026): the appraisal file's hero,
              in sage this time so the two alternate. The photograph small,
              top left, the quick actions under it; the address in the
              middle; the property's details in a white box on the right. ── */}
          <div className="relative overflow-hidden rounded-[22px] border border-line/50" style={{ background: SAGE_WASH }}>
            {/* One soft white ellipse low on the right - a shape, not a set of circles. */}
            <span aria-hidden className="pointer-events-none absolute -bottom-[220px] right-[120px] h-[360px] w-[620px] rounded-[50%] bg-white/50" />
            <div className="relative p-5">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
              {/* The photograph: from the address line down to the foot of the
                  card, the exact height of what is beside it, cropped to fit. */}
              <div className="flex min-w-0 flex-col">
                <button
                  type="button"
                  onClick={() => photos.length && setLightbox(0)}
                  className={`group relative block h-[220px] w-full flex-1 overflow-hidden rounded-2xl border border-white/70 bg-white md:h-auto md:min-h-[240px] ${photos.length ? "cursor-zoom-in" : "cursor-default"}`}
                  aria-label={photos.length ? "Open the photos" : "No photographs yet"}
                >
                  <PropertyPhoto src={photos[0] ?? null} className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" />
                  {photos.length > 1 && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[10.5px] font-semibold text-white">{photos.length} photos</span>
                  )}
                </button>
                <div className="hidden">
                  {(portalsLoading || portals.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {portalsLoading && portals.length === 0 ? (
                        <span className="rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11px] text-muted">Checking the portals…</span>
                      ) : (
                        portals.map((p) => (
                          <a
                            key={p.portal}
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open this property on ${p.portal}`}
                            className="press-ring rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40"
                          >
                            {p.portal}
                          </a>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* The listing itself. */}
              <div className="min-w-0 md:pr-2">
                <h2 className="hand text-[28px] leading-[1.1]">{listing.name}</h2>
                <p className="mt-1.5 text-[13px] text-muted">{listing.locality}</p>
                <p className="mt-3 flex items-baseline gap-1.5">
                  <span className="figures text-[28px] leading-none">
                    {listing.rent == null ? "—" : `£${listing.rent.toLocaleString("en-GB")}`}
                  </span>
                  <span className="text-[12px] text-muted">{listing.rent == null ? "rent not set" : "pcm"}</span>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Tag tone={status.tone}>{status.label}</Tag>
                  {listing.tenant && <Tag tone="neutral">Tenanted</Tag>}
                  {/* Terms, as one word rather than a panel. The copy lives in Documents. */}
                  {terms.status === "ready" && (
                    <button
                      type="button"
                      onClick={() => setTab("documents")}
                      title="Open Documents"
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        terms.signed ? "bg-white text-[#56634a]" : "border border-accent-dark/50 bg-white text-accent-dark hover:border-accent-dark"
                      }`}
                    >
                      <DoodleIcon name="file-contract" size={11} />
                      {terms.signed ? "Terms signed" : "No terms on file"}
                    </button>
                  )}
                  {listing.publishedAt && (
                    <span className="text-[11.5px] text-muted">
                      Live since {new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  {/* The portals this property is actually feeding, from REX. */}
                  {portalsLoading && portals.length === 0 ? (
                    <span className="rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11px] text-muted">Checking the portals…</span>
                  ) : (
                    portals.map((p) => (
                      <a
                        key={p.portal}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open this property on ${p.portal}`}
                        className="press-ring rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40"
                      >
                        {p.portal}
                      </a>
                    ))
                  )}
                </div>

                {/* Two buttons, side by side, both in the dark chocolate (James,
                    11 Sep): getting INTO the property, and getting it OUT to
                    the database. They used to be one ambiguous "Email to
                    tenants". */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <AccessRequest
                    value={access}
                    onChange={setAccess}
                    loading={accessStatus === "loading"}
                    address={listing.name}
                    agent={me}
                    tenant={listing.tenant ?? null}
                    landlord={landlord.status === "known" ? landlord.landlord : null}
                    viewings={upcomingOptions}
                    onBook={LISTING_BOOKER_LIVE ? () => setBooking(true) : undefined}
                  />
                  <PressButton
                    onClick={() => setEmailing(true)}
                    className="press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white"
                  >
                    <DoodleIcon name="megaphone" size={14} />
                    Mail the database
                  </PressButton>
                  {LISTING_BOOKER_LIVE && (
                    <PressButton
                      onClick={() => setBooking(true)}
                      className="press-ring flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold"
                    >
                      <DoodleIcon name="calendar" size={14} />
                      Arrange viewing
                    </PressButton>
                  )}
                </div>
              </div>

              {/* Property details: the facts, small, in a white box. The
                  ones an agent sets (type, beds, baths, furnishing) come
                  from the Marketing tab and show here the moment they do. */}
              <aside className="rounded-2xl border border-line/40 bg-white p-4 md:col-span-2 xl:col-span-1">
                <p className="hand flex items-center gap-2 text-[14px]">
                  <DoodleIcon name="home" size={14} className="text-accent-dark" />
                  Property details
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] md:grid-cols-4 xl:grid-cols-2">
                  {[
                    ["Type", type || "Not set"],
                    ["Bedrooms", beds ? String(beds) : "Not set"],
                    ["Bathrooms", baths ? String(baths) : "Not set"],
                    ["Furnishing", furnished || "Not set"],
                    ["Available from", listing.availableFrom ? new Date(`${listing.availableFrom}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Now"],
                    ["EPC expires", listing.epcExpiry ? new Date(`${listing.epcExpiry}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded"],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10.5px] text-muted">{k}</dt>
                      <dd className={`truncate font-semibold ${v === "Not set" || v === "Not recorded" ? "font-normal text-muted" : ""}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <button type="button" onClick={() => setTab("marketing")} className="mt-3 text-[11.5px] font-semibold text-accent-dark hover:underline">
                  Edit in Marketing →
                </button>
              </aside>
            </div>
            </div>
          </div>

          {/* ── THREE CARDS: the landlord, at a glance, and next up. ── */}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {/* The landlord, because the first question on any property is
                "whose is it and can I ring them". The REAL landlord, off the
                listing's owner relationship in REX. */}
            <section className="flex flex-col rounded-[22px] border border-line/50 bg-white p-5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">The landlord</p>
              {landlord.status === "loading" && (
                <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
                  <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                  Looking them up…
                </p>
              )}
              {landlord.status === "known" && (
                <>
                  <p className="hand mt-2 text-[22px] leading-tight">{landlord.landlord.name}</p>
                  <div className="mt-3 space-y-1.5 border-t border-line/50 pt-3 text-[13px]">
                    {landlord.landlord.phone ? (
                      <a href={`tel:${landlord.landlord.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2.5 hover:underline"><DoodleIcon name="call" size={13} className="text-accent-dark" />{landlord.landlord.phone}</a>
                    ) : (
                      <p className="flex items-center gap-2.5 text-muted"><DoodleIcon name="call" size={13} />No number on file</p>
                    )}
                    {landlord.landlord.email ? (
                      <a href={`mailto:${landlord.landlord.email}`} className="flex min-w-0 items-center gap-2.5 hover:underline"><DoodleIcon name="mail" size={13} className="shrink-0 text-accent-dark" /><span className="truncate">{landlord.landlord.email}</span></a>
                    ) : (
                      <p className="flex items-center gap-2.5 text-muted"><DoodleIcon name="mail" size={13} />No email on file</p>
                    )}
                  </div>
                </>
              )}
              {landlord.status === "none" && (
                <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                  No landlord is held against this property in REX, so there is nobody to ring or email from here. Adding them to the listing in REX brings them through.
                </p>
              )}
              {landlord.status === "problem" && (
                <p className="mt-4 text-[12px] leading-relaxed text-accent-dark">{landlord.says}</p>
              )}
              {listing.tenant && (
                <div className="mt-auto border-t border-line/50 pt-3.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Current tenant</p>
                  <p className="mt-1.5 text-[13px] font-semibold">{listing.tenant.name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
                    <span>{listing.tenant.phone}</span>
                    <span className="truncate">{listing.tenant.email}</span>
                  </p>
                </div>
              )}
            </section>

            {/* At a glance: what is happening on the listing - the numbers
                the tabs hold, so the record answers before anyone clicks. */}
            <section className="rounded-[22px] border border-line/50 bg-white p-5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">At a glance</p>
              <ul className="mt-3 space-y-3">
                {[
                  { icon: "target", title: enquiries === null ? "Reading the enquiries…" : `${enquiries.length} enquir${enquiries.length === 1 ? "y" : "ies"}`, sub: "From the portals, on this listing", to: "applications" as TabKey },
                  { icon: "calendar", title: viewings === null ? "Reading the diary…" : `${viewings.upcoming.length + booked.length} booked · ${viewings.past.length} done`, sub: "Viewings", to: "viewings" as TabKey },
                  { icon: "coin", title: liveApps === null ? "Reading the applications…" : `${(liveApps?.length ?? 0) + offers.length} application${(liveApps?.length ?? 0) + offers.length === 1 ? "" : "s"}`, sub: liveApps?.some((a) => /accept/i.test(a.statusLabel)) ? "One accepted" : "None accepted yet", to: "applications" as TabKey },
                  { icon: "folder", title: `${listing.imageCount} photo${listing.imageCount === 1 ? "" : "s"} on file`, sub: listing.daysOnMarket != null ? `${listing.daysOnMarket} days on the market` : "Not published yet", to: "marketing" as TabKey },
                ].map((g) => (
                  <li key={g.sub + g.title}>
                    <button type="button" onClick={() => setTab(g.to)} className="flex w-full items-start gap-3 text-left">
                      <DoodleIcon name={g.icon} size={15} className="mt-0.5 shrink-0 text-accent-dark" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-snug">{g.title}</span>
                        <span className="block text-[11.5px] text-muted">{g.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Next up: what the process says to do, and what the record says
                is missing. Blush here, because the hero is sage. */}
            <section className="relative flex flex-col overflow-hidden rounded-[22px] bg-accent-soft/70 p-5">
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-6 -right-8 h-[200px] w-[260px] rotate-[-8deg] rounded-[30px]"
                style={{
                  backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent-dark) 22%, transparent) 0 1px, transparent 1px 10px)",
                  maskImage: "radial-gradient(closest-side at 80% 90%, black 10%, transparent 100%)",
                  WebkitMaskImage: "radial-gradient(closest-side at 80% 90%, black 10%, transparent 100%)",
                }}
              />
              <div className="relative">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark">Next up</p>
                <h3 className="hand mt-1.5 text-[18px] leading-tight">{here.title}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{here.detail}</p>
              </div>
              {/* Before it goes live: the legal minimum, each one a click to
                  fix. Nothing else on the card until they are all in. */}
              {here.id === "live" && !isLive && (
                <ul className="relative mt-3.5 space-y-1.5">
                  {requirements.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-[12px]">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${r.done ? "text-white" : "border border-accent/60 bg-white text-transparent"}`}
                        style={r.done ? { background: SAGE_INK } : undefined}
                      >
                        ✓
                      </span>
                      {r.done ? (
                        <span>{r.label}</span>
                      ) : (
                        <button type="button" onClick={r.fix} className="text-left font-semibold hover:underline">{r.label.replace(/ on file$| on$| filed$| written$/, "")} · add it</button>
                      )}
                    </li>
                  ))}
                  {certs === null && <li className="text-[11px] text-muted">Reading the certificates…</li>}
                </ul>
              )}
              <div className="relative mt-auto flex flex-wrap items-center gap-2.5 pt-4">
                {here.id === "live" ? (
                  isLive ? (
                    <p className="text-[12px] leading-relaxed" style={{ color: SAGE_INK }}>
                      On the portals{listing.publishedAt ? ` since ${new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.
                    </p>
                  ) : (
                    <>
                      {/* Full colour, never greyed. Hover it and it says what
                          is still missing (James, 11 Sep). */}
                      <span className="group relative">
                        <PressButton
                          onClick={() => readyToGoLive && advance()}
                          className={`press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white ${readyToGoLive ? "" : "cursor-not-allowed"}`}
                        >
                          <DoodleIcon name="megaphone" size={14} />
                          Push to the portals
                        </PressButton>
                        {!readyToGoLive && (
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl bg-ink px-3.5 py-2.5 text-[11.5px] leading-snug text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
                          >
                            Can&apos;t push it live until{" "}
                            {(() => {
                              const words: Record<string, string> = { photos: "the photographs are on", description: "the description is written", epc: "the EPC is filed", gas: "the gas safety is on file", eicr: "the EICR is on file" };
                              const m = requirements.filter((r) => !r.done).map((r) => words[r.id] ?? r.label);
                              return m.length > 1 ? `${m.slice(0, -1).join(", ")} and ${m[m.length - 1]}` : m[0] ?? "the certificates are read";
                            })()}.
                            <span aria-hidden className="absolute left-5 top-full h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-ink" />
                          </span>
                        )}
                      </span>
                      {readyToGoLive && (
                        <span className="text-[11px] leading-snug text-muted">Moves the record on. The push into REX waits on the REX write allowlist.</span>
                      )}
                    </>
                  )
                ) : here.action === "viewing" && !LISTING_BOOKER_LIVE ? (
                  <p className="text-[11.5px] leading-snug text-muted">Book viewings from the applicant&apos;s lead, or in REX, for now.</p>
                ) : (
                  <PressButton
                    onClick={fire}
                    className={`press-ring flex items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-semibold ${
                      here.action === "review" && !offers.length ? "cursor-not-allowed bg-ink/30 text-white/60" : "bg-accent-dark text-white"
                    }`}
                  >
                    <DoodleIcon name={here.icon} size={14} />
                    {here.cta}
                  </PressButton>
                )}
                {here.id === "viewings" && (
                  <PressButton
                    onClick={() => setOffering(true)}
                    className="press-ring flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold"
                  >
                    <DoodleIcon name="coin" size={14} />
                    Make an offer
                  </PressButton>
                )}
              </div>
              {here.id === "viewings" && (
                <button
                  type="button"
                  onClick={() => offers.length && advance()}
                  className={`relative mt-2.5 text-left text-[11px] font-semibold transition-colors ${offers.length ? "text-muted hover:text-ink" : "cursor-not-allowed text-muted/50"}`}
                  title={offers.length ? undefined : "No offers yet — nothing for the landlord to review"}
                >
                  Viewings have stopped → landlord review
                </button>
              )}
              {here.action === "review" && !offers.length && (
                <p className="relative mt-2 text-[10.5px] text-muted">No applications logged yet.</p>
              )}
            </section>
          </div>

          {/* ── WHERE IT'S UP TO: the appraisal file's spine, with the small
              ticks under each step - what the record can say has happened. ── */}
          <section className="mt-5 rounded-[22px] border border-line/50 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="hand text-[17px]">Where it&apos;s up to</h3>
                <p className="mt-0.5 text-[12px] text-muted">Track progress through the {LISTING_TRACK.length} steps of a listing. Click a step to move the record.</p>
              </div>
              <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                Step {Math.min(step, LISTING_TRACK.length - 1) + 1} of {LISTING_TRACK.length}
              </span>
            </div>
            {(() => {
              const at = Math.min(step, LISTING_TRACK.length - 1);
              const n = (viewings?.upcoming.length ?? 0) + (viewings?.past.length ?? 0) + booked.length;
              const apps = (liveApps?.length ?? 0) + offers.length;
              const accepted = liveApps?.some((a) => /accept/i.test(a.statusLabel)) || (here.id === "accepted" || here.id === "handover");
              const ticks: Record<string, { label: string; done: boolean; detail?: string }[]> = {
                live: [
                  ...requirements.map((r) => ({ label: r.label, done: r.done, detail: r.id === "photos" && photos.length ? String(photos.length) : undefined })),
                  { label: "Published to the portals", done: isLive, detail: listing.publishedAt ? new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : undefined },
                ],
                viewings: [
                  { label: "Enquiries in", done: (enquiries?.length ?? 0) > 0, detail: enquiries?.length ? String(enquiries.length) : undefined },
                  { label: "Viewings booked", done: n > 0, detail: n ? String(n) : undefined },
                  { label: "Offers logged", done: apps > 0, detail: apps ? String(apps) : undefined },
                ],
                offers: [{ label: "Sent to the landlord", done: at > 2 }],
                accepted: [{ label: "Offer accepted", done: Boolean(accepted) }],
                handover: [{ label: "Handed over to Kirstie", done: at > 4 }],
              };
              return (
                <div className="-mx-2 mt-5 overflow-x-auto px-2 pb-1">
                  <ol className="grid min-w-[640px]" style={{ gridTemplateColumns: `repeat(${LISTING_TRACK.length}, minmax(0, 1fr))` }}>
                    {LISTING_TRACK.map((st, i) => {
                      const done = i < at;
                      const cur = i === at;
                      return (
                        <li key={st.id} className="relative flex flex-col items-center px-1 text-center">
                          {i > 0 && (
                            <span
                              aria-hidden
                              className={`absolute left-[-50%] right-[50%] top-[13px] ${i <= at ? "h-0.5" : "h-0 border-t-2 border-dashed border-line/80"}`}
                              style={i <= at ? { background: SAGE_INK } : undefined}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setStep(i)}
                            title={`Move the record to ${st.label}`}
                            className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold transition-transform hover:scale-110 ${
                              done ? "text-white" : cur ? "bg-accent-dark text-white" : "border-[1.5px] border-line/80 bg-white text-muted"
                            }`}
                            style={done ? { background: SAGE_INK } : undefined}
                          >
                            {done ? "✓" : i + 1}
                          </button>
                          <p className={`mt-2.5 text-[12px] leading-tight ${cur ? "font-semibold" : "text-muted"}`}>{st.label}</p>
                        </li>
                      );
                    })}
                  </ol>
                  <ol className="mt-4 grid min-w-[640px] gap-2" style={{ gridTemplateColumns: `repeat(${LISTING_TRACK.length}, minmax(0, 1fr))` }}>
                    {LISTING_TRACK.map((st, i) => {
                      const done = i < at;
                      const cur = i === at;
                      const list = ticks[st.id] ?? [];
                      return (
                        <li
                          key={st.id}
                          className={`rounded-2xl border p-3 ${cur ? "border-accent/60 bg-accent-soft/40" : "border-line/50"}`}
                          style={done ? { background: SAGE_WASH, borderColor: "transparent" } : undefined}
                        >
                          <p className={`text-[11.5px] ${cur ? "font-semibold" : "text-muted"}`}>{st.label}</p>
                          {cur && <p className="mt-1 text-[10.5px] leading-snug text-muted">{st.title}</p>}
                          {list.length > 0 && (
                            <ul className="mt-2.5 space-y-1.5">
                              {list.map((t) => (
                                <li key={t.label} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                                  <span
                                    className={`mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] ${t.done ? "text-white" : "border border-line/80 bg-white text-transparent"}`}
                                    style={t.done ? { background: done ? SAGE_INK : "var(--accent-dark)" } : undefined}
                                  >
                                    ✓
                                  </span>
                                  <span className={t.done ? "text-ink" : "text-muted"}>
                                    {t.label}
                                    {t.detail && <span className="text-muted"> · {t.detail}</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })()}
          </section>

          {/* ── From "offer accepted" onward, the landlord, the property and
              the tenant are one thing. The panel is the record of that, and
              the only place it can be undone. ── */}
          {(here.id === "accepted" || here.id === "handover") && link && (
            <div className="mt-3">
              <TenancyLinkPanel value={link} onChange={setLinkState} />
              {saveLabel(linkSave) && (
                <p className="mt-1.5 pl-1 text-[10.5px] text-muted">{saveLabel(linkSave)}</p>
              )}
            </div>
          )}
          </div>
          )}

          <div key={`view-${tab}`} className={tab === "home" ? "" : "fade-up"}>
            {tab === "applications" && enquiries !== null && (
              /* ── The enquiries REX holds against this listing, as REX's own
                    Leads tab shows them. Each opens on the Leads board. ── */
              <div className="mb-4">
              <Card title={`Enquiries · ${enquiries.length}`} icon="target">
                {enquiries.length ? (
                  <ul className="divide-y divide-line/40">
                    {enquiries.slice(0, 12).map((e) => (
                      <li key={e.id} className="flex items-center gap-2">
                        <a href={`/leads?open=${encodeURIComponent(e.id)}`} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5 transition-colors hover:bg-page sm:grid-cols-[minmax(0,1.2fr)_110px_minmax(0,1fr)_90px]">
                          <span className="min-w-0">
                            <span className="hand block truncate text-[13px]">{e.name}</span>
                            <span className="block truncate text-[10.5px] text-muted">{[e.phone, e.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                          </span>
                          <span className="hidden sm:block"><Tag tone="neutral">{e.source}</Tag></span>
                          <span className="hidden min-w-0 truncate text-[11px] text-muted sm:block">{e.message || "—"}</span>
                          <span className="text-right text-[11px] text-muted">{e.received}</span>
                        </a>
                        {/* An enquirer is a tenant we hold a file on, so an
                            application can start right here. */}
                        <button
                          type="button"
                          onClick={() => applyFor({ id: e.id, name: e.name, phone: e.phone })}
                          className="shrink-0 rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold text-muted transition-colors hover:border-accent-dark hover:text-accent-dark"
                        >
                          Apply
                        </button>
                      </li>
                    ))}
                    {enquiries.length > 12 && (
                      <li className="pt-2 text-[11px] text-muted">{enquiries.length - 12} more on the Leads board.</li>
                    )}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-[12px] text-muted">No enquiries on this listing yet.</p>
                )}
              </Card>
              </div>
            )}
            {tab === "applications" && (
              <div className="grid gap-4">
                {/* The applications on this listing, on their own tab. */}
                <Card
                  title="Applications"
                  icon="coin"
                  action={
                    <PressButton
                      onClick={() => setOffering(true)}
                      className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-page"
                    >
                      <DoodleIcon name="coin" size={13} />
                      Make an offer
                    </PressButton>
                  }
                >
                  {/* What REX holds first: the real applications on this listing. */}
                  {liveApps && liveApps.length > 0 && (
                    <ul className="mb-3 divide-y divide-line/40">
                      {liveApps.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 py-2">
                          <span className="hand min-w-0 flex-1 truncate text-[13px]">{a.applicants || "Applicant not named"}</span>
                          <Tag tone={/accept/i.test(a.statusLabel) ? "good" : /unsuccess|withdraw|declin/i.test(a.statusLabel) ? "neutral" : "accent"}>{a.statusLabel}</Tag>
                          {a.offerAmount != null && <span className="figures text-[13px]">£{a.offerAmount.toLocaleString("en-GB")}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {offers.length ? (
                    <ul className="space-y-3">
                      {offers.map((o, i) => (
                        <li key={i} className="rounded-2xl border border-line/50 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="hand text-[13.5px]">
                              {o.tenants.map((t) => t.name).join(" & ")}
                            </span>
                            <span className="figures text-[14px] text-accent-dark">
                              £{o.rent}<span className="text-[10px] text-muted"> pcm</span>
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                            {o.tenants.map((t) => t.situation).filter(Boolean).join(" · ") ||
                              "No situation notes yet."}
                          </p>
                          {/* The agent's pick — what the landlord's page stars. */}
                          <button
                            type="button"
                            onClick={() => setTopPick(topPick === i ? null : i)}
                            className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
                              topPick === i ? "text-accent-dark" : "text-muted hover:text-ink"
                            }`}
                          >
                            <DoodleIcon name="star" size={12} />
                            {topPick === i ? "Our top pick" : "Mark as our pick"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-6 text-center text-[12px] leading-relaxed text-muted">
                      No offers yet. They land here as viewings happen —<br />
                      the record doesn&apos;t move on until the viewings stop.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {tab === "viewings" && (
              <div className="grid gap-4">
                <div className="space-y-4">
                  <Card
                    title="Upcoming viewings"
                    icon="calendar"
                    action={
                      LISTING_BOOKER_LIVE ? (
                        <PressButton
                          onClick={() => setBooking(true)}
                          className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-3.5 py-2 text-[11.5px] font-semibold"
                        >
                          <DoodleIcon name="calendar" size={13} />
                          Book viewing
                        </PressButton>
                      ) : undefined
                    }
                  >
                    {(viewings?.upcoming.length ?? 0) + booked.length > 0 ? (
                      <ul>
                        {(viewings?.upcoming ?? []).map(viewingRow)}
                        {booked.map((v, i) => (
                          <li key={`b${i}`} className="flex items-center gap-3 border-b border-line/40 py-2.5 last:border-0">
                            <span className="figures w-28 shrink-0 text-[12px] text-accent-dark">{v.when}</span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px]">{v.who}</span>
                            <Tag tone="neutral">Booked here</Tag>
                          </li>
                        ))}
                      </ul>
                    ) : viewings === null ? (
                      <p className="py-4 text-center text-[12px] text-muted">Reading the diary…</p>
                    ) : (
                      <p className="py-4 text-center text-[12px] text-muted">Nothing in the diary yet.</p>
                    )}
                  </Card>

                  <Card title={viewings?.past.length ? `Past viewings · ${viewings.past.length}` : "Past viewings"} icon="clock">
                    {viewings?.past.length ? (
                      <ul>{viewings.past.slice(0, 20).map(viewingRow)}{viewings.past.length > 20 && <li className="pt-2 text-[11px] text-muted">{viewings.past.length - 20} earlier, kept on file.</li>}</ul>
                    ) : viewings === null ? (
                      <p className="py-4 text-center text-[12px] text-muted">Reading the diary…</p>
                    ) : (
                      <p className="py-4 text-center text-[12px] text-muted">
                        Nobody&apos;s been through the door yet.
                      </p>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {tab === "marketing" && (
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  {/* The property's facts, in the OS's own pickers rather than
                      the browser's. Everything here shows in the property
                      details the moment it is set. */}
                  <section className="rounded-[22px] border border-line/50 bg-white p-5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">The property</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <PickOne
                        label="Property type"
                        icon="home"
                        options={TYPES.map((t) => ({ id: t, label: t }))}
                        value={type || null}
                        onChange={(v) => setType(v ?? "")}
                      />
                      <PickOne
                        label="Furnishing"
                        icon="sofa.png"
                        options={["Furnished", "Part furnished", "Unfurnished"].map((t) => ({ id: t, label: t }))}
                        value={furnished || null}
                        onChange={(v) => setFurnished(v ?? "")}
                      />
                    </div>
                    <div className="mt-3 divide-y divide-line/40">
                      <Stepper label="Bedrooms" value={beds} onChange={setBeds} />
                      <Stepper label="Bathrooms" value={baths} onChange={setBaths} />
                      <Stepper label="Receptions" value={receptions} onChange={setReceptions} />
                    </div>
                    <p className="mt-3 border-t border-line/50 pt-2.5 text-[10.5px] leading-relaxed text-muted">
                      Bedroom counts aren&apos;t in REX&apos;s listing projection; captured here, they can be written back.
                    </p>
                  </section>

                  {/* The listing itself, read from REX. */}
                  <section className="rounded-[22px] border border-line/50 bg-white p-5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">The listing</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
                      {[
                        ["Status", status.label],
                        ["Rent", listing.rent == null ? "Not set" : `£${listing.rent.toLocaleString("en-GB")} pcm`],
                        ["Available from", listing.availableFrom ? new Date(`${listing.availableFrom}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Now"],
                        ["Photos on file", String(photos.length)],
                        ["EPC expires", listing.epcExpiry ? new Date(`${listing.epcExpiry}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded"],
                        ["Days on market", listing.daysOnMarket != null ? String(listing.daysOnMarket) : "Not published"],
                        ["Live since", listing.publishedAt ? new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not yet"],
                        ["Updated in REX", listing.lastUpdated ? (Number.isFinite(new Date(listing.lastUpdated).getTime()) ? new Date(listing.lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : listing.lastUpdated) : "—"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[10.5px] text-muted">{k}</dt>
                          <dd className={`font-semibold ${v === "Not set" || v === "Not recorded" ? "font-normal text-accent-dark" : ""}`}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {photos.length === 0 && (
                      <p className="mt-4 rounded-xl bg-accent-soft/60 px-3 py-2 text-[11.5px] leading-relaxed text-accent-dark">
                        No photos. A listing without photos gets almost no portal traffic - the single highest-value thing to fix on this record.
                      </p>
                    )}
                    <p className="mt-3 border-t border-line/50 pt-2.5 text-[10.5px] leading-relaxed text-muted">
                      Read-only facts until the write path to REX is wired.
                    </p>
                  </section>
                </div>

                {/* The advert: REX's "internet" write-up, which IS the copy
                    Rightmove shows. Claude drafts it from the record and the
                    photographs; the agent edits; saving writes it to REX. */}
                <section className="rounded-[22px] border border-line/50 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">The advert</p>
                      <p className="mt-1 text-[11.5px] text-muted">
                        {shownBody ? `${shownBody.length.toLocaleString("en-GB")} characters · goes to Rightmove and Zoopla` : "Nothing written yet - it cannot go to the portals without one"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void writeForMe()}
                        disabled={writing}
                        className="flex items-center gap-2 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        <DoodleIcon name="magic-wand" size={14} />
                        {writing ? "Writing it…" : shownBody ? "Rewrite it for me" : "Write it for me"}
                      </button>
                      {!editingCopy && (
                        <button
                          type="button"
                          onClick={() => {
                            setCopyHeading(shownHeading ?? "");
                            setCopyBody(shownBody ?? "");
                            setEditingCopy(true);
                          }}
                          className="rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
                        >
                          {shownBody ? "Edit" : "Write one by hand"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    {editingCopy ? (
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          value={copyHeading}
                          onChange={(e) => setCopyHeading(e.target.value)}
                          placeholder="Headline - the line the portals show first"
                          className="w-full rounded-xl border border-line/70 px-3.5 py-2.5 text-[13.5px] font-semibold outline-none focus:border-ink"
                        />
                        <textarea
                          value={copyBody}
                          onChange={(e) => setCopyBody(e.target.value)}
                          rows={12}
                          placeholder="Where it is, what it's like, what's nearby…"
                          className="w-full resize-y rounded-xl border border-line/70 px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:border-ink"
                        />
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={saveCopy}
                            disabled={savingCopy}
                            className="rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-50"
                          >
                            {savingCopy ? "Saving to REX…" : "Save to REX"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingCopy(false); setCopyError(null); }}
                            className="rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold"
                          >
                            Cancel
                          </button>
                          <span className="text-[11px] text-muted">{copyBody.length.toLocaleString("en-GB")} characters</span>
                        </div>
                      </div>
                    ) : shownBody ? (
                      <div className="rounded-2xl bg-page p-5">
                        {shownHeading && <p className="hand mb-2 text-[17px] leading-snug">{shownHeading}</p>}
                        <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{shownBody}</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-line/70 bg-page px-6 py-10 text-center">
                        <p className="hand text-[18px]">No description on this listing</p>
                        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                          Every published rental in the book has one, and this is what stands between a draft and going live. Let Claude draft it from the record and the photographs, then make it yours.
                        </p>
                      </div>
                    )}
                    {copyError && (
                      <p className="mt-3 rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark">{copyError}</p>
                    )}
                    {saved && !editingCopy && (
                      <p className="mt-2.5 text-[11px] text-muted">Saved to REX - read back from the record, not from the box.</p>
                    )}
                  </div>

                  {/* Only where there IS an advert: a draft has no campaign. */}
                  {listing.publicationStatus === "published" && (
                    <div className="mt-5 border-t border-line/50 pt-5">
                      <PortalStatsPanel listingId={listing.id} embedded />
                    </div>
                  )}
                </section>

                {/* The photographs, all of them, across the bottom. Add more
                    through the drop zone; they land in R2 under this listing. */}
                <section className="rounded-[22px] border border-line/50 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Photos{photos.length ? ` · ${photos.length}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {photos.length > 0 && (
                        <button type="button" onClick={() => setLightbox(0)} className="rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40">
                          Open the showcase
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDrop("photos")}
                        className="flex items-center gap-2 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        <DoodleIcon name="upload" size={14} />
                        Add photos
                      </button>
                    </div>
                  </div>
                  {photos.length ? (
                    <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                      {photos.map((p, i) => (
                        <button
                          key={p + i}
                          type="button"
                          onClick={() => setLightbox(i)}
                          aria-label={`Photo ${i + 1}`}
                          className="group overflow-hidden rounded-xl border border-line/50 transition-colors hover:border-ink/40"
                        >
                          <PropertyPhoto src={p} className="aspect-[4/3] w-full transition-transform duration-300 group-hover:scale-[1.03]" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDrop("photos")}
                      className="mt-4 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line/70 bg-page px-6 py-10 text-center transition-colors hover:border-accent-dark/60 hover:bg-accent-soft/30"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name="folder" size={20} /></span>
                      <span className="hand mt-3 text-[17px]">No photographs yet</span>
                      <span className="mt-1 text-[12.5px] text-muted">Drop them here, or click to choose them.</span>
                    </button>
                  )}
                </section>
              </div>
            )}

            {tab === "compliance" && (
              <div className="space-y-5">
                {listing.epcExpiry == null && (
                  <button
                    type="button"
                    onClick={() => setDrop("epc")}
                    className="flex w-full items-center gap-4 rounded-[22px] border border-accent/60 bg-accent-soft/50 p-5 text-left transition-colors hover:bg-accent-soft/80"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-accent-dark"><DoodleIcon name="shield" size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="hand block text-[17px]">File the EPC</span>
                      <span className="block text-[12.5px] text-muted">No EPC is recorded on this listing. Drop the certificate and we read the rating and the dates off it.</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white">Drop it here</span>
                  </button>
                )}
                <div className="[&>section]:rounded-[22px] [&>section]:border-line/50 [&>section]:bg-white">
                  <PropertyFile key={`file-${drop ?? "x"}`} propertyId={listing.propertyId ?? null} address={listing.propertyId ? null : listing.name} screen="the listing" />
                </div>
              </div>
            )}

            {tab === "documents" && (
              <div className="mb-5 rounded-[22px] border border-line/50 bg-white p-5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">How we get in</p>
                <p className="mt-1 mb-4 text-[12.5px] text-muted">Vacant, through the tenant, or through the landlord. The access button on the record follows this.</p>
                <AccessSettings
                  value={access}
                  onChange={setAccess}
                  tenant={listing.tenant ?? null}
                  landlord={landlord.status === "known" ? landlord.landlord : null}
                />
              </div>
            )}
            {tab === "documents" && (
              <ListingDocuments
                terms={terms}
                listingId={listing.id}
                propertyId={listing.propertyId ?? null}
                contactId={link?.landlord?.contactId ?? null}
                /* Undefined, deliberately. These prefilled the Terms of
                   Business e-sign from `landlordFor()` — so a contract could
                   have gone out addressed to an invented person at an invented
                   address. The panel already handles not knowing; it must be
                   told the truth rather than handed a plausible name. */
                landlordName={landlord.status === "known" ? landlord.landlord.name : undefined}
                landlordEmail={landlord.status === "known" ? (landlord.landlord.email ?? undefined) : undefined}
                address={listing.name}
              />
            )}

          </div>

        </div>

        {/* The street, pinned to the foot of the drawer whatever is scrolled.
            The scroll area above keeps 210px clear for it, so it never sits
            over anything. */}
        {/* A white fade under the houses, so whatever scrolls beneath them
            fades out rather than colliding with the drawing. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] bg-gradient-to-t from-white via-white/90 to-transparent" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/street.webp" alt="" aria-hidden className="art art-figure pointer-events-none absolute bottom-0 left-1/2 w-[520px] max-w-[92%] -translate-x-1/2 opacity-90" />
      </aside>

      {/* The handover. A confirmation that SHOWS what's being compiled —
          Kirstie should receive a package, not a link and a shrug. */}
      {handingOver && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button
            aria-label="Close"
            onClick={() => setHandingOver(false)}
            className="absolute inset-0 cursor-default bg-ink/45"
          />
          <div className="fade-up relative w-full max-w-md overflow-hidden rounded-3xl border border-line/80 bg-page p-7 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="text-center">
              <DoneTick />
              <h2 className="hand mt-4 text-[20px]">Hand over to Kirstie</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Everything below goes to Applications in one package. Pre-tenancy,
                referencing, property prep and move-in run there.
              </p>
            </div>
            <dl className="mt-5 space-y-2 rounded-2xl border border-line/70 p-4 text-[12.5px]">
              {[
                ["Property", listing.name],
                ["Rent agreed", `£${listing.rent?.toLocaleString("en-GB")} pcm`],
                ["Landlord", landlord.status === "known" ? [landlord.landlord.name, landlord.landlord.phone].filter(Boolean).join(" · ") : "Not recorded in REX"],
                ["Applicant", "From the accepted offer"],
                ["Available from", listing.availableFrom ?? "Not set"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line/40 pb-2 last:border-0 last:pb-0">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 truncate text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setHandingOver(false)}
                className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
              >
                Not yet
              </button>
              <Link
                href="/applications"
                className="press-ring press-wobble flex items-center gap-2 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page"
              >
                <DoodleIcon name="key" size={15} />
                Hand over
              </Link>
            </div>
            <p className="mt-4 text-center text-[10.5px] text-muted">
              Wireframe: this opens Applications. Creating the application record is a
              write that isn&apos;t wired yet.
            </p>
          </div>
        </div>
      )}

      {/* ── The offer form: rent, then everyone who'd live there. ── */}
      {offering && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button
            aria-label="Close"
            onClick={() => { setOffering(false); setDraftTenants([]); setDraftRent(""); }}
            className="absolute inset-0 cursor-default bg-ink/45"
          />
          <div className="fade-up relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="shrink-0 border-b border-line/70 px-6 py-4">
              <h2 className="text-[19px] leading-tight">Make an offer</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                {listing.name} · asking £{listing.rent?.toLocaleString("en-GB")} pcm
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Rent offered, pcm
                </span>
                <span className="flex items-center gap-2 rounded-xl border border-line/80 px-3.5 py-2.5 focus-within:border-ink">
                  <span className="figures text-[14px] text-muted">£</span>
                  <input
                    value={draftRent}
                    onChange={(e) => setDraftRent(e.target.value.replace(/[^\d,]/g, ""))}
                    placeholder={listing.rent ? String(listing.rent) : "0"}
                    className="figures w-full bg-transparent text-[14px] outline-none placeholder:text-muted/50"
                  />
                </span>
              </label>

              {/* ── WHO the offer is from. An offer has to be attached to a
                     person we hold a file on: typing a name into a box makes
                     an offer from a stranger, and there is nothing to
                     reference, chase or hold to it. ── */}
              <div className="mt-5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Who&apos;s offering
                </p>
                <p className="mb-2.5 text-[11.5px] text-muted">
                  {otherTenants
                    ? "Anyone we hold a record for."
                    : candidates.length
                      ? "People who have viewed this property — nearly always one of these."
                      : "Add anybody else with Find other tenants."}
                </p>

                {/* Who is already on the offer. The list below is drawn from
                    the diary, so somebody picked from an enquiry or a viewing
                    record won't appear in it - they show here instead, and can
                    be taken off the same way. */}
                {offSheet.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {offSheet.map((t) => (
                      <button
                        key={t.fromId || t.name}
                        type="button"
                        onClick={() => setDraftTenants((cur) => cur.filter((x) => x.fromId !== t.fromId))}
                        className="flex items-center gap-1.5 rounded-full border border-accent-dark bg-accent-soft/50 px-3 py-1 text-[11.5px] font-semibold text-accent-dark"
                      >
                        {t.name}
                        <span aria-hidden className="text-[13px] leading-none">&times;</span>
                      </button>
                    ))}
                  </div>
                )}

                {otherTenants && (
                  <input
                    autoFocus
                    value={tenantQuery}
                    onChange={(e) => setTenantQuery(e.target.value)}
                    placeholder="Search by name…"
                    className="mb-2.5 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[13px] outline-none focus:border-ink"
                  />
                )}

                <div className="space-y-1.5">
                  {candidates.map((c) => {
                    const on = draftTenants.some(
                      (t) => t.fromId === c.id || t.name.trim().toLowerCase() === c.name.trim().toLowerCase()
                    );
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setDraftTenants((cur) =>
                            on
                              ? cur.filter(
                                  (t) => t.fromId !== c.id && t.name.trim().toLowerCase() !== c.name.trim().toLowerCase()
                                )
                              : [...cur, { name: c.name, number: "", mobile: c.phone, situation: "", fromId: c.id }]
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          on ? "border-accent-dark bg-accent-soft/50" : "border-line/70 hover:border-ink/40"
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-dark">
                          {c.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{c.name}</span>
                          <span className="block truncate text-[11px] text-muted">{c.note}</span>
                        </span>
                        {on && <DoodleIcon name="check" size={14} className="shrink-0 text-accent-dark" />}
                      </button>
                    );
                  })}
                  {!candidates.length && !(offSheet.length && !otherTenants) && (
                    <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-muted">
                      {otherTenants
                        ? "Nobody matches that."
                        : "Nobody has viewed this property yet — use Find other tenants below."}
                    </p>
                  )}
                </div>

                {/* Right at the bottom, as the exception it is. */}
                <button
                  type="button"
                  onClick={() => { setOtherTenants((o) => !o); setTenantQuery(""); }}
                  className="mt-3 text-[12px] font-semibold text-accent-dark transition-opacity hover:opacity-70"
                >
                  {otherTenants ? "← Back to people who viewed it" : "Find other tenants →"}
                </button>
              </div>

              {/* Their situation, per attached person — the bit a landlord asks about. */}
              {draftTenants.map((t, i) => (
                <div key={t.fromId || i} className="mt-3 rounded-2xl border border-line/70 p-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {t.name}
                  </p>
                  <textarea
                    value={t.situation}
                    onChange={(e) =>
                      setDraftTenants((cur) =>
                        cur.map((x, xi) => (xi === i ? { ...x, situation: e.target.value } : x))
                      )
                    }
                    placeholder="Their situation — job, income, pets, anything the landlord will ask about…"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none focus:border-ink"
                  />
                </div>
              ))}

            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
              <button
                type="button"
                onClick={() => setOffering(false)}
                className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
              >
                Cancel
              </button>
              <PressButton
                onClick={saveOffer}
                className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                  draftRent.trim() && draftTenants.some((t) => t.name.trim())
                    ? "bg-accent-dark text-page"
                    : "cursor-not-allowed bg-ink/30 text-page/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <DoodleIcon name="coin" size={14} />
                  Log the offer
                </span>
              </PressButton>
            </div>
          </div>
        </div>
      )}

      {/* ── The landlord's page: every application, anonymised, the agent's
          pick starred. Sent as a link; the landlord chooses or rings in. ── */}
      {reviewing && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button
            aria-label="Close"
            onClick={() => setReviewing(false)}
            className="absolute inset-0 cursor-default bg-ink/45"
          />
          <div className="fade-up relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="shrink-0 border-b border-line/70 px-6 py-4">
              <h2 className="text-[19px] leading-tight">What the landlord will see</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                A link to this page goes to the landlord — no names, just the substance.
                They pick, or they ring you.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <ul className="space-y-3">
                {offers.map((o, i) => (
                  <li
                    key={i}
                    className={`rounded-2xl border p-4 ${
                      topPick === i ? "border-accent-dark bg-accent-soft/30" : "border-line/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="hand text-[14px]">
                        Applicant {String.fromCharCode(65 + i)}
                        {o.tenants.length > 1 ? ` (party of ${o.tenants.length})` : ""}
                      </span>
                      <span className="figures text-[16px] text-accent-dark">
                        £{o.rent}<span className="text-[10px] text-muted"> pcm</span>
                      </span>
                    </div>
                    {topPick === i && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-accent-dark">
                        <DoodleIcon name="star" size={12} /> The agency&apos;s pick
                      </p>
                    )}
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                      {o.tenants.map((t) => t.situation).filter(Boolean).join(" · ") ||
                        "Situation notes to follow."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewing(false);
                        advance();
                      }}
                      className="mt-3 rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold transition-colors hover:border-ink"
                    >
                      Landlord picked this one →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
              <p className="text-[10.5px] text-muted">
                Wireframe — the real link is a page the landlord signs into.
              </p>
              <CopyButton
                value={`https://tle-os.co.uk/review/${listing.id} (wireframe)`}
                label="Copy the landlord's link"
              />
            </div>
          </div>
        </div>
      )}

      <EmailToTenants open={emailing} onClose={() => setEmailing(false)} listing={listing} />

      <ViewingBooker
        open={booking}
        onClose={() => setBooking(false)}
        lead={null}
        applicants={APPLICANTS}
        occupant={listing.tenant ?? null}
        properties={[listing]}
        agent="Kirstie"
        onBooked={(v) => setBooked((cur) => [{ when: v.when, who: v.who }, ...cur])}
      />
      {lightbox != null && <PhotoLightbox photos={photos} start={lightbox} name={listing.name} onClose={() => setLightbox(null)} />}
      {drop && (
        <DropZone
          kind={drop}
          refId={`listing-${listing.id}`}
          propertyId={listing.propertyId ?? null}
          address={listing.name}
          onClose={() => setDrop(null)}
          onLanded={(f) => {
            if (drop === "photos" && f.url) setUploaded((u) => [...u, { key: f.name, url: f.url! }]);
          }}
        />
      )}
    </div>
  );
}
