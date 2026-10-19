"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile, { toneFor } from "@/components/StatTile";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import { PressButton } from "@/components/Bits";
import type { Contractor, Status } from "@/lib/works-orders";
import { ContractorForm, BLANK_CONTRACTOR } from "@/components/WorksNow";
import ContractorProfile from "@/components/contractors/ContractorProfile";
import { STATUS_LABEL, day, pounds } from "@/components/maintenance/works-ui";
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
 */

type Job = {
  id: string; ref: number; kind: "repair" | "planned"; status: Status; title: string; category: string;
  propertyName: string; locality: string; contractorId: string | null; contractorName: string;
  dueAt: string | null; scheduledAt: string | null; completedAt: string | null; contractorContactedAt: string | null;
  quotePence: number | null; invoicePence: number | null; invoiceRef: string; invoicedAt: string | null;
  paidAt: string | null; payee: "contractor" | "agent" | null; raisedBy: string; urgency: string | null;
};
type Row = Contractor & { ownerName: string | null };
type Board = { contractors: Row[]; jobs: Job[]; me: string; office: boolean; canCorporate: boolean };

const OPEN: Status[] = ["reported", "approval", "approved", "scheduled"];
/** How long an unpaid contractor invoice waits before it is called out. Not a term anybody agreed: a flag, not a rule. */
const WAITING_DAYS = 30;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const jobHref = (id: string) => `/maintenance?open=${encodeURIComponent(id)}`;

