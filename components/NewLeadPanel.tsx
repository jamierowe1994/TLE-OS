"use client";

import { useEffect, useRef, useState } from "react";
import { useSlideOver } from "@/lib/use-slide-over";
import AddressField, { type ResolvedAddress } from "@/components/AddressField";
import { DoneTick, PressButton } from "@/components/Bits";
import ContactMatches from "@/components/ContactMatches";
import DoodleIcon from "@/components/DoodleIcon";
import type { ScoredMatch } from "@/lib/contact-match";
import PropertyPhoto from "@/components/PropertyPhoto";
import { LEAD_SOURCES } from "@/lib/leads-sample";
import { rexContactUrl } from "@/lib/business/rex-links";
import { OS_LEAD_PREFIX } from "@/lib/contacts-as-leads";
import { searchMatches } from "@/lib/search-match";

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
  id: string; name: string; locality: string; postcode?: string | null; rent: number | null; image: string | null;
  publicationStatus?: string | null; letAgreed?: boolean;
};

type Draft = {
  name: string;
  mobile: string;
  email: string;
  address: string;
  source: string;
  /* A tenant's is Viewing or General (Howard, 24 Sep 2026: the tenant form
     offered Letting, Landlord and Valuation, and Valuation flipped a tenant
     onto the landlord side). A landlord's is Landlord or Valuation. */
  enquiry: "Viewing" | "General" | "Letting" | "Landlord" | "Valuation";
  notes: string;
};

