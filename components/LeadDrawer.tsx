"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DetailRow, DoneTick, PressButton, SectionHead } from "@/components/Bits";
import EmailProperties from "@/components/EmailProperties";
import PhotoBox from "@/components/PhotoBox";
import ProcessTimeline from "@/components/ProcessTimeline";
import PropertyFacts from "@/components/PropertyFacts";
import ReferToAgent, { isSalesIntent, SALES_TAGS } from "@/components/ReferToAgent";
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
import AppraisalTrack from "@/components/AppraisalTrack";
import { EMPTY_CASE, type AppraisalCase } from "@/lib/appraisal";
import { saveLabel, useCaseState } from "@/lib/case-state";
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

type TabKey = "activity" | "tasks" | "documents" | "properties";

/**
 * The side questions live in the top bar, not under the record: click one and
 * its panel takes the person box over; click it again and the contact details
 * come back. Null means "the record itself", which is the resting state.
 *
 * Viewings deliberately has no tab — at the appointment stage there is no
 * property to view, and a tab that's usually irrelevant teaches people to
 * stop reading tabs. Booked viewings surface in Activity, where they're news.
 */
const TABS: { key: TabKey; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
  { key: "properties", label: "Properties" },
];

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};
const LISTINGS = rexSample.listings as Listing[];

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-6 text-center text-[12px] text-muted">{children}</p>
);

/** The shell every step panel shares: scrim, sheet, title, Escape via ✕. */
function StepModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />
      <div className="fade-up relative w-full max-w-lg overflow-hidden rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="mb-4 flex items-start justify-between gap-3">
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
        {children}
      </div>
    </div>
  );
}

/**
 * Recording the appraisal, right after it happened: where the value landed
 * and what was actually said. The write-up becomes a real note on the record
 * — the appraisal panel is where notes come FROM, not another place they go.
 */
function AppraisalForm({
  leadName,
  onClose,
  onSave,
}: {
  leadName: string;
  onClose: () => void;
  /** The write-up, and when the follow-up call happens ("" = none set). */
  onSave: (note: string, followUp: string) => void;
}) {
  const [value, setValue] = useState("");
  const [text, setText] = useState("");
  const [followUp, setFollowUp] = useState("");
  const first = leadName.split(" ")[0];

  return (
    <StepModal
      title="Record the appraisal"
      subtitle={`How did it go at ${first}'s?`}
      onClose={onClose}
    >
      <label className="mb-3 block">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          Value discussed
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. £1,200 pcm"
          className="figures w-full rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[13.5px] outline-none focus:border-ink"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          What was said
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Condition, their expectations, timescales, anything promised…"
          className="w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none focus:border-ink"
        />
      </label>
      {/* The follow-up is set HERE, not on a separate step — one visit, one
          panel. An appraisal recorded without a follow-up date is a lead
          quietly handed to whichever agent rings them first. */}
      <label className="mt-3 block">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          Follow-up call
        </span>
        <input
          type="date"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className="figures w-full rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[13.5px] outline-none focus:border-ink"
        />
      </label>
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Bedrooms, bathrooms and type go in the property panel on the record — fill them
        while it&apos;s fresh. The write-up saves as a note; the follow-up becomes a task.
      </p>
      <div className="mt-4 flex justify-end">
        <PressButton
          onClick={() => {
            const when = followUp
              ? new Date(`${followUp}T09:00`).toLocaleDateString("en-GB", {
                  weekday: "short", day: "numeric", month: "short",
                })
              : "";
            onSave(value.trim() ? `Appraisal — ${value.trim()}. ${text}` : text, when);
          }}
          className="press-ring rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page"
        >
          Save appraisal & follow-up
        </PressButton>
      </div>
    </StepModal>
  );
}

/**
 * The second half of the take-on: the visit happened, now the listing's raw
 * material — photos (stored for real, in R2), which one leads, and the
 * description. This is what the listing builds from when the record pushes.
 */
