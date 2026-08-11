"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PhotoBox from "@/components/PhotoBox";
import PropertyPhoto from "@/components/PropertyPhoto";
import Link from "next/link";
import EmailToTenants from "@/components/EmailToTenants";
import ProcessTimeline from "@/components/ProcessTimeline";
import TenancyLinkPanel from "@/components/TenancyLinkPanel";
import ViewingBooker, { type Person } from "@/components/ViewingBooker";
import { CopyButton, DoneTick, PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import { landlordFor, LISTING_TRACK, listingStartingStep } from "@/lib/journey";
import { LEADS, leadSide } from "@/lib/leads-sample";
import { DIARY } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import type { TenancyLink } from "@/lib/tenancy-link";
import { saveLabel, useCaseState } from "@/lib/case-state";

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
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  letAgreed: boolean;
  publicationStatus: string | null;
  availableFrom: string | null;
  epcExpiry: string | null;
  daysOnMarket: number | null;
  lastUpdated: string | null;
  imageCount: number;
  image: string | null;
  /** The sitting tenant, when the property is occupied. */
  tenant?: { name: string; email: string; phone: string } | null;
  /** The portal write-up, live from REX's `related.listing_adverts`. */
  advertHeading?: string | null;
  advertBody?: string | null;
};

type TabKey = "home" | "property" | "marketing" | "photos";

