"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DetailRow, DoneTick, PressButton } from "@/components/Bits";
import EmailProperties from "@/components/EmailProperties";
import ProcessTimeline from "@/components/ProcessTimeline";
import SignaturePanel, { type Signer } from "@/components/SignaturePanel";
import ViewingBooker from "@/components/ViewingBooker";
import { Pill } from "@/components/Wire";
import { leadSide } from "@/lib/leads-sample";
import {
  DOC_TAGS,
  leadDetail,
  STAGE_TONE,
  type Doc,
  type DocTag,
  type Lead,
  type LeadViewing,
  type Note,
  type Task,
} from "@/lib/leads-sample";
import { isStalled, startingStep, trackFor } from "@/lib/journey";
import rexSample from "@/lib/rex-sample.json";

/**
 * The lead record, as a sheet that slides in from the right over a scrim.
 *
 * Six tabs, because a lead is six different questions depending on who's
 * asking: what do they want (Overview), what's been said (Activity), have we
 * shown them anything (Viewings), what do I owe them (Tasks), what are they
 * looking at (Properties), and what have they sent us (Documents).
 */

type TabKey = "overview" | "activity" | "viewings" | "tasks" | "properties" | "documents";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "viewings", label: "Viewings" },
  { key: "tasks", label: "Tasks" },
  { key: "properties", label: "Properties" },
  { key: "documents", label: "Documents" },
];

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};
const LISTINGS = rexSample.listings as Listing[];

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

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-6 text-center text-[12px] text-muted">{children}</p>
);

