"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { FlowTag, Pill } from "@/components/Wire";

/**
 * Leads: one inbox for every channel, with the record open beside it.
 *
 * The two feeds are genuinely different pipes — Rightmove/Zoopla/website land
 * in REX, paid social lands in GoHighLevel — and the page's job is that you
 * never have to care which. Every action written here goes back to REX.
 */

type Stage = "New" | "Contacted" | "Viewing booked" | "Qualified" | "Waiting";

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  enquiry: string;
  area: string;
  budget: string;
  source: string;
  received: string;
  stage: Stage;
  moveDate: string;
  preferred: string;
  agent: string;
  notes: string;
  activity: { icon: string; text: string; when: string }[];
};

const LEADS: Lead[] = [
  {
    id: "l1",
    name: "Sarah Johnson",
    email: "sarah.j@email.com",
    phone: "07712 345 678",
    enquiry: "Letting",
    area: "Didsbury",
    budget: "£1,200 pcm",
    source: "Rightmove",
    received: "10m ago",
    stage: "New",
    moveDate: "1 September 2026",
    preferred: "Didsbury, Withington",
    agent: "Kirstie",
    notes: "Looking for a 2-bed flat with parking. Pet friendly.",
    activity: [
      { icon: "target", text: "Lead received from Rightmove", when: "10 minutes ago" },
      { icon: "mail", text: "Auto-response email sent", when: "9 minutes ago" },
      { icon: "call", text: "Call attempted — no answer", when: "5 minutes ago" },
      { icon: "calendar", text: "Follow-up due today", when: "Today at 14:00" },
    ],
  },
  {
    id: "l2",
    name: "Tom Williams",
    email: "tom.w@email.com",
    phone: "07945 678 901",
    enquiry: "Letting",
    area: "Chorlton",
    budget: "£1,000 pcm",
    source: "Zoopla",
    received: "25m ago",
    stage: "Contacted",
    moveDate: "15 September 2026",
    preferred: "Chorlton",
    agent: "Kirstie",
    notes: "Sharer, needs two doubles.",
    activity: [
      { icon: "target", text: "Lead received from Zoopla", when: "25 minutes ago" },
      { icon: "call", text: "Spoke — sending shortlist", when: "12 minutes ago" },
    ],
  },
  {
    id: "l3",
    name: "Chloe Adams",
    email: "chloe.a@email.com",
    phone: "07890 123 456",
    enquiry: "Landlord",
    area: "Coventry",
    budget: "3-bed to let",
    source: "Facebook ad",
    received: "2h ago",
    stage: "New",
    moveDate: "Flexible",
    preferred: "Coventry CV4",
    agent: "Unassigned",
    notes: "Landlord enquiry from the paid campaign — wants a valuation.",
    activity: [
      { icon: "megaphone", text: "Lead captured by Facebook campaign", when: "2 hours ago" },
      { icon: "link", text: "Synced from GoHighLevel", when: "2 hours ago" },
    ],
  },
  {
    id: "l4",
    name: "Emma Brown",
    email: "emma.b@email.com",
    phone: "07890 123 456",
    enquiry: "Letting",
    area: "Didsbury",
    budget: "£1,300 pcm",
    source: "Website",
    received: "3h ago",
    stage: "Viewing booked",
    moveDate: "1 October 2026",
    preferred: "Didsbury",
    agent: "Michael",
    notes: "Booked in for Thursday at 17:00.",
    activity: [
      { icon: "target", text: "Enquiry from the website form", when: "3 hours ago" },
      { icon: "calendar", text: "Viewing booked — Thu 17:00", when: "1 hour ago" },
    ],
  },
  {
    id: "l5",
    name: "James Patel",
    email: "james.p@email.com",
    phone: "07411 222 333",
    enquiry: "Letting",
    area: "Withington",
    budget: "£950 pcm",
    source: "Instagram ad",
    received: "4h ago",
    stage: "Qualified",
    moveDate: "20 August 2026",
    preferred: "Withington, Fallowfield",
    agent: "Kirstie",
    notes: "Referencing pack sent.",
    activity: [
      { icon: "megaphone", text: "Lead captured by Instagram campaign", when: "4 hours ago" },
      { icon: "shield", text: "Marked qualified", when: "2 hours ago" },
    ],
  },
  {
    id: "l6",
    name: "Olivia Clark",
    email: "olivia.c@email.com",
    phone: "07789 444 555",
    enquiry: "Letting",
    area: "Chorlton",
    budget: "£1,100 pcm",
    source: "Referral",
    received: "1d ago",
    stage: "Waiting",
    moveDate: "Not sure yet",
    preferred: "Chorlton, Sale",
    agent: "Unassigned",
    notes: "Referred by an existing landlord. Waiting on her budget.",
    activity: [
      { icon: "user", text: "Referred by an existing landlord", when: "Yesterday" },
    ],
  },
];

const STAGE_TONE: Record<Stage, "accent" | "neutral" | "good"> = {
  New: "accent",
  Contacted: "neutral",
  "Viewing booked": "neutral",
  Qualified: "good",
  Waiting: "neutral",
};

