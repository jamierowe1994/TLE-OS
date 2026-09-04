"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DiaryGrid from "@/components/DiaryGrid";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import type { KeySet } from "@/lib/rex-keys";
import ProcessTimeline from "@/components/ProcessTimeline";
import SendFlow, { type Outgoing } from "@/components/SendFlow";
import { CopyButton, DoneTick, PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import { TENANT_TRACK } from "@/lib/journey";
import { minutesOf, type Appt } from "@/lib/diary";

/**
 * One viewing, at full record width — and the machine that moves an
 * applicant down the spine. Complete it (show / no-show), record what they
 * thought, and when an offer lands, push it to the landlord by email or
 * WhatsApp with a link to everything they need. Every act writes activity.
 */

function dayLabel(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function endTime(a: Appt): string {
  const end = minutesOf(a.start) + a.mins;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export type Outcome = "Booked" | "Confirm" | "Applying" | "Thinking" | "Not for them";

/** Where the completed-viewing dropdown can land. */
const FEEDBACK_OPTIONS = [
  { id: "loved", label: "Loved it — offer expected", outcome: "Applying" as const, spine: 5 },
  { id: "offer", label: "Offer received", outcome: "Applying" as const, spine: 5 },
  { id: "thinking", label: "Thinking about it", outcome: "Thinking" as const, spine: 4 },
  { id: "notforthem", label: "Not for them", outcome: "Not for them" as const, spine: 4 },
];

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
    <section className="rounded-2xl border border-line/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[12.5px] font-semibold">
          <DoodleIcon name={icon} size={15} className="text-accent-dark" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div
        className={`fade-up relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)] ${
          wide ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">{title}</h2>
            <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default function ViewingDrawer({
  appt,
  outcome,
  onClose,
  sentExtra,
  onSend,
}: {
  appt: Appt | null;
  outcome?: Outcome;
  onClose: () => void;
  sentExtra: Set<string>;
  onSend: (apptId: string, label: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const [coupled, setCoupled] = useState(true);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [cancelFlow, setCancelFlow] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [reWeek, setReWeek] = useState(0);
  const [rePick, setRePick] = useState<{ day: number; slot: string } | null>(null);
  const [moved, setMoved] = useState<{ day: number; slot: string } | null>(null);
  /** The completion machine: idle → choose → show-form | noshow-done → done */
  const [completing, setCompleting] = useState<"idle" | "choose" | "show-form" | "done">("idle");
  const [fbChoice, setFbChoice] = useState<string>("");
  const [fbNotes, setFbNotes] = useState("");
  const [localOutcome, setLocalOutcome] = useState<Outcome | "No-show" | null>(null);
  const [noShowTold, setNoShowTold] = useState(false);
  const [pushingOffer, setPushingOffer] = useState(false);
  const [offerPushed, setOfferPushed] = useState(false);
  const [extraActivity, setExtraActivity] = useState<{ when: string; what: string; by: string }[]>([]);
  /* The passport invite: the one email a viewing sends that opens a door
     rather than confirming a time. Sent from here because this is where the
     tenant's email is, and the viewing is what the email talks about. */
  const [invite, setInvite] = useState<{ state: "idle" | "sending" | "sent" | "already" | "failed"; text: string }>({ state: "idle", text: "" });

  useEffect(() => {
    if (!appt) { setShown(false); return; }
    setCoupled(true);
    setNote("");
    setNotes([]);
    setCancelled(false);
    setCancelFlow(false);
    setRescheduling(false);
    setReWeek(0);
    setRePick(null);
    setMoved(null);
    setCompleting("idle");
    setFbChoice("");
    setFbNotes("");
    setLocalOutcome(null);
    setNoShowTold(false);
    setPushingOffer(false);
    setOfferPushed(false);
    setExtraActivity([]);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [appt]);

  useEffect(() => {
    if (!appt) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appt, onClose]);

  /* ── The property behind the viewing. ──
     Live REX appointments carry NO listing link (record_service is null on
     669 of 671 events), so the only join available is the address text.
     Matched conservatively: a wrong property here would show somebody the
     wrong keys. */
  const [match, setMatch] = useState<{ propertyId: string | null; image: string | null; locality: string } | null>(null);
  const [keys, setKeys] = useState<KeySet[] | null>(null);
  /** The address didn't match a listing, so we know nothing about access. */
  const [noMatch, setNoMatch] = useState(false);

  useEffect(() => {
    if (!appt) return;
    let gone = false;
    const target = `${appt.where} ${appt.what}`.toLowerCase();
    fetch("/api/listings")
      .then((r) => r.json())
      .then((j) => {
        if (gone || !j.ok || !Array.isArray(j.listings)) return;
        const hit = j.listings.find((l: { name: string; locality: string }) => {
          const name = l.name.toLowerCase();
          // Require the street line itself, not just a town — "Bristol"
          // matches sixty properties and none of them reliably.
          return name.length > 6 && target.includes(name);
        });
        if (!hit) { setMatch(null); setKeys([]); setNoMatch(true); return; }
        setMatch({ propertyId: hit.propertyId ?? null, image: hit.image ?? null, locality: hit.locality });
        if (hit.propertyId) {
          fetch(`/api/keys?propertyIds=${encodeURIComponent(hit.propertyId)}`)
            .then((r) => r.json())
            .then((k) => { if (!gone && k.ok) setKeys(k.keys[hit.propertyId] ?? []); })
            .catch(() => { if (!gone) setKeys([]); });
        } else setKeys([]);
      })
      .catch(() => { /* no match, no claims */ });
    return () => { gone = true; };
  }, [appt]);

  if (!appt) return null;
  const past = appt.day < 0;
  const property = appt.what.replace(/^[^—]+—\s*/, "");
  const allSent = appt.comms.every((c) => c.done || sentExtra.has(`${appt.id}:${c.label}`));
  const effectiveOutcome = localOutcome ?? outcome ?? null;
  const applying = effectiveOutcome === "Applying";

  const log = (what: string) =>
    setExtraActivity((cur) => [...cur, { when: "Just now", what, by: "You" }]);

  const sendPassportInvite = async (again = false) => {
    if (!appt.contact?.email) return;
    setInvite({ state: "sending", text: "" });
    try {
      const res = await fetch("/api/tenant/passport/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: appt.who,
          email: appt.contact.email,
          address: property,
          whenPretty: `${dayLabel(appt.day)} at ${appt.start}`,
          again,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; alreadySent?: boolean; invitedAt?: string };
      if (!j.ok) throw new Error(j.error ?? "The invite did not send.");
      if (j.alreadySent) {
        const when = j.invitedAt ? new Date(j.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
        setInvite({ state: "already", text: `Sent already${when ? ` on ${when}` : ""}.` });
      } else {
        setInvite({ state: "sent", text: "Passport invite sent." });
        log(`Sent: passport invite to ${appt.contact.email}`);
      }
    } catch (e) {
      setInvite({ state: "failed", text: e instanceof Error ? e.message : "The invite did not send." });
    }
  };

  /* Where this applicant stands on the tenant spine. */
  const spineIndex =
    effectiveOutcome === "Applying" ? 5 : past || effectiveOutcome ? 4 : 3;

  const activity: { when: string; what: string; by: string }[] = [
    { when: dayLabel(appt.day - 2), what: `Viewing booked for ${dayLabel(appt.day)}, ${appt.start}`, by: appt.agent },
    ...appt.comms.filter((c) => c.done).map((c) => ({ when: dayLabel(appt.day - 2), what: `Sent: ${c.label}`, by: "TLE OS" })),
    ...appt.comms
      .filter((c) => !c.done && sentExtra.has(`${appt.id}:${c.label}`))
      .map((c) => ({ when: "Just now", what: `Sent: ${c.label}`, by: "You" })),
    ...(past && outcome ? [{ when: dayLabel(appt.day + 1), what: `Outcome recorded: ${outcome}`, by: appt.agent }] : []),
    ...extraActivity,
  ];

  /* ── The cancellation: everyone who knew it was on hears that it's off. ── */
  const cancelMessages: Outgoing[] = [
    ...(appt.contact
      ? [{
          key: "applicant", role: "Applicant", name: appt.who,
          email: appt.contact.email, phone: appt.contact.phone,
          channel: "email" as const, on: true,
          subject: `Viewing cancelled — ${property}`,
          emailBody: `Hi ${appt.who.split(" ")[0]},\n\nSorry to say we've had to cancel the viewing at ${property} on ${dayLabel(appt.day)} at ${appt.start}. We'll be in touch to rearrange — nothing needed from you.\n\nKind regards,\n${appt.agent}\nThe Letting Experts`,
          whatsappBody: `Hi ${appt.who.split(" ")[0]}, sorry — the ${appt.start} viewing at ${property} on ${dayLabel(appt.day)} is cancelled. We'll be in touch to rearrange.`,
        }]
      : []),
    {
      key: "landlord", role: "Landlord", name: "The landlord",
      email: "landlord@record.tle", phone: "07000 000000",
      channel: "email" as const, on: true,
      subject: `Viewing cancelled at ${property}`,
      emailBody: `The ${appt.start} viewing on ${dayLabel(appt.day)} at ${property} has been cancelled. We'll rebook and keep you posted.\n\n${appt.agent}\nThe Letting Experts`,
      whatsappBody: `The ${appt.start} viewing at ${property} (${dayLabel(appt.day)}) is cancelled — we'll rebook and keep you posted.`,
    },
    ...(appt.tenant
      ? [{
          key: "occupier", role: "Current tenant — stand down", name: appt.tenant,
          email: "tenant@record.tle", phone: "07000 000001",
          channel: "whatsapp" as const, on: true,
          subject: `Viewing cancelled — ${property}`,
          emailBody: `Hi ${appt.tenant.split(" ")[0]},\n\nThe viewing booked for ${dayLabel(appt.day)} at ${appt.start} is cancelled — nobody will be coming, no need to do anything.\n\n${appt.agent}\nThe Letting Experts`,
          whatsappBody: `Hi ${appt.tenant.split(" ")[0]}, the ${appt.start} viewing on ${dayLabel(appt.day)} is cancelled — nobody's coming after all.`,
        }]
      : []),
  ];

  const offerMessages: Outgoing[] = [
    {
      key: "landlord", role: "Landlord — the offer", name: "The landlord",
      email: "landlord@record.tle", phone: "07000 000000",
      channel: "email" as const, on: true,
      subject: `An offer on ${property}`,
      emailBody: `An offer has come in on ${property} from ${appt.who}.\n\nEverything you need — the offer, their situation and references — is on your page:\nhttps://tle-os.co.uk/review/${appt.id} \n\nHave a look and reply here, or ring and we'll talk it through.\n\n${appt.agent}\nThe Letting Experts`,
      whatsappBody: `Good news — an offer on ${property} from ${appt.who}. Everything's here: https://tle-os.co.uk/review/${appt.id} — reply or ring to talk it through.`,
    },
  ];

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {cancelled ? "Viewing — cancelled" : past ? "Viewing — happened" : "Viewing — booked"}
            </p>
            <h2 className="mt-1 text-[20px] leading-tight">
              {moved ? (
                <>
                  {dayLabel(moved.day)}, {moved.slot}
                  <span className="ml-2 align-middle">
                    <Pill tone="accent">Rescheduled</Pill>
                  </span>
                </>
              ) : (
                <>{dayLabel(appt.day)}, {appt.start}–{endTime(appt)}</>
              )}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {property} · {appt.who} · {appt.agent} accompanying
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!past && !cancelled && (
              <>
                <PressButton
                  onClick={() => setRescheduling(true)}
                  className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold"
                >
                  <DoodleIcon name="calendar" size={13} />
                  Reschedule
                </PressButton>
                <PressButton
                  onClick={() => setCancelFlow(true)}
                  className="press-ring rounded-full border border-line/80 px-4 py-2 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  ✕ Cancel viewing
                </PressButton>
              </>
            )}
            {past && completing === "idle" && !localOutcome && (
              <PressButton
                onClick={() => setCompleting("choose")}
                className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2 text-[11.5px] font-semibold text-page"
              >
                <DoodleIcon name="checklist" size={13} />
                Complete the viewing
              </PressButton>
            )}
            {past && (
              <PressButton className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold">
                <DoodleIcon name="clock" size={13} />
                Schedule a review
              </PressButton>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* ══ Same rhythm as the listing drawer: one wide box for what
                 this IS, then the job in hand, then the breakdown. Two
                 record screens shouldn't feel like two products. ══ */}

          {/* 1 ── THE PROPERTY, all the way across. */}
          <div className="rounded-3xl border border-line/80 bg-panel p-6">
            <Card
              title="The property"
              icon="home"
              action={
                appt.tenant ? (
                  <Pill tone="accent">Tenanted</Pill>
                ) : appt.tenant === null ? (
                  <Pill tone="neutral">Vacant</Pill>
                ) : (
                  <Pill tone="neutral">Occupancy not known</Pill>
                )
              }
            >
              <div className="flex gap-3.5">
                <PropertyPhoto src={match?.image ?? null} className="h-20 w-24 shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <p className="hand text-[15px] leading-tight">{property}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{match?.locality ?? appt.where}</p>
                  <p className="mt-1.5 text-[11px] text-muted">
                    <span className="font-semibold">Landlord</span>{" "}
                    {/* REX's rental book carries no landlord name at all
                        (legal_vendor_name is populated on 0% of it), so
                        this says so rather than inventing one. */}
                    <span className="text-muted/70">not recorded in REX</span>
                  </p>
                </div>
              </div>

              {/* ── ACCESS: the three ways in, each stated even when the
                     answer is "we don't know" — an agent standing on a
                     doorstep needs the blank as much as the fact. ── */}
              <div className="mt-3 border-t border-line/50 pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Access</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2.5">
                    <DoodleIcon name="key" size={13} className="mt-px shrink-0 text-accent-dark" />
                    <span className="text-[11.5px] leading-snug">
                      <span className="font-semibold">Keys</span>{" "}
                      {keys === null ? (
                        <span className="text-muted">checking the register…</span>
                      ) : keys.length === 0 ? (
                        <span className="text-muted">
                          {noMatch
                            ? "couldn't match this viewing to a property record, so the key register can't be checked"
                            : "no key set on the register for this property"}
                        </span>
                      ) : (
                        keys.map((k) => (
                          <span key={k.id} className="block text-muted">
                            {k.label}
                            {k.heldBy ? (
                              <span className="text-accent-dark">
                                {" "}— out with {k.heldBy}
                                {k.reason ? ` (${k.reason})` : ""}
                                {k.since ? `, since ${new Date(k.since).toLocaleDateString("en-GB")}` : ""}
                              </span>
                            ) : (
                              <> — on the shelf{k.location ? `, ${k.location}` : ""}</>
                            )}
                          </span>
                        ))
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <DoodleIcon name="user" size={13} className="mt-px shrink-0 text-accent-dark" />
                    <span className="text-[11.5px] leading-snug">
                      <span className="font-semibold">Tenant</span>{" "}
                      {appt.tenant ? (
                        <span className="text-muted">
                          {appt.tenant} in situ — arrange with them, and they must know before anyone walks in.
                        </span>
                      ) : appt.tenant === null ? (
                        <span className="text-muted">vacant — nobody to arrange around</span>
                      ) : (
                        <span className="text-muted">
                          not known whether anyone lives here — check before you travel
                        </span>
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <DoodleIcon name="home" size={13} className="mt-px shrink-0 text-accent-dark" />
                    <span className="text-[11.5px] leading-snug">
                      <span className="font-semibold">Landlord</span>{" "}
                      <span className="text-muted">
                        no access arrangement recorded
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
              {appt.link && (
                <Link
                  href={appt.link.href}
                  className="mt-2 inline-block text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  Open the property record →
                </Link>
              )}
            </Card>
          </div>

          {/* 2 ── THE VIEWING: who's coming, where it stands, what to do. */}
          <div className="mt-5 rounded-3xl border border-line/80 bg-panel p-6">
            <div className="grid gap-4 lg:grid-cols-2">
            {/* ══ LEFT: the facts. ══ */}
            <div className="space-y-4">


              <Card
                title={past ? "Who viewed" : "Who's coming"}
                icon="user"
                action={
                  effectiveOutcome ? (
                    <Pill tone={effectiveOutcome === "Applying" ? "good" : "neutral"}>{effectiveOutcome}</Pill>
                  ) : undefined
                }
              >
                <p className="hand text-[15px]">{appt.who}</p>
                {appt.contact && (
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center gap-2 text-[11.5px] text-muted">
                      <DoodleIcon name="call" size={13} /> {appt.contact.phone}
                    </p>
                    <p className="flex items-center gap-2 truncate text-[11.5px] text-muted">
                      <DoodleIcon name="mail" size={13} /> {appt.contact.email}
                    </p>
                  </div>
                )}
                {appt.contact?.email && !past && !cancelled && (
                  <div className="mt-3">
                    <PressButton
                      onClick={() => void sendPassportInvite(invite.state === "already")}
                      className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-50"
                    >
                      <DoodleIcon name="mail" size={13} />
                      {invite.state === "sending"
                        ? "Sending…"
                        : invite.state === "already"
                          ? "Send the passport invite again"
                          : "Invite to the passport"}
                    </PressButton>
                    {invite.text && (
                      <p className={`mt-1.5 text-[11px] ${invite.state === "failed" ? "text-red-600" : "text-muted"}`}>
                        {invite.text}
                      </p>
                    )}
                  </div>
                )}
              </Card>

              <Card
                title="Confirmations"
                icon="mail"
                action={
                  appt.fromRex && !appt.comms.length ? (
                    <Pill tone="neutral">Not known</Pill>
                  ) : allSent ? (
                    <Pill tone="good">All sent</Pill>
                  ) : (
                    <Pill tone="accent">
                      {appt.comms.filter((c) => !c.done && !sentExtra.has(`${appt.id}:${c.label}`)).length} outstanding
                    </Pill>
                  )
                }
              >
                <ul className="space-y-2.5">
                  {appt.comms.map((c) => {
                    const done = c.done || sentExtra.has(`${appt.id}:${c.label}`);
                    return (
                      <li key={c.label} className="flex items-center gap-2.5">
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            done ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className={`min-w-0 flex-1 text-[12.5px] ${done ? "" : "text-muted"}`}>{c.label}</span>
                        {done ? (
                          <span className="shrink-0 text-[10px] text-muted">{c.done ? "sent" : "sent just now"}</span>
                        ) : past ? (
                          <span className="shrink-0 text-[10px] font-semibold text-accent-dark">NEVER SENT</span>
                        ) : (
                          <PressButton
                            onClick={() => onSend(appt.id, c.label)}
                            className="press-ring shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[10.5px] font-semibold text-page"
                          >
                            Send it now
                          </PressButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card title="Notes" icon="note">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && note.trim()) {
                      setNotes((cur) => [note.trim(), ...cur]);
                      log(`Note: ${note.trim()}`);
                      setNote("");
                    }
                  }}
                  placeholder="Anything worth remembering — press Enter to keep it"
                  className="w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12px] outline-none transition-colors focus:border-ink"
                />
                {notes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {notes.map((n, i) => (
                      <li key={i} className="rounded-xl bg-accent-soft/30 px-3 py-2 text-[12px] leading-relaxed">{n}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* ══ RIGHT: the spine, the machine, the log. ══ */}
            <div className="space-y-4">
              {/* Where this applicant IS. The viewing is one stop on their
                  journey — the spine says which, and feedback moves it. */}
              <Card title="Where they are" icon="trend-up">
                <ProcessTimeline steps={TENANT_TRACK} current={spineIndex} onPick={() => {}} />
                <p className="mt-3 border-t border-line/50 pt-2.5 text-[10.5px] leading-relaxed text-muted">
                  {spineIndex >= 5
                    ? "Feedback moved them to Application — the offer is the next piece of paper."
                    : past
                      ? "The viewing happened — recording feedback is what moves them forward."
                      : "Booked and waiting. The spine moves when the viewing completes."}
                </p>
              </Card>

              {/* ── The completion machine. ── */}
              {past && completing === "choose" && (
                <Card title="Complete the viewing" icon="checklist">
                  <p className="mb-3 text-[12px] text-muted">First things first — did they turn up?</p>
                  <div className="flex gap-2.5">
                    <PressButton
                      onClick={() => setCompleting("show-form")}
                      className="press-ring flex-1 rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-page"
                    >
                      ✓ They showed
                    </PressButton>
                    <PressButton
                      onClick={() => {
                        setLocalOutcome("No-show");
                        setCompleting("done");
                        log("Marked as NO-SHOW");
                      }}
                      className="press-ring flex-1 rounded-full border border-ink/25 px-4 py-2.5 text-[12.5px] font-semibold"
                    >
                      No-show
                    </PressButton>
                  </div>
                </Card>
              )}

              {past && completing === "show-form" && (
                <Card title="How did it land?" icon="message">
                  <div className="space-y-1.5">
                    {FEEDBACK_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setFbChoice(o.id)}
                        className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[12.5px] transition-colors ${
                          fbChoice === o.id ? "border-accent-dark bg-accent-soft/40" : "border-line/60 hover:border-ink/30"
                        }`}
                      >
                        <span
                          className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[8px] ${
                            fbChoice === o.id ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                          }`}
                        >
                          {fbChoice === o.id && "✓"}
                        </span>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={fbNotes}
                    onChange={(e) => setFbNotes(e.target.value)}
                    rows={2}
                    placeholder="What they actually said — this goes to the landlord…"
                    className="mt-3 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12px] leading-relaxed outline-none transition-colors focus:border-ink"
                  />
                  <PressButton
                    onClick={() => {
                      const opt = FEEDBACK_OPTIONS.find((o) => o.id === fbChoice);
                      if (!opt) return;
                      setLocalOutcome(opt.outcome);
                      setCompleting("done");
                      log(`Feedback recorded: ${opt.label}${fbNotes.trim() ? ` — "${fbNotes.trim()}"` : ""}`);
                      if (opt.outcome === "Applying") log(`${appt.who} moved to Application on the spine`);
                    }}
                    className={`press-ring mt-3 w-full rounded-full px-4 py-2.5 text-[12.5px] font-semibold ${
                      fbChoice ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                    }`}
                  >
                    Save feedback
                  </PressButton>
                </Card>
              )}

              {past && localOutcome === "No-show" && (
                <Card title="No-show" icon="bell" action={<Pill tone="accent">No-show</Pill>}>
                  <p className="text-[12px] leading-relaxed text-muted">
                    They didn&apos;t turn up. The landlord should hear it from us before they
                    hear silence.
                  </p>
                  {noShowTold ? (
                    <p className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-accent-dark">
                      <DoneTick size={20} /> Landlord told — logged on the record
                    </p>
                  ) : (
                    <PressButton
                      onClick={() => {
                        setNoShowTold(true);
                        log("No-show email sent to the landlord");
                      }}
                      className="press-ring mt-3 flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2.5 text-[12px] font-semibold text-page"
                    >
                      <DoodleIcon name="mail" size={13} />
                      Email the landlord — no-show
                    </PressButton>
                  )}
                </Card>
              )}

              {/* An offer in play → the push. */}
              {applying && (
                <Card
                  title="The offer"
                  icon="coin"
                  action={offerPushed ? <Pill tone="good">With the landlord</Pill> : <Pill tone="accent">Ready to push</Pill>}
                >
                  <p className="text-[12px] leading-relaxed text-muted">
                    {appt.who} is offering. The landlord gets a link with everything —
                    the money, the situation, the references — by email or WhatsApp.
                  </p>
                  {!offerPushed && (
                    <PressButton
                      onClick={() => setPushingOffer(true)}
                      className="press-ring mt-3 flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2.5 text-[12px] font-semibold text-page"
                    >
                      <DoodleIcon name="rocket" size={13} />
                      Push the offer to the landlord
                    </PressButton>
                  )}
                </Card>
              )}

              {applying && (
                <Card
                  title="Paired records"
                  icon="link"
                  action={coupled ? <Pill tone="good">Coupled</Pill> : <Pill tone="accent">Uncoupled</Pill>}
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 rounded-xl border border-line/70 p-2.5 text-center">
                      <span className="hand block truncate text-[12.5px]">{appt.who}</span>
                      <span className="block text-[9.5px] text-muted">applicant</span>
                    </span>
                    <DoodleIcon name="link" size={18} className={coupled ? "shrink-0 text-accent-dark" : "shrink-0 text-muted opacity-40"} />
                    <span className="min-w-0 flex-1 rounded-xl border border-line/70 p-2.5 text-center">
                      <span className="hand block truncate text-[12.5px]">{property}</span>
                      <span className="block text-[9.5px] text-muted">property</span>
                    </span>
                  </div>
                  {coupled && (
                    <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                      <DoodleIcon name="file-contract" size={12} className="text-accent-dark" />
                      References: 2 of 3 back — employer&apos;s outstanding
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCoupled((c) => !c);
                      log(coupled ? "Records uncoupled — application fell through" : "Records re-coupled");
                    }}
                    className="mt-3 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    {coupled ? "Uncouple — it fell through" : "Re-couple the records"}
                  </button>
                </Card>
              )}

              <Card title="Activity" icon="list">
                <ul className="space-y-2.5">
                  {activity.map((a, i) => (
                    <li key={i} className="flex items-baseline gap-2.5 text-[12px]">
                      <span className="w-[74px] shrink-0 text-[10px] text-muted">{a.when}</span>
                      <span className="min-w-0 flex-1">{a.what}</span>
                      <span className="shrink-0 text-[10px] text-muted">{a.by}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Reschedule: the same diary, pick the new slot. ── */}
      {rescheduling && (
        <Modal
          title="Reschedule the viewing"
          subtitle={`${property} · currently ${dayLabel(appt.day)} at ${appt.start}`}
          onClose={() => setRescheduling(false)}
          wide
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReWeek((w) => Math.max(0, w - 1))}
                disabled={reWeek === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setReWeek((w) => w + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
              >
                ›
              </button>
            </div>
            <p className="hand text-[16px]">{reWeek === 0 ? "This week" : reWeek === 1 ? "Next week" : `${reWeek} weeks out`}</p>
            <span className="w-16" />
          </div>
          <div className="max-h-[44vh] overflow-auto rounded-xl border border-line/60">
            <DiaryGrid
              week={reWeek}
              hourPx={44}
              pick={rePick}
              onPick={(d, s) => setRePick({ day: d, slot: s })}
              pickLabel="Moved here"
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-muted">
              {rePick ? `${dayLabel(rePick.day)} at ${rePick.slot}` : "Click an empty half-hour"}
            </p>
            <PressButton
              onClick={() => {
                if (!rePick) return;
                setMoved(rePick);
                setRescheduling(false);
                log(`Rescheduled to ${dayLabel(rePick.day)}, ${rePick.slot} — confirmations will re-send`);
              }}
              className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                rePick ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
              }`}
            >
              Move it
            </PressButton>
          </div>
        </Modal>
      )}

      {/* ── Cancel: everyone hears it's off, their way. ── */}
      {cancelFlow && (
        <Modal
          title="Cancel the viewing"
          subtitle="Everyone who knew it was on hears that it's off — email or WhatsApp, each their own"
          onClose={() => setCancelFlow(false)}
        >
          <SendFlow
            messages={cancelMessages}
            sendLabel="Cancel & tell them"
            onSend={(sent) => {
              setCancelled(true);
              setCancelFlow(false);
              log(`Viewing cancelled — ${sent.length} message${sent.length === 1 ? "" : "s"} sent`);
            }}
          />
        </Modal>
      )}

      {/* ── The offer, pushed to the landlord. ── */}
      {pushingOffer && (
        <Modal
          title="Push the offer to the landlord"
          subtitle={`${appt.who}'s offer on ${property}`}
          onClose={() => setPushingOffer(false)}
        >
          <div className="mb-4 rounded-2xl border border-line/70 p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              What the landlord's link shows
            </p>
            <ul className="mt-2 space-y-1.5 text-[12px]">
              <li className="flex items-center gap-2"><DoodleIcon name="coin" size={12} className="text-accent-dark" /> The offer, in numbers</li>
              <li className="flex items-center gap-2"><DoodleIcon name="user" size={12} className="text-accent-dark" /> Situation — job, income band, pets</li>
              <li className="flex items-center gap-2"><DoodleIcon name="file-contract" size={12} className="text-accent-dark" /> References, as they come back</li>
            </ul>
            <div className="mt-3 border-t border-line/50 pt-2.5">
              <CopyButton value={`https://tle-os.co.uk/review/${appt.id} (wireframe)`} label="Copy the link" />
            </div>
          </div>
          <SendFlow
            messages={offerMessages}
            sendLabel="Send the offer"
            onSend={() => {
              setOfferPushed(true);
              setPushingOffer(false);
              log(`Offer pushed to the landlord — link sent`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