/* Property and Marketing are EDIT tabs — the facts they hold moved up into
   the header, so the tab is where you go to change them, not to read them.
   Home is the working view: applications on the left, viewings on the right. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "home", label: "Applications & viewings" },
  { key: "property", label: "Property" },
  { key: "marketing", label: "Marketing" },
  { key: "photos", label: "Photos" },
];

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
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name={icon} size={17} className="text-accent-dark" />
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
  const [booking, setBooking] = useState(false);

  const [type, setType] = useState("");
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);
  const [receptions, setReceptions] = useState(0);
  const [furnished, setFurnished] = useState("");
  const [booked, setBooked] = useState<{ when: string; who: string }[]>([]);
  const [step, setStep] = useState(0);
  const [handingOver, setHandingOver] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
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
      landlord: landlordFor(listing.id)
        ? { contactId: null, name: landlordFor(listing.id)!.name }
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
  }, [liveDiary, listing?.name, otherTenants, tenantQuery]);
  const [reviewing, setReviewing] = useState(false);
  const [draftRent, setDraftRent] = useState("");
  const [draftTenants, setDraftTenants] = useState<TenantIn[]>([]);

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

  const ll = landlordFor(listing.id);
  const here = LISTING_TRACK[Math.min(step, LISTING_TRACK.length - 1)];
  const advance = () => setStep((s) => Math.min(s + 1, LISTING_TRACK.length - 1));

  // What's already happened here, from the shared diary — same entries the
  // calendar shows, filtered to this property.
  const pastViewings = DIARY.filter(
    (a) => a.kind === "viewing" && a.day < 0 && a.what.includes(listing.name)
  );

  /** The step decides what the button does, same as on a lead. */
  function fire() {
    if (here.action === "viewing") setBooking(true);
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
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-l-2xl w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStep(-1)}
              className="rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              className="rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
          {/* ── Identity: the photo IS the identity of a property. ── */}
          <div className="rounded-3xl border border-line/80 bg-panel p-6">
            <div className="flex flex-wrap items-start gap-5">
              <PropertyPhoto src={listing.image} className="h-32 w-44 shrink-0 rounded-2xl" />

              <div className="min-w-0 flex-1">
                <h2 className="text-[24px] leading-tight">{listing.name}</h2>
                <p className="mt-1 text-[12.5px] text-muted">
                  {listing.locality}
                  {/* The property's facts live up HERE now — the tabs below
                      are where you go to change them, not to find them. */}
                  {(type || beds || baths || furnished) && (
                    <span className="text-ink">
                      {" · "}
                      {[type, beds ? `${beds} bed` : "", baths ? `${baths} bath` : "", furnished]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="figures text-[18px]">
                    £{listing.rent?.toLocaleString("en-GB")}
                    <span className="text-[11px] text-muted"> pcm</span>
                  </span>
                </div>

                {/* The two buttons that matter, before anything else. */}
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <PressButton
                    onClick={() => setEmailing(true)}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-page"
                  >
                    <DoodleIcon name="mail" size={14} />
                    Email to tenants
                  </PressButton>
                  <PressButton
                    onClick={() => setBooking(true)}
                    className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-5 py-2.5 text-[12.5px] font-semibold"
                  >
                    <DoodleIcon name="calendar" size={14} />
                    Arrange viewing
                  </PressButton>
                </div>
              </div>

              {/* The landlord, because the first question on any property is
                  "whose is it and can I ring them". */}
              <div className="hidden w-[210px] shrink-0 rounded-2xl border border-line/70 p-4 lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Landlord
                </p>
                <p className="hand mt-1.5 text-[14px]">{ll.name}</p>
                <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
                  <DoodleIcon name="call" size={13} /> {ll.phone}
                </p>
                <p className="mt-1 flex items-center gap-2 truncate text-[11.5px] text-muted">
                  <DoodleIcon name="mail" size={13} /> {ll.email}
                </p>
                {/* The people the property comes with. A tenanted viewing
                    without a heads-up is how goodwill dies — so the tenant
                    lives on the record, and the booker offers to tell them. */}
                {listing.tenant && (
                  <div className="mt-3 border-t border-line/60 pt-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Current tenant
                    </p>
                    <p className="hand mt-1 text-[13px]">{listing.tenant.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <DoodleIcon name="call" size={12} /> {listing.tenant.phone}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-muted">
                      <DoodleIcon name="mail" size={12} /> {listing.tenant.email}
                    </p>
                  </div>
                )}
                <p className="mt-3 border-t border-line/60 pt-2.5 text-[10px] leading-relaxed text-muted">
                  Stand-in until the REX property record is joined in.
                </p>
              </div>
            </div>

          </div>

          {/* ── The process, same grammar as the lead record: the rail says
              where the property is, the sentence under it says what to do
              about it, and the button does that thing. ── */}
          <div className="mt-5 rounded-3xl border border-line/80 bg-panel p-6">
            <ProcessTimeline
              steps={LISTING_TRACK}
              current={step}
              onPick={setStep}
            />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-line/60 pt-5">
              <div className="min-w-[240px] max-w-xl flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Next action
                </p>
                <p className="hand mt-1.5 text-[17px] leading-snug">{here.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{here.detail}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {/* Offers land WHILE viewings run — the two live together
                      and the record doesn't move until the agent says the
                      viewings have stopped. No "already done" shortcut: this
                      process moves when the work moves, not before. */}
                  {here.id === "viewings" && (
                    <PressButton
                      onClick={() => setOffering(true)}
                      className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 text-[13px] font-semibold"
                    >
                      <DoodleIcon name="coin" size={15} />
                      Make an offer
                    </PressButton>
                  )}
                  <PressButton
                    onClick={fire}
                    className={`press-ring flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-semibold ${
                      here.action === "review" && !offers.length
                        ? "cursor-not-allowed bg-ink/30 text-page/60"
                        : "bg-accent-dark text-page"
                    }`}
                  >
                    <DoodleIcon name={here.icon} size={15} />
                    {here.cta}
                  </PressButton>
                </div>
                {here.id === "viewings" && (
                  <button
                    type="button"
                    onClick={() => offers.length && advance()}
                    className={`text-[11px] font-semibold transition-colors ${
                      offers.length ? "text-muted hover:text-ink" : "cursor-not-allowed text-muted/40"
                    }`}
                    title={offers.length ? undefined : "No offers yet — nothing for the landlord to review"}
                  >
                    Viewings have stopped → landlord review
                  </button>
                )}
                {here.action === "review" && !offers.length && (
                  <p className="text-[10.5px] text-muted">No applications logged yet.</p>
                )}
              </div>
            </div>
          </div>

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

          {/* ── Tabs ── */}
          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line/80">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`hand relative whitespace-nowrap px-4 py-2.5 text-[13.5px] transition-colors ${
                  tab === t.key ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {t.key === "home" && offers.length + booked.length > 0 && (
                  <span className="figures ml-1.5 text-[10.5px] text-muted">
                    {offers.length + booked.length}
                  </span>
                )}
                {tab === t.key && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent-dark" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {tab === "home" && (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* ── Left: the applications, accumulating as they land. ── */}
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
                  {offers.length ? (
                    <ul className="space-y-3">
                      {offers.map((o, i) => (
                        <li key={i} className="rounded-xl border border-line/60 p-3">
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

                {/* ── Right: the viewings, coming and gone. ── */}
                <div className="space-y-4">
                  <Card
                    title="Upcoming viewings"
                    icon="calendar"
                    action={
                      <PressButton
                        onClick={() => setBooking(true)}
                        className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-3.5 py-2 text-[11.5px] font-semibold"
                      >
                        <DoodleIcon name="calendar" size={13} />
                        Book viewing
                      </PressButton>
                    }
                  >
                    {booked.length ? (
                      <ul className="space-y-2.5">
                        {booked.map((v, i) => (
                          <li key={i} className="flex items-center gap-3 border-b border-line/40 pb-2.5 last:border-0 last:pb-0">
                            <span className="figures w-28 shrink-0 text-[12px] text-accent-dark">{v.when}</span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px]">{v.who}</span>
                            <Pill tone="neutral">Booked</Pill>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-4 text-center text-[12px] text-muted">Nothing in the diary yet.</p>
                    )}
                  </Card>

                  <Card title="Past viewings" icon="clock">
                    {pastViewings.length ? (
                      <ul className="space-y-2.5">
                        {pastViewings.map((v) => (
                          <li key={v.id} className="flex items-center gap-3 border-b border-line/40 pb-2.5 last:border-0 last:pb-0">
                            <span className="w-28 shrink-0 text-[11px] text-muted">
                              {v.day === -1 ? "Yesterday" : `${-v.day} days ago`} · {v.start}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px]">{v.who}</span>
                            <Pill tone="accent">Feedback due</Pill>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-4 text-center text-[12px] text-muted">
                        Nobody&apos;s been through the door yet.
                      </p>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {tab === "property" && (
              <Card title="The property — edit what's wrong" icon="home">
                <div className="max-w-md">
                  <label className="mb-2 block">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
                    >
                      <option value="">Property type…</option>
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <div className="divide-y divide-line/40">
                    <Stepper label="Bedrooms" value={beds} onChange={setBeds} />
                    <Stepper label="Bathrooms" value={baths} onChange={setBaths} />
                    <Stepper label="Receptions" value={receptions} onChange={setReceptions} />
                  </div>
                  <label className="mt-2 block">
                    <select
                      value={furnished}
                      onChange={(e) => setFurnished(e.target.value)}
                      className="w-full rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
                    >
                      <option value="">Furnishing…</option>
                      <option>Furnished</option>
                      <option>Part furnished</option>
                      <option>Unfurnished</option>
                    </select>
                  </label>
                  <p className="mt-3.5 border-t border-line/60 pt-2.5 text-[10px] leading-relaxed text-muted">
                    Everything here shows in the header the moment it&apos;s set. Bedroom
                    counts aren&apos;t in REX&apos;s listing projection; captured here, they
                    can be written back.
                  </p>
                </div>
              </Card>
            )}

            {tab === "marketing" && (
              <Card title="Marketing — edit what's wrong" icon="megaphone">
                {/* The write-up: REX's "internet" advert, which IS the copy
                    Rightmove shows. Read live; editing lands once the write
                    path is proven on a nominated listing. */}
                <div className="mb-5 rounded-xl border border-line/60 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-[12.5px] font-semibold">Portal write-up</h4>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted">
                        {shownBody
                          ? `${shownBody.length.toLocaleString("en-GB")} characters`
                          : "Nothing written"}
                      </span>
                      {!editingCopy && (
                        <button
                          type="button"
                          onClick={() => {
                            setCopyHeading(shownHeading ?? "");
                            setCopyBody(shownBody ?? "");
                            setEditingCopy(true);
                          }}
                          className="rounded-full border border-line/80 px-3 py-1 text-[11px] transition-colors hover:border-ink/40"
                        >
                          {shownBody ? "Edit" : "Write one"}
                        </button>
                      )}
                    </div>
                  </div>

                  {editingCopy ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={copyHeading}
                        onChange={(e) => setCopyHeading(e.target.value)}
                        placeholder="Headline — the line the portals show first"
                        className="w-full rounded-lg border border-line/80 px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                      />
                      <textarea
                        value={copyBody}
                        onChange={(e) => setCopyBody(e.target.value)}
                        rows={14}
                        placeholder="Where it is, what it's like, what's nearby…"
                        className="w-full resize-y rounded-lg border border-line/80 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-ink"
                      />
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={saveCopy}
                          disabled={savingCopy}
                          className="rounded-full bg-ink px-4 py-2 text-[12px] text-page transition-opacity disabled:opacity-50"
                        >
                          {savingCopy ? "Saving to REX…" : "Save to REX"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingCopy(false); setCopyError(null); }}
                          className="rounded-full border border-line/80 px-4 py-2 text-[12px]"
                        >
                          Cancel
                        </button>
                        <span className="text-[10px] text-muted">
                          {copyBody.length.toLocaleString("en-GB")} characters · goes to Rightmove
                        </span>
                      </div>
                      {copyError && (
                        <p className="rounded-lg bg-accent-soft/60 px-3 py-2 text-[11px] leading-relaxed text-accent-dark">
                          {copyError}
                        </p>
                      )}
                    </div>
                  ) : shownBody ? (
                    <>
                      {shownHeading && (
                        <p className="mb-2 text-[13px] font-semibold leading-snug">{shownHeading}</p>
                      )}
                      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">
                        {shownBody}
                      </p>
                    </>
                  ) : (
                    <p className="rounded-lg bg-accent-soft/50 px-3 py-2 text-[11px] leading-relaxed text-accent-dark">
                      No description on this listing. It can&apos;t go to the portals
                      reading like this — every published rental in the book has one,
                      and this is what stands between a draft and going live.
                    </p>
                  )}
                  {saved && !editingCopy && (
                    <p className="mt-2.5 text-[10px] text-muted">
                      Saved to REX — read back from the record, not from the box.
                    </p>
                  )}
                </div>

                <dl className="max-w-md space-y-2 text-[12.5px]">
                  {[
                    ["Status", status.label],
                    ["Rent", `£${listing.rent?.toLocaleString("en-GB")} pcm`],
                    ["Available from", listing.availableFrom ?? "Not set"],
                    ["Photos on file", String(listing.imageCount)],
                    ["EPC expires", listing.epcExpiry ?? "Not recorded"],
                    ["Age in REX", listing.daysOnMarket != null ? `${listing.daysOnMarket} days` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-line/40 pb-2 last:border-0 last:pb-0">
                      <dt className="text-muted">{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                {listing.imageCount === 0 && (
                  <p className="mt-3 max-w-md rounded-lg bg-accent-soft/50 px-3 py-2 text-[11px] leading-relaxed text-accent-dark">
                    No photos. A listing without photos gets almost no portal traffic —
                    this is the single highest-value thing to fix on this record.
                  </p>
                )}
                <p className="mt-3.5 max-w-md border-t border-line/60 pt-2.5 text-[10px] leading-relaxed text-muted">
                  Editing these writes back to REX once the write path is wired —
                  read-only facts until then.
                </p>
              </Card>
            )}

            {tab === "photos" && (
              <Card title="Photos" icon="folder">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {listing.image && (
                    <div className="overflow-hidden rounded-xl border border-line/60">
                      <PropertyPhoto src={listing.image} className="aspect-[4/3] w-full" />
                    </div>
                  )}
                  {Array.from({ length: 3 }, (_, i) => (
                    <PhotoBox
                      key={i}
                      refId={`listing-${listing.id}`}
                      label={i === 0 && !listing.image ? "Add the main photo" : "Add a photo"}
                    />
                  ))}
                </div>
                <p className="mt-4 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
                  Drop a file on any box, or click it. Nothing is stored yet — photos need
                  the R2 bucket first, because they can&apos;t be pushed straight to REX;
                  they have to live somewhere with a URL before REX can be handed one.
                </p>
              </Card>
            )}

          </div>
        </div>
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
                ["Landlord", `${ll.name} · ${ll.phone}`],
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
            onClick={() => setOffering(false)}
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
                    : "People who have viewed this property — nearly always one of these."}
                </p>

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
                    const on = draftTenants.some((t) => t.fromId === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setDraftTenants((cur) =>
                            on
                              ? cur.filter((t) => t.fromId !== c.id)
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
                  {!candidates.length && (
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
              <h2 className="text-[19px] leading-tight">What {ll.name.split(" ")[0]} will see</h2>
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
    </div>
  );
}
