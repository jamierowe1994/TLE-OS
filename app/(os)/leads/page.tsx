"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { FlowTag, Pill } from "@/components/Wire";
import { LEADS, STAGE_TONE, type Lead } from "@/lib/leads-sample";

/**
 * Leads: one inbox for every channel, with the record open beside it.
 *
 * The two feeds are genuinely different pipes — Rightmove/Zoopla/website land
 * in REX, paid social lands in GoHighLevel — and the page's job is that you
 * never have to care which. Every action written here goes back to REX.
 */

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
      className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line/80 px-3.5 py-2 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
    >
      {label}
      <span className="text-[9px]">▾</span>
    </button>
  );
}

/** Source badge — the pipe matters, so it's shown as a chip not plain text. */
function Source({ s }: { s: string }) {
  const social = /facebook|instagram/i.test(s);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={`h-1.5 w-1.5 rounded-full ${social ? "bg-accent" : "bg-muted/50"}`}
        title={social ? "Paid social — via GoHighLevel" : "Portal or website — via REX"}
      />
      {s}
    </span>
  );
}

const PER_PAGE = 20;

export default function Leads() {
  // Closed on arrival: the page is the inbox, full width. The panel is a
  // consequence of picking someone, never the state you land in.
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const open = LEADS.find((l) => l.id === openId) ?? null;

  // Defined once — a fresh array each render would restart the prefs effect.
  const defs = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        key: "name", label: "Lead", required: true,
        render: (l) => <span className="hand whitespace-nowrap text-[13px]">{l.name}</span>,
      },
      {
        key: "email", label: "Email",
        // Its own column now: squeezed under the name it was always truncated,
        // and an email you can't read is an email you can't act on.
        cell: "whitespace-nowrap text-muted",
        render: (l) => l.email,
      },
      { key: "phone", label: "Phone", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.phone },
      { key: "enquiry", label: "Enquiry", cell: "whitespace-nowrap text-muted", render: (l) => l.enquiry },
      { key: "area", label: "Area", cell: "whitespace-nowrap", render: (l) => l.area },
      { key: "budget", label: "Budget", cell: "figures whitespace-nowrap", render: (l) => l.budget },
      { key: "source", label: "Source", cell: "text-muted", render: (l) => <Source s={l.source} /> },
      { key: "received", label: "Received", cell: "whitespace-nowrap text-[11px] text-muted", render: (l) => l.received },
      { key: "moveDate", label: "Move date", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.moveDate },
      { key: "agent", label: "Agent", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.agent },
      {
        key: "stage", label: "Stage", cell: "whitespace-nowrap",
        render: (l) => <Pill tone={STAGE_TONE[l.stage]}>{l.stage}</Pill>,
      },
    ],
    []
  );
  const cols = useColumns<Lead>("leads", defs);

  const pages = Math.ceil(LEADS.length / PER_PAGE);
  const rows = LEADS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <>
      <PageHeader
        title="Leads"
        blurb="New enquiries from the portals, your ads and the website — ready to qualify and follow up."
        illustration="/illustrations/notioly/inbox.svg"
      />

      <div className="mt-10">
        <FlowTag from="portals → REX · social → GHL" to="REX" />
      </div>

      <div className={`mt-4 grid gap-4 ${open ? "2xl:grid-cols-[2.4fr_1fr]" : ""}`}>
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          {/* Filters, with the column customiser at the end of the row. */}
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
            <ColumnCustomiser cols={cols} />
          </div>

          <div className="mt-4">
            <DataTable
              cols={cols}
              rows={rows}
              activeId={openId}
              onRowClick={(l) => setOpenId(l.id === openId ? null : l.id)}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
            <p className="text-[11px] text-muted">
              Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, LEADS.length)} of{" "}
              {LEADS.length} leads
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ‹
              </button>
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] transition-colors ${
                    i === page
                      ? "bg-accent-soft/60 font-semibold text-accent-dark"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={page >= pages - 1}
                className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* ── The open lead. */}
        {open && (
          <aside className="fade-up h-fit rounded-2xl border border-line/80 bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-dark">
                  {open.name.split(" ").map((n) => n[0]).join("")}
                </span>
                <div className="min-w-0">
                  <p className="hand truncate text-[17px] leading-tight">{open.name}</p>
                  <p className="mt-1 break-all text-[11px] text-muted">{open.email}</p>
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

            <div className="mt-3 flex flex-wrap items-center gap-2">
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
              {open.notes && (
                <div className="pt-1">
                  <dt className="text-muted">Notes</dt>
                  <dd className="mt-1 leading-snug">{open.notes}</dd>
                </div>
              )}
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