function TakeOnPanel({
  refId,
  onClose,
  onSave,
}: {
  refId: string;
  onClose: () => void;
  onSave: (summary: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [front, setFront] = useState<string | null>(null);

  return (
    <StepModal
      title="Photos & details"
      subtitle="What the listing will be built from"
      onClose={onClose}
    >
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <PhotoBox
            key={i}
            refId={refId}
            label={i === 0 ? "Front image" : "Add a photo"}
            onStored={(f) => {
              setPhotos((cur) => [...cur, f.name]);
              // First photo in is the front image until somebody says otherwise.
              setFront((cur) => cur ?? f.name);
            }}
          />
        ))}
      </div>

      {photos.length > 1 && (
        <div className="mt-3">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            Front image
          </span>
          <div className="flex flex-wrap gap-1.5">
            {photos.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setFront(name)}
                className={`max-w-[180px] truncate rounded-full border px-3 py-1 text-[11px] transition-colors ${
                  front === name
                    ? "border-accent-dark bg-accent-soft/60 font-semibold text-accent-dark"
                    : "border-line/80 text-muted hover:border-ink/40"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mt-3 block">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          Description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="The listing copy — rooms, condition, what sells it…"
          className="w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed outline-none focus:border-ink"
        />
      </label>

      <div className="mt-4 flex justify-end">
        <PressButton
          onClick={() =>
            onSave(
              `Take-on — ${photos.length} photo${photos.length === 1 ? "" : "s"}${
                front ? `, front: ${front}` : ""
              }.${description.trim() ? ` ${description.trim()}` : ""}`
            )
          }
          className="press-ring rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page"
        >
          Save take-on
        </PressButton>
      </div>
    </StepModal>
  );
}

/**
 * A document portal for a checks stage. Real uploads — the files land in R2
 * under the documents prefix, which is the same vault the compliance portal
 * side-mounts. Deliberately TOOTHLESS as a gate: missing pieces never lock
 * the record, because a record nobody can move is a record people work
 * around, and worked-around records are how compliance actually gets lost.
 */
const DOC_PORTALS = {
  id: {
    title: "Landlord ID & ownership",
    slots: ["Photo ID", "Proof of ownership"],
    note: "Title register or Land Registry for ownership. Stored in the vault; the compliance portal reads the same files.",
  },
  checks: {
    title: "AML & property compliance",
    slots: ["AML check", "EPC", "Gas safety", "EICR"],
    note: "Filed against this landlord and carried onto the listing at push. Michael's compliance portal side-mounts this vault.",
  },
} as const;

function DocsPanel({
  kind,
  refId,
  onClose,
  onDone,
}: {
  kind: keyof typeof DOC_PORTALS;
  refId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const portal = DOC_PORTALS[kind];
  return (
    <StepModal title={portal.title} subtitle="Nothing here blocks the record" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2.5">
        {portal.slots.map((slot) => (
          <div key={slot}>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              {slot}
            </span>
            <PhotoBox
              scope="document"
              refId={`${refId}-${slot.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              label={`Add ${slot.toLowerCase()}`}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-muted">{portal.note}</p>
      <div className="mt-4 flex justify-end">
        <PressButton
          onClick={onDone}
          className="press-ring rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page"
        >
          Save & carry on
        </PressButton>
      </div>
    </StepModal>
  );
}

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
  const [tab, setTab] = useState<TabKey | null>(null);

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
  /* The appraisal sub-case, stored per lead in os_case_state. */
  const [appraisal, setAppraisal, appraisalSave] = useCaseState<AppraisalCase>(
    "appraisal",
    lead?.id ?? null,
    EMPTY_CASE
  );
  const [booking, setBooking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [booked, setBooked] = useState<LeadViewing[]>([]);
  const [handingOff, setHandingOff] = useState(false);
  const [tagging, setTagging] = useState(false);
  // The booker serves two jobs; which one is decided at fire time.
  const [bookMode, setBookMode] = useState<"viewing" | "appraisal" | "takeon">("viewing");
  const [appraising, setAppraising] = useState(false);
  // The take-on is two moves in one step: book the visit, then capture what
  // it produced. This remembers which half we're on.
  const [takeOnBooked, setTakeOnBooked] = useState(false);
  const [takingOn, setTakingOn] = useState(false);
  const [docsOpen, setDocsOpen] = useState<null | "id" | "checks">(null);
  // Terms out for signature: the record WAITS here rather than advancing —
  // it moves itself on when the signed copy comes back.
  const [termsOut, setTermsOut] = useState(false);

  useEffect(() => {
    if (!detail) return;
    setTasks(detail.tasks);
    setNotes(detail.notes);
    setDocs(detail.docs);
    setTags(detail.tags);
    setTab(null);
    setDraft("");
    setAdded([]);
    setJustAdded(false);
    setBooked([]);
    setTermsOut(false);
    setTakeOnBooked(false);
    setDocsOpen(null);
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

  /** What the Next-action button does — the step decides, not the button.
      Imperatives open the work itself; only stray "none" steps advance dry. */
  function fire() {
    if (here.action === "viewing") { setBookMode("viewing"); setBooking(true); }
    else if (here.action === "appraise") { setBookMode("appraisal"); setBooking(true); }
    else if (here.action === "appraisal-form") setAppraising(true);
    else if (here.action === "takeon") {
      if (!takeOnBooked) { setBookMode("takeon"); setBooking(true); }
      else setTakingOn(true);
    }
    else if (here.action === "docs") setDocsOpen("id");
    else if (here.action === "sign") setSigning(true);
    else if (here.action === "send") setEmailing(true);
    else if (here.action === "handoff") setHandingOff(true);
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
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-l-2xl w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
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
          {/* The side questions, centre stage. A tab toggles: open its panel
              in the person box, or click again to put the record back. */}
          <div className="hidden items-center gap-1 sm:flex">
            {TABS.map((t) => {
              const count =
                t.key === "tasks" ? tasks.filter((x) => !x.done).length
                : t.key === "documents" ? docs.length
                : t.key === "properties" ? shortlist.length
                : 0;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(active ? null : t.key)}
                  className={`hand rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-accent-soft text-accent-dark"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span className="figures ml-1.5 text-[10.5px] opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-4 pt-4">
          {/* ── The person. One box: who they are, how to reach them, the
              property they rang about, and its photo — with tags at the foot,
              because tags describe the person, not the process. No avatar:
              nobody uploads headshots of applicants, and a circle of initials
              is a photo-shaped apology. ── */}
          <div className="relative rounded-3xl border border-line/80 bg-panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[26px] leading-tight">{lead.name}</h2>
              <Pill tone={STAGE_TONE[lead.stage]}>{lead.stage}</Pill>
            </div>

            {tab === null ? (
              <>
                {/* The row DISTRIBUTES rather than hugging the left: each column takes
                    an equal share up to a cap, so an ultra-wide screen widens the
                    breathing room instead of piling empty space after the photo. All
                    three stretch to one height — the photo ends where the last
                    contact row ends, because items-stretch makes that a rule rather
                    than a coincidence. */}
                <div className="mt-5 flex flex-wrap items-stretch justify-between gap-x-12 gap-y-6">
                  {/* Fixed-width columns: the rules under the rows stop where
                      the content stops instead of running the box's width. */}
                  <section className="w-full min-w-[240px] flex-1 lg:max-w-[350px]">
                    <SectionHead>Contact details</SectionHead>
                    {/* Click a value to change it — a rule appears underneath
                        and it commits on blur or Enter. No Save button per
                        field, and no edit mode for the whole record: changing
                        a mobile number shouldn't feel like filling in a form.
                        Copy sits on hover. */}
                    <div className="divide-y divide-line/50">
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
                      {/* Landlords give a property address; tenants give an
                          area. Both look up as they type — the pick commits
                          the formatted address with its geotag resolved, and
                          that geotag is what the take-on weather and the
                          street photo will hang off. */}
                      <DetailRow
                        icon="home"
                        label={isTenant ? "area" : "address"}
                        value={contact.area}
                        onChange={(v) => setContact((c) => ({ ...c, area: v }))}
                        address
                      />
                      <DetailRow
                        icon="target"
                        label="source"
                        value={`${lead.source} · ${lead.received}`}
                      />
                    </div>
                  </section>

                  {!isTenant && (
                    <section className="w-full min-w-[240px] flex-1 lg:max-w-[350px]">
                      <SectionHead>The property</SectionHead>
                      <PropertyFacts />
                    </section>
                  )}

                  {/* The photo, sized like a photo rather than a mural — the
                      full-height version dominated the box and pushed the
                      record off one page. No heading: it's visibly a photo,
                      and a label saying so was a label saying nothing.
                      Tenants have no property to photograph, so they keep
                      the drawing. */}
                  {isTenant ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src="/illustrations/notioly/home-caring.svg"
                      alt=""
                      aria-hidden
                      className="art ml-auto hidden h-36 shrink-0 self-end lg:block"
                    />
                  ) : (
                    <div className="hidden min-w-[300px] flex-1 self-stretch xl:block xl:max-w-[420px]">
                      <PhotoBox
                        fill
                        className="h-full"
                        label="Add a photo of the property"
                        refId={`lead-${lead.id}`}
                      />
                    </div>
                  )}
                </div>

                {/* Tags — the quick facts, addable, at the foot of the box. */}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
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
                  {/* A menu rather than a prompt box. The sales tags have to
                      be offered, not guessed at — a reveal nobody can find is
                      a feature nobody has. */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTagging((t) => !t)}
                      className="rounded-full border border-dashed border-line px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
                    >
                      + Add tag
                    </button>
                    {tagging && (
                      <div className="fade-up absolute bottom-full left-0 z-20 mb-1.5 w-56 rounded-xl border border-line/80 bg-card p-1.5 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.3)]">
                        <p className="px-2 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-wide text-muted">
                          Sales intent
                        </p>
                        {SALES_TAGS.filter((t) => !tags.includes(t)).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => { setTags((cur) => [...cur, t]); setTagging(false); }}
                            className="block w-full rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-page"
                          >
                            {t}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setTagging(false);
                            const t = window.prompt("New tag");
                            if (t?.trim()) setTags((cur) => [...cur, t.trim()]);
                          }}
                          className="mt-1 block w-full rounded-lg border-t border-line/50 px-2 py-1.5 text-left text-[12px] text-muted transition-colors hover:text-ink"
                        >
                          Something else…
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* A tab is open: its panel takes the box over. Same place,
                 different question — not a second page of cards underneath.
                 It scrolls within its own bounds; the page never does. */
              <div className="fade-up mt-5 max-h-[46vh] overflow-y-auto pr-1">
                {tab === "activity" && (
                  <>
                    <ul className="space-y-4">
                      {viewings.map((v) => (
                        <li key={v.id} className="flex items-start gap-3 border-b border-line/40 pb-4 last:border-0 last:pb-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60">
                            <DoodleIcon name="calendar" size={15} className="text-accent-dark" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px]">
                              Viewing — {v.property}, {v.locality}
                            </span>
                            <span className="block text-[10.5px] text-muted">{v.when}</span>
                          </span>
                          <Pill tone={v.outcome === "Applying" ? "good" : "neutral"}>{v.outcome}</Pill>
                        </li>
                      ))}
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
                    </ul>
                    <p className="mt-4 border-t border-line/70 pt-3 text-[10.5px] text-muted">
                      Emails in and out will thread here — REX AuditLogs already records
                      field-level changes with actor and timestamp, so the history is real.
                    </p>
                  </>
                )}

                {tab === "tasks" && (
                  <>
                    <ul className="max-w-xl space-y-2.5">
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
                      {!tasks.length && <Empty>Nothing outstanding.</Empty>}
                    </ul>
                  </>
                )}

                {tab === "documents" && (
                  <>
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
                                  // Select the whole name on open: renaming a
                                  // file means replacing it, not appending.
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

                            {/* The tag IS the filing system — a document
                                nobody classified is a document nobody can
                                find later. */}
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
                      Lettings tags only — right to rent, income, references, guarantor. No AML
                      here: that&apos;s a sales-side check and doesn&apos;t belong on a tenant record.
                    </p>
                  </>
                )}

                {tab === "properties" && (
                  <>
                    {isTenant && shortlist.length > 0 && (
                      <div className="mb-4 flex justify-end">
                        <PressButton
                          onClick={() => setEmailing(true)}
                          className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-2 text-[11.5px] font-semibold text-page"
                        >
                          <DoodleIcon name="mail" size={13} />
                          Email properties
                        </PressButton>
                      </div>
                    )}
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
                  </>
                )}
              </div>
            )}
          </div>

          {/* The reveal. Sits between the person and their process, across the
              full width — a referral worth a fee should not be a link in a
              corner. */}
          {isSalesIntent(tags) && (
            <div className="mt-5">
              <ReferToAgent
                name={lead.name}
                trigger={tags.find((t) => isSalesIntent([t])) ?? "for sale"}
              />
            </div>
          )}

          {/* ── The process, in its own box, with the next action written
              into it. The rail says where they are; the sentence under it
              says — in plain words, for the agent who's three days in and
              nervous — exactly what to do about it, and the button does that
              thing. Nobody should ever have to infer their next move from a
              diagram. ── */}
          <div className="mt-3 rounded-3xl border border-line/80 bg-panel p-5">
            <ProcessTimeline
              steps={track}
              current={step}
              stalled={stalled}
              onPick={setStep}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-line/60 pt-4">
              <div className="min-w-[240px] max-w-xl flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Next action
                </p>
                {stalled ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    Not proceeding — {lead.name.split(" ")[0]} stopped at &ldquo;{here.label}
                    &rdquo;. Pick a step on the rail to restart them.
                  </p>
                ) : (
                  <>
                    <p className="hand mt-1.5 text-[17px] leading-snug">{here.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{here.detail}</p>
                    {detail.nextAction && (
                      <p className="mt-2 flex items-center gap-2 text-[11.5px] font-medium text-accent-dark">
                        <DoodleIcon name="clock" size={13} />
                        {detail.nextAction.due}
                      </p>
                    )}
                  </>
                )}
              </div>

              {!stalled && here.id === "terms" && termsOut ? (
                /* Sent, not signed. The process waits — pressing on would be
                   marketing a property with no instruction behind it. It
                   moves itself the moment the signed copy lands; the button
                   below stands in for the DocuSign webhook until it's wired. */
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <p className="flex items-center gap-2 rounded-full border border-dashed border-accent-dark/50 px-5 py-2.5 text-[12.5px] font-medium text-accent-dark">
                    <DoodleIcon name="clock" size={14} />
                    Out for signature — waiting
                  </p>
                  <button
                    type="button"
                    onClick={() => { setTermsOut(false); advance(); }}
                    className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    Signed copy came back (wireframe)
                  </button>
                </div>
              ) : !stalled && (
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <PressButton
                    onClick={fire}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[13px] font-semibold text-page"
                  >
                    <DoodleIcon
                      name={here.action === "takeon" && takeOnBooked ? "doc" : here.icon}
                      size={15}
                    />
                    {here.action === "takeon" && takeOnBooked
                      ? "Add photos & details"
                      : here.cta}
                  </PressButton>
                  {here.id === "checks" && (
                    <button
                      type="button"
                      onClick={() => setDocsOpen("checks")}
                      className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Add AML & compliance documents
                    </button>
                  )}
                  {here.action !== "none" && !finished && (
                    <button
                      type="button"
                      onClick={advance}
                      className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Already done — move on
                    </button>
                  )}
                  {finished && (
                    <p className="text-[11px] text-muted">
                      Last step on the {isTenant ? "tenant" : "landlord"} track.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── The appraisal opens up INSIDE its own step: booking one is the
              start of a job, not the end of one. Only while the record is
              actually there — once terms are out, the sub-track has done its
              work and folding it away keeps the record honest about where it
              is. ── */}
          {!isTenant && here.id === "appraisal" && (
            <div className="mt-3">
              <AppraisalTrack
                value={appraisal}
                onChange={setAppraisal}
                who="You"
                landlordEmail={lead.email}
                recordId={lead.id}
                invite={{
                  landlordName: lead.name,
                  address: lead.area || "your property",
                  whenPretty: appraisal.bookedFor ?? detail.nextAction?.due ?? "",
                  startsAt: appraisal.bookedFor,
                  minutes: 45,
                  agentName: lead.agent || "The Lettings Experts",
                  agentPhone: "0161 883 2525",
                }}
              />
              {saveLabel(appraisalSave) && (
                <p className="mt-1.5 pl-1 text-[10.5px] text-muted">{saveLabel(appraisalSave)}</p>
              )}
            </div>
          )}

          {/* ── Notes fill whatever is left of the screen — the record wants
              to END at the bottom edge, not scroll past it. Composer on the
              left, the whole height, because writing is the job; the list on
              the right is the thing that accumulates, so IT scrolls, inside
              its own column, only when it has to. No "lead summary" card —
              the agent's own notes ARE the summary. ── */}
          <div className="mt-3 flex min-h-[200px] flex-1 flex-col rounded-3xl border border-line/80 bg-panel p-5">
            <SectionHead>Notes</SectionHead>
            <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-2">
              <div className="flex min-h-0 flex-col rounded-xl border border-line/80 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add a note — what was said, what to remember…"
                  className="min-h-0 w-full flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed outline-none placeholder:text-muted/70"
                />
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={!draft.trim()}
                    className="rounded-full bg-accent-dark px-4 py-1.5 text-[11.5px] font-semibold text-page transition-opacity disabled:opacity-30"
                  >
                    Save note
                  </button>
                </div>
              </div>

              <ul className="min-h-0 space-y-3 overflow-y-auto pr-1">
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
                {!notes.length && <Empty>No notes yet — yours will be the first.</Empty>}
              </ul>
            </div>
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
        mode={bookMode}
        address={contact.area || lead.preferred}
        origin={lead.lat != null && lead.lng != null ? { lat: lead.lat, lng: lead.lng } : null}
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
          // Booking IS the step's work — the record moves itself on, and the
          // next step's panel is one button away rather than a hunt. The
          // take-on stays put: its second half (photos & details) is still due.
          if (here.action === "viewing" || here.action === "appraise") advance();
          if (here.action === "takeon") setTakeOnBooked(true);
        }}
      />

      {/* ── Recording the appraisal: what was found, what was said. Saving
          writes a real note and moves the record to the follow-up. ── */}
      {takingOn && (
        <TakeOnPanel
          refId={`lead-${lead.id}`}
          onClose={() => setTakingOn(false)}
          onSave={(summary) => {
            setNotes((n) => [
              { id: `n${Date.now()}`, author: "You", when: "Just now", text: summary },
              ...n,
            ]);
            setTakingOn(false);
            advance();
          }}
        />
      )}

      {docsOpen && (
        <DocsPanel
          kind={docsOpen}
          refId={`lead-${lead.id}`}
          onClose={() => setDocsOpen(null)}
          onDone={() => {
            const wasId = docsOpen === "id";
            setDocsOpen(null);
            // The ID step is done once its portal closes; the checks portal is
            // an aside — the push is that step's exit, not this.
            if (wasId) advance();
          }}
        />
      )}

      {appraising && (
        <AppraisalForm
          leadName={lead.name}
          onClose={() => setAppraising(false)}
          onSave={(note, followUp) => {
            if (note.trim()) {
              setNotes((n) => [
                { id: `n${Date.now()}`, author: "You", when: "Just now", text: note.trim() },
                ...n,
              ]);
            }
            if (followUp) {
              setTasks((cur) => [
                { id: `t${Date.now()}`, title: "MA follow-up call", due: followUp, done: false },
                ...cur,
              ]);
            }
            setAppraising(false);
            advance();
          }}
        />
      )}

      {/* The hand-off. Deliberately a confirmation and not a silent jump: the
          lead leaves this list and becomes a property, which is the single
          most consequential thing an agent can do to a record. */}
      {handingOff && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button
            aria-label="Close"
            onClick={() => setHandingOff(false)}
            className="absolute inset-0 cursor-default bg-ink/45"
          />
          <div className="fade-up relative w-full max-w-md overflow-hidden rounded-3xl border border-line/80 bg-page p-7 text-center shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <DoneTick />
            <h2 className="hand mt-5 text-[20px]">Ready to become a listing</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              {lead.name} is signed, compliant and live. Pushing creates the property in
              Listings and closes this lead — the viewings and applicant track carries on
              there, against the property rather than the person.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setHandingOff(false)}
                className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40"
              >
                Not yet
              </button>
              <Link
                href="/listings"
                className="press-ring press-wobble flex items-center gap-2 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page"
              >
                <DoodleIcon name="key" size={15} />
                Push to listings
              </Link>
            </div>
            <p className="mt-4 text-[10.5px] text-muted">
              Wireframe: this opens Listings. Creating the REX property record is the
              write that isn&apos;t wired yet.
            </p>
          </div>
        </div>
      )}

      <SignaturePanel
        open={signing}
        onClose={() => setSigning(false)}
        document={signDoc}
        merges={signMerges}
        signers={signers}
        onSent={() => {
          if (here.id === "terms") setTermsOut(true);
          else if (here.action === "sign") advance();
        }}
      />
    </div>
  );
}