const ACTIONS = [
  { label: "Call", icon: "call" },
  { label: "Email", icon: "mail" },
  { label: "WhatsApp", icon: "message" },
  { label: "Book viewing", icon: "calendar" },
  { label: "Add note", icon: "pencil" },
  { label: "Mark qualified", icon: "shield" },
];

function Filter({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
    >
      {label}
      <span className="text-[9px]">▾</span>
    </button>
  );
}

export default function Leads() {
  // Closed on arrival: the page is the inbox, full width. The panel is a
  // consequence of picking someone, never the state you land in.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = LEADS.find((l) => l.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Leads"
        blurb="New enquiries from the portals, your ads and the website — ready to qualify and follow up."
        illustration="/illustrations/notioly/inbox.svg"
        illustrationRight={400}
      />

      <div className="mt-10 flex items-center justify-between gap-3">
        <FlowTag from="portals → REX · social → GHL" to="REX" />
      </div>

      {/* ── The inbox, with the open lead beside it. */}
      <div className={`mt-4 grid gap-4 ${open ? "xl:grid-cols-[2fr_1fr]" : ""}`}>
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 p-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-w-44 flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
              <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
              <input
                type="text"
                placeholder="Search leads…"
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
              />
            </label>
            <Filter label="All sources" />
            <Filter label="All agents" />
            <Filter label="All stages" />
          </div>

          {/* The list */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line/70">
                  {["Lead", "Enquiry", "Area", "Budget", "Source", "Received", "Stage"].map((c) => (
                    <th
                      key={c}
                      className="pb-2.5 pr-3 text-[9.5px] font-bold uppercase tracking-wider text-muted"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEADS.map((l) => {
                  const isOpen = l.id === openId;
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setOpenId(isOpen ? null : l.id)}
                      className={`cursor-pointer border-b border-line/40 transition-colors last:border-0 ${
                        isOpen ? "bg-accent-soft/50" : "hover:bg-page"
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <span className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                              isOpen ? "border-accent-dark bg-accent-dark" : "border-line"
                            }`}
                          >
                            {isOpen && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className="hand block truncate text-[13px]">{l.name}</span>
                            <span className="block truncate text-[10.5px] text-muted">
                              {l.email}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-muted">{l.enquiry}</td>
                      <td className="whitespace-nowrap py-3 pr-3">{l.area}</td>
                      <td className="figures whitespace-nowrap py-3 pr-3">{l.budget}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-muted">{l.source}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-[11px] text-muted">{l.received}</td>
                      <td className="whitespace-nowrap py-3 pr-1">
                        <Pill tone={STAGE_TONE[l.stage]}>{l.stage}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-4">
            <p className="text-[11px] text-muted">Showing 1–6 of 42 leads</p>
            <div className="flex items-center gap-1.5">
              {["‹", "1", "2", "3", "…", "7", "›"].map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] transition-colors ${
                    p === "1"
                      ? "bg-accent-soft/60 font-semibold text-accent-dark"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── The open lead. */}
        {open && (
          <aside className="fade-up h-fit rounded-2xl border border-line/80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-dark">
                  {open.name.split(" ").map((n) => n[0]).join("")}
                </span>
                <div className="min-w-0">
                  <p className="hand truncate text-[17px] leading-tight">{open.name}</p>
                  <p className="mt-1 truncate text-[11px] text-muted">{open.email}</p>
                  <p className="truncate text-[11px] text-muted">{open.phone}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="shrink-0 text-muted transition-colors hover:text-ink"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Pill tone={STAGE_TONE[open.stage]}>{open.stage}</Pill>
              <span className="text-[10.5px] text-muted">
                {open.source} · {open.received}
              </span>
            </div>

            <dl className="mt-5 space-y-2.5 border-t border-line/70 pt-4 text-[12px]">
              {[
                ["Enquiry type", open.enquiry],
                ["Desired move date", open.moveDate],
                ["Preferred area", open.preferred],
                ["Budget / rent", open.budget],
                ["Assigned agent", open.agent],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
              <div className="pt-1">
                <dt className="text-muted">Notes</dt>
                <dd className="mt-1 leading-snug">{open.notes}</dd>
              </div>
            </dl>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line/70 pt-4">
              {ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-line/80 px-2 py-2.5 text-[10px] font-medium transition-colors hover:border-ink/40"
                >
                  <DoodleIcon name={a.icon} size={16} className="text-accent-dark" />
                  {a.label}
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-line/70 pt-4">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                Latest activity
              </p>
              <ul className="mt-3 space-y-3">
                {open.activity.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <DoodleIcon
                      name={a.icon}
                      size={14}
                      className="mt-0.5 shrink-0 text-accent-dark"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] leading-snug">{a.text}</span>
                      <span className="block text-[10px] text-muted">{a.when}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10.5px] text-muted">
                Reconstructable from REX AuditLogs — actor and timestamp per change.
              </p>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
