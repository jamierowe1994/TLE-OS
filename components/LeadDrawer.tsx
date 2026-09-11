"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerOpen } from "@/lib/open-record";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { handoverTarget } from "@/lib/market-appraisal";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DetailRow, DoneTick, PressButton, SectionHead } from "@/components/Bits";
import Compose from "@/components/Compose";
import { agentName, firstNameOf, properName } from "@/lib/names";
import EmailProperties from "@/components/EmailProperties";
import PhotoBox from "@/components/PhotoBox";
import ProcessTimeline from "@/components/ProcessTimeline";
import PropertyFacts from "@/components/PropertyFacts";
import PinMap from "@/components/PinMap";
import { EMPTY_PROPERTY, type PropertyFactsData } from "@/lib/lead-facts-shape";
import ReferToAgent, { isSalesIntent, SALES_TAGS } from "@/components/ReferToAgent";
import SignaturePanel, { type Signer } from "@/components/SignaturePanel";
import ViewingBooker from "@/components/ViewingBooker";
import TenantPropertySearch from "@/components/TenantPropertySearch";
import LogTouch, { type LogMode } from "@/components/LogTouch";
import { ATTEMPT_KINDS, touchIcon, touchSentence, whenAgo, type LeadTouch, type Spine, type SpineId } from "@/lib/lead-spine";
import { Pill } from "@/components/Wire";
import { leadSide } from "@/lib/leads-sample";
import { isOsLead, osContactIdFrom } from "@/lib/contacts-as-leads";
import { InlineField } from "@/components/Bits";
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
import { isStalled, NURTURE_BRANCH, startingStep, trackFor } from "@/lib/journey";
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
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
  { key: "properties", label: "Properties" },
];

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};
const LISTINGS = rexSample.listings as Listing[];

