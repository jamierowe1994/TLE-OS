"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import SourceMark from "@/components/SourceMark";
import { Pill } from "@/components/Wire";
import { STAGE_TONE, type Lead } from "@/lib/leads-sample";

/**
 * The book, split by what needs doing to it.
 *
 * ── Why a second view rather than a better table ──────────────────────────
 *
 * James, 10 Sep 2026: "segregate out the leads… they can see the different
 * types of leads - the ones that are new in today, the ones that need any
 * review, the ones that have already been contacted."
 *
 * The table answers "show me everything, sorted". It is the right shape for
 * looking something up and the wrong shape for the question somebody actually
 * opens this page with in the morning, which is "what has come in and who have
 * I not rung". Sorting by stage does not answer that either: it puts twelve
 * fresh enquiries below two hundred contacted ones and calls it order.
 *
 * So this view asks the question instead, and the answer is three boxes. It
 * does not replace the table - both are reachable from the switch beside New
 * lead, and neither hides a single row from the other.
 *
 * ── No avatars ────────────────────────────────────────────────────────────
 *
 * The mock-up had a circle of initials on every row. LeadDrawer already ruled
 * on that and the reasoning holds here: "nobody uploads headshots of
 * applicants, and a circle of initials is a photo-shaped apology". The dot is
 * doing the only job that circle was really doing - saying at a glance whether
 * anybody has spoken to this person yet.
 */

/**
 * When it arrived, as a Date, whichever kind of lead it is.
 *
 * Real REX leads carry `receivedAt`. The demo book carries only the phrase the
 * table prints ("10m ago"), so that is read back rather than ignored - a view
 * that silently files every demo lead under one heading is untestable on a
 * laptop, which is where it gets looked at before it ships.
 */