const EMPTY: Draft = {
  name: "", mobile: "", email: "", address: "",
  source: "", enquiry: "General", notes: "",
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
  onClose: closeNow,
  onCreated,
  initial,
  initialKind,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Draft) => void;
  /** Fields to arrive with. Landlord Radar opens this with the property's
   *  address already in; the person is still typed by hand, because Radar
   *  holds no names by design. */
  initial?: Partial<Draft>;
  /** Skip the tenant-or-landlord fork when the caller already knows. */
  initialKind?: "tenant" | "landlord";
}) {
  /* Every way out plays the panel out first (lib/use-slide-over). */
  const { shown, close: onClose } = useSlideOver(open, closeNow);
  const [d, setD] = useState<Draft>(EMPTY);
  const [geo, setGeo] = useState<ResolvedAddress | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  /* What actually happened, in two parts: whether the OS stored it, and what
     REX said. They fail independently, so one flag cannot describe both — the
     version of this panel that tried showed "Saved to Leads" for a save that
     never happened. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rexNote, setRexNote] = useState<{ ok: boolean; detail: string } | null>(null);
  /* What the welcome email actually did, from the save (4 Oct 2026). */
  const [welcome, setWelcome] = useState<{ state: string; detail: string } | null>(null);
  /** How many of the picked homes landed on their list, or "failed". */
  const [listSaved, setListSaved] = useState<number | "failed" | null>(null);
  const [emailPreview, setEmailPreview] = useState(false);
  /* The welcome as it really goes, fetched when the preview opens. */
  const [welcomePreview, setWelcomePreview] = useState<{ subject: string; html: string } | { error: string } | null>(null);
  useEffect(() => {
    if (!emailPreview) return;
    let alive = true;
    setWelcomePreview(null);
    fetch(`/api/contacts/welcome-preview?name=${encodeURIComponent(d.name ?? "")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; subject?: string; html?: string; error?: string }) => {
        if (!alive) return;
        setWelcomePreview(j.ok && j.html ? { subject: j.subject ?? "", html: j.html } : { error: j.error ?? "We couldn't draw the email just now." });
      })
      .catch(() => alive && setWelcomePreview({ error: "We couldn't draw the email just now." }));
    return () => {
      alive = false;
    };
  }, [emailPreview, d.name]);
  /** REX's own id for the contact we just pushed, so "Open in REX" can go somewhere. */
  const [rexId, setRexId] = useState<string | null>(null);
  /** Our own id for the row we just wrote, so the record can be opened. */
  const [savedId, setSavedId] = useState<string | null>(null);
  // The fork: who is this lead? Everything downstream hangs off it.
  const [kind, setKind] = useState<null | "tenant" | "landlord">(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierBusy, setDossierBusy] = useState(false);
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);

  // The shortlist, and the picker you drag from.
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  /* THE LIVE BOOK (Howard, 24 Sep 2026: "add search into here for bigger
     lists"). This picker read rex-sample.json - a fixed handful of homes, some
     long gone - so there was nothing to search and nothing true to pick. It
     reads the same book as the lead file's finder now: on the market, not let
     agreed, and searchable by street, town or postcode. */
  const [market, setMarket] = useState<Listing[] | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketQ, setMarketQ] = useState("");
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
    if (!open) return;
    setD({ ...EMPTY, ...(initial ?? {}) });
    setGeo(null);
    setSaved(false);
    setRexId(null);
    setSavedId(null);
    setSaving(false);
    setSaveError(null);
    setRexNote(null); setWelcome(null);
    setListSaved(null);
    setPicked([]);
    setPicking(false);
    setKind(initialKind ?? null);
    setDossier(null);
    setDossierBusy(false);
    setBeds(0); setBaths(0);
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

  /* Read once, the first time the picker opens. */
  useEffect(() => {
    if (!picking || market) return;
    let live = true;
    fetch("/api/listings?tests=0", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok && Array.isArray(j.listings)) setMarket(j.listings as Listing[]);
        else setMarketError(j?.error ?? j?.reason ?? "The listings did not load.");
      })
      .catch(() => live && setMarketError("The listings did not load."));
    return () => { live = false; };
  }, [picking, market]);

  if (!open) return null;

  /* A landlord cannot be registered without saying where they came from
     (Howard, 24 Sep 2026): the lead sources figures are only as good as this
     answer, and a blank one is a lead nobody can credit. The route checks it
     too. A tenant still only needs a name and a mobile. */
  const needsSource = kind === "landlord";
  const missing = [
    !d.name.trim() && "a name",
    !d.mobile.trim() && "a mobile",
    needsSource && !d.source.trim() && "where they came from",
  ].filter(Boolean) as string[];
  const ready = missing.length === 0;
  const set = (k: keyof Draft) => (v: string) => setD((cur) => ({ ...cur, [k]: v }));

  /**
   * Save, for real.
   *
   * This used to be `onCreated?.(d); setSaved(true)` — an OPTIONAL callback
   * that the only caller never passed, followed by a success screen. Nothing
   * was written anywhere and the panel said "Saved to Leads" regardless.
   *
   * The fix is not to pass the prop. It is to stop persistence being a prop at
   * all: the panel posts to an endpoint that always writes, so no arrangement
   * of callers can make this button quietly do nothing again. `onCreated` is
   * now only a nudge to whoever wants to refresh a list.
   */
  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setSaveError(null);
    setRexNote(null); setWelcome(null);
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: kind === "landlord" ? "landlord" : "tenant",
          name: d.name,
          email: d.email,
          mobile: d.mobile,
          address: d.address,
          postcode: geo?.postcode ?? postcodeOf(d.address) ?? "",
          source: d.source,
          enquiry: d.enquiry,
          notes: d.notes,
          /* "Continuing X's record": the REX contact they chose. The record is
             linked to it, and nothing new is created in REX (22 Sep 2026). */
          rexId: continuing?.id ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setSaveError(j.error ?? "That didn't save.");
        return;
      }
      setRexNote(j.rex ? { ok: Boolean(j.rex.ok), detail: String(j.rex.detail ?? "") } : null);
      setWelcome(j.welcome ? { state: String(j.welcome.state ?? ""), detail: String(j.welcome.detail ?? "") } : null);
      setRexId(j.contact?.rexId ? String(j.contact.rexId) : null);
      setSavedId(j.contact?.id ? String(j.contact.id) : null);
      /* The homes they're interested in go onto their file (Howard, 24 Sep
         2026: the picks were dropped here and the lead then read the
         tenant's own address as the home they'd asked about). The person is
         saved whatever happens to the list, and the screen says which. */
      if (kind !== "landlord" && shortlist.length && j.contact?.id) {
        const ok = await fetch(`/api/leads/${OS_LEAD_PREFIX}${encodeURIComponent(String(j.contact.id))}/shortlist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            homes: shortlist.map((l) => ({ id: l.id, name: l.name, locality: l.locality, postcode: l.postcode ?? null, rent: l.rent, image: l.image })),
          }),
        })
          .then((r) => r.ok)
          .catch(() => false);
        setListSaved(ok ? shortlist.length : "failed");
      }
      onCreated?.(d);
      setSaved(true);
    } catch {
      setSaveError("That didn't save — the connection dropped. Nothing has been lost from this form.");
    } finally {
      setSaving(false);
    }
  }

  /** Shared by both branches, so the two Save buttons cannot drift apart. */
  const saveButton = (label: string) => (
    <div>
      <PressButton
        onClick={save}
        className={`w-full rounded-xl py-3.5 text-[14px] font-semibold transition-opacity ${
          ready && !saving ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
        }`}
      >
        {saving ? "Saving…" : label}
      </PressButton>
      {!ready && (
        <p className="mt-2 text-center text-[11px] text-muted">
          {needsSource
            ? `Add ${missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}` : missing[0]} to save.`
            : "A name and a mobile is enough to start."}
        </p>
      )}
      {saveError && (
        <p className="mt-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-center text-[11.5px] leading-relaxed">
          {saveError}
        </p>
      )}
    </div>
  );

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
  const onMarket = (market ?? []).filter((l) => l.publicationStatus === "published" && !l.letAgreed);
  const shortlist = picked.map((id) => onMarket.find((l) => l.id === id)).filter((l): l is Listing => Boolean(l));
  const marketNeedle = marketQ.trim();
  const available = onMarket.filter(
    (l) => !picked.includes(l.id) && (!marketNeedle || searchMatches(marketNeedle, l.name, l.locality, l.postcode))
  );

  const field =
    "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="so-root fixed inset-0 z-[130]" data-shown={shown}>
      <button
        aria-label="Close"
        onClick={onClose}
        data-shown={shown}
        className="so-scrim absolute inset-0 cursor-default bg-ink/35"
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
        data-shown={shown}
        className={`so-panel absolute inset-y-0 right-0 flex overflow-hidden rounded-l-2xl w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] ${
          /* The fork comes out further, so the two halves have room each side
             of the line (James, 2 Oct 2026); the forms keep the drawer width. */
          !saved && kind === null ? "lg:w-[86%] xl:w-[80%]" : "lg:w-[76%] xl:w-[68%]"
        }`}
      >
        {!saved && kind === null ? (
          /* The fork's own header (James, 2 Oct 2026, from his mock): the
             question large, no rule under it, the close button on its own. */
          <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-8 sm:px-16 sm:pt-11">
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em] text-muted">New lead</p>
              <h2 className="hand relative mt-2.5 inline-block text-[38px] leading-[1.05] sm:text-[54px]">
                Who Are You Adding?
                {/* The pink stroke under the first words, as in his mock
                    ("I think the underline does add something"). */}
                <svg aria-hidden viewBox="0 0 300 16" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-3 left-[5%] h-[12px] w-[52%]">
                  <path d="M3 11 C 70 3, 170 2, 297 8" fill="none" stroke="#F2B8AD" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </h2>
              <p className="mt-5 text-[14.5px] leading-relaxed text-muted">
                Choose the type of lead to get started, and we&apos;ll take it from there.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line/80 text-[14px] text-muted transition-colors hover:text-ink"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        ) : (
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
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {saved ? (
            <div className="mx-auto flex max-w-md flex-col items-center pt-10 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[22px]">{d.name} is saved</p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                {/* "Saved to Leads" was never true: the Leads table is REX's
                    book, and this row lives in the OS until it is pushed. */}
                Saved in the OS{d.source ? ` · ${d.source}` : ""}
                {typeof listSaved === "number"
                  ? ` · ${listSaved} home${listSaved === 1 ? "" : "s"} on their list`
                  : ""}
                .
              </p>
              {listSaved === "failed" && (
                <p className="mt-3 w-full rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-left text-[11.5px] leading-relaxed">
                  <span className="font-semibold">The homes they picked did not save. </span>
                  Add them again on the lead&apos;s Properties tab.
                </p>
              )}

              {/* Whether REX has them is a SEPARATE fact from whether we do,
                  and it is the one an agent will act on — they'll go looking
                  in REX for a record that may not be there. Held is not an
                  error: it means the write lock is still on and the record is
                  queued, so nobody needs to re-type it later. */}
              {rexNote && (
                <p
                  className={`mt-3 w-full rounded-xl border p-3 text-left text-[11.5px] leading-relaxed ${
                    rexNote.ok
                      ? "border-line/70 text-muted"
                      : "border-accent-dark/40 bg-accent-soft/40"
                  }`}
                >
                  <span className="font-semibold">
                    {rexNote.ok ? "In REX too. " : "Not in REX yet. "}
                  </span>
                  {rexNote.detail}
                </p>
              )}

              {/* The bundle: GDPR notice + their portal, one email. Sent on
                  registration by default, because the notice is a legal duty
                  and the portal is the welcome — one envelope, two jobs. */}
              {kind === "tenant" && (
                <div className="mt-5 w-full rounded-2xl border border-line/70 p-4 text-left">
                  {/* It said "queued" and nothing was queued (James found it,
                      13 Sep 2026). Since 16 Sep saving a tenant does send the
                      welcome, behind the Automatic tenant emails switch, and
                      since 4 Oct this says what actually happened to it. */}
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <DoodleIcon name="mail" size={15} className="text-accent-dark" />
                    {welcome?.state === "sent"
                      ? "The welcome email has gone"
                      : welcome?.state === "would"
                        ? "The welcome email is held"
                        : !d.email?.trim()
                          ? "No welcome email: there is no email address"
                          : "The welcome email has not gone"}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    {welcome?.state === "sent"
                      ? `${d.name.split(" ")[0] || "They"} has been sent Let's find you a home, asking for their budget, area, moving date and who is moving in.`
                      : welcome?.state === "would"
                        ? "Automatic tenant emails are switched off, so it was not sent. It goes by itself once they are on; until then send one from Outlook if they need it now."
                        : welcome?.detail
                          ? `${welcome.detail.replace(/\.+$/, "")}. Send one from Outlook if they need it now.`
                          : "Add their email address and save again, or send one from Outlook."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEmailPreview(true)}
                      className="rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold transition-colors hover:border-ink"
                    >
                      See the email they&apos;ll get
                    </button>
                  </div>
                </div>
              )}

              {/* Four tiles used to sit here with no handler on any of them
                  (James, 13 Sep 2026). These three do what they say, and there
                  is no fourth because there is nowhere else honest to go: a
                  contact saved here is not on the Leads board, which reads
                  REX's own book. */}
              <div className="mt-8 w-full">
                <p className="mb-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                  What next?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* The next step in the process, first and biggest (Howard,
                      24 Sep 2026): a landlord's is the market appraisal, a
                      tenant's the viewing. It opens the new record with the
                      booker already up. */}
                  {savedId && (
                    <a
                      href={`/leads?open=os-${savedId}&side=${kind === "landlord" ? "landlord" : "tenant"}&book=${kind === "landlord" ? "appraisal" : "viewing"}`}
                      className="col-span-2 flex items-center gap-3 rounded-xl bg-brown px-4 py-3.5 text-left text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <DoodleIcon name="calendar" size={17} className="shrink-0" />
                      {kind === "landlord" ? "Book a market appraisal" : "Book a viewing"}
                      <span className="ml-auto text-[15px]">→</span>
                    </a>
                  )}
                  <a
                    href={`/leads?open=os-${savedId ?? ""}&side=${kind === "landlord" ? "landlord" : "tenant"}`}
                    className="flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                  >
                    <DoodleIcon name="user" size={16} className="shrink-0 text-accent-dark" />
                    Open the record
                  </a>
                  {rexId ? (
                    <a
                      href={rexContactUrl(rexId)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                    >
                      <DoodleIcon name="user" size={16} className="shrink-0 text-accent-dark" />
                      Open in REX ↗
                    </a>
                  ) : (
                    <span
                      title="Not in REX yet, so there is no record to open."
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-line/60 px-3.5 py-3 text-left text-[12.5px] text-muted opacity-60"
                    >
                      <DoodleIcon name="user" size={16} className="shrink-0" />
                      Open in REX
                    </span>
                  )}
                  {d.email ? (
                    <a
                      href={`mailto:${encodeURIComponent(d.email)}`}
                      className="flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                    >
                      <DoodleIcon name="mail" size={16} className="shrink-0 text-accent-dark" />
                      Email them
                    </a>
                  ) : (
                    <span
                      title="No email address on this contact."
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-line/60 px-3.5 py-3 text-left text-[12.5px] text-muted opacity-60"
                    >
                      <DoodleIcon name="mail" size={16} className="shrink-0" />
                      Email them
                    </span>
                  )}
                  <PressButton
                    onClick={() => {
                      setD({ ...EMPTY, ...(initial ?? {}) });
                      setGeo(null); setSaved(false); setRexId(null); setSavedId(null);
                      setSaveError(null); setRexNote(null); setWelcome(null);
                      setPicked([]); setPicking(false); setKind(initialKind ?? null);
                      setDossier(null); setBeds(0); setBaths(0);
                    }}
                    className="col-span-2 flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                  >
                    <DoodleIcon name="target" size={16} className="shrink-0 text-accent-dark" />
                    Add another lead
                  </PressButton>
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
            /* Two halves side by side, split by one line, each a picture on
               its own soft circle, the word, one line, and the arrow (James's
               layout, 2 Oct 2026, with his two drawings). Stacks on a phone. */
            <div className="relative mx-auto grid max-w-6xl grid-cols-1 divide-y divide-line/70 sm:mt-4 sm:grid-cols-2 sm:divide-y-0">
              {/* The line between them is short and centred, not floor to
                  ceiling (James, 2 Oct 2026). */}
              <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[72%] w-px -translate-y-1/2 bg-line/80 sm:block" />
              {(
                [
                  {
                    k: "tenant" as const,
                    title: "Tenant",
                    blurb: "Someone looking for a home: budget, area, viewings and more.",
                    art: "/illustrations/lead/tenant-window.webp",
                    /* A blush disc up behind the window, as in the mock. */
                    disc: { background: "#F6DDD4", width: "62%", left: "10%", top: "4%" },
                  },
                  {
                    k: "landlord" as const,
                    title: "Landlord",
                    blurb: "Someone with a property. We'll look it up as you type the address.",
                    art: "/illustrations/lead/landlord-door.webp",
                    /* Sage, low behind the terrace on the left. */
                    disc: { background: "#DCE4D3", width: "48%", left: "6%", top: "30%" },
                  },
                ]
              ).map((c) => (
                <PressButton
                  key={c.k}
                  onClick={() => {
                    setKind(c.k);
                    set("enquiry")(c.k === "landlord" ? "Landlord" : "General");
                  }}
                  className="group flex min-h-0 flex-col items-center justify-start px-6 py-8 text-center sm:px-14 sm:py-6"
                >
                  <span className="relative flex h-[230px] w-full max-w-[380px] items-end justify-center sm:h-[330px]">
                    <span aria-hidden className="absolute aspect-square rounded-full" style={c.disc} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.art}
                      alt=""
                      aria-hidden
                      className="relative h-full w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </span>
                  <span className="hand mt-6 block text-[40px] leading-none sm:text-[46px]">{c.title}</span>
                  <span className="mt-3 block max-w-xs text-[14.5px] leading-relaxed text-muted">{c.blurb}</span>
                  <span
                    aria-hidden
                    className="mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-[22px] text-ink transition-transform duration-300 group-hover:translate-x-1.5"
                  >
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
                    <span className={label}>
                      Source <span className="normal-case tracking-normal text-accent-dark">- needed to save</span>
                    </span>
                    <select
                      value={d.source}
                      onChange={(e) => set("source")(e.target.value)}
                      required
                      aria-required="true"
                      className={!d.source ? field.replace("border-line/80", "border-accent-dark/50") : field}
                    >
                      <option value="">How did they find us?</option>
                      {/* Arrived with one the list does not hold (Landlord Radar
                          sends its own): shown, so it reads as chosen. */}
                      {d.source && !LEAD_SOURCES.some((g) => g.options.includes(d.source)) && (
                        <option value={d.source}>{d.source}</option>
                      )}
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

              {saveButton("Add landlord lead")}
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
                        value={d.enquiry === "Viewing" ? "Viewing" : "General"}
                        onChange={(e) => set("enquiry")(e.target.value)}
                        className={field}
                      >
                        <option value="Viewing">Viewing - wants to see a home</option>
                        <option value="General">General - looking for a home</option>
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
                          On the market{market ? ` · ${onMarket.length}` : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPicking(false)}
                          className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                        >
                          Done
                        </button>
                      </div>
                      <input
                        value={marketQ}
                        onChange={(e) => setMarketQ(e.target.value)}
                        placeholder="Search by street, town or postcode"
                        aria-label="Search the homes on the market"
                        className="mb-3 w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2 text-[12.5px] outline-none transition-colors focus:border-ink"
                      />
                      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {!market && !marketError && (
                          <p className="flex items-center justify-center gap-2 py-6 text-center text-[12px] text-muted">
                            <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                            Reading the homes on the market…
                          </p>
                        )}
                        {marketError && <p className="py-6 text-center text-[12px] text-accent-dark">{marketError}</p>}
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
                        {market && !available.length && (
                          <p className="py-6 text-center text-[12px] text-muted">
                            {marketNeedle ? `Nothing on the market matches "${marketQ.trim()}".` : "Everything on the market is shortlisted."}
                          </p>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Save ── */}
              <div className="lg:col-span-2">{saveButton("Add lead")}</div>
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
                  To: {d.email || "their email"} · From: your own mailbox, or the Letting Experts sender if yours isn't connected
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
              {/* The real email, drawn by the same renderer as the send (10 Oct
                  2026, Rig run 2, P-012). This was a hand-built wireframe of
                  an account email that never existed - "Set up my account"
                  onto a mock page - while the one that goes asks them to reply. */}
              {welcomePreview === null ? (
                <p className="flex items-center gap-2 py-10 text-[12px] text-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" />
                  Drawing the email…
                </p>
              ) : "error" in welcomePreview ? (
                <p className="py-10 text-[12px] text-accent-dark">{welcomePreview.error}</p>
              ) : (
                <>
                  <p className="mb-2 text-[12px] font-semibold">{welcomePreview.subject}</p>
                  <iframe
                    title="The welcome email"
                    srcDoc={welcomePreview.html}
                    sandbox=""
                    className="h-[60vh] w-full rounded-xl border border-line/60 bg-white"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </aside>
    </div>
  );
}
