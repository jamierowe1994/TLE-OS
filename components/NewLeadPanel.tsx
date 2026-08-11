"use client";

import { useEffect, useRef, useState } from "react";
import AddressField, { type ResolvedAddress } from "@/components/AddressField";
import { DoneTick, PressButton } from "@/components/Bits";
import ContactMatches from "@/components/ContactMatches";
import DoodleIcon from "@/components/DoodleIcon";
import type { ScoredMatch } from "@/lib/contact-match";
import PropertyPhoto from "@/components/PropertyPhoto";
import { LEAD_SOURCES } from "@/lib/leads-sample";
import rexSample from "@/lib/rex-sample.json";

/** They chose an existing REX record to carry on with, rather than a new one. */
function Continuing({ match, onClear }: { match: ScoredMatch | null; onClear: () => void }) {
  if (!match) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-3 text-[12px]">
      <span className="font-semibold text-accent-dark">Continuing {match.name}&apos;s record</span>
      <span className="text-muted">
        REX contact {match.id} · matched {match.score}%
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded-full border border-line/80 px-3 py-1 text-[11px]"
      >
        Start a new one instead
      </button>
    </div>
  );
}

/**
 * Creating a lead is the same act as reading one, so it happens in the same
 * sheet at the same width — you're filling in the record, not completing a
 * form that later becomes a record.
 *
 * Three sections, in the order a phone call actually goes: who they are, what
 * they said, what they want to see.
 */

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};
const LISTINGS = rexSample.listings as Listing[];

type Draft = {
  name: string;
  mobile: string;
  email: string;
  address: string;
  source: string;
  enquiry: "Letting" | "Landlord" | "Valuation";
  notes: string;
};

const EMPTY: Draft = {
  name: "", mobile: "", email: "", address: "",
  source: "", enquiry: "Letting", notes: "",
};

/** What /api/dossier hands back — every field optional, absence is normal. */
type Dossier = {
  ok: boolean;
  uprn?: string;
  sqft?: number;
  habitableRooms?: number;
  beds?: number;
  baths?: number;
  epc?: { rating: string; date: string; current: boolean; potential?: string | null };
  taxBand?: string;
  propertyType?: string;
  tenure?: string;
  floodRisk?: string;
  valuation?: { price: number; lastSold: number | null; lastSoldDate: string | null };
  areaRent?: { avg: number; beds: number };
  lastSale?: { price: number; date: string };
  lastRent?: { price: number; date: string };
  lastListing?: {
    date: string; price: number; kind: "rent" | "sale";
    url: string | null; image: string | null;
  };
  currentListing?: {
    confidence: "exact" | "street"; price: string | null; agent: string | null;
    status: string | null; url: string | null; image: string | null;
  };
};

/** UK postcode, fished out of a formatted address. */
function postcodeOf(address: string): string | null {
  const m = address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  return m ? m[1].toUpperCase() : null;
}

const NEXT_ACTIONS = [
  { label: "Schedule a viewing", icon: "calendar" },
  { label: "Send an email", icon: "mail" },
  { label: "Set a follow-up", icon: "clock" },
  { label: "Open the record", icon: "user" },
];

