"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ListingAppraisal, { useListingAppraisal } from "@/components/listing/ListingAppraisal";
import ConfirmSheet from "@/components/ConfirmSheet";
import { dropJson } from "@/lib/page-cache";
import { APPS_BOARD_URL } from "@/lib/applications-read";
import RecordSidePanel, { type NoteRow, type PanelTab } from "@/components/RecordSidePanel";
import { MoveInPackCard } from "@/components/MoveInPack";
import CustomerUpdates from "@/components/CustomerUpdates";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PhotoLightbox from "@/components/PhotoLightbox";
import PropertyFile from "@/components/PropertyFile";
import RexWaitingChip from "@/components/RexWaitingChip";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import { Pill } from "@/components/Wire";
import { type SpineStop } from "@/components/StageSpine";
import { eventSentence, eventTone, type DealEvent } from "@/lib/business/deal-events";
import ContactBlock from "@/components/ContactBlock";
import LetContacts from "@/components/LetContacts";
import RightToRentField, { suggestedFor, type RtrShown, type RtrSuggested } from "@/components/RightToRentField";
import Guarantors from "@/components/Guarantors";
import PeopleDeck from "@/components/new-look/PeopleDeck";
import PlcOverlay from "@/components/plc/PlcOverlay";
import PushToPropoly from "@/components/propoly/PushToPropoly";
import CustomerUpdateSheet from "@/components/updates/CustomerUpdateSheet";
import ActivityList, { exactWhen } from "@/components/new-look/ActivityList";
import { GuarantorsToPropoly } from "@/components/LetPropoly";
import LetTenants from "@/components/LetTenants";
import { AddLandlord, LandlordsBox, PartyContact, PropolyLine, PropolySummary, sourceWords, type Party, type PeopleAnswer, type Picture } from "@/components/LetPeople";
import FileDocuments from "@/components/FileDocuments";
import TenantDocuments from "@/components/pretenancy/TenantDocuments";
import IntroKeys from "@/components/listing/IntroKeys";
import NextStepCard, { type NextAction } from "@/components/NextStepCard";
import AdvertOffline from "@/components/listing/AdvertOffline";
import HandoffPanel from "@/components/HandoffPanel";
import { cardStatus, stageStatus } from "@/components/applications/LetsBoard";
import { PORTAL_STAGES, propolyDealUrl, stagesFor } from "@/lib/business/propoly-stages";
import { CANCEL_REASONS, CANCEL_WORDS } from "@/lib/let-cancel-words";
import { isScottish } from "@/lib/property-flags";
import { Badge, Ico, Menu, Tabs, type MenuItem, type Tone } from "@/components/new-look/Parts";
import PhotoGrid from "@/components/new-look/PhotoGrid";
import SteveFace from "@/components/SteveFace";
import { AMBER_PILL, GREEN_PILL, RED_PILL } from "@/components/applications/LetsBoard";
import { applicantKey } from "@/lib/lead-tenant-key";
import FieldDate from "@/components/FieldDate";
import LetTenantCard from "@/components/new-look/LetTenantCard";
import HouseholdOnHome, { type Household } from "@/components/HouseholdOnHome";
import { isLetField, LET_FIELD_KIND, LET_FIELD_LABEL, sameLetValue, sayLetValue, type LetEditEvent, type LetEditNow, type LetField } from "@/lib/let-edit-fields";
import type { PreTenancyDeal } from "@/app/api/pretenancy/deals/route";

type JourneyAction = NextAction;
type Journey = {
  ok: boolean;
  error?: string;
  stops?: SpineStop[];
  actions?: JourneyAction[];
  flags?: string[];
  deal?: { id: string; stage: string; url: string } | null;
  plc?: { id: string; state: string; who: string } | null;
  inPropoly?: { url: string | null; how: "open" | "finished" | "pushed" | "found" } | null;
  history?: DealEvent[];
  /** Intro only (lib/intro-only): the let ends at the landlord's yes. */
  introOnly?: { done: boolean } | null;
};

/**
 * A let, the whole of it, on one page (James, 12 Oct 2026): "rather than
 * having a small pop-out telling them where they're at, I want a full
 * thing" - in the same layout as a Portfolio home and a listing. The photo
 * and who it is for beside the actions; the facts and the people beside the
 * next step; the record's sections beside where it is up to.
 *
 * Two records make a let. The application (REX's, or the OS's own offer) is
 * the file; the Propoly deal Kirstie runs is the eight pre-tenancy stages.
 * The page takes either or both: an application with its deal, or - for a
 * home let through Propoly alone - the deal by itself.
 */

