"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { Tag } from "@/components/ListingTags";
import PassportAnswers from "@/components/passport/PassportAnswers";
import NotifyEnquiries from "@/components/listing/NotifyEnquiries";
import AutoPassportStage from "@/components/listing/AutoPassportStage";
import { Badge, Ico } from "@/components/new-look/Parts";
import dynamic from "next/dynamic";
import { readJson } from "@/lib/page-cache";
import type { Lead } from "@/lib/leads-sample";

const LeadDrawer = dynamic(() => import("@/components/LeadDrawer"), { ssr: false });

/**
 * A LISTING'S ENQUIRIES, WITH THEIR PASSPORTS (James, 8 Oct 2026).
 *
 * The people who asked about the home from Rightmove, Zoopla and the rest -
 * not offers ("no one's offered on the property, so it's not an offer").
 * Each row says where their tenant passport is, live from
 * /api/tenant/passport/status: Not sent, Sent, Filling in, Passport done.
 * A done one (or one being filled in) opens as a list of answers.
 *
 * Send passports: tick who, read the email they will get, then send. Each
 * goes on its own through POST /api/tenant/passport/invite - from the
 * agent's own mailbox, behind the customer email switch, one passport per
 * tenant - and the row turns to Sent. Nothing goes until Send is pressed.
 *
 * OPENED IN PLACE (20 Oct 2026). A row was a plain link to /leads?open=, so
 * working through a listing's enquirers loaded the whole OS twice a person -
 * once onto Leads, once back onto the listing - about 22 calls each, and
 * Sean McMahon was paused by the pace cap doing exactly that with his own
 * leads. Now the lead's file opens over the listing, Next and Previous step
 * through the enquirers, and closing it leaves you where you were. The lead
 * comes from the board read the Leads page already holds in this tab
 * (lib/page-cache), or a search on file for one older than the newest 500;
 * if neither finds it, the row goes to Leads as before. Cmd/Ctrl-click still
 * opens Leads in a new tab.
 *
 * AUTOMATE PASSPORT (Dan Richards and Sean McMahon, 21 Oct 2026). A switch
 * beside Send passports: on, every new enquiry gets the passport within five
 * minutes, from whoever turned it on, and one encouraging reminder a day
 * later if it is not finished (lib/auto-passport). Turning it on shows the
 * reminder first, with a button to send it to yourself.
 *
 * NOTIFY ENQUIRIES (James, 22 Oct 2026). Once the home is let or let agreed,
 * a button to tell everyone else who asked that it's gone, with Show Me
 * Other Homes in the email (components/listing/NotifyEnquiries).
 */

export type Enquiry = { id: string; name: string; source: string; received: string; receivedAt?: string; email: string; phone: string; message?: string };
type Status = { state: "none" | "sent" | "started" | "done"; invitedAt: string | null; submittedAt: string | null };
type Result = { email: string; name: string; ok: boolean; said: string };

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

function StatusPill({ s, auto, onOpen }: { s: Status | undefined; auto?: boolean; onOpen: () => void }) {
  if (!s || s.state === "none") return <Tag tone="neutral">Not sent</Tag>;
  if (s.state === "sent") return <Tag tone="accent">{`${auto ? "Auto sent" : "Sent"}${s.invitedAt ? ` ${short(s.invitedAt)}` : ""}`}</Tag>;
  if (s.state === "started")
    return (
      <button type="button" onClick={onOpen} className="rounded-full border border-accent-dark/60 bg-white px-2.5 py-1 text-[11px] font-semibold text-accent-dark hover:bg-accent-soft">
        Filling in
      </button>
    );
  return (
    <button type="button" onClick={onOpen} className="rounded-full bg-accent-dark px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90" title="Open their answers">
      ✓ Passport done
    </button>
  );
}

type Auto = { on: boolean; by: string | null; mine: boolean; since: string | null };

