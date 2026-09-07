"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { WorksNow } from "@/components/WorksNow";
import { STEPS, stepOf } from "@/lib/works-steps";
import type { Move, RankedContractor, WorksEvent, WorksOrder } from "@/lib/works-orders";

/**
 * Maintenance, from all four sides.
 *
 * James, 7 Sep 2026: "I just need the views. I don't need the description or
 * walkthrough or whatever. I just need to know what their process would look
 * like, so if I need to make any edits to it visually."
 *
 * So this page explains nothing. Four tabs, one per person, and each shows
 * the actual screens and emails that person gets at this point in the job -
 * full size, open, nothing collapsed behind a "read" link. Drive the job on
 * the agent tab; the other three fill up behind it.
 *
 * The earlier version of this page narrated each step for somebody who had
 * never seen the product. That is a different job and it was in the way.
 */

type Fault = { id: string; title: string; category: string; urgency: string; description: string };
type Mail = { id: string; role: "contractor" | "tenant" | "landlord" | "accounts" | "compliance"; address: string; subject: string; html: string; at: string };
type State = {
  ok: boolean;
  order: WorksOrder | null;
  events: WorksEvent[];
  emails: Mail[];
  ranked: RankedContractor[];
  step: string | null;
  faults?: Fault[];
};

type TabId = "agent" | "landlord" | "tenant" | "contractor";
const TABS: { id: TabId; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "landlord", label: "Landlord" },
  { id: "tenant", label: "Tenant" },
  { id: "contractor", label: "Contractor" },
];

const pounds = (p: number | null | undefined) =>
  p == null ? "—" : `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

export default function MaintenanceViews() {
  const { token } = useParams<{ token: string }>();
  const [s, setS] = useState<State | null>(null);
  const [tab, setTab] = useState<TabId>("agent");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/rehearsal/${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setS(j) : setErr(j.error ?? "That link isn't one of ours.")))
      .catch(() => setErr("Could not load."));
  }, [token]);
  useEffect(load, [load]);

  async function post(body: unknown) {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/rehearsal/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't work.");
    setS((cur) => ({ ...(cur ?? {}), ...r, faults: cur?.faults }));
  }
  const move = async (m: Move) => { if (s?.order) await post({ do: "move", orderId: s.order.id, move: m }); };

  const o = s?.order ?? null;
  const emails = s?.emails ?? [];
  const mailFor = (id: TabId) => emails.filter((e) => e.role === id);
  /* Accounts and compliance are the office's own post, so they sit under the
     agent's screen rather than earning a tab of their own. */
  const office = emails.filter((e) => e.role === "accounts" || e.role === "compliance");

  if (err && !s) return <Shell><p className="text-[13px] text-accent-dark">{err}</p></Shell>;
  if (!s) return <Shell><p className="text-[13px] text-muted">Loading…</p></Shell>;
  if (!o) return <Shell><Faults faults={s.faults ?? []} busy={busy} onPick={(f) => void post({ do: "start", fault: f })} /></Shell>;

  const step = stepOf(o);
  return (
    <Shell>
      {/* One line of context, then straight into the views. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="figures text-muted">#{o.ref}</span>
        <span className="text-[13.5px]">{o.title}</span>
        <span className="text-muted">{o.propertyName}, {o.locality}</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">
          {STEPS.find((x) => x.id === step)?.label}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void post({ do: "end", orderId: o.id })}
          className="ml-auto rounded-full border border-line/80 px-3 py-1 text-[11.5px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          Start again
        </button>
      </div>

      <nav className="mt-3 flex flex-wrap gap-1.5 border-b border-line/70 pb-3">
        {TABS.map((t) => {
          const n = t.id === "agent" ? 0 : mailFor(t.id).length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${tab === t.id ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`}
            >
              {t.label}
              {n > 0 && <span className="ml-1.5 font-normal opacity-70">{n}</span>}
            </button>
          );
        })}
      </nav>

      {err && <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-2.5 text-[12px]">{err}</p>}

      <div className="mt-4">
        {tab === "agent" && (
          <>
            <AgentView o={o} events={s.events} ranked={s.ranked} move={move} busy={busy} />
            {office.length > 0 && (
              <section className="mt-6">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Into the office</p>
                <div className="mt-3"><Mailbox mail={office} /></div>
              </section>
            )}
          </>
        )}
        {tab === "landlord" && <Mailbox mail={mailFor("landlord")} />}
        {tab === "tenant" && (
          <Beside screen={o.completedAt && o.tenantToken ? `/repair/${o.tenantToken}` : null}>
            <Mailbox mail={mailFor("tenant")} />
          </Beside>
        )}
        {tab === "contractor" && (
          <Beside screen={o.contractorToken && o.contractorId ? `/contractor/${o.contractorToken}` : null}>
            <Mailbox mail={mailFor("contractor")} />
          </Beside>
        )}
      </div>
    </Shell>
  );
}

/* ── the agent's screen ─────────────────────────────────────────────────── */