function Section({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line/80 bg-panel p-5 ${className}`}>
      <h3 className="mb-4 flex items-center gap-2.5 text-[14px]">
        <DoodleIcon name={icon} size={17} className="text-accent-dark" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function NewLeadPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Draft) => void;
}) {
  const [shown, setShown] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [geo, setGeo] = useState<ResolvedAddress | null>(null);
  const [saved, setSaved] = useState(false);
  const [emailPreview, setEmailPreview] = useState(false);
  // The fork: who is this lead? Everything downstream hangs off it.
  const [kind, setKind] = useState<null | "tenant" | "landlord">(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierBusy, setDossierBusy] = useState(false);
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);

  // The shortlist, and the picker you drag from.
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  /* Duplicate check. Runs while they type, against REX, read-only — four
     facts scored a quarter each. `dismissed` is them answering "no, this is
     someone else" to a 100%: the question is asked once, not on every
     keystroke after. `continuing` marks the record they chose to work on, so
     saving updates that contact rather than making a second one. */
  const [matches, setMatches] = useState<ScoredMatch[]>([]);
  const [matchBusy, setMatchBusy] = useState(false);
  const [dismissedExact, setDismissedExact] = useState(false);
  const [continuing, setContinuing] = useState<ScoredMatch | null>(null);
  const [dragFrom, setDragFrom] = useState<"market" | "shortlist">("market");
  const [overDrop, setOverDrop] = useState(false);
  const [overMarket, setOverMarket] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const marketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    setD(EMPTY);
    setGeo(null);
    setSaved(false);
    setPicked([]);
    setPicking(false);
    setKind(null);
    setDossier(null);
    setDossierBusy(false);
    setBeds(0); setBaths(0);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Ask REX who this might be, half a second after they stop typing. Aborting
     the previous request matters as much as the debounce: four fields being
     filled in order would otherwise land four answers out of order, and the
     stale one wins. */
  useEffect(() => {
    // Once they've chosen a record to carry on with, stop asking — prefilling
    // the form from it would otherwise re-run the search and offer it straight
    // back, which reads as the OS not having listened.
    if (!open || saved || continuing) return;
    const enquirer = { name: d.name, email: d.email, mobile: d.mobile, address: d.address };
    if (!enquirer.name && !enquirer.email && !enquirer.mobile) {
      setMatches([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setMatchBusy(true);
      try {
        const res = await fetch("/api/contacts/match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(enquirer),
          signal: ctrl.signal,
        });
        const j = await res.json();
        if (!ctrl.signal.aborted) setMatches(Array.isArray(j.matches) ? j.matches : []);
      } catch {
        /* a duplicate check that fails is a quiet no-op, never a blocked form */
      } finally {
        if (!ctrl.signal.aborted) setMatchBusy(false);
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, saved, continuing, d.name, d.email, d.mobile, d.address]);

  /** They picked an existing record: carry its details in and say so. */
  function openMatch(m: ScoredMatch) {
    setContinuing(m);
    setD((prev) => ({
      ...prev,
      name: m.name || prev.name,
      email: m.email ?? prev.email,
      mobile: m.mobile ?? prev.mobile,
      address: m.address ? m.address.replace(/\s+/g, " ").trim() : prev.address,
    }));
    setMatches([]);
  }

  /**
   * Drag with POINTER events, not the HTML5 drag API — that one text-selects
   * the page underneath, doesn't work on touch, and gives no live feedback.
   * Clicking a card adds it too, so nothing depends on the drag succeeding.
   */
  function onPointerDown(e: React.PointerEvent, id: string, from: "market" | "shortlist") {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setDragFrom(from);
  }
  const inside = (el: HTMLElement | null, x: number, y: number) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  function onPointerMove(e: React.PointerEvent) {
    if (!dragId) return;
    setOverDrop(inside(dropRef.current, e.clientX, e.clientY));
    setOverMarket(inside(marketRef.current, e.clientX, e.clientY));
  }
  function onPointerUp() {
    if (dragId) {
      if (dragFrom === "market" && overDrop) add(dragId);
      // Dragging back onto the market un-shortlists it.
      if (dragFrom === "shortlist" && overMarket) remove(dragId);
    }
    setDragId(null);
    setOverDrop(false);
    setOverMarket(false);
  }
  const add = (id: string) => setPicked((cur) => (cur.includes(id) ? cur : [...cur, id]));
  const remove = (id: string) => setPicked((cur) => cur.filter((x) => x !== id));

  if (!open) return null;

  const ready = d.name.trim() && d.mobile.trim();
  const set = (k: keyof Draft) => (v: string) => setD((cur) => ({ ...cur, [k]: v }));

  /** The address resolved — go and read the property's history. Runs once,
      right at the start, so the agent never has to remember to ask. */
  async function runDossier(g: ResolvedAddress) {
    const pc = g.postcode ?? postcodeOf(g.address);
    if (!pc) return;
    setDossierBusy(true);
    setDossier(null);
    try {
      const r = await fetch(
        `/api/dossier?address=${encodeURIComponent(g.address)}&postcode=${encodeURIComponent(pc)}`,
        { cache: "no-store" }
      );
      const jj: Dossier = await r.json();
      if (jj.ok) {
        setDossier(jj);
        // Pre-populate, don't dictate: properties change, so the steppers
        // stay editable — but the agent starts from knowledge, not zero.
        if (jj.beds) setBeds(jj.beds);
        if (jj.baths) setBaths(jj.baths);
      }
    } catch {
      /* a dossier that fails is simply a dossier that isn't shown */
    } finally {
      setDossierBusy(false);
    }
  }
  const shortlist = LISTINGS.filter((l) => picked.includes(l.id));
  const available = LISTINGS.filter((l) => !picked.includes(l.id));

  const field =
    "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Possible duplicates, in the gutter the drawer leaves. */}
      {!saved && (
        <ContactMatches
          matches={dismissedExact ? matches.filter((m) => m.score < 100) : matches}
          busy={matchBusy}
          onOpen={openMatch}
          onDismissExact={() => setDismissedExact(true)}
        />
      )}

      {/* Same width as the record drawer — creating and reading are one place. */}
      <aside
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-l-2xl w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div>
            <h2 className="text-[24px] leading-tight">{saved ? "Added" : "New lead"}</h2>
            {!saved && (
              <p className="mt-1 text-[12px] text-muted">
                Fill in what you have — the rest can wait until you&apos;ve spoken.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {saved ? (
            <div className="mx-auto flex max-w-md flex-col items-center pt-10 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[22px]">{d.name} is on the board</p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Saved to Leads{d.source ? ` · ${d.source}` : ""}
                {shortlist.length
                  ? ` · ${shortlist.length} propert${shortlist.length === 1 ? "y" : "ies"} shortlisted`
                  : ""}
                .
              </p>

              {/* The bundle: GDPR notice + their portal, one email. Sent on
                  registration by default, because the notice is a legal duty
                  and the portal is the welcome — one envelope, two jobs. */}
              {kind === "tenant" && (
                <div className="mt-5 w-full rounded-2xl border border-line/70 p-4 text-left">
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <DoodleIcon name="mail" size={15} className="text-accent-dark" />
                    Welcome email queued — GDPR notice with their portal invite inside
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    {d.name.split(" ")[0] || "They"} gets one email: how we look after
                    their details (the legal bit), and a button to set a password and
                    open their own Letting Experts account.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEmailPreview(true)}
                      className="rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold transition-colors hover:border-ink"
                    >
                      See the email they&apos;ll get
                    </button>
                    <a
                      href="/tenant/welcome"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-line/80 px-4 py-2 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      Preview their portal →
                    </a>
                  </div>
                </div>
              )}

              <div className="mt-8 w-full">
                <p className="mb-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                  What next?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {NEXT_ACTIONS.map((a) => (
                    <PressButton
                      key={a.label}
                      className="flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                    >
                      <DoodleIcon name={a.icon} size={16} className="shrink-0 text-accent-dark" />
                      {a.label}
                    </PressButton>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-5 w-full rounded-xl py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  Done for now
                </button>
              </div>
            </div>
          ) : kind === null ? (
            /* ── The fork. Two halves, one question — who's ringing? A tenant
                 goes to the person-first form; a landlord goes ADDRESS-first,
                 because for a landlord the property IS the enquiry, and the
                 dossier can be reading its history while the phone call is
                 still on pleasantries. ── */
            /* No boxes — two full-bleed halves split by one line, each an
               illustration big enough to carry the choice and a word big
               enough to read across the room (James, 8 Aug 2026). */
            <div className="mx-auto flex h-full max-w-3xl flex-col justify-center">
              {(
                [
                  {
                    k: "tenant" as const,
                    title: "Tenant",
                    blurb: "Someone looking for a home — budget, area, viewings.",
                    art: "/illustrations/notioly/place-search.svg",
                  },
                  {
                    k: "landlord" as const,
                    title: "Landlord",
                    blurb: "Someone with a property — we'll look it up as you type the address.",
                    art: "/illustrations/notioly/home-insurance.svg",
                  },
                ]
              ).map((c, i) => (
                <PressButton
                  key={c.k}
                  onClick={() => {
                    setKind(c.k);
                    if (c.k === "landlord") set("enquiry")("Landlord");
                  }}
                  className={`group flex min-h-0 flex-1 items-center gap-10 px-8 py-6 text-left ${
                    i === 1 ? "border-t border-line/70" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.art}
                    alt=""
                    aria-hidden
                    className="art h-52 w-52 shrink-0 transition-transform duration-300 group-hover:scale-[1.05]"
                  />
                  <span className="min-w-0">
                    <span className="hand block text-[42px] leading-tight">{c.title}</span>
                    <span className="mt-2 block max-w-sm text-[14px] leading-relaxed text-muted">
                      {c.blurb}
                    </span>
                  </span>
                  <span className="ml-auto text-[26px] text-muted transition-transform duration-300 group-hover:translate-x-1.5">
                    →
                  </span>
                </PressButton>
              ))}
            </div>
          ) : kind === "landlord" ? (
            /* ── Landlord: address first, everything else follows from it. ── */
            <div className="fade-up mx-auto max-w-3xl space-y-4">
              <Continuing match={continuing} onClear={() => setContinuing(null)} />
              <Section title="What's the address?" icon="home">
                <AddressField
                  value={d.address}
                  onChange={set("address")}
                  onResolved={(g) => {
                    setGeo(g);
                    void runDossier(g);
                  }}
                />
                {dossierBusy && (
                  <p className="mt-3 flex items-center gap-2.5 text-[12px] text-muted">
                    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                    Reading the property&apos;s history…
                  </p>
                )}
              </Section>

              {dossier && (
                <Section title="What we found" icon="analytics">
                  {dossier.lastListing?.image && (
                    <a
                      href={dossier.lastListing.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-4 flex items-center gap-4 rounded-2xl border border-line/70 p-3 transition-colors hover:border-ink/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={dossier.lastListing.image}
                        alt=""
                        className="h-20 w-28 shrink-0 rounded-xl object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold">
                          {dossier.lastListing.kind === "rent" ? "Last let" : "Last marketed"} —{" "}
                          £{dossier.lastListing.price.toLocaleString("en-GB")}
                          {dossier.lastListing.kind === "rent" ? "" : ""}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {dossier.lastListing.date} · Zoopla — click for the listing and photos
                        </span>
                      </span>
                      <span className="ml-auto shrink-0 text-[13px] text-muted">→</span>
                    </a>
                  )}

                  {/* The live Rightmove listing, photo and all. The wording
                      carries the confidence: an exact match is "this house",
                      a street match says so — after Recreation Terrace, a
                      photo never pretends to be a house it might not be. */}
                  {dossier.currentListing?.image && (
                    <a
                      href={dossier.currentListing.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-4 flex items-center gap-4 rounded-2xl border border-line/70 p-3 transition-colors hover:border-ink/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={dossier.currentListing.image}
                        alt=""
                        className="h-20 w-28 shrink-0 rounded-xl object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold">
                          {dossier.currentListing.confidence === "exact"
                            ? "On the market now"
                            : "A live listing on this road"}
                          {dossier.currentListing.price ? ` — ${dossier.currentListing.price}` : ""}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {dossier.currentListing.agent ?? "Another agent"}
                          {dossier.currentListing.status ? ` · ${dossier.currentListing.status}` : ""}
                          {" · Rightmove — click for the listing and photos"}
                        </span>
                      </span>
                      <span className="ml-auto shrink-0 text-[13px] text-muted">→</span>
                    </a>
                  )}

                  {/* Every fact wears a tag. Absent facts wear nothing. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {dossier.currentListing && !dossier.currentListing.image && (
                      <a
                        href={dossier.currentListing.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-opacity hover:opacity-80 ${
                          dossier.currentListing.confidence === "exact"
                            ? "bg-accent-dark text-page"
                            : "bg-accent-soft text-accent-dark"
                        }`}
                      >
                        {dossier.currentListing.confidence === "exact"
                          ? `On the market now — ${dossier.currentListing.agent ?? "another agent"}${
                              dossier.currentListing.price ? ` · ${dossier.currentListing.price}` : ""
                            } →`
                          : `A live listing on this road${
                              dossier.currentListing.agent ? ` — ${dossier.currentListing.agent}` : ""
                            } →`}
                      </a>
                    )}
                    {dossier.lastRent && (
                      <span className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px]">
                        Last rented at £{dossier.lastRent.price.toLocaleString("en-GB")} ·{" "}
                        {dossier.lastRent.date.slice(0, 4)}
                      </span>
                    )}
                    {dossier.areaRent && (
                      <span className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px]">
                        {dossier.areaRent.beds}-beds here let at ~£
                        {dossier.areaRent.avg.toLocaleString("en-GB")} pcm
                      </span>
                    )}
                    {dossier.epc && (
                      <span
                        className={`rounded-full border px-3 py-1.5 text-[11.5px] ${
                          dossier.epc.current
                            ? "border-line/80"
                            : "border-accent-dark/50 text-accent-dark"
                        }`}
                      >
                        EPC {dossier.epc.rating}
                        {dossier.epc.potential ? ` (potential ${dossier.epc.potential})` : ""} ·{" "}
                        {dossier.epc.date?.slice(0, 4)}
                        {dossier.epc.current ? " · in date, filed to Documents" : " · EXPIRED"}
                      </span>
                    )}
                    {dossier.valuation && (
                      <span className="rounded-full bg-accent-soft px-3 py-1.5 text-[11.5px] font-semibold text-accent-dark">
                        Worth ~£{dossier.valuation.price.toLocaleString("en-GB")}
                      </span>
                    )}
                    {dossier.sqft && (
                      <span className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px]">
                        {dossier.sqft.toLocaleString("en-GB")} sq ft
                      </span>
                    )}
                    {dossier.tenure && (
                      <span className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px]">
                        {dossier.tenure}
                      </span>
                    )}
                    {dossier.lastSale && (
                      <span className="rounded-full border border-line/80 px-3 py-1.5 text-[11.5px]">
                        Sold £{dossier.lastSale.price.toLocaleString("en-GB")} ·{" "}
                        {dossier.lastSale.date.slice(0, 4)}
                      </span>
                    )}
                    {dossier.floodRisk && dossier.floodRisk !== "None" && (
                      <span className="rounded-full border border-accent-dark/50 px-3 py-1.5 text-[11.5px] text-accent-dark">
                        Flood risk: {dossier.floodRisk}
                      </span>
                    )}
                    {dossier.uprn && (
                      <span
                        className="rounded-full border border-dashed border-line px-3 py-1.5 text-[10.5px] text-muted"
                        title="Matched to the national property register — lookups are exact, not guessed"
                      >
                        UPRN matched
                      </span>
                    )}
                  </div>

                  {/* Pre-populated, editable — properties change. */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line/60 pt-4">
                    {(
                      [
                        { label: "Bedrooms", value: beds, setV: setBeds },
                        { label: "Bathrooms", value: baths, setV: setBaths },
                      ] as const
                    ).map((st) => (
                      <span key={st.label} className="flex items-center gap-3">
                        <span className="text-[12.5px]">{st.label}</span>
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => st.setV(Math.max(0, st.value - 1))}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
                          >
                            −
                          </button>
                          <span className="figures w-6 text-center text-[13px]">{st.value}</span>
                          <button
                            type="button"
                            onClick={() => st.setV(st.value + 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
                          >
                            +
                          </button>
                        </span>
                      </span>
                    ))}
                    <span className="text-[10.5px] text-muted">
                      Pre-filled from the last listing — correct it if the property&apos;s changed.
                    </span>
                  </div>
                </Section>
              )}

              <Section title="Contact details" icon="user">
                <div className="space-y-3.5">
                  <label className="block">
                    <span className={label}>Name</span>
                    <input
                      value={d.name}
                      onChange={(e) => set("name")(e.target.value)}
                      placeholder="Chloe Adams"
                      className={field}
                    />
                  </label>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Mobile</span>
                      <input
                        value={d.mobile}
                        onChange={(e) => set("mobile")(e.target.value)}
                        placeholder="07712 345 678"
                        inputMode="tel"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className={label}>Email</span>
                      <input
                        value={d.email}
                        onChange={(e) => set("email")(e.target.value)}
                        placeholder="chloe@email.com"
                        inputMode="email"
                        className={field}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className={label}>Source</span>
                    <select
                      value={d.source}
                      onChange={(e) => set("source")(e.target.value)}
                      className={field}
                    >
                      <option value="">How did they find us?</option>
                      {LEAD_SOURCES.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={label}>Notes</span>
                    <textarea
                      value={d.notes}
                      onChange={(e) => set("notes")(e.target.value)}
                      rows={3}
                      placeholder="What did they say? Timescales, why they're moving agent, what they were promised…"
                      className={`${field} resize-none leading-relaxed`}
                    />
                  </label>
                </div>
              </Section>

              <div>
                <PressButton
                  onClick={() => {
                    if (!ready) return;
                    onCreated?.(d);
                    setSaved(true);
                  }}
                  className={`w-full rounded-xl py-3.5 text-[14px] font-semibold transition-opacity ${
                    ready ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  Add landlord lead
                </PressButton>
                {!ready && (
                  <p className="mt-2 text-center text-[11px] text-muted">
                    A name and a mobile is enough to start.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <Continuing match={continuing} onClear={() => setContinuing(null)} />
              </div>
              {/* ── Who they are ── */}
              <Section title="Contact details" icon="user">
                <div className="space-y-3.5">
                  <label className="block">
                    <span className={label}>Name</span>
                    <input
                      autoFocus
                      value={d.name}
                      onChange={(e) => set("name")(e.target.value)}
                      placeholder="Sarah Johnson"
                      className={field}
                    />
                  </label>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Mobile</span>
                      <input
                        value={d.mobile}
                        onChange={(e) => set("mobile")(e.target.value)}
                        placeholder="07712 345 678"
                        inputMode="tel"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className={label}>Email</span>
                      <input
                        value={d.email}
                        onChange={(e) => set("email")(e.target.value)}
                        placeholder="sarah@email.com"
                        inputMode="email"
                        className={field}
                      />
                    </label>
                  </div>
                  <div>
                    <span className={label}>Current address</span>
                    <AddressField
                      value={d.address}
                      onChange={set("address")}
                      onResolved={setGeo}
                    />
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <label className="block">
                      <span className={label}>Enquiry</span>
                      <select
                        value={d.enquiry}
                        onChange={(e) => set("enquiry")(e.target.value)}
                        className={field}
                      >
                        <option>Letting</option>
                        <option>Landlord</option>
                        <option>Valuation</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className={label}>Source</span>
                      <select
                        value={d.source}
                        onChange={(e) => set("source")(e.target.value)}
                        className={field}
                      >
                        <option value="">How did they find us?</option>
                        {LEAD_SOURCES.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </Section>

              {/* ── What they said ── */}
              <Section title="Notes" icon="note">
                <textarea
                  value={d.notes}
                  onChange={(e) => set("notes")(e.target.value)}
                  rows={9}
                  placeholder="What did they say? Budget, timing, must-haves, anything that would change which properties you send…"
                  className={`${field} resize-none leading-relaxed`}
                />
                {geo?.postcode && (
                  <p className="mt-2 text-[11px] text-muted">
                    Address geotagged to {geo.postcode}.
                  </p>
                )}
              </Section>

              {/* ── What they want to see ── */}
              <Section title="Interested in" icon="home" className="lg:col-span-2">
                <div className={`grid gap-4 ${picking ? "lg:grid-cols-[1.1fr_1fr]" : ""}`}>
                  {/* The drop zone. */}
                  <div
                    ref={dropRef}
                    className={`rounded-2xl border-[1.5px] border-dashed p-4 transition-colors ${
                      overDrop ? "border-accent-dark bg-accent-soft/40" : "border-line"
                    }`}
                  >
                    {shortlist.length ? (
                      <ul className="space-y-2.5">
                        {shortlist.map((p) => (
                          <li
                            key={p.id}
                            onPointerDown={(e) => onPointerDown(e, p.id, "shortlist")}
                            className={`flex cursor-grab touch-none select-none items-center gap-3 rounded-xl p-1.5 transition-all active:cursor-grabbing ${
                              dragId === p.id
                                ? "scale-[1.04] -rotate-1 bg-card shadow-[0_14px_30px_-10px_rgba(0,0,0,0.45)]"
                                : ""
                            }`}
                          >
                            <span className="text-[11px] leading-none text-muted/70">⠿</span>
                            <PropertyPhoto src={p.image} className="h-10 w-12 shrink-0 rounded-lg" />
                            <span className="min-w-0 flex-1">
                              <span className="hand block truncate text-[12.5px]">{p.name}</span>
                              <span className="block truncate text-[10.5px] text-muted">
                                {p.locality}
                              </span>
                            </span>
                            <span className="figures shrink-0 text-[12.5px]">
                              £{p.rent?.toLocaleString("en-GB")}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPicked((c) => c.filter((x) => x !== p.id))}
                              className="shrink-0 px-1 text-[12px] text-muted transition-colors hover:text-ink"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : picking ? (
                      <p className="py-10 text-center text-[12.5px] text-muted">
                        Drag a property in from the right — or just click one.
                      </p>
                    ) : (
                      /* Before the picker opens, the whole box is the button. */
                      <PressButton
                        onClick={() => setPicking(true)}
                        className="flex w-full flex-col items-center gap-2 py-10 text-muted transition-colors hover:text-ink"
                      >
                        <DoodleIcon name="home" size={22} />
                        <span className="text-[13px] font-medium">+ Add property</span>
                        <span className="text-[11px]">Shortlist what they want to see</span>
                      </PressButton>
                    )}

                    {shortlist.length > 0 && !picking && (
                      <PressButton
                        onClick={() => setPicking(true)}
                        className="mt-3 w-full rounded-xl border border-dashed border-line py-2.5 text-[12px] font-medium text-muted transition-colors hover:border-ink/40 hover:text-ink"
                      >
                        + Add another
                      </PressButton>
                    )}
                  </div>

                  {/* The picker you drag from. */}
                  {picking && (
                    <div
                      ref={marketRef}
                      className={`fade-up rounded-2xl border p-4 transition-colors ${
                        overMarket && dragFrom === "shortlist"
                          ? "border-accent-dark bg-accent-soft/30"
                          : "border-line/80"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                          On the market
                        </p>
                        <button
                          type="button"
                          onClick={() => setPicking(false)}
                          className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                        >
                          Done
                        </button>
                      </div>
                      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {available.map((p) => (
                          <li
                            key={p.id}
                            onPointerDown={(e) => onPointerDown(e, p.id, "market")}
                            onClick={() => add(p.id)}
                            className={`flex cursor-grab touch-none select-none items-center gap-3 rounded-xl border p-2.5 transition-all active:cursor-grabbing ${
                              dragId === p.id
                                ? "scale-[1.04] -rotate-1 border-accent-dark bg-card shadow-[0_14px_30px_-10px_rgba(0,0,0,0.45)]"
                                : "border-line/60 hover:border-ink/40 hover:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
                            }`}
                          >
                            <span className="text-[11px] leading-none text-muted/70">⠿</span>
                            <PropertyPhoto src={p.image} className="h-9 w-11 shrink-0 rounded-md" />
                            <span className="min-w-0 flex-1">
                              <span className="hand block truncate text-[12px]">{p.name}</span>
                              <span className="block truncate text-[10px] text-muted">
                                {p.locality}
                              </span>
                            </span>
                            <span className="figures shrink-0 text-[11.5px]">
                              £{p.rent?.toLocaleString("en-GB")}
                            </span>
                          </li>
                        ))}
                        {!available.length && (
                          <p className="py-6 text-center text-[12px] text-muted">
                            Everything on the market is shortlisted.
                          </p>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Save ── */}
              <div className="lg:col-span-2">
                <PressButton
                  onClick={() => {
                    if (!ready) return;
                    onCreated?.(d);
                    setSaved(true);
                  }}
                  className={`w-full rounded-xl py-3.5 text-[14px] font-semibold transition-opacity ${
                    ready ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  Add lead
                </PressButton>
                {!ready && (
                  <p className="mt-2 text-center text-[11px] text-muted">
                    A name and a mobile is enough to start.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

      {/* ── The email itself: a GDPR notice wearing its best clothes. ── */}
      {emailPreview && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <button
            aria-label="Close"
            onClick={() => setEmailPreview(false)}
            className="absolute inset-0 cursor-default bg-ink/45"
          />
          <div className="fade-up relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
              <div>
                <h2 className="text-[17px] leading-tight">The email they receive</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  To: {d.email || "their email"} · From: hello@thelettingexperts.co.uk
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEmailPreview(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {/* Rendered in the CUSTOMER brand — red, plain type — because
                  that is what actually lands in their inbox. */}
              <div className="overflow-hidden rounded-xl border border-line/60 bg-white text-[#16181d]">
                <div className="px-6 pt-6">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#e31f36] text-[12px] font-extrabold text-white">
                    TLE
                  </span>
                  <p className="mt-4 text-[15px] font-bold">
                    Welcome, {d.name.split(" ")[0] || "there"} — your account with The Letting Experts
                  </p>
                  <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-black/70">
                    <p>
                      We&apos;ve registered you with The Letting Experts, which means we
                      now hold your name and contact details so we can help you find a
                      home. We look after them carefully, never sell them, and you can
                      see, correct or delete them at any time — the details are at the
                      foot of this email.
                    </p>
                    <p>
                      Your account is ready. Set a password and you can see every home
                      we have, your viewings, and manage everything in one place:
                    </p>
                  </div>
                  <a
                    href="/tenant/welcome"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block rounded-lg bg-[#e31f36] px-6 py-3 text-[13px] font-bold text-white"
                  >
                    Set up my account
                  </a>
                  <p className="mt-3 text-[10.5px] text-black/40">
                    This link is just for you and expires in 7 days.
                  </p>
                </div>
                <div className="mt-5 border-t border-black/10 bg-[#fafafa] px-6 py-4 text-[10px] leading-relaxed text-black/45">
                  Your data: we hold your name, contact details and search preferences to
                  provide our lettings service (legitimate interest / contract). We share
                  them only where a tenancy requires it. Ask for a copy, correction or
                  deletion any time: hello@thelettingexperts.co.uk. Full policy:
                  thelettingexperts.co.uk/privacy.
                </div>
              </div>
              <p className="mt-3 text-[10.5px] text-muted">
                Wireframe — the send goes live with the email layer; the magic-link
                button already opens the real portal flow.
              </p>
            </div>
          </div>
        </div>
      )}
      </aside>
    </div>
  );
}
