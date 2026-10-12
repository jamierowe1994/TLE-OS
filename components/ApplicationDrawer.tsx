"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CustomerUpdates from "@/components/CustomerUpdates";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PropertyFile from "@/components/PropertyFile";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import { Pill } from "@/components/Wire";
import { type SpineStop } from "@/components/StageSpine";
import GuideButton from "@/components/GuideButton";
import { eventSentence, eventTone, type DealEvent } from "@/lib/business/deal-events";
import ContactBlock from "@/components/ContactBlock";
import FileDocuments from "@/components/FileDocuments";
import NextStepCard, { type NextAction } from "@/components/NextStepCard";
import { STAGE_DOODLE, cardStatus, stageStatus } from "@/components/applications/LetsBoard";
import { PORTAL_STAGES, propolyDealUrl } from "@/lib/business/propoly-stages";
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
  history?: DealEvent[];
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

type TabKey = "activity" | "people" | "documents" | "file";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "activity", label: "Activity & comments", icon: "message" },
  { key: "people", label: "Applicants", icon: "user" },
  { key: "documents", label: "Documents", icon: "upload" },
  { key: "file", label: "Property file", icon: "shield" },
];
const TAB_LEAD: Record<TabKey, string> = {
  activity: "Everything that has happened on this let, and the comments. A comment is kept on the application and shows for everyone who opens it.",
  people: "Everyone on the application, and the ways through to each of them. Only the lead applicant is asked the four questions - the form stops after them.",
  documents: "References, right to rent, the landlord's papers and anything else for this home. The office and the agent both see them.",
  file: "What the tenancy has to be compliant about, and the certificates already held. A certificate filed here is on the property from then on.",
};

/* ── The page's boxes, Portfolio's ────────────────────────────────────── */
const pop =
  "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [&:hover:not(:has(.fixed))]:-translate-x-[3px] [&:hover:not(:has(.fixed))]:-translate-y-[3px] [&:hover:not(:has(.fixed))]:shadow-[6px_6px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]";
const box = `${pop} rounded-2xl border border-line/70 bg-white`;
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const chip = "inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-white px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40";
const tile =
  "flex h-full min-h-[72px] w-full flex-col items-start justify-between gap-2 rounded-xl border border-line/60 bg-white p-3.5 text-left text-[12.5px] font-semibold leading-tight transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))] disabled:pointer-events-none disabled:opacity-40";