function AgentView({ o, events, ranked, move, busy }: { o: WorksOrder; events: WorksEvent[]; ranked: RankedContractor[]; move: (m: Move) => Promise<void>; busy: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <WorksNow o={o} move={move} busy={busy} err={null} canCorporate={false} ranked={ranked} canAdd={false} onInvoiceLandlord={() => {}} />

        <section className="rounded-2xl border border-line/80 bg-panel p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">The job</p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{o.description}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
            <Fact k="Category" v={o.category} />
            <Fact k="Attend by" v={stamp(o.dueAt)} />
            <Fact k="Reported by" v={`${o.reportedBy} · ${day(o.reportedAt)}`} />
            <Fact k="Tenant" v={o.tenant} />
            <Fact k="Tenant's email" v={o.tenantEmail} />
            <Fact k="Landlord" v={o.landlord} />
            <Fact k="Landlord's email" v={o.landlordEmail} />
            <Fact k="Landlord's mobile" v={o.landlordMobile} />
            <Fact k="Landlord told" v={o.landlordToldAt ? stamp(o.landlordToldAt) : "not yet"} />
            <Fact k="Arranging" v={o.arranging === "landlord" ? `Landlord · follow up ${day(o.landlordFollowUpAt)}` : o.arranging === "us" ? "Us" : "—"} />
            <Fact k="Access" v={o.access} />
            <Fact k="Contractor" v={o.contractorName || "not yet"} />
            <Fact k="Booked for" v={stamp(o.scheduledAt)} />
            <Fact k="Tenant happy" v={o.tenantHappy ? `${o.tenantHappy === "yes" ? "Yes" : "No"} · ${day(o.tenantHappyAt)}` : "not asked yet"} />
          </dl>
        </section>

        <section className="rounded-2xl border border-line/80 bg-panel p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Money</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
            <Fact k="Landlord's authority" v={pounds(o.authorityPence)} />
            <Fact k="Quote" v={pounds(o.quotePence)} />
            <Fact k="Payee" v={o.payee === "agent" ? `${o.raisedBy} (paid it themselves)` : o.payee === "contractor" ? o.contractorName : "—"} />
            <Fact k="Invoice" v={o.invoicePence != null ? `${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}` : "not yet"} />
            <Fact k="Accounts told" v={o.accountsToldAt ? day(o.accountsToldAt) : "not yet"} />
            <Fact k="Paid" v={o.paidAt ? day(o.paidAt) : "not yet"} />
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-line/80 bg-panel p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Timeline</p>
        <ul className="mt-2 space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="text-[11.5px]">
              <p className="leading-snug">{e.text}</p>
              <p className="mt-0.5 text-[10px] text-muted">{e.by} · {stamp(e.at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</dt>
      <dd className="mt-0.5 truncate" title={v}>{v || "—"}</dd>
    </div>
  );
}

/* ── what lands in their inbox ──────────────────────────────────────────── */

function Mailbox({ mail }: { mail: Mail[] }) {
  if (mail.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line/80 bg-panel p-6 text-center text-[12.5px] text-muted">Nothing sent to them yet.</p>;
  }
  return (
    <div className="space-y-4">
      {mail.map((m) => (
        <article key={m.id} className="overflow-hidden rounded-2xl border border-line/80 bg-card">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/60 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-[12.5px] font-semibold">{m.subject}</span>
            <span className="text-[10.5px] text-muted">{m.address}</span>
            <span className="text-[10.5px] text-muted">{stamp(m.at)}</span>
          </header>
          <EmailBody html={m.html} title={m.subject} />
        </article>
      ))}
    </div>
  );
}

/**
 * The email at its real size.
 *
 * srcDoc with `allow-same-origin` and no `allow-scripts`: the document still
 * cannot run anything, and being same-origin lets the frame be measured so
 * the whole email is on the page rather than in a little scrolling window.
 * These are our own catalogue emails, rendered server-side.
 */
function EmailBody({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(720);
  const measure = useCallback(() => {
    const d = ref.current?.contentDocument;
    if (d?.body) setH(Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 8);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(measure, 120);
    window.addEventListener("resize", measure);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", measure); };
  }, [measure, html]);
  return (
    <iframe ref={ref} srcDoc={html} title={title} sandbox="allow-same-origin" onLoad={measure} style={{ height: h }} className="w-full border-0 bg-white" />
  );
}

/* ── their own page, at phone size, beside their post ───────────────────── */

function Beside({ screen, children }: { screen: string | null; children: React.ReactNode }) {
  if (!screen) return <>{children}</>;
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[408px_minmax(0,1fr)]">
      <div className="mx-auto h-[720px] w-[390px] max-w-full shrink-0 overflow-hidden rounded-[30px] border-[9px] border-ink bg-page shadow-[0_20px_50px_-22px_rgba(0,0,0,0.45)] xl:sticky xl:top-6">
        <iframe src={screen} title="Their page" className="h-full w-full border-0" />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ── starting one ───────────────────────────────────────────────────────── */

function Faults({ faults, busy, onPick }: { faults: Fault[]; busy: boolean; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {faults.map((f) => (
        <button
          key={f.id}
          type="button"
          disabled={busy}
          onClick={() => onPick(f.id)}
          className="rounded-full border border-line/80 bg-card px-4 py-2 text-[13px] transition-colors hover:border-ink disabled:opacity-50"
        >
          {f.title}
          <span className="ml-2 text-[10.5px] uppercase tracking-wider text-muted">{f.urgency}</span>
        </button>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-page px-4 py-6 text-ink sm:px-8">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}
