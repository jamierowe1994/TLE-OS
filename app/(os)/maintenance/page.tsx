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
import { ContractorForm, BLANK_CONTRACTOR } from "@/components/WorksNow";
import WalkthroughLink from "@/components/showroom/WalkthroughLink";
import RaiseJob from "@/components/maintenance/RaiseJob";
import JobDrawer from "@/components/maintenance/JobDrawer";
import { Fact, OPEN, STATUS_LABEL, day, nextFor, pounds, type Property } from "@/components/maintenance/works-ui";
import { searchMatches } from "@/lib/search-match";

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
    if (rail === "contractors") setSection("contractors");
    else if (params.get("section") === "invoices") setSection("invoices");
    else if (params.get("section") === "accounts") setSection("accounts");
    /* A link straight to the planned jobs (the Showroom's gas safety walkthrough). */
    else if (params.get("section") === "planned") setSection("planned");
    else setSection((cur) => (cur === "contractors" ? "repair" : cur));
  }, [rail, params]);
  const [data, setData] = useState<{ orders: WorksOrder[]; contractors: Contractor[]; summary: WorksSummary | null; lastMonth?: WorksSummary | null; lastMonthOn?: string | null; live: boolean; reason?: string; canCorporate?: boolean; carried?: CarriedJob[]; carriedDone?: CarriedDone[]; carriedReadAt?: string | null; carriedError?: string; ringForApproval?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [raising, setRaising] = useState<Kind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const orders = data?.orders ?? [];
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
    return (data?.carried ?? []).filter((j) => j.kind === section && (!needle || searchMatches(needle, j.title, j.address, j.tenant, j.landlord, j.managedBy, j.category)));
  }, [data, section, q]);
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
  const s = data?.summary;
  /* Last month's figures, if we have them. The snapshot started on 11 Sep
     2026, so until roughly mid-October there is nothing to compare against
     and the tiles simply do not draw a delta - see lib/works-trend.ts. A
     tile that invents a trend is worse than a tile with no trend on it. */
  const was = data?.lastMonth ?? null;
  const open = orders.find((o) => o.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Maintenance"
        blurb={
          rail === "contractors"
            ? "The people who do the work. Your own book of trades beside the company's, each with a profile, their jobs and what they are owed."
            : "Every job on the managed book, reported through paid. Repairs run on an urgency; planned jobs like a gas safety run on a date. Nothing here is a note-to-self: a job carries its contractor, its quote, its invoice and who said yes."
        }
        /* James's own artwork, trimmed to its ink so the drawing's ground
           line IS the bottom edge of the file - which is what lands it ON the
           rule rather than near it. Wide, so the aspect is passed and the
           blurb reserves the real width. */
        illustration="/illustrations/maintenance-selfie.webp"
        /* Measured at 390px on 14 Sep 2026: the artwork landed on the "+ Plan a job" button.
           The masthead's phone reserve is one measured guess and it does not
           hold here, so on a phone the drawing goes and the words keep the
           width. Nine other pages were checked and keep theirs. */
        hideArtOnPhone
        illustrationHeight={250}
        illustrationAspect={1.7963}
        lineBreak="none"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search jobs, addresses, contractors…"
        actions={
          <div className="flex gap-2">
            <PressButton onClick={() => { setSection("repair"); setRaising("repair"); }} className="flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page">
              <span className="text-[15px] leading-none">+</span> Report a repair
            </PressButton>
            <PressButton onClick={() => { setSection("planned"); setRaising("planned"); }} className="flex items-center gap-2 rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold">
              <span className="text-[15px] leading-none">+</span> Plan a certificate
            </PressButton>
            <WalkthroughLink step="repair" />
          </div>
        }
      />

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
        {section !== "contractors" && section !== "invoices" && section !== "accounts" && (
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="ml-auto text-[11.5px] text-muted underline transition-colors hover:text-ink">
            {showClosed ? "Hide finished jobs" : "Show finished jobs"}
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {data && !data.live && <p className="mt-4 text-[12.5px] text-muted">{data.reason}</p>}

      {section === "invoices" ? (
        <Invoices onOpen={(id) => router.push(`/maintenance/invoices/${id}`)} />
      ) : section === "accounts" ? (
        <Accounts orders={orders} loaded={!!data} onOpen={setOpenId} onChanged={load} />
      ) : section === "contractors" ? (
        <Contractors onChange={load} openJob={(id) => { router.push("/maintenance?section=jobs"); setOpenId(id); }} />
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
              {section === "repair" ? "Nothing broken that we know of." : "Nothing planned."}
            </p>
            <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted">
              {section === "repair"
                ? "Report a repair when a tenant or landlord lets you know, and we'll help you keep everything on track."
                : "Plan a certificate from Compliance when one is coming up, or straight from here."}
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
          {section === "planned" && (data?.carriedDone?.length ?? 0) > 0 && <DoneOnCertificates jobs={data!.carriedDone!} />}
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
      {open && (
        <JobDrawer
          order={open}
          contractors={data?.contractors ?? []}
          canCorporate={!!data?.canCorporate}
          onClose={() => setOpenId(null)}
          onChanged={(o) => { setData((d) => (d ? { ...d, orders: d.orders.map((x) => (x.id === o.id ? o : x)) } : d)); load(); }}
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
function Accounts({ orders, loaded, onOpen, onChanged }: { orders: WorksOrder[]; loaded: boolean; onOpen: (id: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const rows = orders.filter((o) => o.status === "invoiced" || (o.status === "done" && o.invoicePence != null)).sort((a, b) => (a.invoicedAt ?? "").localeCompare(b.invoicedAt ?? ""));
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
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="text-[15px]">To pay</h2>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="mt-0.5 max-w-[68ch] text-[11.5px] text-muted">
            Every invoice on a job that has not been paid, with what PayProp needs. {loaded ? `${rows.length} to pay · ${pounds(total)}.` : ""} Copy a line
            rather than re-typing it, or take the whole run as a file. Mark it paid once it has gone through and it drops off.
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
      </div>
      {err && <p className="text-[12.5px] text-accent-dark">{err}</p>}
      <div className="rounded-[22px] border border-line/50 bg-white p-5">
        {!loaded ? (
          <p className="text-[12.5px] text-muted">Reading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-muted">Nothing to pay. An invoice lands here the moment a contractor uploads it or an agent keys it onto a job.</p>
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
                    <td className="py-3 pr-3 text-muted">{day(o.invoicedAt)}</td>
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

/* ── The trades book ────────────────────────────────────────────────────── */

function Contractors({ onChange, openJob }: { onChange: () => void; openJob: (id: string) => void }) {
  const [data, setData] = useState<{ contractors: Contractor[]; me: string | null; canCorporate: boolean } | null>(null);
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/contractors", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) setData(j); else setErr(j.error ?? "Could not read the book."); }).catch(() => setErr("Could not read the book."));
  }, []);
  useEffect(load, [load]);
  const all = data?.contractors ?? [];
  const needle = q.trim();
  const match = (c: Contractor) => !needle || searchMatches(needle, c.name, c.contact, c.trade, c.phone, c.email, c.notes, c.registration);
  const mine = all.filter((c) => c.ownerId && match(c));
  const corporate = all.filter((c) => !c.ownerId && match(c));

  const Shelf = ({ title, blurb, rows, canEdit }: { title: string; blurb: string; rows: Contractor[]; canEdit: boolean }) => (
    <section className="rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px]">{title}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">{blurb}</p>
        </div>
        <span className="text-[11px] text-muted">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">Nobody here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/50">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <button type="button" onClick={() => setProfile(c.id)} className="min-w-0 flex-1 text-left">
                <p className={`hand text-[13.5px] ${c.active ? "" : "text-muted line-through"}`}>{c.name} <span className="font-sans text-[11px] text-muted">· {c.trade}</span></p>
                <p className="truncate text-[11px] text-muted">{[c.contact, c.phone, c.email, c.registration].filter(Boolean).join(" · ") || "no contact details yet"}</p>
              </button>
              {canEdit && <button type="button" onClick={() => setEditing(c)} className="text-[11.5px] text-muted underline hover:text-ink">Edit</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the book…" className="w-full max-w-xs rounded-full border border-line/80 bg-box px-4 py-2 text-[12.5px] outline-none focus:border-ink" />
        <PressButton onClick={() => setEditing({ ...BLANK_CONTRACTOR })} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">+ Add a contractor</PressButton>
      </div>
      {err && <p className="text-[12.5px] text-accent-dark">{err}</p>}
      {editing && data && (
        <div className="rounded-[22px] border border-line/50 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{editing.id ? "Edit" : "New contractor"}</p>
          <div className="mt-3">
            <ContractorForm initial={editing} canCorporate={data.canCorporate} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChange(); }} />
          </div>
        </div>
      )}
      {!data ? (
        <p className="text-[12.5px] text-muted">Reading the book…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Shelf title="Your contractors" blurb="The people you ring. Yours alone - nobody else sees them." rows={mine} canEdit />
          <Shelf title="The company's contractors" blurb="Kept by the office. Everyone can book them." rows={corporate} canEdit={data.canCorporate} />
        </div>
      )}
      {profile && <ContractorProfile id={profile} onClose={() => setProfile(null)} onEdit={(c) => { setProfile(null); setEditing(c); }} openJob={openJob} canEdit={(c) => Boolean(c.ownerId) || Boolean(data?.canCorporate)} />}
    </div>
  );
}

/** One contractor, pulled out: who they are, what they have done for us, what is owed. */
function ContractorProfile({ id, onClose, onEdit, openJob, canEdit }: { id: string; onClose: () => void; onEdit: (c: Contractor) => void; openJob: (id: string) => void; canEdit: (c: Contractor) => boolean }) {
  const [d, setD] = useState<{ contractor: Contractor; stats: { jobs: number; open: number; quotedPence: number; invoicedPence: number; paidPence: number; outstandingPence: number; lastJobAt: string | null }; jobs: WorksOrder[] } | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    fetch(`/api/contractors?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) setD(j); }).catch(() => {});
    return () => cancelAnimationFrame(t);
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = d?.contractor;
  return (
    <div className="fixed inset-0 z-[130]">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${shown ? "translate-x-0" : "translate-x-full"}`} style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        <div className="shrink-0 border-b border-line/70 px-6 pt-5">
          <div className="flex items-start justify-between gap-3 pb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{c ? (c.ownerId ? "Your contractor" : "Company contractor") : "Contractor"}{c && !c.active ? " · not active" : ""}</p>
              <h2 className="mt-1 text-[20px] leading-tight">{c?.name ?? "Reading…"}</h2>
              <p className="mt-1 text-[12px] text-muted">{c ? [c.trade, c.contact, c.registration].filter(Boolean).join(" · ") : ""}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {c && canEdit(c) && <button type="button" onClick={() => onEdit(c)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">Edit</button>}
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
            </div>
          </div>
        </div>
        {c && d && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <section className="rounded-[22px] border border-line/50 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">How to reach them</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
                    <Fact k="Phone" v={c.phone || "—"} />
                    <Fact k="Email" v={c.email || "—"} />
                    <Fact k="Website" v={c.website || "—"} />
                    <Fact k="Address" v={c.address || "—"} />
                    <Fact k="Registration" v={c.registration || "—"} />
                    <Fact k="Added by" v={c.createdBy || "—"} />
                  </dl>
                  {c.notes && <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed">{c.notes}</p>}
                </section>
                <section className="rounded-[22px] border border-line/50 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Their jobs</p>
                  {d.jobs.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-muted">None yet. Put them on a job and it shows here.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line/50">
                      {d.jobs.map((o) => (
                        <li key={o.id}>
                          <button type="button" onClick={() => { onClose(); openJob(o.id); }} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-accent-soft/20">
                            <span className="min-w-0">
                              <span className="block truncate text-[13px]">#{o.ref} · {o.title}</span>
                              <span className="block truncate text-[10.5px] text-muted">{o.propertyName} · {STATUS_LABEL[o.status]}</span>
                            </span>
                            <span className="figures shrink-0 text-[12.5px]">{o.invoicePence != null ? pounds(o.invoicePence) : o.quotePence != null ? `${pounds(o.quotePence)} quoted` : "—"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <section className="rounded-[22px] border border-line/50 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Money through them</p>
                <dl className="mt-2 space-y-2 text-[12.5px]">
                  <div className="flex justify-between"><dt className="text-muted">Jobs</dt><dd className="figures">{d.stats.jobs}{d.stats.open ? ` · ${d.stats.open} open` : ""}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Quoted</dt><dd className="figures">{pounds(d.stats.quotedPence)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Invoiced</dt><dd className="figures">{pounds(d.stats.invoicedPence)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="figures">{pounds(d.stats.paidPence)}</dd></div>
                  <div className="flex justify-between border-t border-line/60 pt-2 font-semibold"><dt>Owed to them</dt><dd className="figures">{pounds(d.stats.outstandingPence)}</dd></div>
                </dl>
                <p className="mt-3 text-[11px] text-muted">Read off the jobs they were on: the quote logged, the invoice added, and what is marked paid.</p>
              </section>
            </div>
          </div>
        )}
      </aside>
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