/* The new look's age: worked out from when it came in, so it never goes stale on an open page. */
function ageOf(e: Enquiry): string {
  const t = e.receivedAt ? Date.parse(e.receivedAt) : NaN;
  if (Number.isNaN(t)) return e.received.replace(/[\u2013\u2014]/g, "-");
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
/* Where it came from, without the word REX: "REX diary" reads "Diary". */
function sourceLabel(s: string): string {
  const raw = s.trim();
  if (!raw) return "";
  const t = raw.replace(/\bREX\b/gi, "").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Diary";
}

export default function ListingEnquiries({ enquiries, home, listingId, propertyId = null, letDone = false, look, onBookViewing }: {
  enquiries: Enquiry[];
  /** "new": the new look's list (lib/new-look). Without it, the list as it has always been. */
  look?: "new";
  /** The new look's Book viewing link on each row. Without it the link is not shown. */
  onBookViewing?: (e: Enquiry) => void;
  /** The listing's property, for its viewings (who has already viewed). */
  propertyId?: string | null;
  /** Let or let agreed: Notify Enquiries shows (22 Oct 2026). */
  letDone?: boolean;
  /** The listing, for its Automate passport switch. Without it the switch is not shown. */
  listingId?: string | number;
  /** The listing's address with its postcode: a Scottish home's passports carry no nationality (lib/passport-scotland). */
  home?: string;
}) {
  const [statuses, setStatuses] = useState<Record<string, Status> | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [viewing, setViewing] = useState<{ email: string; name: string } | null>(null);
  /* The enquirer whose lead file is open over the listing, and which row is fetching it. */
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  /* Automate passport: the switch as stored, who has had one automatically,
     and the turn-on sheet with the reminder in it. */
  const [auto, setAuto] = useState<Auto | null>(null);
  const [autoSent, setAutoSent] = useState<Set<string>>(new Set());
  const [autoAsk, setAutoAsk] = useState(false);
  const closeAutoAsk = useCallback(() => setAutoAsk(false), []);
  const [reminder, setReminder] = useState<{ subject: string; html: string } | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const autoUrl = listingId != null ? `/api/listings/${encodeURIComponent(String(listingId))}/auto-passport` : null;

  const emails = useMemo(() => [...new Set(enquiries.map((e) => e.email.trim().toLowerCase()).filter(emailOk))], [enquiries]);
  const readStatuses = useCallback(() => {
    if (!emails.length) return setStatuses({});
    fetch("/api/tenant/passport/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails }) })
      .then((r) => r.json())
      .then((j: { ok?: boolean; statuses?: Record<string, Status> }) => setStatuses(j.ok ? (j.statuses ?? {}) : {}))
      .catch(() => setStatuses({}));
  }, [emails]);
  useEffect(() => {
    setStatuses(null);
    readStatuses();
  }, [readStatuses]);

  useEffect(() => {
    if (!autoUrl) return;
    let live = true;
    fetch(autoUrl, { cache: "no-store" })
      .then((r) => r.json() as Promise<Auto & { ok?: boolean; autoSent?: string[] }>)
      .then((j) => {
        if (!live || !j.ok) return;
        setAuto({ on: j.on, by: j.by, mine: j.mine, since: j.since });
        setAutoSent(new Set(j.autoSent ?? []));
      })
      .catch(() => null);
    return () => { live = false; };
  }, [autoUrl]);

  async function postAuto(body: Record<string, unknown>) {
    if (!autoUrl) return null;
    return fetch(autoUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ home, ...body }) })
      .then((r) => r.json() as Promise<Auto & { ok?: boolean; error?: string; said?: string; to?: string; subject?: string; html?: string }>)
      .catch(() => null);
  }
  async function askAuto() {
    setAutoNote(null);
    setReminder(null);
    setAutoAsk(true);
    const j = await postAuto({ preview: true });
    if (j?.ok && j.html) setReminder({ subject: j.subject ?? "", html: j.html });
  }
  async function turnAuto(on: boolean) {
    if (autoBusy) return;
    setAutoBusy(true);
    setAutoNote(null);
    const j = await postAuto({ on });
    setAutoBusy(false);
    if (!j?.ok) return setAutoNote(j?.error ?? "That didn't save - the connection dropped.");
    setAuto({ on: j.on, by: j.by, mine: j.mine, since: j.since });
    setAutoAsk(false);
  }
  async function reminderToMe() {
    if (autoBusy) return;
    setAutoBusy(true);
    setAutoNote(null);
    const j = await postAuto({ test: true });
    setAutoBusy(false);
    setAutoNote(j?.ok ? `Sent to ${j.to}. Have a look in your inbox.` : (j?.said ?? j?.error ?? "It didn't send - the connection dropped."));
  }

  const statusOf = (e: Enquiry) => statuses?.[e.email.trim().toLowerCase()];
  /* One row a person: the same tenant can enquire twice. */
  const people = useMemo(() => {
    const seen = new Set<string>();
    return enquiries.filter((e) => {
      const k = e.email.trim().toLowerCase() || e.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [enquiries]);
  const sendable = (e: Enquiry) => emailOk(e.email) && (statusOf(e)?.state ?? "none") === "none";
  const notSent = people.filter(sendable);
  const counts = useMemo(() => {
    const c = { none: 0, sent: 0, started: 0, done: 0 };
    for (const e of people) c[statusOf(e)?.state ?? "none"]++;
    return c;
  }, [people, statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const startPicking = () => {
    setResults(null);
    setChosen(new Set(notSent.map((e) => e.email.trim().toLowerCase())));
    setPicking(true);
  };
  const recipients = people.filter((e) => chosen.has(e.email.trim().toLowerCase()));

  /* The lead behind an enquiry: the tab's own board read first, then the file. */
  async function findLead(e: Enquiry): Promise<Lead | null> {
    const board = await readJson<{ ok?: boolean; live?: boolean; leads?: Lead[] }>("/api/leads", (j) => Boolean(j?.ok && j.live && Array.isArray(j.leads))).catch(() => null);
    const hit = board?.leads?.find((l) => l.id === e.id);
    if (hit) return hit;
    const needle = emailOk(e.email) ? e.email.trim() : e.name.trim();
    if (needle.length < 3) return null;
    const found = await fetch(`/api/leads/search?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; leads?: Lead[] }>) : null))
      .catch(() => null);
    return found?.leads?.find((l) => l.id === e.id) ?? null;
  }
  async function openEnquirer(e: Enquiry) {
    if (opening) return;
    setOpening(e.id);
    const lead = await findLead(e);
    setOpening(null);
    if (lead) setOpenLead(lead);
    else window.location.assign(`/leads?open=${encodeURIComponent(e.id)}`);
  }
  /* Next / Previous in the lead file walk this listing's enquirers. */
  function stepEnquirer(delta: number) {
    if (!openLead) return;
    const at = people.findIndex((e) => e.id === openLead.id);
    const next = at < 0 ? null : people[at + delta];
    if (next) void openEnquirer(next);
  }

  async function openReview(first: Enquiry | undefined = recipients[0]) {
    setReviewing(true);
    setPreview(null);
    const j = await fetch("/api/tenant/passport/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preview: true, name: first?.name ?? "" }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; subject?: string; html?: string }>)
      .catch(() => null);
    if (j?.ok && j.html) setPreview({ subject: j.subject ?? "", html: j.html });
  }

  async function sendAll() {
    if (sending) return;
    setSending(true);
    const out: Result[] = [];
    for (const e of recipients) {
      const j = await fetch("/api/tenant/passport/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: e.name, email: e.email.trim(), home }),
      })
        .then((r) => r.json() as Promise<{ ok?: boolean; alreadySent?: boolean; invitedAt?: string; error?: string; said?: string }>)
        .catch(() => null);
      out.push({
        email: e.email,
        name: e.name,
        ok: Boolean(j?.ok),
        said: !j ? "The connection dropped." : j.ok ? (j.alreadySent ? `Already sent ${j.invitedAt ? short(j.invitedAt) : "before"}.` : "Sent.") : (j.error ?? "It didn't send."),
      });
      setResults([...out]);
    }
    setSending(false);
    setReviewing(false);
    setPicking(false);
    setChosen(new Set());
    readStatuses();
  }

  const sentCount = results?.filter((r) => r.ok).length ?? 0;

  /* The pop-ups, shared by both looks: they portal to the page, so they keep their own styling. */
  const overlays = (
    <>
      {/* Read it, then send: who it goes to and the email they will get. */}
      {reviewing &&
        createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" data-steve-never>
            <button aria-label="Close" onClick={() => !sending && setReviewing(false)} className="absolute inset-0 cursor-default bg-ink/45" />
            <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
              <div className="shrink-0 border-b border-line/70 px-6 py-4">
                <h2 className="text-[19px] leading-tight">Send Passports to {recipients.length} {recipients.length === 1 ? "Person" : "People"}</h2>
                <p className="mt-0.5 text-[12px] text-muted">Each gets their own email and their own passport link, from you.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Going to</p>
                <ul className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
                  {recipients.map((e) => {
                    const r = results?.find((x) => x.email === e.email);
                    return (
                      <li key={e.email} className="flex items-center gap-3 border-b border-line/40 px-4 py-2 last:border-b-0">
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">
                          <span className="font-semibold">{e.name}</span> <span className="text-muted">{e.email}</span>
                        </span>
                        {r ? <span className={`text-[11.5px] font-semibold ${r.ok ? "text-[#56634a]" : "text-accent-dark"}`}>{r.ok ? "✓ Sent" : r.said}</span> : sending ? <span className="text-[11px] text-muted">Waiting…</span> : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The email{recipients[0] ? `, as ${recipients[0].name.split(/\s+/)[0]} will get it` : ""}</p>
                {preview ? (
                  <>
                    <p className="mt-2 text-[12.5px]"><span className="text-muted">Subject:</span> <span className="font-semibold">{preview.subject}</span></p>
                    <iframe title="The passport email" srcDoc={preview.html} sandbox="" className="mt-2 h-[420px] w-full rounded-2xl border border-line/60 bg-white" />
                  </>
                ) : (
                  <p className="mt-2 text-[12px] text-muted">Getting the email ready…</p>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
                <button type="button" disabled={sending} onClick={() => setReviewing(false)} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50">
                  Back
                </button>
                <PressButton
                  onClick={() => void sendAll()}
                  disabled={sending || !preview}
                  className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${!sending && preview ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
                >
                  {sending ? `Sending ${results?.length ?? 0} of ${recipients.length}…` : `Send to ${recipients.length}`}
                </PressButton>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Turning it on: what happens, and the reminder as a tenant will get it. */}
      {autoAsk && look === "new" && (
        <AutoPassportStage
          home={home}
          reminder={reminder}
          note={autoNote}
          busy={autoBusy}
          onBack={closeAutoAsk}
          onToMe={() => void reminderToMe()}
          onTurnOn={() => void turnAuto(true)}
        />
      )}
      {autoAsk && look !== "new" &&
        createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" data-steve-never>
            <button aria-label="Close" onClick={() => !autoBusy && setAutoAsk(false)} className="absolute inset-0 cursor-default bg-ink/45" />
            <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
              <div className="shrink-0 border-b border-line/70 px-6 py-4">
                <h2 className="text-[19px] leading-tight">Automate Passport</h2>
                <p className="mt-0.5 text-[12px] text-muted">For this home only. Turn it off here any time.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <ul className="space-y-2 text-[12.5px] leading-relaxed">
                  <li className="flex gap-2.5">
                    <DoodleIcon name="user" size={14} className="mt-0.5 shrink-0 text-accent-dark" />
                    <span>Every <strong>new</strong> enquiry from now on gets the passport within five minutes, from you. The same email as Send passports. Nobody who has already enquired is sent one.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <DoodleIcon name="clock" size={14} className="mt-0.5 shrink-0 text-accent-dark" />
                    <span>If they haven&apos;t finished it a day later, <strong>one</strong> reminder goes, also from you. If they finish first, it doesn&apos;t.</span>
                  </li>
                </ul>
                <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The reminder</p>
                {reminder ? (
                  <>
                    <p className="mt-2 text-[12.5px]"><span className="text-muted">Subject:</span> <span className="font-semibold">{reminder.subject}</span></p>
                    <iframe title="The passport reminder" srcDoc={reminder.html} sandbox="" className="mt-2 h-[380px] w-full rounded-2xl border border-line/60 bg-white" />
                  </>
                ) : (
                  <p className="mt-2 text-[12px] text-muted">Getting the email ready…</p>
                )}
                {autoNote && <p className="mt-3 text-[12px] text-accent-dark">{autoNote}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
                <button type="button" disabled={autoBusy} onClick={() => setAutoAsk(false)} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50">
                  Back
                </button>
                <span className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={autoBusy} onClick={() => void reminderToMe()} className="text-[12.5px] font-semibold text-accent-dark hover:underline disabled:opacity-50">
                    Send the reminder to me
                  </button>
                  <PressButton
                    onClick={() => void turnAuto(true)}
                    disabled={autoBusy}
                    className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${!autoBusy ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
                  >
                    {autoBusy ? "One moment…" : "Turn on"}
                  </PressButton>
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}

      {notifying && listingId != null && (
        <NotifyEnquiries listingId={String(listingId)} propertyId={propertyId} address={home ?? "This home"} onClose={() => setNotifying(false)} />
      )}

      <PassportAnswers email={viewing?.email ?? null} name={viewing?.name} home={home} onClose={() => setViewing(null)} />

      {/* Over the listing's own panels (z-130), in a layer of its own - and
          UNDER every pop-up the lead's file opens (z-140 and up: WhatsApp,
          the passport answers, the viewing booker). Those are portalled to
          the page, so at z-160 this layer hid them: WhatsApp and Passport
          "did nothing", the sheet sat behind the file and went when it
          closed (Sean McMahon, Dan Richards, 21-22 Oct 2026). */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="relative z-[135]">
            <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} onStep={stepEnquirer} />
          </div>,
          document.body
        )}
    </>
  );

  /* ── THE NEW LOOK (lib/new-look, 23 Oct 2026) ───────────────────────────
     The same list, read and sent the same way, drawn as rows on hairlines:
     a list bar with the passport counts, the automatic switch and one send
     button; a tick on every row that can still be sent one. Ticking turns
     "Send all unsent" into "Send N passports"; both go through the same
     review-before-send pop-up as the old look. */
  if (look === "new") {
    const keyOf = (e: Enquiry) => e.email.trim().toLowerCase();
    const picked = recipients.length;
    const summary =
      statuses === null
        ? null
        : [
            counts.done && `${counts.done} passport${counts.done === 1 ? "" : "s"} done`,
            counts.started && `${counts.started} filling in`,
            counts.sent && `${counts.sent} sent`,
            counts.none && `${counts.none} not sent`,
          ]
            .filter(Boolean)
            .join(" · ");
    const sendUnsent = () => {
      if (!notSent.length) return;
      setResults(null);
      setChosen(new Set(notSent.map(keyOf)));
      void openReview(notSent[0]);
    };
    const sendPicked = () => {
      if (!picked) return;
      setResults(null);
      void openReview(recipients[0]);
    };

    return (
      <section className="nl-enq" data-steve="listing.enquiries">
        <div className="nl-enq-bar">
          <span className="nl-enq-sum nl-meta">
            {people.length === 0 ? null : statuses === null ? (
              <>
                <span className="nl-enq-spin" aria-hidden />
                Checking their passports…
              </>
            ) : (
              <span>
                {summary}
                {enquiries.length > people.length && ` · ${enquiries.length} enquiries from ${people.length} people`}
              </span>
            )}
          </span>
          <span className="nl-enq-acts">
            {auto && (
              <button
                type="button"
                role="switch"
                aria-checked={auto.on}
                disabled={autoBusy}
                onClick={() => (auto.on ? void turnAuto(false) : void askAuto())}
                title={auto.on ? "Every new enquiry gets the passport automatically. Press to stop." : "Send every new enquiry the passport automatically"}
                className="nl-enq-switch"
                data-steve="listing.enquiries.auto"
              >
                <span className={`nl-enq-track${auto.on ? " is-on" : ""}`} aria-hidden>
                  <i />
                </span>
                Send passports automatically
              </button>
            )}
            {letDone && listingId != null && /^\d+$/.test(String(listingId)) && (
              <button type="button" onClick={() => setNotifying(true)} className="nl-btn nl-btn--secondary nl-btn--sm" data-steve="listing.enquiries.notify">
                <Ico name="mail" size={14} />
                Notify enquiries
              </button>
            )}
            {picked > 0 && (
              <button type="button" onClick={() => setChosen(new Set())} className="nl-btn nl-btn--quiet nl-btn--sm">
                Clear
              </button>
            )}
            {people.length > 0 &&
              (picked > 0 ? (
                <button type="button" onClick={sendPicked} className="nl-btn nl-btn--primary nl-btn--sm">
                  Send {picked} passport{picked === 1 ? "" : "s"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sendUnsent}
                  disabled={statuses === null || !notSent.length}
                  title={statuses !== null && !notSent.length ? "Everyone with an email has been sent one" : undefined}
                  className="nl-btn nl-btn--secondary nl-btn--sm"
                >
                  Send all unsent
                </button>
              ))}
          </span>
        </div>

        {auto?.on && (
          <p className="nl-enq-note">
            New enquiries get the passport automatically{auto.mine ? ", from you" : auto.by ? `, from ${auto.by}` : ""}
            {auto.since ? `, since ${short(auto.since)}` : ""}. One friendly reminder a day later if it isn&apos;t finished.
          </p>
        )}
        {autoNote && !autoAsk && <p className="nl-enq-note is-warn">{autoNote}</p>}

        {results && (
          <div className="nl-enq-results" role="status">
            <p className="nl-strong">
              {sentCount} passport{sentCount === 1 ? "" : "s"} sent{results.length > sentCount ? `, ${results.length - sentCount} didn't go` : ""}.
            </p>
            {results.filter((r) => !r.ok).map((r) => (
              <p key={r.email} className="nl-enq-results-bad">
                {r.name}: {r.said}
              </p>
            ))}
          </div>
        )}

        {people.length ? (
          <ul className="nl-enq-rows">
            {people.map((e) => {
              const k = keyOf(e);
              const can = sendable(e);
              const on = can && chosen.has(k);
              const s = statusOf(e);
              const src = sourceLabel(e.source);
              const openAnswers = () => setViewing({ email: e.email.trim(), name: e.name });
              return (
                <li key={e.id} className={`nl-enq-row${on ? " is-picked" : ""}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Send ${e.name} a passport`}
                    disabled={!can}
                    title={can ? undefined : !emailOk(e.email) ? "No email to send it to" : "Already sent one"}
                    onClick={() => toggle(k)}
                    className={`nl-enq-check${on ? " is-on" : ""}`}
                  >
                    {on && <Ico name="check" size={12} />}
                  </button>
                  <a
                    href={`/leads?open=${encodeURIComponent(e.id)}`}
                    onClick={(ev) => {
                      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
                      ev.preventDefault();
                      void openEnquirer(e);
                    }}
                    aria-busy={opening === e.id}
                    title={[e.phone, e.email].filter(Boolean).join(" · ") || "No contact details"}
                    className="nl-enq-main"
                  >
                    <span className="nl-enq-name nl-strong">
                      <span className="nl-enq-name-text">{e.name}</span>
                      {opening === e.id && <span className="nl-enq-spin" aria-hidden />}
                    </span>
                    <span className="nl-enq-msg nl-meta">{e.message || "No message"}</span>
                  </a>
                  {src && <span className="nl-enq-src">{src}</span>}
                  <span className="nl-enq-age nl-mono">{ageOf(e)}</span>
                  <span className="nl-enq-status">
                    {!emailOk(e.email) ? (
                      <Badge tone="neutral" bare>No email</Badge>
                    ) : statuses === null ? (
                      <span className="nl-enq-spin" aria-label="Checking the passport" />
                    ) : !s || s.state === "none" ? (
                      <Badge tone="neutral" bare>Not sent</Badge>
                    ) : s.state === "sent" ? (
                      <Badge tone="info" bare title={`${autoSent.has(k) ? "Sent automatically" : "Sent"}${s.invitedAt ? ` ${short(s.invitedAt)}` : ""}`}>
                        {autoSent.has(k) ? "Auto sent" : "Passport sent"}
                      </Badge>
                    ) : (
                      <button type="button" onClick={openAnswers} className="nl-enq-statusbtn" title={s.state === "done" ? "Open their answers" : "Open what they have filled in so far"}>
                        <Badge tone={s.state === "done" ? "good" : "warning"} bare>
                          {s.state === "done" ? "Passport done" : "Filling in"}
                        </Badge>
                      </button>
                    )}
                  </span>
                  {onBookViewing && (
                    <button type="button" onClick={() => onBookViewing(e)} className="nl-enq-book nl-btn nl-btn--quiet nl-btn--sm">
                      Book viewing
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="nl-empty">No enquiries on this listing yet.</p>
        )}

        {overlays}
      </section>
    );
  }

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5" data-steve="listing.enquiries">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="hand flex items-center gap-2.5 text-[15px]">
          <DoodleIcon name="target" size={15} className="text-accent-dark" />
          Enquiries · {people.length}
          {enquiries.length > people.length && <span className="text-[11.5px] font-normal text-muted">({enquiries.length} enquiries from {people.length} people)</span>}
        </h3>
        <span className="flex flex-wrap items-center gap-3">
        {auto && (
          <button
            type="button"
            role="switch"
            aria-checked={auto.on}
            disabled={autoBusy}
            onClick={() => (auto.on ? void turnAuto(false) : void askAuto())}
            title={auto.on ? "Every new enquiry gets the passport automatically. Press to stop." : "Send every new enquiry the passport automatically"}
            className="flex items-center gap-2 rounded-full px-1 py-1 text-[11.5px] font-semibold"
            data-steve="listing.enquiries.auto"
          >
            <span className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors ${auto.on ? "bg-accent-dark" : "bg-line"}`}>
              <span className={`absolute left-0 top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform ${auto.on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
            Automate passport
          </button>
        )}
        {letDone && listingId != null && /^\d+$/.test(String(listingId)) && !picking && (
          <PressButton
            onClick={() => setNotifying(true)}
            className="press-ring flex items-center gap-2 rounded-full border border-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-accent-dark hover:bg-accent-soft"
            data-steve="listing.enquiries.notify"
          >
            <DoodleIcon name="mail" size={13} />
            Notify Enquiries
          </PressButton>
        )}
        {people.length > 0 &&
          (picking ? (
            <button type="button" onClick={() => setPicking(false)} className="rounded-full px-3 py-2 text-[11.5px] font-semibold text-muted hover:text-ink">
              Cancel
            </button>
          ) : (
            <PressButton
              onClick={startPicking}
              className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-white"
            >
              <DoodleIcon name="user" size={13} />
              Send passports
            </PressButton>
          ))}
        </span>
      </div>

      {auto?.on && (
        <p className="mb-2 flex items-center gap-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-[11.5px] text-ink">
          <DoodleIcon name="user" size={12} className="shrink-0 text-accent-dark" />
          <span>
            New enquiries get the passport automatically{auto.mine ? ", from you" : auto.by ? `, from ${auto.by}` : ""}
            {auto.since ? `, since ${short(auto.since)}` : ""}. One friendly reminder a day later if it isn&apos;t finished.
          </span>
        </p>
      )}
      {autoNote && !autoAsk && <p className="mb-2 text-[11.5px] text-accent-dark">{autoNote}</p>}

      {/* Where the passports are, at a glance. */}
      {people.length > 0 && (
        <p className="mb-2 text-[11.5px] text-muted">
          {statuses === null
            ? "Checking their passports…"
            : [
                counts.done && `${counts.done} done`,
                counts.started && `${counts.started} filling in`,
                counts.sent && `${counts.sent} sent`,
                counts.none && `${counts.none} not sent`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      )}

      {results && (
        <div className="mb-3 rounded-2xl border border-line/60 bg-page px-4 py-3 text-[12px] leading-relaxed">
          <p className="font-semibold">
            {sentCount} passport{sentCount === 1 ? "" : "s"} sent{results.length > sentCount ? `, ${results.length - sentCount} didn't go` : ""}.
          </p>
          {results.filter((r) => !r.ok).map((r) => (
            <p key={r.email} className="text-accent-dark">
              {r.name}: {r.said}
            </p>
          ))}
        </div>
      )}

      {people.length ? (
        <ul className="divide-y divide-line/40">
          {people.map((e) => {
            const k = e.email.trim().toLowerCase();
            const can = sendable(e);
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                {picking && (
                  <input
                    type="checkbox"
                    aria-label={`Send ${e.name} a passport`}
                    checked={chosen.has(k)}
                    disabled={!can}
                    onChange={() => toggle(k)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent-dark)] disabled:opacity-30"
                  />
                )}
                <a
                  href={`/leads?open=${encodeURIComponent(e.id)}`}
                  onClick={(ev) => {
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
                    ev.preventDefault();
                    void openEnquirer(e);
                  }}
                  aria-busy={opening === e.id}
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 transition-colors hover:bg-page sm:grid-cols-[minmax(0,1.2fr)_96px_minmax(0,1fr)_80px]">
                  <span className="min-w-0">
                    <span className="hand flex items-center gap-1.5 truncate text-[13px]">
                      {e.name}
                      {opening === e.id && <span aria-hidden className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />}
                    </span>
                    <span className="block truncate text-[10.5px] text-muted">{[e.phone, e.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                  </span>
                  <span className="hidden sm:block"><Tag tone="neutral">{e.source}</Tag></span>
                  <span className="hidden min-w-0 truncate text-[11px] text-muted sm:block">{e.message || "-"}</span>
                  <span className="text-right text-[11px] text-muted">{e.received}</span>
                </a>
                <span className="shrink-0">
                  {!emailOk(e.email) ? (
                    <Tag tone="neutral">No email</Tag>
                  ) : statuses === null ? (
                    <span className="text-[11px] text-muted">…</span>
                  ) : (
                    <StatusPill s={statusOf(e)} auto={autoSent.has(k)} onOpen={() => setViewing({ email: e.email.trim(), name: e.name })} />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-[12px] text-muted">No enquiries on this listing yet.</p>
      )}

      {/* The pick, held at the foot while they tick. */}
      {picking && (
        <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line/60 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)]">
          <span className="min-w-0 flex-1 text-[12.5px]">
            <span className="font-semibold">{recipients.length} picked</span>
            <span className="text-muted"> · only people not sent one yet can be picked</span>
          </span>
          <button type="button" onClick={() => setChosen(new Set(notSent.map((e) => e.email.trim().toLowerCase())))} className="text-[12px] font-semibold text-muted hover:text-ink">
            All not sent ({notSent.length})
          </button>
          <button type="button" onClick={() => setChosen(new Set())} className="text-[12px] font-semibold text-muted hover:text-ink">
            Clear
          </button>
          <PressButton
            onClick={() => recipients.length && void openReview()}
            disabled={!recipients.length}
            className={`press-ring rounded-full px-4 py-2 text-[12.5px] font-semibold ${recipients.length ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
          >
            Review and send ({recipients.length})
          </PressButton>
        </div>
      )}

      {overlays}
    </section>
  );
}
