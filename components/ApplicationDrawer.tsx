"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ConfirmSheet from "@/components/ConfirmSheet";
import { dropJson } from "@/lib/page-cache";
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
import RightToRentField, { type RtrShown } from "@/components/RightToRentField";
import Guarantors from "@/components/Guarantors";
import { GuarantorsToPropoly } from "@/components/LetPropoly";
import LetTenants from "@/components/LetTenants";
import { AddLandlord, LandlordsBox, PartyContact, PropolyLine, PropolySummary, sourceWords, type Party, type PeopleAnswer, type Picture } from "@/components/LetPeople";
import FileDocuments from "@/components/FileDocuments";
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
      label: s.label,
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

type Template = { kind: string; label: string; what: string; to: Array<"tenant" | "landlord"> };
/* The written emails (lib/customer-update-copy), each read and changed before
   it goes. Failed referencing asks about a guarantor, as James put it. */
const UPDATES: Template[] = [
  { kind: "general", label: "A quick update", what: "A short note in your own words", to: ["tenant", "landlord"] },
  { kind: "reference_failed", label: "References not accepted", what: "Sorry, and do they have a guarantor? If not the let may not go ahead", to: ["tenant", "landlord"] },
  { kind: "guarantor_needed", label: "A guarantor is needed", what: "References passed, but a guarantor is needed", to: ["tenant"] },
  { kind: "agreement_out", label: "Agreement on its way", what: "The tenancy agreement is out for signing", to: ["tenant", "landlord"] },
  { kind: "cancelled", label: "The let won't go ahead", what: "Sorry it isn't going ahead, and what happens next", to: ["tenant", "landlord"] },
];
const REMINDERS: Template[] = [
  { kind: "nudge_holding_fee", label: "Pay the holding deposit", what: "The home stays on the market until it's paid", to: ["tenant"] },
  { kind: "nudge_referencing", label: "Finish the references", what: "Fill in the referencing form", to: ["tenant"] },
  { kind: "nudge_sign_agreement", label: "Sign the agreement", what: "The tenancy agreement is waiting for a signature", to: ["tenant", "landlord"] },
  { kind: "nudge_move_in_money", label: "Send the move-in money", what: "Deposit and first month's rent before the keys", to: ["tenant"] },
  { kind: "nudge_documents", label: "Documents we still need", what: "Send them over or upload them in the portal", to: ["tenant", "landlord"] },
];

type LetPerson = { name: string; email: string | null; phone: string | null; contactId: string | null; isPrimary: boolean };
type LetLandlord = { name: string; email: string | null; phone: string | null; contactId: string | null; from?: "rex" | "record" };
type LetInfo = { tenants: LetPerson[]; landlord: LetLandlord | null; landlordProblem: string | null; listingId: string | null; people?: Party[]; homeKey?: string };
type Cancellation = { reason: string; note: string; by: string; at: string };

