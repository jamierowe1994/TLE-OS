"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { londonToday } from "@/lib/london-clock";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile, { toneFor } from "@/components/StatTile";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import { PressButton } from "@/components/Bits";
import type { Contractor, WorksOrder, WorksSummary, Kind, Move, Status } from "@/lib/works-orders";
import type { CarriedDone, CarriedJob } from "@/lib/works-carried";
import { URGENCIES } from "@/lib/works-catalogue";
import { STEPS, stepOf } from "@/lib/works-steps";
import WalkthroughLink from "@/components/showroom/WalkthroughLink";
import RaiseJob from "@/components/maintenance/RaiseJob";
import { LogInvoice } from "@/components/contractors/ContractorProfile";
import FieldSelect from "@/components/FieldSelect";
import { OPEN, PAYRUN_LABEL, PayrunTag, day, nextFor, pounds, type Property } from "@/components/maintenance/works-ui";
import { searchMatches } from "@/lib/search-match";
import { usePref } from "@/lib/prefs-store";
import { useNoteVisit } from "@/lib/recent-visits";
import { useNewLook } from "@/lib/use-new-look";
import { Mast, Badge, Tabs, Ico } from "@/components/new-look/Parts";
import { Stat, Failed, Loading, EmptyCard } from "@/components/new-look/backoffice/Bits";

/**
 * Maintenance: every job on the managed book, reported through paid.
 *
 * Two sections, as James set out on 7 Sep 2026: REPAIRS, where something is
 * broken and an urgency sets the clock, and PLANNED, where a date does - a
 * gas safety, an EICR, a boiler service. The same job sheet either way, the
 * same trades book, the same timeline under the person's name.
 *
 * The screen is a list by status rather than a kanban: a burst pipe and a
 * boiler service are not columns to drag between, they are jobs with a
 * next thing to do, and the row says what that is.
 */

/* Imported now, not copied. These used to be client-side duplicates under a
   comment reading "Keep them in step", which is a sync nobody can check - they
   live in lib/works-catalogue, which both sides can read. */