const tileText = (label: string, what: string) => (
  <span className="block">
    <span className="block">{label}</span>
    <span className="mt-0.5 block text-[11.5px] font-normal leading-snug text-muted">{what}</span>
  </span>
);
const tileIcon = (name: string, dark = false) => (
  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${dark ? "bg-[var(--brown)] text-white" : "bg-accent-soft text-accent-dark"}`}><DoodleIcon name={name} size={14} /></span>
);

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

/** The photo, wide: a let carries one picture of the home. */
function Hero({ image, children }: { image: string | null; children: React.ReactNode }) {
  return (
    <section className={`${box} flex min-w-0 flex-col p-3 lg:col-start-1`}>
      {/* As tall as the actions beside it: the picture takes what is left. */}
      <div className="relative aspect-[2/1] overflow-hidden rounded-xl bg-box lg:aspect-auto lg:min-h-[260px] lg:flex-1">
        <PropertyPhoto src={image} alt="" width={1400} height={700} className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="px-2 pb-1.5 pt-4">{children}</div>
    </section>
  );
}

/** A dot in the stop's tone: done, needs a look, or quiet. */
const toneDot = (tone?: string) => (tone === "ok" ? "bg-emerald-600" : tone === "warn" ? "bg-amber-500" : "bg-line");

/**
 * Where it's up to, down the side: REX's stops then Kirstie's eight, each
 * with its one line of evidence. The vertical form of the old track, so it
 * sits in the right-hand column beside the sections.
 */
function UpTo({ stops }: { stops: SpineStop[] }) {
  return (
    <ol className="mt-4">
      {stops.map((s, i) => {
        const done = s.state === "done";
        const cur = s.state === "current";
        const off = s.state === "off";
        return (
          <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
            {i < stops.length - 1 && (
              <span aria-hidden className={`absolute bottom-0 left-[12px] top-[28px] ${done ? "w-0.5 bg-accent-dark/60" : "w-0 border-l-2 border-dashed border-line/80"}`} />
            )}
            <span
              className={`relative z-[1] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done ? "bg-accent-dark/70 text-white" : cur ? "bg-accent-dark text-white" : off ? "border-[1.5px] border-line/60 bg-line/30 text-muted" : "border-[1.5px] border-line/80 bg-white text-muted"
              }`}
            >
              {done ? "✓" : off ? "–" : i + 1}
            </span>
            <div className={`min-w-0 flex-1 rounded-xl px-3 py-1.5 ${cur ? "bg-accent-soft/50" : ""}`}>
              <p className={`text-[12.5px] leading-tight ${cur ? "font-semibold" : done ? "" : "text-muted"}`}>{s.label}</p>
              {s.sub ? (
                <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug">
                  <span aria-hidden className={`mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full ${toneDot(s.tone)}`} />
                  <span className={done || cur ? "text-ink" : "text-muted"}>{s.sub}</span>
                </p>
              ) : cur ? (
                <p className="mt-1 text-[11px] text-muted">Here now</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Kirstie's eight, read off the deal alone - for a let with no application. */
function dealStops(d: PreTenancyDeal): SpineStop[] {
  const at = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === d.effectiveStatusKey));
  return PORTAL_STAGES.map((s, i) => {
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

export default function ApplicationDrawer({
  app,
  deal = null,
  checklist,
  aside,
  backHref = "/applications",
  onStep,
  stepLabel,
  initialTab,
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
}) {
  const [tab, setTab] = useState<TabKey>(() => TABS.find((t) => t.key === initialTab)?.key ?? (app ? "activity" : "file"));
  const pickTab = useCallback((t: TabKey) => {
    setTab(t);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", t);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* fine */ }
  }, []);
  const goTab = useCallback((t: TabKey) => {
    pickTab(t);
    setTimeout(() => document.getElementById("sections")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [pickTab]);
  const commentBox = useRef<HTMLTextAreaElement>(null);
  /* The Auto save chip by the back link (23 Sep 2026): the comment, the
     property file and whatever the stage adds report to it. */
  const saves = useSaveScope(app?.id ?? deal?.app.id ?? null);
  /* The people on this application, and which of them the OS already has a
     lead for. Asked once when the page opens. */
  const [leadIds, setLeadIds] = useState<Record<string, string>>({});
  /* Everyone on the application; falls back to the single name the record
     carries, so an application with no applicant rows still shows somebody.
     A let with no application shows the deal's tenants. */
  const people: AppPerson[] = app?.applicants?.length
    ? app.applicants
    : app
      ? [{ name: app.tenant, contactId: null, email: null, phone: null, isPrimary: true }]
      : (deal?.app.tenants ?? []).map((t) => ({ name: t.name, contactId: null, email: t.email ?? null, phone: t.phone ?? null, isPrimary: Boolean(t.isPrimary) }));

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
  const [draft, setDraft] = useState("");
  /* The thread, from the OS. REX gives the milestones; this is what people
     typed, and it comes back on every open. */
  const [comments, setComments] = useState<AppActivity[] | null>(null);
  /* The journey: REX's three stops then Kirstie's eight, read from where her
     board reads them, with what the agent should do about it. */
  const [journey, setJourney] = useState<Journey | null>(null);
  /* Bumped after a test application's own button, so the spine reads again. */
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

  /* Declining asks twice: the first press turns the button into "Yes, decline it". */
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
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    let live = true;
    setComments(null);
    fetch(`/api/applications/${encodeURIComponent(app.id)}/comments`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; comments?: { body: string; authorName: string; createdAt: string }[] }) => {
        if (!live) return;
        setComments((j.comments ?? []).map((c) => ({ when: whenWords(c.createdAt), what: c.body, by: c.authorName, note: true })));
      })
      .catch(() => live && setComments([]));
    return () => {
      live = false;
    };
  }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function post() {
    const text = draft.trim();
    if (!app || !text || posting) return;
    setPosting(true);
    setPostError(null);
    /* The draft stays in the box until the comment has landed. Try again on
       the chip only where the OS said no, so nothing was posted; after a
       dropped connection it may have landed, and a resend would post it
       twice - the words are still in the box to post again. */
    const settle = saves.reporter.begin("Comment");
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(app.id)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; comment?: { body: string; authorName: string; createdAt: string } } | null;
      if (!r.ok || !j?.ok || !j.comment) {
        const problem = j?.error ?? "That didn't save.";
        setPostError(problem);
        settle({ ok: false, problem, retry: () => void post() });
        return;
      }
      const c = j.comment;
      setComments((cs) => [...(cs ?? []), { when: whenWords(c.createdAt), what: c.body, by: c.authorName, note: true }]);
      setDraft("");
      settle({ ok: true });
    } catch {
      setPostError("That didn't save. Try again in a moment.");
      settle({ ok: false, problem: "the connection dropped." });
    } finally {
      setPosting(false);
    }
  }

  /* ── what the page says ─────────────────────────────────────────────── */
  const action = app ? NEXT_ACTION[app.stageKey] : undefined;
  const thread = [...(app?.activity ?? []), ...(comments ?? [])];
  const ticked = checklist.filter((c) => c.done).length;
  const others = Math.max(0, people.length - 1);
  const stops: SpineStop[] | null = journey?.ok ? journey.stops ?? null : !app && deal ? dealStops(deal) : null;
  const hereIdx = stops ? stops.findIndex((s) => s.state === "current") : -1;
  const here = stops ? (hereIdx >= 0 ? stops[hereIdx] : stops[stops.length - 1]) : null;
  const dealHere = deal ? PORTAL_STAGES.find((s) => s.key === deal.effectiveStatusKey) ?? null : null;
  const stageLabel = here?.label ?? dealHere?.label ?? action?.label ?? "In progress";
  const forYou = journey?.ok ? (journey.actions ?? []).filter((a) => a.who === "you") : [];
  const waitingOn = forYou.length ? "you" : journey?.ok && journey.actions?.[0] ? { kirstie: "Kirstie", landlord: "the landlord", tenant: "the tenant", you: "you" }[journey.actions[0].who] : action?.who === "Us" ? "you" : action?.who === "Landlord" ? "the landlord" : null;
  const received = app?.activity?.find((a) => /received/i.test(a.what));
  const rent = app ? (/^£/.test(app.rent) ? app.rent.replace(/\s*pcm$/, "") : null) : deal?.app.offer != null ? `£${Math.round(deal.app.offer).toLocaleString("en-GB")}` : null;
  const per = !app && deal?.app.offerPeriod === "week" ? "pw" : "pcm";
  const answered = people.filter((p) => p.rightToRent === true).length;
  const plc = app ? app.stageKey === "accepted" || app.stageKey === "communicated" : false;
  const lead = people.find((p) => p.isPrimary) ?? people[0];
  const leadFile = lead?.contactId ? leadIds[lead.contactId] : null;
  const name = app?.property ?? deal?.app.propertyName ?? "This let";
  const locality = app?.locality ?? deal?.app.locality ?? "";
  const image = app?.image ?? deal?.app.image ?? null;
  const moveIn = app ? (app.moveIn !== "—" ? app.moveIn : deal?.app.startDate ?? null) : deal?.app.startDate ?? null;
  const listingId = app?.listingId ?? deal?.app.listingId ?? null;
  const dealUrl = journey?.ok && journey.deal?.url ? journey.deal.url : deal ? propolyDealUrl(deal.app.id) : null;
  const agent = app?.agent ?? deal?.agentName ?? "—";
  const dealStatus = deal ? cardStatus(deal, deal.effectiveStatusKey) : null;
  const flags = [...(journey?.ok ? journey.flags ?? [] : []), ...(deal?.flags ?? []).map((f) => f.label)].filter((f, i, all) => all.indexOf(f) === i);
  const tabs = app ? TABS : TABS.filter((t) => t.key === "file");

  const facts = [
    { icon: "calendar", label: "Move-in", text: moveIn ? niceDate(moveIn) : "Not set yet" },
    { icon: "coin", label: "Rent", text: rent ? `${rent} ${per}` : "No offer recorded" },
    { icon: "user", label: "Agent", text: agent },
    { icon: "home", label: "Service", text: deal?.serviceLevel ?? deal?.app.propoly?.service ?? "Not known yet" },
    ...(app
      ? [
          { icon: "target", label: "Came in", text: received ? niceDate(received.when) : "No date" },
          { icon: "checklist", label: "Checks", text: `${ticked} of ${checklist.length} done` },
          { icon: "shield", label: "Right to rent", text: `${answered} of ${people.length}` },
        ]
      : []),
    { icon: "wallet", label: "Holding fee", text: deal ? stageStatus(deal, "holding_fee").text : "No deal yet" },
  ];

  return (
    <SaveScopeProvider scope={saves}>
      <div data-steve="application.drawer" className="space-y-5">
        {/* ── back, the save chip, and ‹ › ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Link href={backHref} className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
              <span aria-hidden>←</span> Applications
            </Link>
            <SaveChip scope={saves} className="bg-white" />
          </div>
          {stepLabel && onStep && (
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-[11.5px] text-muted">{stepLabel}</span>
              <button type="button" aria-label="Previous let" onClick={() => onStep(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">‹</button>
              <button type="button" aria-label="Next let" onClick={() => onStep(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-[13px] text-muted transition-colors hover:text-ink">›</button>
            </div>
          )}
        </div>

        {/* Portfolio's rows: each box on the left beside its partner on the
            right. Placed by column only, so a row that is not there (the
            handover, before the offer is accepted) leaves no gap. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── 1. the home and who it is for ─────────────────────────── */}
          <Hero image={image}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <h1 className="hand min-w-0 text-[28px] leading-[1.1] sm:text-[32px]">{name}</h1>
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
          </Hero>

          {/* ── the actions, level with the home ──────────────────────── */}
          <section className={`${box} flex flex-col p-4 lg:col-start-2`}>
            <p className={`${eyebrow} mb-3 px-1`}>Actions</p>
            <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2">
              {/* The handover starts HERE. Offered once the landlord has the
                  application: before that there is no tenancy to be
                  compliant about. */}
              {plc && app && (
                <a href={`/plc/start?application=${encodeURIComponent(app.id)}`} className={tile}>
                  {tileIcon("shield", true)}
                  {tileText("Start the PLC check", "Checked before the tenancy starts")}
                </a>
              )}
              {!plc && forYou[0]?.href && (
                <a href={forYou[0].href} className={tile}>
                  {tileIcon("rocket", true)}
                  {tileText(forYou[0].label, "Your next step")}
                </a>
              )}
              {app && (
                <button
                  type="button"
                  onClick={() => {
                    goTab("activity");
                    setTimeout(() => commentBox.current?.focus({ preventScroll: true }), 400);
                  }}
                  className={tile}
                >
                  {tileIcon("message")}
                  {tileText("Add a comment", "Chased, rang, agreed - for everyone")}
                </button>
              )}
              {app && (
                <button type="button" onClick={() => goTab("documents")} className={tile}>
                  {tileIcon("upload")}
                  {tileText("Add a document", "References, right to rent, the rest")}
                </button>
              )}
              {leadFile && (
                <a href={`/leads?open=${encodeURIComponent(leadFile)}`} className={tile}>
                  {tileIcon("user")}
                  {tileText("Open the tenant's file", lead?.name ?? "The lead applicant")}
                </a>
              )}
              {listingId && (
                <Link href={`/listings/${encodeURIComponent(listingId)}`} className={tile}>
                  {tileIcon("home")}
                  {tileText("Open the listing", "The home, its offers and viewings")}
                </Link>
              )}
              {dealUrl && (
                /* Propoly opens in its own tab, so the let stays where it was. */
                <a href={dealUrl} target="_blank" rel="noreferrer" className={tile}>
                  {tileIcon("rocket")}
                  {tileText("Kirstie's deal in Propoly", "Opens in a new tab")}
                </a>
              )}
              <Link href="/applications/updates" className={tile}>
                {tileIcon("mail")}
                {tileText("Customer updates", "Who should hear what, on every let")}
              </Link>
              {plc && (
                <a href="/plc/practice" className={tile}>
                  {tileIcon("checklist")}
                  {tileText("Practise a PLC check", "Invented paperwork, nothing saved")}
                </a>
              )}
            </div>
            {plc && (
              <GuideButton id="agent-plc" icon={false} className="mt-3 self-start px-1 text-[12px] text-muted underline transition-colors hover:text-ink">
                How the PLC check works
              </GuideButton>
            )}
          </section>

          {/* Above the facts, deliberately: once the offer is accepted the
              handover IS the next action. */}
          {aside && <div className="min-w-0 lg:col-span-2">{aside}</div>}

          {/* ── 2. the facts and the people ────────────────────────────── */}
          <section className={`${box} flex min-w-0 flex-col p-4 sm:p-5 lg:col-start-1`}>
            <p className={eyebrow}>General info</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 2xl:grid-cols-4">
              {facts.map((f) => <Info key={f.label} {...f} />)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={chip}>
                <DoodleIcon name="list" size={12} className="text-accent-dark" />
                {stops && here ? `Step ${(hereIdx >= 0 ? hereIdx : stops.length - 1) + 1} of ${stops.length} · ${here.label}` : app && journey === null ? "Reading where it is…" : stageLabel}
              </span>
              {waitingOn && (
                <span className={chip}>
                  <DoodleIcon name="clock" size={12} className="text-accent-dark" />
                  {waitingOn === "you" ? <b className="font-semibold text-accent-dark">Waiting on you</b> : `Waiting on ${waitingOn}`}
                </span>
              )}
              {app && (
                <button type="button" className={chip} onClick={() => goTab("activity")}>
                  <DoodleIcon name="message" size={12} className="text-accent-dark" />
                  {comments === null ? "Reading the comments…" : `${thread.length} ${thread.length === 1 ? "entry" : "entries"}`}
                </button>
              )}
            </div>
            {flags.length > 0 && (
              <div className="mt-4 rounded-xl bg-[#fdefec] px-4 py-3 text-[12.5px] text-[#9d4340]">
                <p className="font-semibold">Needs a look, from Kirstie&apos;s side</p>
                <ul className="mt-1 list-disc pl-4">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
            <p className={`${eyebrow} mb-3 mt-5`}>{people.length === 1 ? "The applicant" : `The applicants · ${people.length}`}</p>
            {people.length ? (
              <ul className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                {people.map((p, i) => (
                  <li key={(p.contactId ?? "") + i} className="rounded-xl border border-line/50 bg-white p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold">{p.name}</span>
                      {p.isPrimary && <Pill tone="accent">Lead</Pill>}
                    </div>
                    {/* The same block as every person in the OS (James, 12 Oct 2026):
                        Call, WhatsApp, Email and copy, changeable where REX knows them. */}
                    <ContactBlock
                      showName={false}
                      role={p.isPrimary ? "lead applicant" : "applicant"}
                      person={{ name: p.name, email: p.email ?? null, phone: p.phone ?? null }}
                      personRef={/^\d+$/.test(String(p.contactId ?? "")) ? `rex:${p.contactId}` : null}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">No tenant recorded on this let yet.</p>
            )}
          </section>

          {/* ── the next step, level with the facts ───────────────────── */}
          <section className={`${pop} min-w-0 rounded-2xl border border-accent-dark/15 bg-accent-soft/60 p-5 lg:col-start-2`}>
            {app ? (
              <>
                {/* NEXT STEP (9 Oct 2026, James): the one thing to do now, with
                    its button. Drawn on the pink here, as Next up is on a
                    listing. */}
                <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
                  <NextStepCard
                    applicationId={app.id}
                    actions={journey?.ok ? journey.actions ?? [] : null}
                    loading={journey === null}
                    checks={checklist}
                    onPlay={(a) => void play(a)}
                    playing={playing}
                    confirming={confirming}
                    onChanged={() => setJourneyTick((n) => n + 1)}
                  />
                </div>
                {/* Who is doing what, for the rest of it - and Accept / Decline
                    on an offer, or a test application's own steps. */}
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
                {/* Who should hear what (2 Oct 2026): nothing reaches the
                    landlord or tenant on its own. Draws nothing when nobody is
                    waiting. */}
                <div className="mt-4 empty:hidden">
                  <CustomerUpdates
                    key={`${app.id}:${journey?.ok ? journey.deal?.id ?? "" : ""}:${journeyTick}`}
                    applicationId={app.id}
                    dealId={journey?.ok ? journey.deal?.id ?? null : null}
                    openOnly
                    hideWhenEmpty
                  />
                </div>
              </>
            ) : (
              <>
                <p className={`${eyebrow} text-accent-dark`}>Next up</p>
                <h2 className="hand mt-1.5 text-[19px] leading-tight">{dealHere?.label ?? "In Propoly"}</h2>
                {dealStatus && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{dealStatus.text}.</p>}
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  Let through Propoly, with no application in the OS. Kirstie moves it through the stages; ask her if something looks stuck.
                </p>
                {dealUrl && (
                  <a href={dealUrl} target="_blank" rel="noreferrer" className="press-ring mt-4 inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
                    Open in Propoly <span aria-hidden>↗</span>
                  </a>
                )}
              </>
            )}
          </section>

          {/* ── 3. the sections ────────────────────────────────────────── */}
          <section id="sections" className={`${box} min-w-0 scroll-mt-5 p-4 sm:p-5 lg:col-start-1`}>
            <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" aria-label="Sections">
              {tabs.map((t) => {
                const on = tab === t.key;
                const count = t.key === "people" ? people.length : t.key === "activity" ? thread.length : 0;
                const needs = t.key === "people" ? answered < people.length : false;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => pickTab(t.key)}
                    aria-current={on ? "page" : undefined}
                    className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${on ? "border-ink bg-ink text-page" : "border-line/70 bg-white hover:border-ink/40"}`}
                  >
                    <DoodleIcon name={t.icon} size={13} />
                    {t.label}
                    {count > 0 && <span className={`rounded-full px-1.5 text-[10.5px] ${on ? "bg-page/20" : "bg-accent-soft text-accent-dark"}`}>{count}</span>}
                    {needs && !on && <span aria-label="Needs attention" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent" />}
                  </button>
                );
              })}
            </nav>

            <div key={`view-${tab}`} className="fade-up mt-4">
              <p className="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-muted">{TAB_LEAD[tab]}</p>

              {tab === "activity" && app && (
                <div>
                  {thread.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line/80 px-4 py-4 text-[12.5px] text-muted">
                      {comments === null ? "Reading the comments…" : "Nothing recorded yet."}
                    </p>
                  ) : (
                    <ul className="space-y-3.5">
                      {thread.map((a, i) => (
                        <li key={i} className="flex gap-3">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.note ? "bg-accent-dark" : "bg-line"}`} />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[12.5px] leading-snug ${a.note ? "" : "text-muted"}`}>{a.what}</span>
                            <span className="mt-0.5 block text-[10.5px] text-muted">
                              {a.by} · {/^\d{4}-\d{2}-\d{2}/.test(a.when) ? niceDate(a.when.slice(0, 10)) : a.when}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* The composer. A comment is the fastest thing anyone does on
                      a stalled deal, so it is always in reach. */}
                  <div className="mt-4 border-t border-line/50 pt-4">
                    <textarea
                      ref={commentBox}
                      data-steve="application.comment"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post();
                      }}
                      placeholder="Add a comment - chased the tenant, spoke to the landlord…"
                      rows={2}
                      className="w-full resize-y rounded-xl border border-line/70 bg-page px-3 py-2.5 text-[12.5px] text-ink placeholder:text-muted focus:border-accent-dark focus:outline-none"
                    />
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <p className="text-[10.5px] text-muted">{postError ? <span className="font-semibold text-accent-dark">{postError}</span> : "⌘↵ to post"}</p>
                      <button
                        data-steve="application.post"
                        type="button"
                        onClick={() => void post()}
                        disabled={!draft.trim() || posting}
                        className="press-ring rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                      >
                        {posting ? "Posting…" : "Post comment"}
                      </button>
                    </div>
                  </div>
                  {/* What moved, on this deal alone. Newest first. */}
                  {journey?.ok && journey.history && journey.history.length > 0 && (
                    <div className="mt-5 border-t border-line/50 pt-4">
                      <p className={eyebrow}>What moved · {journey.history.length}</p>
                      <ol className="mt-2 space-y-1.5">
                        {journey.history.slice(0, 12).map((e) => {
                          const tone = eventTone(e.event);
                          return (
                            <li key={e.id} className="flex items-start gap-2 text-[12px] leading-snug">
                              <span aria-hidden className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${toneDot(tone)}`} />
                              <span className="min-w-0 flex-1">{eventSentence(e)}</span>
                              <span className="shrink-0 text-[10.5px] tabular-nums text-muted">{whenWords(e.at)}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {tab === "people" && app && (
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {people.map((p, i) => {
                    const leadId = p.contactId ? leadIds[p.contactId] : null;
                    const rows: Array<[string, React.ReactNode]> = [
                      ["Income", p.income != null ? `${gbp(p.income)} a year` : "Not recorded"],
                      ["Works", [p.employment, p.job].filter(Boolean).join(" · ") || "Not recorded"],
                      ["Employer", p.company || "Not recorded"],
                      ["Right to rent", <Answer key="rtr" v={p.rightToRent} yes="Recorded" no="Not recorded" />],
                      ["Landlord reference", <Answer key="ref" v={p.landlordRef} />],
                      ["Guarantor", <Answer key="g" v={p.guarantor} yes="Available" no="None" />],
                      ["Adverse credit", <Answer key="ac" v={p.adverseCredit == null ? null : !p.adverseCredit} yes="None" no="Disclosed" />],
                    ];
                    return (
                      <section key={(p.contactId ?? "") + i} className="min-w-0 rounded-xl border border-line/50 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="hand truncate text-[15px]">{p.name}</h3>
                          {p.isPrimary && <Pill tone="accent">Lead applicant</Pill>}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                          {rows.map(([k, v]) => (
                            <div key={k} className="min-w-0">
                              <dt className="text-[10.5px] text-muted">{k}</dt>
                              <dd className={`truncate font-semibold ${v === "Not recorded" ? "font-normal text-muted" : ""}`}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-3 border-t border-line/50 pt-3">
                          {leadId ? (
                            <a href={`/leads?open=${encodeURIComponent(leadId)}`} className="text-[12px] font-semibold text-accent-dark hover:underline">
                              Open their file
                            </a>
                          ) : (
                            <span className="text-[11.5px] text-muted">No file for them in the OS yet.</span>
                          )}
                        </div>
                      </section>
                    );
                  })}
                  {people.length > 1 && answered < people.length && (
                    <p className="text-[12px] leading-relaxed text-muted 2xl:col-span-2">
                      Right to rent is a statutory check on every adult who will live in the property. Record it for the others before the tenancy starts.
                    </p>
                  )}
                </div>
              )}

              {tab === "documents" && app && (
                /* The home's documents, shared with Kirstie's deal and the
                   listing for the same address (James, 5 Oct 2026). */
                <FileDocuments
                  address={[app.property, app.locality].filter(Boolean).join(", ")}
                  propertyId={app.propertyId ?? null}
                  from={{ kind: "application", id: app.id }}
                />
              )}

              {tab === "file" && (
                <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:p-0">
                  <PropertyFile
                    propertyId={app?.propertyId ?? null}
                    address={app?.propertyId ? null : [name, locality].filter(Boolean).join(", ")}
                    screen="the application"
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── where it's up to, level with the sections ─────────────── */}
          <section className={`${box} min-w-0 p-5 lg:col-start-2 lg:self-start`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="hand text-[17px]">Where it&apos;s up to</h3>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {stops && here ? `Step ${(hereIdx >= 0 ? hereIdx : stops.length - 1) + 1} of ${stops.length}` : "The offer, then Kirstie's eight stages."}
                </p>
              </div>
              {dealUrl && (
                <a href={dealUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11.5px] font-semibold text-accent-dark hover:underline">
                  In Propoly ↗
                </a>
              )}
            </div>
            {stops ? (
              <UpTo stops={stops} />
            ) : journey && !journey.ok ? (
              <p className="mt-3 text-[12px] text-muted">{journey.error ?? "Couldn't read where this is up to."}</p>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                Checking where this is up to&hellip;
              </p>
            )}
            {!app && deal && (
              <p className="mt-3 text-[11.5px] leading-snug text-muted">
                <DoodleIcon name={STAGE_DOODLE[deal.effectiveStatusKey] ?? "rocket"} size={11} className="mr-1 align-[-1px] text-accent-dark" />
                Kirstie moves each let through these stages.
              </p>
            )}
          </section>
        </div>
      </div>
    </SaveScopeProvider>
  );
}

/** Yes / No / Not asked, as a word with a colour. */
function Answer({ v, yes = "Yes", no = "No" }: { v: boolean | null | undefined; yes?: string; no?: string }) {
  if (v == null) return <span className="text-muted">Not asked</span>;
  return <span className={v ? "text-[#1e7a3c]" : "text-accent-dark"}>{v ? yes : no}</span>;
}