function receivedAt(l: Lead): Date | null {
  if (l.receivedAt) {
    const d = new Date(l.receivedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = /^\s*(\d+)\s*([mhdw])/i.exec(l.received ?? "");
  if (!m) return null;
  const ms: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const step = ms[m[2].toLowerCase()];
  return step ? new Date(Date.now() - Number(m[1]) * step) : null;
}

/**
 * Which box a lead belongs in.
 *
 * TODAY is the calendar day, not "within 24 hours". "New today" said at nine
 * on Tuesday morning must not still be counting Monday teatime's enquiries,
 * which is exactly what a rolling 24 hours does and why it reads as wrong to
 * the person who was here yesterday.
 *
 * Derived from `now` on every read, never a stored flag - the box a lead sits
 * in changes at midnight on its own, with nothing to run and nothing to go
 * stale (the live-figures rule in CLAUDE.md).
 */
export type GroupId = "new" | "review" | "contacted";

/**
 * DONE WITH, ON THIS BOARD (Howard, 1 Oct 2026: "when something is completed
 * (lost or book viewing) it should hide under a completed section").
 *
 * A lead's work on Leads ends when it is lost, when a tenant has a viewing
 * booked, or when a landlord's appraisal is booked - each goes on to its own
 * screen from there. REX closing it says the same. These leave the three
 * working boxes for one folded box at the foot. It is not one of the boxes
 * somebody chooses in Customise, so a layout saved before it existed still
 * has it.
 */
const COMPLETED = new Set(["Lost", "Viewing booked", "Appraisal booked", "Closed", "Not proceeding"]);
export const isCompleted = (l: Lead) => COMPLETED.has(l.spineLabel ?? l.stage);

function groupOf(l: Lead, now: Date): GroupId {
  /* Anything past New has been picked up, whatever the label says next. */
  const spoken = (l.spineLabel ?? l.stage) !== "New";
  if (spoken) return "contacted";

  /* Nothing to ring and nothing to write to. It is untouched either way, but
     it needs a person rather than a call, so it is never "new today" - it
     would sit at the top of the morning list offering nothing to do. */
  if (!l.email?.trim() && !l.phone?.trim()) return "review";

  const at = receivedAt(l);
  if (!at) return "review";
  const today =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  return today ? "new" : "review";
}

export const GROUPS: { id: GroupId; title: string; icon: string; blurb: string }[] = [
  { id: "new", title: "New today", icon: "star", blurb: "Fresh enquiries to review" },
  { id: "review", title: "Needs review", icon: "clock", blurb: "Nobody has been in touch yet" },
  { id: "contacted", title: "Contacted", icon: "call", blurb: "You have already spoken to these" },
];

/** How many rows a box shows before View all. Six fills the box without the
 *  page becoming one long scroll of three thousand rows. */
export const PREVIEW = 6;

/**
 * How somebody wants their boxes (James, 11 Sep 2026: "they should be able
 * to customise their view... once I've set it up, it will then stay"). Which
 * boxes show, in what order, and how many rows each opens with. Saved per
 * person by the page; this only draws what it is handed.
 */
export interface GroupsConfig {
  show: GroupId[];
  preview: number;
}
export const DEFAULT_GROUPS: GroupsConfig = { show: ["new", "review", "contacted"], preview: PREVIEW };

export default function LeadGroups({
  leads,
  activeId,
  onOpen,
  config = DEFAULT_GROUPS,
}: {
  leads: Lead[];
  activeId: string | null;
  onOpen: (l: Lead) => void;
  config?: GroupsConfig;
}) {
  const PREVIEW = Math.max(1, config.preview);
  const groups = config.show.map((id) => GROUPS.find((g) => g.id === id)).filter((g): g is (typeof GROUPS)[number] => Boolean(g));
  /* Read once per render of the filtered book rather than per lead, so every
     row in one pass is measured against the same instant. */
  const grouped = useMemo(() => {
    const now = new Date();
    const out: Record<GroupId, Lead[]> = { new: [], review: [], contacted: [] };
    const done: Lead[] = [];
    /* Banked for later (Howard, 1 Oct 2026): out of the working boxes until
       the day the agent said, then at the top of the page that morning. */
    const due: Lead[] = [];
    const banked: Lead[] = [];
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    for (const l of leads) {
      if (isCompleted(l)) done.push(l);
      else if (l.followUpAt) (new Date(l.followUpAt).getTime() < endOfToday ? due : banked).push(l);
      else out[groupOf(l, now)].push(l);
    }
    due.sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? ""));
    banked.sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? ""));
    /* Newest first inside every box. The whole point of the view is that the
       thing needing attention is at the top. */
    const newest = (a: Lead, b: Lead) => (receivedAt(b)?.getTime() ?? 0) - (receivedAt(a)?.getTime() ?? 0);
    for (const k of Object.keys(out) as GroupId[]) out[k].sort(newest);
    done.sort(newest);
    return { ...out, done, due, banked };
  }, [leads]);

  const [openAll, setOpenAll] = useState<Record<string, boolean>>({});
  /* Folded until asked for: it is the box of things nobody needs to act on. */
  const [doneOpen, setDoneOpen] = useState(false);
  const [bankedOpen, setBankedOpen] = useState(false);
  const backOn = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) }) : "";

  const row = (l: Lead, filled: boolean, when?: string) => (
    <li key={l.id}>
      <button
        type="button"
        data-steve-row=""
        onClick={() => onOpen(l)}
        className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-left transition-colors md:grid md:grid-cols-[10px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_auto] ${
          l.id === activeId ? "bg-accent-soft/50" : "hover:bg-accent-soft/20"
        }`}
      >
        {/* Filled means nobody has spoken to them. */}
        <span
          aria-hidden
          className={`h-[7px] w-[7px] shrink-0 rounded-full ${filled ? "bg-accent-dark" : "border border-line bg-transparent"}`}
        />

        <span className="min-w-0">
          <span className="hand block truncate text-[14px] leading-tight">{l.name}</span>
          <span className="block truncate text-[11px] text-muted">{l.email || l.phone || "No details"}</span>
        </span>

        <span className="min-w-0">
          <span className="block truncate text-[12px]">{l.enquiry}</span>
          {l.preferred && (
            <span className="block truncate text-[11px] text-muted">{l.preferred}</span>
          )}
        </span>

        {/* No pin before the town. SourceMark already draws one
            for Rightmove, and the same mark meaning two things
            one column apart is worse than no mark at all. */}
        <span className="min-w-0 truncate text-[12px] text-muted">{l.area}</span>

        <span className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
          <SourceMark source={l.source} />
          <span className="whitespace-nowrap text-[11px] text-muted">{when ?? l.received}</span>
          {l.spineLabel ? (
            <Pill tone={l.spineLabel === "Appraisal booked" || l.spineLabel === "Viewing booked" ? "good" : l.spineLabel === "Nurture" || l.spineLabel === "Lost" ? "neutral" : "accent"}>
              {l.spineLabel}
            </Pill>
          ) : (
            <Pill tone={STAGE_TONE[l.stage]}>{l.stage}</Pill>
          )}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      {grouped.due.length > 0 && (
        <section className="fade-up rounded-[22px] border border-accent-dark/30 bg-white">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/50 px-5 py-3.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-dark text-white">
              <DoodleIcon name="clock" size={14} />
            </span>
            <h2 className="hand text-[17px] leading-none">Follow up today</h2>
            <span className="figures rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark">
              {grouped.due.length.toLocaleString("en-GB")}
            </span>
            <p className="text-[11.5px] text-muted">You said you would get back in touch</p>
          </div>
          <ul className="divide-y divide-line/40">
            {grouped.due.map((l) => row(l, true, `Due ${backOn(l.followUpAt)}`))}
          </ul>
        </section>
      )}
      {groups.map((g, i) => {
        const rows = grouped[g.id];
        const all = openAll[g.id];
        const shown = all ? rows : rows.slice(0, PREVIEW);
        return (
          <section
            key={g.id}
            /* White with a hairline, like every card since the appraisal
               file; the grey panel is gone (James, 11 Sep 2026). */
            className="fade-up rounded-[22px] border border-line/50 bg-white"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/50 px-5 py-3.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-dark">
                <DoodleIcon name={g.icon} size={14} />
              </span>
              <h2 className="hand text-[17px] leading-none">{g.title}</h2>
              <span className="figures rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark">
                {rows.length.toLocaleString("en-GB")}
              </span>
              <p className="text-[11.5px] text-muted">{g.blurb}</p>
              {rows.length > PREVIEW && (
                <button
                  type="button"
                  onClick={() => setOpenAll((o) => ({ ...o, [g.id]: !all }))}
                  className="ml-auto text-[11.5px] font-semibold text-accent-dark underline decoration-accent-dark/40 underline-offset-2 transition-colors hover:decoration-accent-dark"
                >
                  {all ? "Show fewer" : `View all ${rows.length.toLocaleString("en-GB")}`}
                </button>
              )}
            </div>

            {!rows.length ? (
              <p className="px-5 py-6 text-center text-[12px] text-muted">
                {g.id === "new"
                  ? "Nothing new today."
                  : g.id === "review"
                    ? "Everybody has been picked up."
                    : "Nobody has been contacted yet."}
              </p>
            ) : (
              <ul className="divide-y divide-line/40">{shown.map((l) => row(l, g.id !== "contacted"))}</ul>
            )}
          </section>
        );
      })}

      {grouped.banked.length > 0 && (
        <section className="fade-up rounded-[22px] border border-line/50 bg-white">
          <button
            type="button"
            onClick={() => setBankedOpen((o) => !o)}
            aria-expanded={bankedOpen}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 text-left"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-line/40 text-muted">
              <DoodleIcon name="clock" size={14} />
            </span>
            <h2 className="hand text-[17px] leading-none">Banked for later</h2>
            <span className="figures rounded-full bg-line/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {grouped.banked.length.toLocaleString("en-GB")}
            </span>
            <p className="text-[11.5px] text-muted">Back on your list on the day you picked</p>
            <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-dark">
              {bankedOpen ? "Hide" : "Show"}
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${bankedOpen ? "rotate-180" : ""}`}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          {bankedOpen && (
            <ul className="divide-y divide-line/40 border-t border-line/50">
              {grouped.banked.map((l) => row(l, false, `Back ${backOn(l.followUpAt)}`))}
            </ul>
          )}
        </section>
      )}

      {grouped.done.length > 0 && (
        <section className="fade-up rounded-[22px] border border-line/50 bg-white" style={{ animationDelay: `${groups.length * 60}ms` }}>
          <button
            type="button"
            onClick={() => setDoneOpen((o) => !o)}
            aria-expanded={doneOpen}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 text-left"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-line/40 text-muted">
              <DoodleIcon name="checklist" size={14} />
            </span>
            <h2 className="hand text-[17px] leading-none">Completed</h2>
            <span className="figures rounded-full bg-line/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {grouped.done.length.toLocaleString("en-GB")}
            </span>
            <p className="text-[11.5px] text-muted">Lost, or a viewing or appraisal booked - nothing more to do here</p>
            <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-dark">
              {doneOpen ? "Hide" : "Show"}
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${doneOpen ? "rotate-180" : ""}`}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          {doneOpen && (
            <ul className="divide-y divide-line/40 border-t border-line/50">
              {(openAll.done ? grouped.done : grouped.done.slice(0, PREVIEW)).map((l) => row(l, false))}
              {grouped.done.length > PREVIEW && (
                <li className="px-5 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setOpenAll((o) => ({ ...o, done: !o.done }))}
                    className="text-[11.5px] font-semibold text-accent-dark underline decoration-accent-dark/40 underline-offset-2 transition-colors hover:decoration-accent-dark"
                  >
                    {openAll.done ? "Show fewer" : `View all ${grouped.done.length.toLocaleString("en-GB")}`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