export default function LeadDrawer({
  lead,
  onClose,
  onStep,
}: {
  lead: Lead | null;
  onClose: () => void;
  /** −1 / +1 through the list, so you can work a queue without going back. */
  onStep: (delta: number) => void;
}) {
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  // Editable state, seeded per lead — the wireframe should feel like software,
  // not a picture of software.
  const detail = useMemo(() => (lead ? leadDetail(lead) : null), [lead]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [contact, setContact] = useState({ phone: "", email: "", area: "" });
  // Properties attached in-session, plus the tick that confirms one landed.
  const [added, setAdded] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  const [emailing, setEmailing] = useState(false);
  // Where they are on their track, and the two panels a step can open.
  const [step, setStep] = useState(0);
  const [booking, setBooking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [booked, setBooked] = useState<LeadViewing[]>([]);

  useEffect(() => {
    if (!detail) return;
    setTasks(detail.tasks);
    setNotes(detail.notes);
    setDocs(detail.docs);
    setTags(detail.tags);
    setTab("overview");
    setDraft("");
    setAdded([]);
    setJustAdded(false);
    setBooked([]);
  }, [detail]);

  useEffect(() => {
    if (lead) setStep(startingStep(lead));
  }, [lead]);

  useEffect(() => {
    if (!lead) return;
    setContact({ phone: lead.phone, email: lead.email, area: lead.preferred });
  }, [lead]);

  // Mount, then flip to shown on the next frame — a transform that starts and
  // ends in the same paint doesn't animate.
  useEffect(() => {
    if (!lead) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [lead]);

  // Escape closes; arrows step. A record you can only leave with the mouse is
  // a record nobody works through quickly.
  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lead, onClose, onStep]);

  if (!lead || !detail) return null;

  const initials = lead.name.split(" ").map((n) => n[0]).join("");
  const isTenant = leadSide(lead) === "tenant";
  const shortlist = LISTINGS.filter(
    (l) => detail.interested.includes(l.id) || added.includes(l.id)
  );

  const track = trackFor(lead);
  const stalled = isStalled(lead);
  const here = track[Math.min(step, track.length - 1)];
  const finished = step >= track.length - 1;

  /** Advance one step, if there's anywhere to go. */
  const advance = () => setStep((s) => Math.min(s + 1, track.length - 1));

  /** What the Next-action button does — the step decides, not the button. */
  function fire() {
    if (here.action === "viewing") setBooking(true);
    else if (here.action === "sign") setSigning(true);
    else if (here.action === "send") setEmailing(true);
    else advance();
  }

  const viewings = [...booked, ...detail.viewings];

  const signDoc = isTenant ? "Assured shorthold tenancy agreement" : "Terms of business";
  const signMerges = isTenant
    ? [
        { label: "Property", value: shortlist[0]?.name ?? "Not chosen yet" },
        { label: "Rent", value: shortlist[0] ? `£${shortlist[0].rent?.toLocaleString("en-GB")} pcm` : "—" },
        { label: "Term", value: "12 months, 6-month break" },
        { label: "Start date", value: lead.moveDate },
        { label: "Deposit", value: "5 weeks' rent, protected in TDS" },
      ]
    : [
        { label: "Landlord", value: lead.name },
        { label: "Property", value: lead.preferred },
        { label: "Service", value: "Fully managed" },
        { label: "Management fee", value: "10% of rent collected + VAT" },
        { label: "Set-up fee", value: "£300 + VAT" },
      ];
  const signers: Signer[] = isTenant
    ? [
        { id: "sg1", name: lead.name, email: contact.email || lead.email, role: "Tenant" },
        { id: "sg2", name: "", email: "", role: "Guarantor" },
      ]
    : [{ id: "sg1", name: lead.name, email: contact.email || lead.email, role: "Landlord" }];

  function addNote() {
    if (!draft.trim()) return;
    setNotes((n) => [
      { id: `n${Date.now()}`, author: "You", when: "Just now", text: draft.trim() },
      ...n,
    ]);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-[120]">
      {/* The scrim — clicking anywhere on it closes, as asked. */}
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* ── Sheet chrome ── */}
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
              className="flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              className="flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Next →
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
              title="More"
            >
              ⋯
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
          {/* ── Identity ── */}
          <div className="relative rounded-3xl border border-line/80 bg-panel p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[16px] font-bold text-accent-dark">
                {initials}
              </span>
              <div className="min-w-0">
                <h2 className="text-[26px] leading-tight">{lead.name}</h2>
                <div className="mt-2">
                  <Pill tone={STAGE_TONE[lead.stage]}>{lead.stage}</Pill>
                </div>

                {/* Click a value to change it — a rule appears underneath and
                    it commits on blur or Enter. No Save button per field, and
                    no edit mode for the whole record: changing a mobile number
                    shouldn't feel like filling in a form. Copy sits on hover. */}
                <div className="mt-5 max-w-sm divide-y divide-line/50">
                  <DetailRow
                    icon="call"
                    label="mobile"
                    value={contact.phone}
                    copyable
                    onChange={(v) => setContact((c) => ({ ...c, phone: v }))}
                  />
                  <DetailRow
                    icon="mail"
                    label="email"
                    value={contact.email}
                    copyable
                    onChange={(v) => setContact((c) => ({ ...c, email: v }))}
                  />
                  <DetailRow
                    icon="home"
                    label="area"
                    value={contact.area}
                    onChange={(v) => setContact((c) => ({ ...c, area: v }))}
                  />
                  <DetailRow
                    icon="target"
                    label="source"
                    value={`${lead.source} · ${lead.received}`}
                  />
                </div>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/notioly/home-caring.svg"
                alt=""
                aria-hidden
                className="art ml-auto hidden h-36 shrink-0 lg:block"
              />
            </div>

            {/* Where they are in the process, directly under the contact
                details — "who is this" and "where are we up to" is one
                question, and it shouldn't need a tab. */}
            <div className="mt-6 border-t border-line/60 pt-5">
              <ProcessTimeline
                steps={track}
                current={step}
                stalled={stalled}
                onPick={setStep}
              />
            </div>

            {/* Tags — the quick facts, addable. */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                  className="group flex items-center gap-1.5 rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
                  title="Remove tag"
                >
                  {t}
                  <span className="text-muted opacity-0 transition-opacity group-hover:opacity-100">
                    ✕
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const t = window.prompt("New tag");
                  if (t?.trim()) setTags((cur) => [...cur, t.trim()]);
                }}
                className="rounded-full border border-dashed border-line px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
              >
                + Add tag
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line/80">
            {TABS.map((t) => {
              const count =
                t.key === "tasks" ? tasks.filter((x) => !x.done).length
                : t.key === "documents" ? docs.length
                : t.key === "viewings" ? detail.viewings.length + booked.length
                : t.key === "properties" ? shortlist.length
                : 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`hand relative whitespace-nowrap px-4 py-2.5 text-[13.5px] transition-colors ${
                    tab === t.key ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span className="figures ml-1.5 text-[10.5px] text-muted">{count}</span>
                  )}
                  {tab === t.key && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent-dark" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            {/* ══ OVERVIEW ══ */}
            {tab === "overview" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Lead summary" icon="user">
                  <p className="text-[12.5px] leading-relaxed">{detail.summary}</p>
                  <dl className="mt-4 space-y-2 border-t border-line/70 pt-4 text-[12px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Priority</dt>
                      <dd
                        className={
                          detail.priority === "High" ? "font-semibold text-accent-dark" : ""
                        }
                      >
                        {detail.priority}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Assigned to</dt>
                      <dd>{lead.agent}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Desired move date</dt>
                      <dd>{lead.moveDate}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Budget</dt>
                      <dd className="figures">{lead.budget}</dd>
                    </div>
                  </dl>
                </Card>

                {/* The Next action card IS the process. It reads the step the
                    timeline is showing and offers the one thing that moves it
                    — booking a viewing is how you leave the viewing step, so
                    the button books a viewing rather than ticking a box. */}
                <Card title="Next action" icon="target">
                  {stalled ? (
                    <Empty>
                      Not proceeding — {lead.name.split(" ")[0]} stopped at &ldquo;{here.label}
                      &rdquo;. Pick a step above to restart them.
                    </Empty>
                  ) : (
                    <>
                      <p className="text-[13px] font-semibold">{here.title}</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{here.detail}</p>
                      {detail.nextAction && (
                        <p className="mt-3 flex items-center gap-2 text-[11.5px] font-medium text-accent-dark">
                          <DoodleIcon name="clock" size={13} />
                          {detail.nextAction.due}
                        </p>
                      )}

                      <PressButton
                        onClick={fire}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[12.5px] font-semibold text-page"
                      >
                        <DoodleIcon name={here.icon} size={14} />
                        {here.cta}
                      </PressButton>

                      {/* Some steps finish without the system doing anything —
                          a phone call happens on a phone. This is that. */}
                      {here.action !== "none" && !finished && (
                        <button
                          type="button"
                          onClick={advance}
                          className="mt-2.5 w-full text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                        >
                          Already done — move on
                        </button>
                      )}
                      {finished && (
                        <p className="mt-2.5 text-center text-[11px] text-muted">
                          Last step on the {isTenant ? "tenant" : "landlord"} track.
                        </p>
                      )}
                    </>
                  )}
                </Card>

                <Card title="Recent activity" icon="analytics">
                  <ul className="space-y-3">
                    {lead.activity.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <DoodleIcon name={a.icon} size={14} className="mt-0.5 shrink-0 text-accent-dark" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] leading-snug">{a.text}</span>
                          <span className="block text-[10.5px] text-muted">{a.when}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card
                  title="Interested in"
                  icon="home"
                  action={
                    /* Tenant-side only: emailing a shortlist to a landlord
                       isn't a thing anyone does. */
                    isTenant && shortlist.length > 0 ? (
                      <PressButton
                        onClick={() => setEmailing(true)}
                        className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[11.5px] font-semibold text-page"
                      >
                        <DoodleIcon name="mail" size={13} />
                        Email properties
                      </PressButton>
                    ) : null
                  }
                >
                  {shortlist.length ? (
                    <ul className="space-y-3">
                      {shortlist.map((p) => (
                        <li key={p.id} className="flex items-center gap-3">
                          <PropertyPhoto src={p.image} className="h-10 w-12 shrink-0 rounded-lg" />
                          <span className="min-w-0 flex-1">
                            <span className="hand block truncate text-[12.5px]">{p.name}</span>
                            <span className="block truncate text-[10.5px] text-muted">
                              {p.locality}
                            </span>
                          </span>
                          <span className="figures shrink-0 text-[12.5px]">
                            £{p.rent?.toLocaleString("en-GB")}
                            <span className="text-[10px] text-muted"> pcm</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nothing shortlisted yet.</Empty>
                  )}

                  {/* Confirmation is the point: attaching a property is the
                      moment a lead becomes a viewing, so it gets a tick and
                      the two things you'd obviously do next. */}
                  {justAdded ? (
                    <div className="fade-up mt-4 flex flex-col items-center rounded-2xl border border-line/70 py-5">
                      <DoneTick size={44} />
                      <p className="mt-2.5 text-[12.5px] font-semibold">Property attached</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        {[
                          { label: "Schedule a viewing", icon: "calendar", go: () => setBooking(true) },
                          { label: "Send details", icon: "mail", go: () => setEmailing(true) },
                        ].map((a) => (
                          <PressButton
                            key={a.label}
                            onClick={a.go}
                            className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 text-[11.5px] transition-colors hover:border-ink/40"
                          >
                            <DoodleIcon name={a.icon} size={13} className="text-accent-dark" />
                            {a.label}
                          </PressButton>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setJustAdded(false)}
                        className="mt-3 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                      >
                        + Add another
                      </button>
                    </div>
                  ) : (
                    <PressButton
                      onClick={() => {
                        const next = LISTINGS.find(
                          (l) => !shortlist.some((p) => p.id === l.id)
                        );
                        if (!next) return;
                        setAdded((cur) => [...cur, next.id]);
                        setJustAdded(true);
                      }}
                      className="mt-4 w-full rounded-xl border border-dashed border-line py-2.5 text-[12px] font-medium text-muted transition-colors hover:border-ink/40 hover:text-ink"
                    >
                      + Add property
                    </PressButton>
                  )}
                </Card>

                <div className="lg:col-span-2">
                  <Card title="Pinned notes" icon="note">
                    {notes.filter((n) => n.pinned).length ? (
                      <ul className="space-y-3">
                        {notes
                          .filter((n) => n.pinned)
                          .map((n) => (
                            <li key={n.id} className="rounded-xl bg-accent-soft/40 p-3.5">
                              <p className="text-[12.5px] leading-relaxed">{n.text}</p>
                              <p className="mt-1.5 text-[10.5px] text-muted">
                                {n.author} · {n.when}
                              </p>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <Empty>Nothing pinned. Pin a note in Tasks to bring it here.</Empty>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {/* ══ ACTIVITY ══ */}
            {tab === "activity" && (
              <Card title="Everything that's happened" icon="analytics">
                <ul className="space-y-4">
                  {lead.activity.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 border-b border-line/40 pb-4 last:border-0 last:pb-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60">
                        <DoodleIcon name={a.icon} size={15} className="text-accent-dark" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px]">{a.text}</span>
                        <span className="block text-[10.5px] text-muted">{a.when}</span>
                      </span>
                    </li>
                  ))}
                  {notes.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 border-b border-line/40 pb-4 last:border-0 last:pb-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60">
                        <DoodleIcon name="note" size={15} className="text-accent-dark" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px]">{n.text}</span>
                        <span className="block text-[10.5px] text-muted">
                          Note by {n.author} · {n.when}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-line/70 pt-3 text-[10.5px] text-muted">
                  Emails in and out will thread here — REX AuditLogs already records
                  field-level changes with actor and timestamp, so the history is real.
                </p>
              </Card>
            )}

            {/* ══ VIEWINGS ══ */}
            {tab === "viewings" && (
              <Card
                title="Viewings"
                icon="calendar"
                action={
                  <PressButton
                    onClick={() => setBooking(true)}
                    className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[11.5px] font-semibold text-page"
                  >
                    <DoodleIcon name="calendar" size={13} />
                    Book viewing
                  </PressButton>
                }
              >
                {viewings.length ? (
                  <ul className="space-y-3">
                    {viewings.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 border-b border-line/40 pb-3 last:border-0 last:pb-0">
                        <span className="figures w-32 shrink-0 text-[12px] text-accent-dark">
                          {v.when}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px]">{v.property}</span>
                          <span className="block truncate text-[10.5px] text-muted">{v.locality}</span>
                        </span>
                        <Pill tone={v.outcome === "Applying" ? "good" : "neutral"}>{v.outcome}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No viewings booked for this lead yet.</Empty>
                )}
              </Card>
            )}

            {/* ══ TASKS (and notes) ══ */}
            {tab === "tasks" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card
                  title="Tasks"
                  icon="checklist"
                  action={
                    <button className="text-[11.5px] font-semibold text-muted transition-colors hover:text-ink">
                      + Add task
                    </button>
                  }
                >
                  <ul className="space-y-2.5">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setTasks((cur) =>
                              cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))
                            )
                          }
                          className="flex w-full items-start gap-2.5 text-left"
                        >
                          <span
                            className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] transition-colors ${
                              t.done
                                ? "border-accent-dark bg-accent-soft text-accent-dark"
                                : "border-line"
                            }`}
                          >
                            {t.done && "✓"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-[12.5px] leading-snug ${
                                t.done ? "text-muted line-through opacity-60" : ""
                              }`}
                            >
                              {t.title}
                            </span>
                            <span className="block text-[10.5px] text-muted">{t.due}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card title="Notes" icon="note">
                  <div className="rounded-xl border border-line/80 p-2.5">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder="Add a note — what was said, what to remember…"
                      className="w-full resize-none bg-transparent text-[12.5px] outline-none placeholder:text-muted/70"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={!draft.trim()}
                        className="rounded-full bg-ink px-4 py-1.5 text-[11.5px] font-semibold text-page transition-opacity disabled:opacity-30"
                      >
                        Save note
                      </button>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-3">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className={`rounded-xl p-3.5 ${n.pinned ? "bg-accent-soft/40" : "border border-line/60"}`}
                      >
                        <p className="text-[12.5px] leading-relaxed">{n.text}</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-[10.5px] text-muted">
                            {n.author} · {n.when}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setNotes((cur) =>
                                cur.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x))
                              )
                            }
                            className="text-[10.5px] font-semibold text-muted transition-colors hover:text-ink"
                          >
                            {n.pinned ? "Unpin" : "Pin"}
                          </button>
                        </div>
                      </li>
                    ))}
                    {!notes.length && <Empty>No notes yet.</Empty>}
                  </ul>
                </Card>
              </div>
            )}

            {/* ══ PROPERTIES ══ */}
            {tab === "properties" && (
              <Card
                title="Properties"
                icon="home"
                action={
                  isTenant && shortlist.length > 0 ? (
                    <PressButton
                      onClick={() => setEmailing(true)}
                      className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[11.5px] font-semibold text-page"
                    >
                      <DoodleIcon name="mail" size={13} />
                      Email properties
                    </PressButton>
                  ) : null
                }
              >
                {shortlist.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {shortlist.map((p) => (
                      <div key={p.id} className="overflow-hidden rounded-2xl border border-line/60">
                        <PropertyPhoto src={p.image} className="h-32 w-full" />
                        <div className="p-3.5">
                          <p className="hand truncate text-[13px]">{p.name}</p>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted">{p.locality}</p>
                          <p className="figures mt-2 text-[15px]">
                            £{p.rent?.toLocaleString("en-GB")}
                            <span className="text-[10px] text-muted"> pcm</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>
                    Nothing matched yet — add a property to shortlist it against this lead.
                  </Empty>
                )}
              </Card>
            )}

            {/* ══ DOCUMENTS ══ */}
            {tab === "documents" && (
              <Card
                title="Documents"
                icon="folder"
                action={
                  <button className="text-[11.5px] font-semibold text-muted transition-colors hover:text-ink">
                    + Upload
                  </button>
                }
              >
                {docs.length ? (
                  <ul className="space-y-2.5">
                    {docs.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center gap-3 border-b border-line/40 pb-3 last:border-0 last:pb-0"
                      >
                        <DoodleIcon name="doc" size={17} className="shrink-0 text-accent-dark" />
                        <span className="min-w-0 flex-1">
                          {renaming === d.id ? (
                            <input
                              autoFocus
                              // Select the whole name on open: renaming a file
                              // means replacing it, not appending to it.
                              onFocus={(e) => e.target.select()}
                              defaultValue={d.name}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v) setDocs((cur) => cur.map((x) => (x.id === d.id ? { ...x, name: v } : x)));
                                setRenaming(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setRenaming(null);
                              }}
                              className="w-full rounded-lg border border-ink/40 bg-transparent px-2 py-1 text-[12.5px] outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRenaming(d.id)}
                              className="block max-w-full truncate text-left text-[12.5px] hover:underline"
                              title="Click to rename"
                            >
                              {d.name}
                            </button>
                          )}
                          <span className="block text-[10.5px] text-muted">
                            {d.size} · {d.when}
                          </span>
                        </span>

                        {/* The tag IS the filing system — a document nobody
                            classified is a document nobody can find later. */}
                        <select
                          value={d.tag}
                          onChange={(e) =>
                            setDocs((cur) =>
                              cur.map((x) =>
                                x.id === d.id ? { ...x, tag: e.target.value as DocTag } : x
                              )
                            )
                          }
                          className="shrink-0 rounded-full border border-line/80 bg-transparent px-3 py-1.5 text-[11px] outline-none focus:border-ink"
                        >
                          {DOC_TAGS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No documents yet. Upload right-to-rent, income proof or references.</Empty>
                )}
                <p className="mt-4 border-t border-line/70 pt-3 text-[10.5px] leading-relaxed text-muted">
                  Lettings tags only — right to rent, income, references, guarantor. No AML here:
                  that&apos;s a sales-side check and doesn&apos;t belong on a tenant record.
                </p>
              </Card>
            )}
          </div>
        </div>
      </aside>

      <EmailProperties
        open={emailing}
        onClose={() => {
          setEmailing(false);
          // Sending the shortlist IS how you finish the shortlist step.
          if (here.action === "send") advance();
        }}
        lead={{ name: lead.name, email: contact.email || lead.email }}
        properties={shortlist}
      />

      <ViewingBooker
        open={booking}
        onClose={() => setBooking(false)}
        lead={{
          name: lead.name,
          email: contact.email || lead.email,
          phone: contact.phone || lead.phone,
        }}
        properties={shortlist.length ? shortlist : LISTINGS.slice(0, 4)}
        agent={lead.agent === "Unassigned" ? "Kirstie" : lead.agent}
        onBooked={(v) => {
          setBooked((cur) => [
            {
              id: `vw${cur.length + 1}${v.when}`,
              when: v.when,
              property: v.property,
              locality: v.locality,
              outcome: "Booked",
            },
            ...cur,
          ]);
          if (here.action === "viewing") advance();
        }}
      />

      <SignaturePanel
        open={signing}
        onClose={() => setSigning(false)}
        document={signDoc}
        merges={signMerges}
        signers={signers}
        onSent={() => here.action === "sign" && advance()}
      />
    </div>
  );
}