export default function Maintenance() {
  const router = useRouter();
  const params = useSearchParams();
  /* The rail's two children: Jobs (repairs and planned, with the invoices
     beside them) and Contractors. The pills row narrows within Jobs. */
  const rail = params.get("section") === "contractors" ? "contractors" : "jobs";
  const [section, setSection] = useState<Kind | "contractors" | "invoices" | "accounts">("repair");
  useEffect(() => {
    /* The trades book moved to Portfolio > Contractors on 19 Oct 2026; old
       links to ?section=contractors land there. */
    if (rail === "contractors") { setSection("contractors"); router.replace("/contractors"); }
    else if (params.get("section") === "invoices") setSection("invoices");
    else if (params.get("section") === "accounts") setSection("accounts");
    /* A link straight to the planned jobs (the Showroom's gas safety walkthrough). */
    else if (params.get("section") === "planned") setSection("planned");
    else setSection((cur) => (cur === "contractors" ? "repair" : cur));
  }, [rail, params, router]);
  const [data, setData] = useState<{ orders: WorksOrder[]; contractors: Contractor[]; summary: WorksSummary | null; lastMonth?: WorksSummary | null; lastMonthOn?: string | null; live: boolean; reason?: string; canCorporate?: boolean; canPayrun?: boolean; carried?: CarriedJob[]; carriedDone?: CarriedDone[]; carriedReadAt?: string | null; carriedError?: string; ringForApproval?: string[]; mine?: { orders: string[]; carried: string[]; summary: WorksSummary; startOn: "mine" | "everyone"; note: string | null } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [raising, setRaising] = useState<Kind | null>(null);
  /* Work finished before it was on the OS, logged off the contractor's invoice (Rhiannon, 19 Oct 2026). */
  const [loggingDone, setLoggingDone] = useState(false);
  /* A job opens on its own page (James, 21 Oct 2026: the works order was "a
     completely blank page"): app/(os)/maintenance/[id]. Whatever used to open
     the sheet here - a row, a raised job, a logged one - goes there. */
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { if (openId) router.push(`/maintenance/${encodeURIComponent(openId)}`); }, [openId, router]);
  useNoteVisit(openId ? `wo:${openId}` : null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/api/works-orders", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setError(null); } else setError(j.error ?? "Could not read the jobs."); })
      .catch(() => setError("Could not read the jobs."));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raise = sp.get("raise");
      if (raise === "repair" || raise === "planned") { setSection(raise); setRaising(raise); }
      const open = sp.get("open");
      if (open) setOpenId(open);
    } catch { /* fine */ }
  }, []);

  /* Mine or Everyone (Rhiannon, 15 Oct 2026). An agent opens on their own
     homes' jobs, the office and the owners on the lot (the server says which,
     lib/works-mine); whichever the person last chose follows them about. If
     the server could not work out Mine at all, it is Everyone and no toggle. */
  const [savedView, saveView] = usePref<"" | "mine" | "everyone">("maintenance-view-v1", "");
  const mine = data?.mine ?? null;
  const view: "mine" | "everyone" = mine ? (savedView || mine.startOn) : "everyone";
  const mineOrders = useMemo(() => new Set(mine?.orders ?? []), [mine]);
  const mineCarried = useMemo(() => new Set(mine?.carried ?? []), [mine]);
  const allOrders = useMemo(() => data?.orders ?? [], [data]);
  const orders = useMemo(() => (view === "mine" ? allOrders.filter((o) => mineOrders.has(o.id)) : allOrders), [view, allOrders, mineOrders]);
  const rows = useMemo(() => {
    const needle = q.trim();
    return orders.filter((o) => {
      if (section !== "contractors" && section !== "invoices" && section !== "accounts" && o.kind !== section) return false;
      if (!showClosed && !OPEN.includes(o.status)) return false;
      if (needle && !searchMatches(needle, o.propertyName, o.locality, o.title, o.category, o.contractorName, o.landlord, o.tenant, String(o.ref))) return false;
      return true;
    });
  }, [orders, section, showClosed, q]);
  const grouped = useMemo(() => STEPS.map((st) => ({ status: st.id, label: st.label, rows: rows.filter((r) => stepOf(r) === st.id) })).filter((g) => g.rows.length), [rows]);
  /* Jobs still in the old system (lib/works-carried): on the board, in the
     figures, until somebody takes them on here. */
  const carried = useMemo(() => {
    const needle = q.trim();
    return (data?.carried ?? []).filter((j) => j.kind === section && (view === "everyone" || mineCarried.has(j.taskId)) && (!needle || searchMatches(needle, j.title, j.address, j.tenant, j.landlord, j.managedBy, j.category)));
  }, [data, section, q, view, mineCarried]);
  const carriedDone = useMemo(() => (data?.carriedDone ?? []).filter((j) => view === "everyone" || mineCarried.has(j.taskId)), [data, view, mineCarried]);
  const [takingOn, setTakingOn] = useState<string | null>(null);
  async function takeOn(j: CarriedJob) {
    setTakingOn(j.taskId);
    const r = await fetch("/api/works-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: j.kind, propertyName: j.propertyName, locality: j.locality, propertyId: j.propertyId,
        title: j.title, description: j.description, category: j.category, urgency: j.kind === "repair" ? j.urgency : null,
        dueAt: j.kind === "planned" ? j.dueAt : null, tenant: j.tenant, landlord: j.landlord, reportedBy: j.reportedBy || "Old system",
        rexpmTaskId: j.taskId, rexpmReportedOn: j.reportedOn, rexpmDueOn: j.dueOn,
      }),
    }).then((x) => x.json()).catch(() => null);
    setTakingOn(null);
    if (!r?.ok) return setError(r?.error ?? "Could not take the job on.");
    load();
    setOpenId(r.order.id);
  }
  /* The tiles count what the board shows. */
  const s = view === "mine" ? mine?.summary : data?.summary;
  /* Last month's figures, if we have them. The snapshot started on 11 Sep
     2026, so until roughly mid-October there is nothing to compare against
     and the tiles simply do not draw a delta - see lib/works-trend.ts. A
     tile that invents a trend is worse than a tile with no trend on it. */
  /* The month-ago snapshot is the whole business's, so Mine draws no delta
     rather than one measured against everybody's jobs. */
  const was = view === "mine" ? null : data?.lastMonth ?? null;
  const look = useNewLook("maintenance");

  /* ── THE NEW LOOK (lib/new-look "maintenance", 23 Oct 2026) ───────────────
     The same jobs, sections, Mine / Everyone and every button, drawn as the
     design's Maintenance: four figures, text tabs, a card per step (JobGroup).
     Invoices and Accounts are the same components as below, repainted. */
  if (look === null) {
    return <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Opening Maintenance…</p>;
  }
  if (look) {
    /* Every one of the four counts something you would rather have less of, so UP is the bad direction. */
    const delta = (now: number, before: number | null | undefined, money = false) => {
      if (before == null) return null;
      const d = now - before;
      return { text: d === 0 ? "level with" : `${d > 0 ? "+" : "-"}${money ? pounds(Math.abs(d)) : Math.abs(d)}`, tone: (d === 0 ? "quiet" : d > 0 ? "bad" : "good") as "quiet" | "bad" | "good" };
    };
    const tiles = s
      ? [
          { label: "Open jobs", value: String(s.open), d: delta(s.open, was?.open), note: `${s.byKind.repair} repair${s.byKind.repair === 1 ? "" : "s"} · ${s.byKind.planned} planned` },
          { label: "Overdue", value: String(s.overdue), d: delta(s.overdue, was?.overdue), note: s.emergencies ? `${s.emergencies} emergenc${s.emergencies === 1 ? "y" : "ies"} open` : "past their date", warm: s.overdue > 0 },
          { label: "Awaiting the landlord", value: String(s.awaitingLandlord), d: delta(s.awaitingLandlord, was?.awaitingLandlord), note: "quotes over their authority" },
          { label: "Invoiced, unpaid", value: pounds(s.invoicedUnpaidPence), d: delta(s.invoicedUnpaidPence, was?.invoicedUnpaidPence, true), note: "contractor invoices to settle" },
        ]
      : ["Open jobs", "Overdue", "Awaiting the landlord", "Invoiced, unpaid"].map((label) => ({ label, value: null, d: null, note: "", warm: false }));
    const jobsTab = section === "repair" || section === "planned";
    return (
      <div data-look="new" className="nl-page nl-rise nl-bo">
        <Mast
          title="Maintenance"
          blurb="Every job on the managed book, reported through paid. Repairs run on an urgency; planned jobs like a gas safety run on a date. A job carries its contractor, its quote, its invoice and who said yes."
          actions={
            <>
              <button type="button" className="nl-btn nl-btn--primary" onClick={() => { setSection("repair"); setRaising("repair"); }}><Ico name="plus" /> Report a repair</button>
              <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { setSection("planned"); setRaising("planned"); }}><Ico name="plus" /> Plan a certificate</button>
              <button type="button" className="nl-btn nl-btn--secondary" onClick={() => setLoggingDone(true)}>Log work already done</button>
              <WalkthroughLink step="repair" className="nl-bo-how" />
            </>
          }
        />

        {loggingDone && <div className="nl-bo-legacy"><LogDone contractors={data?.contractors ?? []} onClose={() => setLoggingDone(false)} onSaved={(id) => { setLoggingDone(false); load(); setOpenId(id); }} /></div>}

        <div className="nl-bo-stats">
          {tiles.map((t) => (
            <Stat
              key={t.label}
              label={t.label}
              value={error && !s ? "-" : t.value}
              warm={t.warm}
              delta={t.d ? t.d.text : undefined}
              deltaTone={t.d?.tone}
              note={t.d ? "from last month" : t.note}
            />
          ))}
        </div>

        <div className="nl-bo-tabrow">
          <Tabs
            label="Maintenance sections"
            value={section === "contractors" ? "repair" : section}
            onChange={(v) => setSection(v)}
            items={[
              { id: "repair" as const, label: "Repairs", count: s?.byKind.repair ?? null },
              { id: "planned" as const, label: "Planned", count: s?.byKind.planned ?? null },
              { id: "invoices" as const, label: "Invoices" },
              { id: "accounts" as const, label: "Accounts", count: orders.filter((o) => o.status === "invoiced").length || null },
            ]}
          />
          {section !== "contractors" && section !== "invoices" && (
            <div className="nl-bo-tabrow-side">
              {mine && (
                <span className="nl-toggle" role="group" aria-label="Whose jobs">
                  <button type="button" className={view === "mine" ? "is-on" : ""} aria-pressed={view === "mine"} title="Jobs on the homes in your own book, and any you raised" onClick={() => saveView("mine")}>Mine</button>
                  <button type="button" className={view === "everyone" ? "is-on" : ""} aria-pressed={view === "everyone"} title="Every job on the managed book" onClick={() => saveView("everyone")}>Everyone</button>
                </span>
              )}
              {section !== "accounts" && (
                <button type="button" className="nl-link nl-bo-aside" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide finished jobs" : "Show finished jobs"}</button>
              )}
            </div>
          )}
        </div>

        {jobsTab && (
          <div className="nl-filters mb-5">
            <label className="nl-fsearch">
              <Ico name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs, addresses, contractors" aria-label="Search jobs" />
            </label>
            {data && <span className="nl-fcount">{rows.length + carried.length} {rows.length + carried.length === 1 ? "job" : "jobs"}</span>}
          </div>
        )}
        {view === "mine" && mine?.note && section !== "contractors" && section !== "invoices" && <p className="nl-meta mb-4">{mine.note}</p>}

        {error && <Failed onRetry={load}>{error}</Failed>}
        {data && !data.live && <p className="nl-bo-note mb-4">{data.reason}</p>}

        {section === "invoices" ? (
          <div className="nl-bo-legacy"><Invoices onOpen={(id) => router.push(`/maintenance/invoices/${id}`)} /></div>
        ) : section === "accounts" ? (
          <div className="nl-bo-legacy"><Accounts orders={orders} loaded={!!data} onOpen={setOpenId} onChanged={load} canPayrun={data?.canPayrun === true} /></div>
        ) : section === "contractors" ? (
          <Loading>Contractors have their own place now, under Portfolio. Taking you there…</Loading>
        ) : !data ? (
          !error && <Loading>Reading the jobs…</Loading>
        ) : grouped.length === 0 && carried.length === 0 ? (
          <EmptyCard
            title={section === "repair" ? (view === "mine" ? "Nothing Broken on Your Homes" : "Nothing Broken That We Know Of") : view === "mine" ? "Nothing Planned on Your Homes" : "Nothing Planned"}
            action={
              <span className="flex flex-wrap items-center justify-center gap-3">
                <button type="button" className="nl-btn nl-btn--primary" onClick={() => setRaising(section === "repair" ? "repair" : "planned")}><Ico name="plus" /> {section === "repair" ? "Report a repair" : "Plan a certificate"}</button>
                {view === "mine" && <button type="button" className="nl-link" onClick={() => saveView("everyone")}>See everyone&apos;s</button>}
              </span>
            }
          >
            {section === "repair"
              ? "Report a repair when a tenant or landlord lets you know, and it runs from here."
              : "Plan a certificate from Compliance when one is coming up, or straight from here."}
          </EmptyCard>
        ) : (
          <div className="nl-bo-stack">
            {grouped.map((g) => (
              <section key={g.status} className="nl-bo-card nl-bo-group is-list">
                <div className="nl-bo-card-head">
                  <h2 className="nl-bo-card-title">{g.label}</h2>
                  <span className="nl-count">{g.rows.length}</span>
                </div>
                <ul className="nl-bo-jobs">
                  {g.rows.map((o) => {
                    const next = nextFor(o, data?.ringForApproval?.includes(o.id));
                    const urg = o.urgency ? URGENCIES.find((u) => u.id === o.urgency)?.label : null;
                    return (
                      <li key={o.id}>
                        <button type="button" className="nl-bo-job" onClick={() => setOpenId(o.id)}>
                          <span className="nl-bo-job-n nl-mono">#{o.ref}</span>
                          <span className="min-w-0">
                            <span className="nl-bo-job-title">{o.title}</span>
                            <span className="nl-meta block truncate">{o.propertyName}{o.locality ? `, ${o.locality}` : ""}{o.tenant ? ` · ${o.tenant}` : ""}</span>
                          </span>
                          <span className="nl-bo-job-tags">
                            {urg ? <Badge tone={o.urgency === "emergency" ? "accent" : "neutral"}>{urg}</Badge> : o.kind === "planned" ? <Badge tone="info">Planned</Badge> : null}
                            {o.category && <span className="nl-meta">{o.category}</span>}
                            <PayrunTag o={o} />
                          </span>
                          <span className={`nl-bo-job-next${next.hot ? " is-hot" : ""}`}>{next.text}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {carried.length > 0 && <div className="nl-bo-legacy"><CarriedList jobs={carried} readAt={data?.carriedReadAt ?? null} busy={takingOn} onTakeOn={(j) => void takeOn(j)} /></div>}
            {section === "planned" && carriedDone.length > 0 && <div className="nl-bo-legacy"><DoneOnCertificates jobs={carriedDone} /></div>}
          </div>
        )}
        {data?.carriedError && <div className="mt-4"><Failed>{data.carriedError}</Failed></div>}

        {raising && (
          <RaiseJob
            look="float"
            kind={raising}
            contractors={data?.contractors ?? []}
            onClose={() => setRaising(null)}
            onRaised={(o) => { setRaising(null); load(); setOpenId(o.id); }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Maintenance"
        blurb={
          rail === "contractors"
            ? "The people who do the work. Your own book of trades beside the company's, each with a profile, their jobs and what they are owed."
            : "Every job on the managed book, reported through paid. Repairs run on an urgency; planned jobs like a gas safety run on a date. Nothing here is a note-to-self: a job carries its contractor, its quote, its invoice and who said yes."
        }
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search jobs, addresses, contractors…"
        actions={
          <div className="flex flex-wrap gap-2">
            <PressButton onClick={() => { setSection("repair"); setRaising("repair"); }} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page">
              <span className="text-[15px] leading-none">+</span> Report a repair
            </PressButton>
            <PressButton onClick={() => { setSection("planned"); setRaising("planned"); }} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold">
              <span className="text-[15px] leading-none">+</span> Plan a certificate
            </PressButton>
            <PressButton onClick={() => setLoggingDone(true)} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold">
              Log work already done
            </PressButton>
            <WalkthroughLink step="repair" />
          </div>
        }
      />

      {loggingDone && <LogDone contractors={data?.contractors ?? []} onClose={() => setLoggingDone(false)} onSaved={(id) => { setLoggingDone(false); load(); setOpenId(id); }} />}

      {/* ── The four counts. ── */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {(
          [
            ["Open jobs", s ? String(s.open) : "•", s ? `${s.byKind.repair} repair${s.byKind.repair === 1 ? "" : "s"} · ${s.byKind.planned} planned` : "reading", "setting", s && was ? s.open - was.open : null, false],
            ["Overdue", s ? String(s.overdue) : "•", s?.emergencies ? `${s.emergencies} emergenc${s.emergencies === 1 ? "y" : "ies"} open` : "past their date", "bell", s && was ? s.overdue - was.overdue : null, false],
            ["Awaiting the landlord", s ? String(s.awaitingLandlord) : "•", "quotes over their authority", "user", s && was ? s.awaitingLandlord - was.awaitingLandlord : null, false],
            ["Invoiced, unpaid", s ? pounds(s.invoicedUnpaidPence) : "•", "contractor invoices to settle", "coin", s && was ? s.invoicedUnpaidPence - was.invoicedUnpaidPence : null, true],
          ] as const
        ).map(([k, v, hint, icon, delta, money]) => (
          /* Portfolio's tile (components/StatTile, 4 Oct 2026); Overdue is the
             one that matters, pink while any job is late, green when none is. */
          <StatTile key={k} label={k} value={v} icon={icon} tone={k === "Overdue" ? toneFor(s?.overdue) : undefined} hint={delta == null ? hint : undefined}>
            {/* Every one of these four counts something you would rather have
                less of, so UP is the bad direction on all four and the arrow
                can say so without a per-tile rule. Zero change is stated
                rather than drawn as an arrow pointing nowhere. */}
            {delta != null && (
              <p className="mt-2 flex items-center gap-1.5 truncate text-[11px]">
                <span className={delta === 0 ? "text-muted" : delta > 0 ? "text-accent-dark" : "text-[#2e7d5b]"}>
                  {delta === 0 ? "level with" : `${delta > 0 ? "↑" : "↓"} ${money ? pounds(Math.abs(delta)) : Math.abs(delta)} from`}
                </span>
                <span className="text-muted">last month</span>
              </p>
            )}
          </StatTile>
        ))}
      </div>

      {/* ── The two sections, and the trades book. ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(
          [
            ["repair", "Repairs", s?.byKind.repair],
            ["planned", "Planned maintenance", s?.byKind.planned],
            ["invoices", "Invoices", undefined],
            ["accounts", "Accounts", orders.filter((o) => o.status === "invoiced").length || undefined],
          ] as const
        ).filter(() => rail === "jobs").length > 0 && (
          /* The same sliding, brown-marked control as Properties and the rest
             of the OS. This screen drew its own black pills, which is the one
             place that colour appears anywhere in the product. */
          <Segmented
            className="w-full sm:w-auto md:min-w-[440px]"
            value={section === "contractors" ? "repair" : section}
            onChange={(v) => setSection(v)}
            options={[
              { id: "repair" as const, label: s?.byKind.repair != null ? `Repairs ${s.byKind.repair}` : "Repairs", icon: <DoodleIcon name="magic-wand" size={14} /> },
              { id: "planned" as const, label: s?.byKind.planned != null ? `Planned ${s.byKind.planned}` : "Planned", icon: <DoodleIcon name="calendar" size={14} /> },
              { id: "invoices" as const, label: "Invoices", icon: <DoodleIcon name="doc" size={14} /> },
              { id: "accounts" as const, label: "Accounts", icon: <DoodleIcon name="wallet" size={14} /> },
            ]}
          />
        )}
        {section !== "contractors" && section !== "invoices" && (
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto sm:w-auto">
            {mine && (
              <Segmented
                className="sm:min-w-[220px]"
                value={view}
                onChange={(v) => saveView(v)}
                options={[
                  { id: "mine" as const, label: "Mine", icon: <DoodleIcon name="user" size={14} />, title: "Jobs on the homes in your own book, and any you raised" },
                  { id: "everyone" as const, label: "Everyone", icon: <DoodleIcon name="grid" size={14} />, title: "Every job on the managed book" },
                ]}
              />
            )}
            {section !== "accounts" && (
              <button type="button" onClick={() => setShowClosed((v) => !v)} className="ml-auto text-[11.5px] text-muted underline transition-colors hover:text-ink sm:ml-0">
                {showClosed ? "Hide finished jobs" : "Show finished jobs"}
              </button>
            )}
          </div>
        )}
      </div>
      {view === "mine" && mine?.note && section !== "contractors" && section !== "invoices" && (
        <p className="mt-3 text-[12px] text-muted">{mine.note}</p>
      )}

      {error && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {data && !data.live && <p className="mt-4 text-[12.5px] text-muted">{data.reason}</p>}

      {section === "invoices" ? (
        <Invoices onOpen={(id) => router.push(`/maintenance/invoices/${id}`)} />
      ) : section === "accounts" ? (
        <Accounts orders={orders} loaded={!!data} onOpen={setOpenId} onChanged={load} canPayrun={data?.canPayrun === true} />
      ) : section === "contractors" ? (
        <p className="mt-6 text-[12.5px] text-muted">Contractors have their own place now, under Portfolio. Taking you there…</p>
      ) : !data ? (
        <p className="mt-6 text-[12.5px] text-muted">Reading the jobs…</p>
      ) : grouped.length === 0 && carried.length === 0 ? (
        /* An empty maintenance board is the good outcome, so it is drawn as
           one rather than as a dashed box apologising for having nothing in
           it. James's house, the line that goes with it, and the one button
           that would fill the screen if it needed filling. */
        <div className="fade-up mt-6 flex flex-col items-center gap-6 rounded-2xl border border-line/70 bg-accent-soft/25 p-8 text-center sm:flex-row sm:p-10 sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/maintenance-house.webp"
            alt=""
            aria-hidden
            className="art-figure w-56 shrink-0 select-none sm:w-72"
          />
          <div className="min-w-0">
            <p className="hand text-[24px] leading-tight">
              {section === "repair"
                ? view === "mine" ? "Nothing broken on your homes that we know of." : "Nothing broken that we know of."
                : view === "mine" ? "Nothing planned on your homes." : "Nothing planned."}
            </p>
            <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted">
              {section === "repair"
                ? "Report a repair when a tenant or landlord lets you know, and we'll help you keep everything on track."
                : "Plan a certificate from Compliance when one is coming up, or straight from here."}
              {view === "mine" && (
                <>
                  {" "}
                  <button type="button" onClick={() => saveView("everyone")} className="underline underline-offset-2 hover:text-ink">See everyone&apos;s</button>
                </>
              )}
            </p>
            <PressButton
              onClick={() => { setRaising(section === "repair" ? "repair" : "planned"); }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page"
            >
              <span className="text-[15px] leading-none">+</span>
              {section === "repair" ? "Report a repair" : "Plan a certificate"}
            </PressButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map((g) => (
            <section key={g.status} className="rounded-[22px] border border-line/50 bg-white p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px]">{g.label}</h2>
                <span className="text-[11px] text-muted">{g.rows.length}</span>
              </div>
              <ul className="mt-3 divide-y divide-line/50">
                {g.rows.map((o) => {
                  const next = nextFor(o, data?.ringForApproval?.includes(o.id));
                  return (
                    <li key={o.id}>
                      <button type="button" onClick={() => setOpenId(o.id)} className="grid w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-3 text-left transition-colors hover:bg-accent-soft/20 md:grid-cols-[52px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                        <span className="figures text-[13px] text-muted">#{o.ref}</span>
                        <span className="min-w-0">
                          <span className="hand block truncate text-[13.5px]">{o.title}</span>
                          <span className="block truncate text-[10.5px] text-muted">
                            {o.propertyName}{o.locality ? `, ${o.locality}` : ""}{o.tenant ? ` · ${o.tenant}` : ""}
                          </span>
                        </span>
                        <span className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto">
                          {o.urgency && (
                            <Pill tone={o.urgency === "emergency" ? "accent" : "neutral"}>{URGENCIES.find((u) => u.id === o.urgency)?.label}</Pill>
                          )}
                          <span className="text-[11px] text-muted">{o.category}</span>
                          <PayrunTag o={o} />
                        </span>
                        <span className={`col-start-2 text-[12px] md:col-start-auto ${next.hot ? "font-semibold text-accent-dark" : "text-muted"}`}>{next.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {carried.length > 0 && <CarriedList jobs={carried} readAt={data?.carriedReadAt ?? null} busy={takingOn} onTakeOn={(j) => void takeOn(j)} />}
          {section === "planned" && carriedDone.length > 0 && <DoneOnCertificates jobs={carriedDone} />}
        </div>
      )}
      {data?.carriedError && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{data.carriedError}</p>}

      {raising && (
        <RaiseJob
          kind={raising}
          contractors={data?.contractors ?? []}
          onClose={() => setRaising(null)}
          onRaised={(o) => { setRaising(null); load(); setOpenId(o.id); }}
        />
      )}
    </>
  );
}

/* ── Jobs still in the old system ───────────────────────────────────────── */

/** "at 14:05 today", or "on 30 Sep" - when the old system's list was last copied across. */
const readWhen = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const same = d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) === new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  return same ? `at ${time} today` : `on ${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })}`;
};

/**
 * The old system's open jobs (1 Oct 2026). Agent copy never names it. Each
 * row says how late it is against the date the old system expected it done,
 * and Take it on moves it here as a works order, without emailing anyone.
 */
function CarriedList({ jobs, readAt, busy, onTakeOn }: { jobs: CarriedJob[]; readAt: string | null; busy: string | null; onTakeOn: (j: CarriedJob) => void }) {
  const today = Date.now();
  return (
    <section className="rounded-[22px] border border-dashed border-line/60 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px]">Still in the Old System</h2>
        <span className="text-[11px] text-muted">{jobs.length} · copied across{readAt ? ` ${readWhen(readAt)}` : ""}. Take one on to run it here.</span>
      </div>
      <ul className="mt-3 divide-y divide-line/50">
        {jobs.map((j) => {
          const daysOver = j.dueAt ? Math.floor((today - new Date(j.dueAt).getTime()) / 86400000) + 1 : 0;
          const status = j.overdue
            ? `${daysOver} day${daysOver === 1 ? "" : "s"} over`
            : j.dueOn ? `Expected ${day(j.dueAt)}` : j.reportedOn ? `Reported ${new Date(j.reportedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No dates set";
          return (
            <li key={j.taskId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
              <span className="min-w-0">
                <span className="hand block truncate text-[13.5px]">{j.title}</span>
                <span className="block truncate text-[10.5px] text-muted">{j.propertyName}{j.locality ? `, ${j.locality}` : ""}{j.tenant ? ` · ${j.tenant}` : ""}</span>
              </span>
              <span className="col-start-1 flex flex-wrap items-center gap-1.5 md:col-start-auto">
                {j.urgency === "urgent" && <Pill tone="accent">Urgent</Pill>}
                <span className="text-[11px] text-muted">{j.category}</span>
              </span>
              <span className={`col-start-1 text-[12px] md:col-start-auto ${j.overdue ? "font-semibold text-accent-dark" : "text-muted"}`}>
                {status}{j.progress ? ` · ${j.progress}` : ""}
                {j.managedBy ? <span className="block text-[10.5px] font-normal text-muted">With {j.managedBy}</span> : null}
              </span>
              <PressButton disabled={busy === j.taskId} onClick={() => onTakeOn(j)} className="row-span-2 rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold disabled:opacity-40 md:row-span-1">
                {busy === j.taskId ? "Taking on…" : "Take it on"}
              </PressButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Planned jobs the old system still holds open, finished by a certificate now
 * on file (lib/works-carried, 5 Oct 2026). Off the board and its figures;
 * listed here so anybody can see which certificate closed each one.
 */
function DoneOnCertificates({ jobs }: { jobs: CarriedDone[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-baseline justify-between gap-3 text-left">
        <h2 className="text-[15px]">Done: Certificate on File</h2>
        <span className="text-[11px] text-muted">
          {jobs.length} job{jobs.length === 1 ? "" : "s"} the old system still shows as open, finished by a certificate filed since. {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <ul className="mt-3 divide-y divide-line/50">
          {jobs.map((j) => (
            <li key={j.taskId} className="grid grid-cols-1 gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)]">
              <span className="min-w-0">
                <span className="hand block truncate text-[13.5px]">{j.title}</span>
                <span className="block truncate text-[10.5px] text-muted">{j.propertyName}{j.locality ? `, ${j.locality}` : ""}{j.managedBy ? ` · with ${j.managedBy}` : ""}</span>
              </span>
              <span className="flex items-start gap-2 text-[12px] text-[#56634a]">
                <DoodleIcon name="checklist" size={14} className="mt-0.5 shrink-0" />
                {j.evidence}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Raise a job ────────────────────────────────────────────────────────── */

/* ── Accounts: the bills to pay, PayProp-ready ──────────────────────────── */

/**
 * What accounts key into PayProp (Michael, 7 Sep 2026): every job with an
 * invoice on it and nobody paid yet. Who, how much, which property, which
 * landlord, the invoice number and our reference. Mark it paid here once
 * it has gone through and it drops off. PayProp is read-only to the OS, so
 * the payment itself is made there.
 */
function Accounts({ orders, loaded, onOpen, onChanged, canPayrun = false }: { orders: WorksOrder[]; loaded: boolean; onOpen: (id: string) => void; onChanged: () => void; canPayrun?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /* On the payment run (James, 21 Oct 2026): the list splits into what is
     still to key on PayProp and what is keyed and coming out of the rent. */
  const [run, setRun] = useState<"to_payprop" | "on_run">("to_payprop");
  const unpaid = orders.filter((o) => o.status === "invoiced" || (o.status === "done" && o.invoicePence != null)).sort((a, b) => (a.invoicedAt ?? "").localeCompare(b.invoicedAt ?? ""));
  const toPayprop = unpaid.filter((o) => !o.payrunAt);
  const onRun = unpaid.filter((o) => !!o.payrunAt);
  const rows = run === "on_run" ? onRun : toPayprop;
  const total = rows.reduce((a, o) => a + (o.invoicePence ?? 0), 0);
  /* WHAT MICHAEL TYPES INTO PAYPROP, in the order he types it.

     Michael, 7 Sep 2026: sixty to seventy contractor invoices a month, keyed
     in by hand. We cannot make the payment for him - PayProp is read-only to
     the OS, and the payee lives over there with the bank details - but the
     re-typing is ours to remove: one press puts the line on the clipboard, and
     the whole run comes down as a file he can work from. */
  const payFields = (o: WorksOrder) => [
    o.payee === "agent" ? `${o.raisedBy} (paid it themselves)` : o.contractorName || "",
    ((o.invoicePence ?? 0) / 100).toFixed(2),
    o.invoiceRef || "",
    [o.propertyName, o.locality].filter(Boolean).join(", "),
    o.landlord || "",
    `#${o.ref} ${o.title}`,
    o.invoicedAt ? new Date(o.invoicedAt).toLocaleDateString("en-GB") : "",
  ];
  const HEADS = ["Pay", "Amount", "Invoice number", "Property", "Landlord", "Job", "Invoiced"];

  /* Two ways, because the modern one is not always allowed: the clipboard API
     refuses without a focused, permitted, secure context, and Michael on a
     locked-down machine would get nothing and no reason. The old execCommand
     path works in every browser we care about, so it catches what the new one
     drops, and only if BOTH fail does the screen say so. */
  async function copyRow(o: WorksOrder) {
    const line = payFields(o).join("\t");
    const done = () => {
      setErr(null);
      setCopied(o.id);
      window.setTimeout(() => setCopied((c) => (c === o.id ? null : c)), 2000);
    };
    try {
      await navigator.clipboard.writeText(line);
      return done();
    } catch {
      /* Fall through and try the old way. */
    }
    try {
      const box = document.createElement("textarea");
      box.value = line;
      box.setAttribute("readonly", "");
      box.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(box);
      if (ok) return done();
    } catch {
      /* Nothing left to try. */
    }
    setErr("Your browser would not let the page copy. Select the row and copy it by hand.");
  }

  function downloadRun() {
    /* Quoted properly: a property called "Flat 2, Mercer Street" would split a
       bare comma-separated file into two columns and put the money in the
       wrong one. */
    const cell = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [HEADS, ...rows.map(payFields)].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `to-pay-${londonToday()}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function paid(o: WorksOrder) {
    setBusy(o.id);
    setErr(null);
    const r = await fetch(`/api/works-orders/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "paid", paidHow: "payprop" } satisfies Move) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setErr(r?.error ?? "Could not mark it paid.");
    onChanged();
  }
  async function payrun(o: WorksOrder, undo = false) {
    setBusy(o.id);
    setErr(null);
    const r = await fetch(`/api/works-orders/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: undo ? "payrun_undo" : "payrun" } satisfies Move) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setErr(r?.error ?? (undo ? "Could not take it off the payment run." : "Could not put it on the payment run."));
    onChanged();
  }
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="text-[15px]">To pay</h2>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="mt-0.5 max-w-[68ch] text-[11.5px] text-muted">
            Every invoice on a job that has not been paid, with what PayProp needs. {loaded ? `${rows.length} to pay · ${pounds(total)}.` : ""} Copy a line
            rather than re-typing it, or take the whole run as a file. Once it&apos;s keyed on PayProp, put it on the payment run so the agent can see it&apos;s being paid. Mark it paid once it has gone through and it drops off.
          </p>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={downloadRun}
              className="shrink-0 whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
            >
              Download the run
            </button>
          )}
        </div>
        <Segmented
          className="mt-3 w-full sm:w-auto"
          value={run}
          onChange={(v) => setRun(v)}
          options={[
            { id: "to_payprop" as const, label: loaded ? `To put on PayProp ${toPayprop.length}` : "To put on PayProp", icon: <DoodleIcon name="doc" size={14} /> },
            { id: "on_run" as const, label: loaded ? `${PAYRUN_LABEL} ${onRun.length}` : PAYRUN_LABEL, icon: <DoodleIcon name="wallet" size={14} /> },
          ]}
        />
      </div>
      {err && <p className="text-[12.5px] text-accent-dark">{err}</p>}
      <div className="rounded-[22px] border border-line/50 bg-white p-5">
        {!loaded ? (
          <p className="text-[12.5px] text-muted">Reading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            {run === "on_run"
              ? "Nothing on the payment run. An invoice moves here once it's keyed on PayProp, and drops off when it's marked paid."
              : "Nothing to put on PayProp. An invoice lands here the moment a contractor uploads it or an agent keys it onto a job."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line/70 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  <th className="pb-2 pr-3">Job</th><th className="pb-2 pr-3">Property</th><th className="pb-2 pr-3">Landlord</th><th className="pb-2 pr-3">Pay</th><th className="pb-2 pr-3">Invoice</th><th className="pb-2 pr-3 text-right">Amount</th><th className="pb-2 pr-3">In</th><th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-line/40 last:border-0">
                    <td className="py-3 pr-3"><button type="button" onClick={() => onOpen(o.id)} className="text-left hover:underline"><span className="figures text-muted">#{o.ref}</span> {o.title}</button></td>
                    <td className="max-w-[220px] truncate py-3 pr-3">{o.propertyName}{o.locality ? `, ${o.locality}` : ""}</td>
                    <td className="py-3 pr-3">{o.landlord || <span className="text-muted">—</span>}</td>
                    <td className="py-3 pr-3">{o.payee === "agent" ? <>{o.raisedBy} <span className="text-muted">(paid it themselves)</span></> : o.contractorName || <span className="text-muted">—</span>}</td>
                    <td className="py-3 pr-3 text-muted">{o.invoiceRef || "no number"}</td>
                    <td className="figures py-3 pr-3 text-right">{pounds(o.invoicePence)}</td>
                    <td className="py-3 pr-3 text-muted">{day(o.invoicedAt)}{o.payrunAt && <span className="block text-[10.5px]">On the run {day(o.payrunAt)}</span>}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void copyRow(o)}
                          title="Copy this line: who to pay, how much, the invoice number and the property"
                          className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[12px] transition hover:border-ink/40"
                        >
                          {copied === o.id ? "Copied" : "Copy"}
                        </button>
                        {canPayrun && !o.payrunAt && (
                          <button type="button" disabled={busy === o.id} onClick={() => void payrun(o)} title="Keyed on PayProp: the agent sees it's coming out of the rent" className="whitespace-nowrap rounded-full border border-ink px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50">{PAYRUN_LABEL}</button>
                        )}
                        {canPayrun && o.payrunAt && (
                          <button type="button" disabled={busy === o.id} onClick={() => void payrun(o, true)} className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[12px] text-muted transition hover:border-ink/40 disabled:opacity-50">Take off</button>
                        )}
                        <button type="button" disabled={busy === o.id} onClick={() => void paid(o)} className="whitespace-nowrap rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50">Paid in PayProp</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── The invoicing schedule ─────────────────────────────────────────────── */

type InvoiceRow = { id: string; number: string | null; status: string; toName: string; property: string; issueDate: string; dueDate: string; reference: string; orderRef: number | null; lines: { qty: number; unitPence: number; vatRate: number }[] };
type Settings = { companyName: string; addressLines: string[]; email: string; phone: string; accountsEmail: string; complianceEmail: string; vatNumber: string; companyNumber: string; bankName: string; accountName: string; sortCode: string; accountNumber: string; prefix: string; termsDays: number; defaultVatRate: number; footer: string };

const INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "good" }> = {
  draft: { label: "Draft", tone: "neutral" }, issued: { label: "Produced", tone: "accent" }, sent: { label: "Sent", tone: "accent" }, paid: { label: "Paid", tone: "good" }, void: { label: "Void", tone: "neutral" },
};
const totalOf = (lines: InvoiceRow["lines"]) => lines.reduce((a, l) => { const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPence) || 0)); return a + net + Math.round((net * (Number(l.vatRate) || 0)) / 100); }, 0);

/**
 * Pick a home, and the invoice arrives with the landlord on it and the fee
 * already worked out from that home's rent and service. The same managed
 * book the rest of Maintenance searches.
 */
function PropertyInvoice({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [props, setProps] = useState<Property[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/compliance/book", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProps(Array.isArray(j.properties) ? j.properties : []))
      .catch(() => setProps([]));
  }, []);
  const hits = useMemo(() => {
    const needle = q.trim();
    if (!props || needle.length < 2) return [];
    return props.filter((p) => searchMatches(needle, p.name, p.locality)).slice(0, 8);
  }, [props, q]);
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  return (
    <div className="rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[14px]">Invoice a property</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">The landlord, the rent and the service come off the book. The fee is worked out from the rates under Finances.</p>
        </div>
        <button type="button" onClick={onClose} className="text-[11.5px] text-muted underline">Cancel</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={props === null ? "Reading the book…" : "Start typing the address"} className={`mt-3 ${field}`} />
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-line/50 rounded-xl border border-line/80 bg-card">
          {hits.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)} className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-panel">
                <span className="text-[13px]">{p.name}</span>
                <span className="text-[10.5px] text-muted">{p.locality}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {props && q.trim().length > 2 && hits.length === 0 && <p className="mt-2 text-[11.5px] text-muted">Nothing on the book matches that.</p>}
    </div>
  );
}

function Invoices({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<{ invoices: InvoiceRow[]; settings: Settings | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fromProperty, setFromProperty] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/invoices", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) { setData(j); setSettings(j.settings); } else setErr(j.error ?? "Could not read the invoices."); }).catch(() => setErr("Could not read the invoices."));
  }, []);
  useEffect(load, [load]);

  /* An invoice against a home, with the fees worked out from that home's
     rent and service (James, 7 Sep 2026). */
  async function fromHome(id: string) {
    setBusy(true);
    const r = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId: id }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not draft the invoice.");
    onOpen(r.invoice.id);
  }

  async function blank() {
    setBusy(true);
    const r = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not draft the invoice.");
    onOpen(r.invoice.id);
  }
  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    const r = await fetch("/api/invoices", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not save the settings.");
    setSettings(r.settings);
    setShowSettings(false);
  }
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[12.5px] outline-none focus:border-ink";
  const rows = data?.invoices ?? [];
  const outstanding = rows.filter((r) => r.status === "issued" || r.status === "sent").reduce((a, r) => a + totalOf(r.lines), 0);
  const overdue = rows.filter((r) => (r.status === "issued" || r.status === "sent") && r.dueDate && new Date(r.dueDate).getTime() < Date.now()).length;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line/50 bg-white p-5">
        <div>
          <h2 className="text-[15px]">The invoicing schedule</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Every invoice we raise, numbered in order. A draft takes its number when it is produced.
            {data ? ` ${pounds(outstanding)} outstanding${overdue ? ` · ${overdue} overdue` : ""}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]">Who invoices are from</button>
          <button type="button" onClick={() => setFromProperty(true)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]">+ From a property</button>
          <PressButton onClick={() => void blank()} className={`rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>+ New invoice</PressButton>
        </div>
      </div>
      {err && <p className="text-[12.5px] text-accent-dark">{err}</p>}

      {fromProperty && <PropertyInvoice onClose={() => setFromProperty(false)} onPick={(id) => { setFromProperty(false); void fromHome(id); }} />}

      {showSettings && settings && (
        <div className="rounded-[22px] border border-line/50 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Who invoices are from</p>
          <p className="mt-1 text-[11.5px] text-muted">Copied onto every invoice when it is produced, so an old invoice keeps the details it went out with.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} placeholder="Company name" className={field} />
            <input value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} placeholder="Accounts email" className={field} />
            <input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} placeholder="Phone" className={field} />
            <div className="sm:col-span-2 lg:col-span-3">
              <input value={settings.accountsEmail ?? ""} onChange={(e) => setSettings({ ...settings, accountsEmail: e.target.value })} placeholder="Accounts inbox - where a contractor's invoice is sent when it lands on a job" className={field} />
              <p className="mt-1 text-[11px] text-muted">Every invoice that lands on a job goes here with the PayProp details, and sits on the Accounts list until it is marked paid.</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <input value={settings.complianceEmail ?? ""} onChange={(e) => setSettings({ ...settings, complianceEmail: e.target.value })} placeholder="Compliance inbox - where finished jobs and their documents go" className={field} />
              <p className="mt-1 text-[11px] text-muted">A job that finishes goes here with its documents listed, and anything added afterwards is sent over as it lands. Nothing goes while a job is still open.</p>
            </div>
            <textarea value={settings.addressLines.join("\n")} onChange={(e) => setSettings({ ...settings, addressLines: e.target.value.split("\n") })} placeholder="Address, one line per line" rows={3} className={`${field} sm:col-span-2 lg:col-span-3`} />
            <input value={settings.vatNumber} onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })} placeholder="VAT number" className={field} />
            <input value={settings.companyNumber} onChange={(e) => setSettings({ ...settings, companyNumber: e.target.value })} placeholder="Company number" className={field} />
            <input value={settings.prefix} onChange={(e) => setSettings({ ...settings, prefix: e.target.value })} placeholder="Number prefix, e.g. INV-" className={field} />
            <input value={settings.bankName} onChange={(e) => setSettings({ ...settings, bankName: e.target.value })} placeholder="Bank" className={field} />
            <input value={settings.accountName} onChange={(e) => setSettings({ ...settings, accountName: e.target.value })} placeholder="Account name" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <input value={settings.sortCode} onChange={(e) => setSettings({ ...settings, sortCode: e.target.value })} placeholder="Sort code" className={field} />
              <input value={settings.accountNumber} onChange={(e) => setSettings({ ...settings, accountNumber: e.target.value })} placeholder="Account number" className={field} />
            </div>
            <input value={settings.termsDays} onChange={(e) => setSettings({ ...settings, termsDays: Number(e.target.value) || 0 })} placeholder="Payment terms, days" className={field} />
            <input value={settings.defaultVatRate} onChange={(e) => setSettings({ ...settings, defaultVatRate: Number(e.target.value) || 0 })} placeholder="Default VAT %" className={field} />
            <textarea value={settings.footer} onChange={(e) => setSettings({ ...settings, footer: e.target.value })} placeholder="The note at the foot of a new invoice" rows={2} className={`${field} sm:col-span-2 lg:col-span-3`} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowSettings(false)} className="rounded-full border border-line/80 px-4 py-1.5 text-[12px] text-muted">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void saveSettings()} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">Save</button>
          </div>
        </div>
      )}

      <div className="rounded-[22px] border border-line/50 bg-white p-5">
        {!data ? (
          <p className="text-[12.5px] text-muted">Reading the schedule…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-muted">No invoices yet. Draft one from a finished job, or start a blank one.</p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line/70 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                <th className="pb-2 pr-3">Number</th><th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">To</th><th className="pb-2 pr-3">For</th><th className="pb-2 pr-3 text-right">Total</th><th className="pb-2 pr-3">Due</th><th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = INVOICE_STATUS[r.status] ?? INVOICE_STATUS.draft;
                const late = (r.status === "issued" || r.status === "sent") && r.dueDate && new Date(r.dueDate).getTime() < Date.now();
                return (
                  <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-line/40 transition-colors last:border-0 hover:bg-page">
                    <td className="figures py-3 pr-3">{r.number ?? <span className="text-muted">draft</span>}</td>
                    <td className="py-3 pr-3 text-muted">{day(r.issueDate)}</td>
                    <td className="py-3 pr-3">{r.toName || <span className="text-muted">—</span>}</td>
                    <td className="max-w-[260px] truncate py-3 pr-3 text-muted">{r.reference || r.property || "—"}</td>
                    <td className="figures py-3 pr-3 text-right">{pounds(totalOf(r.lines))}</td>
                    <td className={`py-3 pr-3 ${late ? "font-semibold text-accent-dark" : "text-muted"}`}>{day(r.dueDate)}</td>
                    <td className="py-3"><Pill tone={st.tone}>{st.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Produce assigns the next number and freezes the company details onto the invoice. Send emails the page they can open and print. A void invoice keeps its number, so the sequence always reads.{" "}
        <Link href="/marketing-hub/templates" className="underline">The invoice email is editable under Marketing.</Link>
      </p>
    </div>
  );
}

/**
 * Work already done, with its invoice (Rhiannon, 19 Oct 2026): "the work was
 * completed outside of OS... I just want to add the invoice for payment".
 * Pick who did it, then the same form as Log an invoice on Contractors: it
 * goes on as a finished job with the invoice, nobody but accounts is told,
 * and it lands on the money step.
 */
function LogDone({ contractors, onClose, onSaved }: { contractors: Contractor[]; onClose: () => void; onSaved: (orderId: string) => void }) {
  const [id, setId] = useState("");
  const picked = contractors.find((c) => c.id === id) ?? null;
  return (
    <div className="mt-6 rounded-[22px] border border-ink/30 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px]">Log Work Already Done</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">For a job finished before it was on the OS. Nothing goes to the landlord, the tenant or the contractor. It goes on the home with the invoice, ready to pay.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-[11.5px] text-muted underline">Cancel</button>
      </div>
      <div className="mt-4 max-w-md">
        {contractors.length === 0 ? (
          <p className="text-[12.5px] text-muted">There are no contractors in your book yet. Add them under <a href="/contractors" className="underline">Portfolio, Contractors</a> first.</p>
        ) : (
          <FieldSelect value={id} onChange={setId} placeholder="Who did the work?" options={contractors.map((c) => ({ value: c.id, label: `${c.name} · ${c.trade}` }))} extra={{ label: "+ Someone not in the book", onPick: () => { window.location.href = "/contractors"; } }} />
        )}
      </div>
      {picked && (
        <div className="mt-4">
          <LogInvoice key={picked.id} contractor={picked} onClose={onClose} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}
