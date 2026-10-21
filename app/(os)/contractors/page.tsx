"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile, { toneFor } from "@/components/StatTile";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import { PressButton } from "@/components/Bits";
import type { Contractor, Status } from "@/lib/works-orders";
import { ContractorForm, BLANK_CONTRACTOR } from "@/components/WorksNow";
import ContractorProfile, { DateChip } from "@/components/contractors/ContractorProfile";
import ContractorMark from "@/components/contractors/ContractorMark";
import { RaiseInvoiceDrawer } from "@/components/contractors/InvoiceForm";
import { credentialsOf, jobHref, liabilityOf } from "@/components/contractors/credentials";
import { PayrunTag, day, pounds } from "@/components/maintenance/works-ui";
import { hhmm, londonDay, londonToday, ukDaysFromToday, worksLate } from "@/lib/london-clock";
import { searchMatches } from "@/lib/search-match";
import { usePref } from "@/lib/prefs-store";

/**
 * Portfolio > Contractors (James, 19 Oct 2026, after the back-office Q&A).
 *
 * The book of trades used to be a hidden corner of Maintenance that nothing
 * linked to. It is its own place now, and it answers four questions:
 *
 *   who is out on a job right now, and who is booked in when   (Bookings)
 *   who is in my book, and in the company's                    (Contractors)
 *   what do we owe them, and for how long                      (To pay)
 *
 * Everything is read off the live jobs on every load: no stored figures, no
 * month literals. "Today" and "this week" are London days worked out from the
 * clock, so they roll over on their own.
 *
 * Whose contractors: an agent sees their own and the company's. The office
 * sees every agent's too, because the office pays the invoices.
 *
 * Whose JOBS (James, 21 Oct 2026: "I would like people to only see their
 * own, so we can't see each other's"): an agent gets only their own - the
 * jobs on the homes in their book and the jobs they raised, Maintenance's
 * Mine (lib/contractor-scope). The server sends nothing else. The office
 * sees everyone's, and can narrow to Mine.
 *
 * Same day: Log an invoice across the top, so an emailed invoice does not
 * mean opening the contractor first; the cards and the diary padded out
 * with the firm's logo, their credentials and the home each job is at.
 */

type Job = {
  id: string; ref: number; kind: "repair" | "planned"; status: Status; title: string; category: string;
  propertyName: string; locality: string; contractorId: string | null; contractorName: string;
  dueAt: string | null; scheduledAt: string | null; completedAt: string | null; contractorContactedAt: string | null;
  quotePence: number | null; invoicePence: number | null; invoiceRef: string; invoicedAt: string | null;
  paidAt: string | null; payee: "contractor" | "agent" | null; raisedBy: string; urgency: string | null;
  /** On the payment run: keyed on PayProp by the office (21 Oct 2026). */
  payrunAt: string | null;
};
type Row = Contractor & { ownerName: string | null };
type Board = {
  contractors: Row[]; jobs: Job[]; me: string; office: boolean; canCorporate: boolean;
  /** The office's own jobs, for Mine / Everyone. Null when they could not be worked out. */
  mineJobs?: string[] | null;
  mineNote?: string | null;
};
type Per = Map<string, { open: number; owed: number; today: boolean }>;

const OPEN: Status[] = ["reported", "approval", "approved", "scheduled"];
/** How long an unpaid contractor invoice waits before it is called out. Not a term anybody agreed: a flag, not a rule. */
const WAITING_DAYS = 30;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const box = "rounded-2xl border border-line/70 bg-white";

