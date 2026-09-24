"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import Doodles from "@/components/Doodles";
import PropertyPhoto from "@/components/PropertyPhoto";
import PropertyFile from "@/components/PropertyFile";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import { Pill } from "@/components/Wire";
import { type SpineStop } from "@/components/StageSpine";
import GuideButton from "@/components/GuideButton";
import { eventSentence, eventTone, type DealEvent } from "@/lib/business/deal-events";
import { WhatsAppButton } from "@/components/WhatsAppQr";

type JourneyAction = { id: string; label: string; detail: string; href: string | null; who: "you" | "kirstie" | "landlord" | "tenant" };
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
 * An application, opened out - in the same frame as the listing record and
 * the lead (James, 12 Sep 2026: "the same formatting that we've already got
 * consistent across the other tabs").
 *
 * So: the round close and the row of pill tabs at the top; a washed hero
 * with the doodles behind it - the photograph left, who and what in the
 * middle, At a glance in a white box on the right; then white cards with
 * hand-drawn titles. Blush here, because the listing's is sage and the two
 * alternate.
 *
 * Laid out around the question Kirstie actually asks, which is never "what
 * are this deal's attributes" but "what is holding it up and who touched it
 * last": the one thing to do next, where it is, the checks, and the running
 * account of the deal down the right. The people on it and the property's
 * file each get a tab of their own.
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

const BLUSH_WASH = "color-mix(in srgb, var(--accent-soft) 70%, white)";

type TabKey = "home" | "people" | "file";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "home", label: "Application", icon: "doc" },
  { key: "people", label: "Applicants", icon: "user" },
  { key: "file", label: "Property file", icon: "shield" },
];

/* ── The pieces the other records use ─────────────────────────────────── */

