"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import LeadDrawer from "@/components/LeadDrawer";
import NewLeadPanel from "@/components/NewLeadPanel";
import PageHeader from "@/components/PageHeader";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { Pill } from "@/components/Wire";
import { LEADS, STAGE_TONE, leadSide, type Lead } from "@/lib/leads-sample";

/**
 * Leads: one inbox for every channel, with the record open beside it.
 *
 * The two feeds are genuinely different pipes — Rightmove/Zoopla/website land
 * in REX, paid social lands in GoHighLevel — and the page's job is that you
 * never have to care which. Every action written here goes back to REX.
 */

/** A filter that filters: pick a value, the list narrows, the chip wears
 *  the choice; "All …" hands the rows back. */
function Filter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
          value
            ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
            : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        {value ?? label}
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] cursor-default"
          />
          <div className="fade-up absolute left-0 top-full z-[70] mt-1.5 max-h-72 min-w-[170px] overflow-y-auto rounded-2xl border border-line/80 bg-card p-1.5 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.3)]">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent-soft/40 ${
                value === null ? "font-semibold text-accent-dark" : ""
              }`}
            >
              {label}
            </button>
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={`block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent-soft/40 ${
                  value === o ? "font-semibold text-accent-dark" : ""
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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

interface LeadSource {
  leads: Lead[];
  live: boolean;
  loading: boolean;
  reason?: string;
  scanned?: number;
  setAside?: { sales: number; unclear: number };
  total?: number | null;
  stale?: boolean;
}

export default function Leads() {
  // Closed on arrival: the page is the inbox, full width. The panel is a
  // consequence of picking someone, never the state you land in.
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  // Stacks of 25 — enough by default, more when they want a long scroll.
  const [perPage, setPerPage] = useState(25);
  const [q, setQ] = useState("");
  const [fSource, setFSource] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [fStage, setFStage] = useState<string | null>(null);
  const params = useSearchParams();
  const side = params.get("side"); // "tenant" | "landlord" | null (both)

  /* ── The real book, out of REX. Until it answers we show the demo one, so
        the page never renders empty; `live` says which you're looking at. ── */
  const [source, setSource] = useState<LeadSource>({ leads: LEADS, live: false, loading: true });

  useEffect(() => {
    let gone = false;
    fetch("/api/leads")
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (j.ok && j.live && Array.isArray(j.leads)) {
          setSource({
            leads: j.leads,
            live: true,
            loading: false,
            scanned: j.scanned,
            setAside: j.setAside,
            total: j.total,
            stale: j.stale,
          });
        } else {
          setSource({ leads: LEADS, live: false, loading: false, reason: j.reason });
        }
      })
      .catch(() => {
        if (!gone) setSource({ leads: LEADS, live: false, loading: false, reason: "REX didn't answer — showing the demo book." });
      });
    return () => { gone = true; };
  }, []);

  const ALL = source.leads;

  // The dropdowns offer what the book actually contains — no imagined values.
  const sources = useMemo(() => [...new Set(ALL.map((l) => l.source))].sort(), [ALL]);
  const agents = useMemo(() => [...new Set(ALL.map((l) => l.agent))].sort(), [ALL]);
  const stages = useMemo(() => [...new Set(ALL.map((l) => l.stage))], [ALL]);

  // Tenant-side and landlord-side are different jobs with different questions,
  // so the nav splits them and the list follows. The filters stack on top.
  const book = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ALL.filter((l) => {
      if (side && leadSide(l) !== side) return false;
      if (fSource && l.source !== fSource) return false;
      if (fAgent && l.agent !== fAgent) return false;
      if (fStage && l.stage !== fStage) return false;
      if (needle && !`${l.name} ${l.email} ${l.area} ${l.preferred}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [ALL, side, fSource, fAgent, fStage, q]);

  // A filter change can strand the page number past the end of the list.
  useEffect(() => {
    setPage(0);
  }, [side, fSource, fAgent, fStage, q, perPage]);
  const open = book.find((l) => l.id === openId) ?? null;

  /** Previous/Next walk the whole filtered book, not just the visible page. */
  function step(delta: number) {
    if (!open) return;
    const i = book.findIndex((l) => l.id === open.id);
    const next = book[(i + delta + book.length) % book.length];
    setOpenId(next.id);
    setPage(Math.floor(book.indexOf(next) / perPage));
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

  const pages = Math.max(1, Math.ceil(book.length / perPage));
  const rows = book.slice(page * perPage, page * perPage + perPage);

  return (
    <>
      <PageHeader
        title={side === "tenant" ? "Tenant leads" : side === "landlord" ? "Landlord leads" : "Leads"}
        blurb={
          source.loading
            ? "Fetching today's enquiries from REX…"
            : source.live
              ? `Live from REX${
                  source.total ? ` — ${source.total.toLocaleString("en-GB")} enquiries on record` : ""
                }. Showing the ${source.scanned?.toLocaleString("en-GB") ?? ""} most recent, ${
                  source.setAside
                    ? `with ${(source.setAside.sales + source.setAside.unclear).toLocaleString("en-GB")} set aside as sales or unclear`
                    : ""
                }.`
              : (source.reason ?? "New enquiries from the portals, your ads and the website.")
        }
        illustration="/illustrations/notioly/inbox.svg"
        lineBreak="sink"
        actions={
          <PressButton
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page"
          >
            <span className="text-[15px] leading-none">+</span> New lead
          </PressButton>
        }
      />

      <div className="mt-4">
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          {/* Filters, with the column customiser at the end of the row. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-w-44 flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
              <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
              <input
                type="text"
                placeholder="Search leads…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
              />
            </label>
            <Filter label="All sources" options={sources} value={fSource} onChange={setFSource} />
            <Filter label="All agents" options={agents} value={fAgent} onChange={setFAgent} />
            <Filter label="All stages" options={stages} value={fStage} onChange={setFStage} />
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
            <p className="flex items-center gap-2.5 text-[11px] text-muted">
              Showing {book.length ? page * perPage + 1 : 0}–
              {Math.min((page + 1) * perPage, book.length)} of {book.length} leads
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="rounded-full border border-line/80 bg-transparent px-2.5 py-1 text-[11px] outline-none transition-colors hover:border-ink/40"
                title="Leads per page"
              >
                {[25, 50, 75, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
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
      <NewLeadPanel open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