export default function ContractorsPage() {
  const [data, setData] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = usePref<"bookings" | "book" | "pay">("contractors-tab-v1", "bookings");
  const [profile, setProfile] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/api/contractors/board", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setErr(null); } else setErr(j.error ?? "Could not read the contractors."); })
      .catch(() => setErr("Could not read the contractors."));
  }, []);
  useEffect(load, [load]);

  const today = londonToday();
  const jobs = useMemo(() => data?.jobs ?? [], [data]);
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
  const per = useMemo(() => {
    const m = new Map<string, { open: number; owed: number; today: boolean }>();
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

  const all = data?.contractors ?? [];
  const needle = q.trim();
  const match = (c: Row) => !needle || searchMatches(needle, c.name, c.contact, c.trade, c.phone, c.email, c.notes, c.registration, c.ownerName ?? "");
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

  const loading = !data && !err;
  const dot = <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink align-middle" />;

  return (
    <>
      <PageHeader
        title="Contractors"
        blurb="Everyone you can send on a job: who is out today, who is booked in when, and what we owe them. Your own contractors sit beside the company's."
        illustration="/illustrations/maintenance-house.webp"
        hideArtOnPhone
        illustrationHeight={250}
        actions={
          <PressButton onClick={() => { setTab("book"); setEditing({ ...BLANK_CONTRACTOR }); }} className="flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page">
            <DoodleIcon name="user" size={14} />Add a contractor
          </PressButton>
        }
      />

      {err && (
        <div className="mt-8 rounded-[22px] border border-accent-dark/40 bg-accent-soft/40 px-5 py-4 text-[13px]">
          {err} <button type="button" onClick={load} className="ml-2 underline">Try again</button>
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
        {data?.office && <span className="text-[11.5px] text-muted sm:ml-auto">You see every agent&apos;s contractors, because the office pays them.</span>}
      </div>

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">{dot} Reading the contractors…</p>
      ) : !data ? null : tab === "bookings" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Diary title="Out Today" blurb="Booked in for today." empty="Nobody is booked in today." rows={outToday} when={(j) => hhmm(j.scheduledAt!)} onWho={openProfile} highlight />
          <Diary title="This Week" blurb="Booked in over the next seven days." empty="Nothing booked for the next seven days." rows={thisWeek} when={(j) => `${day(j.scheduledAt)} · ${hhmm(j.scheduledAt!)}`} onWho={openProfile} />
          <Diary
            title="Waiting for a Date"
            blurb="They have the works order and have not booked a time. Their link lets them set it, or type it in when they ring."
            empty="Nobody is sitting on a works order."
            rows={waiting}
            when={(j) => { const d = -ukDaysFromToday(j.contractorContactedAt!); return d <= 0 ? "sent today" : `sent ${plural(d, "day")} ago`; }}
            hot={(j) => -ukDaysFromToday(j.contractorContactedAt!) >= 3}
            onWho={openProfile}
          />
          {(missed.length > 0 || late.length > 0) && (
            <Diary
              title="Needs a Look"
              blurb="A booked day that has gone by without the job being marked done, or a job past its date."
              empty=""
              rows={[...missed, ...late.filter((j) => !missed.includes(j))]}
              when={(j) => (j.scheduledAt && londonDay(j.scheduledAt) < today ? `was booked ${day(j.scheduledAt)}` : `due ${day(j.dueAt)}`)}
              hot={() => true}
              onWho={openProfile}
            />
          )}
          {later.length > 0 && <Diary title="Later" blurb="Booked further out." empty="" rows={later} when={(j) => `${day(j.scheduledAt)} · ${hhmm(j.scheduledAt!)}`} onWho={openProfile} />}
        </div>
      ) : tab === "book" ? (
        <div className="mt-4 space-y-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, trade, phone…" className="w-full max-w-xs rounded-full border border-line/80 bg-box px-4 py-2 text-[12.5px] outline-none focus:border-ink" />
          {editing && (
            <div className="rounded-[22px] border border-line/50 bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{editing.id ? "Edit" : "New contractor"}</p>
              <div className="mt-3">
                <ContractorForm initial={editing} canCorporate={data.canCorporate} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
              </div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Shelf title="Your Contractors" blurb="The people you ring. Added by you." rows={mine} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} />
            <Shelf title="The Company's Contractors" blurb="Kept by the office. Everyone can book them." rows={company} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} />
            {data.office && othersByOwner.map(([owner, rows]) => (
              <Shelf key={owner} title={`${owner}'s Contractors`} blurb={`Added by ${owner}. Only they and the office see these.`} rows={rows} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <section className="rounded-[22px] border border-line/50 bg-white p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-[15px]">Invoices to Pay</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">Their invoice is on the job and accounts have been told. Oldest first. Over {WAITING_DAYS} days is marked.</p>
              </div>
              <span className="figures text-[13px]">{pounds(owedPence)}</span>
            </div>
            {unpaid.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-muted">Nothing owed. Every contractor invoice on the OS is paid.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line/50">
                {unpaid.map((j) => {
                  const w = waitedDays(j);
                  return (
                    <li key={j.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                      <a href={jobHref(j.id)} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate text-[13px]">{j.payee === "agent" ? `${j.raisedBy} (paid it themselves)` : j.contractorName}</span>
                        <span className="block truncate text-[10.5px] text-muted">{j.propertyName} · #{j.ref} {j.title}{j.invoiceRef ? ` · invoice ${j.invoiceRef}` : ""}</span>
                      </a>
                      <span className="flex shrink-0 items-center gap-2">
                        <Pill tone={w > WAITING_DAYS ? "warn" : "neutral"}>{w <= 0 ? "in today" : `${plural(w, "day")}`}</Pill>
                        <span className="figures text-[13px]">{pounds(j.invoicePence)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {recentlyPaid.length > 0 && (
            <section className="rounded-[22px] border border-line/50 bg-white p-5">
              <h2 className="text-[15px]">Paid in the Last 90 Days</h2>
              <ul className="mt-3 divide-y divide-line/50">
                {recentlyPaid.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                    <a href={jobHref(j.id)} className="min-w-0 hover:underline">
                      <span className="block truncate text-[13px]">{j.contractorName}</span>
                      <span className="block truncate text-[10.5px] text-muted">{j.propertyName} · paid {day(j.paidAt)}</span>
                    </a>
                    <span className="figures shrink-0 text-[13px] text-muted">{pounds(j.invoicePence)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-[11.5px] text-muted">A contractor emailed you an invoice for work with no job on the OS? Open them under Contractors and press Log an invoice.</p>
        </div>
      )}

      {profile && (
        <ContractorProfile
          id={profile.id}
          ownerName={profile.ownerId && profile.ownerId !== data?.me ? profile.ownerName : null}
          onClose={() => setProfile(null)}
          onEdit={(c) => { setProfile(null); setTab("book"); setEditing(c); }}
          onChanged={load}
          canEdit={canEdit}
        />
      )}
    </>
  );
}

function Diary({ title, blurb, empty, rows, when, hot, highlight = false, onWho }: {
  title: string; blurb: string; empty: string; rows: Job[]; when: (j: Job) => string; hot?: (j: Job) => boolean; highlight?: boolean; onWho: (id: string | null) => void;
}) {
  return (
    <section className={`min-w-0 rounded-[22px] border bg-white p-5 ${highlight && rows.length ? "border-ink/30" : "border-line/50"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px]">{title}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">{blurb}</p>
        </div>
        <span className="text-[11px] text-muted">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/50">
          {rows.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => onWho(j.contractorId)} className="block max-w-full truncate text-left text-[13px] hover:underline">{j.contractorName || "A contractor"}</button>
                <a href={jobHref(j.id)} className="block truncate text-[10.5px] text-muted hover:underline">{j.propertyName} · #{j.ref} {j.title}</a>
              </div>
              <span className={`figures shrink-0 text-right text-[12px] ${hot?.(j) ? "text-accent-dark" : ""}`}>{when(j)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Shelf({ title, blurb, rows, per, onOpen, onEdit, canEdit }: {
  title: string; blurb: string; rows: Row[]; per: Map<string, { open: number; owed: number; today: boolean }>;
  onOpen: (c: Row) => void; onEdit: (c: Contractor) => void; canEdit: (c: Contractor) => boolean;
}) {
  return (
    <section className="min-w-0 rounded-[22px] border border-line/50 bg-white p-5">
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
          {rows.map((c) => {
            const p = per.get(c.id);
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <button type="button" onClick={() => onOpen(c)} className="min-w-0 flex-1 text-left">
                  <p className={`truncate text-[13.5px] ${c.active ? "" : "text-muted line-through"}`}>{c.name} <span className="text-[11px] text-muted">· {c.trade}</span></p>
                  <p className="truncate text-[11px] text-muted">{[c.contact, c.phone, c.email].filter(Boolean).join(" · ") || "no contact details yet"}</p>
                </button>
                <span className="flex shrink-0 flex-col items-end gap-1 text-[11px]">
                  {p?.today && <Pill tone="accent">Out today</Pill>}
                  <span className="text-muted">{p?.open ? `${plural(p.open, "open job")}` : "no open jobs"}{p?.owed ? ` · ${pounds(p.owed)} owed` : ""}</span>
                  {canEdit(c) && <button type="button" onClick={() => onEdit(c)} className="text-muted underline hover:text-ink">Edit</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