/** A white card with a hand-drawn title, as on the listing record. */
function Card({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
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

/** One line of At a glance: an icon in a box, a fact, and a word under it. */
function Glance({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/50 bg-white text-accent-dark">
        <DoodleIcon name={icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold leading-snug">{title}</span>
        {sub && <span className="block text-[12px] leading-snug text-muted">{sub}</span>}
      </span>
    </li>
  );
}

/** A tab's heading: the wash, the doodles, and a picture in the corner. */
function ViewTitle({ title, sub, art }: { title: string; sub: string; art?: string }) {
  return (
    <div className="relative mb-5 min-h-[150px] overflow-hidden rounded-[22px] border border-line/50" style={{ background: BLUSH_WASH }}>
      <Doodles tone="blush" />
      <div className="relative max-w-[60%] p-6 sm:max-w-[62%]">
        <h2 className="hand text-[26px] leading-tight">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{sub}</p>
      </div>
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" aria-hidden className="pointer-events-none absolute -bottom-6 right-4 hidden h-[190px] w-auto sm:block" />
      )}
    </div>
  );
}

/**
 * The journey as a track: numbered stops joined by a line, then a box for
 * each stop with its one line of evidence - the listing record's shape, so
 * the two read the same. Scrolls sideways rather than wrapping: eleven stops
 * on two rows would put Move day under Received.
 */
function Track({ stops }: { stops: SpineStop[] }) {
  const cols = { gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` };
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-1">
      <ol className="grid min-w-[1040px]" style={cols}>
        {stops.map((s, i) => {
          const done = s.state === "done";
          const cur = s.state === "current";
          const off = s.state === "off";
          return (
            <li key={s.id} className="relative flex flex-col items-center px-1 text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute left-[-50%] right-[50%] top-[13px] ${done || cur ? "h-0.5 bg-accent-dark/60" : "h-0 border-t-2 border-dashed border-line/80"}`}
                />
              )}
              <span
                className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold ${
                  done ? "bg-accent-dark/70 text-white" : cur ? "bg-accent-dark text-white" : off ? "border-[1.5px] border-line/60 bg-line/30 text-muted" : "border-[1.5px] border-line/80 bg-white text-muted"
                }`}
              >
                {done ? "✓" : off ? "–" : i + 1}
              </span>
              <p className={`mt-2.5 text-[12px] leading-tight ${cur ? "font-semibold" : "text-muted"}`}>{s.label}</p>
            </li>
          );
        })}
      </ol>
      <ol className="mt-4 grid min-w-[1040px] gap-2" style={cols}>
        {stops.map((s) => {
          const done = s.state === "done";
          const cur = s.state === "current";
          return (
            <li
              key={s.id}
              className={`rounded-2xl border p-3 ${cur ? "border-accent/70 bg-accent-soft/50" : done ? "border-transparent" : "border-line/50"}`}
              style={done ? { background: BLUSH_WASH } : undefined}
            >
              <p className={`text-[11.5px] leading-tight ${cur ? "font-semibold" : "text-muted"}`}>{s.label}</p>
              {s.sub ? (
                <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-snug">
                  <span
                    aria-hidden
                    className={`mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full ${s.tone === "ok" ? "bg-emerald-600" : s.tone === "warn" ? "bg-amber-500" : "bg-line"}`}
                  />
                  <span className={done || cur ? "text-ink" : "text-muted"}>{s.sub}</span>
                </p>
              ) : cur ? (
                <p className="mt-2 text-[10.5px] leading-snug text-muted">Here now</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Yes / No / Not asked, as a word with a colour. */
function Answer({ v, yes = "Yes", no = "No" }: { v: boolean | null | undefined; yes?: string; no?: string }) {
  if (v == null) return <span className="text-muted">Not asked</span>;
  return <span className={v ? "text-[#1e7a3c]" : "text-accent-dark"}>{v ? yes : no}</span>;
}

export default function ApplicationDrawer({
  app,
  checklist,
  aside,
  onClose,
}: {
  app: AppRecord;
  stages?: Stage[];
  checklist: Check[];
  /** Anything the stage itself calls for - the handover packet, once accepted. */
  aside?: React.ReactNode;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<TabKey>("home");
  /* The Auto save chip by the close button (23 Sep 2026): the comment, the
     property file and whatever the stage adds below report to it. */
  const saves = useSaveScope(app.id);
  /* The people on this application, and which of them the OS already has a
     lead for. Asked once when the drawer opens. */
  const [leadIds, setLeadIds] = useState<Record<string, string>>({});
  /* Everyone on the application; falls back to the single name the record
     carries, so an application with no applicant rows still shows somebody. */
  const people: AppPerson[] = app?.applicants?.length
    ? app.applicants
    : app
      ? [{ name: app.tenant, contactId: null, email: null, phone: null, isPrimary: true }]
      : [];

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
  /* The thread, from the OS. REX gives the milestones above; this is what
     people typed, and it comes back on every open rather than living and
     dying in this component. */
  const [comments, setComments] = useState<AppActivity[] | null>(null);
  /* The journey: REX's three stops then Kirstie's eight, read from where her
     board reads them, with what the agent should do about it. Loads after
     the drawer opens - it touches Propoly and PayProp. */
  const [journey, setJourney] = useState<Journey | null>(null);

  useEffect(() => {
    let live = true;
    setJourney(null);
    fetch(`/api/applications/${encodeURIComponent(app.id)}/journey`)
      .then((r) => r.json())
      .then((j: Journey) => live && setJourney(j))
      .catch(() => live && setJourney({ ok: false, error: "Couldn't read the journey." }));
    return () => {
      live = false;
    };
  }, [app.id]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [app.id]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const action = NEXT_ACTION[app.stageKey];
  const thread = [...(app.activity ?? []), ...(comments ?? [])];
  const ticked = checklist.filter((c) => c.done).length;
  const outstanding = checklist.length - ticked;
  const others = Math.max(0, people.length - 1);

  /* Where it is, in words, for the eyebrow and At a glance: the journey's
     current stop once it has landed, REX's status until then. */
  const stops = journey?.ok ? journey.stops ?? null : null;
  const hereIdx = stops ? stops.findIndex((s) => s.state === "current") : -1;
  const here = stops ? (hereIdx >= 0 ? stops[hereIdx] : stops[stops.length - 1]) : null;
  const stageLabel = here?.label ?? action?.label ?? "In progress";
  const stepWords = stops && here ? `step ${(hereIdx >= 0 ? hereIdx : stops.length - 1) + 1} of ${stops.length} · ${here.label}` : journey === null ? "reading the journey…" : stageLabel;
  const forYou = journey?.ok ? (journey.actions ?? []).filter((a) => a.who === "you") : [];
  const waitingOn = forYou.length ? "You" : journey?.ok && journey.actions?.[0] ? { kirstie: "Kirstie", landlord: "The landlord", tenant: "The tenant", you: "You" }[journey.actions[0].who] : action?.who === "Us" ? "You" : action?.who === "Landlord" ? "The landlord" : "Nobody";
  const received = app.activity?.find((a) => /received/i.test(a.what));
  const rent = /^£/.test(app.rent) ? app.rent.replace(/\s*pcm$/, "") : null;
  const answered = people.filter((p) => p.rightToRent === true).length;
  const plc = app.stageKey === "accepted" || app.stageKey === "communicated";
  const lead = people.find((p) => p.isPrimary) ?? people[0];

  async function post() {
    const text = draft.trim();
    if (!text || posting) return;
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

  const brownButton = "press-ring inline-flex items-center gap-2 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90";
  const whiteButton = "press-ring inline-flex items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40";

  return (
    <SaveScopeProvider scope={saves}>
    <div className="fixed inset-0 z-[130]" data-steve="application.drawer">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-label={`Application: ${app.tenant}`}
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-lg bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* The whole record scrolls, tabs included, as the listing does. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
          {/* Close, and the tabs. */}
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 bg-white text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
              title="Close (Esc)"
            >
              ✕
            </button>
            <SaveChip scope={saves} />
            <div className="ml-auto flex min-w-0 max-w-full gap-2 overflow-x-auto pb-0.5">
              {TABS.map((t) => {
                const count = t.key === "people" ? people.length : 0;
                const on = tab === t.key;
                /* A pink dot where something needs doing on that tab. */
                const needs = t.key === "people" ? answered < people.length : false;
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
              {/* ── THE HERO: the photograph left, who and what in the middle,
                  At a glance in a white box on the right. ── */}
              <header className="relative overflow-hidden rounded-[22px] border border-line/50" style={{ background: BLUSH_WASH }}>
                <Doodles tone="blush" />
                <div className="relative p-5">
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
                    <div className="flex min-w-0 flex-col">
                      <div className="relative h-[220px] w-full flex-1 overflow-hidden rounded-2xl border border-white/70 bg-white md:h-auto md:min-h-[240px]">
                        <PropertyPhoto src={app.image} className="absolute inset-0 h-full w-full" />
                      </div>
                    </div>

                    <div className="min-w-0 md:pr-2">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Application · {stepWords}</p>
                      <h2 className="hand mt-2 text-[28px] leading-[1.1]">
                        {app.tenant}
                        {others > 0 && <span className="ml-2 whitespace-nowrap text-[14px] font-normal text-muted">+ {others} other{others === 1 ? "" : "s"}</span>}
                      </h2>
                      <p className="mt-1.5 text-[13px] text-muted">{app.property} · {app.locality}</p>
                      <p className="mt-3 flex items-baseline gap-1.5">
                        <span className="figures text-[28px] leading-none">{rent ?? "—"}</span>
                        <span className="text-[12px] text-muted">{rent ? "pcm" : "no offer recorded"} · moves {niceDate(app.moveIn)}</span>
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-accent-dark">{stageLabel}</span>
                        {app.flag && <Pill tone="accent">{app.flag}</Pill>}
                        <span className="text-[11.5px] text-muted">with {app.agent}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2.5">
                        {/* The handover starts HERE, on the record. Offered once
                            the landlord has the application: before that there is
                            no tenancy to be compliant about. */}
                        {plc && (
                          <>
                            <a href={`/plc/start?application=${encodeURIComponent(app.id)}`} className={brownButton}>
                              <DoodleIcon name="shield" size={14} />
                              Start the PLC check
                            </a>
                            {/* Deliberately quiet, and deliberately right here.
                                The handover locks the pack when it is sent, so
                                the moment somebody wishes they had done one
                                before is the moment they are about to do their
                                first. Invented paperwork, nothing saved. */}
                            <a href="/plc/practice" className="self-center text-[12px] text-muted underline transition-colors hover:text-ink">
                              Never done one? Practise it first
                            </a>
                            <GuideButton
                              id="agent-plc"
                              icon={false}
                              className="self-center text-[12px] text-muted underline transition-colors hover:text-ink"
                            >
                              How it works
                            </GuideButton>
                          </>
                        )}
                        {!plc && forYou[0]?.href && (
                          <a href={forYou[0].href} className={brownButton}>
                            <DoodleIcon name="rocket" size={14} />
                            {forYou[0].label}
                          </a>
                        )}
                        <button type="button" onClick={() => setTab("people")} className={whiteButton}>
                          <DoodleIcon name="user" size={14} className="text-accent-dark" />
                          {people.length === 1 ? "The applicant" : "The applicants"}
                        </button>
                      </div>
                    </div>

                    <aside className="rounded-2xl border border-line/40 bg-white p-4 md:col-span-2 xl:col-span-1">
                      <p className="hand flex items-center gap-2 text-[14px]">
                        <DoodleIcon name="magic-wand" size={14} className="text-accent-dark" />
                        At a glance
                      </p>
                      <ul className="mt-4 space-y-3.5">
                        <Glance icon="target" title={received ? `Came in ${niceDate(received.when)}` : "Came in"} sub={received ? `by ${received.by}` : "no date on the record"} />
                        <Glance icon="list" title={stageLabel} sub={`Waiting on ${waitingOn.toLowerCase() === "you" ? "you" : waitingOn.toLowerCase()}`} />
                        <Glance icon="checklist" title={`${ticked} of ${checklist.length} checks done`} sub={outstanding ? `${outstanding} still to tick` : "All ticked"} />
                        <Glance icon="user" title={people.length === 1 ? "Sole applicant" : `${people.length} applicants`} sub={answered === people.length ? "Right to rent recorded for everyone" : `Right to rent recorded for ${answered} of ${people.length}`} />
                      </ul>
                    </aside>
                  </div>
                </div>
              </header>

              {/* Above the boxes, deliberately: once a deal is accepted the
                  handover IS the next action. */}
              {aside && <div className="mt-5">{aside}</div>}

              {/* ── THREE BOXES (James, 12 Sep 2026): what needs doing, the
                  checks, and the running account of the deal, side by side;
                  the spine runs across the bottom under them. ── */}
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <Card title="Needs you" icon="bell">
                  {journey?.ok && journey.actions ? (
                    <>
                      {forYou.length === 0 ? (
                        <p className="text-[13px] leading-relaxed text-muted">
                          Nothing for you right now.
                          {journey.actions[0] ? ` ${journey.actions[0].label} - ${journey.actions[0].detail}` : ""}
                        </p>
                      ) : (
                        <ul className="space-y-2.5">
                          {journey.actions.map((a) => (
                            <li key={a.id} className="flex items-start gap-2.5">
                              <Pill tone={a.who === "you" ? "accent" : "neutral"}>
                                {a.who === "you" ? "You" : a.who === "kirstie" ? "Kirstie" : a.who === "landlord" ? "Landlord" : "Tenant"}
                              </Pill>
                              <span className="min-w-0 flex-1">
                                {a.href ? (
                                  <a
                                    href={a.href}
                                    /* Propoly opens in its own tab, so the application stays where the agent left it. */
                                    {...(/^https?:/.test(a.href) ? { target: "_blank", rel: "noreferrer" } : {})}
                                    className="block text-[13px] font-semibold leading-tight underline-offset-2 hover:underline"
                                  >
                                    {a.label}
                                  </a>
                                ) : (
                                  <span className="block text-[13px] font-semibold leading-tight">{a.label}</span>
                                )}
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{a.detail}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {journey.flags && journey.flags.length > 0 && (
                        <div className="mt-3.5 border-t border-line/50 pt-3">
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">From Kirstie&apos;s side</p>
                          <ul className="mt-1.5 space-y-1 text-[12px] leading-snug">
                            {journey.flags.map((f) => (
                              <li key={f} className="flex gap-2">
                                <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : action ? (
                    <>
                      <p className="text-[13.5px] leading-relaxed">{action.do}</p>
                      <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                        Waiting on
                        <Pill tone={action.who === "Us" ? "accent" : "neutral"}>{action.who}</Pill>
                        {journey === null && <span className="ml-auto">Reading the journey…</span>}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted">Nothing recorded against this stage.</p>
                  )}
                </Card>

                <Card title="Checklist" icon="checklist" action={<span className="figures text-[12px] text-muted">{ticked}/{checklist.length}</span>}>
                  {/* WHAT IS DONE COLLAPSES; WHAT IS LEFT DOES NOT.
                      Danielle, 11 Sep: the completed items should fold away.
                      They were all drawn the same - four items, every one with
                      its explanatory line under it - so a checklist reading 3
                      of 4 gave the same weight to the three that are finished
                      as to the one thing somebody has to go and do, and the
                      outstanding item did not stand out at all.

                      A done row keeps its tick and its label and loses the
                      note: the note explains what is needed, and nothing is
                      needed any more. The outstanding rows keep everything and
                      are the only ones in full ink. Nothing is hidden - a
                      checklist that hides what was ticked cannot be audited,
                      and this one is read months later by somebody asking why
                      a tenancy was allowed to start. */}
                  <ul className="space-y-2.5">
                    {[...checklist].sort((a, b) => Number(a.done) - Number(b.done)).map((c) => (
                      <li key={c.label} className={`flex items-start gap-2.5 ${c.done ? "text-[12px]" : "text-[13px]"}`}>
                        <span
                          className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            c.done ? "mt-0 h-[15px] w-[15px] border-accent-dark bg-accent-dark text-white" : "mt-0.5 h-[17px] w-[17px] border-line bg-white text-muted"
                          }`}
                        >
                          {c.done ? "✓" : ""}
                        </span>
                        <span className="min-w-0">
                          <span className={c.done ? "text-muted line-through" : "font-semibold"}>{c.label}</span>
                          {c.note && !c.done ? <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{c.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card
                  title="Activity & comments"
                  icon="message"
                  action={<span className="text-[11px] text-muted">{comments === null ? "Loading…" : `${thread.length} ${thread.length === 1 ? "entry" : "entries"}`}</span>}
                >
                  {thread.length === 0 ? (
                    <p className="text-[12.5px] text-muted">
                      Nothing recorded yet. A comment here is kept on the application and shows for everyone who opens it.
                    </p>
                  ) : (
                    <ul className="max-h-[220px] space-y-3.5 overflow-y-auto">
                      {thread.map((a, i) => (
                        <li key={i} className="flex gap-3">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.note ? "bg-accent-dark" : "bg-line"}`} />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[12.5px] leading-snug ${a.note ? "" : "text-muted"}`}>{a.what}</span>
                            <span className="mt-0.5 block text-[10.5px] text-muted">
                              {a.by} · {a.when}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* The composer. A comment is the fastest thing anyone does on
                      a stalled deal, so it is always in reach, not behind a button. */}
                  <div className="mt-4 border-t border-line/50 pt-4">
                    <textarea data-steve="application.comment"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
                      }}
                      placeholder="Add a comment - chased the tenant, spoke to the landlord…"
                      rows={2}
                      className="w-full resize-y rounded-xl border border-line/70 bg-page px-3 py-2.5 text-[12.5px] text-ink placeholder:text-muted focus:border-accent-dark focus:outline-none"
                    />
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <p className="text-[10.5px] text-muted">{postError ? <span className="font-semibold text-accent-dark">{postError}</span> : "⌘↵ to post"}</p>
                      <button data-steve="application.post"
                        type="button"
                        onClick={() => void post()}
                        disabled={!draft.trim() || posting}
                        className="press-ring rounded-full bg-[var(--brown)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                      >
                        {posting ? "Posting…" : "Post comment"}
                      </button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ── THE SPINE, across the bottom: the journey as a track, each
                  step in its own box, the way the listing record draws its
                  own. REX's stops then Kirstie's eight, read from where her
                  board reads them; it says it is checking rather than showing
                  REX's four and redrawing (James, 10 Sep 2026). ── */}
              <div className="mt-5">
                <Card
                  title="Where it's up to"
                  icon="target"
                  action={
                    <span className="flex items-center gap-3 text-[11.5px] text-muted">
                      {stops && here && <span>Step {(hereIdx >= 0 ? hereIdx : stops.length - 1) + 1} of {stops.length}</span>}
                      {journey?.ok && journey.deal && (
                        <a href={journey.deal.url} target="_blank" rel="noreferrer" className="font-semibold text-accent-dark hover:underline">
                          Kirstie&apos;s deal in Propoly →
                        </a>
                      )}
                    </span>
                  }
                >
                  {stops ? (
                    <Track stops={stops} />
                  ) : journey && !journey.ok ? (
                    <p className="text-[12px] text-muted">{journey.error ?? "Couldn't read where this is up to."}</p>
                  ) : (
                    <p className="flex items-center gap-2 text-[12px] text-muted">
                      <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                      Checking where this is up to&hellip;
                    </p>
                  )}
                  {/* What moved, on this deal alone. Newest first. */}
                  {journey?.ok && journey.history && journey.history.length > 0 && (
                    <details className="group mt-4 border-t border-line/50 pt-3">
                      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wide text-muted">
                        What moved
                        <span className="ml-1.5 font-normal normal-case tracking-normal">
                          · {journey.history.length} {journey.history.length === 1 ? "move" : "moves"}, last {whenWords(journey.history[0].at)}
                        </span>
                      </summary>
                      <ol className="mt-2 space-y-1.5">
                        {journey.history.slice(0, 8).map((e) => {
                          const tone = eventTone(e.event);
                          return (
                            <li key={e.id} className="flex items-start gap-2 text-[12px] leading-snug">
                              <span
                                aria-hidden
                                className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                  tone === "ok" ? "bg-emerald-600" : tone === "warn" ? "bg-amber-500" : "bg-line"
                                }`}
                              />
                              <span className="min-w-0 flex-1">{eventSentence(e)}</span>
                              <span className="shrink-0 text-[10.5px] tabular-nums text-muted">{whenWords(e.at)}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  )}
                </Card>
              </div>
            </div>
          )}

          {tab === "people" && (
            <div key="people" className="fade-up">
              <ViewTitle
                title={people.length === 1 ? "The applicant" : `The applicants · ${people.length}`}
                sub="Everyone on the application, and the ways through to each of them. Only the lead applicant is asked the four questions - the form stops after them."
                art="/brand/art/moving-in.png"
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {people.map((p, i) => {
                  const leadId = p.contactId ? leadIds[p.contactId] : null;
                  const facts: Array<[string, React.ReactNode]> = [
                    ["Income", p.income != null ? `${gbp(p.income)} a year` : "Not recorded"],
                    ["Works", [p.employment, p.job].filter(Boolean).join(" · ") || "Not recorded"],
                    ["Employer", p.company || "Not recorded"],
                    ["Right to rent", <Answer key="rtr" v={p.rightToRent} yes="Recorded" no="Not recorded" />],
                    ["Landlord reference", <Answer key="ref" v={p.landlordRef} />],
                    ["Guarantor", <Answer key="g" v={p.guarantor} yes="Available" no="None" />],
                    ["Adverse credit", <Answer key="ac" v={p.adverseCredit == null ? null : !p.adverseCredit} yes="None" no="Disclosed" />],
                  ];
                  return (
                    <Card key={(p.contactId ?? "") + i} title={p.name} icon="user" action={p.isPrimary ? <Pill tone="accent">Lead applicant</Pill> : undefined}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                        {p.phone ? (
                          <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 hover:underline">
                            <DoodleIcon name="call" size={12} className="text-accent-dark" />
                            {p.phone}
                          </a>
                        ) : (
                          <span className="text-muted">No phone</span>
                        )}
                        {p.phone && (
                          <WhatsAppButton phone={p.phone} name={p.name} className="flex items-center gap-1.5 hover:underline">
                            <DoodleIcon name="message-2" size={12} className="text-accent-dark" />
                            WhatsApp
                          </WhatsAppButton>
                        )}
                        {p.email ? (
                          <a href={`mailto:${p.email}`} className="flex min-w-0 items-center gap-1.5 hover:underline">
                            <DoodleIcon name="mail" size={12} className="text-accent-dark" />
                            <span className="truncate">{p.email}</span>
                          </a>
                        ) : (
                          <span className="text-muted">No email</span>
                        )}
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/50 pt-3 text-[12px]">
                        {facts.map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <dt className="text-[10.5px] text-muted">{k}</dt>
                            <dd className={`truncate font-semibold ${v === "Not recorded" ? "font-normal text-muted" : ""}`}>{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {leadId && (
                          <a href={`/leads?open=${encodeURIComponent(leadId)}`} className={brownButton.replace("px-4 py-2.5 text-[12.5px]", "px-3.5 py-1.5 text-[11.5px]")}>
                            Open their file
                          </a>
                        )}
                        {/* "Open in REX" sat here until 16 Sep 2026. Agents
                            don't work in REX, so the OS file is the only door. */}
                        {!leadId && <span className="text-[11.5px] text-muted">No file for them in the OS yet.</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>
              {lead && people.length > 1 && answered < people.length && (
                <p className="mt-4 text-[12px] leading-relaxed text-muted">
                  Right to rent is a statutory check on every adult who will live in the property. Record it for the others before the tenancy starts.
                </p>
              )}
            </div>
          )}

          {tab === "file" && (
            <div key="file" className="fade-up">
              <ViewTitle
                title="The property file"
                sub="What the tenancy has to be compliant about, and the certificates already held. A certificate filed here is on the property from then on."
                art="/brand/art/keys-handover.png"
              />
              <PropertyFile propertyId={app.propertyId ?? null} address={app.propertyId ? null : `${app.property}, ${app.locality}`} screen="the application" />
            </div>
          )}
        </div>
      </aside>
    </div>
    </SaveScopeProvider>
  );
}
