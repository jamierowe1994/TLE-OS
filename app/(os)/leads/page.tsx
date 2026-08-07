"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import LeadDrawer from "@/components/LeadDrawer";
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

  /** Previous/Next walk the whole book, not just the visible page. */
  function step(delta: number) {
    if (!open) return;
    const i = LEADS.findIndex((l) => l.id === open.id);
    const next = LEADS[(i + delta + LEADS.length) % LEADS.length];
    setOpenId(next.id);
    setPage(Math.floor(LEADS.indexOf(next) / PER_PAGE));
  }

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

      <div className="mt-4">
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

      </div>

      <LeadDrawer lead={open} onClose={() => setOpenId(null)} onStep={step} />
    </>
  );
}