type TaskRow = {
  id: string; title: string; detail: string; dueAt: string | null; done: boolean; kind: string; createdBy: string;
};

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

  /* ---- Homesearch pre-fill ------------------------------------------------
     The agent has just walked the property, so this is the one moment they
     certainly know its address — and the moment they least want to be typing
     things a database already holds.

     Value discussed is filled from what same-sized homes in that postcode
     SECTOR actually let for, bed-matched. Not a sale valuation: this business
     runs on rent, and Homesearch's quick_valuation answers a different
     question.

     Everything it returns is a SUGGESTION and every field stays editable. The
     agent stood in the house; the API did not. It also fills nothing silently —
     the basis is printed under the figure, because a number that appears on its
     own gets trusted more than it has earned.

     Two known traps, both handled rather than hoped away: the route's own trust
     check refuses a match whose house number disagrees (Homesearch will happily
     resolve to a neighbour), and avg_price comes back null often enough that an
     absent figure has to be said out loud instead of leaving the box blank. */
  const [addr, setAddr] = useState("");
  const [pc, setPc] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<null | {
    beds?: number;
    propertyType?: string;
    sqft?: number;
    taxBand?: string;
    epc?: { rating?: string; current?: boolean } | null;
    areaRent?: { avg: number; beds: number } | null;
    miss?: string;
  }>(null);

  async function prefill() {
    if (!addr.trim() || !pc.trim()) return;
    setLooking(true);
    setFound(null);
    try {
      const r = await fetch(
        `/api/dossier?address=${encodeURIComponent(addr)}&postcode=${encodeURIComponent(pc)}`,
        { cache: "no-store" }
      );
      const d = r.ok ? await r.json() : null;
      if (!d?.ok) {
        setFound({ miss: "Homesearch didn't answer for that address." });
        return;
      }
      if (!d.beds && !d.areaRent) {
        // The trust check refused it, or there is simply nothing on file.
        setFound({
          miss:
            "Couldn't confirm that exact address — nothing filled in. Check the house number, or just type the figures.",
        });
        return;
      }
      setFound({
        beds: d.beds,
        propertyType: d.propertyType,
        sqft: d.sqft,
        taxBand: d.taxBand,
        epc: d.epc ?? null,
        areaRent: d.areaRent ?? null,
      });
      // Only fills an EMPTY box. If the agent has already typed what the
      // landlord said, that beats an average every time.
      if (d.areaRent?.avg && !value.trim()) {
        setValue(`£${Math.round(d.areaRent.avg).toLocaleString("en-GB")} pcm`);
      }
    } catch {
      setFound({ miss: "Couldn't reach Homesearch just now." });
    } finally {
      setLooking(false);
    }
  }

  return (
    <StepModal
      title="Record the appraisal"
      subtitle={`How did it go at ${first}'s?`}
      onClose={onClose}
    >
      {/* Fill it in from the address, before anyone types a figure. */}
      <div className="mb-3 rounded-xl border border-line/80 p-3">
        <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          Fill from the address
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="12 Elm Gardens"
            className="min-w-0 flex-1 rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
          />
          <input
            value={pc}
            onChange={(e) => setPc(e.target.value.toUpperCase())}
            placeholder="M20 2XR"
            className="w-28 rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] uppercase outline-none focus:border-ink"
          />
          <PressButton
            onClick={prefill}
            className="press-ring rounded-lg border border-line/80 px-3 py-2 text-[12px] font-semibold"
          >
            {looking ? "Looking…" : "Look it up"}
          </PressButton>
        </div>

        {found?.miss ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{found.miss}</p>
        ) : null}

        {found && !found.miss ? (
          <div className="mt-2.5 space-y-1 text-[11.5px] text-muted">
            <p>
              {[
                found.beds ? `${found.beds} bed` : null,
                found.propertyType,
                found.sqft ? `${found.sqft.toLocaleString("en-GB")} sq ft` : null,
                found.taxBand ? `Council tax ${found.taxBand}` : null,
                found.epc?.rating
                  ? `EPC ${found.epc.rating}${found.epc.current ? "" : " (expired)"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>
              {found.areaRent
                ? `${found.areaRent.beds}-bed homes in this postcode sector are on the market at about £${Math.round(found.areaRent.avg).toLocaleString("en-GB")} pcm — filled in below, change it to whatever you agreed.`
                : "No local letting average for this size — the value is yours to type."}
            </p>
          </div>
        ) : null}
      </div>

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

type PassportState = {
  sent: boolean;
  invitedAt: string | null;
  path: string | null;
  done: boolean;
  summary: {
    applicantType: string | null;
    householdIncome: number | null;
    adults: string | null;
    children: string | null;
    pets: string | null;
    guarantor: string | null;
    rightToRent: string | null;
    currentAddress: string | null;
  } | null;
};
type EnquiryState = { message: string; fields: Array<[string, string]>; receivedAt: string | null; source: string | null };
/* Enquiries already read, by lead id, for the life of the page. Kept whatever
   happens to the request that fetched them: the drawer can re-run its read
   mid-flight (the list refreshes under it), and a reply thrown away as
   stale left the card on "loading" until the next click. */
const ENQUIRY_CACHE = new Map<string, EnquiryState | null>();

/* The market appraisal page's small pieces, so the two files rhyme. */
function CardTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="hand flex items-start gap-3 text-[17px] leading-tight">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name={icon} size={16} />
      </span>
      <span className="min-w-0 pt-1.5">{children}</span>
    </h3>
  );
}
function Glance({ icon, title, sub }: { icon: string; title: string; sub: string }) {
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

/** "Thu 11 Sep, 2:32pm" - the day and the time, which is what an agent reads first. */
const whenFull = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" }).replace(" ", "");
  return `${day}, ${time}`;
};

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
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<TabKey | null>(null);

  // Editable state, seeded per lead — the wireframe should feel like software,
  // not a picture of software.
  /* Who is looking at this, for the booker's diary and the passport's
     "sent by". Asked once when the drawer opens. */
  const [me, setMe] = useState<{ name?: string; email?: string } | null>(null);
  useEffect(() => {
    if (!lead) return;
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.user) setMe({ name: j.user.name, email: j.user.email }); })
      .catch(() => { /* the drawer works without it */ });
    return () => { live = false; };
  }, [lead]);

  const detail = useMemo(() => (lead ? leadDetail(lead) : null), [lead]);
  const [tasks, setTasks] = useState<Task[]>([]);
  /* The REAL tasks, from os_tasks. The list above is the wireframe's, still
     rendered for records that have none of their own so the tab is not empty
     on a demo lead; anything an agent actually creates lands here and comes
     back tomorrow. */
  const [realTasks, setRealTasks] = useState<TaskRow[] | null>(null);
  /**
   * ACCESS, asked at the moment it matters.
   *
   * James, 9 Sep 2026: when a viewing is booked on a home somebody lives in,
   * offer to chase the sitting tenant for access rather than leaving the
   * agent to remember. The trigger is the property record, not the key
   * register: REX's register says only that a key set exists and lives in the
   * office - measured across 1,500 sets, every location is "Office" and every
   * description is "Imported data" - so it cannot tell us access is via the
   * tenant. Who lives there can.
   */
  const [access, setAccess] = useState<
    { property: string; propertyId: string; when: string; tenants: { name: string; email: string; phone: string }[] } | null
  >(null);

  /** Live listings the agent has put on this tenant's list, as objects. */
  const [addedListings, setAddedListings] = useState<Listing[]>([]);
  const [newTask, setNewTask] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);

  const loadTasks = useCallback(() => {
    if (!lead) return;
    fetch(`/api/tasks?lead=${encodeURIComponent(lead.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setRealTasks(j.tasks as TaskRow[]); })
      .catch(() => setRealTasks([]));
  }, [lead]);
  useEffect(() => { setRealTasks(null); setNewTask(""); loadTasks(); }, [loadTasks]);

  async function addTask(title: string, detail = "", kind = "general") {
    if (!lead || !title.trim()) return;
    setTaskBusy(true);
    try {
      const j = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, detail, kind, leadId: lead.id, listingId: lead.listingId ?? null }),
      }).then((r) => r.json());
      if (j?.ok) { setRealTasks((cur) => [j.task as TaskRow, ...(cur ?? [])]); setNewTask(""); }
    } finally {
      setTaskBusy(false);
    }
  }

  async function toggleTask(t: TaskRow) {
    setRealTasks((cur) => (cur ?? []).map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: t.id, done: !t.done }),
    }).catch(() => loadTasks());
  }
  const [notes, setNotes] = useState<Note[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [contact, setContact] = useState({ phone: "", email: "", area: "" });

  /* Read only - this never mints and never sends. */
  const passportEmail = (contact.email || lead?.email || "").trim();
  useEffect(() => {
    if (!lead || !passportEmail || leadSide(lead) !== "tenant") { setPassport(null); return; }
    let live = true;
    setPassportSaid(null);
    fetch(`/api/tenant/passport/invite?email=${encodeURIComponent(passportEmail)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (live && j?.ok)
          setPassport({ sent: Boolean(j.sent), invitedAt: j.invitedAt ?? null, path: j.path ?? null, done: Boolean(j.done), summary: j.summary ?? null });
      })
      .catch(() => { /* the card just offers Send */ });
    return () => { live = false; };
  }, [lead, passportEmail]);

  /* Their enquiry in full, from REX once and then from the ledger
     (/api/leads/[id]/enquiry). undefined while it loads, null when there is
     no REX email behind the lead. */
  const [enquiry, setEnquiry] = useState<EnquiryState | null | undefined>(undefined);
  /* Keyed on the id, not the lead object: the list rebuilds that object on
     every refresh, and keying on it cancelled the read each time, so the
     card sat on "loading" for good. */
  const enquiryLeadId = lead?.id ?? null;
  useEffect(() => {
    if (!enquiryLeadId) return;
    if (ENQUIRY_CACHE.has(enquiryLeadId)) {
      setEnquiry(ENQUIRY_CACHE.get(enquiryLeadId) ?? null);
      return;
    }
    let live = true;
    setEnquiry(undefined);
    fetch(`/api/leads/${encodeURIComponent(enquiryLeadId)}/enquiry`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const got: EnquiryState | null = j?.ok ? (j.enquiry ?? null) : null;
        if (j?.ok) ENQUIRY_CACHE.set(enquiryLeadId, got);
        if (live) setEnquiry(got);
      })
      .catch(() => { if (live) setEnquiry(null); });
    return () => { live = false; };
  }, [enquiryLeadId]);

  /* The pop-outs: activity, the property finder, the more menu, removal. */
  const [activityOpen, setActivityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeMsg, setRemoveMsg] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderAddr, setFinderAddr] = useState("");
  const [finderOrigin, setFinderOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [finderLabel, setFinderLabel] = useState("");
  const [finderBusy, setFinderBusy] = useState(false);
  const [finderMsg, setFinderMsg] = useState<string | null>(null);
  useEffect(() => {
    setActivityOpen(false); setMoreOpen(false); setRemoving(false); setFinderOpen(false);
    setFinderOrigin(null); setFinderLabel(""); setFinderMsg(null);
  }, [enquiryLeadId]);

  /* What the OS holds on the lead beyond REX: the tags (saved, so the board
     can filter on them) and, on a landlord lead, the property. */
  const [prop, setProp] = useState<PropertyFactsData>(EMPTY_PROPERTY);
  useEffect(() => {
    if (!enquiryLeadId) return;
    let live = true;
    setProp(EMPTY_PROPERTY);
    fetch(`/api/leads/${encodeURIComponent(enquiryLeadId)}/facts`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j?.ok) return;
        if (Array.isArray(j.tags)) setTags(j.tags);
        if (j.property) setProp({ ...EMPTY_PROPERTY, ...j.property });
      })
      .catch(() => {});
    return () => { live = false; };
  }, [enquiryLeadId]);
  const saveFacts = (patch: { tags?: string[]; property?: PropertyFactsData }) => {
    if (!enquiryLeadId) return;
    void fetch(`/api/leads/${encodeURIComponent(enquiryLeadId)}/facts`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  };
  const changeTags = (next: string[]) => { setTags(next); saveFacts({ tags: next }); };
  const changeProp = (next: PropertyFactsData) => { setProp(next); saveFacts({ property: next }); };

  /* "Fill this page for me": the lookups, then what was certain. */
  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [nearMisses, setNearMisses] = useState<{ id: string; address: string; image: string | null }[]>([]);
  useEffect(() => { setFillNote(null); setNearMisses([]); }, [enquiryLeadId]);

  async function sendPassport(again: boolean) {
    if (!lead || passportBusy || !passportEmail) return;
    setPassportBusy(true);
    setPassportSaid(null);
    try {
      const j = await fetch("/api/tenant/passport/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: lead.name, email: passportEmail, again }),
      }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "That did not send.");
      setPassport((p) => ({ done: false, summary: null, ...(p ?? {}), sent: true, invitedAt: j.invitedAt ?? new Date().toISOString(), path: j.path ?? null }));
      setPassportSaid(j.alreadySent ? "Already sent - use Resend to send it again." : "Sent.");
    } catch (e) {
      setPassportSaid(e instanceof Error ? e.message : "That did not send.");
    } finally {
      setPassportBusy(false);
    }
  }

  /** The name, editable for people the OS owns. */
  const [personName, setPersonName] = useState("");
  /** What happened to the last edit — saved, saved-but-not-mirrored, or failed. */
  const [sync, setSync] = useState<{ busy: boolean; text: string; bad?: boolean } | null>(null);
  // Properties attached in-session, plus the tick that confirms one landed.
  const [added, setAdded] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  const [emailing, setEmailing] = useState(false);
  /* WRITING AN EMAIL IS NOT SENDING A SHORTLIST. `emailing` opens
     EmailProperties, which is a property picker and right for a tenant.
     `composing` opens a compose window, which is what a landlord needed and
     never had — every landlord email action used to open the picker. */
  const [composing, setComposing] = useState(false);
  // Where they are on their track, and the two panels a step can open.
  const [step, setStep] = useState(0);
  /* Declared here with the rest of the hooks, not down beside the markup that
     uses it: there is an early return between the two, and a hook after a
     conditional return changes the hook order between renders. */
  const [showProcess, setShowProcess] = useState(false);
  /* ── The log, and the spine folded from it ───────────────────────────────
     For a landlord the rail is DERIVED (lib/lead-spine): every call, text,
     visit and email an agent logs is a row, and the ticks are a reading of
     those rows. Nothing here is remembered in component state and lost when
     the drawer closes - which is what "log the attempt" used to do. */
  const [touches, setTouches] = useState<LeadTouch[]>([]);
  const [spine, setSpine] = useState<Spine | null>(null);
  const [logging, setLogging] = useState<LogMode | null>(null);
  const nextUpRef = useRef<HTMLElement | null>(null);
  /** The campaign the lead is on, named - what nurture actually did. */
  const [campaign, setCampaign] = useState<{ id: string; name: string; since: string; step: number } | null>(null);
  const leadId = lead?.id ?? null;
  useEffect(() => {
    if (!leadId) return;
    let gone = false;
    setTouches([]);
    setSpine(null);
    setCampaign(null);
    fetch(`/api/leads/${encodeURIComponent(leadId)}/touches`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; touches?: LeadTouch[]; spine?: Spine | null; campaign?: typeof campaign } | null) => {
        if (gone || !j?.ok) return;
        setTouches(j.touches ?? []);
        if (j.spine) setSpine(j.spine);
        setCampaign(j.campaign ?? null);
      })
      .catch(() => {
        /* No log is an empty log; the rail falls back to REX's own word. */
      });
    return () => {
      gone = true;
    };
  }, [leadId]);
  /** Every save hands the whole log back, so the screen re-reads what was saved. */
  const takeLog = (j: { touches?: LeadTouch[]; spine?: Spine | null; campaign?: typeof campaign }) => {
    if (j.touches) setTouches(j.touches);
    if (j.spine) setSpine(j.spine);
    if ("campaign" in j) setCampaign(j.campaign ?? null);
  };
  async function logTouch(body: Record<string, unknown>) {
    if (!leadId) return null;
    const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/touches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; touches?: LeadTouch[]; spine?: Spine | null } | null;
    if (j?.ok) takeLog(j);
    return j;
  }
  /* The appraisal sub-case, stored per lead in os_case_state. */
  const [appraisal, setAppraisal, appraisalSave] = useCaseState<AppraisalCase>(
    "appraisal",
    lead?.id ?? null,
    EMPTY_CASE
  );
  useEffect(() => setShowProcess(false), [lead?.id]);
  const [booking, setBooking] = useState(false);
  /* The tenant passport, sent by hand. There is an automatic send off a booked
     viewing; James, 9 Sep: an agent must also be able to send it whenever they
     like, see whether it already went, and copy the link to paste anywhere. */
  const [passport, setPassport] = useState<PassportState | null>(null);
  const [passportBusy, setPassportBusy] = useState(false);
  const [passportSaid, setPassportSaid] = useState<string | null>(null);
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

  /* ── Tell Steve what is open ──────────────────────────────────────────────

     Registered from the drawer rather than from the board, because the board
     knows which row is highlighted and the drawer knows what is actually on
     screen — and it is what is on screen that somebody means by "this lead".

     The notes go with it. They are the context nobody can reconstruct from an
     API: "wants a 2-bed, call after 6" is what the agent typed, and an email
     drafted without it is a worse email than the agent would have written. */
  useEffect(() => {
    if (!lead) return;
    return registerOpen({
      kind: "lead",
      id: lead.id,
      label: lead.name || "this lead",
      fields: [
        { label: "Email", value: contact.email || "none on file" },
        { label: "Phone", value: contact.phone || "none on file" },
        { label: "Area", value: contact.area || "not set" },
        { label: "Source", value: lead.source ?? "unknown" },
        { label: "Tags", value: tags.join(", ") || "none" },
      ],
      notes: notes.map((n) => `${n.author}: ${n.text}`),
    });
  }, [lead, contact.email, contact.phone, contact.area, tags, notes]);

  useEffect(() => {
    if (!detail) return;
    setTasks(detail.tasks);
    setNotes(detail.notes);
    setDocs(detail.docs);
    /* A lead with no area carries "—" as a value; it is not a tag. */
    setTags(detail.tags.filter((t) => t && t.trim() !== "—"));
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
  /* A landlord's rail reads from the log, not from REX's three words. */
  useEffect(() => {
    if (lead && spine && leadSide(lead) === "landlord") setStep(spine.stepIndex);
  }, [lead, spine]);

  useEffect(() => {
    if (!lead) return;
    setContact({ phone: lead.phone, email: lead.email, area: lead.preferred });
    setPersonName(lead.name);
    setSync(null);
  }, [lead]);

  /* ── Saving an edit, for people the OS owns ───────────────────────────────
     These fields have always been editable and have never been saved: the
     values lived in component state and died when the drawer closed. That is
     fine for a REX lead, which the OS cannot write to anyway, and wrong for
     somebody added here.
     So for an `os-` record every commit is persisted and mirrored into REX.
     `ours` is the gate: a REX lead keeps the old behaviour rather than
     pretending to save into a system it has no write path to. */
  const ours = lead ? isOsLead(lead.id) : false;

  async function saveField(patch: Record<string, string>) {
    if (!lead || !ours) return;
    setSync({ busy: true, text: "Saving…" });
    try {
      const r = await fetch(`/api/contacts/${osContactIdFrom(lead.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await r.json()) as { error?: string; sync?: { ok?: boolean; detail?: string } };
      if (!r.ok) {
        setSync({ busy: false, text: j.error ?? "That didn't save.", bad: true });
        return;
      }
      /* Saved here is the fact that matters; the mirror is reported after it,
         and a mirror that failed must not read as a failed save. */
      setSync(
        j.sync?.ok
          ? { busy: false, text: "Saved" }
          : { busy: false, text: `Saved here. ${j.sync?.detail ?? "Not backed up."}`, bad: true }
      );
    } catch {
      setSync({ busy: false, text: "That didn't save — the connection dropped.", bad: true });
    }
  }

  // Mount, then flip to shown on the next frame — a transform that starts and
  // ends in the same paint doesn't animate.
  useEffect(() => {
    if (!lead) {
      setShown(false);
      return;
    }
    /* Two frames, not one: the first commit and the flip can land in the
       same paint, and then the sheet pops instead of sliding. */
    let id2 = 0;
    const id = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
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
  /* A tenant's list is built from the LIVE book by the search below, so the
     objects come back with the click rather than being looked up in a sample
     file whose ids do not match (which silently emptied the list). Anyone
     else still reads the demo book, which is all they have. */
  const shortlist = isTenant
    ? addedListings
    : LISTINGS.filter((l) => detail.interested.includes(l.id) || added.includes(l.id));

  const track = trackFor(lead);

  /**
   * Move the record to a named step — forwards only.
   *
   * Once a stage is released it does not come back, so a file stops flicking
   * between the same two steps and the rail means something. The one carve-out
   * James named is a viewing being HELD: while one is still to happen you can
   * return to it, because rebooking is a real thing that happens and it is not
   * the same as going backwards through the process.
   */
  const advanceTo = (id: string) => {
    const to = track.findIndex((s) => s.id === id);
    if (to < 0) return;
    const canRevisit = id === "viewing";
    setStep((from) => (to > from || canRevisit ? to : from));
  };
  const stalled = isStalled(lead);
  const here = track[Math.min(step, track.length - 1)];
  const finished = step >= track.length - 1;
  /* The landlord spine, when the log has answered. `sp` is null for a tenant
     and while the log is still loading, and every derived behaviour hangs off
     it being present - so a slow answer costs nothing but a moment of the old
     rail. */
  const sp = !isTenant ? spine : null;
  const nurturing = sp?.nurture ?? null;
  const canNurture = Boolean(sp && !sp.booked && sp.attempts >= 1 && !nurturing);

  /* At the appraisal step the appraisal itself takes the screen — the lead's
     timeline and the notes step aside for it. An escape hatch rather than a
     one-way door: "show the whole process" brings the timeline back. */
  const appraisalTakesOver = !isTenant && here.id === "appraisal" && !stalled && !showProcess;
  /* The visit is the one step that's a FORM — rent, rooms, dates, condition,
     documents. In a 68%-wide drawer that's a column of one-word fields, so
     the drawer takes more of the screen for exactly that step and gives it
     back afterwards. */
  const wide = appraisalTakesOver && appraisal.state === "visit";

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
    else if (here.action === "send") {
      /* The shortlist step belongs to a tenant and IS the picker. Anyone else
         reaching a "send" step wants to write something. */
      if (isTenant) setEmailing(true);
      else setComposing(true);
    }
    else if (here.action === "handoff") setHandingOff(true);
    else if (here.action === "log") setLogging("attempt");
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

  async function addNote() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    /* Written to the log, so it is still there tomorrow and on somebody
       else's screen. Only if the log cannot take it does it stay local. */
    const j = await logTouch({ kind: "note", body: text }).catch(() => null);
    if (!j?.ok) {
      setNotes((n) => [{ id: `n${Date.now()}`, author: "You", when: "Just now", text }, ...n]);
    }
  }
  const noteRows: Note[] = [
    ...touches
      .filter((t) => t.kind === "note")
      .map((t) => ({ id: `touch-${t.id}`, author: t.byName, when: whenAgo(t.at), text: t.body })),
    ...notes,
  ];

  /* The tags, shared by the tenant and landlord layouts. */
  const tagsRow = (
    <>
                {/* Tags — the quick facts, addable, at the foot of the box. */}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
                  {tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => changeTags(tags.filter((x) => x !== t))}
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
                            onClick={() => { changeTags([...tags, t]); setTagging(false); }}
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
                            if (t?.trim() && !tags.includes(t.trim())) changeTags([...tags, t.trim()]);
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
  );

  /* The quick actions a tenant lead needs, each one the real thing. */
  /* REX's own 100-character preview stands in only until the full read
     lands, and only when it is words - some portals' previews are just
     their labelled lines ("Email Address: ... Phone Default: ..."). */
  const previewOk = Boolean(lead.enquiryMessage && !/^[A-Z][A-Za-z ]{1,30}:/.test(lead.enquiryMessage));
  const enqMessage = enquiry?.message || (enquiry === undefined && previewOk ? lead.enquiryMessage ?? "" : "");
  const receivedIso = enquiry?.receivedAt ?? lead.receivedAt ?? null;
  const enqProperty = lead.address || enquiry?.fields.find(([k]) => /property address|listing address/i.test(k))?.[1] || lead.preferred;
  const real = (v?: string | null) => (v && v.trim() !== "—" ? v.trim() : "");
  const quick: { label: string; sub: string; icon: string; go: () => void; off?: boolean; href?: string }[] = [
    { label: "Find properties", sub: "On a map, by radius", icon: "search", go: () => { setFinderAddr(real(contact.area) || real(enqProperty)); setFinderOpen(true); } },
    passport?.done && passport.path
      ? { label: "Passport done", sub: "See their answers", icon: "user", href: passport.path, go: () => {} }
      : { label: passport?.sent ? "Resend passport" : "Send passport", sub: passportEmail ? (passportBusy ? "Sending…" : passportSaid ?? "Ask for their details") : "No email on this lead", icon: "user", off: !passportEmail || passportBusy, go: () => void sendPassport(Boolean(passport?.sent)) },
    { label: "Add a note", sub: "Log a conversation", icon: "note", go: () => { const el = document.getElementById("lead-note"); el?.scrollIntoView({ behavior: "smooth", block: "center" }); (el as HTMLTextAreaElement | null)?.focus(); } },
    { label: "View activity", sub: "Everything so far", icon: "list", go: () => setActivityOpen(true) },
  ];

  /* The address to look the property up by, on a landlord lead. */
  const enqField = (re: RegExp) => enquiry?.fields.find(([k]) => re.test(k))?.[1] ?? "";
  const propAddress = real(prop.address) || real(contact.area) || real(lead.preferred) || real(lead.address) || real(enqField(/^(property )?address$/i));
  /* What the portal said about the property, shown when there is no message
     and used by the fill: GetAgent sends Address, Bedrooms, Estimated value. */
  const enqFacts = (enquiry?.fields ?? []).filter(([k]) => /address|bedroom|estimated|fee|requirement|price|budget|move/i.test(k) && !/email|phone|listinglink|listing id/i.test(k));
  async function fillPage() {
    if (filling) return;
    if (!propAddress) { setFillNote("Put the property's address on the lead first, then try again."); return; }
    setFilling(true);
    setFillNote(null);
    try {
      const j = await fetch(`/api/leads/${encodeURIComponent(lead!.id)}/prefill`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: propAddress }),
      }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "The lookups did not answer.");
      const found = j.property as PropertyFactsData;
      /* Bedrooms: the landlord's own figure (the enquiry) beats the register's -
         they know their house - and a disagreement is said, not hidden. */
      const enqBeds = Number(enqField(/^bedrooms?$/i)) || null;
      const bedsNote = enqBeds && found.beds != null && found.beds !== enqBeds ? ` The landlord said ${enqBeds} bedrooms; the property register has ${found.beds}, so ${enqBeds} is used.` : "";
      /* What the lookups are sure of wins; what only the agent knows stays. */
      const next: PropertyFactsData = {
        ...prop, ...found,
        type: found.type || prop.type,
        beds: enqBeds ?? found.beds ?? prop.beds,
        baths: prop.baths, receptions: prop.receptions,
        image: found.image ?? prop.image, rexPropertyId: found.rexPropertyId ?? prop.rexPropertyId,
        matched: found.matched === "rex" ? "rex" : prop.matched === "rex" ? "rex" : found.matched,
      };
      changeProp(next);
      setNearMisses(j.nearMisses ?? []);
      const filled: string[] = j.filled ?? [], missing: string[] = j.missing ?? [];
      setFillNote(`${filled.length ? `Filled in ${filled.join(", ")}.` : "Nothing new found."}${missing.length ? ` Could not find ${missing.join("; ")}.` : ""}${bedsNote}`);
      if (next.address && next.address !== contact.area) {
        setContact((c) => ({ ...c, area: next.address! }));
        void saveField({ address: next.address, ...(next.postcode ? { postcode: next.postcode } : {}) });
      }
    } catch (e) {
      setFillNote(e instanceof Error ? e.message : "The lookups did not answer just now.");
    } finally {
      setFilling(false);
    }
  }
  const pickRex = (h: { id: string; address: string; image: string | null }) => {
    changeProp({ ...prop, rexPropertyId: h.id, address: h.address, image: h.image ?? prop.image, matched: "rex" });
    setNearMisses([]);
    setFillNote(`Matched to ${h.address} in REX.`);
  };

  /* A full address is one with a postcode: that is what the lookups need. */
  const hasFullAddress = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(propAddress);

  /* The rail and the next action, drawn once and placed where each layout
     wants them: the tenant's process box, the landlord's Next up card. */
  /* What each step on the rail actually holds, for the hover (11 Sep 2026). */
  const oldestFirst = [...touches].sort((a, b) => a.at.localeCompare(b.at));
  const attemptsLogged = oldestFirst.filter((t) => ATTEMPT_KINDS.includes(t.kind));
  const emailsLogged = oldestFirst.filter((t) => t.kind === "email");
  const say = (t: LeadTouch | undefined) => (t ? `${touchSentence(t)}${t.body ? ` - ${t.body}` : ""} · ${t.byName}, ${whenAgo(t.at)}` : null);
  const stepHints: Record<string, string | null> = {
    lead: `Came in ${receivedIso ? whenFull(receivedIso) ?? "" : lead.received} via ${enquiry?.source || lead.source}`,
    contacted: say(attemptsLogged[0]) ?? "No contact logged yet",
    email: say(emailsLogged[0]) ?? "No email logged yet",
    contact2: say(attemptsLogged[1]) ?? "No second contact yet",
    contact3: say(attemptsLogged[2]) ?? "No third contact yet",
    appraisal_booked: sp?.booked ? "Appraisal booked" : "Not booked yet",
  };
  const timelineEl = (
    <ProcessTimeline
              hints={!isTenant ? track.map((t) => stepHints[t.id] ?? null) : undefined}
              steps={track}
              current={step}
              stalled={stalled}
              onPick={setStep}
              doneAt={sp ? (i) => Boolean(sp.done[track[i].id as SpineId]) : undefined}
              pickAny={Boolean(sp)}
              branch={
                !isTenant
                  ? {
                      label: nurturing ? "In nurture" : NURTURE_BRANCH.label,
                      from: 1,
                      to: 4,
                      active: Boolean(nurturing),
                      available: canNurture,
                      hint: nurturing
                        ? "Press to put them back on the spine"
                        : canNurture
                          ? NURTURE_BRANCH.detail
                          : sp?.booked
                            ? "Booked - nothing to nurture"
                            : "Log an attempt first; nurture is for a lead that has stopped answering",
                      onClick: () => {
                        if (nurturing) void logTouch({ kind: "rejoin" });
                        else setLogging("nurture");
                      },
                    }
                  : undefined
              }
            />
  );
  /* On a landlord's contact step the log lives in the Next up card itself. */
  const logInline = !isTenant && here.action === "log" && !stalled && !nurturing && !sp?.booked;
  const nextActionEl = (
    <>

              <div className="min-w-[240px] max-w-xl flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Next action
                </p>
                {stalled ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    Not proceeding — {lead.name.split(" ")[0]} stopped at &ldquo;{here.label}
                    &rdquo;. Pick a step on the rail to restart them.
                  </p>
                ) : nurturing ? (
                  <>
                    <p className="hand mt-1.5 text-[17px] leading-snug">In nurture</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                      Since {whenAgo(nurturing.at)} - {nurturing.reason}. Added by {nurturing.byName}. Log a call
                      they answered or a reply and they come straight back on the spine, at {here.label.toLowerCase()}.
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-[11.5px] font-medium text-accent-dark">
                      <DoodleIcon name="mail" size={13} />
                      {campaign
                        ? `On ${campaign.name}${campaign.step > 0 ? ` - step ${campaign.step} sent` : " - first step to come"}`
                        : "No campaign fits that reason yet - marketing can write one on the Marketing screen."}
                    </p>
                  </>
                ) : sp?.booked ? (
                  <>
                    <p className="hand mt-1.5 text-[17px] leading-snug">Appraisal booked</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                      The lead&apos;s work is done here. Everything from the visit onwards happens on Market
                      Appraisals - the confirmation, the deck, the valuation and the terms.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="hand mt-1.5 text-[17px] leading-snug">{here.title}</p>
                    {/* The landlord card says the step and nothing under it (James, 11 Sep
                        2026: no subtext, no "due tomorrow" - nobody set a reminder). */}
                    {isTenant && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{here.detail}</p>}
                    {isTenant && detail.nextAction && (
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
              ) : !stalled && sp?.booked ? (
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Link
                    href={handoverTarget(`lead-${lead.id}`)}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[13px] font-semibold text-page"
                  >
                    <DoodleIcon name="calendar" size={15} />
                    Open on Market Appraisals
                  </Link>
                </div>
              ) : !stalled && nurturing ? (
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <PressButton
                    onClick={() => void logTouch({ kind: "rejoin" })}
                    className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[13px] font-semibold text-page"
                  >
                    <DoodleIcon name="target" size={15} />
                    Back on the spine
                  </PressButton>
                  <button
                    type="button"
                    onClick={() => setLogging("attempt")}
                    className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    Log an attempt
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
                  {here.action !== "none" && !finished && !sp && (
                    <button
                      type="button"
                      onClick={advance}
                      className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Already done — move on
                    </button>
                  )}
                  {/* The derived spine has no "move on": the log moves it. What
                      it offers instead is the honest shortcut for each step. */}
                  {sp && here.id === "email" && (
                    <button
                      type="button"
                      onClick={() => void logTouch({ kind: "email", outcome: "sent", body: "Sent from my own mailbox" })}
                      className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Sent it from Outlook — log it
                    </button>
                  )}
                  {sp && here.id !== "lead" && here.id !== "appraisal_booked" && here.action !== "log" && (
                    <button
                      type="button"
                      onClick={() => setLogging("attempt")}
                      className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Log an attempt
                    </button>
                  )}
                  {sp && !sp.booked && here.id !== "appraisal_booked" && (
                    <button
                      type="button"
                      onClick={() => { setBookMode("appraisal"); setBooking(true); }}
                      className="text-[11px] font-semibold text-accent-dark transition-colors hover:text-ink"
                    >
                      They said yes — book the appraisal
                    </button>
                  )}
                  {finished && !sp && (
                    <p className="text-[11px] text-muted">
                      Last step on the {isTenant ? "tenant" : "landlord"} track.
                    </p>
                  )}
                </div>
              )}
    </>
  );

  /* The side questions - tasks, documents, properties - in a pop-out. */
  const tabPanel = (
<div>
                {tab === "tasks" && (
                  <>
                    {/* Real tasks, kept. Anything typed here is still here
                        tomorrow, which the wireframe's were not. */}
                    <form
                      onSubmit={(e) => { e.preventDefault(); void addTask(newTask); }}
                      className="mb-4 flex max-w-xl gap-2"
                    >
                      <input
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        placeholder="Add a task…"
                        className="min-w-0 flex-1 rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                      />
                      <button
                        type="submit"
                        disabled={taskBusy || !newTask.trim()}
                        className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-40"
                      >
                        Add
                      </button>
                    </form>
                    {realTasks && realTasks.length > 0 && (
                      <ul className="mb-4 max-w-xl space-y-2.5">
                        {realTasks.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => void toggleTask(t)}
                              className="flex w-full items-start gap-2.5 text-left"
                            >
                              <span
                                className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] transition-colors ${
                                  t.done ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line"
                                }`}
                              >
                                {t.done && "✓"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block text-[12.5px] ${t.done ? "text-muted line-through opacity-60" : ""}`}>
                                  {t.title}
                                </span>
                                {t.detail && <span className="block text-[10.5px] text-muted">{t.detail}</span>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                    {/* A tenant gets the LIVE book, filtered - not a
                        shortlist somebody guessed at. James, 9 Sep 2026:
                        "we don't know if they're going to be interested in
                        them yet". Shortlisting is still here, as something
                        you do from a result, and sending the list is what
                        the shortlist is FOR. */}
                    {isTenant ? (
                      <>
                        {shortlist.length > 0 && (
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 px-3 py-2.5">
                            <span className="text-[12px]">
                              <span className="font-semibold">{shortlist.length}</span> on the list for {lead.name.split(" ")[0]}
                            </span>
                            <PressButton
                              onClick={() => setEmailing(true)}
                              className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-1.5 text-[11.5px] font-semibold text-page"
                            >
                              <DoodleIcon name="mail" size={13} />
                              Email properties
                            </PressButton>
                          </div>
                        )}
                        <TenantPropertySearch
                          origin={lead.lat != null && lead.lng != null ? { lat: lead.lat, lng: lead.lng } : null}
                          originLabel={contact.area || lead.area || ""}
                          originListingId={lead.listingId != null ? String(lead.listingId) : null}
                          shortlisted={shortlist.map((p) => p.id)}
                          onShortlist={(l) => {
                            setAddedListings((cur) => (cur.some((x) => x.id === l.id) ? cur : [...cur, l as unknown as Listing]));
                            setAdded((cur) => (cur.includes(l.id) ? cur : [...cur, l.id]));
                            setJustAdded(true);
                          }}
                          onBook={() => { setBookMode("viewing"); setBooking(true); }}
                        />
                      </>
                    ) : shortlist.length ? (
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
                      <Empty>Nothing attached to this record yet.</Empty>
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
                            {
                              label: isTenant ? "Send details" : "Write an email",
                              icon: "mail",
                              go: () => (isTenant ? setEmailing(true) : setComposing(true)),
                            },
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
  );

  /* Everything that has happened with this person, for the pop-out. */
  const activityPanel = (
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
                      {touches.map((t) => (
                        <li key={t.id} className="flex items-start gap-3 border-b border-line/40 pb-4 last:border-0 last:pb-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60">
                            <DoodleIcon name={touchIcon(t)} size={15} className="text-accent-dark" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px]">
                              {touchSentence(t)}
                              {t.kind !== "nurture" && t.body ? <span className="text-muted"> — {t.body}</span> : null}
                            </span>
                            <span className="block text-[10.5px] text-muted">
                              {t.byName} · {whenAgo(t.at)}
                            </span>
                          </span>
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
  );

  async function removeLead() {
    if (removeBusy) return;
    setRemoveBusy(true);
    setRemoveMsg(null);
    try {
      const j = await fetch(`/api/leads/${encodeURIComponent(lead!.id)}/hide`, { method: "POST" }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "That did not save.");
      window.dispatchEvent(new CustomEvent("lead-removed", { detail: lead!.id }));
      setRemoving(false);
      onClose();
    } catch (e) {
      setRemoveMsg(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setRemoveBusy(false);
    }
  }

  async function centreFinder() {
    const addr = finderAddr.trim();
    if (!addr || finderBusy) return;
    setFinderBusy(true);
    setFinderMsg(null);
    try {
      const j = await fetch(`/api/address?geocode=${encodeURIComponent(addr)}`, { cache: "no-store" }).then((r) => r.json());
      if (j?.lat != null && j?.lng != null) {
        setFinderOrigin({ lat: j.lat, lng: j.lng });
        setFinderLabel(j.address || addr);
      } else {
        setFinderMsg(j?.problem?.says ?? "We could not place that address. Try a postcode.");
      }
    } catch {
      setFinderMsg("We could not place that address just now.");
    } finally {
      setFinderBusy(false);
    }
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
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-[transform,width] duration-[420ms] ${
          wide ? "lg:w-[calc(100%-9rem)]" : "lg:w-[calc(100%-17rem)]"
        } ${
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
                t.key === "tasks"
                  ? tasks.filter((x) => !x.done).length + (realTasks ?? []).filter((x) => !x.done).length
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
              onClick={() => setActivityOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:text-ink md:flex"
            >
              <DoodleIcon name="list" size={13} />
              View activity
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
                title="More"
              >
                ⋯
              </button>
              {moreOpen && (
                <div className="fade-up absolute right-0 top-full z-30 mt-2 w-60 rounded-2xl border border-line/80 bg-card p-1.5 shadow-[0_18px_40px_-16px_rgba(16,16,20,0.35)]">
                  <button
                    type="button"
                    onClick={() => { setMoreOpen(false); setActivityOpen(true); }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-page"
                  >
                    View activity
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      void navigator.clipboard?.writeText(`${window.location.origin}/leads?open=${encodeURIComponent(lead.id)}`);
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-page"
                  >
                    Copy a link to this lead
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMoreOpen(false); setRemoveMsg(null); setRemoving(true); }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold text-accent-dark transition-colors hover:bg-page"
                  >
                    Remove this lead…
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrolls itself, and the scroll stops here (11 Sep 2026): it was
            overflow-hidden, so a tenant enquiry taller than the window could
            not be read to the bottom and the wheel scrolled the page behind. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-4 pt-4">
          {/* ── The person. One box: who they are, how to reach them, the
              property they rang about, and its photo — with tags at the foot,
              because tags describe the person, not the process. No avatar:
              nobody uploads headshots of applicants, and a circle of initials
              is a photo-shaped apology. ── */}
          <div className="relative">
            {isTenant ? (
              /* THE TENANT LEAD, round two (James, 11 Sep 2026, after the new
                 market appraisal page): a pink banner with who they are and
                 what they asked, the picture and the two things you do most;
                 then who they are, the property, and the state of play. */
              <div className="space-y-4">
                {/* The hero, laid out like the landlord's: who they are and what they
                    asked on the left, At a glance on the right, James's house sunk into
                    the background and cut off by the bottom edge (11 Sep 2026). */}
                <header className="relative overflow-hidden rounded-[22px] border border-line/50 bg-sage/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/art/lead-house.webp"
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute bottom-[-56px] right-[250px] hidden w-[560px] max-w-none opacity-[0.6] xl:block"
                  />
                  <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_200px_300px]">
                    <div className="min-w-0 pb-1">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Tenant enquiry · step {Math.min(step, track.length - 1) + 1} of {track.length}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {ours ? (
                          <h2 className="min-w-0 hand text-[32px] leading-[1.1]">
                            <InlineField
                              value={personName}
                              onChange={(v) => {
                                const next = v.trim();
                                if (!next || next === personName) return;
                                setPersonName(next);
                                void saveField({ name: next });
                              }}
                              className="hand text-[32px] leading-[1.1]"
                            />
                          </h2>
                        ) : (
                          <h2 className="hand text-[32px] leading-[1.1]">{lead.name}</h2>
                        )}
                        <Pill tone={STAGE_TONE[lead.stage]}>{lead.stage}</Pill>
                        {passport?.done && passport.path && (
                          <a href={passport.path} target="_blank" rel="noreferrer" className="rounded-full bg-sage/40 px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80" title="Open their passport">
                            ✓ Passport done
                          </a>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13.5px] text-muted">
                        {enqProperty && enqProperty !== "—" ? enqProperty : "General enquiry"} · via {enquiry?.source || lead.source}
                        {receivedIso ? ` · ${whenAgo(receivedIso)}` : ""}
                      </p>
                      {/* Their own words - the first thing anyone should read. */}
                      <div className="mt-4 max-w-xl rounded-2xl border border-line/40 bg-white p-4">
                        <p className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
                          <span className="flex items-center gap-1.5 font-semibold text-ink">
                            <DoodleIcon name="message" size={13} className="text-accent-dark" />
                            Their enquiry
                          </span>
                          {receivedIso && <span>{whenFull(receivedIso)} · {whenAgo(receivedIso)}</span>}
                        </p>
                        {enquiry === undefined && !enqMessage ? (
                          <p className="mt-2 text-[12.5px] text-muted">Reading their enquiry from REX…</p>
                        ) : enqMessage ? (
                          <p className="mt-2 max-h-[110px] overflow-y-auto whitespace-pre-line pr-1 text-[14.5px] leading-relaxed">{enqMessage}</p>
                        ) : enqFacts.length ? (
                          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                            {enqFacts.map(([k, v]) => (
                              <div key={k} className="min-w-0">
                                <dt className="text-[10.5px] text-muted">{k}</dt>
                                <dd className="truncate font-semibold">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="mt-2 text-[12.5px] text-muted">They sent no message with this enquiry.</p>
                        )}
                        <p className="mt-2 text-[11px] text-muted">
                          Via {enquiry?.source || lead.source}
                          {enquiry === undefined && enqMessage ? " · loading the full message…" : ""}
                        </p>
                      </div>
                                            <div className="mt-5 flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => { setBookMode("viewing"); setBooking(true); advanceTo("viewing"); }}
                          className="inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page transition-opacity hover:opacity-90"
                        >
                          <DoodleIcon name="calendar" size={14} />
                          Book a viewing
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEmailing(true); advanceTo("shortlist"); }}
                          className="inline-flex items-center gap-2 rounded-full border border-line/80 bg-white px-5 py-2.5 text-[13px] font-semibold transition-colors hover:border-ink/40"
                        >
                          <DoodleIcon name="mail" size={14} />
                          Send properties
                        </button>
                      </div>
                      <div className="mt-4 [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0 [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[11px]">{tagsRow}</div>
                    </div>

                    {/* Breathing room over the house, from xl up. */}
                    <div className="hidden xl:block" />

                    <aside className="rounded-2xl border border-line/40 bg-white p-5">
                      <p className="hand flex items-center gap-2 text-[15px]">
                        <DoodleIcon name="magic-wand" size={15} className="text-accent-dark" />
                        At a glance
                      </p>
                      <ul className="mt-4 space-y-3.5">
                        <Glance icon="target" title={receivedIso ? `Came in ${whenAgo(receivedIso)}` : `Came in ${lead.received}`} sub={`${receivedIso ? `${whenFull(receivedIso)} · ` : ""}via ${enquiry?.source || lead.source}`} />
                        <Glance
                          icon="home"
                          title={enqProperty && enqProperty !== "—" ? "Asked about one property" : "A general enquiry"}
                          sub={enqProperty && enqProperty !== "—" ? enqProperty : "Not about one property - match them to the book"}
                        />
                        <Glance
                          icon="doc"
                          title={passport?.done ? "Passport done" : passport?.sent ? "Passport sent, not finished" : "Passport not sent"}
                          sub={passport?.done ? "Their details are filled in below" : passportEmail ? "One click on the tiles below" : "No email to send it to yet"}
                        />
                        <Glance
                          icon="calendar"
                          title={viewings.length ? `${viewings.length} viewing${viewings.length === 1 ? "" : "s"} booked` : "No viewing yet"}
                          sub={track[Math.min(step, track.length - 1)]?.label ?? "Enquiry"}
                        />
                      </ul>
                    </aside>
                  </div>
                </header>

                <div className="grid gap-4 xl:grid-cols-3">
                  {/* Who they are - editable, and filled in by the passport once it is done. */}
                  <section className="rounded-2xl border border-line/60 bg-card p-5">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle icon="user">The tenant</CardTitle>
                      {passport?.done && <span className="rounded-full bg-sage/30 px-2 py-0.5 text-[10.5px] font-semibold">From their passport</span>}
                    </div>
                    <div className="mt-2 divide-y divide-line/50">
                      <DetailRow icon="call" label="mobile" value={contact.phone} copyable onChange={(v) => { setContact((c) => ({ ...c, phone: v })); void saveField({ mobile: v }); }} />
                      <DetailRow icon="mail" label="email" value={contact.email} copyable onChange={(v) => { setContact((c) => ({ ...c, email: v })); void saveField({ email: v }); }} />
                      <DetailRow
                        icon="home"
                        label="area"
                        value={contact.area}
                        copyable
                        address
                        onChange={(v) => {
                          setContact((c) => ({ ...c, area: v }));
                          const pc = v.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];
                          void saveField({ address: v, ...(pc ? { postcode: pc.toUpperCase() } : {}) });
                        }}
                      />
                    </div>
                    {passport?.done && passport.summary && (
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/50 pt-3 text-[12px]">
                        {([
                          ["Household income", passport.summary.householdIncome != null ? `£${passport.summary.householdIncome.toLocaleString("en-GB")} a year` : null],
                          ["Works", passport.summary.applicantType],
                          ["Moving in", [passport.summary.adults && `${passport.summary.adults} adult${passport.summary.adults === "1" ? "" : "s"}`, passport.summary.children && passport.summary.children !== "0" && `${passport.summary.children} children`].filter(Boolean).join(", ") || null],
                          ["Pets", passport.summary.pets],
                          ["Guarantor", passport.summary.guarantor],
                          ["Right to rent", passport.summary.rightToRent],
                        ] as Array<[string, string | null]>)
                          .filter(([, v]) => v)
                          .map(([k, v]) => (
                            <div key={k} className="min-w-0">
                              <dt className="text-[10.5px] text-muted">{k}</dt>
                              <dd className="truncate font-semibold">{v}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                  </section>

                  {/* The property they asked about. */}
                  <section className="rounded-2xl border border-line/60 bg-card p-5">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle icon="home">The property</CardTitle>
                      {lead.listingId != null && (
                        <Link href={`/listings?open=${lead.listingId}`} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink/40">
                          View
                        </Link>
                      )}
                    </div>
                    {enqProperty && enqProperty !== "—" ? (
                      <div className="mt-3 flex gap-3">
                        <PropertyPhoto src={lead.photo ?? null} className="h-[84px] w-[112px] shrink-0 rounded-xl" />
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold leading-snug">{enqProperty}</p>
                          {lead.office && <p className="mt-1 text-[11.5px] text-muted">{lead.office}</p>}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-[12.5px] text-muted">A general enquiry - not about one property.</p>
                    )}
                  </section>

                  {/* Next up: the process's own next action, on sage, like the landlord's. */}
                  <section className="rounded-2xl bg-sage/25 p-5">
                    <CardTitle icon={here.icon}>Next up</CardTitle>
                    <div className="mt-3 flex flex-col gap-4 [&>div:first-child>p:first-child]:hidden [&>div:first-child>p.hand]:mt-0 [&>div:last-child]:items-start">{nextActionEl}</div>
                  </section>
                </div>

                {/* The rest of what you do to a tenant lead, one click each. */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {quick.map((a) => {
                    const cls = `flex items-center gap-3 rounded-2xl border border-line/70 bg-card px-4 py-3.5 text-left transition-colors hover:border-ink/40 ${a.off ? "pointer-events-none opacity-50" : ""}`;
                    const inner = (
                      <>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
                          <DoodleIcon name={a.icon} size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold leading-tight">{a.label}</span>
                          <span className="block truncate text-[11.5px] text-muted">{a.sub}</span>
                        </span>
                      </>
                    );
                    return a.href ? (
                      <a key={a.label} href={a.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
                    ) : (
                      <button key={a.label} type="button" onClick={a.go} className={cls}>{inner}</button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* THE LANDLORD LEAD, laid out like the market appraisal file
                 (James, 11 Sep 2026): a sage hero with At a glance in it and
                 the picture standing off the bottom edge; the landlord, the
                 property and Next up in a row; then where it's up to. */
              <div className="space-y-5">
                <header className="relative overflow-hidden rounded-[22px] border border-line/50 bg-sage/30">
                  {/* The block of flats, sunk into the background behind the words and
                      cut off by the card's bottom edge (James, 11 Sep 2026: "just there
                      in the background, filling some of the space"). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/art/lead-building.webp"
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute bottom-[-64px] right-[300px] hidden w-[520px] max-w-none opacity-[0.55] xl:block"
                  />
                  <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_240px_300px]">
                    <div className="min-w-0 pb-1">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Landlord enquiry · step {Math.min(step, track.length - 1) + 1} of {track.length}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {ours ? (
                          <h2 className="hand min-w-0 text-[32px] leading-[1.1]">
                            <InlineField
                              value={personName}
                              onChange={(v) => {
                                const next = v.trim();
                                if (!next || next === personName) return;
                                setPersonName(next);
                                void saveField({ name: next });
                              }}
                              className="text-[32px] leading-[1.1]"
                            />
                          </h2>
                        ) : (
                          <h2 className="hand text-[32px] leading-[1.1]">{lead.name}</h2>
                        )}
                        {sp?.label ? (
                          <Pill tone={sp.booked ? "good" : sp.nurture ? "neutral" : "accent"}>{sp.label}</Pill>
                        ) : (
                          <Pill tone={STAGE_TONE[lead.stage]}>{lead.stage}</Pill>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] text-muted">
                        {propAddress || "No property address yet"} · via {enquiry?.source || lead.source}
                        {receivedIso ? ` · ${whenAgo(receivedIso)}` : ""}
                      </p>
                      <p className="mt-4 max-w-xl text-[13px] leading-relaxed">
                        {enqMessage
                          ? enqMessage.length > 220 ? `${enqMessage.slice(0, 217)}…` : enqMessage
                          : enqFacts.length
                            ? `${enquiry?.source || lead.source} says: ${enqFacts.filter(([k]) => !/address/i.test(k)).map(([k, v]) => (/bedroom/i.test(k) ? v : `${k.toLowerCase()} ${v}`)).join(" · ")}`
                            : enquiry === undefined
                              ? "Reading their enquiry from REX…"
                              : "Nothing written with the enquiry."}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => { setBookMode("appraisal"); setBooking(true); }}
                          className="inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page transition-opacity hover:opacity-90"
                        >
                          <DoodleIcon name="calendar" size={14} />
                          Book an appraisal
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogging("nurture")}
                          disabled={Boolean(nurturing) || Boolean(sp?.booked)}
                          className="inline-flex items-center gap-2 rounded-full border border-line/80 bg-white px-5 py-2.5 text-[13px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
                        >
                          <DoodleIcon name="clock" size={14} />
                          {nurturing ? "In nurture" : "Send to nurture"}
                        </button>
                      </div>
                      <div className="mt-4 [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0 [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[11px]">{tagsRow}</div>
                    </div>

                    {/* Breathing room over the building, from xl up. */}
                    <div className="hidden xl:block" />

                    <aside className="rounded-2xl border border-line/40 bg-white p-5">
                      <p className="hand flex items-center gap-2 text-[15px]">
                        <DoodleIcon name="magic-wand" size={15} className="text-accent-dark" />
                        At a glance
                      </p>
                      <ul className="mt-4 space-y-3.5">
                        <Glance icon="target" title={receivedIso ? `Came in ${whenAgo(receivedIso)}` : `Came in ${lead.received}`} sub={`${receivedIso ? `${whenFull(receivedIso)} · ` : ""}via ${enquiry?.source || lead.source}`} />
                        <Glance
                          icon="home"
                          title={!propAddress ? "No property address yet" : prop.matched === "rex" ? "Property matched in REX" : prop.matched === "pin" ? "Property pinned on the map" : "Property not looked up yet"}
                          sub={propAddress || "Add one and Find with AI does the rest"}
                        />
                        <Glance
                          icon="calendar"
                          title={sp?.booked ? "Appraisal booked" : nurturing ? "In nurture" : here.title}
                          sub={sp?.booked ? "Carry on in Market Appraisals" : nurturing ? nurturing.reason : `${sp?.attempts ?? 0} contact attempt${(sp?.attempts ?? 0) === 1 ? "" : "s"} logged`}
                        />
                      </ul>
                    </aside>
                  </div>
                </header>

                <div className="grid gap-5 lg:grid-cols-3">
                  <section className="flex flex-col rounded-2xl border border-line/60 bg-card p-5">
                    <CardTitle icon="user">The landlord</CardTitle>
                    <div className="mt-3 divide-y divide-line/50">
                      <DetailRow icon="call" label="mobile" value={contact.phone} copyable onChange={(v) => { setContact((c) => ({ ...c, phone: v })); void saveField({ mobile: v }); }} />
                      <DetailRow icon="mail" label="email" value={contact.email} copyable onChange={(v) => { setContact((c) => ({ ...c, email: v })); void saveField({ email: v }); }} />
                      <DetailRow
                        icon="home"
                        label="address"
                        value={real(contact.area) || propAddress}
                        copyable
                        address
                        onChange={(v) => {
                          setContact((c) => ({ ...c, area: v }));
                          const pc = v.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];
                          void saveField({ address: v, ...(pc ? { postcode: pc.toUpperCase() } : {}) });
                        }}
                      />
                    </div>
                  </section>

                  {/* The property: the facts, and the wand that fills them in. */}
                  <section className="relative rounded-2xl border border-line/60 bg-card p-5">
                    <CardTitle icon="home">The property</CardTitle>
                    <button
                      type="button"
                      onClick={() => void fillPage()}
                      disabled={filling || !hasFullAddress}
                      title={!hasFullAddress ? "Needs a full address with a postcode first" : filling ? "Looking it up…" : "Find with AI"}
                      aria-label="Find with AI"
                      className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                        hasFullAddress && !filling ? "bg-accent-dark text-page hover:opacity-90" : "border border-line/70 text-muted opacity-50"
                      } ${filling ? "animate-pulse" : ""}`}
                    >
                      <DoodleIcon name="magic-wand" size={15} />
                    </button>
                    {(prop.image || (prop.lat != null && prop.lng != null)) && (
                      <div className="mt-3 h-[96px] overflow-hidden rounded-xl">
                        {prop.image ? <PropertyPhoto src={prop.image} className="h-full w-full" /> : <PinMap lat={prop.lat!} lng={prop.lng!} className="h-full w-full" />}
                      </div>
                    )}
                    <div className="mt-2">
                      <PropertyFacts
                        value={{ type: prop.type, beds: prop.beds, baths: prop.baths, receptions: prop.receptions }}
                        onChange={(v) => changeProp({ ...prop, ...v })}
                      />
                    </div>
                    {prop.epc && <p className="mt-1.5 text-[11.5px] text-muted">EPC rating {prop.epc}</p>}
                    {fillNote && <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{fillNote}</p>}
                    {nearMisses.length > 0 && (
                      <div className="mt-2 rounded-xl bg-panel p-2.5">
                        <p className="text-[11px] font-semibold text-muted">Is it one of these in REX?</p>
                        <ul className="mt-1.5 space-y-1">
                          {nearMisses.map((h) => (
                            <li key={h.id}>
                              <button type="button" onClick={() => pickRex(h)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-white">
                                <PropertyPhoto src={h.image} className="h-8 w-10 shrink-0 rounded-md" />
                                <span className="min-w-0 flex-1 truncate">{h.address}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  {/* Next up: the process's own next action, on sage. */}
                  <section ref={nextUpRef} className="rounded-2xl bg-sage/25 p-5">
                    <CardTitle icon={here.icon}>Next up</CardTitle>
                    {logInline ? (
                      /* A contact step: the step's name, then the four ways of reaching
                         them straight away, and the frames slide across inside the card. */
                      <div className="mt-3">
                        <p className="hand text-[17px] leading-snug">{here.title}</p>
                        <div className="mt-4">
                          <LogTouch
                            key={`${lead.id}-${touches.length}`}
                            inline
                            leadId={lead.id}
                            leadName={lead.name}
                            leadFacts={{ name: lead.name, email: contact.email || lead.email, contactId: lead.contactId ?? null }}
                            mode="attempt"
                            onClose={() => undefined}
                            onLogged={(j) => takeLog(j as { touches?: LeadTouch[]; spine?: Spine | null; campaign?: typeof campaign })}
                            onBook={() => { setBookMode("appraisal"); setBooking(true); }}
                          />
                        </div>
                      </div>
                    ) : (
                      /* The block carries its own "Next action" eyebrow for the tenant's box; here the title says it. */
                      <div className="mt-3 flex flex-col gap-4 [&>div:first-child>p:first-child]:hidden [&>div:first-child>p.hand]:mt-0 [&>div:last-child]:items-start">{nextActionEl}</div>
                    )}
                  </section>
                </div>

                <section className={`rounded-2xl border border-line/60 bg-card p-5 ${appraisalTakesOver ? "hidden" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CardTitle icon="target">
                      Where it&apos;s up to
                      <span className="mt-0.5 block text-[12px] font-normal text-muted">The landlord track, read from what has been logged.</span>
                    </CardTitle>
                    <span className="rounded-full bg-accent-soft px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-dark">
                      Step {Math.min(step, track.length - 1) + 1} of {track.length}
                    </span>
                  </div>
                  <div className="mt-4">{timelineEl}</div>
                  <ol className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {track.map((t, i) => {
                      const done = sp ? Boolean(sp.done[t.id as SpineId]) : i < step;
                      const now = i === Math.min(step, track.length - 1) && !done;
                      return (
                        <li key={t.id} className={`rounded-2xl border p-3 ${now ? "border-accent/60 bg-accent-soft/40" : done ? "border-transparent bg-sage/25" : "border-line/50"}`}>
                          <p className={`flex items-center gap-1.5 text-[11.5px] ${now ? "font-semibold" : "text-muted"}`}>
                            {done && <span className="text-[10px]">✓</span>}
                            {t.label}
                          </p>
                          {/* Every stage says what it is, not only the one they are on (James, 11 Sep 2026). */}
                          <p className={`mt-1 text-[10.5px] leading-snug ${now ? "text-muted" : "text-muted/70"}`}>{t.detail}</p>
                        </li>
                      );
                    })}
                  </ol>
                </section>
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
              diagram.

              While a landlord is AT the appraisal, this steps aside for the
              appraisal itself (below): booking one turns the record into a
              job of work, and the job deserves the screen. ── */}
          <div className={`mt-4 rounded-2xl border border-line/60 bg-card p-5 ${appraisalTakesOver || !isTenant ? "hidden" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle icon="target">
                Where it&apos;s up to
                <span className="mt-0.5 block text-[12px] font-normal text-muted">The tenant track, read from what has been logged.</span>
              </CardTitle>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-dark">
                Step {Math.min(step, track.length - 1) + 1} of {track.length}
              </span>
            </div>
            <div className="mt-4">{timelineEl}</div>
          </div>

          {/* ── The appraisal TAKES OVER while the record is at that step.
              It replaces the process card and the notes rather than sitting
              under them: three grey buttons squeezed below a timeline was the
              whole problem, and notes lose nothing because every note goes to
              the contact log, which is the same record read from the other
              end. "Show the whole process" puts the timeline back. ── */}
          {appraisalTakesOver && (
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              <AppraisalTrack
                value={appraisal}
                onChange={setAppraisal}
                who="You"
                landlordEmail={lead.email}
                recordId={lead.id}
                outerStep={`Step ${step + 1} of ${track.length}`}
                onWon={advance}
                onShowProcess={() => setShowProcess(true)}
                invite={{
                  landlordName: lead.name,
                  // "—" is what the list prints for a missing area, and a
                  // landlord should never be emailed about "—".
                  address: lead.area && lead.area !== "—" ? lead.area : "your property",
                  // ONLY a real booking. nextAction.due carries words like
                  // "Overdue", and "seeing you on Overdue" went out to a
                  // landlord in the draft before this.
                  whenPretty: appraisal.bookedFor ?? "",
                  startsAt: appraisal.bookedAt,
                  /* What was actually set aside, not a house number. An agent
                     who blocks out ninety minutes should not have the landlord
                     told forty-five. 45 only stands in for records booked
                     before the OS started carrying the length. */
                  minutes: appraisal.bookedMinutes ?? 45,
                  agentName: lead.agent || "The Letting Experts",
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
          <div
            className={`mt-3 flex min-h-[200px] flex-1 flex-col rounded-3xl border border-line/80 bg-card p-5 ${
              appraisalTakesOver ? "hidden" : ""
            }`}
          >
            <h3 className="mb-4 flex items-center gap-2.5 text-[15px] font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                <DoodleIcon name="note" size={14} />
              </span>
              Notes
            </h3>
            <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-2">
              <div className="flex min-h-0 flex-col rounded-xl border border-line/80 p-3">
                <textarea
                  id="lead-note"
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
                {/* Open tasks sit above the notes, so what is still to do is
                    never a tab away (James, 11 Sep 2026). */}
                {(realTasks ?? []).filter((t) => !t.done).map((t) => (
                  <li key={`task-${t.id}`} className="flex items-start gap-2.5 rounded-xl bg-sage/20 p-3">
                    <button
                      type="button"
                      onClick={() => void toggleTask(t)}
                      aria-label="Mark done"
                      className="mt-0.5 h-[17px] w-[17px] shrink-0 rounded-full border-[1.5px] border-line bg-white transition-colors hover:border-ink"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px]">{t.title}</span>
                      <span className="block text-[10.5px] text-muted">Task{t.detail ? ` · ${t.detail}` : ""}</span>
                    </span>
                  </li>
                ))}
                {noteRows.map((n) => (
                  <li
                    key={n.id}
                    className={`rounded-xl p-3.5 ${n.pinned ? "bg-accent-soft/40" : "bg-panel"}`}
                  >
                    <p className="text-[12.5px] leading-relaxed">{n.text}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[10.5px] text-muted">
                        {n.author} · {n.when}
                      </span>
                      {!n.id.startsWith("touch-") && (
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
                      )}
                    </div>
                  </li>
                ))}
                {!noteRows.length && <Empty>No notes yet — yours will be the first.</Empty>}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Activity: everything that has happened with this person. ── */}
      {activityOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setActivityOpen(false)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
              <h2 className="text-[19px]">Activity with {lead.name.split(" ")[0]}</h2>
              <button type="button" onClick={() => setActivityOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted hover:text-ink">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{activityPanel}</div>
          </div>
        </div>
      )}

      {/* ── Tasks, documents, properties: a pop-out each, over the record. ── */}
      {tab !== null && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setTab(null)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
              <h2 className="text-[19px]">{TABS.find((t) => t.key === tab)?.label} · {lead.name}</h2>
              <button type="button" onClick={() => setTab(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted hover:text-ink">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{tabPanel}</div>
          </div>
        </div>
      )}

      {/* ── Find properties: the map one side, the book the other. ── */}
      {finderOpen && (
        <div className="fixed inset-0 z-[150] flex items-stretch justify-center p-3 sm:p-6">
          <button type="button" aria-label="Close" onClick={() => setFinderOpen(false)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative flex w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-6 py-4">
              <h2 className="text-[20px]">Find properties for {lead.name.split(" ")[0]}</h2>
              <form
                onSubmit={(e) => { e.preventDefault(); void centreFinder(); }}
                className="flex min-w-[260px] flex-1 items-center gap-2 sm:ml-auto sm:max-w-xl"
              >
                <input
                  value={finderAddr}
                  onChange={(e) => setFinderAddr(e.target.value)}
                  placeholder="Their address, a street or a postcode"
                  className="min-w-0 flex-1 rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] outline-none focus:border-ink"
                />
                <button type="submit" disabled={finderBusy || !finderAddr.trim()} className="shrink-0 rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-50">
                  {finderBusy ? "Finding…" : "Search around here"}
                </button>
              </form>
              <button type="button" onClick={() => setFinderOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted hover:text-ink">✕</button>
            </div>
            {finderMsg && <p className="px-6 pt-3 text-[12px] text-accent-dark">{finderMsg}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <TenantPropertySearch
                key={finderOrigin ? `${finderOrigin.lat},${finderOrigin.lng}` : "start"}
                mapSide
                origin={finderOrigin ?? (lead.lat != null && lead.lng != null ? { lat: lead.lat, lng: lead.lng } : null)}
                originLabel={finderLabel || contact.area || lead.area || ""}
                originListingId={lead.listingId != null ? String(lead.listingId) : null}
                shortlisted={shortlist.map((p) => p.id)}
                onShortlist={(l) => {
                  setAddedListings((cur) => (cur.some((x) => x.id === l.id) ? cur : [...cur, l as unknown as Listing]));
                  setAdded((cur) => (cur.includes(l.id) ? cur : [...cur, l.id]));
                }}
                onBook={() => { setFinderOpen(false); setBookMode("viewing"); setBooking(true); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Remove: the OS forgets the lead; REX keeps it. ── */}
      {removing && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
          <button type="button" aria-label="Cancel" onClick={() => setRemoving(false)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative w-full max-w-md rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <h2 className="text-[20px]">Remove {lead.name}?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              They disappear from your leads in the OS.
              {lead.id.startsWith("rex-") ? " REX keeps the enquiry - nothing is changed there." : ""} It can be brought back if it was a mistake.
            </p>
            {removeMsg && <p className="mt-3 text-[12.5px] font-semibold text-accent-dark">{removeMsg}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRemoving(false)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40">Keep them</button>
              <button type="button" onClick={() => void removeLead()} disabled={removeBusy} className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">
                {removeBusy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The landlord side of the same job. Merge values come from the record
          in front of the agent, so {{address}} is this property and not a
          placeholder somebody has to remember to replace. */}
      <Compose
        open={composing}
        onClose={() => setComposing(false)}
        /* An email that actually went is a row in the log - the spine's
           "Email sent" tick is that row, not the act of opening the window. */
        onSent={(subject) => void logTouch({ kind: "email", outcome: "sent", body: subject })}
        to={contact.email || lead.email}
        audience={isTenant ? "tenant" : "landlord"}
        /* Cased, not passed through. A lead arrives from a portal or a form
           with whatever casing the sender used, and "Hi james," is not a
           thing anybody sends. And `agent` sometimes holds an EMAIL — the
           first preview signed a landlord email off as
           james@therecruitmentexperts.co.uk, which nobody would do. */
        merge={{
          name: properName(lead.name),
          firstName: firstNameOf(lead.name),
          address: contact.area || lead.preferred || lead.area,
          agent: lead.agent === "Unassigned" ? "" : agentName(lead.agent),
        }}
      />

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

      {/* The prompt. Deliberately not a modal: the booking is done and this
          is an offer, so it sits in the corner and can be ignored. */}
      {access && (
        <div className="fade-up fixed bottom-5 right-5 z-[140] w-[min(94vw,380px)] rounded-2xl border border-line/80 bg-panel p-4 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.4)]">
          <div className="flex items-start gap-2.5">
            <DoodleIcon name="key" size={17} className="mt-0.5 shrink-0 text-accent-dark" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Somebody lives there</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {access.tenants[0].name}
                {access.tenants.length > 1 ? ` and ${access.tenants.length - 1} other${access.tenants.length > 2 ? "s" : ""}` : ""}
                {" "}
                {access.tenants.length > 1 ? "live" : "lives"} at {access.property}. Ask before the viewing on {access.when}?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={taskBusy}
                  onClick={async () => {
                    await addTask(
                      `Ask ${access.tenants[0].name} for access to ${access.property}`,
                      `Viewing ${access.when}. ${access.tenants.map((t) => [t.name, t.phone, t.email].filter(Boolean).join(" · ")).join(" | ")}`,
                      "viewing access"
                    );
                    setAccess(null);
                  }}
                  className="rounded-full bg-ink px-3.5 py-1.5 text-[11.5px] font-semibold text-page disabled:opacity-50"
                >
                  Add a task
                </button>
                {access.tenants[0].email && (
                  <a
                    href={`mailto:${access.tenants[0].email}?subject=${encodeURIComponent(`Access for a viewing at ${access.property}`)}&body=${encodeURIComponent(`Hi ${access.tenants[0].name.split(" ")[0]},\n\nWe have a viewing booked at ${access.property} on ${access.when}. Is that all right with you?\n\nKind regards\nThe Letting Experts`)}`}
                    onClick={() => setAccess(null)}
                    className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40"
                  >
                    Email them
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setAccess(null)}
                  className="rounded-full px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:text-ink"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
        /* Whose diary the grid shows. An unassigned lead is being booked by
           whoever is looking at it, not by a name typed into the source in
           August. */
        agent={lead.agent && lead.agent !== "Unassigned" ? lead.agent : (me?.name ?? "")}
        onBooked={async (v) => {
          /* Who lives there? Asked once, after the booking is safely made, so
             a slow lookup can never hold up the thing the agent came to do. */
          if (v.propertyId) {
            fetch(`/api/property/people?id=${encodeURIComponent(v.propertyId)}`, { cache: "no-store" })
              .then((r) => r.json())
              .then((j) => {
                const tenants = Array.isArray(j?.tenants) ? j.tenants : [];
                if (j?.ok && tenants.length) {
                  setAccess({ property: v.property, propertyId: v.propertyId as string, when: v.whenPretty || v.when, tenants });
                }
              })
              .catch(() => { /* no prompt is better than a wrong one */ });
          }
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
          /* The appraisal remembers its own appointment. Without this the
             landlord's confirmation had no date to state and no calendar file
             to attach — `bookedFor` was declared on the case and never once
             written to, so the invite always went out with an empty when and
             a start of null. */
          if (bookMode === "appraisal") {
            setAppraisal({
              ...appraisal,
              bookedFor: v.whenPretty || v.when,
              bookedAt: v.startsAt,
              bookedMinutes: v.minutes,
            });
          }
          // Booking IS the step's work — the record moves itself on, and the
          // next step's panel is one button away rather than a hunt. The
          // take-on stays put: its second half (photos & details) is still due.
          if (here.action === "viewing") advance();
          if (here.action === "takeon") setTakeOnBooked(true);

          /* BOOKING AN APPRAISAL HANDS THE RECORD OVER.
             It does not advance the lead spine — the lead's work is finished
             at "booked", and everything after it is a different job on a
             different screen. So we close this drawer and reopen the record on
             Market Appraisals, rather than leaving the agent on the Leads page
             wondering what just changed. See lib/market-appraisal
             handoverTarget.

             The appraisal is WRITTEN before we navigate. It used to only
             navigate, to a screen that could open nothing but its four
             samples — so the handover pushed the agent to an empty list and
             the appointment they had just agreed on the phone existed
             nowhere. The record has to exist for the destination to have
             anything to show.

             AWAITED, and it has to be. The first version fired this off and
             navigated immediately, on the reasoning that the destination
             fetches the book on arrival anyway. It does — but it fetches on
             MOUNT, which happens before a POST sent moments earlier comes
             back. Driving it showed exactly what that costs: the record was
             written correctly, and the agent still landed on a page reading
             "nothing has been booked through the OS yet", with no forward to
             the file. That is the same dead end this change exists to remove,
             just arriving a second later.

             A failure still hands over. Losing the appointment AND the
             navigation would leave the agent staring at a lead drawer with no
             idea whether anything happened; landing on Market Appraisals with
             the row missing is at least a visible, reportable problem. */
          if (here.action === "appraise") {
            await fetch("/api/appraisals", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                leadId: lead.id,
                landlord: lead.name,
                /* The lead's area is what the booker used as the address, so
                   the appraisal states the same place the landlord was just
                   told about. "—" is the list's empty marker and must never
                   reach a record. */
                address:
                  contact.area && contact.area !== "—"
                    ? contact.area
                    : lead.preferred || lead.area,
                /* A lead has no postcode field — it is an enquiry, not a
                   property yet. The appraisal carries an empty one until the
                   take-on fills it in, rather than inventing one from the
                   area. */
                postcode: "",
                agent: lead.agent === "Unassigned" ? null : lead.agent,
                appointmentAt: v.startsAt,
              }),
            }).catch(() => {});
            onClose();
            router.push(handoverTarget(`lead-${lead.id}`));
          }
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

      {logging && (
        <LogTouch
          leadId={lead.id}
          leadName={lead.name}
          leadFacts={{ name: lead.name, email: contact.email || lead.email, contactId: lead.contactId ?? null }}
          mode={logging}
          tried={
            logging === "nurture" && !isTenant
              ? [
                  { label: "Called them", done: touches.some((t) => t.kind === "call") },
                  { label: "Texted or WhatsApped", done: touches.some((t) => t.kind === "text" || t.kind === "whatsapp") },
                  { label: "Emailed them", done: touches.some((t) => t.kind === "email") },
                ]
              : undefined
          }
          onClose={() => setLogging(null)}
          onLogged={(j) => {
            takeLog(j as { touches?: LeadTouch[]; spine?: Spine | null; campaign?: typeof campaign });
            setLogging(null);
          }}
          /* "Yes, booked" on the call: straight into the booker, so the
             appraisal exists and the spine reads Appraisal booked from it. */
          onBook={() => { setBookMode("appraisal"); setBooking(true); }}
        />
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
