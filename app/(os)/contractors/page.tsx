"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import type { Contractor, Status } from "@/lib/works-orders";
import { ContractorForm, BLANK_CONTRACTOR } from "@/components/WorksNow";
import ContractorProfile from "@/components/contractors/ContractorProfile";
import ContractorMark from "@/components/contractors/ContractorMark";
import { RaiseInvoiceDrawer, RaiseInvoiceSheet } from "@/components/contractors/InvoiceForm";
import RaiseJob from "@/components/maintenance/RaiseJob";
import FloatSheet, { FloatChoice, FloatFoot } from "@/components/new-look/FloatSheet";
import { credentialsOf, jobHref, liabilityOf } from "@/components/contractors/credentials";
import { PAYRUN_LABEL, PayrunTag, awaitingPay, day, pounds } from "@/components/maintenance/works-ui";
import { hhmm, londonDay, londonToday, ukDaysFromToday, worksLate } from "@/lib/london-clock";
import { searchMatches } from "@/lib/search-match";
import { usePref } from "@/lib/prefs-store";
import { useNewLook } from "@/lib/use-new-look";
import { Tabs, Ico } from "@/components/new-look/Parts";
import { Failed, Loading } from "@/components/new-look/backoffice/Bits";

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
  /* The new look only: Send a contractor (which kind, then the same report
     form), the job it raised, and Needs You opened out past its first five. */
  const [sending, setSending] = useState<null | "choose" | "repair" | "planned">(null);
  const [raised, setRaised] = useState<string | null>(null);
  const [allJobs, setAllJobs] = useState(false);
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

  /* Two lists rather than four (James, 22 Oct 2026, from the pastel mock):
     what needs someone's input, and who is going out when. Every row is the
     same job as before, only gathered. */
  const pastDay = [...missed, ...late.filter((j) => !missed.includes(j))];
  const attention: Attn[] = [
    ...pastDay.map((j) => {
      const gone = !!j.scheduledAt && londonDay(j.scheduledAt) < today;
      /* The tile is the day that went by: the visit's, or the date it was due. */
      return { j, iso: gone ? j.scheduledAt : j.dueAt, why: gone ? "Visit gone by" : "Past its date", hot: true, note: gone ? "not marked done" : j.dueAt ? `due ${day(j.dueAt)}` : "" };
    }),
    ...waiting.filter((j) => !pastDay.includes(j)).map((j) => {
      const d = -ukDaysFromToday(j.contractorContactedAt!);
      return { j, iso: j.dueAt, why: "Waiting for date", hot: d >= 3, note: d <= 0 ? "works order sent today" : `works order sent ${plural(d, "day")} ago` };
    }),
  ];
  const waitCount = attention.length - pastDay.length;
  const upcoming = [...outToday, ...thisWeek];
  const look = useNewLook("contractors");

  /* ── THE NEW LOOK (lib/new-look "contractors", 23 Oct 2026) ───────────────
     The same board, tabs, Mine / Everyone, drawers and forms, drawn as the
     design's Contractors: a type-only head, three figures, text tabs, and the
     book as a table of who, their work and their paperwork. */
  if (look === null) {
    return <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Opening Contractors…</p>;
  }
  if (look) {
    /* The design's Contractors (James, 25 Oct 2026: "rebuild what we've got
       under contractors, just to have a cleaner view"). Same reads, same
       figures, same flows: Send a contractor is Report a repair or Plan a
       certificate, Add one is the trades book's form, Log an invoice is the
       same invoice; each opens in the floating boxes. A row's action opens the
       job, where the date, the visit and the payment are recorded. */
    const myBook = all.filter((c) => !c.ownerId || c.ownerId === data?.me);
    const failed = Boolean(err && !data);
    const shownAttn = allJobs ? attention : attention.slice(0, NEEDS_SHOWN);
    const nextUp = upcoming[0] ?? later[0] ?? null;
    const lede = loading
      ? null
      : failed
        ? "The jobs could not be read, so there is nothing to count just now."
        : attention.length
          ? `${attention.length} ${attention.length === 1 ? "needs" : "need"} you.${upcoming.length ? ` ${plural(upcoming.length, "contractor")} booked this week.` : ""}`
          : `Nothing needs you. Every job has a contractor and a date.${upcoming.length ? ` ${plural(upcoming.length, "contractor")} booked this week.` : ""}`;
    const fig = (v: string) => (failed ? <span className="nl-ct-fig-err">Couldn&apos;t read</span> : loading ? <span className="nl-bo-spin" aria-label="Reading" /> : v);
    return (
      <div data-look="new" className="nl-page nl-rise nl-bo nl-ct">
        <header className="nl-ct-top">
          <div className="min-w-0">
            <h1 className="nl-title">Your Jobs</h1>
            <p className="nl-blurb">{lede ?? <span className="nl-ct-reading"><span className="nl-bo-spin" aria-hidden />Reading the jobs…</span>}</p>
          </div>
          <div className="nl-ct-acts">
            <button type="button" className="nl-btn nl-btn--primary" disabled={!data} onClick={() => setSending("choose")}><SendIco /> Send a contractor</button>
            <button type="button" className="nl-btn nl-fs-ghost" onClick={() => setEditing({ ...BLANK_CONTRACTOR })}><Ico name="plus" /> Add one</button>
            <button type="button" className="nl-btn nl-fs-ghost" disabled={!data} onClick={() => { setLogged(null); setRaising(true); }}><Ico name="upload" /> Log an invoice</button>
          </div>
        </header>

        {err && <Failed onRetry={load}>{err}</Failed>}
        {logged !== null && (
          <div className="nl-bo-done" role="status">
            <Ico name="check" />
            <span className="min-w-0 flex-1">Invoice logged. It is on the home as a finished job, it is under To pay, and accounts have been told.</span>
            {logged && <a href={jobHref(logged)} className="nl-link">Open the job</a>}
            <button type="button" className="nl-link" onClick={() => setLogged(null)}>Dismiss</button>
          </div>
        )}
        {raised && (
          <div className="nl-bo-done" role="status">
            <Ico name="check" />
            <span className="min-w-0 flex-1">The job is raised and on Maintenance. It shows here once a contractor is on it.</span>
            <a href={jobHref(raised)} className="nl-link">Open the job</a>
            <button type="button" className="nl-link" onClick={() => setRaised(null)}>Dismiss</button>
          </div>
        )}

        <div className="nl-ct-strip">
          <button type="button" onClick={() => setTab("bookings")}>
            <span>Needs you</span>
            <b className={!loading && !failed && attention.length ? "is-hot" : ""}>{fig(String(attention.length))}</b>
            <em>{loading || failed ? "" : attention.length ? [pastDay.length ? `${pastDay.length} past ${pastDay.length === 1 ? "its" : "their"} date` : "", waitCount ? `${plural(waitCount, "job")} waiting for a date` : ""].filter(Boolean).join(" · ") : "Nothing waiting on you"}</em>
          </button>
          <button type="button" onClick={() => setTab("bookings")}>
            <span>This week</span>
            <b>{fig(String(upcoming.length))}</b>
            <em>{loading || failed ? "" : outToday.length ? `${outToday.length} out today, ${plural(new Set(outToday.map((j) => j.contractorId)).size, "contractor")} on site` : nextUp ? `Next ${longDate(nextUp.scheduledAt!)}` : "Nobody booked"}</em>
          </button>
          <button type="button" onClick={() => setTab("pay")}>
            <span>To pay</span>
            <b>{fig(pounds(owedPence))}</b>
            <em>{loading || failed ? "" : unpaid.length ? `${plural(unpaid.length, "invoice")}${longWait.length ? ` · ${longWait.length} over ${WAITING_DAYS} days` : ""}` : "Nothing owed"}</em>
          </button>
        </div>

        <div className="nl-ct-tabrow">
          <Tabs
            label="Contractors sections"
            value={tab}
            onChange={(v) => setTab(v)}
            items={[
              { id: "bookings" as const, label: "Jobs", count: data ? attention.length : null },
              { id: "book" as const, label: "Contractors", count: data ? all.length : null },
              { id: "pay" as const, label: "To pay", count: data ? unpaid.length : null },
            ]}
          />
          {canSwitch && (
            <span className="nl-toggle" role="group" aria-label="Whose jobs">
              <button type="button" className={view === "mine" ? "is-on" : ""} aria-pressed={view === "mine"} onClick={() => saveView("mine")}>My jobs</button>
              <button type="button" className={view === "everyone" ? "is-on" : ""} aria-pressed={view === "everyone"} onClick={() => saveView("everyone")}>Everyone&apos;s</button>
            </span>
          )}
        </div>
        {data && (
          <p className="nl-meta nl-ct-whose">
            {data.office ? "You see every agent's contractors and jobs, because the office pays them." : data.mineNote ?? "Only your own jobs show here: the homes in your book, and jobs you raised."}
          </p>
        )}

        {loading ? (
          <Loading>Reading the contractors…</Loading>
        ) : !data ? null : tab === "bookings" ? (
          <div className="nl-ct-view" key="jobs">
            <section className="nl-ct-sec">
              <div className="nl-ct-sh"><h2>Needs You</h2><span>{attention.length}</span></div>
              {attention.length === 0 ? (
                <p className="nl-ct-calm">Nothing needs you. Every works order has a date.</p>
              ) : (
                <>
                  {shownAttn.map((a) => <CtNeedsRow key={a.j.id} a={a} today={today} onWho={openProfile} />)}
                  {attention.length > NEEDS_SHOWN && (
                    <button type="button" className="nl-ct-more" onClick={() => setAllJobs((v) => !v)}>{allJobs ? "Show fewer" : `Show ${attention.length - NEEDS_SHOWN} more`}</button>
                  )}
                </>
              )}
            </section>
            <section className="nl-ct-sec">
              <div className="nl-ct-sh"><h2>Coming Up</h2><span>{upcoming.length + later.length}</span></div>
              {upcoming.length === 0 && later.length === 0 ? (
                <p className="nl-ct-calm">Nothing booked yet.</p>
              ) : (
                <>
                  {upcoming.length === 0 && <p className="nl-ct-calm">Nothing booked for the next seven days.</p>}
                  {upcoming.map((j) => <CtBookedRow key={j.id} j={j} today={today} onWho={openProfile} />)}
                  {later.length > 0 && (
                    <>
                      <p className="nl-ct-later">Later</p>
                      {later.map((j) => <CtBookedRow key={j.id} j={j} today={today} onWho={openProfile} />)}
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        ) : tab === "book" ? (
          <div className="nl-ct-view" key="book">
            <div className="nl-ct-tools">
              <label className="nl-fsearch">
                <Ico name="search" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, trade, phone, Gas Safe number" aria-label="Search contractors" />
              </label>
              <span className="nl-fcount">{plural(mine.length + company.length + others.length, "contractor")}</span>
            </div>
            <CtShelf title="Your Contractors" blurb="The people you ring. Added by you." rows={mine} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} searching={Boolean(needle)} />
            <CtShelf title="The Company's Contractors" blurb="Kept by the office. Everyone can book them." rows={company} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} searching={Boolean(needle)} />
            {data.office && othersByOwner.map(([owner, rows]) => (
              <CtShelf key={owner} title={`${owner}'s Contractors`} blurb={`Added by ${owner}. Only they and the office see these.`} rows={rows} per={per} onOpen={setProfile} onEdit={setEditing} canEdit={canEdit} searching={Boolean(needle)} />
            ))}
          </div>
        ) : (
          <div className="nl-ct-view" key="pay">
            <section className="nl-ct-sec">
              <div className="nl-ct-sh"><h2>To Pay</h2><span className="nl-ct-total">{pounds(owedPence)}</span></div>
              <p className="nl-meta nl-ct-shnote">Their invoice is on the job and accounts have been told. Oldest first. Over {WAITING_DAYS} days is marked.</p>
              {unpaid.length === 0 ? (
                <p className="nl-ct-calm">Nothing owed. Every contractor invoice on the OS is paid.</p>
              ) : unpaid.map((j) => <CtInvRow key={j.id} j={j} waited={waitedDays(j)} />)}
            </section>
            <section className="nl-ct-sec">
              <div className="nl-ct-sh"><h2>Paid in the Last 90 Days</h2><span>{recentlyPaid.length}</span></div>
              {recentlyPaid.length === 0 ? (
                <p className="nl-ct-calm">Nothing marked paid in the last 90 days.</p>
              ) : recentlyPaid.map((j) => <CtInvRow key={j.id} j={j} waited={0} paid />)}
            </section>
            <p className="nl-meta nl-ct-foot">A contractor emailed you an invoice for work with no job on the OS? Press Log an invoice at the top of the page.</p>
          </div>
        )}

        {profile && (
          <ContractorProfile
            look="float"
            id={profile.id}
            ownerName={profile.ownerId && profile.ownerId !== data?.me ? profile.ownerName : null}
            onClose={closeProfile}
            onEdit={(c) => { closeProfile(); setEditing(c); }}
            onChanged={load}
            canEdit={canEdit}
          />
        )}

        {editing && (
          <FloatSheet
            key={editing.id ?? "new"}
            title={editing.id ? `Edit ${editing.name || "Contractor"}` : "Add a Contractor"}
            question={editing.id ? undefined : "Who are they?"}
            lede={editing.id ? undefined : "Saved to the book, and offered on jobs while active. Leave blank anything you don't have yet."}
            onClose={() => setEditing(null)}
          >
            <ContractorForm look="float" initial={editing} canCorporate={Boolean(data?.canCorporate)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
          </FloatSheet>
        )}

        {sending === "choose" && (
          <FloatSheet
            title="Send a Contractor"
            question="What are they going out to?"
            lede="Pick the closest. A repair runs on how urgent it is; a certificate runs on the date it expires."
            onClose={() => setSending(null)}
            foot={<FloatFoot left={<span>Next: the property, the job, who goes and the works order they get.</span>}><button type="button" className="nl-btn nl-fs-ghost" onClick={() => setSending(null)}>Cancel</button></FloatFoot>}
          >
            <div className="nl-fs-choices is-2">
              <FloatChoice icon={<BoltIco />} title="Report a repair" text="Something broken or not working. You say how urgent it is." onClick={() => setSending("repair")} />
              <FloatChoice icon={<Ico name="calendar" size={18} />} title="Plan a certificate" text="A gas safety, EICR or other planned visit, chased against its expiry date." onClick={() => setSending("planned")} />
            </div>
          </FloatSheet>
        )}
        {(sending === "repair" || sending === "planned") && (
          <RaiseJob
            look="float"
            kind={sending}
            contractors={myBook}
            onClose={() => setSending(null)}
            onRaised={(o) => { setSending(null); setRaised(o.id); setTab("bookings"); load(); }}
          />
        )}

        {raising && (
          <RaiseInvoiceSheet
            contractors={all}
            me={data?.me ?? null}
            onClose={() => setRaising(false)}
            onSaved={(orderId) => { setRaising(false); setLogged(orderId); setTab("pay"); load(); }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Contractors"
        blurb="Your contractors, bookings and invoices: who's out today, what's scheduled and what needs attention."
        actions={
          <div className="flex flex-wrap gap-2">
            <PressButton onClick={() => { setTab("book"); setEditing({ ...BLANK_CONTRACTOR }); }} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page">
              <DoodleIcon name="user" size={14} />Add a contractor
            </PressButton>
            {/* James, 21 Oct 2026: straight to the invoice, without opening the contractor first. */}
            <PressButton onClick={() => { setLogged(null); setRaising(true); }} disabled={!data} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line/80 bg-white px-5 py-2.5 text-[13px] font-semibold">
              <DoodleIcon name="doc" size={14} />Log an invoice
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
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-box text-ink/70"><DoodleIcon name="checklist" size={14} /></span>
          <span className="min-w-0 flex-1">Invoice logged. It is on the home as a finished job, it is under To pay, and accounts have been told.</span>
          {logged && <a href={jobHref(logged)} className="underline">Open the job</a>}
          <button type="button" onClick={() => setLogged(null)} className="text-muted underline hover:text-ink">Dismiss</button>
        </div>
      )}

      {/* ── The three counts, all off the live jobs. ── */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat
          icon="info"
          label="Needs attention"
          value={loading ? dot : String(attention.length)}
          hint={loading ? "Reading the jobs" : attention.length ? [pastDay.length ? `${pastDay.length} past ${pastDay.length === 1 ? "its" : "their"} date` : "", waitCount ? `${plural(waitCount, "job")} waiting for a date` : ""].filter(Boolean).join(", ") : "Nothing waiting on you"}
          warm={!loading && attention.length > 0}
          onClick={() => setTab("bookings")}
        />
        <Stat
          icon="calendar"
          label="Booked this week"
          value={loading ? dot : String(upcoming.length)}
          hint={loading ? "Reading the jobs" : outToday.length ? `${outToday.length} out today, ${plural(new Set(outToday.map((j) => j.contractorId)).size, "contractor")} on site` : "Nobody out today"}
          onClick={() => setTab("bookings")}
        />
        <Stat
          icon="doc"
          label="To pay"
          value={loading ? dot : pounds(owedPence)}
          hint={loading ? "Reading the invoices" : longWait.length ? `${plural(unpaid.length, "invoice")} to pay, ${longWait.length} over ${WAITING_DAYS} days` : unpaid.length ? `${plural(unpaid.length, "invoice")} to pay` : "Nothing owed"}
          onClick={() => setTab("pay")}
        />
      </div>

      {/* The sections and Mine / Everyone as quiet chips, a hairline running off to the right. */}
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <Chip on={tab === "bookings"} onClick={() => setTab("bookings")}>Bookings</Chip>
        <Chip on={tab === "book"} onClick={() => setTab("book")}>Contractors{data ? <span className="figures ml-1.5 opacity-60">{all.length}</span> : null}</Chip>
        <Chip on={tab === "pay"} onClick={() => setTab("pay")}>To pay{unpaid.length ? <span className="figures ml-1.5 opacity-60">{unpaid.length}</span> : null}</Chip>
        {canSwitch && (
          <>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <Chip on={view === "mine"} onClick={() => saveView("mine")}>My jobs</Chip>
            <Chip on={view === "everyone"} onClick={() => saveView("everyone")}>Everyone&apos;s</Chip>
          </>
        )}
        <span aria-hidden className="ml-2 hidden h-px min-w-[40px] flex-1 bg-line/70 sm:block" />
      </div>
      {data && (
        <p className="mt-2.5 text-[11.5px] text-muted">
          {data.office
            ? "You see every agent's contractors and jobs, because the office pays them."
            : data.mineNote ?? "Only your own jobs show here: the homes in your book, and jobs you raised."}
        </p>
      )}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">{dot} Reading the contractors…</p>
      ) : !data ? null : tab === "bookings" ? (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <section className={`${box} min-w-0 p-5`}>
            <Head icon="info" warm={attention.length > 0} title="Needs Attention" blurb="Jobs that need your input to move forward." count={attention.length} />
            {attention.length === 0 ? (
              <Empty>Nothing needs a look. Every works order has a date.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-line/50">
                {attention.map(({ j, iso, why, hot, note }) => (
                  <JobRow key={j.id} j={j} iso={iso} c={mark(j)} onWho={openProfile} pill={why} hot={hot} note={note} />
                ))}
              </ul>
            )}
          </section>
          <section className={`${box} min-w-0 p-5`}>
            <Head icon="calendar" title="Upcoming Bookings" blurb="Contractors due to attend in the next seven days." count={upcoming.length} />
            {upcoming.length === 0 ? (
              <Empty>Nothing booked for the next seven days.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-line/50">
                {upcoming.map((j) => {
                  const isToday = londonDay(j.scheduledAt!) === today;
                  return <JobRow key={j.id} j={j} iso={j.scheduledAt} c={mark(j)} onWho={openProfile} pill={isToday ? `Today ${hhmm(j.scheduledAt!)}` : hhmm(j.scheduledAt!)} strong={isToday} />;
                })}
              </ul>
            )}
            {later.length > 0 && (
              <>
                <p className="mt-4 border-t border-line/50 pt-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Later</p>
                <ul className="divide-y divide-line/50">
                  {later.map((j) => <JobRow key={j.id} j={j} iso={j.scheduledAt} c={mark(j)} onWho={openProfile} pill={hhmm(j.scheduledAt!)} />)}
                </ul>
              </>
            )}
          </section>
        </div>
      ) : tab === "book" ? (
        <div className="mt-5 space-y-5">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><DoodleIcon name="search" size={13} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, trade, phone, Gas Safe number…" className="w-full rounded-full border border-line/80 bg-white py-2 pl-9 pr-4 text-[12.5px] outline-none focus:border-ink" />
          </div>
          {editing && (
            <div ref={formRef} className={`${box} scroll-mt-6 p-5`}>
              <h2 className="text-[16px] font-medium">{editing.id ? `Edit ${editing.name || "Contractor"}` : "New Contractor"}</h2>
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
        <div className="mt-5 space-y-5">
          <section className={`${box} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <Head icon="wallet" title="Invoices to Pay" blurb={`Their invoice is on the job and accounts have been told. Oldest first. Over ${WAITING_DAYS} days is marked.`} />
              <span className="figures shrink-0 text-[15px] font-semibold">{pounds(owedPence)}</span>
            </div>
            {unpaid.length === 0 ? (
              <Empty>Nothing owed. Every contractor invoice on the OS is paid.</Empty>
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
                        <span className="block truncate text-[11px] text-muted">{j.propertyName} · #{j.ref} {j.title}{j.invoiceRef ? ` · invoice ${j.invoiceRef}` : ""}</span>
                      </a>
                      <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {/* The payment run (21 Oct 2026): keyed on PayProp yet, or still to go on. */}
                        <PayrunTag o={j} />
                        <Pill tone={w > WAITING_DAYS ? "accent" : "neutral"}>{w <= 0 ? "in today" : `${plural(w, "day")}`}</Pill>
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
                      <span className="block truncate text-[11px] text-muted">{j.propertyName} · paid {day(j.paidAt)}</span>
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

type Attn = { j: Job; iso: string | null; why: string; hot: boolean; note: string };

/** A round, soft icon: grey on the calm cards, blush where something needs a look. */
function Disc({ icon, warm = false, size = 36 }: { icon: string; warm?: boolean; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-full ${warm ? "bg-accent-soft text-accent-dark" : "bg-box text-ink/65"}`}>
      <DoodleIcon name={icon} size={Math.round(size * 0.4)} />
    </span>
  );
}

function Stat({ icon, label, value, hint, warm = false, onClick }: { icon: string; label: string; value: React.ReactNode; hint: string; warm?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-4 rounded-2xl border px-5 py-5 text-left transition-colors hover:border-ink/30 ${warm ? "border-accent/30 bg-accent-soft/35" : "border-line/70 bg-white"}`}
    >
      <Disc icon={icon} warm={warm} size={52} />
      <span className="min-w-0">
        <span className="block text-[12.5px] text-muted">{label}</span>
        <span className="figures mt-0.5 block text-[28px] font-semibold leading-tight">{value}</span>
        <span className="block truncate text-[11.5px] text-muted">{hint}</span>
      </span>
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-4 py-1.5 text-[12.5px] transition-colors ${on ? "border-ink bg-ink text-page" : "border-line/80 bg-white text-ink/70 hover:border-ink/40 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl bg-box px-4 py-5 text-center text-[12.5px] text-muted">{children}</p>;
}

function Head({ icon, title, blurb, count, warm = false }: { icon: string; title: string; blurb: string; count?: number; warm?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Disc icon={icon} warm={warm} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-medium">{title}</h2>
          {count != null && <span className="figures shrink-0 text-[12px] text-muted">{count}</span>}
        </div>
        <p className="mt-0.5 text-[11.5px] text-muted">{blurb}</p>
      </div>
    </div>
  );
}

/** Day, date, month: the tile at the start of every row. */
function DateTile({ iso }: { iso: string | null }) {
  if (!iso) return <span className="w-12 shrink-0" />;
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...o, timeZone: "Europe/London" });
  return (
    <span className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-line/70 bg-white py-1.5 leading-none">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted">{f({ weekday: "short" })}</span>
      <span className="figures mt-1 text-[17px] font-semibold">{f({ day: "numeric" })}</span>
      <span className="mt-0.5 text-[9.5px] text-muted">{f({ month: "short" })}</span>
    </span>
  );
}

/** One job: the date, the home, the job, the contractor, why it's here. The whole row opens the job. */
function JobRow({ j, iso, c, onWho, pill, hot = false, strong = false, note }: {
  j: Job; iso: string | null; c: Contractor | undefined; onWho: (id: string | null) => void;
  pill: string; hot?: boolean; strong?: boolean; note?: string;
}) {
  const tag = `figures shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${hot ? "bg-accent-soft text-accent-dark" : strong ? "bg-ink text-page" : "bg-box text-ink/70"}`;
  return (
    <li>
      <a href={jobHref(j.id)} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-box/70">
        <DateTile iso={iso} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{j.propertyName || "A home"}{j.locality ? <span className="font-normal text-muted">, {j.locality}</span> : null}</span>
          <span className="block truncate text-[11.5px] text-muted">#{j.ref} · {j.title}{note ? ` · ${note}` : ""}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWho(j.contractorId); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onWho(j.contractorId); } }}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line/60 bg-white py-0.5 pl-0.5 pr-2.5 text-[11.5px] hover:border-ink/40"
          >
            <ContractorMark name={j.contractorName} logoUrl={c?.logoUrl} size={20} />
            <span className="truncate">{j.contractorName || "A contractor"}</span>
          </span>
          {/* On a phone the reason sits under the job, so the address keeps the width. */}
          <span className={`${tag} sm:hidden`}>{pill}</span>
          </span>
        </span>
        <span className={`${tag} hidden sm:inline-block`}>{pill}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"><path d="M9 6l6 6-6 6" /></svg>
      </a>
    </li>
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
        <Empty>{searching ? "Nobody here matches that." : "Nobody here yet."}</Empty>
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
      className={`flex min-w-0 cursor-pointer flex-col rounded-xl border border-line/60 bg-white p-4 text-left transition-colors duration-200 hover:border-ink/40 ${c.active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <ContractorMark name={c.name} logoUrl={c.logoUrl} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px]">{c.name}</p>
          <p className="truncate text-[11.5px] text-muted">{[c.trade, c.contact].filter(Boolean).join(" · ") || "Trade not given"}</p>
          <p className="truncate text-[11px] text-muted">{c.phone || c.email || "No contact details yet"}</p>
        </div>
        {p?.today ? <Pill tone="neutral">Out today</Pill> : !c.active ? <Pill tone="neutral">Not active</Pill> : null}
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

/* ── The new look (the design's Contractors, 25 Oct 2026) ───────────────── */

/** How many of Needs You show before "Show N more". */
const NEEDS_SHOWN = 5;

const ukDay = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-GB", { ...o, timeZone: "Europe/London" });
/** "Mon 27 Oct", a London day. */
const longDate = (iso: string) => ukDay(iso, { weekday: "short", day: "numeric", month: "short" });

/** The date column: the day in full, the weekday under it. */
function DateCol({ iso, hot = false, sub }: { iso: string | null; hot?: boolean; sub?: string }) {
  if (!iso) return <span className="nl-ct-dt"><b>No date</b>yet</span>;
  return (
    <span className={`nl-ct-dt${hot ? " is-late" : ""}`}>
      <b>{ukDay(iso, { day: "numeric", month: "short" })}</b>
      {sub ?? ukDay(iso, { weekday: "short" })}
    </span>
  );
}

/** The contractor's name, which opens their record, as it did on the old rows. */
function WhoLink({ j, onWho }: { j: Job; onWho: (id: string | null) => void }) {
  return <button type="button" className="nl-ct-who" onClick={() => onWho(j.contractorId)}>{j.contractorName || "A contractor"}</button>;
}

/**
 * One job that needs someone: the day it went by or was due, the home, the
 * job, who and why, and what to do. The actions open the job's own page,
 * where the date, the visit and the rest are recorded - as the whole row did.
 */
function CtNeedsRow({ a, today, onWho }: { a: Attn; today: string; onWho: (id: string | null) => void }) {
  const { j, iso, why, hot, note } = a;
  const gone = !!j.scheduledAt && londonDay(j.scheduledAt) < today;
  const waiting = why === "Waiting for date";
  return (
    <div className="nl-ct-job">
      <DateCol iso={iso} hot={!waiting} />
      <div className="nl-ct-t">
        <a href={jobHref(j.id)} className="nl-ct-home">{j.propertyName || "A home"}{j.locality ? <span>, {j.locality}</span> : null}</a>
        <span className="nl-ct-d">#{j.ref} · {j.title}</span>
        <span className="nl-ct-m">
          <WhoLink j={j} onWho={onWho} /> · <span className={hot ? "is-bad" : ""}>{gone ? "Visit day has gone by, not marked done" : waiting ? `Waiting for a date${note ? `, ${note}` : ""}` : `Past its date${note ? `, ${note}` : ""}`}</span>
        </span>
      </div>
      <div className="nl-ct-q">
        {gone ? (
          <>
            <a href={jobHref(j.id)} className="nl-btn nl-btn--secondary nl-btn--sm">Mark it done</a>
            <a href={jobHref(j.id)} className="nl-btn nl-fs-ghost nl-btn--sm">Move the date</a>
          </>
        ) : (
          <a href={jobHref(j.id)} className="nl-btn nl-btn--secondary nl-btn--sm">{j.scheduledAt ? "Move the date" : "Set the date"}</a>
        )}
      </div>
    </div>
  );
}

/** One booking: the day, the home, the job, who and the time, and the state in a word. */
function CtBookedRow({ j, today, onWho }: { j: Job; today: string; onWho: (id: string | null) => void }) {
  const isToday = londonDay(j.scheduledAt!) === today;
  return (
    <div className="nl-ct-job">
      <DateCol iso={j.scheduledAt} sub={isToday ? "Today" : undefined} />
      <div className="nl-ct-t">
        <a href={jobHref(j.id)} className="nl-ct-home">{j.propertyName || "A home"}{j.locality ? <span>, {j.locality}</span> : null}</a>
        <span className="nl-ct-d">#{j.ref} · {j.title}</span>
        <span className="nl-ct-m"><WhoLink j={j} onWho={onWho} /> · {hhmm(j.scheduledAt!)}</span>
      </div>
      <div className="nl-ct-q"><span className={isToday ? "nl-ct-st" : "nl-ct-st is-ok"}>{isToday ? "Out today" : "Booked"}</span></div>
    </div>
  );
}

/** An invoice to pay, or one paid: the day it came in or was paid, who, the job, the payment run, the figure. */
function CtInvRow({ j, waited, paid = false }: { j: Job; waited: number; paid?: boolean }) {
  const long = !paid && waited > WAITING_DAYS;
  return (
    <div className={`nl-ct-inv${paid ? " is-paid" : ""}`}>
      <DateCol iso={paid ? j.paidAt : j.invoicedAt} hot={long} sub={paid ? "paid" : "in"} />
      <div className="nl-ct-t">
        <a href={jobHref(j.id)} className="nl-ct-home">{j.payee === "agent" ? `${j.raisedBy} (paid it themselves)` : j.contractorName}</a>
        <span className="nl-ct-d">{j.propertyName} · #{j.ref} {j.title}</span>
        {!paid && (
          <span className="nl-ct-m">
            {[j.invoiceRef ? `Invoice ${j.invoiceRef}` : "", awaitingPay(j) ? (j.payrunAt ? PAYRUN_LABEL : "To go on PayProp") : ""].filter(Boolean).join(" · ")}
            {(j.invoiceRef || awaitingPay(j)) ? " · " : ""}
            <span className={long ? "is-bad" : ""}>{waited <= 0 ? "in today" : `waiting ${plural(waited, "day")}`}</span>
          </span>
        )}
      </div>
      <span className="nl-ct-amt">{j.invoicePence != null ? pounds(j.invoicePence) : ""}</span>
      <div className="nl-ct-q">{!paid && <a href={jobHref(j.id)} className="nl-btn nl-btn--secondary nl-btn--sm">Mark it paid</a>}</div>
    </div>
  );
}

/** A shelf of the book: its heading, then a row for each contractor. */
function CtShelf({ title, blurb, rows, per, onOpen, onEdit, canEdit, searching }: {
  title: string; blurb: string; rows: Row[]; per: Per; onOpen: (c: Row) => void; onEdit: (c: Contractor) => void; canEdit: (c: Contractor) => boolean; searching: boolean;
}) {
  return (
    <section className="nl-ct-sec">
      <div className="nl-ct-sh"><h2>{title}</h2><span>{rows.length}</span></div>
      <p className="nl-meta nl-ct-shnote">{blurb}</p>
      {rows.length === 0 ? (
        <p className="nl-ct-calm">{searching ? "Nobody here matches that." : "Nobody here yet."}</p>
      ) : rows.map((c) => <CtRow key={c.id} c={c} p={per.get(c.id)} onOpen={() => onOpen(c)} onEdit={canEdit(c) ? () => onEdit(c) : null} />)}
    </section>
  );
}

/** One contractor: their mark, name and trade, their paperwork in words, their jobs. The row opens the record. */
function CtRow({ c, p, onOpen, onEdit }: { c: Row; p: { open: number; owed: number; today: boolean } | undefined; onOpen: () => void; onEdit: (() => void) | null }) {
  const creds = credentialsOf(c);
  const pl = liabilityOf(c);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
      className={`nl-ct-crow${c.active ? "" : " is-off"}`}
    >
      <ContractorMark name={c.name} logoUrl={c.logoUrl} size={40} />
      <span className="min-w-0">
        <b>{c.name}</b>
        <span className="nl-ct-s">{[c.trade, c.contact].filter(Boolean).join(" · ") || "Trade not given"}</span>
        <span className="nl-ct-s nl-ct-s-sm">{creds.length ? creds.map((x) => `${x.label} ${x.value}`).join(" · ") : "No registration on file"}</span>
      </span>
      <span className="nl-ct-paper">
        <span className={pl.tone === "accent" ? "is-bad" : pl.tone === "warn" ? "is-soon" : pl.tone === "good" ? "is-ok" : ""}>{pl.pill}</span>
        <span className="nl-ct-s">{creds.length ? creds.map((x) => `${x.label} ${x.value}`).join(" · ") : "No registration on file"}</span>
      </span>
      <span className="nl-ct-work">
        {p?.today ? "Out today" : !c.active ? "Not active" : p?.open ? plural(p.open, "open job") : "No open jobs"}
        {p?.owed ? <span className="nl-ct-s">{pounds(p.owed)} owed</span> : null}
      </span>
      <span className="nl-ct-end">
        {onEdit && <button type="button" className="nl-link" onClick={(e) => { e.stopPropagation(); onEdit(); }}>Edit</button>}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </span>
    </div>
  );
}

function SendIco() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>;
}
function BoltIco() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg>;
}
