"use client";
import OsAddressLine from "@/components/OsAddressLine";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { londonToday } from "@/lib/london-clock";
import AdvertOffline from "@/components/listing/AdvertOffline";
import DoodleIcon from "@/components/DoodleIcon";
import SignInAgain from "@/components/SignInAgain";
import WithdrawnBox from "@/components/listing/WithdrawnBox";
import PropertyPhoto from "@/components/PropertyPhoto";
import PhotoLightbox from "@/components/PhotoLightbox";
import Link from "next/link";
import EmailToTenants from "@/components/EmailToTenants";
import ProcessTimeline from "@/components/ProcessTimeline";
import PortalMarket from "@/components/listing/PortalMarket";
import PortalOverview from "@/components/listing/PortalOverview";
import LandlordStage from "@/components/listing/LandlordStage";
import TenancyLinkPanel from "@/components/TenancyLinkPanel";
import BookViewing from "@/components/viewings/BookViewing";
import ApplicationFormCard from "@/components/listing/ApplicationFormCard";
import { CopyButton, DoneTick, PressButton } from "@/components/Bits";
import { Tag } from "@/components/ListingTags";
import { ARCHIVE_AFTER_DAYS, archiveLabel, archiveWhy, type ArchiveReason } from "@/lib/listing-archive";
import { accessKeyFor } from "@/lib/access-key";
import ViewingSheet from "@/components/listing/ViewingSheet";
import AccessRequest, { AccessSettings, NO_ACCESS, selfAccess, type Access } from "@/components/listing/AccessRequest";
import DropZone, { type DropKind } from "@/components/listing/DropZone";
import { LISTING_BOOKER_LIVE } from "@/lib/viewing-sends";
import { LISTING_TRACK, listingStartingStep } from "@/lib/journey";
import { searchMatches } from "@/lib/search-match";

/**
 * Offers made on the listing itself are off (16 Sep 2026).
 *
 * "Make an offer", "Apply", "Mark as our pick", the landlord's review page and
 * "Hand over to Kirstie" were a wireframe: the offers lived in this drawer's
 * state and were gone when it closed, the landlord's link was a placeholder,
 * and the handover only opened Applications. An agent could log an offer,
 * star it, "send" it and believe it had gone somewhere.
 *
 * Applications is the real path - the form files them, the drawer there puts
 * them to the landlord and runs the handover - so with this off the listing
 * shows the real applications and each one opens there. Flip it only once
 * an offer made here is saved as an application.
 */
const LISTING_OFFERS_LIVE = false;
import type { Landlord } from "@/lib/rex-landlord";
import { DIARY, type Appt } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import { setOpenListing } from "@/lib/open-record";
import type { TenancyLink } from "@/lib/tenancy-link";
import { saveLabel, useCaseState } from "@/lib/case-state";
import { AREA_DEFS, canAct, levelOf, lockedSentence, type AreaAccess } from "@/lib/area-map";
import ListingMarketing, { type Locks } from "@/components/listing/ListingMarketing";
import type { ListingDetails } from "@/lib/listing-details";
import { inputFromDetails, missing as missingForPortals } from "@/lib/listing-requirements";
import { useListingTerms } from "@/lib/use-listing-terms";
import { fetchMe } from "@/lib/me";
import RexWaitingChip from "@/components/RexWaitingChip";
import { Badge, FillText, Ico, Menu, Tabs } from "@/components/new-look/Parts";
import PhotoGrid from "@/components/new-look/PhotoGrid";
import EditAdvert from "@/components/new-look/advert/EditAdvert";
import { useNewLook } from "@/lib/use-new-look";
import SteveFace from "@/components/SteveFace";
import { OPTIONS } from "@/lib/listing-requirements";
import HomeKeys from "@/components/portfolio/HomeKeys";
import SaveChip, { SaveScopeProvider, useSaveReporter, useSaveScope, type SaveScope } from "@/components/SaveChip";
import ListingOwner from "@/components/listing/ListingOwner";
import ListingCompliance, { useListingHome } from "@/components/listing/ListingCompliance";
import FieldSelect from "@/components/FieldSelect";
import { LET_TYPES, type LetType } from "@/lib/let-type";
import OfferWhoPicker, { type OfferPerson } from "@/components/offers/OfferWhoPicker";
import ContactBlock from "@/components/ContactBlock";
import HomeLandlords from "@/components/HomeLandlords";
import { ChangeLandlordButton, ListingChangedLandlord } from "@/components/landlord/ChangeLandlord";
import ListingOffers, { type ListingOffer } from "@/components/listing/ListingOffers";
import ListingEnquiries from "@/components/listing/ListingEnquiries";
import AddToBlock, { type BlockAnchor } from "@/components/viewings/AddToBlock";
import BookSlot from "@/components/viewings/BookSlot";
import RecordSidePanel, { type NoteRow, type PanelTab } from "@/components/RecordSidePanel";
import ChangeViewing, { apptFromViewing, apptStartIso } from "@/components/viewings/ChangeViewing";
import HomeSwitch from "@/components/HomeSwitch";

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
  /** Some rents are quoted weekly. Printing those as "pcm" understates the
   *  home fourfold, so the period travels with the number. */
  rentPeriod?: "month" | "week" | null;
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
  /** Filed away by the two-month draft cap, or by hand. See
   *  lib/listing-archive.ts - the rule runs on the server, this is its answer. */
  archived?: boolean;
  archiveReason?: ArchiveReason | null;
  archivedSince?: string | null;
  archiveAgeDays?: number | null;
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

type TabKey = "viewings" | "enquiries" | "applications" | "marketing" | "compliance" | "portals";
/** The new look's tabs on the page: the sections, plus notes and activity. */
type NlTab = "overview" | Exclude<TabKey, "marketing"> | "notes" | "activity";
/** The Details as fields, in the new look's edit-in-place. */
type FactsDraft = { rent: string; deposit: string; availableFrom: string; beds: string; baths: string; councilTaxBand: string; propertyTypeId: string; furnishing: string; letType: string; introOnly: string };

/* SIX VIEWS, ONE RECORD (James, 11 Sep 2026), then a page with its sections
   under it (12 Oct), then ONE PAGE (James, 12 Oct 2026: "far too much
   scroll"): every section is a pop-out from a tile beside the photos, so
   nothing bolts onto the foot of the page. Documents went into Compliance
   ("pretty much the same thing"); Marketing is Edit the advert. */
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "viewings", label: "Viewings", icon: "calendar" },
  /* Enquiries apart from Offers (James, 8 Oct 2026): people asking from the
     portals have not offered - "it's not an offer". */
  { key: "enquiries", label: "Enquiries", icon: "target" },
  /* "Offers" since 7 Oct 2026: an offer is not an application until it is
     accepted (James). The key stays, for ?tab= links and Steve. */
  { key: "applications", label: "Offers", icon: "coin" },
  { key: "marketing", label: "Edit the advert", icon: "pack/photo" },
  { key: "compliance", label: "Compliance", icon: "shield" },
  /* Live only: where the advert is, on and off, and how it is doing. */
  { key: "portals", label: "On the portals", icon: "megaphone" },
];

/* One line under each pop-out's title, saying what it is for. */
const TAB_LEAD: Record<TabKey, string> = {
  viewings: "Everything in the diary for this home. Open a viewing for its details and whether we can get in.",
  enquiries: "Everyone who has asked about this home, from the portals and the rest. Send them the tenant passport in one go, and see whose is done.",
  applications: "Only the people who have offered. Put each one to the landlord, then accept or decline it. The accepted one moves to Applications; the rest are held until its holding fee is paid.",
  marketing: "The facts, the advert the portals show, and the photographs. What a tenant sees, all in one place.",
  compliance: "What this home has to hold for its type of let, what is already on file for it, and one place to add more.",
  portals: "Where the advert is live, taking it off or putting it back, and how it is doing against every other home we have on the portals.",
};

/** The pop-out a link asks for (?tab=), if any. Documents lives in
 *  Compliance now, and Home is the page itself. */
export function askedTab(asked?: string | null): TabKey | null {
  if (asked === "documents") return "compliance";
  return TABS.find((t) => t.key === asked)?.key ?? null;
}

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

/** A stored listing note as the side panel shows it. */
function noteRow(n: { id: string; body: string; author: string; at: string }): NoteRow {
  const d = new Date(n.at);
  const when = d.toLocaleString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "2-digit", minute: "2-digit" });
  return { id: n.id, author: n.author || "Somebody", when, text: n.body, at: n.at };
}

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
    <section className="min-w-0 rounded-xl border border-line/50 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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


/**
 * The drawer, inside its Auto save scope (James, 23 Sep 2026: every file says
 * when a change saved, by the close button). The scope is made out here, one
 * level up, because the drawer's own useCaseState saves - access, the step,
 * the tenancy link - read the scope from context, and a component cannot read
 * a provider it renders itself. Made in the body, they would toast and never
 * reach the chip.
 */
/* A listing the listings system has withdrawn, let or sold: its publication still reads published. */
const GONE_STATES = new Set(["withdrawn", "leased", "sold"]);

export default function ListingDrawer(props: Omit<Parameters<typeof ListingDrawerBody>[0], "saves">) {
  const saves = useSaveScope(props.listing?.id ?? null);
  return (
    <SaveScopeProvider scope={saves}>
      <ListingDrawerBody {...props} saves={saves} />
    </SaveScopeProvider>
  );
}