export default function ContractorsPage() {
  const [data, setData] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = usePref<"bookings" | "book" | "pay">("contractors-tab-v1", "bookings");
  const [savedView, saveView] = usePref<"" | "mine" | "everyone">("contractors-view-v1", "");
  const [profile, setProfile] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);
  const [raising, setRaising] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    fetch("/api/contractors/board", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setErr(null); } else setErr(j.error ?? "Could not read the contractors."); })
      .catch(() => setErr("Could not read the contractors."));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (editing) requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [editing]);

  /* Mine or Everyone, for the office only: an agent's jobs are already only
     theirs, so there is nothing to switch. */
  const canSwitch = Boolean(data?.office && data.mineJobs);
  const view: "mine" | "everyone" = canSwitch ? (savedView || "everyone") : "everyone";
  const mineSet = useMemo(() => new Set(data?.mineJobs ?? []), [data]);

  const today = londonToday();
  const jobs = useMemo(() => {
    const all = data?.jobs ?? [];
    return view === "mine" ? all.filter((j) => mineSet.has(j.id)) : all;
  }, [data, view, mineSet]);
  /* The diary. A London day for each booking, so a 9am visit is today's
     whatever the server's clock thinks the date is. */
  const booked = useMemo(() => jobs.filter((j) => j.status === "scheduled" && j.scheduledAt).sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1)), [jobs]);
  const outToday = booked.filter((j) => londonDay(j.scheduledAt!) === today);
  const thisWeek = booked.filter((j) => { const d = ukDaysFromToday(j.scheduledAt!); return d > 0 && d <= 7; });
  const later = booked.filter((j) => ukDaysFromToday(j.scheduledAt!) > 7);
  const missed = booked.filter((j) => londonDay(j.scheduledAt!) < today);
  /* Sent to them and no date yet. */
  const waiting = jobs.filter((j) => OPEN.includes(j.status) && j.status !== "scheduled" && j.contractorContactedAt).sort((a, b) => (a.contractorContactedAt! < b.contractorContactedAt! ? -1 : 1));
  const late = jobs.filter((j) => OPEN.includes(j.status) && worksLate(j));
  const unpaid = jobs.filter((j) => j.status === "invoiced").sort((a, b) => ((a.invoicedAt ?? "") < (b.invoicedAt ?? "") ? -1 : 1));
  const waitedDays = (j: Job) => (j.invoicedAt ? -ukDaysFromToday(j.invoicedAt) : 0);
  const owedPence = unpaid.reduce((a, j) => a + (j.invoicePence ?? 0), 0);
  const longWait = unpaid.filter((j) => waitedDays(j) > WAITING_DAYS);
  const recentlyPaid = jobs.filter((j) => j.status === "paid").sort((a, b) => ((a.paidAt ?? "") > (b.paidAt ?? "") ? -1 : 1));

  /* Per contractor, for the book. */
  const per: Per = useMemo(() => {
    const m: Per = new Map();
    for (const j of jobs) {
      if (!j.contractorId) continue;
      const e = m.get(j.contractorId) ?? { open: 0, owed: 0, today: false };
      if (OPEN.includes(j.status)) e.open++;
      if (j.status === "invoiced") e.owed += j.invoicePence ?? 0;
      if (j.status === "scheduled" && j.scheduledAt && londonDay(j.scheduledAt) === today) e.today = true;
      m.set(j.contractorId, e);
    }
    return m;
  }, [jobs, today]);

  const all = useMemo(() => data?.contractors ?? [], [data]);
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const needle = q.trim();
  const match = (c: Row) => !needle || searchMatches(needle, c.name, c.contact, c.trade, c.phone, c.email, c.notes, c.registration, c.gasSafeNumber ?? "", c.niceicNumber ?? "", c.napitNumber ?? "", c.otherRegistration ?? "", c.ownerName ?? "");
  const mine = all.filter((c) => c.ownerId === data?.me && match(c));
  const company = all.filter((c) => !c.ownerId && match(c));
  const others = all.filter((c) => c.ownerId && c.ownerId !== data?.me && match(c));
  const othersByOwner = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const c of others) g.set(c.ownerName || "An agent", [...(g.get(c.ownerName || "An agent") ?? []), c]);
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [others]);
  const canEdit = (c: Contractor) => (c.ownerId ? c.ownerId === data?.me : Boolean(data?.canCorporate));
  const openProfile = (id: string | null) => { const c = all.find((x) => x.id === id); if (c) setProfile(c); };

  /* ?open=<contractor id>: the contractor's name on a job sheet lands here
     with their record open (James, 19 Oct 2026). Once the book has loaded,
     so the drawer knows whose book they are in. One that is not in this
     person's book still opens, and the record says so. */
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (!data || deepLinked) return;
    setDeepLinked(true);
    let id: string | null = null;
    try { id = new URLSearchParams(window.location.search).get("open"); } catch { /* fine */ }
    if (!id) return;
    setProfile(data.contractors.find((c) => c.id === id) ?? ({ id, ownerId: null, ownerName: null } as Row));
  }, [data, deepLinked]);
  const closeProfile = () => {
    setProfile(null);
    try { if (new URLSearchParams(window.location.search).has("open")) window.history.replaceState(null, "", "/contractors"); } catch { /* fine */ }
  };

  const loading = !data && !err;
  const dot = <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink align-middle" />;
  const mark = (j: Job) => byId.get(j.contractorId ?? "");

  return (
    <>
      <PageHeader
        title="Contractors"
        blurb="Everyone you can send on a job: who is out today, who is booked in when, and what we owe them. Your own contractors sit beside the company's."
        illustration="/illustrations/maintenance-house.webp"
        hideArtOnPhone
        illustrationHeight={250}
        actions={
          <div className="flex flex-wrap gap-2">
            <PressButton onClick={() => { setTab("book"); setEditing({ ...BLANK_CONTRACTOR }); }} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page">
              <DoodleIcon name="user" size={14} />Add a contractor
            </PressButton>
            {/* James, 21 Oct 2026: straight to the invoice, without opening the contractor first. */}
            <PressButton onClick={() => { setLogged(null); setRaising(true); }} disabled={!data} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line/80 bg-white px-5 py-2.5 text-[13px] font-semibold">
              <DoodleIcon name="coin" size={14} />Log an invoice
            </PressButton>
          </div>
        }
      />

      {err && (
        <div className="mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 px-5 py-4 text-[13px]">
          {err} <button type="button" onClick={load} className="ml-2 underline">Try again</button>
        </div>
      )}

      {logged !== null && (
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line/70 bg-white px-5 py-4 text-[13px]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name="checklist" size={14} /></span>
          <span className="min-w-0 flex-1">Invoice logged. It is on the home as a finished job, it is under To pay, and accounts have been told.</span>
          {logged && <a href={jobHref(logged)} className="underline">Open the job</a>}
          <button type="button" onClick={() => setLogged(null)} className="text-muted underline hover:text-ink">Dismiss</button>
        </div>
      )}

      {/* ── The four counts, all off the live jobs. ── */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Out today" icon="calendar" value={loading ? dot : String(outToday.length)} hint={loading ? "reading" : outToday.length ? `${plural(new Set(outToday.map((j) => j.contractorId)).size, "contractor")} on site` : "nobody booked in today"} onClick={() => setTab("bookings")} />
        <StatTile label="Booked this week" icon="clock" value={loading ? dot : String(thisWeek.length)} hint={loading ? "reading" : "the next seven days"} onClick={() => setTab("bookings")} />
        <StatTile label="Waiting for a date" icon="bell" value={loading ? dot : String(waiting.length)} tone={loading ? undefined : toneFor(waiting.length + late.length)} hint={loading ? "reading" : late.length ? `${plural(late.length, "job")} past its date` : "sent, not booked yet"} onClick={() => setTab("bookings")} />
        <StatTile label="Owed to contractors" icon="coin" value={loading ? dot : pounds(owedPence)} hint={loading ? "reading" : longWait.length ? `${plural(longWait.length, "invoice")} over ${WAITING_DAYS} days` : `${plural(unpaid.length, "invoice")} to pay`} onClick={() => setTab("pay")} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Segmented
          className="w-full sm:w-auto md:min-w-[440px]"
          value={tab}
          onChange={setTab}
          options={[
            { id: "bookings" as const, label: "Bookings", icon: <span className="hidden sm:inline-flex"><DoodleIcon name="calendar" size={14} /></span> },
            { id: "book" as const, label: <>Contractors<span className="hidden sm:inline">{data ? ` ${all.length}` : ""}</span></>, icon: <span className="hidden sm:inline-flex"><DoodleIcon name="user" size={14} /></span> },
            { id: "pay" as const, label: unpaid.length ? `To pay ${unpaid.length}` : "To pay", icon: <span className="hidden sm:inline-flex"><DoodleIcon name="wallet" size={14} /></span> },
          ]}
        />
        {canSwitch && (
          <Segmented
            className="w-full sm:w-auto"
            value={view}
            onChange={(v) => saveView(v)}
            options={[{ id: "mine" as const, label: "My jobs" }, { id: "everyone" as const, label: "Everyone's" }]}
          />
        )}
        {data && (
          <span className="text-[11.5px] text-muted sm:ml-auto sm:max-w-[420px] sm:text-right">
            {data.office
              ? "You see every agent's contractors and jobs, because the office pays them."
              : data.mineNote ?? "Only your own jobs show here: the homes in your book, and jobs you raised."}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">{dot} Reading the contractors…</p>
      ) : !data ? null : tab === "bookings" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Diary icon="calendar" title="Out Today" blurb="Booked in for today." empty="Nobody is booked in today." rows={outToday} chip={(j) => <TimeChip iso={j.scheduledAt!} />} mark={mark} onWho={openProfile} highlight />
          <Diary icon="clock" title="This Week" blurb="Booked in over the next seven days." empty="Nothing booked for the next seven days." rows={thisWeek} chip={(j) => <DateChip iso={j.scheduledAt!} />} note={(j) => hhmm(j.scheduledAt!)} mark={mark} onWho={openProfile} />
          <Diary
            icon="bell"
            title="Waiting for a Date"
            blurb="They have the works order and have not booked a time. Their link lets them set it, or type it in when they ring."
            empty="Nobody is sitting on a works order."
            rows={waiting}
            chip={(j) => <DateChip iso={j.contractorContactedAt!} />}
            note={(j) => { const d = -ukDaysFromToday(j.contractorContactedAt!); return d <= 0 ? "sent today" : `sent ${plural(d, "day")} ago`; }}
            hot={(j) => -ukDaysFromToday(j.contractorContactedAt!) >= 3}
            mark={mark}
            onWho={openProfile}
          />
          {(missed.length > 0 || late.length > 0) && (
            <Diary
              icon="info"
              title="Needs a Look"
              blurb="A booked day that has gone by without the job being marked done, or a job past its date."
              empty=""
              rows={[...missed, ...late.filter((j) => !missed.includes(j))]}
              chip={(j) => (j.scheduledAt || j.dueAt ? <DateChip iso={(j.scheduledAt ?? j.dueAt)!} /> : <span className="w-12" />)}
              note={(j) => (j.scheduledAt && londonDay(j.scheduledAt) < today ? `was booked ${day(j.scheduledAt)}` : j.dueAt ? `due ${day(j.dueAt)}` : "past its date")}
              hot={() => true}
              mark={mark}
              onWho={openProfile}
            />
          )}
          {later.length > 0 && <Diary icon="calendar" title="Later" blurb="Booked further out." empty="" rows={later} chip={(j) => <DateChip iso={j.scheduledAt!} />} note={(j) => hhmm(j.scheduledAt!)} mark={mark} onWho={openProfile} />}
        </div>
      ) : tab === "book" ? (
        <div className="mt-4 space-y-4">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><DoodleIcon name="search" size={13} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, trade, phone, Gas Safe number…" className="w-full rounded-full border border-line/80 bg-box py-2 pl-9 pr-4 text-[12.5px] outline-none focus:border-ink" />
          </div>
          {editing && (
            <div ref={formRef} className={`${box} scroll-mt-6 p-5`}>
              <h2 className="text-[16px]">{editing.id ? `Edit ${editing.name || "Contractor"}` : "New Contractor"}</h2>
              <div className="mt-3">
                <ContractorForm initial={editing} canCorporate={data.canCorporate} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
              </div>
            </div>
          )}
          <Shelf icon="user" title="Your Contractors" blurb="The people you ring. Added by you." rows={mine} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} searching={Boolean(needle)} />
          <Shelf icon="suitcase" title="The Company's Contractors" blurb="Kept by the office. Everyone can book them." rows={company} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} searching={Boolean(needle)} />
          {data.office && othersByOwner.map(([owner, rows]) => (
            <Shelf key={owner} icon="user" title={`${owner}'s Contractors`} blurb={`Added by ${owner}. Only they and the office see these.`} rows={rows} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} searching={Boolean(needle)} />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <section className={`${box} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <Head icon="wallet" title="Invoices to Pay" blurb={`Their invoice is on the job and accounts have been told. Oldest first. Over ${WAITING_DAYS} days is marked.`} />
              <span className="figures shrink-0 text-[15px] font-semibold">{pounds(owedPence)}</span>
            </div>
            {unpaid.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-muted">Nothing owed. Every contractor invoice on the OS is paid.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line/50">
                {unpaid.map((j) => {
                  const w = waitedDays(j);
                  const c = mark(j);
                  return (
                    <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                      <ContractorMark name={j.contractorName} logoUrl={c?.logoUrl} size={34} />
                      <a href={jobHref(j.id)} className="min-w-0 flex-1 basis-[200px] hover:underline">
                        <span className="block truncate text-[13px]">{j.payee === "agent" ? `${j.raisedBy} (paid it themselves)` : j.contractorName}</span>
                        <span className="block truncate text-[10.5px] text-muted">{j.propertyName} · #{j.ref} {j.title}{j.invoiceRef ? ` · invoice ${j.invoiceRef}` : ""}</span>
                      </a>
                      <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {/* The payment run (21 Oct 2026): keyed on PayProp yet, or still to go on. */}
                        <PayrunTag o={j} />
                        <Pill tone={w > WAITING_DAYS ? "warn" : "neutral"}>{w <= 0 ? "in today" : `${plural(w, "day")}`}</Pill>
                        <span className="figures min-w-[64px] text-right text-[13px]">{j.invoicePence != null ? pounds(j.invoicePence) : ""}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {recentlyPaid.length > 0 && (
            <section className={`${box} p-5`}>
              <Head icon="checklist" title="Paid in the Last 90 Days" blurb="Marked paid on the job." />
              <ul className="mt-3 divide-y divide-line/50">
                {recentlyPaid.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2.5">
                    <ContractorMark name={j.contractorName} logoUrl={mark(j)?.logoUrl} size={30} />
                    <a href={jobHref(j.id)} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate text-[13px]">{j.contractorName}</span>
                      <span className="block truncate text-[10.5px] text-muted">{j.propertyName} · paid {day(j.paidAt)}</span>
                    </a>
                    <span className="figures shrink-0 text-[13px] text-muted">{j.invoicePence != null ? pounds(j.invoicePence) : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-[11.5px] text-muted">A contractor emailed you an invoice for work with no job on the OS? Press Log an invoice at the top of the page.</p>
        </div>
      )}

      {profile && (
        <ContractorProfile
          id={profile.id}
          ownerName={profile.ownerId && profile.ownerId !== data?.me ? profile.ownerName : null}
          onClose={closeProfile}
          onEdit={(c) => { closeProfile(); setTab("book"); setEditing(c); }}
          onChanged={load}
          canEdit={canEdit}
        />
      )}

      <RaiseInvoiceDrawer
        open={raising}
        contractors={all}
        me={data?.me ?? null}
        onClose={() => setRaising(false)}
        onSaved={(orderId) => { setRaising(false); setLogged(orderId); setTab("pay"); load(); }}
      />
    </>
  );
}

function Head({ icon, title, blurb, count }: { icon: string; title: string; blurb: string; count?: number }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={14} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px]">{title}</h2>
          {count != null && <span className="figures shrink-0 text-[12px] text-muted">{count}</span>}
        </div>
        <p className="mt-0.5 text-[11.5px] text-muted">{blurb}</p>
      </div>
    </div>
  );
}

function TimeChip({ iso }: { iso: string }) {
  return (
    <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-ink py-1.5 leading-none text-page">
      <span className="figures text-[14px] font-semibold">{hhmm(iso)}</span>
      <span className="mt-0.5 text-[9.5px] uppercase tracking-wide opacity-70">today</span>
    </span>
  );
}

function Diary({ icon, title, blurb, empty, rows, chip, note, hot, highlight = false, mark, onWho }: {
  icon: string; title: string; blurb: string; empty: string; rows: Job[];
  chip: (j: Job) => React.ReactNode; note?: (j: Job) => string; hot?: (j: Job) => boolean; highlight?: boolean;
  mark: (j: Job) => Contractor | undefined; onWho: (id: string | null) => void;
}) {
  return (
    <section className={`${box} min-w-0 p-5 ${highlight && rows.length ? "border-ink/40" : ""}`}>
      <Head icon={icon} title={title} blurb={blurb} count={rows.length} />
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-box px-4 py-5 text-center text-[12.5px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/50">
          {rows.map((j) => {
            const c = mark(j);
            return (
              <li key={j.id} className="flex items-center gap-3 py-3">
                {chip(j)}
                <div className="min-w-0 flex-1">
                  <a href={jobHref(j.id)} className="block truncate text-[13.5px] hover:underline">{j.propertyName || "A home"}{j.locality ? <span className="text-muted">, {j.locality}</span> : null}</a>
                  <p className="truncate text-[11px] text-muted">#{j.ref} · {j.title}</p>
                  <button type="button" onClick={() => onWho(j.contractorId)} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line/60 bg-white py-0.5 pl-0.5 pr-2.5 text-[11.5px] hover:border-ink/40">
                    <ContractorMark name={j.contractorName} logoUrl={c?.logoUrl} size={20} />
                    <span className="truncate">{j.contractorName || "A contractor"}</span>
                  </button>
                </div>
                {note && <span className={`figures shrink-0 text-right text-[12px] ${hot?.(j) ? "font-semibold text-accent-dark" : "text-muted"}`}>{note(j)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Shelf({ icon, title, blurb, rows, per, onOpen, onEdit, canEdit, searching }: {
  icon: string; title: string; blurb: string; rows: Row[]; per: Per;
  onOpen: (c: Row) => void; onEdit: (c: Contractor) => void; canEdit: (c: Contractor) => boolean; searching: boolean;
}) {
  return (
    <section className={`${box} min-w-0 p-5`}>
      <Head icon={icon} title={title} blurb={blurb} count={rows.length} />
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-box px-4 py-5 text-center text-[12.5px] text-muted">{searching ? "Nobody here matches that." : "Nobody here yet."}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {rows.map((c) => <Card key={c.id} c={c} p={per.get(c.id)} onOpen={() => onOpen(c)} onEdit={canEdit(c) ? () => onEdit(c) : null} />)}
        </div>
      )}
    </section>
  );
}

function Card({ c, p, onOpen, onEdit }: { c: Row; p: { open: number; owed: number; today: boolean } | undefined; onOpen: () => void; onEdit: (() => void) | null }) {
  const creds = credentialsOf(c);
  const pl = liabilityOf(c);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`flex min-w-0 cursor-pointer flex-col rounded-xl border border-line/60 bg-white p-4 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))] ${c.active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <ContractorMark name={c.name} logoUrl={c.logoUrl} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px]">{c.name}</p>
          <p className="truncate text-[11.5px] text-muted">{[c.trade, c.contact].filter(Boolean).join(" · ") || "Trade not given"}</p>
          <p className="truncate text-[11px] text-muted">{c.phone || c.email || "No contact details yet"}</p>
        </div>
        {p?.today ? <Pill tone="accent">Out today</Pill> : !c.active ? <Pill tone="neutral">Not active</Pill> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {creds.length ? creds.slice(0, 2).map((x) => <Pill key={x.key} tone="neutral">{x.label} {x.value}</Pill>) : <Pill tone="neutral">No registration on file</Pill>}
        {creds.length > 2 && <Pill tone="neutral">+{creds.length - 2}</Pill>}
        <Pill tone={pl.tone}>{pl.pill}</Pill>
      </div>
      <div aria-hidden className="min-h-[14px] flex-1" />
      <div className="flex items-center justify-between gap-3 border-t border-line/50 pt-3 text-[11.5px]">
        <span className="min-w-0 truncate text-muted">
          {p?.open ? plural(p.open, "open job") : "No open jobs"}{p?.owed ? <> · <b className="font-semibold text-ink">{pounds(p.owed)} owed</b></> : null}
        </span>
        {onEdit && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="inline-flex shrink-0 items-center gap-1 text-muted hover:text-ink">
            <DoodleIcon name="pencil" size={11} />Edit
          </button>
        )}
      </div>
    </div>
  );
}