function EmailBuilder({ letId, mode, people, start, scotland, onClose }: {
  letId: string;
  mode: "update" | "reminder";
  people: LetInfo | null;
  /** Arriving with a message and a person already picked (after a cancel). */
  start?: { kind: string; to: string } | null;
  /** Scotland takes no holding fee, so there's nothing to remind anyone to pay. */
  scotland?: boolean;
  onClose: () => void;
}) {
  const list = mode === "update" ? UPDATES : scotland ? REMINDERS.filter((t) => t.kind !== "nudge_holding_fee") : REMINDERS;
  const parties = [
    ...(people?.tenants ?? []).map((t, i) => ({ key: `tenant:${i}`, role: "tenant" as const, index: i, name: t.name, email: t.email, tag: t.isPrimary ? "Lead tenant" : "Tenant" })),
    /* Every landlord on the let (20 Oct 2026), each by their place in the list. */
    ...(() => {
      const all = (people?.people ?? []).filter((p) => p.role === "landlord");
      if (!all.length) return people?.landlord ? [{ key: "landlord", role: "landlord" as const, index: 0, name: people.landlord.name, email: people.landlord.email, tag: "Landlord" }] : [];
      return all.map((l, i) => ({ key: i ? `landlord:${i}` : "landlord", role: "landlord" as const, index: i, name: l.name, email: l.email, tag: "Landlord" }));
    })(),
  ];
  const [to, setTo] = useState<string>(start?.to ?? parties[0]?.key ?? "");
  const [kind, setKind] = useState<string>(start?.kind ?? list[0].kind);
  const [portal, setPortal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ id: number; index: number; portal: boolean } | null>(null);
  const sent = useRef(false);
  const [done, setDone] = useState<{ to: string; what: string; detail: string }[]>([]);
  useEffect(() => { if (!to && parties[0]) setTo(parties[0].key); }, [parties, to]);

  const party = parties.find((p) => p.key === to) ?? null;
  const tpl = list.find((t) => t.kind === kind) ?? list[0];
  const fits = party ? tpl.to.includes(party.role) : false;

  async function write() {
    if (!party || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: tpl.kind, role: party.role, index: party.index }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; update?: { id: number }; index?: number };
      if (!j.ok || !j.update) throw new Error(j.error ?? "The email couldn't be written.");
      sent.current = false;
      setSheet({ id: j.update.id, index: j.index ?? 0, portal });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The email couldn't be written.");
    } finally {
      setBusy(false);
    }
  }

  /* Closed without sending: the update is settled as not sent, so it never
     sits open nagging the agent and then Kirstie about an email nobody meant
     to send. */
  function sheetClosed() {
    const s = sheet;
    setSheet(null);
    if (s && !sent.current) {
      void fetch("/api/customer-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: s.id, index: s.index, action: "skip", note: "Written on the let's page and not sent." }),
      }).catch(() => null);
    }
  }

  return (
    <>
      <DrawerHead
        icon={mode === "update" ? "mail" : "clock"}
        title={mode === "update" ? "Customer update" : "Send a reminder"}
        sub="Pick who and what. The email is written for you to read and change before it goes, from your own address. Nothing is sent until you press Send."
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        <section>
          <p className={`${eyebrow} mb-2`}>Who to</p>
          {people === null ? (
            <p className="text-[12.5px] text-muted">Reading who is on the let…</p>
          ) : parties.length ? (
            <div className="flex flex-wrap gap-2">
              {parties.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTo(p.key)}
                  aria-pressed={to === p.key}
                  className={`rounded-xl border px-3.5 py-2 text-left text-[12.5px] transition-colors ${to === p.key ? "border-accent-dark bg-accent-soft/60" : "border-line/70 bg-white hover:border-ink/40"}`}
                >
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-[11px] text-muted">{p.tag}{p.email ? "" : " · no email"}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">Nobody with contact details is held on this let.</p>
          )}
          {people?.landlordProblem && <p className="mt-2 text-[11.5px] text-muted">{people.landlordProblem}</p>}
        </section>

        <section>
          <p className={`${eyebrow} mb-2`}>{mode === "update" ? "What it's about" : "The reminder"}</p>
          <div className="grid gap-2">
            {list.map((t) => {
              const ok = party ? t.to.includes(party.role) : true;
              return (
                <button
                  key={t.kind}
                  type="button"
                  disabled={!ok}
                  onClick={() => setKind(t.kind)}
                  aria-pressed={kind === t.kind}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${kind === t.kind ? "border-accent-dark bg-accent-soft/60" : "border-line/70 bg-white hover:border-ink/40"}`}
                >
                  <span className="block text-[13px] font-semibold">{t.label}</span>
                  <span className="block text-[11.5px] text-muted">{ok ? t.what : `For the ${t.to.join(" or ")} only`}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Send to portal (James, 12 Oct 2026): the copy under Messages in
            their portal, where they have one. */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line/70 bg-white px-4 py-3">
          <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
          <span>
            <span className="block text-[13px] font-semibold">Also put it in their portal</span>
            <span className="block text-[11.5px] text-muted">A copy under Messages, if they have a portal account. It is in their email either way.</span>
          </span>
        </label>

        {err && <p className="text-[12px] text-accent-dark">{err}</p>}
        {done.length > 0 && (
          <ul className="space-y-1.5 rounded-xl bg-[#f1f4ec] px-4 py-3 text-[12px] text-[#56634a]">
            {done.map((d, i) => (
              <li key={i}>✓ {d.what} to {d.to}. {d.detail}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-5 py-4 sm:px-6">
        <p className="text-[11.5px] text-muted">{party && !party.email ? `There's no email for ${party.name}. Ring them instead.` : "You'll see it before it goes."}</p>
        <button
          type="button"
          onClick={() => void write()}
          disabled={!party || !fits || busy || !party.email}
          className="press-ring inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          <DoodleIcon name="mail" size={13} />
          {busy ? "Writing it…" : "Write the email"}
        </button>
      </div>
      {sheet && (
        <ConfirmSheet
          target={{ kind: "update", id: sheet.id, index: sheet.index, portal: sheet.portal }}
          title={tpl.label}
          onSent={(detail) => {
            sent.current = true;
            setDone((cur) => [...cur, { to: party?.name ?? "them", what: tpl.label, detail }]);
          }}
          onClose={sheetClosed}
        />
      )}
    </>
  );
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
  useEffect(() => {
    if (!letId) return;
    let live = true;
    fetch(`/api/applications/${encodeURIComponent(letId)}/people`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; let?: LetInfo; cancelled?: Cancellation | null; propoly?: Picture | null }) => {
        if (!live) return;
        if (j.ok && j.let) setInfo(j.let);
        else setInfo({ tenants: [], landlord: null, landlordProblem: "Who is on this let couldn't be read just now.", listingId: null });
        setPicture(j.propoly ?? null);
        setCancelled(j.cancelled ?? null);
      })
      .catch(() => live && setInfo({ tenants: [], landlord: null, landlordProblem: "Who is on this let couldn't be read just now.", listingId: null }));
    return () => { live = false; };
  }, [letId]);

  /* Each tenant's right to rent expiry, recorded on the let (lib/application-rtr,
     15 Oct 2026). Kept apart from the yes/no answer it sits beside. */
  const [rtr, setRtr] = useState<RtrShown[]>([]);
  /* Pre-tenancy checks each date (Kirstie, ticket 066bb29e, 16 Oct 2026). */
  const [rtrCanVerify, setRtrCanVerify] = useState(false);
  useEffect(() => {
    if (!letId) return;
    let live = true;
    fetch(`/api/applications/${encodeURIComponent(letId)}/right-to-rent`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && Array.isArray(j.records)) { setRtr(j.records); setRtrCanVerify(Boolean(j.canVerify)); } })
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
  const [lightbox, setLightbox] = useState<number | null>(null);
  useEffect(() => {
    if (!photoListing) return;
    let live = true;
    fetch(`/api/listings/details?id=${encodeURIComponent(photoListing)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; details?: { images?: { url: string; priority: number }[]; service?: string | null } }) => {
        if (!live || !j.ok) return;
        if (j.details?.service) setListingService(j.details.service);
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
  const moveIn = app ? (app.moveIn !== "—" ? app.moveIn : deal?.app.startDate ?? null) : deal?.app.startDate ?? null;
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
  const partyFor = (p: { name: string; email?: string | null }): Party | null =>
    (info?.people ?? []).find(
      (x) => x.role === "tenant" && ((p.email && x.email && x.email.toLowerCase() === p.email.toLowerCase()) || x.name.trim().toLowerCase() === p.name.trim().toLowerCase())
    ) ?? null;

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
                    </>
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

      {/* Customer update and Send a reminder: the email builder. */}
      <Drawer open={Boolean(builder)} label={builder?.mode === "reminder" ? "Send a reminder" : "Customer update"} onClose={closeBuilder}>
        {builder && <EmailBuilder key={`${builder.mode}-${builder.start?.kind ?? ""}-${builder.start?.to ?? ""}`} letId={letId} mode={builder.mode} people={info} start={builder.start} scotland={scottishLet} onClose={closeBuilder} />}
      </Drawer>

      {!newLook && lightbox != null && <PhotoLightbox photos={shots} start={lightbox} name={name} onClose={() => setLightbox(null)} />}

      {cancelOpen && (
        <CancelDeal
          letId={letId}
          property={name}
          cancelled={cancelled}
          onCancelled={(c) => {
            setCancelled(c);
            /* The board's held read is out of date the moment this lands. */
            dropJson("/api/applications?limit=200");
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
    const noLandlord = info !== null && !landlordsAll.length && !info.landlord;
    const plcHref = app ? `/plc/start?application=${encodeURIComponent(app.id)}` : null;
    const plcCan = Boolean(app) && !intro && !cancelled && offerIn && !plcDone;
    const plcLabel = plcState && !plcDone ? "Carry on the PLC check" : "Start the PLC check";
    const plcSub = intro ? "Marketing only - the landlord's" : cancelled ? "The deal is cancelled" : !app ? "Needs an application in the OS" : plcDone ? "PLC check done" : offerIn ? "Before the tenancy starts" : "Once the offer is accepted";
    const telOf = (p: string) => `tel:${p.replace(/\s/g, "")}`;

    /* The one orange job: whatever the let is waiting on us for. */
    const mainJob = cancelled ? (
      <button type="button" className="nl-btn nl-btn--primary" onClick={() => setBuilder({ mode: "update", start: { kind: "cancelled", to: "tenant:0" } })}>
        <Ico name="mail" /> Update the tenant
      </button>
    ) : !intro && app && propoly.state === "push" ? (
      <button type="button" className="nl-btn nl-btn--primary" onClick={() => setPropolyOpen(true)}>
        <Ico name="arrow" /> Push to Propoly
      </button>
    ) : plcCan && plcHref ? (
      <Link href={plcHref} className="nl-btn nl-btn--primary">
        <Ico name="arrow" /> {plcLabel}
      </Link>
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
      ...(plcHref && plcCan && !(mainJob && propoly.state !== "push") ? [{ label: plcLabel, href: plcHref }] : []),
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
      <button type="button" onClick={() => setPropolyOpen(true)} className="nl-market-btn nl-apps-notin">
        {propoly.state === "push" ? "Not in Propoly - push it" : "Not in Propoly"}
      </button>
    ) : null;

    /* Steve, from what is on this let - never a sample. */
    const missingRtr = !scottishLet && app ? people.findIndex((p) => !(p.rightToRent === true || rtrOf(p))) : -1;
    const ideas: { says: string; act: string; go: () => void }[] = cancelled
      ? []
      : [
          ...(app && !intro && propoly.state === "push" ? [{ says: "It's accepted and not in Propoly yet. Push it across and Kirstie can take it from there.", act: "Push to Propoly", go: () => setPropolyOpen(true) }] : []),
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

    return (
      <SaveScopeProvider scope={saves}>
        <div data-look="new" data-steve="application.drawer" className="nl-page nl-rise nl-app">
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
                  lead ? `${lead.name}${others ? ` +${others}` : ""}` : null,
                  rent ? `${rent} ${per}` : "no offer recorded",
                  moveIn ? `moves in ${niceDate(moveIn)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="nl-rhead-acts">
              {!cancelled && (
                <button type="button" className="nl-btn nl-btn--secondary" onClick={() => setBuilder({ mode: "update" })}>
                  <Ico name="mail" /> Customer update
                </button>
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

            <section className="nl-facts">
              <div className="nl-facts-head">
                <h3 className="nl-block-title">The Deal</h3>
                {waitingOn && !cancelled && <span className="nl-meta">{waitingOn === "you" ? "Waiting on you" : `Waiting on ${waitingOn}`}</span>}
              </div>
              <div className="nl-facts-grid">
                {facts.map((f) => (
                  <div key={f.label} className="nl-fact">
                    <span>{f.label}</span>
                    <b className={quiet(f.text) ? "is-quiet" : ""} title={f.text}>{f.text}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Where it's up to: the offer, then Kirstie's stages. */}
          {stops ? (
            <div className="nl-apps-track">
              <div className="nl-progress" style={{ "--nl-steps": stops.length } as React.CSSProperties} aria-label="Where it's up to">
                {stops.map((st) => (
                  <div key={st.id} title={st.sub ?? undefined} className={`nl-step${st.state === "done" ? " done" : st.state === "current" ? " now" : ""}${st.state === "off" ? " is-off" : ""}`}>
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

          <Tabs label="This let" className="nl-ltabs" value={nlTab} onChange={setNlTab} items={nlTabs} />

          <div key={nlTab} className="nl-pane">
            {nlTab === "overview" && (
              <div className="nl-bento">
                {/* ── Next Up ── */}
                <section className="nl-cell span2 nl-apps-nextup">
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
                      {app.listingId && !app.swapKind && (propoly.state === "in" || propoly.state === "push") && (
                        <AdvertOffline listingId={String(app.listingId)} applicationId={app.id} propertyId={app.propertyId ?? null} address={[app.property, app.locality].filter(Boolean).join(", ")} />
                      )}
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
                  {lead ? (
                    <>
                      <div className="nl-person">
                        <span className="nl-avatar">{initialsOf(lead.name)}</span>
                        <span className="min-w-0">
                          <span className="nl-strong block truncate">{lead.name}{others ? ` +${others}` : ""}</span>
                          <span className="nl-meta block">Lead applicant</span>
                        </span>
                      </div>
                      <div className="nl-contact">
                        {lead.phone ? <a href={telOf(lead.phone)}><Ico name="phone" size={14} />{lead.phone}</a> : <span className="text-muted"><Ico name="phone" size={14} />No phone on file</span>}
                        {lead.email ? <a href={`mailto:${lead.email}`}><Ico name="mail" size={14} />{lead.email}</a> : <span className="text-muted"><Ico name="mail" size={14} />No email on file</span>}
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                        {lead.phone && <a href={telOf(lead.phone)} className="nl-btn nl-btn--secondary nl-btn--sm"><Ico name="phone" size={14} /> Call</a>}
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
                    {!intro && thingLine(plcLabel, plcSub, null, plcCan ? plcHref : null, plcDone)}
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
                <div className="nl-listbar">
                  <h3 className="nl-block-title">{people.length === 1 ? "The Applicant" : `The Applicants`}</h3>
                  {people.length > 1 && <span className="nl-count">{people.length}</span>}
                </div>
                {people.length ? (
                  <div className="nl-apps-people">
                    {people.map((p, i) => {
                      const party = partyFor(p);
                      return (
                        <section key={(p.contactId ?? "") + i} className="nl-cell nl-apps-personcard">
                          <div className="nl-cell-head">
                            <button type="button" onClick={() => setPerson({ role: "tenant", index: i })} className="nl-person min-w-0 text-left">
                              <span className="nl-avatar">{initialsOf(p.name)}</span>
                              <span className="min-w-0">
                                <span className="nl-strong block truncate hover:underline">{p.name}</span>
                                <span className="nl-meta block">{p.isPrimary ? "Lead applicant" : "Applicant"}</span>
                              </span>
                            </button>
                            {p.isPrimary ? (
                              <Badge tone="accent">Lead</Badge>
                            ) : canChangeLead ? (
                              <button type="button" onClick={() => makeLead(p)} disabled={Boolean(leadBusy)} data-steve="application.make-lead" className="nl-btn nl-btn--secondary nl-btn--sm">
                                {leadBusy === applicantKey(p) ? "Saving…" : "Make lead tenant"}
                              </button>
                            ) : null}
                          </div>
                          {party && letId ? (
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
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <p className="nl-empty">No tenant recorded on this let yet.</p>
                )}
                {letId && people.length > 0 && <Guarantors source={{ let: letId }} onChange={setGuarantorSig} />}
                {letId && <GuarantorsToPropoly letId={letId} tick={`${guarantorSig}:${picture ? "p" : ""}`} />}
                {letId && <LetTenants letId={letId} onChange={reloadPeople} picture={picture} people={info?.people ?? null} />}
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
              </div>
            )}

            {nlTab === "documents" && (
              <div className="nl-holder">
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
                  <button type="submit" className="nl-send" disabled={!draft.trim() || noteBusy} aria-label="Save the note">
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
                ) : history.length + recordLog.length ? (
                  <ul className="nl-timeline">
                    {history.map((e) => (
                      <li key={e.id}>
                        <span className="nl-mono">{whenWords(e.at)}</span>
                        <span>{eventSentence(e)}</span>
                      </li>
                    ))}
                    {recordLog.map((a, i) => (
                      <li key={`r${i}`}>
                        <span className="nl-mono">{/^\d{4}-\d{2}-\d{2}/.test(a.when) ? niceDate(a.when.slice(0, 10)) : a.when}</span>
                        <span>
                          {a.what} <span className="nl-meta">{a.by}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="nl-empty">Nothing has moved on the deal yet.</p>
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
                sub={cancelled ? "The deal is cancelled" : !app ? "Needs an application in the OS" : plcDone ? "PLC check done" : offerIn ? "Before the tenancy starts" : "Once the offer is accepted"}
                done={plcDone}
                off={!plcDone && (Boolean(cancelled) || !app || !offerIn)}
                href={app ? `/plc/start?application=${encodeURIComponent(app.id)}` : undefined}
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