function ListingDrawerBody({
  listing: listingIn,
  backHref = "/listings",
  onStep,
  stepLabel,
  onArchive,
  archiveBusy,
  saves,
  initialTab,
  initialOffer,
  newLook = false,
}: {
  /** Every save on this listing, for the chip by the back link. */
  saves: SaveScope;
  listing: Listing | null;
  /** Where "← Listings" goes. */
  backHref?: string;
  /** ‹ › through the board as it was shown, when the page knows it. */
  onStep?: (delta: number) => void;
  /** "3 of 40", beside the arrows. */
  stepLabel?: string | null;
  /** File this draft away early, or bring it back. Owned by the board, which
   *  already holds the book this listing came out of - the drawer would
   *  otherwise be updating a copy the board never hears about. */
  onArchive?: (id: string, action: "archive" | "restore") => void;
  archiveBusy?: boolean;
  /** Open on this view rather than Home - ?tab=marketing from the appraisal
   *  file's "Write the description" (Howard, 1 Oct 2026). */
  initialTab?: string | null;
  /** An offer to open on the Offers pop-out (?offer=, from Listings > Offers in). */
  initialOffer?: string | null;
  /** Drawn in the new look (lib/new-look "listing"): sections as tabs on the page. */
  newLook?: boolean;
}) {
  /* A changed address shows at once (James, 27 Oct 2026): the name every
     part of the page uses is REX's, which Change address now rewrites, and
     the board's copy only catches up on its next read. */
  const [addrNow, setAddrNow] = useState<{ id: string; name: string; locality: string } | null>(null);
  /* Marked Let Agreed, or back to available, from the head: shown at once,
     as the address is, before the board's copy reads it again. */
  const [letNow, setLetNow] = useState<{ id: string; letAgreed: boolean } | null>(null);
  const listing = useMemo(() => {
    if (!listingIn) return listingIn;
    const id = String(listingIn.id);
    let l = listingIn;
    if (addrNow && addrNow.id === id) l = { ...l, name: addrNow.name, locality: addrNow.locality };
    if (letNow && letNow.id === id) l = { ...l, letAgreed: letNow.letAgreed };
    return l;
  }, [listingIn, addrNow, letNow]);
  const onAddress = useCallback((a: { name: string; locality: string }) => {
    if (listingIn) setAddrNow({ id: String(listingIn.id), ...a });
  }, [listingIn]);
  /* The pop-out open over the page, if any. Kept in the address (?tab=), so
     a link or a reload opens it again. */
  const [tab, setTab] = useState<TabKey | null>(() => {
    const asked = askedTab(initialTab);
    return newLook && asked !== "marketing" ? null : asked;
  });
  /* Edit the advert's own switch (lib/new-look "advert"): null until known. */
  const advertLook = useNewLook("advert");
  /* The progress line in graded sage (James, 25 Oct 2026), behind its own switch. */
  const graded = useNewLook("spine") === true;
  /* The new look's tab on the page itself; Edit the advert stays a pop-out. */
  const [nlTab, setNlTab] = useState<NlTab>(() => {
    const asked = askedTab(initialTab);
    return asked && asked !== "marketing" ? asked : "overview";
  });
  const pickTab = useCallback((t: TabKey | null) => {
    setTab(t);
    try {
      const u = new URL(window.location.href);
      if (t) u.searchParams.set("tab", t);
      else u.searchParams.delete("tab");
      u.searchParams.delete("offer");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* fine */ }
  }, []);
  /* The new look's own bits of state (round two, 23 Oct 2026): The Details
     and the description edited in place, the photo grid, the drawers behind
     Preview and the landlord's Edit, and Steve's read of the passports. */
  const [factsEdit, setFactsEdit] = useState(false);
  const [factsDraft, setFactsDraft] = useState<FactsDraft | null>(null);
  const [factsSave, setFactsSave] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [factsErr, setFactsErr] = useState<string | null>(null);
  const [descEdit, setDescEdit] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [descSave, setDescSave] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [descErr, setDescErr] = useState<string | null>(null);
  const [gridFrom, setGridFrom] = useState<DOMRect | null>(null);
  const heroRef = useRef<HTMLButtonElement>(null);
  const [portalStats, setPortalStats] = useState(false);
  const [landlordOpen, setLandlordOpen] = useState(false);
  const [pastShown, setPastShown] = useState(20);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [passports, setPassports] = useState<Record<string, { state: string }> | null>(null);
  const pickNl = useCallback((t: NlTab) => {
    setNlTab(t);
    try {
      const u = new URL(window.location.href);
      if (t !== "overview") u.searchParams.set("tab", t);
      else u.searchParams.delete("tab");
      u.searchParams.delete("offer");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* fine */ }
  }, []);
  /* In the new look a section is a tab on the page, and only the advert
     editor slides out over it. */
  const goTab = useCallback(
    (t: TabKey | null) => (newLook && t && t !== "marketing" ? pickNl(t) : pickTab(t)),
    [newLook, pickNl, pickTab]
  );
  const closeTab = useCallback(() => pickTab(null), [pickTab]);
  /* Book a viewing asks which: one viewing, or a slot (James, 12 Oct 2026). */
  const [choosingBook, setChoosingBook] = useState(false);
  /* How we get in, changed from the access details. */
  const [editingAccess, setEditingAccess] = useState(false);
  /* The side panel: the landlord's messages, or the listing's notes (10 Oct 2026). */
  const [panelTab, setPanelTab] = useState<PanelTab | null>(null);
  const [listingNotes, setListingNotes] = useState<NoteRow[] | null>(null);
  const notesFor = listing ? String(listing.id) : null;
  useEffect(() => {
    if (!notesFor) return;
    let gone = false;
    setListingNotes(null);
    fetch(`/api/listings/${encodeURIComponent(notesFor)}/notes`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; notes?: { id: string; body: string; author: string; at: string }[] }) => {
        if (!gone) setListingNotes(j.ok ? (j.notes ?? []).map(noteRow) : []);
      })
      .catch(() => !gone && setListingNotes([]));
    return () => { gone = true; };
  }, [notesFor]);
  async function addListingNote(body: string): Promise<boolean> {
    if (!notesFor) return false;
    const r = await fetch(`/api/listings/${encodeURIComponent(notesFor)}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !j.ok) return false;
    setListingNotes((cur) => [noteRow(j.note), ...(cur ?? [])]);
    return true;
  }
  const [emailing, setEmailing] = useState(false);
  /* Asked once, read by the header pill and by the Documents tab. */
  const terms = useListingTerms(listing?.id ?? null);
  /* The type of let, and terms counted from wherever they already are
     (James, 12 Oct 2026): the property record's, an upload, a signature. */
  const { home, problem: homeProblem, setLetType, setIntroOnly, reload: reloadHome } = useListingHome(listing?.id ?? "");
  const termsOnFile = (terms.status === "ready" && terms.signed) || Boolean(home?.terms.held) || home?.terms.rex === true;
  const termsKnown = terms.status === "ready" || home != null;
  /* The listing's property types, asked for when the Type list first opens. */
  const [propTypes, setPropTypes] = useState<{ id: string; label: string }[] | null>(null);
  const loadPropTypes = () => {
    if (propTypes) return;
    setPropTypes([]);
    void fetch("/api/listings/create?lists=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; types?: { id: string; label: string }[] }) => setPropTypes(j.ok ? j.types ?? [] : null))
      .catch(() => setPropTypes(null));
  };
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
  /* A landlord changed in the OS asks again (Dan Richards, 17 Oct 2026). */
  const [landlordRev, setLandlordRev] = useState(0);
  /* The photo set popped out full size; null when closed. */
  const [lightbox, setLightbox] = useState<number | null>(null);
  /* How we get into the property - vacant, tenant or landlord - kept on
     the record so the hero button and the Documents tab agree. */
  /* Against the PROPERTY, so a re-let keeps it (lib/access-key). */
  const accessKey = listing ? accessKeyFor({ listingId: listing.id, propertyId: listing.propertyId }) : null;
  const [access, setAccess, accessStatus] = useCaseState<Access>("access", accessKey, NO_ACCESS);
  /* Anything recorded under the listing before the move: copied onto the
     property once, the first time this listing is opened with it empty. */
  const moved = useRef<string | null>(null);
  useEffect(() => {
    if (!listing || !accessKey || accessKey === listing.id) return;
    if (accessStatus !== "ready" || access.kind) return;
    if (moved.current === listing.id) return;
    moved.current = listing.id;
    fetch(`/api/case-state?kind=access&id=${encodeURIComponent(listing.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { payload?: Access | null } | null) => {
        if (j?.payload?.kind) setAccess({ ...NO_ACCESS, ...j.payload });
      })
      .catch(() => { /* nothing to move, or nothing to move it with */ });
  }, [listing, accessKey, accessStatus, access.kind, setAccess]);
  /* Photographs added here, out of R2, shown beside REX's. */
  const [uploaded, setUploaded] = useState<{ key: string; url: string }[]>([]);
  const [drop, setDrop] = useState<DropKind | null>(null);
  /* The push to the portals, as a moment: null when not running, then the
     portal it is on (0..2), then 3 for the tick and the confetti. */
  const [pushing, setPushing] = useState<number | null>(null);
  /* The real push (15 Sep 2026). The ceremony walks the portals while REX
     answers, and holds on the last one until it has: the tick and the
     confetti only ever follow a publish REX has confirmed. */
  const [pushOk, setPushOk] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  /* The push was refused only because their sign-in ran out: the card asks for it. */
  const [pushSignIn, setPushSignIn] = useState(false);
  useEffect(() => {
    if (pushing == null || pushing < 0 || pushing >= 3 || pushError) return;
    if (pushing === 2 && !pushOk) return;
    const t = setTimeout(() => setPushing((p) => (p == null ? null : p + 1)), 1250);
    return () => clearTimeout(t);
  }, [pushing, pushOk, pushError]);

  /* Where it really is, live from REX. The book is cached for minutes, and
     straight after a push it would still say draft. */
  const [pub, setPub] = useState<{ status: string | null; onPortals: boolean; blockers: string[] } | null>(null);
  /* Read again after a withdrawn listing is relisted or taken off (WithdrawnBox). */
  const [pubKey, setPubKey] = useState(0);
  const reloadPub = () => setPubKey((k) => k + 1);
  /* Cleared for a different listing only: a re-read keeps the old answer up meanwhile. */
  useEffect(() => setPub(null), [listing?.id]);
  useEffect(() => {
    if (!listing?.id) return;
    let live = true;
    fetch(`/api/listings/publish?id=${encodeURIComponent(String(listing.id))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; status?: string | null; onPortals?: boolean; blockers?: string[] }) => {
        if (live && j.ok) setPub({ status: j.status ?? null, onPortals: Boolean(j.onPortals), blockers: j.blockers ?? [] });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [listing?.id, pubKey]);

  /* The listing as REX holds it now - rooms, type, deposit, dates - read once
     per listing and shared with the Marketing tab. The book never carried
     bedrooms, which is why Property details said "Not set" on every home. */
  const [live, setLive] = useState<ListingDetails | null>(null);
  const [liveLocks, setLiveLocks] = useState<Locks | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  useEffect(() => {
    setLive(null);
    setLiveFailed(false);
    if (!listing?.id) return;
    let off = false;
    fetch(`/api/listings/details?id=${encodeURIComponent(String(listing.id))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; details?: ListingDetails; locks?: Locks }) => {
        if (off) return;
        if (j.ok && j.details) {
          setLive(j.details);
          setLiveLocks(j.locks ?? { listing: true, rooms: true, media: true });
        }
        else setLiveFailed(true);
      })
      .catch(() => !off && setLiveFailed(true));
    return () => {
      off = true;
    };
  }, [listing?.id]);

  /* Its own switch on Admin, Switches: hidden, look only, testers, everyone. */
  const [areaAccess, setAreaAccess] = useState<AreaAccess | null>(null);
  useEffect(() => {
    fetch("/api/area-access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: AreaAccess | null) => j && typeof j.gated === "boolean" && setAreaAccess(j))
      .catch(() => {});
  }, []);
  const publishArea = AREA_DEFS.find((a) => a.id === "listing-publish")!;
  const publishLevel = levelOf(areaAccess, publishArea.id);
  const publishHidden = Boolean(areaAccess?.gated) && publishLevel === "hidden";
  /* A test listing (negative id, lib/test-overlay) goes live in the OS alone
     (James, 13 Oct 2026: a tester walks to the portals without anything
     refusing them). In practice mode a tester's own test file works in full -
     the middleware lets it through and the route answers it before the
     switch - so the button does too. */
  const testListing = /^-\d+$/.test(String(listing?.id ?? ""));
  const publishCanPress = canAct(areaAccess, publishArea) || (testListing && publishLevel === "practice");
  const editArea = AREA_DEFS.find((a) => a.id === "listing-edit")!;
  const editLevel = levelOf(areaAccess, editArea.id);
  const editCanPress = canAct(areaAccess, editArea);
  const reporter = useSaveReporter();
  /* The property type, straight from the line of facts: the same save as
     Edit the advert's Type, so the same switch guards it. */
  async function setPropertyType(propertyTypeId: string) {
    if (!listing || !live || propertyTypeId === live.propertyTypeId) return;
    const settle = reporter.begin("Property type");
    try {
      const r = await fetch("/api/listings/details", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: listing.id, propertyTypeId }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
      if (j.details) setLive(j.details);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "The type did not save.");
      settle({ ok: true });
    } catch (e) {
      settle({ ok: false, problem: e instanceof Error ? e.message : "The type did not save.", retry: () => void setPropertyType(propertyTypeId) });
    }
  }
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalConfirm, setPortalConfirm] = useState(false);
  const [portalNote, setPortalNote] = useState<string | null>(null);
  /* Take off / Put back refused for a lapsed sign-in (Lorna Fieldson, 28 Oct
     2026: both her presses on 15 Egton Street were, and the new look showed
     nothing). The sign-in is asked for there, and the press made again. */
  const [portalRetry, setPortalRetry] = useState<"off" | "on" | null>(null);
  /* Live without Portals (James, 24 Oct 2026): asked under the head, like taking it off. */
  const [quietAsk, setQuietAsk] = useState(false);
  const [quietBusy, setQuietBusy] = useState(false);
  const [quietNote, setQuietNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function portalCall(action: "publish" | "quiet" | "off" | "on"): Promise<{ ok: boolean; error?: string; signIn?: boolean }> {
    if (!listing) return { ok: false, error: "No listing open." };
    try {
      const r = await fetch("/api/listings/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: listing.id, action }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string | null; onPortals?: boolean; signIn?: boolean };
      if (!j.ok) return { ok: false, error: j.error ?? "The portals did not take it.", signIn: j.signIn };
      setPub((cur) => ({ status: j.status ?? null, onPortals: Boolean(j.onPortals), blockers: cur?.blockers ?? [] }));
      return { ok: true };
    } catch {
      return { ok: false, error: "The connection dropped. Check the listing before trying again." };
    }
  }

  async function startPush() {
    setPushOk(false);
    setPushError(null);
    setPushSignIn(false);
    setPushing(0);
    const res = await portalCall("publish");
    if (res.ok) {
      setPushOk(true);
      setActivityKey((k) => k + 1);
    }
    else {
      setPushSignIn(Boolean(res.signIn));
      setPushError(res.error ?? "The portals did not take it.");
    }
  }

  async function goLiveQuietly() {
    setQuietBusy(true);
    setQuietNote(null);
    const res = await portalCall("quiet");
    setQuietBusy(false);
    setQuietAsk(false);
    if (res.ok) {
      setActivityKey((k) => k + 1);
      setQuietNote({ ok: true, text: "Live, and off the portals. It moves on to viewings and offers; Put back on the market sends it to Rightmove, OnTheMarket and Zoopla when you're ready." });
    } else setQuietNote({ ok: false, text: res.error ?? "It did not go live." });
  }

  /* MARK AS LET AGREED (Lorna, 22 Oct 2026: "change a property status online
     to LET AGREED, not just take it straight offline"). The advert stays up
     and the portals put their Let Agreed banner on it; Back to available is
     the way back. The listing system's own tick, read live, decides which is
     offered - an offer accepted here is not that tick. Behind its own switch
     (app/api/listings/let-agreed): off, agents don't see it and an owner's
     press is a rehearsal. */
  const [letTick, setLetTick] = useState<{ letAgreed: boolean; onPortals: boolean; armed: boolean; rehearse: boolean } | null>(null);
  const [letAsk, setLetAsk] = useState(false);
  const [letBusy, setLetBusy] = useState(false);
  const [letNote, setLetNote] = useState<{ ok: boolean; text: string } | null>(null);
  const tickFor = listingIn && Number(listingIn.id) > 0 ? String(listingIn.id) : null;
  useEffect(() => {
    setLetTick(null);
    setLetAsk(false);
    setLetNote(null);
    if (!tickFor) return;
    let off = false;
    fetch(`/api/listings/let-agreed?id=${encodeURIComponent(tickFor)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; letAgreed?: boolean; onPortals?: boolean; armed?: boolean; rehearse?: boolean }) => {
        if (!off && j.ok) setLetTick({ letAgreed: Boolean(j.letAgreed), onPortals: Boolean(j.onPortals), armed: Boolean(j.armed), rehearse: Boolean(j.rehearse) });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [tickFor]);

  async function markLet(action: "let_agreed" | "available") {
    if (!listing) return;
    setLetBusy(true);
    setLetNote(null);
    try {
      const r = await fetch("/api/listings/let-agreed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: listing.id, action }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; letAgreed?: boolean; onPortals?: boolean; rehearsed?: boolean; portalsTold?: boolean | null };
      setLetAsk(false);
      if (!j.ok) {
        setLetNote({ ok: false, text: j.error ?? "That did not go through. Try again in a minute." });
      } else if (j.rehearsed) {
        setLetNote({ ok: true, text: "Rehearsal only: the switch is off, so nothing was changed and the portals were not told. Switched on, this is the press that does it." });
      } else {
        const la = Boolean(j.letAgreed);
        setLetTick((cur) => (cur ? { ...cur, letAgreed: la, onPortals: Boolean(j.onPortals) } : cur));
        setLetNow({ id: String(listing.id), letAgreed: la });
        setActivityKey((k) => k + 1);
        setLetNote({
          ok: true,
          text: !j.onPortals
            ? la ? "Marked Let Agreed. It is off the portals, so it shows there if you put it back on the market." : "Back to available. It is off the portals, so nothing changes there until you put it back on the market."
            : j.portalsTold === false
              ? la ? "Marked Let Agreed. The portals pick it up on their next upload, usually within the hour." : "Back to available. The portals pick it up on their next upload, usually within the hour."
              : la ? "Marked Let Agreed. Rightmove, OnTheMarket and Zoopla show the Let Agreed banner within about 10 minutes." : "Back to available. The Let Agreed banner comes off Rightmove, OnTheMarket and Zoopla within about 10 minutes.",
        });
      }
    } catch {
      setLetNote({ ok: false, text: "The connection dropped. Check the listing before trying again." });
    } finally {
      setLetBusy(false);
    }
  }

  async function flipPortals(action: "off" | "on") {
    setPortalBusy(true);
    setPortalNote(null);
    setPortalRetry(null);
    const res = await portalCall(action);
    setPortalBusy(false);
    setPortalConfirm(false);
    if (!res.ok && res.signIn) setPortalRetry(action);
    setPortalNote(
      res.ok
        ? action === "off"
          ? "Taken off. It leaves Rightmove, OnTheMarket and Zoopla within about 10 minutes."
          : "Back on. It shows on Rightmove, OnTheMarket and Zoopla within about 10 minutes."
        : res.error ?? "The portals did not take it."
    );
  }
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
    fetchMe()
      .then((j) => {
        const n = j?.user?.name;
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
      .then((j) => {
        if (!off && j.ok && Array.isArray(j.files)) setUploaded(j.files);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [listing?.id]);
  /* Bumped after a push to the portals (James, 13 Oct 2026, E2E walk): the
     push can bring an enquiry with it (a test listing's first one is seeded
     by the push itself), and the Enquiries tile and Book a viewing's list
     still said nobody until the page was reloaded. Harmless on a real one. */
  const [activityKey, setActivityKey] = useState(0);
  useEffect(() => {
    if (!listing) { setEnquiries(null); setLiveApps(null); return; }
    let gone = false;
    const id = String(listing.id);
    setEnquiries(null);
    setLiveApps(null);
    /* This listing's own enquiries and applications, filtered on the server
       (2 Oct 2026) - these used to fetch the whole Leads board and 300
       applications to keep a handful. Same fields back. */
    fetch(`/api/listings/${encodeURIComponent(id)}/enquiries`, { cache: "no-store" })
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
    fetch(`/api/listings/${encodeURIComponent(id)}/applications`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; applications?: { id: string; statusLabel?: string; stageLabel?: string; status?: string; closed?: string | null; listingId?: string | number; applicants?: { name?: string }[]; offerAmount?: number | null; dateReceived?: number | null; osDecision?: { decision?: string } | null }[] }) => {
        if (gone) return;
        const mine = (j.applications ?? []).filter((a) => String(a.listingId ?? "") === id);
        /* Accepted here counts as accepted (Sean, 15 Oct 2026): REX still had
           it as received, so the Handover step never found the let. */
        const acceptedHere = (a: (typeof mine)[number]) => a.status !== "unsuccessful" && a.osDecision?.decision === "accepted";
        setLiveApps(mine.map((a) => ({ id: String(a.id), statusLabel: acceptedHere(a) ? "Accepted" : a.statusLabel ?? a.status ?? "", movedIn: a.closed === "Moved in" || a.stageLabel === "Moved in", applicants: (a.applicants ?? []).map((x) => x.name).filter(Boolean).join(" & "), offerAmount: a.offerAmount ?? null, dateReceived: a.dateReceived ?? null })));
      })
      .catch(() => { if (!gone) setLiveApps([]); });
    return () => { gone = true; };
  }, [listing, activityKey]);

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
        if (!j.ok) setLandlord({ status: "problem", says: j.problem ?? "We could not look the landlord up just now." });
        else if (j.landlord) setLandlord({ status: "known", landlord: j.landlord });
        else setLandlord({ status: "none" });
      })
      .catch(() => {
        if (!gone) setLandlord({ status: "problem", says: "We could not look the landlord up just now." });
      });
    return () => {
      gone = true;
    };
  }, [listing, landlordRev]);

  const [booked, setBooked] = useState<{ when: string; who: string }[]>([]);
  /* WHERE IT'S UP TO, KEPT (17 Sep 2026). The step used to live in this
     component alone, so "Click a step to move the record" moved nothing: it
     was back where it started the next time the listing opened. Saved by
     step id, not number, for the reason listingStartingStep gives. */
  const [savedStep, saveStep, stepSave] = useCaseState<{ at: string | null }>("listing-step", listing?.id ?? null, { at: null });
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
  /* Change time on a viewing, from the listing (James, 26 Oct 2026: "you'll
     be able to rearrange viewings"): the same mover the dashboard's diary uses. */
  const [changingViewing, setChangingViewing] = useState<Appt | null>(null);
  const [liveApps, setLiveApps] = useState<{ id: string; statusLabel: string; movedIn?: boolean; applicants: string; offerAmount: number | null; dateReceived: number | null }[] | null>(null);
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
  /* Make an offer (7 Oct 2026, Howard): asks who it is from, then opens the
     real offer form on /offers/new. Offers saved against this listing are
     read back below so the agent sees it landed. */
  const [pickingOfferer, setPickingOfferer] = useState(false);
  /* "Add another viewing to this slot" on an upcoming viewing (8 Oct 2026). */
  const [blockAnchor, setBlockAnchor] = useState<BlockAnchor | null>(null);
  /* Book a slot (8 Oct 2026): held time at the home, tenants booked within it. */
  const [slotting, setSlotting] = useState(false);
  const [savedOffers, setSavedOffers] = useState<ListingOffer[] | null>(null);
  const [offersRexUnread, setOffersRexUnread] = useState(false);
  /* Bumped after an Accept, Decline or Undo, so the list reads again. */
  const [offersTick, setOffersTick] = useState(0);
  const offersFor = useRef<string | null>(null);
  useEffect(() => {
    const id = listing?.id;
    if (id == null) return;
    let gone = false;
    /* Another listing: never show the last one's offers while this one's load. */
    if (offersFor.current !== String(id)) setSavedOffers(null);
    offersFor.current = String(id);
    fetch(`/api/listings/${encodeURIComponent(String(id))}/offers`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; offers?: ListingOffer[]; rexUnread?: boolean }) => {
        if (gone) return;
        setSavedOffers(j.ok ? (j.offers ?? []) : []);
        setOffersRexUnread(!j.ok || j.rexUnread === true);
      })
      .catch(() => { if (!gone) { setSavedOffers([]); setOffersRexUnread(true); } });
    return () => {
      gone = true;
    };
  }, [listing?.id, offersTick]);
  const openOffers = savedOffers?.filter((o) => o.status === "open").length ?? 0;
  /* People, not enquiry records: the same tenant enquiring twice is one
     person to send one passport to (8 Oct 2026). */
  const enquirers = new Set((enquiries ?? []).map((e) => (e.email || "").trim().toLowerCase() || e.id)).size;

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
      acceptedOn: londonToday(),
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
    const q = tenantQuery.trim();
    return q ? all.filter((c) => searchMatches(q, c.name)) : all.slice(0, otherTenants ? 40 : 12);
  }, [liveDiary, listing?.name, otherTenants, tenantQuery, viewings]);
  /* Who an offer can be from: everyone who viewed this home (REX's diary
     for it, cancelled ones left out) and everyone who enquired, one row a
     person, viewers first because that is who offers nearly always. */
  const offerPeople = useMemo<OfferPerson[]>(() => {
    const out = new Map<string, OfferPerson>();
    /* On a TEST listing every test person - Landlord E2E, Tenant E2E - carries
       the tester's own email, so the email matched the landlord's and every
       viewer and enquirer was dropped as "the owner": the picker said nobody
       had viewed over a booked viewing (James, 13 Oct 2026, E2E walk). There,
       people are told apart by name as well. */
    const keyOf = (name: string, email: string | null | undefined) =>
      testListing ? `${name.trim().toLowerCase()}|${(email ?? "").trim().toLowerCase()}` : (email ?? "").trim().toLowerCase() || name.trim().toLowerCase();
    /* REX hangs the landlord on the viewing too; they never make the offer. */
    const owner = landlord.status === "known" ? landlord.landlord : null;
    const isOwner = (name: string, email: string | null | undefined) =>
      !!owner &&
      ((!testListing && !!owner.email && (email ?? "").trim().toLowerCase() === owner.email.trim().toLowerCase()) || name.trim().toLowerCase() === owner.name.trim().toLowerCase());
    const allViewings = [...(viewings?.past ?? []), ...(viewings?.upcoming ?? [])]
      .filter((v) => !v.cancelled)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    for (const v of allViewings) {
      const when = new Date(v.startsAt);
      for (const c of v.contacts) {
        if (!c.name.trim() || isOwner(c.name, c.email)) continue;
        const k = keyOf(c.name, c.email);
        if (out.has(k)) continue;
        out.set(k, {
          key: k,
          name: c.name,
          email: (c.email ?? "").trim(),
          phone: c.phone ?? "",
          note: `${when.getTime() > Date.now() ? "Viewing booked" : "Viewed"} ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(when.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}), timeZone: "Europe/London" })}`,
        });
      }
    }
    for (const e of enquiries ?? []) {
      if (!e.name.trim() || isOwner(e.name, e.email)) continue;
      const k = keyOf(e.name, e.email);
      const byName = [...out.values()].find((p) => p.name.trim().toLowerCase() === e.name.trim().toLowerCase());
      if (out.has(k)) continue;
      if (byName) {
        if (!byName.email && e.email) byName.email = e.email.trim();
        continue;
      }
      out.set(k, { key: k, name: e.name, email: (e.email ?? "").trim(), phone: e.phone ?? "", note: `Enquired ${e.received}`.trim() });
    }
    return [...out.values()];
  }, [viewings, enquiries, landlord, testListing]);
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

  /* What REX confirmed after a save on the Marketing tab, so the readiness
     ticks read the stored advert rather than the book, which can be minutes
     behind. */
  const [saved, setSaved] = useState<{ heading: string | null; body: string | null } | null>(null);

  const shownHeading = saved ? saved.heading : (listing?.advertHeading ?? null);
  const shownBody = saved ? saved.body : (listing?.advertBody ?? null);

  // A different listing is a different write-up: never carry one over.
  useEffect(() => {
    setSaved(null);
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

  /* The view goes back to Home only when a DIFFERENT listing is opened - or
     to the one asked for (?tab=marketing). It used to reset on every fresh
     copy of the same listing, so a book refresh a second after opening threw
     the agent off the view they were sent to (Howard, 1 Oct 2026). */
  const tabFor = useRef<string | null>(null);
  useEffect(() => {
    if (!listing) {
      tabFor.current = null;
      return;
    }
    if (tabFor.current !== String(listing.id)) {
      tabFor.current = String(listing.id);
      const asked = askedTab(initialTab);
      if (newLook) {
        setTab(asked === "marketing" ? "marketing" : null);
        setNlTab(asked && asked !== "marketing" ? asked : "overview");
      } else setTab(asked);
    }
    setBooked([]);
    setHandingOver(false);
    setOffers([]); setTopPick(null); setOffering(false); setReviewing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing]);

  /* ‹ › on the keyboard, as on a Portfolio home - never while typing, or
     while a pop-up is open over the page. */
  useEffect(() => {
    if (!listing || !onStep) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listing, onStep]);

  /* Steve's card on the new Overview asks who has had a passport: the same
     read the Enquiries tab makes, once per set of enquirers. */
  const passportEmails = newLook ? [...new Set((enquiries ?? []).map((e) => (e.email || "").trim().toLowerCase()).filter(Boolean))].sort().join(",") : "";
  useEffect(() => {
    if (!passportEmails) return;
    let gone = false;
    fetch("/api/tenant/passport/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails: passportEmails.split(",") }) })
      .then((r) => r.json())
      .then((j: { ok?: boolean; statuses?: Record<string, { state: string }> }) => !gone && setPassports(j.ok ? j.statuses ?? {} : null))
      .catch(() => !gone && setPassports(null));
    return () => { gone = true; };
  }, [passportEmails]);

  if (!listing) return null;

  /* Every photo when REX gave us them, the single primary when it didn't, and
     an empty set for the drafts — more than half the book has no photo at all,
     so an empty gallery is the normal case, not the broken one. */
  const photos: string[] = [
    ...(listing.images?.length ? listing.images : listing.image ? [listing.image] : []),
    ...uploaded.map((u) => u.url),
  ];

  /**
   * WHAT HAS TO BE IN before "Push to the portals" lights up: the Marketing
   * tab complete (lib/listing-requirements, checked again on the server) and
   * THE EPC.
   *
   * The EPC and nothing else, James 16 Sep 2026: an EPC is required to
   * advertise a home, while the gas safety and the electrical certificate are
   * required before anybody moves in. Holding a listing off the portals for
   * those two stopped lettings that are perfectly legal to advertise. They are
   * still offered here, and they still BLOCK the move-in - lib/deal-handoff
   * keeps all three as blockers on the handover.
   */
  const certOk = (t: string) => certs != null && ["valid", "expiring", "not-required"].includes(certs[t] ?? "");
  const marketingToGo = live ? missingForPortals(inputFromDetails(live)).length : null;
  const requirements: { id: string; label: string; done: boolean; fix: () => void }[] = [
    {
      id: "marketing",
      label: marketingToGo == null ? "Marketing" : marketingToGo === 0 ? "Marketing complete" : `Marketing · ${marketingToGo} to go`,
      done: marketingToGo === 0,
      fix: () => goTab("marketing"),
    },
    /* Or on the listing itself, which is where REX keeps an EPC entered with
       the advert and what its own pre-publish check reads (15 Sep 2026: 4
       Williams Court had rating C on the listing and no compliance entry). */
    { id: "epc", label: "EPC filed", done: certOk("epc") || Boolean((live?.epc.expiry ?? listing.epcExpiry) && (live?.epc.expiry ?? listing.epcExpiry)! >= londonToday()) || Boolean(live?.epc.rating), fix: () => setDrop("epc") },
  ];
  /* Offered, never required to advertise - and the move-in will not go
     without them. */
  const beforeMoveIn: { id: string; label: string; done: boolean; fix: () => void }[] = [
    /* No gas supply (19 Oct 2026, lib/home-facts): nothing to hold. */
    { id: "gas", label: home?.noGas ? "No gas supply" : "Gas safety", done: certOk("gas_safety") || Boolean(home?.noGas), fix: () => goTab("compliance") },
    { id: "eicr", label: home?.eic ? "Electrical certificate (EIC)" : "Electrical certificate (EICR)", done: certOk("eicr"), fix: () => goTab("compliance") },
  ];
  const readyToGoLive = certs != null && requirements.every((r) => r.done) && !(pub?.blockers.length);
  const isLive = pub ? pub.status === "published" : listing.publicationStatus === "published";
  /* Withdrawn, leased or sold in the listings system (Lorna Fieldson, 28 Oct
     2026, 15 Egton Street): neither live nor a draft, so it is never offered
     Push to the portals or Take off the market. See WithdrawnBox. */
  const withdrawnHere = Boolean(pub?.status && ["withdrawn", "leased", "sold"].includes(pub.status));
  const isDraft = !isLive && !withdrawnHere;
  /* An offer can only go on a home that is live, not let agreed and has a
     rent - the same test the offer form's save makes (lib/agent-offer). */
  /* This home's viewing slots still to come, from the shared diary. */
  const homeSlots = liveDiary
    .filter((a) => a.kind === "slot" && a.listingId != null && String(a.listingId) === String(listing.id))
    .filter((a) => new Date(apptStartIso(a)).getTime() + a.mins * 60_000 > Date.now())
    .sort((a, b) => apptStartIso(a).localeCompare(apptStartIso(b)));
  /* Each slot with the viewings booked inside it, nested under it (James,
     9 Oct 2026: "show the slot, then the different viewings within the slot").
     The listing's REX list gives the full rows; a booking made a moment ago
     shows from the diary until that list is read again. */
  const slotWindow = (a: (typeof homeSlots)[number]) => {
    const from = new Date(apptStartIso(a)).getTime();
    return { from, to: from + a.mins * 60_000 };
  };
  const slotGroups = homeSlots.map((a) => {
    const { from, to } = slotWindow(a);
    const within = (iso: string) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
    const rows = (viewings?.upcoming ?? []).filter((v) => within(v.startsAt));
    const known = new Set(rows.map((v) => v.id));
    const fresh = liveDiary
      .filter((d) => d.kind === "viewing" && !known.has(d.id))
      .filter((d) => (d.listingId != null && String(d.listingId) === String(listing.id)) || (!!a.where && d.where === a.where))
      .filter((d) => within(apptStartIso(d)))
      .sort((x, y) => apptStartIso(x).localeCompare(apptStartIso(y)));
    return { slot: a, rows, fresh };
  });
  const slotted = new Set(slotGroups.flatMap((g) => g.rows.map((v) => v.id)));
  const looseUpcoming = (viewings?.upcoming ?? []).filter((v) => !slotted.has(v.id));
  const canOffer = isLive && !listing.letAgreed && (listing.rent ?? 0) > 0 && /^-?\d+$/.test(String(listing.id));

  /* The upcoming viewings, for an access request to hang off. */
  const upcomingOptions = (viewings?.upcoming ?? [])
    .filter((v) => !v.cancelled)
    .map((v) => ({ id: v.id, startsAt: v.startsAt, who: v.contacts.map((c) => c.name).join(", ") || v.title }));

  /* What the rent is quoted per: the listing as read now, else the book's. */
  const per = /week/i.test(live?.rentPeriod ?? listing.rentPeriod ?? "") ? "per week" : "pcm";

  /* Never behind what the book already knows: a published listing is at
     viewings at least, a let agreed one at offer accepted, whatever was saved
     before either happened. */
  /* An offer accepted on the home - here or in REX - puts it on Handover
     (22 Oct 2026). It stopped at Offer accepted until somebody pressed
     "Accepted: confirm", so Rhiannon's 12b Cliff Road still said it after the
     tenant had moved in, with no sign of the handover. */
  const offerTaken = Boolean(liveApps?.some((a) => /accept/i.test(a.statusLabel)) || savedOffers?.some((o) => o.status === "accepted"));
  const floor = Math.max(listingStartingStep(listing), offerTaken ? LISTING_TRACK.findIndex((s) => s.id === "handover") : 0);
  const savedAt = LISTING_TRACK.findIndex((s) => s.id === savedStep.at);
  const step = Math.max(floor, savedAt);
  const setStep = (i: number) => {
    const to = Math.min(Math.max(i, floor), LISTING_TRACK.length - 1);
    if (to !== step) saveStep({ at: LISTING_TRACK[to].id });
  };
  const trackHere = LISTING_TRACK[Math.min(step, LISTING_TRACK.length - 1)];
  /* Intro only (lib/intro-only): the let ends at the landlord's yes, so the
     last step says so rather than sending the agent on to Propoly. */
  const here =
    home?.introOnly && trackHere.id === "handover"
      ? {
          ...trackHere,
          title: "Marketing only - nothing more to do",
          detail: "The landlord has agreed the tenant. Invoice the landlord for the marketing; the referencing, the agreement, the deposit and the move-in are theirs.",
        }
      : trackHere;
  const advance = () => setStep(step + 1);

  // What's already happened here, from the shared diary — same entries the
  // calendar shows, filtered to this property.

  /* A viewing still to come, in a diary the OS can move it in. */
  const movable = (v: LiveViewing) => !v.cancelled && new Date(v.startsAt).getTime() > Date.now() && /^(rex|os)-/.test(v.id);
  const changeTime = (v: LiveViewing) => {
    setOpenViewing(null);
    setChangingViewing(
      apptFromViewing(
        {
          id: v.id,
          startsAt: v.startsAt,
          mins: v.mins,
          who: v.contacts.map((c) => c.name).filter(Boolean).join(" and ") || "The applicant",
          email: v.contacts.find((c) => c.email)?.email ?? null,
          phone: v.contacts.find((c) => c.phone)?.phone ?? null,
          agent: v.agent,
          leadId: v.contacts.find((c) => c.leadId)?.leadId ?? null,
          unaccompanied: /unaccompanied/i.test(`${v.type ?? ""} ${v.title}`),
        },
        { address: listing.name, listingId: String(listing.id), propertyId: listing.propertyId ? String(listing.propertyId) : null }
      )
    );
  };

  /* Book more people in straight after this one, with its access. */
  const addAfter = (v: LiveViewing) => {
    setOpenViewing(null);
    setBlockAnchor({
      viewingId: v.id,
      listingId: String(listing.id),
      property: listing.name,
      locality: listing.locality,
      startsAt: v.startsAt,
      minutes: v.mins || 15,
      unaccompanied: /unaccompanied/i.test(`${v.type ?? ""} ${v.title}`),
      who: v.contacts.map((c) => c.name).join(", ") || v.title || "Viewing",
    });
  };

  /* One diary entry, opening out to its details on a click. */
  const viewingRow = (v: LiveViewing, inSlot = false) => {
    const start = new Date(v.startsAt);
    const end = v.endsAt ? new Date(v.endsAt) : null;
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const who = v.contacts.map((c) => c.name).join(", ");
    const past = start.getTime() < Date.now();
    return (
      <li key={v.id} className="flex items-center gap-2 border-b border-line/40 last:border-0">
        {/* The whole row opens the viewing (James, 20 Sep 2026): its details
            and, above all, whether we can get in. */}
        {/* It has to look like it opens (James, 12 Oct 2026: no hover on the
            upcoming viewings, so nobody knew they could be clicked). */}
        <button type="button" onClick={() => setOpenViewing(v.id)} title="Open the viewing" className="group -mx-2 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-accent-soft/50 focus-visible:bg-accent-soft/50">
          {/* In a slot the day is on the slot, so the time alone. */}
          <span className={`${inSlot ? "figures w-12" : "w-28"} shrink-0 text-[11px] text-muted`}>
            {inSlot ? hhmm(start) : `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${hhmm(start)}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] transition-colors group-hover:text-accent-dark group-hover:underline group-hover:underline-offset-2">{who || v.title || "Viewing"}</span>
          <Tag tone={v.cancelled ? "neutral" : past ? (v.feedbackId ? "good" : "accent") : "good"}>
            {v.cancelled ? "Cancelled" : past ? (v.feedbackId ? "Feedback in" : "Viewed") : v.status ?? "Booked"}
          </Tag>
          {/* Whether we can actually get in, on the row - the list is read to
              find the ones that still need chasing (James, 20 Sep 2026). */}
          {!past && !v.cancelled && (() => {
            const r = (access.requests ?? {})[v.id];
            if (access.kind === "vacant") return <Tag tone={access.keysCollected ? "good" : "neutral"}>{access.keysCollected ? "Keys in" : "Keys to collect"}</Tag>;
            if (access.kind === "lockbox") return <Tag tone={access.lockboxCode ? "good" : "accent"}>{access.lockboxCode ? "Lockbox" : "Lockbox code to add"}</Tag>;
            if (!access.kind) return <Tag tone="accent">No access details</Tag>;
            if (r?.grantedAt) return <Tag tone="good">Access confirmed</Tag>;
            return <Tag tone="accent">{r ? "Access asked" : "Access to ask"}</Tag>;
          })()}
          <span aria-hidden className="shrink-0 text-[14px] text-muted/60 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-dark">›</span>
        </button>
        {/* Straight to an offer from someone who has been round (James, 12 Oct
            2026): the offer form, with them already named. Somebody who hasn't
            viewed is offered for from Make an offer instead. */}
        {past && !v.cancelled && canOffer && (
          <button
            type="button"
            title={`Make an offer for ${v.contacts[0]?.name ?? "this viewer"}`}
            onClick={() => {
              const lead = v.contacts.find((c) => c.email) ?? v.contacts[0];
              if (lead?.email) window.location.href = `/offers/new?${new URLSearchParams({ listing: String(listing.id), name: lead.name, email: lead.email })}`;
              else setPickingOfferer(true);
            }}
            className="shrink-0 rounded-full bg-[var(--brown)] px-3 py-1 text-[10.5px] font-semibold text-white transition-opacity hover:opacity-85"
          >
            Offer
          </button>
        )}
        {/* One Edit, and every change inside it (Lianna, 28 Oct 2026: "Can we
            not edit the viewings from the actual listing?"; James, 29 Oct: not
            a row of buttons on the front). */}
        {!past && !v.cancelled && (
          <button
            type="button"
            title="Change the time, add someone after, or cancel"
            onClick={() => setOpenViewing(v.id)}
            className="shrink-0 rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold text-ink transition-colors hover:border-accent-dark hover:text-accent-dark"
          >
            Edit
          </button>
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

  /* Live from REX once it has answered: the book is cached and said Draft
     for minutes after 4 Williams Court went live (15 Sep 2026). */
  const status = listing.letAgreed
    ? { label: "Let agreed", tone: "neutral" as const }
    : withdrawnHere
      ? { label: pub?.status === "withdrawn" ? "Withdrawn" : pub?.status === "leased" ? "Let" : "Sold", tone: "neutral" as const }
      : isLive
      ? { label: "Available", tone: "good" as const }
      : { label: "Draft", tone: "accent" as const };

  /* ── THE LATEST, for the Next up box: the newest enquiries, viewings and
     offers on this home in one short list, each opening its section. ── */
  const latest: { key: string; at: string; icon: string; title: string; sub: string; to: TabKey; hot?: boolean }[] = [];
  for (const e of enquiries ?? []) {
    if (e.receivedAt) latest.push({ key: `enq-${e.id}`, at: e.receivedAt, icon: "target", title: `Enquiry · ${e.name || "Somebody"}`, sub: e.source || "From the portals", to: "enquiries" });
  }
  for (const v of [...(viewings?.upcoming ?? []), ...(viewings?.past ?? [])]) {
    if (v.cancelled) continue;
    const future = new Date(v.startsAt).getTime() > Date.now();
    latest.push({
      key: `view-${v.id}`,
      at: v.startsAt,
      icon: "calendar",
      title: `${future ? "Viewing booked" : "Viewed"} · ${v.contacts.map((c) => c.name).join(", ") || v.title || "Viewing"}`,
      sub: new Date(v.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }),
      to: "viewings",
      hot: !future && !v.feedbackId,
    });
  }
  for (const o of savedOffers ?? []) {
    if (o.at) latest.push({ key: `offer-${o.ref}`, at: o.at, icon: "coin", title: `Offer · ${o.name}`, sub: `${o.amount ? `£${o.amount.toLocaleString("en-GB")} · ` : ""}${o.status === "open" ? "Waiting on a decision" : o.status === "accepted" ? "Accepted" : "Declined"}`, to: "applications", hot: o.status === "open" });
  }
  latest.sort((a, b) => b.at.localeCompare(a.at));
  const reading = enquiries === null || viewings === null || savedOffers === null;

  /* The page's boxes, Portfolio's (James, 12 Oct 2026: "the same layout as
     properties"). White, a fine line, the dashboard's hard-slab hover. */
  const pop =
    "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [&:hover:not(:has(.fixed))]:-translate-x-[3px] [&:hover:not(:has(.fixed))]:-translate-y-[3px] [&:hover:not(:has(.fixed))]:shadow-[6px_6px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]";
  const box = `${pop} rounded-2xl border border-line/70 bg-white`;
  /* The new look titles its blocks rather than labelling them in small caps. */
  const eyebrow = newLook ? "nl-block-title" : "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
  const chip = "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-white px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40";
  /* One row each - the icon beside the words - so eight fit level with the
     photo (James, 12 Oct 2026: one page). */
  /* Portfolio's tile (James, 12 Oct 2026: consistent across the tabs): the
     icon top left, the words at the foot, so a tall tile still reads. */
  const tile = "relative flex h-full min-h-[72px] w-full flex-col items-start justify-between gap-2 rounded-xl border border-line/60 bg-white p-3.5 text-left text-[12.5px] font-semibold leading-tight transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))] disabled:pointer-events-none disabled:opacity-40";
  const tileText = (label: string, what: string) => (
    <span className="block w-full min-w-0">
      <span className="block">{label}</span>
      <span className="mt-0.5 line-clamp-2 block text-[11.5px] font-normal leading-snug text-muted">{what}</span>
    </span>
  );
  /* A button as wide as its words: the dark icon, then the label. */
  const pill = "inline-flex items-center gap-2.5 rounded-full border border-line/60 bg-white py-1.5 pl-1.5 pr-4 text-[12.5px] font-semibold transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]";
  /* Green for getting people in - Book a viewing, Make an offer, Request
     access - and brown for the rest (James, 12 Oct 2026: "to liven this up"). */
  const pillIcon = (name: string, green = false) => (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: green ? SAGE_INK : "var(--brown)" }}><DoodleIcon name={name} size={13} /></span>
  );
  const tileIcon = (name: string, dark: boolean | "green" = false) => (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${dark ? "text-white" : "bg-accent-soft text-accent-dark"}`}
      style={dark ? { background: dark === "green" ? SAGE_INK : "var(--brown)" } : undefined}
    >
      <DoodleIcon name={name} size={14} />
    </span>
  );
  const shots = photos;
  const dayOf = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const missingWords = (() => {
    const words: Record<string, string> = { marketing: "the Marketing section is complete", epc: "the EPC is filed" };
    const m = [...requirements.filter((r) => !r.done).map((r) => words[r.id] ?? r.label), ...(pub?.blockers.length && requirements.every((r) => r.done) ? ["the portals' own checks pass"] : [])];
    return m.length > 1 ? `${m.slice(0, -1).join(", ")} and ${m[m.length - 1]}` : m[0] ?? "the certificates are read";
  })();
  const pushLive = () => {
    if (!readyToGoLive) return goTab(requirements.find((r) => !r.done)?.id === "epc" ? "compliance" : "marketing");
    if (!publishCanPress) return setPortalNote(lockedSentence(publishArea, publishLevel));
    setPushError(null);
    setPushing(-1);
  };
  /* Drafts only - the link says "File this draft away". Read off isLive (REX's
     own answer) rather than the book's copy, which still said draft straight
     after a push, so a live listing showed it (James, 13 Oct 2026, E2E walk). */
  const canFileAway = Boolean(onArchive) && (listing.archived || (!listing.letAgreed && !isLive)) && listing.archiveReason !== "withdrawn";
  const facts = (() => {
    const wait = live ? null : liveFailed ? "Did not load" : "Reading…";
    const set = (v: string | number | null | undefined) => wait ?? (v == null || v === "" ? "Not set" : String(v));
    const availableFrom = live ? live.availableFrom : listing.availableFrom;
    const epc = live?.epc.expiry ?? listing.epcExpiry;
    return [
      { icon: "home", label: "Type", text: set(live?.propertyType) },
      { icon: "bed.png", label: "Bedrooms", text: set(live?.beds) },
      { icon: "pack/house", label: "Bathrooms", text: set(live?.baths) },
      { icon: "coin", label: "Deposit", text: set(live?.deposit != null ? `£${live.deposit.toLocaleString("en-GB")}` : null) },
      { icon: "calendar", label: "Available from", text: availableFrom ? dayOf(availableFrom) : "Now" },
      { icon: "shield", label: "EPC expires", text: epc ? dayOf(epc) : "Not recorded" },
      { icon: "clock", label: "On the market", text: listing.daysOnMarket != null ? `${listing.daysOnMarket} day${listing.daysOnMarket === 1 ? "" : "s"}` : "Not yet" },
      { icon: "pack/photo", label: "Photos", text: `${photos.length} on file` },
      { icon: "home", label: "Type of let", text: home ? LET_TYPES.find((t) => t.value === home.letType)?.label ?? "Not set" : homeProblem ? "Did not load" : "Reading…" },
      /* Intro only is chosen here (16 Oct 2026, lib/intro-only); the rest is the listing's own. */
      { icon: "home", label: "Service", text: home?.introOnly ? "Marketing only" : live ? (live.serviceOnRecord ?? live.service ?? "Not set") : wait ?? "Not set" },
    ];
  })();

  const highlights = facts.filter((f) => ["Type", "Type of let", "Service", "Bedrooms", "Bathrooms", "Deposit", "Available from"].includes(f.label));
  const introOnly = Boolean(home?.introOnly);
  const quietFact = (t: string) => ["Not set", "Not recorded", "Reading…", "Did not load"].includes(t);
  /* What each pop-out holds, said on its tile. */
  const tileSub: Record<TabKey, string> = {
    viewings: viewings === null ? "Reading…" : `${viewings.upcoming.length + booked.length} booked · ${viewings.past.length} done`,
    enquiries: enquiries === null ? "Reading…" : `${enquirers} ${enquirers === 1 ? "person" : "people"}`,
    applications: savedOffers === null ? "Reading…" : openOffers ? `${openOffers} to decide` : `${savedOffers.length} so far`,
    marketing: marketingToGo == null ? "Facts, write-up, photos" : marketingToGo === 0 ? "Complete" : `${marketingToGo} to fill in`,
    compliance: introOnly ? (termsKnown && !termsOnFile ? "Terms to add" : "The landlord's, marketing only") : certs === null ? "Reading…" : certOk("epc") && (certOk("gas_safety") || home?.noGas) && certOk("eicr") ? (termsKnown && !termsOnFile ? "Terms to add" : "Certificates and papers") : /let\s*only|tenant\s*find/i.test(live?.service ?? "") ? "Copies from the landlord" : "Certificates to add",
    portals: pub && !pub.onPortals ? "Off for now" : "Live adverts, how they do",
  };
  const needsOf: Record<TabKey, boolean> = {
    viewings:
      (viewings?.upcoming ?? []).some((v) => !v.cancelled && access.kind && !selfAccess(access.kind) && !(access.requests ?? {})[v.id]?.grantedAt) ||
      (viewings?.past ?? []).some((v) => !v.cancelled && !v.feedbackId),
    enquiries: (enquiries?.length ?? 0) > 0,
    applications: openOffers > 0,
    marketing: photos.length === 0 || !shownBody,
    compliance: (!introOnly && certs != null && !(certOk("epc") && (certOk("gas_safety") || home?.noGas) && certOk("eicr"))) || (termsKnown && !termsOnFile),
    portals: false,
  };
  const countOf: Partial<Record<TabKey, number>> = {
    viewings: booked.length + (viewings?.upcoming.length ?? 0),
    enquiries: enquirers,
    applications: openOffers,
  };
  const sectionTile = (k: TabKey) => {
    const t = TABS.find((x) => x.key === k)!;
    const n = countOf[k] ?? 0;
    return (
      <button key={k} type="button" data-steve={`listing.tab.${k}`} onClick={() => pickTab(k)} className={tile}>
        {tileIcon(t.icon)}
        {tileText(t.label, tileSub[k])}
        {n > 0 && <span className="figures absolute right-3 top-3.5 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent-dark">{n}</span>}
        {needsOf[k] && <span aria-label="Needs attention" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent" />}
      </button>
    );
  };
  const openTab = tab ? TABS.find((x) => x.key === tab) ?? null : null;
  /* Edit the advert in the new look (lib/new-look "advert", 23 Oct 2026): its
     own drawer, drawn instead of the Marketing pop-out on either page while
     the switch is on. Off, nothing below changes. Same reads, same save. */
  const advertDrawer =
    advertLook === true && tab === "marketing" ? (
      <EditAdvert
        listingId={String(listing.id)}
        address={[listing.name, listing.locality].filter(Boolean).join(", ")}
        propertyId={listing.propertyId ? String(listing.propertyId) : null}
        onAddress={onAddress}
        initial={live && liveLocks ? { details: live, locks: liveLocks } : null}
        canEdit={editCanPress}
        lockedNote={editCanPress ? null : lockedSentence(editArea, editLevel)}
        onSaved={(d) => {
          setLive(d);
          setSaved({ heading: d.heading || null, body: d.body || null });
          setPub((cur) => (cur ? { ...cur, status: GONE_STATES.has(cur.status ?? "") ? cur.status : d.status, blockers: [...new Set([...d.blockers.publish, ...d.blockers.portals])] } : cur));
        }}
        onClose={closeTab}
        live={isLive}
        publish={
          isDraft && !listing.letAgreed && !publishHidden
            ? { ready: readyToGoLive, why: missingWords, onPress: () => { closeTab(); pushLive(); } }
            : null
        }
      />
    ) : null;

  /* The pieces both layouts draw (lib/new-look "listing", 23 Oct 2026): the
     sections, the pop-ups over the page, the landlord, how we get in and where
     it's up to. One copy each, so the old page and the new can never drift on
     what a button does. */
  const sectionBody = (t: TabKey) => (
    <>
            {t === "applications" && (LISTING_OFFERS_LIVE || canOffer) && (
              <div className="mb-4">
                <PressButton
                  onClick={() => (LISTING_OFFERS_LIVE ? setOffering(true) : setPickingOfferer(true))}
                  className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-page"
                >
                  <DoodleIcon name="coin" size={14} />
                  Make New Offer
                </PressButton>
              </div>
            )}
                                                {/* Where the advert is, once it is live (James, 8 Oct 2026: off the
                home screen, under Marketing's top). */}
            {t === "portals" && Number(listing.id) > 0 && (withdrawnHere || listing.letAgreed || listing.archiveReason === "withdrawn") && (
              <div className="mb-5">
                <WithdrawnBox listingId={String(listing.id)} address={listing.name} onChanged={() => { setActivityKey((k) => k + 1); reloadPub(); }} />
              </div>
            )}
            {t === "portals" && (listing.publishedAt || isLive) && (
              <section className="mb-5 rounded-xl border border-line/50 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {listing.publishedAt && (
                    <span className="mr-1 text-[12px] font-semibold">
                      Live since {new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  {/* On and off the portals, once it is published. Its own
                      switch decides who may press it (lib/area-map). */}
                  {isLive && pub && !publishHidden && (
                    portalConfirm ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line/60 bg-white py-1 pl-3 pr-1 text-[11px]" data-steve-never>
                        {pub.onPortals ? "Take it off Rightmove, OnTheMarket and Zoopla?" : "Put it back on Rightmove, OnTheMarket and Zoopla?"}
                        <button type="button" disabled={portalBusy} onClick={() => setPortalConfirm(false)} className="rounded-full px-2 py-0.5 text-muted hover:text-ink disabled:opacity-50">
                          Not yet
                        </button>
                        <button
                          type="button"
                          disabled={portalBusy}
                          onClick={() => void flipPortals(pub.onPortals ? "off" : "on")}
                          className="rounded-full bg-[var(--brown)] px-2.5 py-0.5 font-semibold text-white disabled:opacity-60"
                        >
                          {portalBusy ? "Telling the portals…" : pub.onPortals ? "Yes, take it off" : "Yes, put it back"}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-steve-never
                        onClick={() => (publishCanPress ? setPortalConfirm(true) : setPortalNote(lockedSentence(publishArea, publishLevel)))}
                        className="press-ring rounded-full border border-line/60 bg-white px-2.5 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40"
                      >
                        {pub.onPortals ? "Take off the portals" : "Put back on the portals"}
                      </button>
                    )
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
                {portalNote && <p className="mt-2 text-[11.5px] leading-snug text-muted">{portalNote}</p>}
                {portalRetry && <div className="mt-2"><SignInAgain compact doing={portalRetry === "off" ? "take it off the market" : "put it back on the market"} onDone={() => void flipPortals(portalRetry)} /></div>}
              </section>
            )}
                                    {t === "enquiries" &&
              (enquiries === null ? (
                <p className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted">
                  <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                  Reading the enquiries&hellip;
                </p>
              ) : (
                <ListingEnquiries
                  enquiries={enquiries}
                  listingId={listing.id}
                  propertyId={listing.propertyId ? String(listing.propertyId) : null}
                  home={[listing.name, listing.locality].filter(Boolean).join(", ")}
                  letDone={!listing.archived && (listing.letAgreed || offerTaken)}
                />
              ))}
            {t === "applications" && (
              /* One column that may shrink: a long name or link inside a card
                 otherwise widens the grid past a phone's edge. */
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
                {/* Every offer on this listing, with Accept and Decline (7 Oct 2026). */}
                <Card title="Offers" icon="coin">
                  {!LISTING_OFFERS_LIVE ? (
                    <ListingOffers offers={savedOffers} canOffer={canOffer} onChanged={() => setOffersTick((n) => n + 1)} asking={per === "pcm" ? listing.rent ?? null : null} home={listing.name} listingId={String(listing.id)} initialOpen={initialOffer ?? null} rexUnread={offersRexUnread} />
                  ) : offers.length ? (
                    <ul className="space-y-3">
                      {offers.map((o, i) => (
                        <li key={i} className="rounded-2xl border border-line/50 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="hand text-[13.5px]">
                              {o.tenants.map((t) => t.name).join(" & ")}
                            </span>
                            <span className="figures text-[14px] text-accent-dark">
                              £{o.rent}<span className="text-[10px] text-muted"> {per}</span>
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
                      No offers yet. They land here as viewings happen.<br />
                      The record doesn&apos;t move on until the viewings stop.
                    </p>
                  )}
                </Card>
                {/* The offer link, to copy or send (Howard, 1 Oct 2026; the offer link 7 Oct). */}
                <ApplicationFormCard listingId={String(listing.id)} />
              </div>
            )}

            {t === "viewings" && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
                <div className="space-y-4">
                  <Card
                    title="Upcoming viewings"
                    icon="calendar"
                    action={
                      LISTING_BOOKER_LIVE ? (
                        <span className="flex flex-wrap justify-end gap-2">
                          <PressButton
                            onClick={() => setSlotting(true)}
                            className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-3.5 py-2 text-[11.5px] font-semibold"
                          >
                            <DoodleIcon name="clock" size={13} />
                            Book a slot
                          </PressButton>
                          <PressButton
                            onClick={() => setBooking(true)}
                            className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-3.5 py-2 text-[11.5px] font-semibold"
                          >
                            <DoodleIcon name="calendar" size={13} />
                            Book a viewing
                          </PressButton>
                        </span>
                      ) : undefined
                    }
                  >
                    {/* The slots held at this home, each with the viewings
                        booked inside it listed underneath (9 Oct 2026). */}
                    {slotGroups.length > 0 && (
                      <ul className="mb-3 space-y-3">
                        {slotGroups.map(({ slot: a, rows, fresh }) => {
                          const startIso = apptStartIso(a);
                          const { to } = slotWindow(a);
                          const endHm = new Date(to).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
                          const count = rows.filter((v) => !v.cancelled).length + fresh.length;
                          return (
                            <li key={a.id} className="rounded-2xl border border-dashed border-accent-dark/50 bg-accent-soft/30 p-2">
                              <div className="flex flex-wrap items-center gap-3 px-1.5 py-1">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-accent-dark">
                                  <DoodleIcon name="clock" size={14} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[12.5px] font-semibold">
                                    Viewing slot · {new Date(startIso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" })}, {a.start}-{endHm}
                                  </span>
                                  <span className="block text-[11px] text-muted">
                                    {viewings === null ? "Reading who is booked in it…" : count ? `${count} ${count === 1 ? "viewing" : "viewings"} booked in it` : "Nobody booked in it yet"}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBlockAnchor({ viewingId: a.id, listingId: String(listing.id), property: listing.name, locality: listing.locality, startsAt: startIso, minutes: a.mins, slot: true })
                                  }
                                  className="shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[11.5px] font-semibold text-white"
                                >
                                  Book within slot
                                </button>
                              </div>
                              {rows.length + fresh.length > 0 && (
                                <ul className="mt-2 rounded-xl border border-line/50 bg-white px-3">
                                  {rows.map((v) => viewingRow(v, true))}
                                  {fresh.map((d) => (
                                    <li key={d.id} className="flex items-center gap-3 border-b border-line/40 py-2.5 last:border-0">
                                      <span className="figures w-12 shrink-0 text-[11px] text-muted">{d.start}</span>
                                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{d.who || "Viewer"}</span>
                                      <Tag tone="good">Booked</Tag>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {looseUpcoming.length + booked.length > 0 ? (
                      <ul>
                        {looseUpcoming.map((v) => viewingRow(v))}
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
                    ) : slotGroups.length ? null : (
                      <p className="py-4 text-center text-[12px] text-muted">Nothing in the diary yet.</p>
                    )}
                  </Card>

                  <Card title={viewings?.past.length ? `Past viewings · ${viewings.past.length}` : "Past viewings"} icon="clock">
                    {viewings?.past.length ? (
                      <ul>{viewings.past.slice(0, 20).map((v) => viewingRow(v))}{viewings.past.length > 20 && <li className="pt-2 text-[11px] text-muted">{viewings.past.length - 20} earlier, kept on file.</li>}</ul>
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

            {t === "marketing" && (
              <div className="mb-4 rounded-xl border border-line/50 bg-white p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted">The address</p>
                <p className="mt-1 text-[14px] text-ink">{[listing.name, listing.locality].filter(Boolean).join(", ")}</p>
                <OsAddressLine compact propertyId={listing.propertyId ? String(listing.propertyId) : null} listingId={String(listing.id)} shown={[listing.name, listing.locality].filter(Boolean).join(", ")} onChanged={onAddress} />
              </div>
            )}
            {t === "marketing" && (
              <ListingMarketing
                listingId={String(listing.id)}
                initial={live && liveLocks ? { details: live, locks: liveLocks } : null}
                name={listing.name}
                locality={listing.locality ?? null}
                canEdit={editCanPress}
                lockedNote={editCanPress ? null : lockedSentence(editArea, editLevel)}
                onSaved={(d) => {
                  setLive(d);
                  setSaved({ heading: d.heading || null, body: d.body || null });
                  setPub((cur) => (cur ? { ...cur, status: GONE_STATES.has(cur.status ?? "") ? cur.status : d.status, blockers: [...new Set([...d.blockers.publish, ...d.blockers.portals])] } : cur));
                }}
              />
            )}
            {/* How the advert is doing, only where there IS an advert. */}
            {/* How it is doing against every other live home (12 Oct 2026). */}
            {t === "portals" && isLive && (
              <div className="mt-5">
                <PortalMarket listingId={String(listing.id)} />
              </div>
            )}

            {t === "compliance" && (
              <div className="space-y-5">
                {!requirements.find((r) => r.id === "epc")?.done && (
                  <button
                    type="button"
                    onClick={() => setDrop("epc")}
                    className="flex w-full items-center gap-4 rounded-xl border border-accent/60 bg-accent-soft/50 p-5 text-left transition-colors hover:bg-accent-soft/80"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-accent-dark"><DoodleIcon name="shield" size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="hand block text-[17px]">File the EPC</span>
                      <span className="block text-[12.5px] text-muted">No EPC is recorded on this home. Drop the certificate and we read the rating and the dates off it.</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white">Drop it here</span>
                  </button>
                )}
                {/* One section, not four (James, 12 Oct 2026). */}
                <ListingCompliance
                  key={`file-${drop ?? "x"}`}
                  listingId={String(listing.id)}
                  propertyId={listing.propertyId ?? null}
                  name={listing.name}
                  address={[listing.name, listing.locality].filter(Boolean).join(", ")}
                  home={home}
                  terms={terms}
                  landlord={{
                    contactId: link?.landlord?.contactId ?? null,
                    /* The real landlord only - never a guessed name on a contract. */
                    name: landlord.status === "known" ? landlord.landlord.name : undefined,
                    email: landlord.status === "known" ? (landlord.landlord.email ?? undefined) : undefined,
                    phone: landlord.status === "known" ? (landlord.landlord.phone ?? undefined) : undefined,
                  }}
                  agentLarn={live?.agentLarn ?? null}
                  service={live?.service ?? null}
                  homeProblem={homeProblem}
                  landlordRegistration={live?.record.landlordRegistration ?? null}
                  letOnly={/let\s*only|tenant\s*find/i.test(live?.service ?? "")}
                  introOnly={introOnly}
                  onHomeChanged={reloadHome}
                />
                <div className="rounded-[22px] border border-line/50 bg-white p-5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">How we get in</p>
                  <p className="mt-1 mb-4 text-[12.5px] text-muted">Vacant, through the tenant, or through the landlord. The access button on the record follows this.</p>
                  <AccessSettings
                    value={access}
                    onChange={setAccess}
                    tenant={listing.tenant ?? null}
                    landlord={landlord.status === "known" ? landlord.landlord : null}
                  />
                </div>
              </div>
            )}
    </>
  );

  const overlays = (
    <>
      {/* Book a viewing: one viewing, or a slot to book viewings into. */}
      {choosingBook && (
        <SmallModal title="Book a viewing" onClose={() => setChoosingBook(false)}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button type="button" onClick={() => { setChoosingBook(false); setBooking(true); }} className={`${tile} min-h-[84px]`}>
              {tileIcon("calendar", true)}
              {tileText("Book a viewing", "One viewing, straight into the diary, with access asked.")}
            </button>
            <button type="button" onClick={() => { setChoosingBook(false); setSlotting(true); }} className={`${tile} min-h-[84px]`}>
              {tileIcon("clock", true)}
              {tileText("Hold a viewing slot", "Hold time at the home, then book viewings within it.")}
            </button>
          </div>
        </SmallModal>
      )}

      {/* How we get in, changed from the access details. */}
      {editingAccess && (
        <SmallModal title="How do we get in?" onClose={() => setEditingAccess(false)}>
          <AccessSettings
            value={access}
            onChange={setAccess}
            tenant={listing.tenant ?? null}
            landlord={landlord.status === "known" ? landlord.landlord : null}
            onDone={() => setEditingAccess(false)}
          />
        </SmallModal>
      )}


      {/* Notes and the landlord's messages, pulled out over the page. */}
      <div className={`fixed inset-0 z-[130] ${panelTab ? "" : "pointer-events-none"}`} aria-hidden={!panelTab}>
        <button type="button" aria-label="Close" tabIndex={panelTab ? 0 : -1} onClick={() => setPanelTab(null)} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${panelTab ? "opacity-100" : "opacity-0"}`} />
        <aside
          className={`absolute inset-y-0 right-0 w-full max-w-[460px] overflow-hidden bg-card transition-transform duration-[380ms] sm:rounded-l-2xl ${panelTab ? "translate-x-0 shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)]" : "translate-x-full"}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          {panelTab && (
            <RecordSidePanel
              name={landlord.status === "known" && landlord.landlord.name ? landlord.landlord.name.split(" ")[0] : listing.name}
              tab={panelTab}
              onTab={setPanelTab}
              onClose={() => setPanelTab(null)}
              conversationUrl={`/api/listings/${encodeURIComponent(String(listing.id))}/conversation`}
              notes={listingNotes}
              onAddNote={addListingNote}
              notePlaceholder="Add a note about this listing - the landlord, the keys, anything to remember…"
              noteSaid={{ ok: true, text: "Notes stay in the OS, for the whole team." }}
            />
          )}
        </aside>
      </div>

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
                ["Rent agreed", `£${listing.rent?.toLocaleString("en-GB")} ${per}`],
                ["Landlord", landlord.status === "known" ? [landlord.landlord.name, landlord.landlord.phone].filter(Boolean).join(" · ") : "Not recorded"],
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

      <AddToBlock anchor={blockAnchor} onClose={() => setBlockAnchor(null)} />
      <BookSlot
        open={slotting}
        home={{ id: String(listing.id), name: listing.name, locality: listing.locality }}
        onClose={() => setSlotting(false)}
        onBookWithin={(slot) => setBlockAnchor(slot)}
      />

      {pickingOfferer && (
        <OfferWhoPicker
          listingId={String(listing.id)}
          address={[listing.name, listing.locality].filter(Boolean).join(", ")}
          asking={listing.rent ? `£${listing.rent.toLocaleString("en-GB")} ${per}` : ""}
          people={offerPeople}
          loading={viewings === null || enquiries === null}
          onClose={() => setPickingOfferer(false)}
        />
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
                {listing.name} · asking £{listing.rent?.toLocaleString("en-GB")} {per}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Rent offered, {per}
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
                        £{o.rent}<span className="text-[10px] text-muted"> {per}</span>
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

      {/* One viewing, opened from the Viewings tab: its details and access. */}
      {(() => {
        const all = [...(viewings?.upcoming ?? []), ...(viewings?.past ?? [])];
        const v = all.find((x) => x.id === openViewing);
        if (!v) return null;
        return (
          <ViewingSheet
            viewing={{
              id: v.id,
              startsAt: v.startsAt,
              mins: v.mins,
              type: v.type ?? null,
              status: v.status ?? null,
              cancelled: v.cancelled,
              agent: v.agent ?? null,
              description: v.description ?? null,
              feedbackId: v.feedbackId ?? null,
              contacts: v.contacts,
            }}
            address={listing.name}
            propertyId={listing.propertyId ? String(listing.propertyId) : null}
            listingId={String(listing.id)}
            agent={me}
            access={access}
            onAccess={setAccess}
            accessLoading={accessStatus === "loading"}
            tenant={listing.tenant ?? null}
            landlord={landlord.status === "known" ? landlord.landlord : null}
            onApply={(p) => { setOpenViewing(null); applyFor(p); }}
            onChangeTime={movable(v) ? () => changeTime(v) : undefined}
            onAddAfter={movable(v) ? () => addAfter(v) : undefined}
            onCancelled={() => {
              /* Shown as cancelled straight away; the tab's next read agrees. */
              setViewings((cur) => cur && {
                upcoming: cur.upcoming.map((x) => (x.id === v.id ? { ...x, cancelled: true } : x)),
                past: cur.past,
              });
              setOpenViewing(null);
            }}
            onClose={() => setOpenViewing(null)}
          />
        );
      })()}

      <BookViewing
        open={booking}
        onClose={() => setBooking(false)}
        home={{ id: String(listing.id), name: listing.name, locality: listing.locality, rent: listing.rent, image: listing.image, propertyId: listing.propertyId ?? null }}
        occupant={listing.tenant ?? null}
        onBooked={(v) => setBooked((cur) => [{ when: v.when, who: v.who }, ...cur])}
        /* Already booked in here, so the agent moved that one instead: read the tab again. */
        onMoved={() => setActivityKey((k) => k + 1)}
      />
      {changingViewing && (
        <ChangeViewing
          appt={changingViewing}
          onClose={() => setChangingViewing(null)}
          onChanged={() => setActivityKey((k) => k + 1)}
        />
      )}
      {lightbox != null && <PhotoLightbox photos={photos} start={lightbox} name={listing.name} onClose={() => setLightbox(null)} />}
      {pushing != null && (
        <PushCeremony
          at={pushing}
          address={listing.name}
          error={pushError}
          signIn={pushSignIn}
          onStart={() => void startPush()}
          onCancel={() => {
            setPushing(null);
            setPushError(null);
          }}
          onDone={() => {
            setPushing(null);
            advance();
          }}
        />
      )}
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
    </>
  );

  /* The landlord's people, for the section and for Edit landlord's stage. */
  const where = { listingId: String(listing.id), propertyId: listing.propertyId ?? null, address: [listing.name, listing.locality].filter(Boolean).join(", ") };
  const l = landlord.status === "known" ? landlord.landlord : null;
  const lHomeKey = testListing ? null : listing.propertyId ?? `listing:${listing.id}`;
  const lReadOnly = testListing ? "A test listing keeps its own landlord." : null;
  const lMain = (
                      landlord.status === "loading" || landlord.status === "idle"
                        ? null
                        : l && l.from !== "os"
                          ? [{
                              key: l.contactId ?? `record:${l.name}`,
                              name: l.name,
                              email: l.email,
                              phone: l.phone,
                              /* REX's owner changes in REX; the home's own record on the record. */
                              personRef: l.contactId && l.from !== "record" ? `rex:${l.contactId}` : listing.propertyId ? `home:${listing.propertyId}` : null,
                              note: l.from === "record" ? "From the home's record in the OS. Not on this listing in REX yet." : null,
                            }]
                          : []
  );
  const lMainSlot = (
                      l && l.from === "os" ? (
                        /* Changed in the OS to a company, an estate or a new owner (Dan
                           Richards, 17 Oct 2026): what kind, who it was, Undo, the papers. */
                        <ListingChangedLandlord listingId={where.listingId} propertyId={where.propertyId} address={where.address} onChanged={() => setLandlordRev((n) => n + 1)} />
                      ) : undefined
  );
  const lMainProblem = landlord.status === "problem" ? landlord.says : null;
  const lMainAction = (
                      !testListing && landlord.status !== "loading" && landlord.status !== "idle" ? (
                        <ChangeLandlordButton
                          where={where}
                          current={l ? { name: l.name, email: l.email, phone: l.phone } : null}
                          className="mt-2 text-[12px] font-semibold text-ink underline"
                          onChanged={() => setLandlordRev((n) => n + 1)}
                        />
                      ) : null
  );
  const landlordBlock = (
    <HomeLandlords
      homeKey={lHomeKey}
      address={where.address}
      readOnly={lReadOnly}
      requireOne={landlord.status !== "problem"}
      main={lMain}
      mainSlot={lMainSlot}
      mainProblem={lMainProblem}
      mainAction={lMainAction}
      onChanged={() => setLandlordRev((n) => n + 1)}
    />
  );

  const accessBlock = (
    <>
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <p className={eyebrow}>Access</p>
                {access.kind && (
                  <button type="button" onClick={() => setEditingAccess(true)} className="text-[11.5px] font-semibold text-accent-dark hover:underline">Change</button>
                )}
              </div>
              {accessStatus === "loading" ? (
                <p className="text-[12px] text-muted">Reading…</p>
              ) : !access.kind ? (
                <div>
                  <p className="text-[12.5px] text-muted">Not recorded yet: vacant, through the tenant, through the landlord, or a lockbox.</p>
                  <button type="button" onClick={() => setEditingAccess(true)} className="mt-2.5 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40">
                    Choose how we get in
                  </button>
                </div>
              ) : access.kind === "vacant" ? (
                <div className="text-[13px]">
                  <p className="font-semibold">Vacant</p>
                  <p className="mt-0.5 text-[12px] text-muted">{access.keysCollected ? "The keys are in the office." : "The keys still need collecting."}</p>
                </div>
              ) : access.kind === "lockbox" ? (
                <div className="text-[13px]">
                  <p className="font-semibold">Lockbox</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {access.lockboxCode ? <>Code <b className="font-semibold text-ink">{access.lockboxCode}</b></> : "No code recorded yet."}
                    {access.lockboxWhere ? ` · ${access.lockboxWhere}` : ""}
                  </p>
                </div>
              ) : access.kind === "tenant" ? (
                <div className="text-[13px]">
                  <p className="mb-1.5 font-semibold">Through the tenant</p>
                  {listing.tenant ? (
                    <ContactBlock
                      className="max-w-[440px]"
                      role="tenant"
                      person={{ name: listing.tenant.name, email: listing.tenant.email || null, phone: listing.tenant.phone || null }}
                      personRef={null}
                    />
                  ) : (
                    <p className="text-[12px] text-muted">No tenant is on the record for this home.</p>
                  )}
                </div>
              ) : (
                <div className="text-[13px]">
                  <p className="font-semibold">Through the landlord</p>
                  <p className="mt-0.5 text-[12px] text-muted">Their details are on the left.</p>
                </div>
              )}
              {/* Asking them, or the keys, once we know how we get in. */}
              {accessStatus !== "loading" && access.kind && (
                <div className="mt-3">
                  <AccessRequest
                    value={access}
                    onChange={setAccess}
                    address={listing.name}
                    agent={me}
                    tenant={listing.tenant ?? null}
                    landlord={landlord.status === "known" ? landlord.landlord : null}
                    viewings={upcomingOptions}
                    onBook={LISTING_BOOKER_LIVE ? () => setBooking(true) : undefined}
                    renderButton={(b) => (
                      <button type="button" onClick={b.press} className={pill}>
                        {pillIcon(b.icon, true)}
                        {access.kind === "vacant" ? (b.keysIn ? "Keys in the office" : "Mark the keys collected") : b.label}
                      </button>
                    )}
                  />
                </div>
              )}
              {listing.tenant && access.kind !== "tenant" && (
                <div className="mt-3 border-t border-line/40 pt-3 text-[13px]">
                  <p className={`${eyebrow} mb-1.5`}>Current tenant</p>
                  <ContactBlock
                    className="max-w-[440px]"
                    role="tenant"
                    person={{ name: listing.tenant.name, email: listing.tenant.email || null, phone: listing.tenant.phone || null }}
                    personRef={null}
                  />
                </div>
              )}
    </>
  );

  const trackNotes = () => {
    const at = Math.min(step, LISTING_TRACK.length - 1);
    const n = (viewings?.upcoming.length ?? 0) + (viewings?.past.length ?? 0) + booked.length;
    const apps = (savedOffers?.length ?? 0) + offers.length;
    const accepted = liveApps?.some((a) => /accept/i.test(a.statusLabel)) || here.id === "accepted" || here.id === "handover";
    const ticks: Record<string, { label: string; done: boolean; detail?: string }[]> = {
      live: [
        ...requirements.map((r) => ({ label: r.label, done: r.done })),
        { label: "Published to the portals", done: isLive, detail: listing.publishedAt ? new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : undefined },
      ],
      viewings: [
        { label: "Enquiries in", done: (enquiries?.length ?? 0) > 0, detail: enquiries?.length ? String(enquiries.length) : undefined },
        { label: "Viewings booked", done: n > 0, detail: n ? String(n) : undefined },
        { label: "Offers in", done: apps > 0, detail: apps ? String(apps) : undefined },
      ],
      offers: [{ label: "Sent to the landlord", done: at > 2 }],
      accepted: [{ label: "Offer accepted", done: Boolean(accepted) }],
      handover: [
        { label: "On Applications as a let", done: accepted },
        /* The let's own end, once it comes (22 Oct 2026). */
        ...(offerTaken ? [{ label: "Moved in", done: Boolean(liveApps?.some((a) => a.movedIn)) }] : []),
      ],
    };
    const cols = { gridTemplateColumns: `repeat(${LISTING_TRACK.length}, minmax(0, 1fr))` };
    /* One short line under each step: done, how far, or what is next. */
    const noteOf = (id: string, i: number) => {
      const list = ticks[id] ?? [];
      if (!list.length) return i === at ? LISTING_TRACK[i].title : "";
      const got = list.filter((t) => t.done);
      if (i < at) return got.map((t) => (t.detail ? `${t.label} ${t.detail}` : t.label)).join(" · ") || "Done";
      if (i > at) return "";
      const next = list.find((t) => !t.done);
      return [got.map((t) => (t.detail ? `${t.label} ${t.detail}` : t.label)).join(" · "), next ? `next: ${next.label.toLowerCase()}` : ""].filter(Boolean).join(" · ");
    };
    return { at, ticks, noteOf, cols };
  };

  const factsAll = facts;
  /* ── THE NEW LOOK (lib/new-look "listing", 23 Oct 2026) ──────────────────
     One record page, as Claude Design drew it: crumb, a head with the two
     jobs that matter (Edit the advert, then the one orange next step) and the
     rest in the three-dot menu; the photo stack beside The Details, which
     edits in place; where it's up to as a plain line; then tabs. Every
     action is the one the old page uses - sectionBody, overlays and the
     handlers above - only the frame is new.

     James, 23 Oct round two: no Next Up box, no small print under the steps,
     no orange dots, the portals' figures behind Preview rather than a tab,
     and each tab drawn the way the design draws it. */
  if (newLook) {
    /* The Details as they stand, as fields. */
    const factsFrom = (): FactsDraft | null =>
      live
        ? {
            rent: listing.rent != null ? String(listing.rent) : "",
            deposit: live.deposit != null ? String(live.deposit) : "",
            availableFrom: live.availableFrom ?? "",
            beds: live.beds != null ? String(live.beds) : "",
            baths: live.baths != null ? String(live.baths) : "",
            councilTaxBand: live.facts.councilTaxBand ?? "",
            propertyTypeId: live.propertyTypeId ?? "",
            furnishing: live.facts.furnishing ?? "",
            letType: home?.letType ?? "",
            introOnly: home?.introOnly ? "intro_only" : "own",
          }
        : null;
    const startFacts = () => {
      setFactsDraft(factsFrom());
      setFactsSave("idle");
      setFactsErr(null);
      setFactsEdit(true);
      loadPropTypes();
    };
    /* One save for the advert's facts (the same PATCH Edit the advert makes,
       behind the same switch), then the OS's own two - type of let and the
       service - each through the call the old page's dropdowns used. */
    const saveFacts = async () => {
      const was = factsFrom();
      const d = factsDraft;
      if (!was || !d) return;
      setFactsSave("saving");
      setFactsErr(null);
      const body: Record<string, unknown> = { id: listing.id };
      const num = (v: string) => (v === "" ? null : Number(v));
      if (d.rent !== was.rent) body.rent = num(d.rent);
      if (d.deposit !== was.deposit) body.deposit = num(d.deposit);
      if (d.availableFrom !== was.availableFrom) body.availableFrom = d.availableFrom || null;
      if (d.beds !== was.beds) body.beds = num(d.beds);
      if (d.baths !== was.baths) body.baths = num(d.baths);
      if (d.councilTaxBand !== was.councilTaxBand) body.councilTaxBand = d.councilTaxBand || null;
      if (d.furnishing !== was.furnishing) body.furnishing = d.furnishing || null;
      if (d.propertyTypeId !== was.propertyTypeId && d.propertyTypeId) body.propertyTypeId = d.propertyTypeId;
      const settle = reporter.begin("The details");
      try {
        if (Object.keys(body).length > 1) {
          const r = await fetch("/api/listings/details", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
          if (j.details) setLive(j.details);
          if (!r.ok || !j.ok) throw new Error(j.error ?? "The details did not save.");
        }
        if (d.letType !== was.letType && d.letType) await setLetType(d.letType as LetType);
        if (d.introOnly !== was.introOnly) await setIntroOnly(d.introOnly === "intro_only");
        settle({ ok: true });
        setFactsSave("done");
        window.setTimeout(() => {
          setFactsEdit(false);
          setFactsSave("idle");
        }, 1700);
      } catch (e) {
        const said = e instanceof Error ? e.message : "The details did not save.";
        settle({ ok: false, problem: said, retry: () => void saveFacts() });
        setFactsErr(said);
        setFactsSave("error");
      }
    };
    const saveDesc = async () => {
      setDescSave("saving");
      setDescErr(null);
      const settle = reporter.begin("Description");
      try {
        const r = await fetch("/api/listings/details", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: listing.id, body: descDraft }) });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: ListingDetails | null };
        if (j.details) {
          setLive(j.details);
          setSaved({ heading: j.details.heading || null, body: j.details.body || null });
        }
        if (!r.ok || !j.ok) throw new Error(j.error ?? "The description did not save.");
        settle({ ok: true });
        setDescSave("done");
        window.setTimeout(() => {
          setDescEdit(false);
          setDescSave("idle");
        }, 1700);
      } catch (e) {
        const said = e instanceof Error ? e.message : "The description did not save.";
        settle({ ok: false, problem: said, retry: () => void saveDesc() });
        setDescErr(said);
        setDescSave("error");
      }
    };
    const tone = listing.letAgreed ? "accent" : isLive ? "good" : "neutral";
    const onPortals = isLive && (pub ? pub.onPortals : true);
    /* Mark as Let Agreed / Back to available: its own switch, then the same people as Take off the market. */
    const letShown = Boolean(isLive && !publishHidden && letTick && (letTick.armed || letTick.rehearse));
    const askLet = () => (publishCanPress ? (setLetNote(null), setPortalConfirm(false), setLetAsk(true)) : setPortalNote(lockedSentence(publishArea, publishLevel)));
    const notesN = listingNotes?.length ?? 0;
    const nlTabs: { id: NlTab; label: string; count?: number | null }[] = [
      { id: "overview", label: "Overview" },
      { id: "enquiries", label: "Enquiries", count: enquiries === null ? null : enquirers || null },
      { id: "viewings", label: "Viewings", count: viewings === null ? null : (viewings.upcoming.length + viewings.past.length + booked.length) || null },
      { id: "applications", label: "Offers", count: savedOffers === null ? null : savedOffers.length || null },
      { id: "compliance", label: "Compliance" },
      { id: "notes", label: "Notes", count: notesN || null },
      { id: "activity", label: "Activity" },
    ];
    const tabIs: NlTab = nlTab === "portals" ? "overview" : nlTabs.some((t) => t.id === nlTab) ? nlTab : "overview";
    const { at: trackAt } = trackNotes();
    const mainIs = isDraft && !listing.letAgreed && !publishHidden ? "push" : LISTING_BOOKER_LIVE && !listing.letAgreed && !withdrawnHere ? "book" : canOffer ? "offer" : null;
    const mainJob =
      mainIs === "push" ? (
        <button type="button" data-steve-never onClick={pushLive} className="nl-btn nl-btn--primary" title={readyToGoLive ? "Goes to Rightmove, OnTheMarket and Zoopla." : `Not until ${missingWords}.`}>
          <Ico name="megaphone" /> Push to the portals
        </button>
      ) : mainIs === "book" ? (
        <button type="button" data-steve="listing.book-slot" onClick={() => setChoosingBook(true)} className="nl-btn nl-btn--primary">
          <Ico name="calendar" /> Book a viewing
        </button>
      ) : mainIs === "offer" ? (
        <button type="button" data-steve="listing.make-offer" onClick={() => setPickingOfferer(true)} className="nl-btn nl-btn--primary">
          <Ico name="coin" /> Make an offer
        </button>
      ) : null;

    /* ── The Details: what it says, and the same panel as fields on Edit ── */
    const fiveWeeks = (rent: number | null) => (rent ? Math.floor(((rent * 12) / 52) * 5) : null);
    const money = (n: number | null | undefined) => (n == null ? "Not set" : `£${n.toLocaleString("en-GB")}`);
    const epcShown = live?.epc.band ?? live?.epc.rating ?? null;
    const epcExpiry = live?.epc.expiry ?? listing.epcExpiry;
    const availableShown = (() => {
      const a = live ? live.availableFrom : listing.availableFrom;
      return !a || a <= londonToday() ? "Now" : dayOf(a);
    })();
    const wait = live ? null : liveFailed ? "Did not load" : "Reading…";
    const view: { label: string; text: string }[] = [
      { label: "Rent", text: listing.rent == null ? "Not set" : `£${listing.rent.toLocaleString("en-GB")} ${per}` },
      { label: "Deposit", text: wait ?? money(live?.deposit) },
      { label: "Available", text: availableShown },
      { label: "Bedrooms", text: wait ?? (live?.beds != null ? String(live.beds) : "Not set") },
      { label: "EPC", text: epcShown ?? (epcExpiry ? `Until ${dayOf(epcExpiry)}` : "Not recorded") },
      { label: "Council tax", text: wait ?? (live?.facts.councilTaxBand ? (live.facts.councilTaxBand === "Exempt" ? "Exempt" : `Band ${live.facts.councilTaxBand}`) : "Not set") },
    ];
    const fd = factsDraft;
    const setF = (k: keyof FactsDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFactsDraft((d) => (d ? { ...d, [k]: e.target.value } : d));
    const factsDirty = Boolean(fd && factsFrom() && JSON.stringify(fd) !== JSON.stringify(factsFrom()));
    const editCell = (label: string, input: React.ReactNode, hint?: string) => (
      <div key={label} className="nl-fact">
        <span>{label}{hint && <em> · {hint}</em>}</span>
        <div className="nl-fact-in">{input}</div>
      </div>
    );
    const cap = fd ? fiveWeeks(Number(fd.rent) || null) : null;

    /* ── Overview: what Steve would do next, from what is on this home ── */
    const unsent = passports && enquiries ? enquiries.filter((e) => e.email && (passports[e.email.trim().toLowerCase()]?.state ?? "none") === "none").length : 0;
    const noFeedback = (viewings?.past ?? []).filter((v) => !v.cancelled && !v.feedbackId).length;
    const ideas: { says: string; act: string; go: () => void }[] = [
      ...(openOffers > 0 ? [{ says: `${openOffers === 1 ? "An offer is" : `${openOffers} offers are`} waiting on a decision. Want to put ${openOffers === 1 ? "it" : "them"} to the landlord?`, act: "Show me", go: () => goTab("applications") }] : []),
      ...(isDraft && !listing.letAgreed && marketingToGo ? [{ says: `The advert has ${marketingToGo} ${marketingToGo === 1 ? "thing" : "things"} to fill in before it can go on the portals. Want me to fill it in?`, act: "Open the advert", go: () => pickTab("marketing") }] : []),
      ...(unsent > 0 && !listing.letAgreed ? [{ says: `${unsent} ${unsent === 1 ? "enquiry hasn't" : "enquiries haven't"} had a tenant passport yet. Want me to send them?`, act: "Show me", go: () => goTab("enquiries") }] : []),
      ...(noFeedback > 0 ? [{ says: `${noFeedback} ${noFeedback === 1 ? "viewing has" : "viewings have"} no feedback yet. Worth a call while it's fresh.`, act: "Show me", go: () => goTab("viewings") }] : []),
      ...(photos.length === 0 ? [{ says: "There are no photos on this home yet. The advert won't get far without them.", act: "Add photos", go: () => setDrop("photos") }] : []),
      ...(!introOnly && beforeMoveIn.some((r) => !r.done) && certs !== null ? [{ says: `Before anyone moves in we need ${beforeMoveIn.filter((r) => !r.done).map((r) => r.label.toLowerCase()).join(" and ")}.`, act: "Add it now", go: () => goTab("compliance") }] : []),
    ];
    const idea = ideas[0];
    const ll = landlord.status === "known" ? landlord.landlord : null;
    const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
    const features = (live?.highlights ?? []).filter(Boolean);
    const portalNames = ["Rightmove", "Zoopla", "OnTheMarket"];
    const linkFor = (n: string) => portals.find((p) => p.portal.toLowerCase().replace(/\s/g, "") === n.toLowerCase());

    /* ── Activity: what has happened here, newest first ── */
    const happened: { at: string; text: string; to?: NlTab }[] = [
      ...latest.map((a) => ({ at: a.at, text: a.title.replace(" · ", ": "), to: a.to as NlTab })),
      ...(listingNotes ?? []).map((n) => ({ at: n.at ?? "", text: `${n.author ?? "Someone"} added a note`, to: "notes" as NlTab })),
      ...(listing.publishedAt ? [{ at: listing.publishedAt, text: "Went live on Rightmove, Zoopla and OnTheMarket" }] : []),
    ]
      .filter((h) => h.at)
      .sort((a, b) => b.at.localeCompare(a.at));
    const whenOf = (iso: string) => {
      const d = new Date(iso);
      const today = new Date();
      const same = d.toDateString() === today.toDateString();
      const yest = new Date(today.getTime() - 864e5).toDateString() === d.toDateString();
      const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
      return same ? `Today ${hm}` : yest ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric", timeZone: "Europe/London" });
    };

    /* ── Viewings, as rows on hairlines ── */
    const vrow = (v: LiveViewing, inSlot = false) => {
      const start = new Date(v.startsAt);
      const past = start.getTime() < Date.now();
      const who = v.contacts.map((c) => c.name).join(", ") || v.title || "Viewing";
      const state = v.cancelled ? <Badge tone="neutral">Cancelled</Badge> : past ? (v.feedbackId ? <Badge tone="good">Feedback in</Badge> : <Badge tone="good">Viewed</Badge>) : <Badge tone="info">{v.status ?? "Booked"}</Badge>;
      const accessWord = (() => {
        if (past || v.cancelled) return null;
        const r = (access.requests ?? {})[v.id];
        if (access.kind === "vacant") return access.keysCollected ? null : <Badge tone="warning">Keys to collect</Badge>;
        if (access.kind === "lockbox") return access.lockboxCode ? null : <Badge tone="warning">Lockbox code to add</Badge>;
        if (!access.kind) return <Badge tone="warning">No access details</Badge>;
        if (r?.grantedAt) return null;
        return <Badge tone="warning">{r ? "Access asked" : "Access to ask"}</Badge>;
      })();
      return (
        <li key={v.id} className={v.cancelled ? "is-cancelled" : ""}>
          <span className="nl-vwhen">
            {inSlot ? start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : start.toLocaleDateString("en-GB", { weekday: past ? undefined : "short", day: "numeric", month: "short", timeZone: "Europe/London" })}
            {!inSlot && <span>{start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}</span>}
          </span>
          <button type="button" onClick={() => setOpenViewing(v.id)} className="nl-strong min-w-0 truncate text-left hover:underline">{who}</button>
          <span className="nl-vstate flex flex-wrap justify-end gap-1.5">{state}{accessWord}</span>
          <span className="nl-vacts">
            {past && !v.cancelled && canOffer ? (
              <button
                type="button"
                className="nl-btn nl-btn--secondary nl-btn--sm"
                onClick={() => {
                  const lead = v.contacts.find((c) => c.email) ?? v.contacts[0];
                  if (lead?.email) window.location.href = `/offers/new?${new URLSearchParams({ listing: String(listing.id), name: lead.name, email: lead.email })}`;
                  else setPickingOfferer(true);
                }}
              >
                Record offer
              </button>
            ) : !past && !v.cancelled ? (
              /* One Edit, and every change inside it (Lianna, 28 Oct 2026; James,
                 29 Oct: not a row of buttons on the front). */
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" title="Change the time, add someone after, or cancel" onClick={() => setOpenViewing(v.id)}>Edit</button>
            ) : (
              <button type="button" className="nl-link" onClick={() => setOpenViewing(v.id)}>Open</button>
            )}
          </span>
        </li>
      );
    };

    return (
      <div data-look="new" data-steve="listing.drawer" className="nl-page nl-rise">
        {/* Crumb, the save chip, and ‹ › through the board. */}
        <div className="nl-crumbs">
          <Link href={backHref} className="nl-crumb">
            <Ico name="back" size={14} /> Listings
          </Link>
          <SaveChip scope={saves} className="bg-card" />
          <RexWaitingChip refs={[["listing", listing.id], ["property", listing.propertyId]]} />
          {stepLabel && onStep && (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="nl-mono mr-1">{stepLabel}</span>
              <button type="button" aria-label="Previous listing" onClick={() => onStep(-1)} className="nl-iconbtn nl-iconbtn--sm">‹</button>
              <button type="button" aria-label="Next listing" onClick={() => onStep(1)} className="nl-iconbtn nl-iconbtn--sm">›</button>
            </span>
          )}
        </div>

        {/* The head: where it is, the address, one line of facts, then the jobs. */}
        <div className="nl-rhead">
          <div className="nl-rhead-text">
            <div className="nl-rhead-meta">
              <Badge tone={tone}>{status.label}</Badge>
              {onPortals && (
                <span className="nl-live">
                  <i /> {letTick?.letAgreed ? "Showing Let Agreed" : "On the market"}
                </span>
              )}
              {isLive && pub && !publishHidden && (
                <button type="button" data-steve-never className="nl-market-btn" aria-expanded={portalConfirm} onClick={() => (publishCanPress ? setPortalConfirm((o) => !o) : setPortalNote(lockedSentence(publishArea, publishLevel)))}>
                  {pub.onPortals ? "Take off the market" : "Put back on the market"}
                </button>
              )}
              {letShown && (
                <button type="button" data-steve-never className="nl-market-btn" aria-expanded={letAsk} onClick={() => (letAsk ? setLetAsk(false) : askLet())}>
                  {letTick?.letAgreed ? "Back to available" : "Mark as Let Agreed"}
                </button>
              )}
              {listing.publishedAt && (
                <span className="nl-mono">
                  listed {new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {listing.daysOnMarket != null ? ` · ${listing.daysOnMarket} ${listing.daysOnMarket === 1 ? "day" : "days"}` : ""}
                </span>
              )}
            </div>
            <h1 className="nl-title">{listing.name}</h1>
            <p className="nl-rhead-sub">
              {[listing.locality, live?.beds ? `${live.beds} bed${live.propertyType ? ` ${live.propertyType.toLowerCase()}` : ""}` : live?.propertyType?.toLowerCase(), listing.rent != null ? `£${listing.rent.toLocaleString("en-GB")} ${per}` : "rent not set"].filter(Boolean).join(" · ")}
            </p>
            {/* The same home on Portfolio and Applications (29 Oct 2026). */}
            <HomeSwitch from="listing" listingId={String(listing.id)} propertyId={listing.propertyId ? String(listing.propertyId) : null} address={[listing.name, listing.locality].filter(Boolean).join(", ")} className="mt-4" />
          </div>
          <div className="nl-rhead-acts">
            <button type="button" data-steve="listing.tab.marketing" onClick={() => pickTab("marketing")} className="nl-btn nl-btn--secondary">
              <Ico name="pen" /> Edit the advert
            </button>
            {mainJob}
            <Menu
              items={[
                ...(isLive || listing.publishedAt ? [{ label: "Preview on the portals", onClick: () => setPortalStats(true) }] : []),
                { label: "Mail out to matching tenants", onClick: () => setEmailing(true), steve: "listing.mail-db" },
                ...(mainIs !== "offer" && canOffer ? [{ label: "Make an offer", onClick: () => setPickingOfferer(true), steve: "listing.make-offer" }] : []),
                ...(LISTING_BOOKER_LIVE && mainIs !== "book" && !listing.letAgreed && !withdrawnHere ? [{ label: "Book a viewing", onClick: () => setChoosingBook(true) }] : []),
                ...(LISTING_BOOKER_LIVE && !listing.letAgreed ? [{ label: "Hold a viewing slot", onClick: () => setSlotting(true) }] : []),
                ...(canFileAway ? [{ label: archiveBusy ? "Saving…" : listing.archived ? "Bring back to drafts" : "File this draft away", disabled: archiveBusy, onClick: () => onArchive?.(String(listing.id), listing.archived ? "restore" : "archive") }] : []),
                ...(mainIs === "push" ? [{ label: "Live without Portals", onClick: () => (publishCanPress ? (setQuietNote(null), setQuietAsk(true)) : setPortalNote(lockedSentence(publishArea, publishLevel))) }] : []),
                ...(letShown ? [{ label: letTick?.letAgreed ? "Back to available" : "Mark as Let Agreed", onClick: askLet }] : []),
                ...(isLive && pub && !publishHidden && pub.onPortals ? [{ label: "Take off the market", danger: true, onClick: () => (publishCanPress ? setPortalConfirm(true) : setPortalNote(lockedSentence(publishArea, publishLevel))) }] : []),
              ]}
            />
          </div>
        </div>

        {/* Live without Portals: asked here, under the head. */}
        {quietAsk && isDraft && (
          <div className="nl-confirm" data-steve-never>
            <p>
              Put {listing.name} live without the portals? It moves on to viewings and offers, and stays off Rightmove, OnTheMarket and Zoopla until you put it on them.
            </p>
            <button type="button" disabled={quietBusy} onClick={() => setQuietAsk(false)} className="nl-btn nl-btn--quiet nl-btn--sm">
              Not yet
            </button>
            <button type="button" disabled={quietBusy} onClick={() => void goLiveQuietly()} className="nl-btn nl-btn--sm nl-btn--sage">
              {quietBusy ? "Going live…" : "Go live off the portals"}
            </button>
          </div>
        )}
        {quietNote && <p className={`nl-meta -mt-4 mb-6 ${quietNote.ok ? "text-[var(--sage-ink)]" : "text-[var(--accent-dark)]"}`}>{quietNote.text}</p>}

        {/* Mark as Let Agreed, and back: asked here, under the head. */}
        {letAsk && letShown && letTick && (
          <div className="nl-confirm" data-steve-never>
            <p>
              {letTick.letAgreed
                ? `Put ${listing.name} back to available? The Let Agreed banner comes off Rightmove, OnTheMarket and Zoopla and it shows as available to let again.`
                : letTick.onPortals
                  ? `Show ${listing.name} as Let Agreed? The advert stays on Rightmove, OnTheMarket and Zoopla with their Let Agreed banner, so people can still see it, and you can take it off the market whenever you choose. If the let falls through, Back to available undoes it.`
                  : `Mark ${listing.name} as Let Agreed? It is off the portals just now, so it shows as Let Agreed there if you put it back on the market. Back to available undoes it.`}
            </p>
            <button type="button" disabled={letBusy} onClick={() => setLetAsk(false)} className="nl-btn nl-btn--quiet nl-btn--sm">
              {letTick.letAgreed ? "Keep it let agreed" : "Not yet"}
            </button>
            <button type="button" disabled={letBusy} onClick={() => void markLet(letTick.letAgreed ? "available" : "let_agreed")} className="nl-btn nl-btn--sm nl-btn--sage">
              {letBusy ? "Telling the portals…" : letTick.letAgreed ? "Back to available" : "Mark as Let Agreed"}
            </button>
          </div>
        )}
        {letNote && <p className={`nl-meta -mt-4 mb-6 ${letNote.ok ? "text-[var(--sage-ink)]" : "text-[var(--accent-dark)]"}`}>{letNote.text}</p>}

        {/* On and off the portals: asked here, under the head. */}
        {portalConfirm && isLive && pub && (
          <div className="nl-confirm" data-steve-never>
            <p>
              {pub.onPortals
                ? `Take ${listing.name} off Rightmove, OnTheMarket and Zoopla? It comes off within the hour. Enquiries and viewings already booked stay here.`
                : `Put ${listing.name} back on Rightmove, OnTheMarket and Zoopla?`}
            </p>
            <button type="button" disabled={portalBusy} onClick={() => setPortalConfirm(false)} className="nl-btn nl-btn--quiet nl-btn--sm">
              {pub.onPortals ? "Keep it on" : "Not yet"}
            </button>
            <button type="button" disabled={portalBusy} onClick={() => void flipPortals(pub.onPortals ? "off" : "on")} className={`nl-btn nl-btn--sm ${pub.onPortals ? "nl-btn--danger" : "nl-btn--sage"}`}>
              {portalBusy ? "Telling the portals…" : pub.onPortals ? "Take it off" : "Put it back"}
            </button>
          </div>
        )}
        {Number(listing.id) > 0 && (withdrawnHere || listing.letAgreed || listing.archiveReason === "withdrawn") && (
          <div className="-mt-4 mb-8">
            <WithdrawnBox listingId={String(listing.id)} address={listing.name} onChanged={() => { setActivityKey((k) => k + 1); reloadPub(); }} />
          </div>
        )}
        {portalNote || listing.archived || (!listing.archived && listing.letAgreed && Number(listing.id) > 0) ? (
          <div className="-mt-4 mb-10 space-y-3">
            {/* Every answer to Take off / Put back, not only a locked one (Lorna Fieldson, 28 Oct 2026). */}
            {portalNote && <p className="nl-meta">{portalNote}</p>}
            {portalRetry && <SignInAgain compact doing={portalRetry === "off" ? "take it off the market" : "put it back on the market"} onDone={() => void flipPortals(portalRetry)} />}
            {!listing.archived && listing.letAgreed && Number(listing.id) > 0 && (
              <AdvertOffline
                listingId={String(listing.id)}
                propertyId={listing.propertyId ? String(listing.propertyId) : null}
                address={[listing.name, listing.locality].filter(Boolean).join(", ")}
                letAgreed={letShown ? letTick?.letAgreed ?? null : null}
                onLetAgreed={letShown ? () => { askLet(); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined}
              />
            )}
            {listing.archived && (
              <p className="nl-meta max-w-3xl">
                <span className="font-semibold text-ink">{archiveLabel(listing.archiveReason ?? null)}.</span>{" "}
                {archiveWhy({ archived: true, reason: listing.archiveReason ?? null, since: listing.archivedSince ?? null, ageDays: listing.archiveAgeDays ?? null })} It is out of the Draft tab, still searchable, and the listing itself is unchanged.
              </p>
            )}
          </div>
        ) : null}

        {/* The photo stack beside The Details. */}
        <div className="nl-hero">
          <div className={`nl-hero-photo${gridFrom ? " is-lifted" : ""}`}>
            {shots.length > 1 && <i className="nl-hero-under u2" aria-hidden />}
            {shots.length > 1 && <i className="nl-hero-under u1" aria-hidden />}
            <button
              type="button"
              ref={heroRef}
              className="nl-hero-main"
              onClick={() => (shots.length ? setGridFrom(heroRef.current?.getBoundingClientRect() ?? null) : setDrop("photos"))}
              aria-label={shots.length ? `See all ${shots.length} photos` : "Add photos"}
            >
              {shots.length ? (
                <PropertyPhoto src={shots[0]} alt="" width={1400} height={875} loading="eager" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="nl-hero-empty">
                  <svg width="72" height="56" viewBox="0 0 56 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden><path d="M4 42h48M10 42V20L28 6l18 14v22M23 42V30h10v12" /></svg>
                  No photos yet. Add them.
                </span>
              )}
              {shots.length > 1 && (
                <span className="nl-hero-more">
                  <Ico name="image" size={15} /> +{shots.length - 1} more
                </span>
              )}
            </button>
          </div>

          <section className={`nl-facts${factsEdit ? " is-editing" : ""}`}>
            <div className="nl-facts-head">
              <h3 className="nl-block-title">The Details</h3>
              {factsEdit ? (
                <span className="nl-facts-flag"><i /> Editing</span>
              ) : editCanPress && live && !testListing ? (
                <button type="button" onClick={startFacts} className="nl-link">
                  <Ico name="pen" size={13} /> Edit
                </button>
              ) : null}
            </div>
            {!factsEdit || !fd ? (
              <div className="nl-facts-grid">
                {view.map((f) => (
                  <div key={f.label} className="nl-fact">
                    <span>{f.label}</span>
                    <b className={quietFact(f.text) ? "is-quiet" : ""}>{f.text}</b>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="nl-facts-grid">
                  {editCell("Rent", <span className="nl-fact-money"><i>£</i><input type="number" min={0} value={fd.rent} onChange={setF("rent")} aria-label="Rent" /><i>{per}</i></span>)}
                  {editCell("Deposit", <span className="nl-fact-money"><i>£</i><input type="number" min={0} value={fd.deposit} onChange={setF("deposit")} aria-label="Deposit" /></span>, cap ? `cap ${money(cap)}` : undefined)}
                  {editCell("Available", <input type="date" value={fd.availableFrom} onChange={setF("availableFrom")} aria-label="Available from" />)}
                  {editCell("Bedrooms", <select value={fd.beds} onChange={setF("beds")} aria-label="Bedrooms"><option value="">Not set</option>{Array.from({ length: 11 }, (_, i) => <option key={i} value={String(i)}>{i === 0 ? "Studio" : i}</option>)}</select>)}
                  {editCell("Bathrooms", <select value={fd.baths} onChange={setF("baths")} aria-label="Bathrooms"><option value="">Not set</option>{Array.from({ length: 8 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}</select>)}
                  {editCell("Council tax", <select value={fd.councilTaxBand} onChange={setF("councilTaxBand")} aria-label="Council tax"><option value="">Not set</option>{OPTIONS.councilTaxBand.map((b) => <option key={b} value={b}>{b === "Exempt" ? b : `Band ${b}`}</option>)}</select>)}
                </div>
                <div className="nl-facts-grid more">
                  {editCell("Type", <select value={fd.propertyTypeId} onFocus={loadPropTypes} onMouseDown={loadPropTypes} onChange={setF("propertyTypeId")} aria-label="Type"><option value="">{live?.propertyType ?? "Not set"}</option>{(propTypes ?? []).filter((t) => t.id !== "").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>)}
                  {editCell("Furnishing", <select value={fd.furnishing} onChange={setF("furnishing")} aria-label="Furnishing"><option value="">Not set</option>{OPTIONS.furnishing.map((x) => <option key={x}>{x}</option>)}</select>)}
                  {home && editCell("Type of let", <select value={fd.letType} onChange={setF("letType")} aria-label="Type of let">{LET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>)}
                  {home && live && editCell("Service", <select value={fd.introOnly} onChange={setF("introOnly")} aria-label="Service"><option value="own">{live.serviceOnRecord ?? "As agreed"}</option><option value="intro_only">Marketing only</option></select>)}
                </div>
                {(factsDirty || factsSave !== "idle") && (
                  <div className={`nl-saverow${factsSave === "done" ? " is-done" : factsSave === "error" ? " is-error" : ""}`}>
                    {factsSave === "done" ? (
                      <><SteveFace size={22} mood="happy" /><span>Saved. The portals update within the hour.</span></>
                    ) : factsSave === "error" ? (
                      <span className="min-w-0 flex-1">{factsErr}</span>
                    ) : (
                      <><span className="nl-saverow-dot" /><span>Not saved yet</span></>
                    )}
                    <span className="flex-1" />
                    {factsSave !== "done" && (
                      <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => { setFactsEdit(false); setFactsSave("idle"); }}>Discard</button>
                    )}
                    {factsSave !== "done" && (
                      <button type="button" disabled={factsSave === "saving" || !factsDirty} className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => void saveFacts()}>
                        {factsSave === "saving" ? "Saving…" : "Save changes"}
                      </button>
                    )}
                  </div>
                )}
                {!factsDirty && factsSave === "idle" && (
                  <button type="button" className="nl-link mt-2 self-start" onClick={() => setFactsEdit(false)}>Close without changes</button>
                )}
              </>
            )}
          </section>
        </div>

        {/* Where it's up to: a step each, nothing written under them. */}
        <div className={`nl-progress${graded ? " is-graded" : ""}`} style={{ "--nl-steps": LISTING_TRACK.length } as React.CSSProperties} aria-label="Where it's up to">
          {LISTING_TRACK.map((st, i) => (
            <button
              key={st.id}
              style={{ "--i": i } as React.CSSProperties}
              type="button"
              onClick={() => setStep(i)}
              disabled={i < floor}
              title={i < floor ? `${offerTaken ? "An offer is already accepted" : listing.letAgreed ? "Already let agreed" : "Already on the portals"}, so it cannot go back to ${st.label}` : `Move the record to ${st.label}`}
              className={`nl-step${i < trackAt ? " done" : i === trackAt ? " now" : ""}`}
            >
              <i />
              <span>{st.label}</span>
            </button>
          ))}
        </div>

        <Tabs label="This listing" className="nl-ltabs" value={tabIs} onChange={(t) => pickNl(t)} items={nlTabs} />

        <div key={tabIs} className="nl-pane">
          {tabIs === "overview" && (
            <div className="nl-bento">
              {/* The advert's own words. */}
              <section className="nl-cell span2">
                <div className="nl-cell-head">
                  <h3 className="nl-block-title">Description</h3>
                  {!descEdit && editCanPress && live && !testListing && (
                    <button type="button" className="nl-link" onClick={() => { setDescDraft(live.body ?? ""); setDescEdit(true); setDescSave("idle"); }}>Edit</button>
                  )}
                </div>
                {descEdit ? (
                  <>
                    <textarea className="nl-desc-edit" rows={8} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} aria-label="Description" />
                    {(descDraft !== (live?.body ?? "") || descSave !== "idle") && (
                      <div className={`nl-saverow${descSave === "done" ? " is-done" : descSave === "error" ? " is-error" : ""}`}>
                        {descSave === "done" ? <><SteveFace size={22} mood="happy" /><span>Saved. The portals update within the hour.</span></> : descSave === "error" ? <span className="min-w-0 flex-1">{descErr}</span> : <><span className="nl-saverow-dot" /><span>Not saved yet</span></>}
                        <span className="flex-1" />
                        {descSave !== "done" && <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => { setDescEdit(false); setDescSave("idle"); }}>Discard</button>}
                        {descSave !== "done" && <button type="button" disabled={descSave === "saving"} className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => void saveDesc()}>{descSave === "saving" ? "Saving…" : "Save changes"}</button>}
                      </div>
                    )}
                    {descDraft === (live?.body ?? "") && descSave === "idle" && <button type="button" className="nl-link self-start" onClick={() => setDescEdit(false)}>Close editor</button>}
                  </>
                ) : live === null && !liveFailed ? (
                  <p className="nl-meta">Reading the advert…</p>
                ) : (live?.body ?? shownBody ?? "").trim() ? (
                  <FillText text={(live?.body ?? shownBody ?? "").trim()} />
                ) : (
                  <p className="nl-meta">No description written yet. Edit the advert, or ask Steve to fill it in.</p>
                )}
              </section>

              {/* Where it's advertised; Preview opens how it is doing. */}
              <section className="nl-cell">
                <div className="nl-cell-head">
                  <h3 className="nl-block-title">On the Portals</h3>
                  {(isLive || listing.publishedAt) && <button type="button" className="nl-link" onClick={() => setPortalStats(true)}>Preview</button>}
                </div>
                <ul className="nl-lines">
                  {portalNames.map((n) => {
                    const l = linkFor(n);
                    return (
                      <li key={n}>
                        {l ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 hover:underline">{n}</a> : <span className="flex-1">{n}</span>}
                        {onPortals ? <Badge tone="good" bare>Live</Badge> : <Badge tone="neutral" bare>{isLive ? "Paused" : "Not yet"}</Badge>}
                      </li>
                    );
                  })}
                </ul>
                <div className="nl-mini-stats">
                  <div><b>{enquiries === null ? "…" : enquirers}</b><span className="nl-meta">enquiries</span></div>
                  <div><b>{viewings === null ? "…" : viewings.upcoming.length + viewings.past.filter((v) => !v.cancelled).length + booked.length}</b><span className="nl-meta">viewings</span></div>
                  <div><b>{listing.daysOnMarket ?? "-"}</b><span className="nl-meta">days live</span></div>
                </div>
              </section>

              <section className="nl-cell">
                <h3 className="nl-block-title">Key Features</h3>
                {features.length ? (
                  <ul className="nl-features">
                    {features.slice(0, 6).map((f) => (
                      <li key={f}><Ico name="check" size={14} />{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="nl-meta">{live === null && !liveFailed ? "Reading…" : "None written yet. Add them in Edit the advert."}</p>
                )}
              </section>

              <section className="nl-cell">
                <div className="nl-cell-head">
                  <h3 className="nl-block-title">Landlord</h3>
                  {!testListing && <button type="button" className="nl-link" onClick={() => setLandlordOpen(true)}>Edit</button>}
                </div>
                {landlord.status === "loading" || landlord.status === "idle" ? (
                  <p className="nl-meta">Reading…</p>
                ) : ll ? (
                  <>
                    <div className="nl-person">
                      <span className="nl-avatar">{initialsOf(ll.name || "?")}</span>
                      <span className="min-w-0">
                        <span className="nl-strong block truncate">{ll.name}</span>
                        <span className="nl-meta block">{termsOnFile ? "Terms on file" : termsKnown ? "No terms on file yet" : "Landlord"}</span>
                      </span>
                    </div>
                    <div className="nl-contact">
                      {ll.phone ? <a href={`tel:${ll.phone.replace(/\s/g, "")}`}><Ico name="phone" size={14} />{ll.phone}</a> : <span className="text-muted"><Ico name="phone" size={14} />No mobile on file</span>}
                      {ll.email ? <a href={`mailto:${ll.email}`}><Ico name="mail" size={14} />{ll.email}</a> : <span className="text-muted"><Ico name="mail" size={14} />No email on file</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {ll.phone && <a href={`tel:${ll.phone.replace(/\s/g, "")}`} className="nl-btn nl-btn--secondary nl-btn--sm"><Ico name="phone" size={14} /> Call</a>}
                      <button type="button" className="nl-link" onClick={() => setPanelTab("messages")}>Send update</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="nl-meta">{landlord.status === "problem" ? landlord.says : "No landlord on this listing yet."}</p>
                    {!testListing && <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm self-start" onClick={() => setLandlordOpen(true)}>Add the landlord</button>}
                  </>
                )}
              </section>

              {/* Steve, looking for the handy next thing on this home. */}
              <section className="nl-cell nl-cell--sage nl-steve-cell">
                <div className="flex items-center gap-2"><SteveFace size={30} /><b className="font-[family-name:var(--font-heading)] text-[16px]">Steve</b></div>
                {reading && !idea ? (
                  <p className="text-muted">Having a look…</p>
                ) : idea ? (
                  <>
                    <p>{idea.says}</p>
                    <button type="button" className="nl-btn nl-btn--sage nl-btn--sm mt-auto self-stretch" onClick={idea.go}>{idea.act}</button>
                  </>
                ) : (
                  <p>Nothing needs you on this one right now. Nice.</p>
                )}
              </section>

              {/* How we get in. */}
              <section className="nl-cell">
                <div className="min-w-0">{accessBlock}</div>
              </section>

              {/* The home itself: the address on file, its keys, whose it is. */}
              <section className="nl-cell span2">
                <h3 className="nl-block-title">The Home</h3>
                <OsAddressLine propertyId={listing.propertyId ? String(listing.propertyId) : null} listingId={String(listing.id)} shown={[listing.name, listing.locality].filter(Boolean).join(", ")} onChanged={onAddress} />
                {Number(listing.id) > 0 && listing.propertyId && <HomeKeys propertyId={String(listing.propertyId)} listingId={listing.id} />}
                <div className="flex flex-wrap items-center gap-2">
                  {listing.tenant && <Badge tone="info">Tenanted</Badge>}
                  <ListingOwner listingId={listing.id} />
                  {Number(listing.id) < 0 && <Badge tone="neutral">Test listing - only you can see it</Badge>}
                  {termsKnown && (
                    <button type="button" onClick={() => goTab("compliance")} title="Open Compliance" className="nl-link">
                      {termsOnFile ? "Terms on file" : "No terms on file"}
                    </button>
                  )}
                </div>
              </section>

              {(here.id === "accepted" || here.id === "handover") && link && (
                <section className="nl-cell span3">
                  <h3 className="nl-block-title">The Let</h3>
                  <TenancyLinkPanel value={link} onChange={setLinkState} />
                  {saveLabel(linkSave) && <p className="nl-meta">{saveLabel(linkSave)}</p>}
                  {(() => {
                    const acceptedApp = liveApps?.find((a) => /accept/i.test(a.statusLabel));
                    return acceptedApp ? (
                      <Link href={`/applications/${encodeURIComponent(acceptedApp.id)}`} className="nl-btn nl-btn--sage nl-btn--sm self-start">
                        Open the accepted application <Ico name="arrow" size={14} />
                      </Link>
                    ) : null;
                  })()}
                </section>
              )}
            </div>
          )}

          {tabIs === "enquiries" &&
            (enquiries === null ? (
              <p className="nl-meta flex items-center gap-2 py-8"><span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />Reading the enquiries…</p>
            ) : (
              <ListingEnquiries
                look="new"
                enquiries={enquiries}
                listingId={listing.id}
                propertyId={listing.propertyId ? String(listing.propertyId) : null}
                home={[listing.name, listing.locality].filter(Boolean).join(", ")}
                letDone={!listing.archived && (listing.letAgreed || offerTaken)}
                onBookViewing={LISTING_BOOKER_LIVE ? () => setBooking(true) : undefined}
              />
            ))}

          {tabIs === "viewings" && (
            <div>
              <div className="nl-listbar">
                <h3 className="nl-block-title">Coming Up</h3>
                <span className="flex-1" />
                {LISTING_BOOKER_LIVE && (
                  <>
                    <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setSlotting(true)}>Hold a slot</button>
                    <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => setBooking(true)}><Ico name="plus" size={14} /> Book a viewing</button>
                  </>
                )}
              </div>
              {slotGroups.map(({ slot: a, rows, fresh }) => {
                const startIso = apptStartIso(a);
                const { to } = slotWindow(a);
                const endHm = new Date(to).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
                const count = rows.filter((v) => !v.cancelled).length + fresh.length;
                return (
                  <div key={a.id} className="nl-vslot">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="nl-strong block">Viewing slot · {new Date(startIso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" })}, {a.start}-{endHm}</span>
                        <span className="nl-meta block">{viewings === null ? "Reading who is booked in it…" : count ? `${count} ${count === 1 ? "viewing" : "viewings"} booked in it` : "Nobody booked in it yet"}</span>
                      </span>
                      <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => setBlockAnchor({ viewingId: a.id, listingId: String(listing.id), property: listing.name, locality: listing.locality, startsAt: startIso, minutes: a.mins, slot: true })}>Book within slot</button>
                    </div>
                    {rows.length + fresh.length > 0 && (
                      <ul className="nl-vrows mt-3">
                        {rows.map((v) => vrow(v, true))}
                        {fresh.map((d) => (
                          <li key={d.id}><span className="nl-vwhen">{d.start}</span><span className="nl-strong truncate">{d.who || "Viewer"}</span><span className="nl-vstate"><Badge tone="info">Booked</Badge></span><span /></li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {looseUpcoming.length + booked.length > 0 ? (
                <ul className="nl-vrows">
                  {looseUpcoming.map((v) => vrow(v))}
                  {booked.map((v, i) => (
                    <li key={`b${i}`}><span className="nl-vwhen">{v.when}</span><span className="nl-strong truncate">{v.who}</span><span className="nl-vstate"><Badge tone="info">Booked here</Badge></span><span /></li>
                  ))}
                </ul>
              ) : viewings === null ? (
                <p className="nl-meta py-4">Reading the diary…</p>
              ) : slotGroups.length ? null : (
                <p className="nl-empty">Nothing in the diary yet.</p>
              )}
              <h3 className="nl-block-title mb-2.5 mt-9">Past{viewings?.past.length ? <span className="nl-count ml-2">{viewings.past.length}</span> : null}</h3>
              {viewings?.past.length ? (
                <ul className="nl-vrows">
                  {[...viewings.past].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, pastShown).map((v) => vrow(v))}
                </ul>
              ) : viewings === null ? (
                <p className="nl-meta py-4">Reading the diary…</p>
              ) : (
                <p className="nl-empty">Nobody&apos;s been through the door yet.</p>
              )}
              {(viewings?.past.length ?? 0) > pastShown && (
                <button type="button" className="nl-link mt-4" onClick={() => setPastShown((n) => n + 20)}>Show {Math.min(20, (viewings?.past.length ?? 0) - pastShown)} more</button>
              )}
            </div>
          )}

          {tabIs === "applications" && (
            <div className="nl-bento">
              <ListingOffers look="new" className="span2" offers={savedOffers} canOffer={canOffer} onChanged={() => setOffersTick((n) => n + 1)} asking={per === "pcm" ? listing.rent ?? null : null} home={listing.name} listingId={String(listing.id)} initialOpen={initialOffer ?? null} rexUnread={offersRexUnread} />
              <ApplicationFormCard look="new" listingId={String(listing.id)} />
            </div>
          )}

          {tabIs === "compliance" && (
            <ListingCompliance
              look="new"
              key={`file-${drop ?? "x"}`}
              listingId={String(listing.id)}
              propertyId={listing.propertyId ?? null}
              name={listing.name}
              address={[listing.name, listing.locality].filter(Boolean).join(", ")}
              home={home}
              terms={terms}
              landlord={{
                contactId: link?.landlord?.contactId ?? null,
                name: landlord.status === "known" ? landlord.landlord.name : undefined,
                email: landlord.status === "known" ? (landlord.landlord.email ?? undefined) : undefined,
                phone: landlord.status === "known" ? (landlord.landlord.phone ?? undefined) : undefined,
              }}
              agentLarn={live?.agentLarn ?? null}
              service={live?.service ?? null}
                  homeProblem={homeProblem}
              landlordRegistration={live?.record.landlordRegistration ?? null}
              letOnly={/let\s*only|tenant\s*find/i.test(live?.service ?? "")}
              introOnly={introOnly}
              onHomeChanged={reloadHome}
            />
          )}

          {tabIs === "notes" && (
            <div>
              <form
                className="nl-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const body = noteDraft.trim();
                  if (!body || noteBusy) return;
                  setNoteBusy(true);
                  const ok = await addListingNote(body);
                  setNoteBusy(false);
                  if (ok) setNoteDraft("");
                  else setNoteErr("That note didn't save. Try again in a moment.");
                }}
              >
                <textarea rows={1} value={noteDraft} onChange={(e) => { setNoteDraft(e.target.value); setNoteErr(null); }} placeholder="Add a note to the file" aria-label="Add a note to the file" />
                <button type="submit" className="nl-send" disabled={!noteDraft.trim() || noteBusy} aria-label="Add note"><Ico name="arrow" size={16} /></button>
              </form>
              {noteErr && <p className="nl-meta -mt-2 mb-4 text-accent-dark">{noteErr}</p>}
              {listingNotes === null ? (
                <p className="nl-meta">Reading the notes…</p>
              ) : listingNotes.length ? (
                <ul className="nl-rowlist">
                  {listingNotes.map((n) => (
                    <li key={n.id}>
                      <span className="nl-avatar" style={{ width: 28, height: 28, fontSize: 10, background: "var(--info-soft)" }}>{initialsOf(n.author || "?")}</span>
                      <span className="min-w-0">
                        <span className="nl-meta block">{[n.author, n.when].filter(Boolean).join(" · ")}</span>
                        <span className="nl-note-text block">{n.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nl-empty">No notes yet. Notes stay in the OS, for the whole team.</p>
              )}
            </div>
          )}

          {tabIs === "activity" && (
            happened.length ? (
              <ul className="nl-timeline">
                {happened.slice(0, 40).map((h, i) => (
                  <li key={`${h.at}${i}`}>
                    <span className="nl-mono">{whenOf(h.at)}</span>
                    {h.to ? <button type="button" onClick={() => pickNl(h.to!)}>{h.text}</button> : <span>{h.text}</span>}
                  </li>
                ))}
              </ul>
            ) : reading ? (
              <p className="nl-meta">Reading what has happened here…</p>
            ) : (
              <p className="nl-empty">Nothing has happened on this home yet.</p>
            )
          )}
        </div>

        {/* Edit the advert slides in from the right; the page stays put. */}
        <SectionPanel open={tab === "marketing" && advertLook === false} icon="pack/photo" title="Edit the Advert" lead={TAB_LEAD.marketing} onClose={closeTab}>
          {tab === "marketing" && <div className="fade-up">{sectionBody("marketing")}</div>}
        </SectionPanel>
        {advertDrawer}
        {/* Preview: how it is doing, at a glance, in the middle of a darkened
            screen (James, 25 Oct 2026), the full breakdown one press inside. */}
        <PortalOverview
          open={portalStats}
          onClose={() => setPortalStats(false)}
          listingId={String(listing.id)}
          name={listing.name}
          liveSince={listing.publishedAt ?? null}
          links={portals.map((p) => ({ portal: p.portal, url: p.url }))}
        />
        {/* Edit landlord on the stage (James, 25 Oct 2026): the people as boxes on a
            darkened screen, each opening in place, and the first is who we ring. */}
        <LandlordStage
          open={landlordOpen}
          onClose={() => setLandlordOpen(false)}
          homeKey={lHomeKey}
          address={where.address}
          readOnly={lReadOnly}
          main={lMain}
          mainSlot={lMainSlot ?? undefined}
          mainProblem={lMainProblem}
          mainAction={lMainAction ?? undefined}
          onChanged={() => setLandlordRev((n) => n + 1)}
        />

        {gridFrom !== null && shots.length > 0 && (
          <PhotoGrid photos={shots} name={listing.name} origin={gridFrom} onClose={() => setGridFrom(null)} />
        )}
        {overlays}
      </div>
    );
  }

  return (
    /* Out toward the window's edges a little (James, 12 Oct 2026): the shell
       keeps 56px left and 84px right on a wide screen; this page uses 40. */
    <div data-steve="listing.drawer" className="space-y-5 xl:-mr-[44px] 2xl:-ml-4">
      {/* ── back, the save chip, notes and activity, and ‹ › ─────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <Link href={backHref} className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
            <span aria-hidden>←</span> Listings
          </Link>
          <SaveChip scope={saves} className="bg-white" />
          <RexWaitingChip refs={[["listing", listing.id], ["property", listing.propertyId]]} />
        </div>
        {/* The side panel (10 Oct 2026), a pull-out over the page: the
            landlord's messages and the listing's notes. */}
        {([
          { key: "messages", label: "Activity", icon: "message" },
          { key: "notes", label: "Notes", icon: "note" },
        ] as const).map((b) => (
          <button
            key={b.key}
            type="button"
            data-steve={`listing.panel.${b.key}`}
            onClick={() => setPanelTab(panelTab === b.key ? null : b.key)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
          >
            <DoodleIcon name={b.icon} size={13} className="text-accent-dark" />
            {b.label}
            {b.key === "notes" && (listingNotes?.length ?? 0) > 0 && <span className="figures rounded-full bg-page px-1.5 text-[10.5px]">{listingNotes!.length}</span>}
          </button>
        ))}
        {stepLabel && onStep && (
          <div className="flex items-center gap-1.5 sm:ml-2">
            <span className="mr-1 text-[11.5px] text-muted">{stepLabel}</span>
            <button type="button" aria-label="Previous listing" onClick={() => onStep(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">‹</button>
            <button type="button" aria-label="Next listing" onClick={() => onStep(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">›</button>
          </div>
        )}
      </div>

      {/* ONE PAGE (James, 12 Oct 2026): "there's far too much scroll". Two
          rows and the spine. The home beside eight tiles - every section is a
          pop-out now, so nothing bolts onto the foot of the page; the landlord
          and how we get in beside Next up; where it's up to across the bottom. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* ── 1. the home: Portfolio's box exactly (James, 12 Oct 2026: "the
            whole point is that we're trying to keep this consistent across
            the different tabs") - the big photo, three square ones down its
            right-hand side, and the home underneath. ── */}
        <section className={`${box} min-w-0 p-3 xl:col-start-1`}>
          <div className={`grid grid-cols-1 gap-2 ${shots.length > 1 ? "sm:grid-cols-[minmax(0,1fr)_140px] 2xl:grid-cols-[minmax(0,1fr)_170px]" : ""}`}>
            {/* The three down the side are square; the big one takes their
                height, so it never sets the box's height itself. */}
            <button
              type="button"
              onClick={() => (shots.length ? setLightbox(0) : setDrop("photos"))}
              aria-label={shots.length ? "See the photos" : "Add photos"}
              className={`group relative aspect-[16/10] overflow-hidden rounded-xl bg-box ${shots.length > 1 ? "sm:aspect-auto" : ""}`}
            >
              <PropertyPhoto src={shots[0] ?? null} alt="" width={1400} height={875} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]" />
              {/* No count on the photo (James, 13 Oct 2026): the "+24" on the
                  last square already says how many more there are. */}
              {!shots.length && (
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] font-semibold backdrop-blur">
                  <DoodleIcon name="pack/photo" size={12} /> No photos yet - add them
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
              <h1 className="hand min-w-0 text-[28px] leading-[1.1] sm:text-[32px]">{listing.name}</h1>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" />
                {status.label}
              </span>
            </div>
            <p className="figures mt-1.5 text-[20px] font-semibold">
              {listing.rent == null ? <span className="text-[14px] font-normal text-muted">Rent not set</span> : <>£{listing.rent.toLocaleString("en-GB")} <span className="text-[13px] font-normal text-muted">{per}</span></>}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {[listing.locality, listing.publishedAt ? `live since ${dayOf(listing.publishedAt)}` : null].filter(Boolean).join(" · ")}
            </p>
            <OsAddressLine propertyId={listing.propertyId ? String(listing.propertyId) : null} listingId={String(listing.id)} shown={[listing.name, listing.locality].filter(Boolean).join(", ")} onChanged={onAddress} />
            {/* The same home on Portfolio and Applications (29 Oct 2026). */}
            <HomeSwitch from="listing" listingId={String(listing.id)} propertyId={listing.propertyId ? String(listing.propertyId) : null} address={[listing.name, listing.locality].filter(Boolean).join(", ")} className="mt-3" />
            {/* The key numbers, from REX's key register (James, 22 Oct 2026). */}
            {Number(listing.id) > 0 && listing.propertyId && (
              <div className="mt-3">
                <HomeKeys propertyId={String(listing.propertyId)} listingId={listing.id} />
              </div>
            )}
            {/* Whose it is and the terms on the left; getting INTO the
                property and getting it OUT to the database on the right, as
                wide as their words. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {listing.tenant && <Tag tone="neutral">Tenanted</Tag>}
                {/* Whose it is, and moving it - James and Susan only (6 Oct 2026). */}
                <ListingOwner listingId={listing.id} />
                {/* A test file's listing (lib/test-overlay): negative id, never in REX. */}
                {Number(listing.id) < 0 && <Tag tone="neutral">Test listing - only you can see it</Tag>}
                {termsKnown && (
                  <button
                    type="button"
                    onClick={() => pickTab("compliance")}
                    title="Open Compliance"
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      termsOnFile ? "bg-[#f1f4ec] text-[#56634a]" : "border border-accent-dark/50 bg-white text-accent-dark hover:border-accent-dark"
                    }`}
                  >
                    <DoodleIcon name="file-contract" size={11} />
                    {termsOnFile ? "Terms on file" : "No terms on file"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Until access is recorded; after that the Access details
                    below carry it (James, 12 Oct 2026). */}
                {accessStatus !== "loading" && !access.kind && <AccessRequest
                  value={access}
                  onChange={setAccess}
                  address={listing.name}
                  agent={me}
                  tenant={listing.tenant ?? null}
                  landlord={landlord.status === "known" ? landlord.landlord : null}
                  viewings={upcomingOptions}
                  onBook={LISTING_BOOKER_LIVE ? () => setBooking(true) : undefined}
                  renderButton={(b) => (
                    <button type="button" onClick={b.press} className={pill} title="Record how we get into the property">
                      {pillIcon(b.icon, true)}
                      {b.label}
                    </button>
                  )}
                />}
                <button type="button" data-steve="listing.mail-db" onClick={() => setEmailing(true)} className={pill}>
                  {pillIcon("megaphone")}
                  Mail the database
                </button>
              </div>
            </div>
              {/* The advert (19 Oct 2026, lib/advert-offline): let agreed in the
                  OS is not off the portals, so the agent takes it down here. */}
              {!listing.archived && listing.letAgreed && Number(listing.id) > 0 && (
                <AdvertOffline
                  listingId={String(listing.id)}
                  propertyId={listing.propertyId ? String(listing.propertyId) : null}
                  address={[listing.name, listing.locality].filter(Boolean).join(", ")}
                  className="mt-3"
                />
              )}
              {/* Filed away: why, said once. */}
              {listing.archived && (
                <p className="mt-3 rounded-xl border border-line/60 bg-box px-3.5 py-2.5 text-[11.5px] leading-snug text-muted">
                  <span className="font-semibold text-ink">{archiveLabel(listing.archiveReason ?? null)}.</span>{" "}
                  {archiveWhy({ archived: true, reason: listing.archiveReason ?? null, since: listing.archivedSince ?? null, ageDays: listing.archiveAgeDays ?? null })}{" "}
                  It is out of the Draft tab, still searchable, and the listing itself is unchanged.
                </p>
              )}
              {canFileAway && (
                <button
                  type="button"
                  disabled={archiveBusy}
                  onClick={() => onArchive?.(String(listing.id), listing.archived ? "restore" : "archive")}
                  className="mt-2.5 self-start text-[11.5px] text-muted underline underline-offset-2 transition-colors hover:text-ink disabled:opacity-50"
                  title={listing.archived ? "Back on the Draft tab" : `Drafts file themselves after ${Math.round(ARCHIVE_AFTER_DAYS / 30)} months`}
                >
                  {archiveBusy ? "Saving…" : listing.archived ? "Bring back to drafts" : "File this draft away"}
                </button>
              )}
          </div>
        </section>

        {/* ── the eight tiles, level with the home. Each opens a pop-out. ── */}
        <section className={`${box} @container flex flex-col p-4 xl:col-start-2`}>
          <p className={`${eyebrow} mb-3 px-1`}>Actions</p>
          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2 @[40rem]:grid-cols-4">
            {/* Book a viewing and Book a slot, one tile (James, 12 Oct 2026):
                it asks which. */}
            {LISTING_BOOKER_LIVE && (
              <button type="button" data-steve="listing.book-slot" onClick={() => setChoosingBook(true)} className={tile}>
                {tileIcon("calendar", "green")}
                {tileText("Book a viewing", "One, or a slot to fill")}
              </button>
            )}
            <button
              type="button"
              data-steve="listing.make-offer"
              disabled={!canOffer}
              onClick={() => setPickingOfferer(true)}
              className={tile}
              title={canOffer ? undefined : "Once it is live with a rent, and not let agreed"}
            >
              {tileIcon("coin", "green")}
              {tileText("Make an offer", canOffer ? "Viewed or asked" : listing.letAgreed ? "An offer is accepted" : "Once it is live")}
            </button>
            {sectionTile("marketing")}
            {sectionTile("viewings")}
            {sectionTile("enquiries")}
            {sectionTile("applications")}
            {sectionTile("compliance")}
            {isDraft && !listing.letAgreed && !publishHidden ? (
              <button type="button" data-steve-never onClick={pushLive} className={tile} title={readyToGoLive ? undefined : `Can't push it live until ${missingWords}.`}>
                {tileIcon("megaphone")}
                {tileText("Push to the portals", readyToGoLive ? "Rightmove, Zoopla, OTM" : (() => { const n = requirements.filter((r) => !r.done).length || 1; return `${n} ${n === 1 ? "thing" : "things"} to finish`; })())}
              </button>
            ) : isLive ? (
              sectionTile("portals")
            ) : (
              <button type="button" onClick={() => setPanelTab("notes")} className={tile}>
                {tileIcon("note")}
                {tileText("Notes", "For the whole team")}
              </button>
            )}
          </div>
          {portalNote && !publishCanPress && <p className="mt-3 px-1 text-[11.5px] leading-snug text-muted">{portalNote}</p>}
        </section>

        {/* ── 2. the landlord and how we get in ─────────────────────────── */}
        <section className={`${box} @container flex min-w-0 flex-col p-4 sm:p-5 xl:col-start-1`}>
          {/* A line of the home's facts. The rest live in Edit the advert. */}
          {/* Spread across the full width on one line where they fit, three
              to a row where they don't (James, 13 Oct 2026: "space that out
              better"). Never truncated: "Terraced House", "Professional". */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 @[26rem]:grid-cols-3 @[42rem]:flex @[42rem]:justify-between @[42rem]:gap-x-5">
            {highlights.map((f) => (
              <div key={f.label} className="min-w-0 max-w-full">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted">{f.label}</p>
                {/* Type and Type of let change here (James, 12 Oct 2026): "click
                    into that and change it ... a styled dropdown". */}
                {f.label === "Type" && live && editCanPress ? (
                  <FieldSelect
                    variant="inline"
                    value={live.propertyTypeId ?? ""}
                    placeholder={live.propertyType ?? "Not set"}
                    onOpen={loadPropTypes}
                    options={(propTypes ?? []).map((t) => ({ value: t.id, label: t.label }))}
                    onChange={(v) => void setPropertyType(v)}
                  />
                ) : f.label === "Type of let" && home && !testListing ? (
                  <FieldSelect variant="inline" value={home.letType} options={LET_TYPES} onChange={(v) => void setLetType(v as LetType)} />
                ) : f.label === "Service" && home && live ? (
                  <FieldSelect
                    variant="inline"
                    value={home.introOnly ? "intro_only" : "own"}
                    options={[
                      { value: "own", label: live.serviceOnRecord ?? "As agreed", sub: "The service on the terms" },
                      { value: "intro_only", label: "Marketing only", sub: "We find the tenant, the landlord does the rest" },
                    ]}
                    onChange={(v) => void setIntroOnly(v === "intro_only")}
                  />
                ) : (
                  <p className={`truncate text-[13px] ${quietFact(f.text) ? "text-muted" : "font-semibold"}`}>{f.text}</p>
                )}
              </div>
            ))}
          </div>

          <div className="my-4 grid grid-cols-1 content-start gap-4 border-t border-line/50 pt-4 @[34rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* The REAL landlord, off the listing's owner relationship in REX. */}
            <div className="min-w-0">
              {/* The landlords section, the same on every screen (James, 20 Oct
                  2026: "we always need to be able to update their details"):
                  the landlord, every field changeable, plus additional
                  landlords and points of contact kept on the home. */}
              {landlordBlock}
            </div>

            {/* How we get in - and, when it is through the tenant, the tenant. */}
            <div className="min-w-0 @[34rem]:border-l @[34rem]:border-line/50 @[34rem]:pl-4">
              {accessBlock}
            </div>
          </div>
          {/* Where it's up to, underneath, across the box (James, 12 Oct 2026:
              "bundling two sections into one"). Click a step to move it. */}
          <div className="mt-auto border-t border-line/50 pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="hand text-[16px]">Where it&apos;s up to</span>
              <span className="text-[11.5px] text-muted">Click a step to move the record.</span>
            </p>
            <span className="flex items-center gap-2.5">
              {saveLabel(stepSave) && <span className="text-[11px] text-muted">{saveLabel(stepSave)}</span>}
              <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                Step {Math.min(step, LISTING_TRACK.length - 1) + 1} of {LISTING_TRACK.length}
              </span>
            </span>
          </div>
          {(() => {
            const { at, ticks, noteOf, cols } = trackNotes();
            return (
              <div className="-mx-2 mt-3 overflow-x-auto px-2 pb-1">
                <ol className="grid min-w-[540px]" style={cols}>
                  {LISTING_TRACK.map((st, i) => {
                    const done = i < at;
                    const cur = i === at;
                    return (
                      <li key={st.id} className="relative flex min-w-0 flex-col items-center px-1.5 text-center">
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
                          disabled={i < floor}
                          title={i < floor ? `${offerTaken ? "An offer is already accepted" : listing.letAgreed ? "Already let agreed" : "Already on the portals"}, so it cannot go back to ${st.label}` : `Move the record to ${st.label}`}
                          className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold transition-transform enabled:hover:scale-110 disabled:cursor-default ${
                            done ? "text-white" : cur ? "bg-accent-dark text-white" : "border-[1.5px] border-line/80 bg-white text-muted"
                          }`}
                          style={done ? { background: SAGE_INK } : undefined}
                        >
                          {done ? "✓" : i + 1}
                        </button>
                        <p className={`mt-1.5 text-[12px] leading-tight ${cur ? "font-semibold" : "text-muted"}`}>{st.label}</p>
                        {/* The breakdown under each step done or in hand: each
                            thing it needs, ticked or not (James, 12 Oct 2026). */}
                        {(done || cur) && (ticks[st.id] ?? []).length > 0 ? (
                          <ul className="mt-1.5 w-full min-w-0 space-y-0.5">
                            {(ticks[st.id] ?? []).map((t) => (
                              <li key={t.label} className={`flex min-w-0 items-center justify-center gap-1 text-[10.5px] leading-snug ${t.done ? "text-ink" : cur ? "text-accent-dark" : "text-muted"}`} title={t.detail ? `${t.label} · ${t.detail}` : t.label}>
                                <span aria-hidden className={t.done ? "text-[#56634a]" : "text-muted"}>{t.done ? "✓" : "○"}</span>
                                <span className="truncate">{t.label}{t.detail ? ` · ${t.detail}` : ""}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`mt-0.5 w-full min-w-0 truncate text-[10.5px] leading-snug ${cur ? "text-accent-dark" : "text-muted"}`} title={noteOf(st.id, i) || undefined}>{noteOf(st.id, i) || "\u00a0"}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })()}
          {/* From "offer accepted" onward, the landlord, the property and the
              tenant are one thing; the panel is the record of that. */}
          {(here.id === "accepted" || here.id === "handover") && link && (
            <div className="mt-4">
              <TenancyLinkPanel value={link} onChange={setLinkState} />
              {saveLabel(linkSave) && <p className="mt-1.5 pl-1 text-[10.5px] text-muted">{saveLabel(linkSave)}</p>}
            </div>
          )}
          </div>
        </section>

        {/* ── Next up, level with the facts. It stays (James, 12 Oct 2026):
            what the process says to do, then the latest on this home. ── */}
        <section className={`${pop} flex flex-col rounded-2xl border border-accent-dark/15 bg-accent-soft/60 p-5 xl:col-start-2`}>
          <p className={`${eyebrow} text-accent-dark`}>Next up · step {Math.min(step, LISTING_TRACK.length - 1) + 1} of {LISTING_TRACK.length}</p>
          <h2 className="hand mt-1.5 text-[19px] leading-tight">{here.title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{here.detail}</p>
          {/* Before it goes live: the legal minimum, each one a click to fix. */}
          {here.id === "live" && isDraft && (
            <ul className="mt-3.5 space-y-1.5">
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
                    <button type="button" onClick={r.fix} className="text-left font-semibold hover:underline">{r.id === "marketing" ? r.label : `${r.label.replace(/ on file$| on$| filed$| written$/, "")} · add it`}</button>
                  )}
                </li>
              ))}
              {certs === null && <li className="text-[11px] text-muted">Reading the certificates…</li>}
              {/* Not needed to advertise; needed before anyone moves in. */}
              <li className="pt-1.5 text-[11px] leading-snug text-muted">
                {beforeMoveIn.every((r) => r.done)
                  ? "Gas safety and the EICR are both on file."
                  : `Before anyone moves in: ${beforeMoveIn.filter((r) => !r.done).map((r) => r.label).join(" and ")}.`}
                {beforeMoveIn.some((r) => !r.done) && (
                  <button type="button" onClick={() => goTab("compliance")} className="ml-1.5 font-semibold text-accent-dark hover:underline">
                    Add {beforeMoveIn.filter((r) => !r.done).length > 1 ? "them" : "it"} now
                  </button>
                )}
              </li>
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {here.id === "live" ? (
              isLive ? (
                <p className="text-[12px] leading-relaxed" style={{ color: SAGE_INK }}>
                  {pub && !pub.onPortals
                    ? "Published, and off the portals for now."
                    : `On the portals${listing.publishedAt ? ` since ${new Date(listing.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.`}
                </p>
              ) : publishHidden ? (
                <p className="text-[11.5px] leading-snug text-muted">Pushing to the portals is not switched on for you yet.</p>
              ) : (
                <>
                  <PressButton
                    onClick={pushLive}
                    className={`press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white ${readyToGoLive ? "" : "opacity-90"}`}
                  >
                    <DoodleIcon name="megaphone" size={14} />
                    Push to the portals
                  </PressButton>
                  <span className="text-[11px] leading-snug text-muted">
                    {!readyToGoLive ? `Not until ${missingWords}.` : publishCanPress ? "Goes to Rightmove, OnTheMarket and Zoopla." : portalNote}
                  </span>
                </>
              )
            ) : here.action === "viewing" && !LISTING_BOOKER_LIVE ? (
              <p className="text-[11.5px] leading-snug text-muted">Book viewings from the applicant&apos;s lead for now.</p>
            ) : !LISTING_OFFERS_LIVE && (here.id === "offers-in" || here.action === "review" || here.action === "handoff") ? (
              (() => {
                /* The handover opens the accepted application itself, where
                   the handover panel is; the rest open this listing's offers. */
                const acceptedApp = here.action === "handoff" ? liveApps?.find((a) => /accept/i.test(a.statusLabel)) : undefined;
                return acceptedApp ? (
                  <Link
                    href={`/applications/${encodeURIComponent(acceptedApp.id)}`}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white"
                  >
                    <DoodleIcon name={here.icon} size={14} />
                    Open the accepted application
                  </Link>
                ) : (
                  <PressButton
                    onClick={() => goTab("applications")}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white"
                  >
                    <DoodleIcon name={here.icon} size={14} />
                    See the offers
                  </PressButton>
                );
              })()
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
          </div>

          {/* The latest on this home, newest first. */}
          <div className="mt-5 border-t border-accent-dark/15 pt-4">
            <p className={eyebrow}>Latest</p>
            {latest.length > 0 ? (
              <ul className="mt-2.5 space-y-2">
                {latest.slice(0, 3).map((a) => (
                  <li key={a.key}>
                    <button type="button" onClick={() => goTab(a.to)} className="flex w-full min-w-0 items-start gap-3 rounded-xl bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-box/60">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.hot ? "bg-accent-dark text-white" : "bg-accent-soft text-accent-dark"}`}>
                        <DoodleIcon name={a.icon} size={12} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{a.title}</span>
                        <span className={`block truncate text-[11.5px] ${a.hot ? "text-accent-dark" : "text-muted"}`}>{a.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : reading ? (
              <p className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
                <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                Reading what has happened here…
              </p>
            ) : (
              <p className="mt-2.5 rounded-xl bg-white px-4 py-4 text-center text-[12px] text-muted">No enquiries, viewings or offers on this home yet.</p>
            )}
          </div>
        </section>

      </div>

      {/* ── the pop-outs: each section slides out over the page ────────── */}
      <SectionPanel open={Boolean(openTab) && !(tab === "marketing" && advertLook !== false)} icon={openTab?.icon ?? "home"} title={openTab?.label ?? ""} lead={tab ? TAB_LEAD[tab] : ""} onClose={closeTab}>
        {tab && (
          <div key={`view-${tab}`} className="fade-up">
            {sectionBody(tab)}
          </div>
        )}
      </SectionPanel>
      {advertDrawer}

      {overlays}
    </div>
  );
}


/* ── pushing it to the portals: the moment ────────────────────────────── */

/* James, 13 Sep 2026: Rightmove, then OnTheMarket, then Zoopla. */
const PORTALS = ["Rightmove", "OnTheMarket", "Zoopla"];

/**
 * A listing going live is a big deal for the person doing it (James, 11
 * Sep 2026), so it gets a moment: each portal in turn, then a big sage
 * tick, "Your property listing is now live", and confetti.
 *
 * Real since 15 Sep 2026: "Yes, push it live" publishes in REX, the portal
 * steps run while it answers, and the last one holds until REX has said
 * yes. If REX says no, the card says why instead of celebrating.
 */
function PushCeremony({ at, address, error, signIn = false, onStart, onCancel, onDone }: { at: number; address: string; error: string | null; signIn?: boolean; onStart: () => void; onCancel: () => void; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const asking = at < 0;
  const failed = !asking && Boolean(error);
  const done = at >= 3 && !failed;
  /* Escape leaves the question or the finished card; never mid-push, where
     half the portals would have been told and the screen would say nothing. */
  useEffect(() => {
    if (!asking && !done && !failed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (asking || failed ? onCancel : onDone)(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, done, failed, onCancel, onDone]);
  /* The confetti, made once: sixty pieces in the palette's colours, each
     with its own start, delay, drift and spin. */
  const [pieces] = useState(() =>
    Array.from({ length: 54 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      /* Quick, and only for a moment (James, 13 Sep 2026): it falls from the
         top, and the card is readable again before anybody reaches for it. */
      delay: Math.random() * 0.45,
      dur: 1.5 + Math.random() * 1.1,
      size: 6 + Math.random() * 8,
      color: ["#de968f", "#a85a51", "#b3bea5", "#56634a", "#fdefec", "#56423e"][i % 6],
      round: i % 3 === 0,
      sway: (Math.random() - 0.5) * 120,
    }))
  );
  return (
    <div data-steve-never role="dialog" aria-modal="true" className="fixed inset-0 z-[170] flex items-center justify-center p-4">
      <style>{`
        @keyframes tle-confetti { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 1 } 100% { transform: translate3d(var(--sway),110vh,0) rotate(720deg); opacity: 0.9 } }
        @keyframes tle-pop { 0% { transform: scale(0.4); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes tle-draw { to { stroke-dashoffset: 0 } }
      `}</style>
      {asking || done || failed ? (
        <button
          type="button"
          aria-label="Close"
          onClick={asking || failed ? onCancel : onDone}
          className={`absolute inset-0 cursor-default bg-ink/50 transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <span aria-hidden className={`absolute inset-0 bg-ink/50 transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`} />
      )}
      {done && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {pieces.map((p) => (
            <span
              key={p.id}
              className="absolute top-0"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 0.5,
                background: p.color,
                borderRadius: p.round ? "50%" : 2,
                animation: `tle-confetti ${p.dur}s cubic-bezier(0.2, 0.6, 0.4, 1) ${p.delay}s forwards`,
                ["--sway" as string]: `${p.sway}px`,
              }}
            />
          ))}
        </div>
      )}
      <div
        className="relative w-full max-w-md overflow-hidden rounded-[26px] border border-line/50 bg-white p-8 text-center shadow-[0_40px_90px_-30px_rgba(0,0,0,0.5)]"
        style={{
          transform: shown ? "scaleY(1)" : "scaleY(0.02)",
          opacity: shown ? 1 : 0.4,
          transformOrigin: "50% 50%",
          transition: "transform 620ms cubic-bezier(0.18, 1.35, 0.32, 1), opacity 260ms ease-out",
        }}
      >
        {asking ? (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="megaphone" size={24} />
            </span>
            <h2 className="hand mt-4 text-[23px] leading-tight">Are you sure you want to push it live onto the platforms?</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {address} goes out to Rightmove, OnTheMarket and Zoopla. Check the photographs and the description first - once it is out there, it is out there.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
              >
                Not yet
              </button>
              <PressButton
                onClick={onStart}
                className="press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] px-6 py-2.5 text-[13px] font-semibold text-white"
              >
                <DoodleIcon name="megaphone" size={14} />
                Yes, push it live
              </PressButton>
            </div>
          </>
        ) : failed ? (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="megaphone" size={24} />
            </span>
            <h2 className="hand mt-4 text-[23px] leading-tight">It hasn&apos;t gone live</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{error}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">Nothing was posted. {address} is still a draft.</p>
            {signIn && (
              <div className="mt-5 text-left">
                <SignInAgain compact doing="push it live" onDone={onStart} />
              </div>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="mt-7 rounded-full border border-line/80 px-6 py-2.5 text-[13px] font-medium transition-colors hover:border-ink/40"
            >
              Close
            </button>
          </>
        ) : !done ? (
          <>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark">Going live</p>
            <h2 className="hand mt-2 text-[24px] leading-tight">{address}</h2>
            <ul className="mt-6 space-y-3 text-left">
              {PORTALS.map((name, i) => {
                const state = i < at ? "done" : i === at ? "now" : "next";
                return (
                  <li key={name} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${state === "done" ? "text-white" : state === "now" ? "" : "border border-line/60 text-transparent"}`}
                      style={state === "done" ? { background: "#56634a" } : undefined}
                    >
                      {state === "done" ? "✓" : state === "now" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" /> : "·"}
                    </span>
                    <span className={`text-[14px] ${state === "next" ? "text-muted" : "font-semibold"}`}>
                      {state === "done" ? `Posted to ${name}` : state === "now" ? `Posting to ${name}…` : name}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-line/40">
              <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${((at + 0.6) / 3) * 100}%`, background: "#56634a" }} />
            </div>
          </>
        ) : (
          <>
            <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ background: "#f1f4ec", animation: "tle-pop 700ms cubic-bezier(0.18, 1.35, 0.32, 1) both" }}>
              <svg viewBox="0 0 48 48" width="52" height="52" fill="none" stroke="#56634a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 25 L20 35 L38 14" strokeDasharray="50" strokeDashoffset="50" style={{ animation: "tle-draw 600ms 350ms ease-out forwards" }} />
              </svg>
            </span>
            <h2 className="hand mt-6 text-[26px] leading-tight">Congratulations</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Your listing will be live within the next 5 to 10 minutes. {address}, on Rightmove, OnTheMarket and Zoopla.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="mt-7 rounded-full bg-[var(--brown)] px-6 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Brilliant
            </button>
            <p className="mt-5 text-[10.5px] leading-relaxed text-muted">
              Changed your mind? Take it off the portals from the top of this listing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}


/* ── a section, popped out over the page ──────────────────────────────── */

/**
 * Every section of the listing slides out from the right over the page
 * (James, 12 Oct 2026: "all of these should be popouts ... rather than it
 * bolting onto the page"). Wide enough for the advert editor; Escape or the
 * scrim closes it, unless a pop-up opened from inside it is still up.
 */
function SectionPanel({ open, icon, title, lead, onClose, children }: { open: boolean; icon: string; title: string; lead: string; onClose: () => void; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[125]">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-label={title}
        className={`@container absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[380ms] sm:rounded-l-2xl lg:w-[min(1040px,calc(100%-5rem))] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={15} /></span>
            <div className="min-w-0">
              <h2 className="hand text-[22px] leading-tight">{title}</h2>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">{lead}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </aside>
    </div>
  );
}

/** A small centred pop-up: Book a viewing's choice, and how we get in. */
function SmallModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[560px] rounded-2xl border border-line/70 bg-page p-6 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[20px] leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