/** "Today 14:02", "Tue 2 Sep" - how a comment's time reads in the thread. */
function whenWords(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** "1 Oct 2026" from an ISO date; anything else comes back as it was. */
function niceDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(d.valueOf()) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export interface AppActivity {
  when: string;
  what: string;
  by: string;
  /** A typed note from a person, rather than something the system did. */
  note?: boolean;
}

/** One person on the application, and how to reach them. */
export interface AppPerson {
  name: string;
  contactId: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  /* From the application form, where REX holds it. Only the lead applicant
     is ever asked the four questions - the form stops after them. */
  income?: number | null;
  employment?: string | null;
  job?: string | null;
  company?: string | null;
  rightToRent?: boolean | null;
  landlordRef?: boolean | null;
  guarantor?: boolean | null;
  adverseCredit?: boolean | null;
}

export interface AppRecord {
  id: string;
  tenant: string;
  /** Everyone on it, so their name can be a way through to their file rather
   *  than dead text (James, 10 Sep 2026). */
  applicants?: AppPerson[];
  property: string;
  /** A tenant swap: what the person moving in pays by themselves, "£650". */
  swapPortion?: string | null;
  /** swap / add / rereference (lib/tenant-swaps, 19 Oct 2026). */
  swapKind?: string | null;
  /** REX property id, when the application carries one - the property file hangs off it. */
  propertyId?: string | null;
  /** The listing it was let from, for "Open the listing". */
  listingId?: string | null;
  locality: string;
  image: string | null;
  rent: string;
  moveIn: string;
  /**
   * The application's own figures, before anything put right in the OS, as
   * stored strings (lib/let-edit-fields), and what the OS holds over them
   * (lib/let-edits, 1 Nov 2026). The new look's The Deal reads these.
   */
  figures?: { moveIn: string | null; rent: string | null; holdingFee: string | null; termMonths: string | null };
  osEdits?: Partial<Record<LetField, { value: string | null; by: string; at: string }>> | null;
  stageKey: string;
  ticked: number;
  agent: string;
  flag?: string;
  activity?: AppActivity[];
}

export interface Stage {
  key: string;
  label: string;
  blurb: string;
}

/**
 * A checklist item carries its own state.
 *
 * It used to be a bare string plus a count, which only works when the items
 * are done in order. The four checks on an application - right to rent,
 * landlord reference, guarantor, credit - are answered independently, and a
 * count of three would have silently ticked the wrong three.
 */
export interface Check {
  label: string;
  done: boolean;
  /** Why it isn't ticked, when that's worth saying. */
  note?: string;
}

/**
 * What the application is waiting on - the answer to "do I need to act?"
 *
 * Keyed on REX's OWN application statuses, because that is the record this
 * drawer opens. The eight pre-tenancy stages (holding fee, referencing, PLC,
 * deposit, move day) belong to the Propoly deal that gets created once an
 * application is accepted - a different record, joined in by the journey.
 */
const NEXT_ACTION: Record<string, { label: string; do: string; who: string }> = {
  received: { label: "Received", do: "Put it to the landlord - offer, income, and anything they've disclosed.", who: "Us" },
  communicated: { label: "With the landlord", do: "The landlord has it. Chase for a decision if it's been more than a day.", who: "Landlord" },
  /* It said "Take the holding deposit and open the deal. Let the other
     applicants know." until 16 Sep 2026, and no screen does either. The fee
     is Propoly's stop on the track; telling the others is still a phone call
     or an email from the agent. */
  accepted: { label: "Accepted", do: "Check the handover and start the PLC check. The holding fee shows on the track below once it's paid. Let the other applicants on this home know it's gone.", who: "Us" },
  unsuccessful: { label: "Unsuccessful", do: "Nothing outstanding. Tell them why if they haven't been told.", who: "—" },
};


/* ── The page's boxes, Portfolio's ────────────────────────────────────── */
const pop =
  "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [&:hover:not(:has(.fixed))]:-translate-x-[3px] [&:hover:not(:has(.fixed))]:-translate-y-[3px] [&:hover:not(:has(.fixed))]:shadow-[6px_6px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]";
const box = `${pop} rounded-2xl border border-line/70 bg-white`;
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const chip = "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-white px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40";
const tileBase =
  "relative flex h-full min-h-[72px] w-full flex-col items-start justify-between gap-2 rounded-xl border border-line/60 bg-white p-3.5 text-left text-[12.5px] font-semibold leading-tight";
const tileLive = `${tileBase} transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]`;
const tileIcon = (name: string, dark = false) => (
  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${dark ? "bg-[var(--brown)] text-white" : "bg-accent-soft text-accent-dark"}`}><DoodleIcon name={name} size={14} /></span>
);

/**
 * One action tile. Every let shows the same eight, always in the same place
 * (James, 12 Oct 2026: "these should always show ... the ones that are done
 * will blank out, or if they're not relevant at this stage", with a footnote
 * saying why - "PLC check done", and a tick).
 */
function Tile({ icon, label, sub, dark, off, done, onClick, href, steve }: {
  icon: string;
  label: string;
  sub: string;
  dark?: boolean;
  /** Not available now: greyed, with `sub` saying why. */
  off?: boolean;
  /** Done: greyed, with a tick by `sub`. */
  done?: boolean;
  onClick?: () => void;
  href?: string;
  steve?: string;
}) {
  const inner = (
    <>
      {tileIcon(icon, dark && !off && !done)}
      <span className="block w-full min-w-0">
        <span className="block">{label}</span>
        <span className={`mt-0.5 flex items-start gap-1 text-[11.5px] font-normal leading-snug ${done ? "text-[#56634a]" : "text-muted"}`}>
          {done && <span aria-hidden>✓</span>}
          <span className="line-clamp-2 min-w-0">{sub}</span>
        </span>
      </span>
    </>
  );
  if (off || done) {
    return (
      <div aria-disabled="true" title={sub} data-steve={steve} className={`${tileBase} cursor-default border-dashed bg-page/60 text-ink/60 [&>span:first-child]:opacity-60`}>
        {inner}
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} data-steve={steve} className={tileLive}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" data-steve={steve} onClick={onClick} className={tileLive}>
      {inner}
    </button>
  );
}

/** A dot in the stop's tone: done, needs a look, or quiet. */
const toneDot = (tone?: string) => (tone === "ok" ? "bg-emerald-600" : tone === "warn" ? "bg-amber-500" : "bg-line");

/** Where it's up to, across the box: the stops in a line, a short note under each. */
function Spine({ stops }: { stops: SpineStop[] }) {
  const cols = { gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` };
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-1">
      <ol className="grid" style={{ ...cols, minWidth: `${Math.max(560, stops.length * 78)}px` }}>
        {stops.map((s, i) => {
          const done = s.state === "done";
          const cur = s.state === "current";
          const off = s.state === "off";
          return (
            <li key={s.id} className="relative flex min-w-0 flex-col items-center px-1 text-center">
              {i > 0 && (
                <span aria-hidden className={`absolute left-[-50%] right-[50%] top-[13px] ${done || cur ? "h-0.5 bg-accent-dark/60" : "h-0 border-t-2 border-dashed border-line/80"}`} />
              )}
              <span
                className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold ${
                  done ? "bg-accent-dark/70 text-white" : cur ? "bg-accent-dark text-white" : off ? "border-[1.5px] border-line/60 bg-line/30 text-muted" : "border-[1.5px] border-line/80 bg-white text-muted"
                }`}
              >
                {done ? "✓" : off ? "–" : i + 1}
              </span>
              <p className={`mt-1.5 text-[11.5px] leading-tight ${cur ? "font-semibold" : "text-muted"}`}>{s.label}</p>
              <p className={`mt-0.5 flex w-full min-w-0 items-center justify-center gap-1 text-[10.5px] leading-snug ${cur ? "text-accent-dark" : "text-muted"}`} title={s.sub ?? undefined}>
                {s.sub && (done || cur) ? <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot(s.tone)}`} /> : null}
                <span className="truncate">{done || cur ? s.sub || (cur ? "Here now" : " ") : " "}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Kirstie's eight, read off the deal alone - for a let with no application. */
function dealStops(d: PreTenancyDeal): SpineStop[] {
  /* No holding fee stop in Scotland (16 Oct 2026, lib/business/propoly-stages). */
  const track = stagesFor(isScottish(d.app.locality, d.app.propertyName));
  const at = Math.max(0, track.findIndex((s) => s.key === d.effectiveStatusKey));
  return track.map((s, i) => {
    const st = i <= at ? stageStatus(d, s.key) : null;
    return {
      id: s.key,
      /* "Deal started" read as a separate job (8 Nov 2026): on a let that is
         only in Propoly it is simply that - it's in Propoly. */
      label: s.key === "deal_started" ? "In Propoly" : s.label,
      about: s.blurb,
      state: i < at ? "done" : i === at ? "current" : "upcoming",
      sub: st?.text,
      tone: st ? (/f1f4ec/.test(st.tone) ? "ok" : /fdefec|amber/.test(st.tone) ? "warn" : undefined) : undefined,
    } as SpineStop;
  });
}

/* ── the drawers ──────────────────────────────────────────────────────── */

/** Slides in from the right over the page; Escape or the scrim closes it. */
function Drawer({ open, width = "max-w-[560px]", label, onClose, children }: { open: boolean; width?: string; label: string; onClose: () => void; children: React.ReactNode }) {
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
    <div className="fixed inset-0 z-[130]">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-label={label}
        className={`absolute inset-y-0 right-0 flex w-full ${width} flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[380ms] sm:rounded-l-2xl ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {children}
      </aside>
    </div>
  );
}

function DrawerHead({ icon, title, sub, onClose, children }: { icon: string; title: string; sub?: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-line/70 px-5 pb-4 pt-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={15} /></span>
          <div className="min-w-0">
            <h2 className="hand truncate text-[21px] leading-tight">{title}</h2>
            {sub && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{sub}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted hover:text-ink">✕</button>
      </div>
      {children}
    </div>
  );
}

/** Documents rise from the bottom (James, 12 Oct 2026): a big drop space, click off to close. */
function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[130]">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <section
        role="dialog"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[86vh] w-full max-w-[980px] flex-col overflow-hidden rounded-t-[26px] bg-page shadow-[0_-24px_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[380ms] ${shown ? "translate-y-0" : "translate-y-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-line" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-3 pt-3">
          <h2 className="hand text-[21px] leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">{children}</div>
      </section>
    </div>
  );
}

/* ── the email builder: customer updates and reminders ────────────────── */

/* The customer update and reminder lists live with the pop-out now
   (components/updates/CustomerUpdateSheet, 8 Nov 2026). */

type LetPerson = { name: string; email: string | null; phone: string | null; contactId: string | null; isPrimary: boolean };
type LetLandlord = { name: string; email: string | null; phone: string | null; contactId: string | null; from?: "rex" | "record" };
/* `failed` (4 Nov 2026): who is on the let couldn't be read at all. Not the
   same as "no landlord": 12 South Chesters Lane's page and Steve both said
   there was none, and asked Lianna to add one, when the read had been
   refused - her landlord was on the listing all along. */
type LetInfo = { tenants: LetPerson[]; landlord: LetLandlord | null; landlordProblem: string | null; listingId: string | null; people?: Party[]; homeKey?: string; homePage?: string | null; household?: Household | null; failed?: string };
type Cancellation = { reason: string; note: string; by: string; at: string };
type LetDetails = { canEdit: boolean; dealId: string | null; edits: Partial<Record<LetField, LetEditNow>>; history: LetEditEvent[] };

/** What the deal itself holds for a field (as lib/let-edits dealValue), as a stored string. */
function dealFigure(d: PreTenancyDeal, f: LetField): string | null {
  const mark = d.letEdits?.[f];
  if (mark) return mark.propoly;
  const s = (n: number | null | undefined) => (n == null ? null : String(n));
  switch (f) {
    case "moveIn": return d.app.startDate ? d.app.startDate.slice(0, 10) : null;
    case "rent": return s(d.app.offer);
    case "deposit": return s(d.app.propoly?.deposit);
    case "holdingFee": return s(d.app.propoly?.holdingFee);
    case "termMonths": return s(d.app.agreementMonths);
  }
}

/* ── cancel the deal ──────────────────────────────────────────────────── */

function CancelDeal({ letId, property, cancelled, onCancelled, onTell, onClose }: {
  letId: string;
  property: string;
  cancelled: Cancellation | null;
  onCancelled: (c: Cancellation) => void;
  /** After it's cancelled: write to the tenant or the landlord. */
  onTell: (role: "tenant" | "landlord") => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = Boolean(reason) && (reason !== "Something else" || note.trim().length > 0) && typed.trim().toLowerCase() === CANCEL_WORDS.toLowerCase();

  async function go() {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, note, confirm: typed }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; cancelled?: Cancellation };
      if (!j.ok || !j.cancelled) throw new Error(j.error ?? "That didn't save. Nothing has been cancelled.");
      onCancelled(j.cancelled);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't save. Nothing has been cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-[560px] rounded-2xl border border-line/70 bg-page p-6 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] leading-tight">{cancelled ? "Deal cancelled" : "Cancel the deal"}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">{property}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        {cancelled ? (
          <>
            <p className="rounded-xl bg-[#f1f4ec] px-4 py-3 text-[12.5px] text-[#56634a]">
              ✓ Cancelled by {cancelled.by}: {cancelled.reason.toLowerCase()}{cancelled.note ? `. ${cancelled.note}` : ""}. Kirstie has it on her feed to cancel in Propoly.
            </p>
            <p className="mt-4 text-[12.5px] font-semibold">Tell them now?</p>
            <p className="mt-0.5 text-[12px] text-muted">The email is written for you to change before it goes.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onTell("tenant")} className={tileLive}>{tileIcon("user")}<span>Update the tenant</span></button>
              <button type="button" onClick={() => onTell("landlord")} className={tileLive}>{tileIcon("home")}<span>Update the landlord</span></button>
            </div>
          </>
        ) : (
          <>
            <p className={`${eyebrow} mb-2`}>Why</p>
            <div className="flex flex-wrap gap-2">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  aria-pressed={reason === r}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${reason === r ? "border-accent-dark bg-accent-soft/70 font-semibold" : "border-line/70 bg-white hover:border-ink/40"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className={eyebrow}>{reason === "Something else" ? "What happened" : "Anything to add (optional)"}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1.5 w-full resize-y rounded-xl border border-line/70 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-ink" />
            </label>
            <label className="mt-4 block">
              <span className="text-[12.5px]">
                Type <b className="font-semibold">{CANCEL_WORDS}</b> to cancel it. It comes off Applications and Kirstie is told to cancel it in Propoly.
              </span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={CANCEL_WORDS} className="mt-1.5 w-full rounded-xl border border-line/70 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-ink" />
            </label>
            {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium hover:border-ink/40">Keep the deal</button>
              <button type="button" disabled={!ready || busy} onClick={() => void go()} className="rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40">
                {busy ? "Cancelling…" : "Cancel the deal"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────── */

export default function ApplicationDrawer({
  app,
  deal = null,
  checklist,
  aside,
  backHref = "/applications",
  onStep,
  stepLabel,
  initialTab = null,
  newLook = false,
}: {
  /** The application. Null for a home let through Propoly alone. */
  app: AppRecord | null;
  /** Kirstie's deal for this let, once it has one. */
  deal?: PreTenancyDeal | null;
  stages?: Stage[];
  checklist: Check[];
  /** Anything the stage itself calls for - the handover packet, once accepted. */
  aside?: React.ReactNode;
  backHref?: string;
  onStep?: (delta: number) => void;
  stepLabel?: string | null;
  initialTab?: string | null;
  /** The new look (lib/new-look "application"): the design's record page. */
  newLook?: boolean;
}) {
  /* The page's own id: the application's, or the deal's for a Propoly-only let. */
  const letId = app?.id ?? deal?.app.id ?? "";
  /* The Auto save chip by the back link (23 Sep 2026). */
  const saves = useSaveScope(letId || null);
  const [leadIds, setLeadIds] = useState<Record<string, string>>({});
  /* A lead tenant changed here (lib/lead-tenant), shown at once rather than after a reload. */
  const [leadKey, setLeadKey] = useState<string | null>(null);
  const [leadBusy, setLeadBusy] = useState<string | null>(null);
  const peopleRead: AppPerson[] = app?.applicants?.length
    ? app.applicants
    : app
      ? [{ name: app.tenant, contactId: null, email: null, phone: null, isPrimary: true }]
      : (deal?.app.tenants ?? []).map((t) => ({ name: t.name, contactId: null, email: t.email ?? null, phone: t.phone ?? null, isPrimary: Boolean(t.isPrimary) }));
  const people: AppPerson[] = (() => {
    const at = leadKey ? peopleRead.findIndex((p) => applicantKey(p) === leadKey) : -1;
    if (at < 0) return peopleRead;
    const out = peopleRead.map((p, i) => ({ ...p, isPrimary: i === at }));
    out.unshift(...out.splice(at, 1));
    return out;
  })();
  /* Only on a let the OS holds (not a Propoly-only one), with more than one tenant. */
  const canChangeLead = Boolean(app) && people.length > 1;

  useEffect(() => {
    const ids = people.map((p) => p.contactId).filter((x): x is string => Boolean(x));
    if (!ids.length) { setLeadIds({}); return; }
    let live = true;
    fetch(`/api/leads/by-contact?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setLeadIds(j.leads ?? {}); })
      .catch(() => { /* no file link; the card still shows who they are */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  /* Who is on the let, as the server holds it (lib/let-people), and whether
     it was cancelled - for the drawers, the email builder and Cancel deal. */
  const [info, setInfo] = useState<LetInfo | null>(null);
  /* Everyone on the let, Call / WhatsApp / Email, from the top (Sean McMahon, ticket 4171e58c). */
  const [contactsOpen, setContactsOpen] = useState(false);
  /* What the market appraisal behind the home learned, on the let too (James, 10 Nov 2026). */
  const letAppraisal = useListingAppraisal(info?.listingId ?? null);
  const [cancelled, setCancelled] = useState<Cancellation | null>(null);
  /* Each person against the let's Propoly deal (lib/let-propoly-sync, 20 Oct 2026). */
  const [picture, setPicture] = useState<Picture | null>(null);
  /* The guarantors as the Guarantors card last read them: the Propoly box follows. */
  const [guarantorSig, setGuarantorSig] = useState("");
  /* A change to the people answers with the let as it now stands. */
  const takePeople = useCallback((j: PeopleAnswer) => {
    if (!j?.ok || !j.let) return;
    setInfo(j.let as unknown as LetInfo);
    setPicture(j.propoly ?? null);
  }, []);
  const reloadPeople = useCallback(() => {
    if (!letId) return;
    fetch(`/api/applications/${encodeURIComponent(letId)}/people`, { cache: "no-store" })
      .then((r) => r.json() as Promise<PeopleAnswer>)
      .then(takePeople)
      .catch(() => { /* the cards keep what they show */ });
  }, [letId, takePeople]);
  const [peopleTry, setPeopleTry] = useState(0);
  useEffect(() => {
    if (!letId) return;
    let live = true;
    fetch(`/api/applications/${encodeURIComponent(letId)}/people`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; let?: LetInfo; cancelled?: Cancellation | null; propoly?: Picture | null }) => {
        if (!live) return;
        if (j.ok && j.let) setInfo(j.let);
        else setInfo({ tenants: [], landlord: null, landlordProblem: null, listingId: null, failed: j.error ?? "Who is on this let couldn't be read just now." });
        setPicture(j.propoly ?? null);
        setCancelled(j.cancelled ?? null);
      })
      .catch(() => live && setInfo({ tenants: [], landlord: null, landlordProblem: null, listingId: null, failed: "Who is on this let couldn't be read just now." }));
    return () => { live = false; };
  }, [letId, peopleTry]);

  /* The let's figures as put right in the OS, and every change made on it
     (lib/let-edits, 1 Nov 2026): the new look's Edit on The Deal. */
  const [details, setDetails] = useState<LetDetails | null>(null);
  const [detailsTick, setDetailsTick] = useState(0);
  useEffect(() => {
    if (!letId || !newLook) return;
    let live = true;
    fetch(`/api/applications/${encodeURIComponent(letId)}/details`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: LetDetails & { ok?: boolean }) => { if (live && j?.ok) setDetails({ canEdit: Boolean(j.canEdit), dealId: j.dealId ?? null, edits: j.edits ?? {}, history: j.history ?? [] }); })
      .catch(() => { /* the figures still show as read; Edit waits for this */ });
    return () => { live = false; };
  }, [letId, newLook, detailsTick]);
  const [figEdit, setFigEdit] = useState(false);
  const [figDraft, setFigDraft] = useState<Partial<Record<LetField, string>> | null>(null);
  const [figFrom, setFigFrom] = useState<Partial<Record<LetField, string>> | null>(null);
  const [figSave, setFigSave] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [figErr, setFigErr] = useState<string | null>(null);

  /* Each tenant's right to rent expiry, recorded on the let (lib/application-rtr,
     15 Oct 2026). Kept apart from the yes/no answer it sits beside. */
  const [rtr, setRtr] = useState<RtrShown[]>([]);
  /* Pre-tenancy checks each date (Kirstie, ticket 066bb29e, 16 Oct 2026). */
  const [rtrCanVerify, setRtrCanVerify] = useState(false);
  /* A date the PLC pack already read, to fill the field in (Kirstie, ticket 494b1e2e). */
  const [rtrPack, setRtrPack] = useState<RtrSuggested[]>([]);
  useEffect(() => {
    if (!letId) return;
    let live = true;
    fetch(`/api/applications/${encodeURIComponent(letId)}/right-to-rent`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && Array.isArray(j.records)) { setRtr(j.records); setRtrCanVerify(Boolean(j.canVerify)); setRtrPack(Array.isArray(j.fromPack) ? j.fromPack : []); } })
      .catch(() => { /* the yes/no still shows; the date just isn't added */ });
    return () => { live = false; };
  }, [letId]);
  const rtrOf = (p: { name: string; email?: string | null }) =>
    rtr.find((r) => (p.email && r.tenantEmail && r.tenantEmail.toLowerCase() === p.email.toLowerCase()) || r.tenant.trim().toLowerCase() === p.name.trim().toLowerCase()) ?? null;
  const rtrKeep = (r: RtrShown) => setRtr((all) => [...all.filter((x) => x.tenant.trim().toLowerCase() !== r.tenant.trim().toLowerCase()), r]);
  async function saveRtr(tenant: string, until: string | null, noTimeLimit: boolean): Promise<string | null> {
    if (!letId) return "This let has no reference to save against.";
    const j = await fetch(`/api/applications/${encodeURIComponent(letId)}/right-to-rent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant, until, noTimeLimit }),
    }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) return j?.error ?? "That couldn't be saved just now. Try again in a minute.";
    rtrKeep(j.record as RtrShown);
    return null;
  }

  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<AppActivity[] | null>(null);
  const [commentRows, setCommentRows] = useState<NoteRow[] | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [journeyTick, setJourneyTick] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    let live = true;
    if (journeyTick === 0) setJourney(null);
    fetch(`/api/applications/${encodeURIComponent(app.id)}/journey`)
      .then((r) => r.json())
      .then((j: Journey) => live && setJourney(j))
      .catch(() => live && setJourney({ ok: false, error: "Couldn't read the journey." }));
    return () => {
      live = false;
    };
  }, [app?.id, journeyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const [confirming, setConfirming] = useState<string | null>(null);
  /* A test application's step that a real one takes elsewhere (lib/test-overlay),
     or the agent's Accept / Decline on a real offer (lib/offer-decisions). */
  const play = async (a: JourneyAction) => {
    if (!app || (!a.test && !a.decide) || playing) return;
    const declining = a.test === "decline" || a.decide === "declined";
    if (declining && confirming !== a.id) {
      setConfirming(a.id);
      return;
    }
    setConfirming(null);
    setPlaying(a.id);
    setPlayError(null);
    try {
      const r = a.decide
        ? await fetch("/api/offers/decide", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ref: app.id.startsWith("os:") ? app.id : `rex:${app.id}`, decision: a.decide }),
          })
        : await fetch(`/api/applications/${encodeURIComponent(app.id)}/test`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: a.test }),
          });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setPlayError(j.error ?? "That didn't work.");
      else setJourneyTick((n) => n + 1);
    } catch {
      setPlayError("That didn't go through. Try again.");
    } finally {
      setPlaying(null);
    }
  };

  /* Comments - on the application, or the deal for a Propoly-only let. */
  useEffect(() => {
    if (!letId) return;
    let live = true;
    setComments(null);
    setCommentRows(null);
    fetch(`/api/applications/${encodeURIComponent(letId)}/comments`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; comments?: { id?: string; body: string; authorName: string; createdAt: string }[] }) => {
        if (!live) return;
        const list = j.comments ?? [];
        setComments(list.map((c) => ({ when: whenWords(c.createdAt), what: c.body, by: c.authorName, note: true })));
        setCommentRows(list.map((c, i) => ({ id: c.id ?? `${c.createdAt}-${i}`, author: c.authorName, when: whenWords(c.createdAt), text: c.body })).reverse());
      })
      .catch(() => { if (live) { setComments([]); setCommentRows([]); } });
    return () => {
      live = false;
    };
  }, [letId]);

  async function makeLead(p: AppPerson): Promise<void> {
    if (!letId || leadBusy) return;
    const key = applicantKey(p);
    setLeadBusy(key);
    const settle = saves.reporter.begin("Lead tenant");
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) {
        settle({ ok: false, problem: j?.error ?? "That didn't save." });
        return;
      }
      setLeadKey(key);
      /* The lead reads first, so an open tenant panel follows them there. */
      setPerson((cur) => (cur?.role === "tenant" ? { role: "tenant", index: 0 } : cur));
      settle({ ok: true });
    } catch {
      settle({ ok: false, problem: "That didn't save. Try again." });
    } finally {
      setLeadBusy(null);
    }
  }

  async function addComment(text: string): Promise<boolean> {
    const t = text.trim();
    if (!letId || !t) return false;
    const settle = saves.reporter.begin("Comment");
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; comment?: { id?: string; body: string; authorName: string; createdAt: string } } | null;
      if (!r.ok || !j?.ok || !j.comment) {
        settle({ ok: false, problem: j?.error ?? "That didn't save." });
        return false;
      }
      const c = j.comment;
      setComments((cs) => [...(cs ?? []), { when: whenWords(c.createdAt), what: c.body, by: c.authorName, note: true }]);
      setCommentRows((cs) => [{ id: c.id ?? c.createdAt, author: c.authorName, when: whenWords(c.createdAt), text: c.body }, ...(cs ?? [])]);
      setDraft("");
      settle({ ok: true });
      return true;
    } catch {
      settle({ ok: false, problem: "the connection dropped." });
      return false;
    }
  }

  /* ‹ › on the keyboard, never while typing or with a pop-up open. */
  useEffect(() => {
    if (!onStep) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);

  /* The home's photos, from its listing. */
  const photoListing = app?.listingId ?? deal?.app.listingId ?? info?.listingId ?? null;
  const [gallery, setGallery] = useState<string[] | null>(null);
  /* What we do for the landlord, off the same listing read: until a deal is
     in Propoly it is the only place that says (Sean, 15 Oct 2026: a let only
     read "Not known yet"). */
  const [listingService, setListingService] = useState<string | null>(null);
  const [listingDeposit, setListingDeposit] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  useEffect(() => {
    if (!photoListing) return;
    let live = true;
    fetch(`/api/listings/details?id=${encodeURIComponent(photoListing)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; details?: { images?: { url: string; priority: number }[]; service?: string | null; deposit?: number | null } }) => {
        if (!live || !j.ok) return;
        if (j.details?.service) setListingService(j.details.service);
        if (j.details?.deposit != null) setListingDeposit(j.details.deposit);
        const urls = [...(j.details?.images ?? [])].sort((a, b) => a.priority - b.priority).map((m) => m.url).filter(Boolean);
        if (urls.length) setGallery(urls);
      })
      .catch(() => { /* the record's own photo stays */ });
    return () => { live = false; };
  }, [photoListing]);

  /* ── what is open over the page ───────────────────────────────────── */
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [person, setPerson] = useState<{ role: "tenant" | "landlord"; index: number } | null>(null);
  const [personTab, setPersonTab] = useState<PanelTab>("messages");
  const [docsOpen, setDocsOpen] = useState(false);
  const [builder, setBuilder] = useState<{ mode: "update" | "reminder"; start?: { kind: string; to: string } | null } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const closePanel = useCallback(() => setPanel(null), []);
  const [propolyOpen, setPropolyOpen] = useState(false);
  const closePropoly = useCallback(() => setPropolyOpen(false), []);
  const closePerson = useCallback(() => { setPerson(null); setPersonTab("messages"); }, []);
  const closeDocs = useCallback(() => setDocsOpen(false), []);
  const closeBuilder = useCallback(() => setBuilder(null), []);
  /* The new look's own: its tabs, the photo grid and the note being written. */
  type NlTab = "overview" | "people" | "documents" | "notes" | "activity";
  const [nlTab, setNlTab] = useState<NlTab>(() => (["people", "documents", "notes", "activity"].includes(initialTab ?? "") ? (initialTab as NlTab) : "overview"));
  const [gridFrom, setGridFrom] = useState<DOMRect | null>(null);
  const heroRef = useRef<HTMLButtonElement>(null);
  const [noteBusy, setNoteBusy] = useState(false);

  /* ── what the page says ─────────────────────────────────────────────── */
  const action = app ? NEXT_ACTION[app.stageKey] : undefined;
  const ticked = checklist.filter((c) => c.done).length;
  const others = Math.max(0, people.length - 1);
  const stops: SpineStop[] | null = journey?.ok ? journey.stops ?? null : !app && deal ? dealStops(deal) : null;
  const hereIdx = stops ? stops.findIndex((s) => s.state === "current") : -1;
  const here = stops ? (hereIdx >= 0 ? stops[hereIdx] : stops[stops.length - 1]) : null;
  const dealHere = deal ? PORTAL_STAGES.find((s) => s.key === deal.effectiveStatusKey) ?? null : null;
  const stageLabel = cancelled ? "Cancelled" : here?.label ?? dealHere?.label ?? action?.label ?? "In progress";
  const forYou = journey?.ok ? (journey.actions ?? []).filter((a) => a.who === "you") : [];
  const waitingOn = forYou.length ? "you" : journey?.ok && journey.actions?.[0] ? { kirstie: "Kirstie", landlord: "the landlord", tenant: "the tenant", you: "you" }[journey.actions[0].who] : action?.who === "Us" ? "you" : action?.who === "Landlord" ? "the landlord" : null;
  const received = app?.activity?.find((a) => /received/i.test(a.what));
  const rent = app ? (/^£/.test(app.rent) ? app.rent.replace(/\s*pcm$/, "") : null) : deal?.app.offer != null ? `£${Math.round(deal.app.offer).toLocaleString("en-GB")}` : null;
  const per = !app && deal?.app.offerPeriod === "week" ? "pw" : "pcm";
  /* A recorded expiry means the check was made, whatever the notes say. */
  const answered = people.filter((p) => p.rightToRent === true || rtrOf(p)).length;
  const offerIn = app ? app.stageKey === "accepted" || app.stageKey === "communicated" : false;
  /* The PLC check starts from the application, or - for a home let through
     Propoly alone, agreed before the OS (Joe Patten's 340 Four Chimneys
     Crescent, 2 Nov 2026) - from the deal itself: a deal is an accepted let. */
  const plcStartHref = app ? `/plc/start?application=${encodeURIComponent(app.id)}` : deal ? `/plc/start?application=${encodeURIComponent(deal.app.id)}` : null;
  /* The PLC check opens over the let (James, 8 Nov 2026), not on a page of its own. */
  const [plcOpen, setPlcOpen] = useState(false);
  /* Push to Propoly as one pop-out (8 Nov 2026), from Next Up and the "Not in Propoly yet" chip. */
  const [pushOpen, setPushOpen] = useState(false);
  const plcReady = app ? offerIn : Boolean(deal);
  const lead = people.find((p) => p.isPrimary) ?? people[0];
  const name = app?.property ?? deal?.app.propertyName ?? "This let";
  /* "44 South Bridge (tenant swap)" in the heading (13 Oct 2026); the record keeps the plain address. */
  const isSwap = Boolean(app?.id.startsWith("swap:"));
  /* Add someone and Re-reference ride on the swap (19 Oct 2026): say which. */
  const swapWord = app?.swapKind === "add" ? "tenant added" : app?.swapKind === "rereference" ? "re-reference" : "tenant swap";
  const locality = app?.locality ?? deal?.app.locality ?? "";
  /* Right to Rent is England-only law: a Scottish let shows none (James, 15 Oct 2026). */
  const scottishLet = isScottish(locality, name);
  const image = app?.image ?? deal?.app.image ?? null;
  /* Every photo of the home, off its listing (James, 12 Oct 2026: "on
     Applications we only seem to show the one photo"), the one the record
     carries until they land. */
  const shots = gallery?.length ? gallery : (deal?.app.images?.length ? deal.app.images : image ? [image] : []);
  /* Once the let is in Propoly, Propoly's move-in day is the one the
     agreement is drawn on, so it is the one shown (Lianna, 30 Oct 2026, 12
     South Chesters Lane: Propoly had 9 November and the listing 10 November,
     yet the let read the tenant's first offer, 1 November, whatever was
     changed). Before the deal, the application's own date. */
  const moveIn = deal?.app.startDate ?? (app && app.moveIn !== "—" ? app.moveIn : null);
  /* The deposit, which the let never showed: Propoly's on the deal, the
     listing's before it. Zero deposit has no cash to take. */
  const depositText = deal?.app.propoly?.depositReplacement
    ? "Zero deposit (Flatfair)"
    : deal?.app.propoly?.deposit != null
      ? gbp(deal.app.propoly.deposit)
      : listingDeposit != null
        ? `${gbp(listingDeposit)} on the listing`
        : "Not set yet";
  const agent = app?.agent ?? deal?.agentName ?? "—";
  const dealStatus = deal ? cardStatus(deal, deal.effectiveStatusKey) : null;
  const flags = [...(journey?.ok ? journey.flags ?? [] : []), ...(deal?.flags ?? []).map((f) => f.label)].filter((f, i, all) => all.indexOf(f) === i);
  const plcState = journey?.ok ? journey.plc?.state ?? null : deal?.plc?.state ?? null;
  /* Intro only (16 Oct 2026): no PLC, no Propoly, no reminders - the file
     ends at the landlord's yes and says so. */
  const intro = journey?.ok ? journey.introOnly ?? null : null;
  /* IN PROPOLY OR NOT, at the top of every let (James, 13 Oct 2026): "if
     they're not on that step, you can't get to pushing it". Read off the
     journey's handover stop, which checks Propoly's deals each time the let
     opens - so a let already in Propoly, whoever put it there, says so and
     is never offered the push. Before the offer is accepted there is nothing
     to push yet. */
  const handoverStop = journey?.ok ? (journey.stops ?? []).find((x) => x.id === "handover") ?? null : null;
  const propoly: { state: "checking" | "in" | "push" | "early" | "unknown"; url: string | null; sub: string | null } = !app
    ? deal
      ? { state: "in", url: propolyDealUrl(deal.app.id), sub: null }
      : { state: "unknown", url: null, sub: null }
    : journey === null
      ? { state: "checking", url: null, sub: null }
      : journey.ok && journey.inPropoly
        ? {
            state: "in",
            url: journey.inPropoly.url,
            sub: { open: "In Propoly", finished: "Moved in through Propoly", pushed: "Pushed to Propoly", found: "Found in Propoly, keyed in by hand" }[journey.inPropoly.how],
          }
        : !journey.ok || !handoverStop
        ? { state: "unknown", url: null, sub: null }
        : handoverStop.state === "done"
          ? { state: "in", url: journey.deal?.url ?? null, sub: handoverStop.sub ?? null }
          : handoverStop.state === "current"
            ? { state: "push", url: null, sub: handoverStop.sub ?? null }
            : { state: "early", url: null, sub: null };
  const pushAction: NextAction = {
    id: "handover",
    label: "Push to Propoly",
    detail: "The landlord, the home and the deal with its tenants go over, using what Propoly already has where it has it, so nothing is made twice.",
    href: null,
    who: "you",
    push: true,
  };
  const plcDone = plcState === "approved";
  const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

  const facts = [
    { icon: "calendar", label: "Move-in", text: moveIn ? niceDate(moveIn) : "Not set yet" },
    ...(intro || isSwap ? [] : [{ icon: "wallet", label: "Deposit", text: depositText }]),
    { icon: "coin", label: isSwap ? "Rent, the home" : "Rent", text: rent ? `${rent} ${per}` : "No offer recorded" },
    ...(app?.swapPortion ? [{ icon: "coin", label: "Their portion", text: `${app.swapPortion} pcm` }] : []),
    { icon: "user", label: "Agent", text: agent },
    { icon: "home", label: "Service", text: intro ? "Marketing only" : deal?.serviceLevel ?? deal?.app.propoly?.service ?? (listingService ? listingService.charAt(0) + listingService.slice(1).toLowerCase() : "Not known yet") },
    ...(app
      ? [
          { icon: "target", label: "Came in", text: received ? niceDate(received.when) : "No date" },
          { icon: "checklist", label: "Checks", text: `${ticked} of ${checklist.length} done` },
          ...(scottishLet ? [] : [{ icon: "shield", label: "Right to rent", text: `${answered} of ${people.length}` }]),
        ]
      : []),
    { icon: "wallet", label: "Holding fee", text: intro ? "None - marketing only" : isSwap ? (app?.swapKind === "add" ? "None when adding a tenant" : `None on a ${swapWord}`) : scottishLet ? "None in Scotland" : deal ? stageStatus(deal, "holding_fee").text : "No deal yet" },
  ];

  /* The activity log, for the panel at the top: what the record holds, then
     what moved on the deal. */
  const activityLog = (
    <div className="space-y-5 px-1">
      <ul className="space-y-3">
        {[...(app?.activity ?? []).filter((a) => !a.note)].map((a, i) => (
          <li key={i} className="flex gap-3 text-[12.5px]">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
            <span>
              {a.what}
              <span className="block text-[10.5px] text-muted">{a.by} · {/^\d{4}-\d{2}-\d{2}/.test(a.when) ? niceDate(a.when.slice(0, 10)) : a.when}</span>
            </span>
          </li>
        ))}
      </ul>
      {journey?.ok && journey.history && journey.history.length > 0 ? (
        <div>
          <p className={eyebrow}>What moved · {journey.history.length}</p>
          <ol className="mt-2 space-y-1.5">
            {journey.history.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[12px] leading-snug">
                <span aria-hidden className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${toneDot(eventTone(e.event))}`} />
                <span className="min-w-0 flex-1">{eventSentence(e)}</span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-muted">{whenWords(e.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-[12px] text-muted">{app && journey === null ? "Reading what moved…" : "Nothing has moved on the deal yet."}</p>
      )}
    </div>
  );

  /* The tenant and the landlord, each in a drawer: their details on the
     left, and everything said with them - emails, texts, portal messages -
     on the right, with the let's notes. */
  const tenantShown = person?.role === "tenant" ? people[person.index] ?? people[0] ?? null : null;
  const tenantFile = tenantShown?.contactId ? leadIds[tenantShown.contactId] : null;
  /* Every landlord on the let (20 Oct 2026); the drawer shows the one picked. */
  const landlordsAll: Party[] = (info?.people ?? []).filter((p) => p.role === "landlord");
  const landlordParty: Party | null = person?.role === "landlord" ? landlordsAll[person.index] ?? landlordsAll[0] ?? null : null;
  const landlordShown = landlordParty ?? info?.landlord ?? null;
  const [addLandlordOpen, setAddLandlordOpen] = useState(false);
  /* The server's person for an applicant card, matched as the cards are named. */
  const partyFor = (p: { name: string; email?: string | null; contactId?: string | null }): Party | null => {
    const tenants = (info?.people ?? []).filter((x) => x.role === "tenant");
    /* By the let's own key first (lib/let-people tenantParty), so somebody
       whose name or email was changed on the let is still found. */
    const said = (p.email ?? p.name ?? "").trim().toLowerCase();
    const keys = [p.contactId && /^\d+$/.test(p.contactId) ? `rex:${p.contactId}` : null, `app:tenant:${said}`, `propoly:tenant:${said}`];
    return (
      tenants.find((x) => keys.includes(x.key)) ??
      tenants.find((x) => (p.email && x.email && x.email.toLowerCase() === p.email.toLowerCase()) || x.name.trim().toLowerCase() === p.name.trim().toLowerCase()) ??
      null
    );
  };

  /* Everything that opens over the page, the same in both looks. */
  const overlays = (
    <>
      {/* ── over the page ────────────────────────────────────────────────── */}

      {/* Activity and notes: a big pull-out from the right (James, 12 Oct
          2026: "a nice big pull-out drawer where they can put in all the
          comments"). Messages is the conversation with the lead tenant. */}
      <Drawer open={Boolean(panel)} label="Activity and notes" onClose={closePanel}>
        {panel && (
          <RecordSidePanel
            name={name}
            tab={panel}
            onTab={setPanel}
            onClose={closePanel}
            conversationUrl={letId && lead ? `/api/applications/${encodeURIComponent(letId)}/conversation?with=tenant&i=${Math.max(0, people.indexOf(lead))}` : null}
            noConversation="Nobody is held on this let yet."
            notes={commentRows}
            onAddNote={addComment}
            notePlaceholder="Add a note - chased the tenant, spoke to the landlord…"
            noteSaid={{ ok: true, text: "Kept on the let, for everyone who opens it." }}
            activity={activityLog}
          />
        )}
      </Drawer>

      {/* Push to Propoly from any stage of the let (James, 13 Oct 2026). The
          same push as Next Step: it checks the deal terms first and stops to
          ask which home if Propoly has more than one that could be it. */}
      <Drawer open={propolyOpen} label="Push to Propoly" onClose={closePropoly}>
        {propolyOpen && app && (
          <>
            <DrawerHead
              icon="rocket"
              title={propoly.state === "in" ? "In Propoly" : "Push to Propoly"}
              sub={
                propoly.state === "in"
                  ? `${propoly.sub ?? "Pushed"}. The deal link shows here once Propoly is next read.`
                  : propoly.state === "early"
                    ? "Not in Propoly. The offer has to be accepted before anything goes across."
                    : "Not in Propoly yet. Check the deal below, then push it - from any stage of the let."
              }
              onClose={closePropoly}
            />
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              {propoly.state === "early" ? (
                <p className="rounded-xl bg-white px-4 py-3.5 text-[12.5px] leading-relaxed text-muted">
                  Accept the offer first - from Next step on the page, or the Offers on its listing. Once it is accepted this button pushes it, whatever stage the let is at.
                </p>
              ) : (
                <div className="rounded-2xl border border-line/60 bg-white p-4 sm:p-5 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
                  <NextStepCard
                    applicationId={app.id}
                    actions={[pushAction]}
                    loading={false}
                    checks={[]}
                    onPlay={() => {}}
                    playing={null}
                    confirming={null}
                    onChanged={() => setJourneyTick((n) => n + 1)}
                  />
                </div>
              )}
              {propoly.state !== "early" && <HandoffPanel applicationId={app.id} />}
            </div>
          </>
        )}
      </Drawer>

      {addLandlordOpen && letId && (
        <AddLandlord
          letId={letId}
          hasDeal={Boolean(picture?.deal)}
          live={Boolean(picture?.live)}
          propertyAddress={[name, locality].filter(Boolean).join(", ")}
          onClose={() => setAddLandlordOpen(false)}
          onAdded={(j) => {
            setAddLandlordOpen(false);
            takePeople(j);
            const n = ((j.let?.people ?? []) as Party[]).filter((p) => p.role === "landlord").length;
            setPerson({ role: "landlord", index: Math.max(0, n - 1) });
          }}
        />
      )}

      {/* The tenant, or the landlord: details left, everything said right. */}
      <Drawer open={Boolean(person)} width="lg:max-w-[min(1040px,calc(100%-4rem))]" label={person?.role === "landlord" ? "The landlord" : "The tenant"} onClose={closePerson}>
        {person && (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 shrink-0 overflow-y-auto border-line/70 lg:w-[400px] lg:border-r">
              <DrawerHead
                icon={person.role === "landlord" ? "home" : "user"}
                title={person.role === "landlord" ? landlordShown?.name ?? "The landlord" : tenantShown?.name ?? "The tenant"}
                sub={person.role === "landlord" ? `Landlord of ${name}` : `${tenantShown?.isPrimary ? "Lead tenant" : "Tenant"} on ${name}`}
                onClose={closePerson}
              >
                {/* Every landlord, one press apart, and Add beside them (20 Oct 2026). */}
                {person.role === "landlord" && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {landlordsAll.length > 1 && landlordsAll.map((p, i) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPerson({ role: "landlord", index: i })}
                        className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${i === person.index ? "border-ink bg-ink text-page" : "border-line/70 bg-white hover:border-ink/40"}`}
                      >
                        {firstName(p.name) || `Landlord ${i + 1}`}
                      </button>
                    ))}
                    <button type="button" onClick={() => setAddLandlordOpen(true)} className="rounded-full border border-accent-dark/50 bg-white px-3 py-1 text-[11.5px] font-semibold text-accent-dark hover:bg-accent-soft">
                      + Add landlord
                    </button>
                  </div>
                )}
                {person.role === "tenant" && people.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {people.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPerson({ role: "tenant", index: i })}
                        className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${i === person.index ? "border-ink bg-ink text-page" : "border-line/70 bg-white hover:border-ink/40"}`}
                      >
                        {firstName(p.name) || `Tenant ${i + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </DrawerHead>
              <div className="space-y-4 px-5 py-5 sm:px-6">
                {person.role === "tenant" && tenantShown ? (
                  <>
                    <section className="rounded-xl border border-line/50 bg-white p-4">
                      {(() => {
                        const party = partyFor(tenantShown);
                        return party && letId ? (
                          <>
                            <p className={`${eyebrow} mb-1`}>Their details</p>
                            <PartyContact letId={letId} party={{ ...party, isPrimary: tenantShown.isPrimary }} propertyAddress={name} onAnswer={takePeople} showName />
                            {sourceWords(party) && <p className="mt-1.5 text-[11px] text-muted">{sourceWords(party)}</p>}
                            <PropolyLine letId={letId} party={party} picture={picture} onAnswer={takePeople} />
                          </>
                        ) : (
                          <ContactBlock
                            showName={false}
                            role={tenantShown.isPrimary ? "lead applicant" : "applicant"}
                            person={{ name: tenantShown.name, email: tenantShown.email ?? null, phone: tenantShown.phone ?? null }}
                            personRef={/^\d+$/.test(String(tenantShown.contactId ?? "")) ? `rex:${tenantShown.contactId}` : null}
                          />
                        );
                      })()}
                      {canChangeLead && !tenantShown.isPrimary && (
                        <button
                          type="button"
                          onClick={() => makeLead(tenantShown)}
                          disabled={Boolean(leadBusy)}
                          className="mt-3 rounded-full border border-line/70 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-ink/40 disabled:opacity-50"
                        >
                          {leadBusy === applicantKey(tenantShown) ? "Saving…" : `Make ${firstName(tenantShown.name) || "them"} the lead tenant`}
                        </button>
                      )}
                    </section>
                    {app && (
                      <section className="rounded-xl border border-line/50 bg-white p-4">
                        <p className={`${eyebrow} mb-3`}>Their application</p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
                          {([
                            ["Income", tenantShown.income != null ? `${gbp(tenantShown.income)} a year` : "Not recorded"],
                            ["Works", [tenantShown.employment, tenantShown.job].filter(Boolean).join(" · ") || "Not recorded"],
                            ["Employer", tenantShown.company || "Not recorded"],
                            ...(scottishLet
                              ? []
                              : [
                                  ["Right to rent", <Answer key="rtr" v={tenantShown.rightToRent || (rtrOf(tenantShown) ? true : tenantShown.rightToRent)} yes="Recorded" no="Not recorded" />],
                                ]),
                            ["Landlord reference", <Answer key="ref" v={tenantShown.landlordRef} />],
                            ["Guarantor", <Answer key="g" v={tenantShown.guarantor} yes="Available" no="None" />],
                            ["Adverse credit", <Answer key="ac" v={tenantShown.adverseCredit == null ? null : !tenantShown.adverseCredit} yes="None" no="Disclosed" />],
                            ["Moving in", moveIn ? niceDate(moveIn) : "Not set"],
                          ] as Array<[string, React.ReactNode]>).map(([k, v]) => (
                            <div key={k} className="min-w-0">
                              <dt className="text-[10.5px] text-muted">{k}</dt>
                              <dd className={`truncate font-semibold ${v === "Not recorded" ? "font-normal text-muted" : ""}`}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                        {!tenantShown.isPrimary && <p className="mt-3 text-[11px] text-muted">Only the lead applicant is asked the four questions - the form stops after them.</p>}
                      </section>
                    )}
                    {/* A field for the expiry, not only Steve (Kirstie, ticket
                        066bb29e): chased from /right-to-rent, checked by pre-tenancy. */}
                    {!scottishLet && letId && (
                      <section className="rounded-xl border border-line/50 bg-white p-4" data-steve="application.rtr-expiry">
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <p className={eyebrow}>Right to rent expiry</p>
                          <Link href="/applications/right-to-rent" className="text-[11px] text-muted underline hover:text-ink">Renewals list</Link>
                        </div>
                        <RightToRentField
                          key={`${tenantShown.name}-${rtrOf(tenantShown)?.id ?? "none"}`}
                          record={rtrOf(tenantShown)}
                          suggested={suggestedFor(rtrPack, tenantShown.name)}
                          save={(until, noTimeLimit) => saveRtr(tenantShown.name, until, noTimeLimit)}
                          canVerify={rtrCanVerify}
                          onVerified={rtrKeep}
                        />
                      </section>
                    )}
                    {tenantFile ? (
                      <Link href={`/leads?open=${encodeURIComponent(tenantFile)}`} className="inline-flex text-[12.5px] font-semibold text-accent-dark hover:underline">
                        Open their full file →
                      </Link>
                    ) : (
                      <p className="text-[11.5px] text-muted">No file for them in the OS yet.</p>
                    )}
                  </>
                ) : person.role === "landlord" ? (
                  info === null ? (
                    <p className="text-[12.5px] text-muted">Looking them up…</p>
                  ) : landlordShown ? (
                    <>
                      <section className="rounded-xl border border-line/50 bg-white p-4">
                        {landlordParty && letId ? (
                          <>
                            <p className={`${eyebrow} mb-1`}>Their details</p>
                            <PartyContact letId={letId} party={landlordParty} propertyAddress={[name, locality].filter(Boolean).join(", ")} onAnswer={takePeople} showName homeKey={info?.homeKey ?? null} />
                            {sourceWords(landlordParty) && <p className="mt-1.5 text-[11px] text-muted">{sourceWords(landlordParty)}</p>}
                            <PropolyLine letId={letId} party={landlordParty} picture={picture} onAnswer={takePeople} />
                          </>
                        ) : (
                          <ContactBlock
                            showName={false}
                            role="landlord"
                            person={{ name: landlordShown.name, email: landlordShown.email, phone: landlordShown.phone }}
                            personRef={landlordShown.contactId && (landlordShown as LetLandlord).from !== "record" ? `rex:${landlordShown.contactId}` : null}
                          />
                        )}
                        {!landlordParty && (landlordShown as LetLandlord).from === "record" && (
                          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{info.listingId ? "From the managed property record. They are not on the listing yet." : "From the home's record in the OS. Change them on the home's page."}</p>
                        )}
                      </section>
                      {info.listingId && (
                        <Link href={`/listings/${encodeURIComponent(info.listingId)}`} className="inline-flex text-[12.5px] font-semibold text-accent-dark hover:underline">
                          Open the listing →
                        </Link>
                      )}
                      {/* The managed home's own page too (Sean McMahon, ticket 4171e58c). */}
                      {info.homePage && (
                        <Link href={`/portfolio/${encodeURIComponent(info.homePage)}`} className="inline-flex text-[12.5px] font-semibold text-accent-dark hover:underline">
                          Open the home&apos;s page →
                        </Link>
                      )}
                    </>
                  ) : info.failed ? (
                    <div className="rounded-xl bg-[#f6f1ea] px-4 py-3 text-[12.5px] text-muted">
                      <p><b className="font-semibold text-ink">The landlord couldn&rsquo;t be read just now.</b> {info.failed} Nothing is missing from the file.</p>
                      <button type="button" onClick={() => setPeopleTry((n) => n + 1)} className="mt-2.5 rounded-full border border-line px-3.5 py-1.5 text-[12px] font-semibold text-ink">Try again</button>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#fdefec] px-4 py-3 text-[12.5px] text-[#9d4340]">
                      <p><b className="font-semibold">No landlord on this let.</b> Every let needs one. {info.landlordProblem ?? ""}</p>
                      <button type="button" onClick={() => setAddLandlordOpen(true)} className="mt-2.5 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page">Add the landlord</button>
                    </div>
                  )
                ) : null}
              </div>
            </div>
            <div className="min-h-[420px] min-w-0 flex-1">
              <RecordSidePanel
                name={person.role === "landlord" ? firstName(landlordShown?.name) || "the landlord" : firstName(tenantShown?.name) || "the tenant"}
                tab={personTab === "activity" ? "messages" : personTab}
                onTab={setPersonTab}
                onClose={closePerson}
                conversationUrl={
                  !letId
                    ? null
                    : person.role === "landlord"
                      ? landlordShown ? `/api/applications/${encodeURIComponent(letId)}/conversation?with=landlord&i=${person.index}` : null
                      : `/api/applications/${encodeURIComponent(letId)}/conversation?with=tenant&i=${person.index}`
                }
                noConversation={person.role === "landlord" ? "No landlord is held on the listing, so there's no conversation to show." : "Nobody is held for them on this let."}
                notes={commentRows}
                onAddNote={addComment}
                notePlaceholder="Add a note to the let…"
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* Add a document: up from the bottom, a big drop space. */}
      <BottomSheet open={docsOpen} title="Documents" onClose={closeDocs}>
        {/* What the tenants sent in themselves (lib/let-tenant-files, 30 Oct 2026). */}
        <TenantDocuments dealId={letId} className="mb-5" />
        <FileDocuments
          dropZone
          address={[name, locality].filter(Boolean).join(", ")}
          propertyId={app?.propertyId ?? null}
          from={{ kind: "application", id: letId }}
        />
        <div className="mt-6 border-t border-line/60 pt-5 [&>section]:rounded-none [&>section]:border-0 [&>section]:p-0">
          <p className={`${eyebrow} mb-3`}>The property file</p>
          <PropertyFile
            propertyId={app?.propertyId ?? null}
            address={app?.propertyId ? null : [name, locality].filter(Boolean).join(", ")}
            screen="the application"
          />
        </div>
      </BottomSheet>

      {/* Customer update and Send a reminder: a pop-out in steps (James, 8 Nov
          2026: the drawer from the side ran into Steve). */}
      {builder && (
        <CustomerUpdateSheet
          key={`${builder.mode}-${builder.start?.kind ?? ""}-${builder.start?.to ?? ""}`}
          letId={letId}
          mode={builder.mode}
          loading={info === null}
          address={[name, locality].filter(Boolean).join(", ")}
          start={builder.start}
          scotland={scottishLet}
          landlordProblem={info?.landlordProblem ?? null}
          parties={[
            ...(info?.tenants ?? []).map((t, i) => ({ key: `tenant:${i}`, role: "tenant" as const, index: i, name: t.name, email: t.email, phone: t.phone, tag: t.isPrimary ? "Lead tenant" : "Tenant" })),
            ...(() => {
              const all = (info?.people ?? []).filter((p) => p.role === "landlord");
              if (!all.length) return info?.landlord ? [{ key: "landlord", role: "landlord" as const, index: 0, name: info.landlord.name, email: info.landlord.email, phone: info.landlord.phone, tag: "Landlord" }] : [];
              return all.map((l, i) => ({ key: i ? `landlord:${i}` : "landlord", role: "landlord" as const, index: i, name: l.name, email: l.email, phone: l.phone, tag: "Landlord" }));
            })(),
          ]}
          onClose={closeBuilder}
          onLog={addComment}
        />
      )}

      {!newLook && lightbox != null && <PhotoLightbox photos={shots} start={lightbox} name={name} onClose={() => setLightbox(null)} />}

      {cancelOpen && (
        <CancelDeal
          letId={letId}
          property={name}
          cancelled={cancelled}
          onCancelled={(c) => {
            setCancelled(c);
            /* The board's held read is out of date the moment this lands. */
            dropJson(APPS_BOARD_URL);
          }}
          onTell={(role) => {
            setCancelOpen(false);
            setBuilder({ mode: "update", start: { kind: "cancelled", to: role === "landlord" ? "landlord" : "tenant:0" } });
          }}
          onClose={() => setCancelOpen(false)}
        />
      )}
    </>
  );

  /* ── THE NEW LOOK (lib/new-look "application", 23 Oct 2026) ──────────────
     The design's ApplicationDetail: the head with its jobs, the photos beside
     The Deal, the stops in a line, then tabs. Every read, write and drawer is
     the old page's own; only the markup and the paint are new. */
  if (newLook) {
    const pillTone = (pill: string): Tone => (pill === GREEN_PILL ? "good" : pill === RED_PILL ? "accent" : pill === AMBER_PILL ? "warning" : "neutral");
    const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";
    const quiet = (t: string) => /^(Not |No |None|—|-$|Reading)/.test(t);
    const receivedMs = received ? Date.parse(received.when) : NaN;
    const dayN = Number.isFinite(receivedMs) ? Math.max(1, Math.floor((Date.now() - receivedMs) / 86_400_000)) : null;
    const leadFirst = firstName(lead?.name) || "the tenant";
    const notesN = commentRows?.length ?? 0;
    const landlordFirst = landlordsAll[0] ?? null;
    const landlordName = landlordFirst?.name ?? info?.landlord?.name ?? null;
    const landlordPhone = landlordFirst?.phone ?? info?.landlord?.phone ?? null;
    const noLandlord = info !== null && !info.failed && !landlordsAll.length && !info.landlord;
    const plcHref = plcStartHref;
    const plcCan = Boolean(plcHref) && !intro && !cancelled && plcReady && !plcDone;
    const plcLabel = plcState && !plcDone ? "Carry on the PLC check" : "Start the PLC check";
    const plcSub = intro ? "Marketing only - the landlord's" : cancelled ? "The deal is cancelled" : !plcHref ? "Needs an application in the OS" : plcDone ? "PLC check done" : plcReady ? "Before the tenancy starts" : "Once the offer is accepted";
    const telOf = (p: string) => `tel:${p.replace(/\s/g, "")}`;

    /* The one orange job: whatever the let is waiting on us for. */
    const mainJob = cancelled ? (
      <button type="button" className="nl-btn nl-btn--primary" onClick={() => setBuilder({ mode: "update", start: { kind: "cancelled", to: "tenant:0" } })}>
        <Ico name="mail" /> Update the tenant
      </button>
    ) : plcCan && plcHref && !(!intro && app && propoly.state === "push") ? (
      <button type="button" className="nl-btn nl-btn--primary" onClick={() => setPlcOpen(true)}>
        <Ico name="arrow" /> {plcLabel}
      </button>
    ) : !app && deal ? (
      <a href={propolyDealUrl(deal.app.id)} target="_blank" rel="noopener noreferrer" className="nl-btn nl-btn--primary">
        Open in Propoly <Ico name="arrow" />
      </a>
    ) : null;

    const menu: MenuItem[] = [
      ...(!cancelled ? [{ label: "Customer update", sub: "Email the tenant or the landlord", onClick: () => setBuilder({ mode: "update" }) }] : []),
      ...(!cancelled && !intro ? [{ label: "Send a reminder", sub: "Sign, pay, references", onClick: () => setBuilder({ mode: "reminder" }) }] : []),
      { label: "Messages", sub: lead ? `Everything said with ${leadFirst}` : "The conversation with the tenant", onClick: () => setPanel("messages") },
      { label: "Add a document", onClick: () => setNlTab("documents") },
      { label: "Add a comment", onClick: () => setNlTab("notes") },
      "rule",
      ...(people.length ? [{ label: people.length > 1 ? "The tenants" : "The tenant", onClick: () => setPerson({ role: "tenant", index: 0 }) }] : []),
      { label: noLandlord ? "Add the landlord" : landlordsAll.length > 1 ? "The landlords" : "The landlord", onClick: () => (noLandlord ? setAddLandlordOpen(true) : setPerson({ role: "landlord", index: 0 })) },
      ...(plcHref && plcCan && !(mainJob && propoly.state !== "push") ? [{ label: plcLabel, onClick: () => setPlcOpen(true) }] : []),
      ...(app && !intro && (propoly.state === "early" || (propoly.state === "in" && !propoly.url)) ? [{ label: propoly.state === "in" ? "In Propoly" : "Not in Propoly yet", sub: propoly.sub ?? undefined, onClick: () => setPropolyOpen(true) }] : []),
      ...(app && !intro && propoly.state === "push" && cancelled ? [{ label: "Push to Propoly", onClick: () => setPropolyOpen(true) }] : []),
      ...(propoly.state === "in" && propoly.url ? [{ label: "Open in Propoly", sub: propoly.sub ?? undefined, href: propoly.url }] : []),
      ...(photoListing ? [{ label: "Open the listing", href: `/listings/${encodeURIComponent(String(photoListing))}` }] : []),
      "rule",
      cancelled
        ? { label: "Deal cancelled", sub: cancelled.reason, onClick: () => setCancelOpen(true) }
        : { label: "Cancel the deal", sub: "Give a reason first", danger: true, onClick: () => setCancelOpen(true) },
    ];

    /* Where Propoly stands, beside the stage, as on the old page's top row. */
    const propolyWord = intro ? (
      <Badge tone="good">Marketing only</Badge>
    ) : propoly.state === "checking" ? (
      <span className="nl-meta inline-flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" /> Checking Propoly
      </span>
    ) : propoly.state === "in" ? (
      propoly.url ? (
        <a href={propoly.url} target="_blank" rel="noopener noreferrer" title={propoly.sub ?? "Open the deal in Propoly"} className="nl-market-btn">
          In Propoly ↗
        </a>
      ) : (
        <button type="button" onClick={() => setPropolyOpen(true)} title={propoly.sub ?? undefined} className="nl-market-btn">
          In Propoly
        </button>
      )
    ) : propoly.state === "push" || propoly.state === "early" ? (
      <button type="button" onClick={() => (app && propoly.state === "push" ? setPushOpen(true) : setPropolyOpen(true))} className="nl-market-btn nl-apps-notin">
        Not in Propoly yet
      </button>
    ) : null;

    /* Steve, from what is on this let - never a sample. */
    const missingRtr = !scottishLet && app ? people.findIndex((p) => !(p.rightToRent === true || rtrOf(p))) : -1;
    const ideas: { says: string; act: string; go: () => void }[] = cancelled
      ? []
      : [
          /* No third Push to Propoly here (8 Nov 2026): it lives once, in
             Next Up, and Steve points at it rather than doubling it. */
          ...(app && !intro && propoly.state === "push" ? [{ says: "The one thing waiting is in Next Up: push it to Propoly. It's still your let after that - you stay the tenant's and the landlord's contact.", act: "Show me", go: () => document.querySelector("[data-next-up]")?.scrollIntoView({ behavior: "smooth", block: "center" }) }] : []),
          ...(dealStatus?.text === "Move-in slipped" ? [{ says: `The move-in date has been and gone. Agree a new one with ${leadFirst} and the landlord.`, act: "Send a customer update", go: () => setBuilder({ mode: "update" }) }] : []),
          ...(noLandlord ? [{ says: "There's no landlord on this let yet. Every let needs one.", act: "Add the landlord", go: () => setAddLandlordOpen(true) }] : []),
          ...(flags.length ? [{ says: `Kirstie's side has flagged this one: ${flags[0]}.`, act: "Add a comment", go: () => setNlTab("notes") }] : []),
          ...(missingRtr >= 0 ? [{ says: `${firstName(people[missingRtr]?.name) || "One tenant"} has no right to rent answer recorded yet.`, act: "Open their details", go: () => setPerson({ role: "tenant", index: missingRtr }) }] : []),
        ];
    const idea = ideas[0];
    const steveReading = (app && journey === null) || info === null;

    const nlTabs: { id: NlTab; label: string; count?: number | null }[] = [
      { id: "overview", label: "Overview" },
      { id: "people", label: "People", count: people.length + landlordsAll.length || null },
      { id: "documents", label: "Documents" },
      { id: "notes", label: "Notes", count: notesN || null },
      { id: "activity", label: "Activity" },
    ];

    const thingLine = (label: string, sub: string, go: (() => void) | null, href?: string | null, done?: boolean) => {
      const inner = (
        <>
          <span className="nl-strong">{label}</span>
          <span className="nl-meta">{sub}</span>
          {done ? <Ico name="check" size={14} /> : go || href ? <Ico name="arrow" size={14} /> : <span />}
        </>
      );
      return (
        <li key={label}>
          {href && !done ? (
            <Link href={href} className="nl-apps-todo">{inner}</Link>
          ) : (
            <button type="button" className="nl-apps-todo" onClick={go ?? undefined} disabled={!go || done} title={!go || done ? sub : undefined}>
              {inner}
            </button>
          )}
        </li>
      );
    };

    /* What moved, newest first: the deal's events, then the record's own. */
    const history = journey?.ok ? journey.history ?? [] : [];
    const recordLog = (app?.activity ?? []).filter((a) => !a.note);

    /* ── The Deal's figures, the OS's own where an agent put them right ──
       (lib/let-edits, James 1 Nov 2026). What the application and the
       Propoly deal said is kept apart (figures, letEdits marks), so the
       page can say when Propoly still has something else, and an emptied
       box goes back to it. */
    const dealHas = (f: LetField): string | null => (deal ? dealFigure(deal, f) : null);
    const appHas = (f: LetField): string | null => (f === "deposit" ? null : app?.figures?.[f] ?? null);
    const osNow = (f: LetField): LetEditNow | null => (details ? details.edits[f] ?? null : deal?.letEdits?.[f] ?? app?.osEdits?.[f] ?? null);
    const readOf = (f: LetField): string | null => {
      if (f === "moveIn") return dealHas("moveIn") ?? appHas("moveIn");
      if (f === "rent") return app ? appHas("rent") : dealHas("rent");
      if (f === "deposit") return dealHas("deposit");
      return dealHas(f) ?? appHas(f);
    };
    const figureOf = (f: LetField): string | null => osNow(f)?.value ?? readOf(f);
    const fromWord = deal ? "Propoly's" : "the application's";
    const shortWhen = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const moveInNl = figureOf("moveIn");
    const rentNl = figureOf("rent");
    const termNl = figureOf("termMonths");
    const holdNl = figureOf("holdingFee");
    const holdStatus = deal ? stageStatus(deal, "holding_fee").text : "No deal yet";
    const depositNl = osNow("deposit")?.value != null
      ? sayLetValue("deposit", osNow("deposit")!.value)
      : deal?.app.propoly?.depositReplacement
        ? "Zero deposit (Flatfair)"
        : dealHas("deposit") != null
          ? sayLetValue("deposit", dealHas("deposit"))
          : listingDeposit != null
            ? `${gbp(listingDeposit)} on the listing`
            : "Not set yet";
    const editable: LetField[] = [
      "moveIn",
      ...(intro || isSwap ? [] : (["deposit"] as LetField[])),
      "rent",
      ...(intro || isSwap || scottishLet ? [] : (["holdingFee"] as LetField[])),
      ...(intro ? [] : (["termMonths"] as LetField[])),
    ];
    const nlFacts: { label: string; text: string; field?: LetField }[] = facts.flatMap((f) => {
      if (f.label === "Move-in") return [{ label: f.label, text: moveInNl ? niceDate(moveInNl) : "Not set yet", field: "moveIn" as LetField }];
      if (f.label === "Deposit") return [{ label: f.label, text: depositNl, field: "deposit" as LetField }];
      if (f.label === "Rent" || f.label === "Rent, the home") {
        return [
          { label: f.label, text: rentNl ? `${sayLetValue("rent", rentNl)} ${per}` : "No offer recorded", field: "rent" as LetField },
          ...(intro ? [] : [{ label: "Tenancy length", text: termNl ? sayLetValue("termMonths", termNl) : "Not set yet", field: "termMonths" as LetField }]),
        ];
      }
      if (f.label === "Holding fee") {
        const fees = editable.includes("holdingFee");
        return [{ label: f.label, text: fees && holdNl ? `${sayLetValue("holdingFee", holdNl)} · ${holdStatus.toLowerCase()}` : f.text, field: fees ? ("holdingFee" as LetField) : undefined }];
      }
      return [{ label: f.label, text: f.text }];
    });
    /* Under a figure the OS changed: who, and whether Propoly still has another. */
    const factNote = (f: LetField) => {
      const os = osNow(f);
      if (!os || os.value === null) return null;
      const theirs = dealHas(f);
      const differs = Boolean(deal) && !sameLetValue(f, os.value, theirs);
      return (
        <small className="nl-fact-note">
          <span>Changed by {firstName(os.by) || os.by}, {shortWhen(os.at)}</span>
          {differs && deal && (
            <span className="nl-fact-differs">
              {theirs == null ? "Propoly has none yet - add it in Propoly." : `Propoly still has ${f === "rent" ? `${sayLetValue(f, theirs)} ${per}` : sayLetValue(f, theirs)} - change it in Propoly.`}{" "}
              <a href={propolyDealUrl(deal.app.id)} target="_blank" rel="noopener noreferrer">Open the deal ↗</a>
            </span>
          )}
        </small>
      );
    };
    const startFigures = () => {
      const from = Object.fromEntries(editable.map((f) => [f, (f === "deposit" ? osNow("deposit")?.value ?? dealHas("deposit") ?? (listingDeposit != null ? String(listingDeposit) : null) : figureOf(f)) ?? ""])) as Partial<Record<LetField, string>>;
      setFigFrom(from);
      setFigDraft(from);
      setFigSave("idle");
      setFigErr(null);
      setFigEdit(true);
    };
    const figDirty = Boolean(figDraft && figFrom && editable.some((f) => (figDraft[f] ?? "").trim() !== (figFrom[f] ?? "")));
    const saveFigures = async () => {
      const d = figDraft;
      const from = figFrom;
      if (!d || !from || !letId) return;
      const changes: Record<string, string | null> = {};
      const shownWas: Record<string, string | null> = {};
      for (const f of editable) {
        const v = (d[f] ?? "").trim();
        if (v === (from[f] ?? "")) continue;
        changes[f] = v || null;
        shownWas[f] = from[f] || null;
      }
      if (!Object.keys(changes).length) { setFigEdit(false); return; }
      setFigSave("saving");
      setFigErr(null);
      const settle = saves.reporter.begin("The deal's figures");
      try {
        const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/details`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ changes, shown: shownWas }),
        });
        const j = (await r.json().catch(() => ({}))) as Partial<LetDetails> & { ok?: boolean; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "The figures didn't save. Try again.");
        setDetails({ canEdit: Boolean(j.canEdit), dealId: j.dealId ?? null, edits: j.edits ?? {}, history: j.history ?? [] });
        /* The board reads them again rather than show its held copy. */
        dropJson(APPS_BOARD_URL);
        settle({ ok: true });
        setFigSave("done");
        window.setTimeout(() => { setFigEdit(false); setFigSave("idle"); }, 1700);
      } catch (e) {
        const said = e instanceof Error ? e.message : "The figures didn't save. Try again.";
        settle({ ok: false, problem: said, retry: () => void saveFigures() });
        setFigErr(said);
        setFigSave("error");
      }
    };
    const figInput = (f: LetField) => {
      const v = figDraft?.[f] ?? "";
      const set = (x: string) => setFigDraft((cur) => ({ ...(cur ?? {}), [f]: x }));
      const kind = LET_FIELD_KIND[f];
      if (kind === "date") return <FieldDate value={v} onChange={set} clearable placeholder="Choose the day" />;
      if (kind === "months") return <span className="nl-fact-money"><input type="number" inputMode="numeric" min={1} max={120} value={v} onChange={(e) => set(e.target.value)} aria-label={LET_FIELD_LABEL[f]} /><i>months</i></span>;
      return (
        <span className="nl-fact-money">
          <i>£</i>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={v} onChange={(e) => set(e.target.value)} aria-label={LET_FIELD_LABEL[f]} />
          {f === "rent" && <i>{per}</i>}
        </span>
      );
    };
    /* Every change made on the let, for Activity, in words. */
    const editWords = (e: LetEditEvent): string => {
      const who = firstName(e.by) || e.by;
      if (isLetField(e.field)) {
        const label = LET_FIELD_LABEL[e.field].toLowerCase();
        if (e.value === null) return `${who} put the ${label} back to ${fromWord} figure (it was ${sayLetValue(e.field, e.was)} here).`;
        return `${who} changed the ${label} from ${sayLetValue(e.field, e.was)} to ${sayLetValue(e.field, e.value)}.`;
      }
      const m = /^tenant:(.+):(name|email|phone)$/.exec(e.field);
      if (m) {
        const who2 = (info?.people ?? []).find((x) => x.key === m[1])?.name;
        const part = m[2] === "phone" ? "mobile" : m[2];
        return `${who} changed ${who2 ? `${who2}'s` : "a tenant's"} ${part} from ${e.was || "nothing"} to ${e.value || "nothing"}.`;
      }
      return `${who} changed ${e.field}.`;
    };
    const edits = details?.history ?? [];
    /* The tenants as the let now holds them: changed on the let, or as read. */
    const shownPerson = (p: AppPerson): AppPerson => {
      const x = partyFor(p);
      return x ? { ...p, name: x.name, email: x.email, phone: x.phone } : p;
    };
    const leadShown = lead ? shownPerson(lead) : lead;
    /* The listing and the managed home's page, said at the top, not only in the ... menu (ticket 4171e58c). */
    const listingHref = photoListing && Number(photoListing) > 0 ? `/listings/${encodeURIComponent(String(photoListing))}` : null;
    const homeHref = info?.homePage ? `/portfolio/${encodeURIComponent(info.homePage)}` : null;

    return (
      <SaveScopeProvider scope={saves}>
        <div data-look="new" data-steve="application.drawer" className="nl-page nl-rise nl-app nl-edge">
          {pushOpen && app && (
            <PushToPropoly
              applicationId={app.id}
              address={[name, locality].filter(Boolean).join(", ")}
              onClose={() => setPushOpen(false)}
              onChanged={() => setJourneyTick((n) => n + 1)}
              onEdit={(what, index) => {
                setPushOpen(false);
                if (what === "landlord") setPerson({ role: "landlord", index: index ?? 0 });
                else if (what === "tenant") setPerson({ role: "tenant", index: index ?? 0 });
                else if (what === "documents") setNlTab("documents");
                else setFigEdit(true);
              }}
            />
          )}
          <LetContacts
            open={contactsOpen}
            onClose={() => setContactsOpen(false)}
            address={[name, locality].filter(Boolean).join(", ")}
            tenants={people.map((p, i) => {
              const s = shownPerson(p);
              return { key: `t-${p.contactId ?? ""}-${i}`, name: s.name, email: s.email ?? null, phone: s.phone ?? null, role: p.isPrimary ? "Lead applicant" : "Applicant" };
            })}
            landlords={landlordsAll.map((p, i) => ({ key: `l-${p.key ?? i}`, name: p.name, email: p.email ?? null, phone: p.phone ?? null, role: "Landlord" }))}
            listingHref={listingHref}
            homeHref={homeHref}
          />
          {plcOpen && (app || deal) && (
            <PlcOverlay
              applicationId={app?.id ?? deal!.app.id}
              address={[name, locality].filter(Boolean).join(", ")}
              onClose={() => {
                setPlcOpen(false);
                setDetailsTick((n) => n + 1);
              }}
            />
          )}
          <div className="nl-crumbs">
            <Link href={backHref} className="nl-crumb">
              <Ico name="back" size={14} /> Applications
            </Link>
            <SaveChip scope={saves} className="bg-card" />
            <RexWaitingChip refs={[["TenancyApplications", app?.id], ["listing", app?.listingId]]} />
            {stepLabel && onStep && (
              <span className="ml-auto flex items-center gap-1.5">
                <span className="nl-mono mr-1">{stepLabel}</span>
                <button type="button" aria-label="Previous let" onClick={() => onStep(-1)} className="nl-iconbtn nl-iconbtn--sm">‹</button>
                <button type="button" aria-label="Next let" onClick={() => onStep(1)} className="nl-iconbtn nl-iconbtn--sm">›</button>
              </span>
            )}
          </div>

          <div className="nl-rhead">
            <div className="nl-rhead-text">
              <div className="nl-rhead-meta">
                {dealStatus && !cancelled && <Badge tone={pillTone(dealStatus.tone)}>{dealStatus.text}</Badge>}
                <Badge tone={cancelled ? "accent" : "neutral"} plain={!cancelled}>{stageLabel}</Badge>
                {app?.flag && <Badge tone="accent">{app.flag}</Badge>}
                {propolyWord}
                <span className="nl-mono">{[dayN ? `Day ${dayN}` : null, agent !== "—" ? agent : null].filter(Boolean).join(" · ")}</span>
              </div>
              <h1 className="nl-title">
                {name}
                {isSwap && <span className="text-muted"> ({swapWord})</span>}
              </h1>
              <p className="nl-rhead-sub">
                {[
                  locality || null,
                  leadShown ? `${leadShown.name}${others ? ` +${others}` : ""}` : null,
                  rentNl ? `${sayLetValue("rent", rentNl)} ${per}` : "no offer recorded",
                  moveInNl ? `moves in ${niceDate(moveInNl)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {(listingHref || homeHref) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" data-let-links>
                  {listingHref && <Link href={listingHref} className="nl-link">Open the Listing</Link>}
                  {homeHref && <Link href={homeHref} className="nl-link">Open the Home&apos;s Page</Link>}
                </p>
              )}
            </div>
            <div className="nl-rhead-acts">
              <button type="button" className="nl-btn nl-btn--secondary" onClick={() => setContactsOpen(true)}>
                <Ico name="phone" /> Get in Touch
              </button>
              {!cancelled && (
                <button type="button" className="nl-btn nl-btn--secondary" onClick={() => setBuilder({ mode: "update" })}>
                  <Ico name="mail" /> Customer update
                </button>
              )}
              {/* Take offline, beside Customer update (James, 8 Nov 2026). */}
              {app?.listingId && !app.swapKind && !cancelled && !intro && (propoly.state === "in" || propoly.state === "push") && (
                <AdvertOffline compact listingId={String(app.listingId)} applicationId={app.id} propertyId={app.propertyId ?? null} address={[app.property, app.locality].filter(Boolean).join(", ")} />
              )}
              {mainJob}
              <Menu items={menu} />
            </div>
          </div>

          {cancelled && (
            <div className="nl-confirm">
              <p>
                <b className="font-semibold">Deal cancelled</b> by {cancelled.by}, {whenWords(cancelled.at)}: {cancelled.reason.toLowerCase()}
                {cancelled.note ? `. ${cancelled.note}` : ""}. Kirstie has it on her feed to cancel in Propoly.
              </p>
            </div>
          )}

          <div className="nl-hero">
            <div className={`nl-hero-photo${gridFrom ? " is-lifted" : ""}`}>
              {shots.length > 1 && <i className="nl-hero-under u2" aria-hidden />}
              {shots.length > 1 && <i className="nl-hero-under u1" aria-hidden />}
              <button
                type="button"
                ref={heroRef}
                className="nl-hero-main"
                onClick={() => shots.length && setGridFrom(heroRef.current?.getBoundingClientRect() ?? null)}
                aria-label={shots.length ? `See all ${shots.length} photos` : "No photos"}
              >
                {shots.length ? (
                  <PropertyPhoto src={shots[0]} alt="" width={1400} height={875} loading="eager" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="nl-hero-empty">
                    <svg width="72" height="56" viewBox="0 0 56 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden><path d="M4 42h48M10 42V20L28 6l18 14v22M23 42V30h10v12" /></svg>
                    No photos of this home yet
                  </span>
                )}
                {shots.length > 1 && (
                  <span className="nl-hero-more">
                    <Ico name="image" size={15} /> +{shots.length - 1} more
                  </span>
                )}
              </button>
            </div>

            <section className={`nl-facts${figEdit ? " is-editing" : ""}`} data-steve="application.deal-figures">
              <div className="nl-facts-head">
                <h3 className="nl-block-title">The Deal</h3>
                <span className="flex items-center gap-3">
                  {waitingOn && !cancelled && !figEdit && <span className="nl-meta">{waitingOn === "you" ? "Waiting on you" : `Waiting on ${waitingOn}`}</span>}
                  {figEdit ? (
                    <span className="nl-facts-flag"><i /> Editing</span>
                  ) : details?.canEdit && letId ? (
                    <button type="button" onClick={startFigures} className="nl-link" data-steve="application.edit-figures">
                      <Ico name="pen" size={13} /> Edit
                    </button>
                  ) : null}
                </span>
              </div>
              {!figEdit || !figDraft ? (
                <div className="nl-facts-grid">
                  {nlFacts.map((f) => (
                    <div key={f.label} className="nl-fact">
                      <span>{f.label}</span>
                      <b className={quiet(f.text) ? "is-quiet" : ""} title={f.text}>{f.text}</b>
                      {f.field && factNote(f.field)}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="nl-facts-grid">
                    {editable.map((f) => (
                      <div key={f} className={LET_FIELD_KIND[f] === "date" ? "nl-fact nl-fact--wide" : "nl-fact"}>
                        <span>{f === "rent" && isSwap ? "Rent, the home" : LET_FIELD_LABEL[f]}</span>
                        <div className="nl-fact-in">{figInput(f)}</div>
                      </div>
                    ))}
                  </div>
                  <p className="nl-hint mt-2">
                    Kept on this let{deal ? ". Propoly can't take changes from here, so anything it still has differently is shown under the figure" : ""}. Empty a box to go back to {fromWord} figure.
                  </p>
                  {(figDirty || figSave !== "idle") && (
                    <div className={`nl-saverow${figSave === "done" ? " is-done" : figSave === "error" ? " is-error" : ""}`}>
                      {figSave === "done" ? (
                        <><SteveFace size={22} mood="happy" /><span>Saved on the let.</span></>
                      ) : figSave === "error" ? (
                        <span className="min-w-0 flex-1">{figErr}</span>
                      ) : (
                        <><span className="nl-saverow-dot" /><span>Not saved yet</span></>
                      )}
                      <span className="flex-1" />
                      {figSave !== "done" && (
                        <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={figSave === "saving"} onClick={() => { setFigEdit(false); setFigSave("idle"); }}>Cancel</button>
                      )}
                      {figSave !== "done" && (
                        <button type="button" disabled={figSave === "saving" || !figDirty} className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => void saveFigures()}>
                          {figSave === "saving" ? "Saving…" : "Save"}
                        </button>
                      )}
                    </div>
                  )}
                  {!figDirty && figSave === "idle" && (
                    <button type="button" className="nl-link mt-2 self-start" onClick={() => setFigEdit(false)}>Cancel</button>
                  )}
                </>
              )}
            </section>
          </div>

          {/* Where it's up to: the offer, then Kirstie's stages. */}
          {stops ? (
            <div className="nl-apps-track">
              <div className="nl-progress" style={{ "--nl-steps": stops.length } as React.CSSProperties} aria-label="Where it's up to">
                {stops.map((st) => (
                  <div key={st.id} title={[st.sub, st.about].filter(Boolean).join(" - ") || undefined} className={`nl-step${st.state === "done" ? " done" : st.state === "current" ? " now" : ""}${st.state === "off" ? " is-off" : ""}`}>
                    <i />
                    <span>{st.label}</span>
                  </div>
                ))}
              </div>
              <p className="nl-meta nl-apps-track-note">
                Step {(hereIdx >= 0 ? hereIdx : stops.length - 1) + 1} of {stops.length}
                {here?.sub ? ` · ${here.sub}` : ""}
                {intro ? " · Marketing only: the offer, and that's the end of it." : ""}
              </p>
              {here?.about && !intro && <p className="nl-apps-track-about">{here.about}</p>}
            </div>
          ) : (
            <p className="nl-meta nl-apps-track-wait">
              {journey && !journey.ok ? (
                journey.error ?? "Couldn't read where this is up to."
              ) : (
                <>
                  <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" /> Checking where this is up to…
                </>
              )}
            </p>
          )}

          <Tabs label="This let" className="nl-ltabs" value={nlTab} onChange={setNlTab} items={nlTabs} steve="application.tab" />

          <div key={nlTab} className="nl-pane">
            {nlTab === "overview" && (
              <div className="nl-bento">
                {/* ── Next Up ── */}
                <section className="nl-cell span2 nl-apps-nextup" data-next-up>
                  <div className="nl-cell-head">
                    <h3 className="nl-block-title">Next Up</h3>
                    <Badge tone={cancelled ? "accent" : "info"}>{stageLabel}</Badge>
                  </div>
                  {cancelled ? (
                    <>
                      <p className="nl-apps-next-line">Let the tenant and landlord know.</p>
                      <p className="nl-meta">The deal is cancelled: {cancelled.reason.toLowerCase()}. Kirstie has it on her feed to cancel in Propoly.</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setBuilder({ mode: "update", start: { kind: "cancelled", to: "tenant:0" } })} className="nl-btn nl-btn--primary nl-btn--sm">
                          <Ico name="mail" size={14} /> Update the tenant
                        </button>
                        <button type="button" onClick={() => setBuilder({ mode: "update", start: { kind: "cancelled", to: "landlord" } })} className="nl-btn nl-btn--secondary nl-btn--sm">
                          Update the landlord
                        </button>
                      </div>
                    </>
                  ) : app ? (
                    <div className="nl-apps-nextbody">
                      {intro && app.listingId && <IntroKeys listingId={String(app.listingId)} address={[app.property, app.locality].filter(Boolean).join(", ")} />}
                      {intro?.done && (
                        <div className="nl-apps-flag is-good">
                          <Ico name="check" size={16} />
                          <span>
                            <b>Marketing only - nothing more to do.</b> The landlord has agreed the tenant. Invoice the marketing fee and the file is finished: the landlord takes it from here.
                          </span>
                        </div>
                      )}
                      {flags.length > 0 && (
                        <div className="nl-apps-flag">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4l9 16H3zM12 10v4M12 17.5h.01" /></svg>
                          <span>
                            <b>Needs a look, from Kirstie&apos;s side.</b> {flags.join(". ")}.
                          </span>
                        </div>
                      )}
                      <div className="nl-apps-nextcard">
                        <NextStepCard
                          applicationId={app.id}
                          actions={journey?.ok ? journey.actions ?? [] : null}
                          loading={journey === null}
                          checks={intro?.done ? [] : checklist}
                          onPlay={(a) => void play(a)}
                          playing={playing}
                          confirming={confirming}
                          onChanged={() => setJourneyTick((n) => n + 1)}
                          onPush={() => setPushOpen(true)}
                        />
                      </div>
                      {journey?.ok && (journey.actions ?? []).some((a) => a.test || a.decide) && (
                        <ul className="nl-lines">
                          {(journey.actions ?? []).filter((a) => a.test || a.decide).map((a) => (
                            <li key={a.id} className="flex-wrap">
                              <button
                                type="button"
                                onClick={() => void play(a)}
                                onBlur={() => confirming === a.id && setConfirming(null)}
                                disabled={playing !== null}
                                className={`nl-btn nl-btn--sm ${confirming === a.id ? "nl-btn--danger" : a.test === "decline" || a.decide === "declined" || a.decide === "undo" ? "nl-btn--quiet" : "nl-btn--secondary"}`}
                              >
                                {playing === a.id ? "Working…" : confirming === a.id ? "Yes, decline it" : a.label}
                              </button>
                              <span className="nl-meta min-w-0 flex-1 basis-[220px]">{a.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {playError && <p className="nl-meta text-accent-dark">{playError}</p>}
                      <div className="empty:hidden">
                        <CustomerUpdates
                          key={`${app.id}:${journey?.ok ? journey.deal?.id ?? "" : ""}:${journeyTick}`}
                          applicationId={app.id}
                          dealId={journey?.ok ? journey.deal?.id ?? null : null}
                          openOnly
                          hideWhenEmpty
                        />
                      </div>
                      {(propoly.state === "in" || Boolean(deal)) && (
                        <MoveInPackCard
                          dealId={(journey?.ok ? journey.deal?.id : null) ?? deal?.app.id ?? null}
                          address={[app.property, app.locality].filter(Boolean).join(", ")}
                          moveIn={moveIn}
                        />
                      )}
                      {/* The advert box left Next Up (James, 8 Nov 2026): Take offline is a
                          button beside Customer update, and when to be asked lives in
                          Profile > Automations. */}
                    </div>
                  ) : (
                    <>
                      <p className="nl-apps-next-line">{dealHere?.label ?? "In Propoly"}{dealStatus ? `: ${dealStatus.text.toLowerCase()}.` : "."}</p>
                      <p className="nl-meta">Let through Propoly, with no application in the OS. Kirstie moves it through the stages; ask her if something looks stuck.</p>
                      {deal && <MoveInPackCard dealId={deal.app.id} address={[deal.app.propertyName, deal.app.locality].filter(Boolean).join(", ")} moveIn={moveIn} />}
                    </>
                  )}
                </section>

                {/* ── The Applicant ── */}
                <section className="nl-cell">
                  <div className="nl-cell-head">
                    <h3 className="nl-block-title">{people.length > 1 ? "The Applicants" : "The Applicant"}</h3>
                    {people.length > 0 && <button type="button" className="nl-link" onClick={() => setPerson({ role: "tenant", index: 0 })}>Open</button>}
                  </div>
                  {/* The tenants set with Edit on the home's page, where they were (4 Nov 2026). */}
                  {info?.household && <p className="nl-meta">Living there now, as set on the home&apos;s page: {info.household.tenants.map((t) => t.name).join(", ")}.</p>}
                  {leadShown ? (
                    <>
                      <div className="nl-person">
                        <span className="nl-avatar">{initialsOf(leadShown.name)}</span>
                        <span className="min-w-0">
                          <span className="nl-strong block truncate">{leadShown.name}{others ? ` +${others}` : ""}</span>
                          <span className="nl-meta block">Lead applicant</span>
                        </span>
                      </div>
                      <div className="nl-contact">
                        {leadShown.phone ? <a href={telOf(leadShown.phone)}><Ico name="phone" size={14} />{leadShown.phone}</a> : <span className="text-muted"><Ico name="phone" size={14} />No phone on file</span>}
                        {leadShown.email ? <a href={`mailto:${leadShown.email}`}><Ico name="mail" size={14} />{leadShown.email}</a> : <span className="text-muted"><Ico name="mail" size={14} />No email on file</span>}
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                        {leadShown.phone && <a href={telOf(leadShown.phone)} className="nl-btn nl-btn--secondary nl-btn--sm"><Ico name="phone" size={14} /> Call</a>}
                        <button type="button" className="nl-link" onClick={() => setPanel("messages")}>Messages</button>
                      </div>
                    </>
                  ) : (
                    <p className="nl-meta">No tenant recorded on this let yet.</p>
                  )}
                </section>

                {/* ── The handover, once the offer is accepted ── */}
                {aside && !cancelled && !intro && <section className="nl-cell span3 nl-apps-aside">{aside}</section>}

                {/* ── Things to Do: the old page's eight tiles ── */}
                <section className="nl-cell">
                  <h3 className="nl-block-title">Things to Do</h3>
                  <ul className="nl-apps-todos">
                    {!intro && thingLine(plcLabel, plcSub, plcCan ? () => setPlcOpen(true) : null, null, plcDone)}
                    {thingLine("Send a reminder", intro ? "Marketing only - nothing to chase" : "Sign, pay, references", cancelled || intro ? null : () => setBuilder({ mode: "reminder" }))}
                    {thingLine("Customer update", "Email tenant or landlord", () => setBuilder({ mode: "update" }))}
                    {thingLine("Add a document", "ID, payslips, receipts", () => setNlTab("documents"))}
                    {thingLine("Add a comment", "For the whole team", () => setNlTab("notes"))}
                    {thingLine(cancelled ? "Deal cancelled" : "Cancel the deal", cancelled ? cancelled.reason : "Give a reason first", () => setCancelOpen(true))}
                  </ul>
                </section>

                {/* ── The landlord ── */}
                <section className="nl-cell">
                  <div className="nl-cell-head">
                    <h3 className="nl-block-title">{landlordsAll.length > 1 ? "Landlords" : "Landlord"}</h3>
                    {!noLandlord && info !== null && <button type="button" className="nl-link" onClick={() => setPerson({ role: "landlord", index: 0 })}>Open</button>}
                  </div>
                  {info === null ? (
                    <p className="nl-meta">Reading…</p>
                  ) : landlordName ? (
                    <>
                      <div className="nl-person">
                        <span className="nl-avatar">{initialsOf(landlordName)}</span>
                        <span className="min-w-0">
                          <span className="nl-strong block truncate">{landlordName}</span>
                          <span className="nl-meta block">{landlordsAll.length > 1 ? `+${landlordsAll.length - 1} more ${landlordsAll.length === 2 ? "landlord" : "landlords"}` : "Landlord"}</span>
                        </span>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                        {landlordPhone && <a href={telOf(landlordPhone)} className="nl-btn nl-btn--secondary nl-btn--sm"><Ico name="phone" size={14} /> Call</a>}
                        {!cancelled && <button type="button" className="nl-link" onClick={() => setBuilder({ mode: "update", start: { kind: "general", to: "landlord" } })}>Send update</button>}
                        <button type="button" className="nl-link" onClick={() => setAddLandlordOpen(true)}>Add landlord</button>
                      </div>
                    </>
                  ) : info.failed ? (
                    <>
                      <p className="nl-meta"><b className="font-semibold text-ink">The landlord couldn&rsquo;t be read just now.</b> {info.failed} Nothing is missing from the file.</p>
                      <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm self-start" onClick={() => setPeopleTry((n) => n + 1)}>Try again</button>
                    </>
                  ) : (
                    <>
                      <p className="nl-meta"><b className="font-semibold text-ink">No landlord on this let.</b> Every let needs one. {info.landlordProblem ?? ""}</p>
                      <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm self-start" onClick={() => setAddLandlordOpen(true)}>Add the landlord</button>
                    </>
                  )}
                </section>

                {/* ── Steve, from what is on the let ── */}
                <section className="nl-cell nl-cell--sage nl-steve-cell">
                  <div className="flex items-center gap-2">
                    <SteveFace size={30} mood={idea ? "thinking" : undefined} />
                    <b className="font-[family-name:var(--font-heading)] text-[16px]">Steve</b>
                  </div>
                  {steveReading && !idea ? (
                    <p className="text-muted">Having a look…</p>
                  ) : idea ? (
                    <>
                      <p>{idea.says}</p>
                      <button type="button" className="nl-btn nl-btn--sage nl-btn--sm mt-auto self-stretch" onClick={idea.go}>{idea.act}</button>
                    </>
                  ) : (
                    <p>{cancelled ? "This one's cancelled. Once the tenant and landlord know, there's nothing more to do." : "Nothing needs you on this one right now. Nice."}</p>
                  )}
                </section>
              </div>
            )}

            {nlTab === "people" && (
              <div className="nl-holder">
                {picture?.deal && <PropolySummary picture={picture} people={info?.people ?? []} />}
                {info?.household && <HouseholdOnHome household={info.household} listingId={info.listingId} newLook />}
                {/* Three columns, one person each (James, 8 Nov 2026): the lead
                    applicant, the guarantor and the landlord side by side, and
                    anyone else stacked behind them, a click away. */}
                <div className="nl-people3">
                  <PeopleDeck
                    title="Applicant"
                    many="Applicants"
                    steve="application.applicants"
                    cards={[...people.map((p, i) => ({ p, i }))]
                      .sort((a, b) => Number(b.p.isPrimary) - Number(a.p.isPrimary))
                      .map(({ p, i }) => {
                        const party = partyFor(p);
                        const shown = shownPerson(p);
                        return {
                          key: `${p.contactId ?? ""}-${i}`,
                          node: (
                            <div className="nl-pcard">
                              <div className="nl-pcard-head">
                                <button type="button" onClick={() => setPerson({ role: "tenant", index: i })} className="min-w-0 text-left">
                                  <span className="nl-pcard-name block truncate hover:underline">{shown.name}</span>
                                  <span className="nl-pcard-role">{p.isPrimary ? "Lead applicant" : "Applicant"}</span>
                                </button>
                              </div>
                              {party && letId ? (
                                /* Fixed until Edit, saved on the let (1 Nov 2026). */
                                <LetTenantCard
                                  letId={letId}
                                  party={{ ...party, isPrimary: p.isPrimary }}
                                  about={name}
                                  canEdit={Boolean(details?.canEdit)}
                                  onAnswer={(j) => { takePeople(j); setDetailsTick((n) => n + 1); }}
                                  after={<PropolyLine letId={letId} party={party} picture={picture} onAnswer={takePeople} />}
                                />
                              ) : (
                                <ContactBlock
                                  showName={false}
                                  role={p.isPrimary ? "lead applicant" : "applicant"}
                                  person={{ name: p.name, email: p.email ?? null, phone: p.phone ?? null }}
                                  personRef={/^\d+$/.test(String(p.contactId ?? "")) ? `rex:${p.contactId}` : null}
                                />
                              )}
                              {/* Their right to rent expiry on the card, not only behind
                                  their name (Kirstie Mulholland, 3 Nov 2026, ticket 494b1e2e). */}
                              {/* Only once there's something to say (8 Nov 2026): "no expiry
                                  recorded" on every card was noise. Added from their details. */}
                              {!scottishLet && letId && (rtrOf(p) || suggestedFor(rtrPack, p.name)) && (
                                <div className="nl-pcard-rtr" data-steve="application.rtr-expiry-card">
                                  <p className="nl-pcard-label">Right to rent expiry</p>
                                  <RightToRentField
                                    key={`${p.name}-${rtrOf(p)?.id ?? "none"}`}
                                    record={rtrOf(p)}
                                    suggested={suggestedFor(rtrPack, p.name)}
                                    save={(until, noTimeLimit) => saveRtr(p.name, until, noTimeLimit)}
                                    canVerify={rtrCanVerify}
                                    onVerified={rtrKeep}
                                  />
                                </div>
                              )}
                              {!p.isPrimary && canChangeLead && (
                                <button type="button" onClick={() => makeLead(p)} disabled={Boolean(leadBusy)} data-steve="application.make-lead" className="nl-pdeck-add is-quiet mt-3">
                                  {leadBusy === applicantKey(p) ? "Saving…" : "Make lead tenant"}
                                </button>
                              )}
                            </div>
                          ),
                        };
                      })}
                    empty="No tenant recorded on this let yet."
                    actions={letId ? <LetTenants letId={letId} onChange={reloadPeople} picture={picture} people={info?.people ?? null} className="nl-pdeck-tenants" /> : undefined}
                  />
                  <div>
                    {letId && people.length > 0 ? (
                      <Guarantors source={{ let: letId }} onChange={setGuarantorSig} deck />
                    ) : (
                      <PeopleDeck title="Guarantor" many="Guarantors" cards={[]} empty="Add the applicant first, then their guarantor." />
                    )}
                    {letId && <GuarantorsToPropoly letId={letId} tick={`${guarantorSig}:${picture ? "p" : ""}`} className="mt-3" />}
                  </div>
                  {letId && (
                    <LandlordsBox
                      deck
                      letId={letId}
                      people={info === null ? null : info.people ?? []}
                      picture={picture}
                      problem={info?.landlordProblem ?? null}
                      propertyAddress={[name, locality].filter(Boolean).join(", ")}
                      onAnswer={takePeople}
                      homeKey={info?.homeKey ?? null}
                      reload={reloadPeople}
                    />
                  )}
                  {Number(info?.listingId) > 0 && (
                    <section className="nl-cell mt-4">
                      <ListingAppraisal state={letAppraisal} look="new" />
                    </section>
                  )}
                </div>
              </div>
            )}

            {nlTab === "documents" && (
              <div className="nl-holder">
                <TenantDocuments dealId={letId} className="mb-5" />
                <FileDocuments dropZone address={[name, locality].filter(Boolean).join(", ")} propertyId={app?.propertyId ?? null} from={{ kind: "application", id: letId }} />
                <div className="nl-apps-propfile">
                  <PropertyFile propertyId={app?.propertyId ?? null} address={app?.propertyId ? null : [name, locality].filter(Boolean).join(", ")} screen="the application" />
                </div>
              </div>
            )}

            {nlTab === "notes" && (
              <div>
                <form
                  className="nl-composer"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!draft.trim() || noteBusy) return;
                    setNoteBusy(true);
                    await addComment(draft);
                    setNoteBusy(false);
                  }}
                >
                  <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a note - chased the tenant, spoke to the landlord…" aria-label="Add a note" data-steve="application.add-comment" />
                  <button type="submit" className="nl-send" disabled={!draft.trim() || noteBusy} aria-label="Save the note" data-steve="application.save-note">
                    <Ico name="arrow" size={16} />
                  </button>
                </form>
                <p className="nl-meta -mt-2 mb-5">
                  Kept on the let, for everyone who opens it.{" "}
                  <button type="button" className="nl-link" onClick={() => setPanel("messages")}>
                    Messages with {leadFirst}
                  </button>
                </p>
                {commentRows === null ? (
                  <p className="nl-meta flex items-center gap-2 py-6"><span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />Reading the notes…</p>
                ) : commentRows.length ? (
                  <ul className="nl-rowlist">
                    {commentRows.map((n) => (
                      <li key={n.id}>
                        <span className="nl-avatar nl-apps-noteav">{initialsOf(n.author)}</span>
                        <div className="min-w-0">
                          <p className="nl-meta"><b className="font-medium text-ink">{n.author}</b> · {n.when}</p>
                          <p className="nl-note-text">{n.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="nl-empty">No notes on this let yet.</p>
                )}
              </div>
            )}

            {nlTab === "activity" && (
              <div>
                {app && journey === null ? (
                  <p className="nl-meta flex items-center gap-2 py-6"><span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />Reading what moved…</p>
                ) : (
                  /* Every line opens with what's behind it (James, 8 Nov 2026). */
                  <ActivityList
                    empty="Nothing has moved on the deal yet."
                    items={[
                      ...edits.map((e) => ({
                        key: `e${e.id}`,
                        at: e.at,
                        when: whenWords(e.at),
                        exact: exactWhen(e.at),
                        text: editWords(e),
                        by: e.by,
                        rows: [["Was", e.was ?? "Nothing"], ["Now", e.value ?? "Nothing"], ["Kept", "On the let in the OS"]] as [string, string][],
                      })),
                      ...history.map((e) => ({
                        key: `h${e.id}`,
                        at: e.at,
                        when: whenWords(e.at),
                        exact: exactWhen(e.at),
                        text: eventSentence(e),
                        by: e.agentName,
                        body: e.toldNote,
                        rows: ([
                          ["From", e.fromStatus ?? ""],
                          ["To", e.toStatus ?? ""],
                          ["Amount", e.amount != null ? `£${e.amount.toLocaleString("en-GB")}` : ""],
                          ["Told", [e.toldTo, e.toldAt ? whenWords(e.toldAt) : ""].filter(Boolean).join(", ")],
                        ] as [string, string][]).filter(([, v]) => v),
                      })),
                      ...(app?.activity ?? []).map((a, i) => {
                        const note = (a as { note?: unknown }).note;
                        return {
                          key: `r${i}`,
                          at: /^\d{4}-\d{2}-\d{2}/.test(a.when) ? a.when : "",
                          when: /^\d{4}-\d{2}-\d{2}/.test(a.when) ? niceDate(a.when.slice(0, 10)) : a.when,
                          exact: exactWhen(a.when),
                          text: note ? `${a.by || "Someone"} added a note` : a.what,
                          by: note ? null : a.by,
                          body: typeof note === "string" && note.trim() ? note : note ? a.what : null,
                          go: note ? { label: "Go to Notes", onClick: () => setNlTab("notes") } : null,
                        };
                      }),
                    ].sort((x, y) => (y.at || "").localeCompare(x.at || ""))}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Inside the new look's colours: everything that opens over the page. */}
        <div data-look="new">
          {overlays}
          {gridFrom !== null && shots.length > 0 && <PhotoGrid photos={shots} name={name} origin={gridFrom} onClose={() => setGridFrom(null)} />}
        </div>
      </SaveScopeProvider>
    );
  }

  return (
    <SaveScopeProvider scope={saves}>
      <div data-steve="application.drawer" className="space-y-5">
        {/* ── back, the save chip, activity and notes, and ‹ › ──────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Link href={backHref} className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
              <span aria-hidden>←</span> Applications
            </Link>
            <SaveChip scope={saves} className="bg-white" />
            <RexWaitingChip refs={[["TenancyApplications", app?.id], ["listing", app?.listingId]]} />
          </div>
          {/* Activity and notes at the top, as on a listing (James, 12 Oct 2026). */}
          {([
            { key: "activity", label: "Activity", icon: "list" },
            { key: "notes", label: "Notes", icon: "note" },
          ] as const).map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setPanel(panel === b.key ? null : b.key)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
            >
              <DoodleIcon name={b.icon} size={13} className="text-accent-dark" />
              {b.label}
              {b.key === "notes" && (commentRows?.length ?? 0) > 0 && <span className="figures rounded-full bg-page px-1.5 text-[10.5px]">{commentRows!.length}</span>}
            </button>
          ))}
          {/* Green once it is in Propoly (opens the deal), pink while it is not. */}
          {intro ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#56634a]/25 bg-[#f1f4ec] px-3.5 text-[12.5px] font-semibold text-[#56634a]">
              <DoodleIcon name="key" size={13} />
              Marketing only
            </span>
          ) : propoly.state === "checking" ? (
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-line/80 bg-white px-3.5 text-[12.5px] font-semibold text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Checking Propoly
            </span>
          ) : propoly.state === "in" ? (
            propoly.url ? (
              <a
                href={propoly.url}
                target="_blank"
                rel="noreferrer"
                title={propoly.sub ?? "Open the deal in Propoly"}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#56634a]/25 bg-[#f1f4ec] px-3.5 text-[12.5px] font-semibold text-[#56634a] transition-colors hover:border-[#56634a]/60"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                In Propoly <span aria-hidden>↗</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setPropolyOpen(true)}
                title={propoly.sub ?? undefined}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#56634a]/25 bg-[#f1f4ec] px-3.5 text-[12.5px] font-semibold text-[#56634a] transition-colors hover:border-[#56634a]/60"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                In Propoly
              </button>
            )
          ) : propoly.state === "push" || propoly.state === "early" ? (
            <button
              type="button"
              onClick={() => setPropolyOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-accent-dark/30 bg-accent-soft px-3.5 text-[12.5px] font-semibold text-accent-dark transition-colors hover:border-accent-dark"
            >
              <DoodleIcon name="rocket" size={13} />
              {propoly.state === "push" ? "Push to Propoly" : "Not in Propoly"}
            </button>
          ) : null}
          {stepLabel && onStep && (
            <div className="flex items-center gap-1.5 sm:ml-2">
              <span className="mr-1 text-[11.5px] text-muted">{stepLabel}</span>
              <button type="button" aria-label="Previous let" onClick={() => onStep(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">‹</button>
              <button type="button" aria-label="Next let" onClick={() => onStep(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">›</button>
            </div>
          )}
        </div>

        {cancelled && (
          <p className="rounded-2xl border border-accent-dark/30 bg-accent-soft/50 px-5 py-3 text-[13px]">
            <b className="font-semibold">Deal cancelled</b> by {cancelled.by}, {whenWords(cancelled.at)}: {cancelled.reason.toLowerCase()}{cancelled.note ? `. ${cancelled.note}` : ""}. Kirstie has it on her feed to cancel in Propoly.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── 1. the home and who it is for ─────────────────────────── */}
          {/* Portfolio's box, as on a listing (James, 12 Oct 2026): the big
              photo, three square ones down its right-hand side, the let
              underneath. */}
          <section className={`${box} min-w-0 p-3 xl:col-start-1`}>
            <div className={`grid grid-cols-1 gap-2 ${shots.length > 1 ? "sm:grid-cols-[minmax(0,1fr)_140px] 2xl:grid-cols-[minmax(0,1fr)_170px]" : ""}`}>
              <button
                type="button"
                onClick={() => shots.length && setLightbox(0)}
                aria-label={shots.length ? "See the photos" : "No photos"}
                className={`group relative aspect-[16/10] overflow-hidden rounded-xl bg-box ${shots.length > 1 ? "sm:aspect-auto" : ""}`}
              >
                <PropertyPhoto src={shots[0] ?? null} alt="" width={1400} height={875} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]" />
                {/* No count on the photo, as on the listing (13 Oct 2026): the "+17" says it. */}
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
                <h1 className="hand min-w-0 text-[28px] leading-[1.1] sm:text-[32px]">{name}{isSwap && <span className="text-muted"> ({swapWord})</span>}</h1>
                <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" />
                  {stageLabel}
                </span>
              </div>
              <p className="figures mt-1.5 text-[20px] font-semibold">
                {rent ? <>{rent} <span className="text-[13px] font-normal text-muted">{per}{moveIn ? ` · moves in ${niceDate(moveIn)}` : ""}</span></> : <span className="text-[14px] font-normal text-muted">No offer recorded</span>}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {[locality, lead ? `${lead.name}${others ? ` + ${others} other${others === 1 ? "" : "s"}` : ""}` : null, `with ${agent}`].filter(Boolean).join(" · ")}
              </p>
              {(app?.flag || dealStatus) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {dealStatus && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${dealStatus.tone}`}>{dealStatus.text}</span>}
                  {app?.flag && <Pill tone="accent">{app.flag}</Pill>}
                </div>
              )}
            </div>
          </section>

          {/* ── the eight, always, in the same places ─────────────────── */}
          <section className={`${box} @container flex flex-col p-4 xl:col-start-2`}>
            <p className={`${eyebrow} mb-3 px-1`}>Actions</p>
            <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2 @[40rem]:grid-cols-4">
              {/* The PLC check: from the record once the landlord has the
                  offer, done once it is approved. */}
              {intro ? (
                <Tile icon="shield" dark label="No PLC check" sub="Marketing only - the landlord's" off />
              ) : (
              <Tile
                icon="shield"
                dark
                label={plcState && !plcDone ? "Carry on the PLC check" : "Start the PLC check"}
                sub={cancelled ? "The deal is cancelled" : !plcStartHref ? "Needs an application in the OS" : plcDone ? "PLC check done" : plcReady ? "Before the tenancy starts" : "Once the offer is accepted"}
                done={plcDone}
                off={!plcDone && (Boolean(cancelled) || !plcStartHref || !plcReady)}
                href={plcStartHref ?? undefined}
              />
              )}
              <Tile icon="message" label="Add a comment" sub="For the whole team" onClick={() => setPanel("notes")} steve="application.add-comment" />
              <Tile icon="upload" label="Add a document" sub="Drop it in" onClick={() => setDocsOpen(true)} />
              <Tile
                icon="user"
                label={people.length > 1 ? "The tenants" : "The tenant"}
                sub={lead ? `${lead.name}${others ? ` + ${others}` : ""}` : "Nobody recorded yet"}
                off={!people.length}
                onClick={() => setPerson({ role: "tenant", index: 0 })}
              />
              <Tile
                icon="home"
                label={landlordsAll.length > 1 ? "The landlords" : "The landlord"}
                sub={info === null ? "Reading…" : landlordsAll.length ? `${landlordsAll[0].name}${landlordsAll.length > 1 ? ` + ${landlordsAll.length - 1}` : ""}` : info.landlord ? info.landlord.name : "None yet - add one"}
                onClick={() => (info && !landlordsAll.length && !info.landlord ? setAddLandlordOpen(true) : setPerson({ role: "landlord", index: 0 }))}
              />
              <Tile icon="mail" label="Customer update" sub="Email tenant or landlord" onClick={() => setBuilder({ mode: "update" })} />
              <Tile icon="clock" label="Send a reminder" sub={intro ? "Marketing only - nothing to chase" : "Sign, pay, references"} off={Boolean(cancelled) || Boolean(intro)} onClick={() => setBuilder({ mode: "reminder" })} />
              <Tile
                icon="logout"
                label={cancelled ? "Deal cancelled" : "Cancel the deal"}
                sub={cancelled ? cancelled.reason : "Give a reason first"}
                done={Boolean(cancelled)}
                onClick={() => setCancelOpen(true)}
              />
            </div>
          </section>

          {/* Once the offer is accepted the handover IS the next action. */}
          {aside && !cancelled && !intro && <div className="min-w-0 xl:col-span-2">{aside}</div>}

          {/* ── 2. the facts and the people, the spine underneath ────────── */}
          <section className={`${box} flex min-w-0 flex-col p-4 sm:p-5 xl:col-start-1`}>
            <p className={eyebrow}>General info</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 2xl:grid-cols-4">
              {facts.map((f) => <Info key={f.label} {...f} />)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {waitingOn && !cancelled && (
                <span className={chip}>
                  <DoodleIcon name="clock" size={12} className="text-accent-dark" />
                  {waitingOn === "you" ? <b className="font-semibold text-accent-dark">Waiting on you</b> : `Waiting on ${waitingOn}`}
                </span>
              )}
              <button type="button" className={chip} onClick={() => setPanel("notes")}>
                <DoodleIcon name="note" size={12} className="text-accent-dark" />
                {comments === null ? "Reading the notes…" : `${comments.length} ${comments.length === 1 ? "note" : "notes"}`}
              </button>
            </div>
            {flags.length > 0 && (
              <div className="mt-4 rounded-xl bg-[#fdefec] px-4 py-3 text-[12.5px] text-[#9d4340]">
                <p className="font-semibold">Needs a look, from Kirstie&apos;s side</p>
                <ul className="mt-1 list-disc pl-4">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
            {/* The let's Propoly deal, and who on it differs (20 Oct 2026). */}
            {picture?.deal && <div className="mt-5"><PropolySummary picture={picture} people={info?.people ?? []} /></div>}
            {/* The tenants set with Edit on the home's page, where they were (4 Nov 2026). */}
            {info?.household && <HouseholdOnHome household={info.household} listingId={info.listingId} className="mt-5" />}
            <p className={`${eyebrow} mb-3 mt-5`}>{people.length === 1 ? "The applicant" : `The applicants · ${people.length}`}</p>
            {people.length ? (
              <ul className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                {people.map((p, i) => (
                  <li key={(p.contactId ?? "") + i} className="rounded-xl border border-line/50 bg-white p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setPerson({ role: "tenant", index: i })} className="truncate text-left text-[13px] font-semibold underline-offset-2 hover:underline">
                        {p.name}
                      </button>
                      {p.isPrimary ? (
                        <Pill tone="accent">Lead</Pill>
                      ) : canChangeLead ? (
                        <button
                          type="button"
                          onClick={() => makeLead(p)}
                          disabled={Boolean(leadBusy)}
                          data-steve="application.make-lead"
                          className="shrink-0 rounded-full border border-line/70 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:border-ink/40 disabled:opacity-50"
                        >
                          {leadBusy === applicantKey(p) ? "Saving…" : "Make lead tenant"}
                        </button>
                      ) : null}
                    </div>
                    {(() => {
                      const party = partyFor(p);
                      return party && letId ? (
                        <>
                          <PartyContact letId={letId} party={{ ...party, isPrimary: p.isPrimary }} propertyAddress={name} onAnswer={takePeople} />
                          <PropolyLine letId={letId} party={party} picture={picture} onAnswer={takePeople} />
                        </>
                      ) : (
                        <ContactBlock
                          showName={false}
                          role={p.isPrimary ? "lead applicant" : "applicant"}
                          person={{ name: p.name, email: p.email ?? null, phone: p.phone ?? null }}
                          personRef={/^\d+$/.test(String(p.contactId ?? "")) ? `rex:${p.contactId}` : null}
                        />
                      );
                    })()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">No tenant recorded on this let yet.</p>
            )}
            {/* Guarantors (Lorna Fieldson, 15 Oct 2026): carried over from the
                lead by the applicant's email, added here too (lib/guarantors). */}
            {letId && people.length > 0 && <Guarantors source={{ let: letId }} className="mt-4" onChange={setGuarantorSig} />}
            {/* The guarantors into the Propoly deal, and the owners' Repush (22 Oct 2026, lib/deal-guarantors, lib/propoly-repush). */}
            {letId && <GuarantorsToPropoly letId={letId} tick={`${guarantorSig}:${picture ? "p" : ""}`} className="mt-3" />}
            {/* A tenant added on the let, the same way (Kirstie 6a2dc73c, 19 Oct 2026, lib/let-tenants). */}
            {letId && <LetTenants letId={letId} className="mt-3" onChange={reloadPeople} picture={picture} people={info?.people ?? null} />}
            {/* Every landlord, each changeable, and Add landlord always (James, 20 Oct 2026). */}
            {letId && (
              <LandlordsBox
                letId={letId}
                people={info === null ? null : info.people ?? []}
                picture={picture}
                problem={info?.landlordProblem ?? null}
                propertyAddress={[name, locality].filter(Boolean).join(", ")}
                onAnswer={takePeople}
                homeKey={info?.homeKey ?? null}
                reload={reloadPeople}
              />
            )}
            {/* What the market appraisal behind the home learned (James, 10 Nov 2026). */}
            {Number(info?.listingId) > 0 && (
              <div className="mt-5 border-t border-line/50 pt-4">
                <ListingAppraisal state={letAppraisal} look="classic" />
              </div>
            )}

            {/* Where it's up to, across the box underneath (as on a listing). */}
            <div className="mt-5 border-t border-line/50 pt-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="hand text-[16px]">Where it&apos;s up to</span>
                  <span className="text-[11.5px] text-muted">{intro ? "The offer, and that's the end of it - marketing only." : <>The offer, then Kirstie&apos;s stages.</>}</span>
                </p>
                {stops && here && <span className="text-[11.5px] text-muted">Step {(hereIdx >= 0 ? hereIdx : stops.length - 1) + 1} of {stops.length}</span>}
              </div>
              {stops ? (
                <Spine stops={stops} />
              ) : journey && !journey.ok ? (
                <p className="text-[12px] text-muted">{journey.error ?? "Couldn't read where this is up to."}</p>
              ) : (
                <p className="flex items-center gap-2 text-[12px] text-muted">
                  <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                  Checking where this is up to&hellip;
                </p>
              )}
            </div>
          </section>

          {/* ── the next step, level with the facts ───────────────────── */}
          <section className={`${pop} min-w-0 rounded-2xl border border-accent-dark/15 bg-accent-soft/60 p-5 xl:col-start-2`}>
            {cancelled ? (
              /* Nothing to do next on a cancelled let but tell people. */
              <>
                <p className={`${eyebrow} text-accent-dark`}>Next up</p>
                <h2 className="hand mt-1.5 text-[19px] leading-tight">Let the tenant and landlord know</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  The deal is cancelled: {cancelled.reason.toLowerCase()}. Kirstie has it on her feed to cancel in Propoly.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setBuilder({ mode: "update", start: { kind: "cancelled", to: "tenant:0" } })} className="press-ring inline-flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white">
                    <DoodleIcon name="mail" size={13} /> Update the tenant
                  </button>
                  <button type="button" onClick={() => setBuilder({ mode: "update", start: { kind: "cancelled", to: "landlord" } })} className="press-ring inline-flex items-center gap-2 rounded-full border border-line/70 bg-white px-4 py-2.5 text-[12.5px] font-semibold">
                    <DoodleIcon name="home" size={13} /> Update the landlord
                  </button>
                </div>
              </>
            ) : app ? (
              <>
                {/* Sean McMahon, 20 Oct 2026: the keys, when the agent hands them over. */}
                {intro && app.listingId && <IntroKeys listingId={String(app.listingId)} address={[app.property, app.locality].filter(Boolean).join(", ")} />}
                {intro?.done && (
                  <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#56634a]/20 bg-[#f1f4ec] px-4 py-3.5 text-[#3f5a32]">
                    <DoodleIcon name="checklist" size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[14px] font-semibold">Marketing only - nothing more to do</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed">The landlord has agreed the tenant. Invoice the marketing fee and the file is finished: the landlord takes it from here.</p>
                    </div>
                  </div>
                )}
                <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
                  <NextStepCard
                    applicationId={app.id}
                    actions={journey?.ok ? journey.actions ?? [] : null}
                    loading={journey === null}
                    checks={intro?.done ? [] : checklist}
                    onPlay={(a) => void play(a)}
                    playing={playing}
                    confirming={confirming}
                    onChanged={() => setJourneyTick((n) => n + 1)}
                  />
                </div>
                {journey?.ok && (journey.actions ?? []).some((a) => a.test || a.decide) && (
                  <ul className="mt-4 space-y-2.5 border-t border-accent-dark/15 pt-4">
                    {(journey.actions ?? []).filter((a) => a.test || a.decide).map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => void play(a)}
                          onBlur={() => confirming === a.id && setConfirming(null)}
                          disabled={playing !== null}
                          className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                            confirming === a.id
                              ? "border-accent-dark bg-accent-dark text-white"
                              : a.test === "decline" || a.decide === "declined" || a.decide === "undo"
                                ? "border-line bg-white text-muted hover:border-ink/60 hover:text-ink"
                                : "border-ink/80 bg-white hover:bg-ink hover:text-page"
                          }`}
                        >
                          {playing === a.id ? "Working…" : confirming === a.id ? "Yes, decline it" : a.label}
                        </button>
                        <span className="mt-1 block text-[11.5px] leading-snug text-muted">{a.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {playError && <p className="mt-2.5 text-[12px] text-accent-dark">{playError}</p>}
                <div className="mt-4 empty:hidden">
                  <CustomerUpdates
                    key={`${app.id}:${journey?.ok ? journey.deal?.id ?? "" : ""}:${journeyTick}`}
                    applicationId={app.id}
                    dealId={journey?.ok ? journey.deal?.id ?? null : null}
                    openOnly
                    hideWhenEmpty
                  />
                </div>
                {/* The move-in pack (lib/propoly-mail, 22 Oct 2026): read from the
                    agent's Outlook once Propoly sends it, the proof it went. */}
                {(propoly.state === "in" || Boolean(deal)) && (
                  <MoveInPackCard
                    dealId={(journey?.ok ? journey.deal?.id : null) ?? deal?.app.id ?? null}
                    address={[app.property, app.locality].filter(Boolean).join(", ")}
                    moveIn={moveIn}
                    className="mt-4"
                  />
                )}
                {/* The advert (19 Oct 2026, lib/advert-offline): once there's a let,
                    the agent takes it off the portals when they choose. */}
                {app.listingId && !app.swapKind && (propoly.state === "in" || propoly.state === "push") && (
                  <AdvertOffline
                    listingId={String(app.listingId)}
                    applicationId={app.id}
                    propertyId={app.propertyId ?? null}
                    address={[app.property, app.locality].filter(Boolean).join(", ")}
                    className="mt-4"
                  />
                )}
              </>
            ) : (
              <>
                <p className={`${eyebrow} text-accent-dark`}>Next up</p>
                <h2 className="hand mt-1.5 text-[19px] leading-tight">{dealHere?.label ?? "In Propoly"}</h2>
                {dealStatus && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{dealStatus.text}.</p>}
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  Let through Propoly, with no application in the OS. Kirstie moves it through the stages; ask her if something looks stuck.
                </p>
                {deal && (
                  <MoveInPackCard
                    dealId={deal.app.id}
                    address={[deal.app.propertyName, deal.app.locality].filter(Boolean).join(", ")}
                    moveIn={moveIn}
                    className="mt-4"
                  />
                )}
                <a href={propolyDealUrl(deal?.app.id)} target="_blank" rel="noreferrer" className="press-ring mt-4 inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
                  Open in Propoly <span aria-hidden>↗</span>
                </a>
              </>
            )}
          </section>
        </div>
      </div>

      {overlays}
    </SaveScopeProvider>
  );
}

/** One fact in General info: an icon in a circle, a label over its value. */
function Info({ icon, label, text }: { icon: string; label: string; text: string }) {
  const quiet = /^(Not |No |—|-$|Reading)/.test(text);
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name={icon} size={13} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className={`block truncate text-[13px] ${quiet ? "text-muted" : ""}`}>{text}</span>
      </span>
    </div>
  );
}

/** Yes / No / Not asked, as a word with a colour. */
function Answer({ v, yes = "Yes", no = "No" }: { v: boolean | null | undefined; yes?: string; no?: string }) {
  if (v == null) return <span className="text-muted">Not asked</span>;
  return <span className={v ? "text-[#1e7a3c]" : "text-accent-dark"}>{v ? yes : no}</span>;
}
