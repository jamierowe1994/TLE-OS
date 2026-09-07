"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { WorksNow } from "@/components/WorksNow";
import { stepOf } from "@/lib/works-steps";
import type { Move, RankedContractor, WorksEvent, WorksOrder } from "@/lib/works-orders";

/**
 * The maintenance rehearsal — one repair, four points of view.
 *
 * James, 7 Sep 2026: "We can book it as if we're a person, and then we should
 * be able to check both the landlord and the tenant areas to see what they
 * would see."
 *
 * So: tabs. The agent tab is the real job sheet and drives everything. The
 * other three are windows onto what each person has actually received at this
 * moment in the flow — the contractor's page in a phone, the landlord's and
 * the tenant's post, rendered from the real catalogue. Do something on the
 * agent tab and the others fill up behind you.
 *
 * Nothing here is a drawing. It is the product, on invented people, with the
 * post kept in a drawer instead of sent.
 */

type Fault = { id: string; title: string; category: string; urgency: string; description: string };
type Mail = { id: string; role: "contractor" | "tenant" | "landlord" | "accounts"; address: string; subject: string; html: string; at: string };
type State = {
  ok: boolean;
  order: WorksOrder | null;
  events: WorksEvent[];
  emails: Mail[];
  ranked: RankedContractor[];
  step: string | null;
  faults?: Fault[];
  agent?: { name: string; email: string };
  error?: string;
};

type TabId = "agent" | "contractor" | "landlord" | "tenant";

const TABS: { id: TabId; label: string; who: string }[] = [
  { id: "agent", label: "The agent", who: "You, in the OS" },
  { id: "contractor", label: "The contractor", who: "On their phone" },
  { id: "landlord", label: "The landlord", who: "Margaret's inbox" },
  { id: "tenant", label: "The tenant", who: "Chris's inbox" },
];

const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function RehearsalPage() {
  const { token } = useParams<{ token: string }>();
  const [s, setS] = useState<State | null>(null);
  const [tab, setTab] = useState<TabId>("agent");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* What each side had when you last looked, so a tab can say something new
     has landed without you having to read the whole inbox again. */
  const [seen, setSeen] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    fetch(`/api/rehearsal/${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setS(j) : setErr(j.error ?? "That link isn't one of ours.")))
      .catch(() => setErr("Could not load the walkthrough."));
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
    setS((cur) => ({ ...(cur ?? {}), ...r, faults: cur?.faults, agent: cur?.agent }));
  }
  const move = async (m: Move) => { if (s?.order) await post({ do: "move", orderId: s.order.id, move: m }); };

  const o = s?.order ?? null;
  const emails = useMemo(() => s?.emails ?? [], [s]);
  const countFor = useCallback((id: TabId) => {
    if (id === "agent") return emails.filter((e) => e.role === "accounts").length;
    return emails.filter((e) => e.role === id).length;
  }, [emails]);
  useEffect(() => { setSeen((cur) => ({ ...cur, [tab]: countFor(tab) })); }, [tab, countFor]);

  if (err && !s) return <Frame><p className="text-[13px] text-accent-dark">{err}</p></Frame>;
  if (!s) return <Frame><p className="text-[13px] text-muted">Opening the walkthrough…</p></Frame>;

  return (
    <Frame>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">TLE OS · a walkthrough</p>
          <h1 className="mt-1 text-[26px] leading-tight">A repair, from the phone call to the invoice</h1>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            One made-up house and three made-up people. Everything you press is the real system: the same steps, the same
            contractor page, the same emails. The only difference is that the post is kept here instead of being sent, so
            you can read it on the tabs above as it arrives.
          </p>
        </div>
        {o && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void post({ do: "end", orderId: o.id })}
            className="shrink-0 rounded-full border border-line/80 px-4 py-2 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink"
          >
            Start again
          </button>
        )}
      </header>

      {o && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Card k="The house" v={`${o.propertyName}, ${o.locality}`} note={o.access} />
          <Card k="The landlord" v={o.landlord} note={`${o.landlordMobile} · ${o.landlordEmail}`} />
          <Card k="The tenant" v={o.tenant} note={o.tenantEmail} />
        </div>
      )}

      <nav className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = countFor(t.id);
          const fresh = n > (seen[t.id] ?? 0);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-left text-[12.5px] font-semibold transition-colors ${tab === t.id ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`}
            >
              {t.label}
              <span className={`ml-1.5 font-normal ${tab === t.id ? "opacity-70" : "opacity-60"}`}>{t.who}</span>
              {n > 0 && (
                <span className={`ml-2 inline-flex min-w-[18px] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${fresh ? "bg-accent-dark text-page" : tab === t.id ? "bg-page/20" : "bg-line/60 text-ink"}`}>{n}</span>
              )}
            </button>
          );
        })}
      </nav>

      {err && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{err}</p>}

      <div className="mt-4">
        {tab === "agent" && (
          o ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <WorksNow
                  o={o}
                  move={move}
                  busy={busy}
                  err={null}
                  canCorporate={false}
                  ranked={s.ranked}
                  canAdd={false}
                  onInvoiceLandlord={() => setErr("Drafting our invoice to the landlord opens the invoicing screen, which is behind sign-in. On the walkthrough the job stops here.")}
                />
                <Hint>
                  {hintFor(stepOf(o))}
                </Hint>
              </div>
              <section className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">What has happened</p>
                <ul className="mt-2 space-y-2.5">
                  {s.events.map((e) => (
                    <li key={e.id} className="text-[11.5px]">
                      <p className="leading-snug">{e.text}</p>
                      <p className="mt-0.5 text-[10px] text-muted">{e.by} · {stamp(e.at)}</p>
                    </li>
                  ))}
                </ul>
                <Post mail={emails.filter((e) => e.role === "accounts")} lead="Accounts" blank="Nothing to accounts yet. Their email goes the moment an invoice lands on the job." compact />
              </section>
            </div>
          ) : (
            <Start faults={s.faults ?? []} busy={busy} onStart={(f) => void post({ do: "start", fault: f })} agent={s.agent?.name ?? ""} />
          )
        )}

        {tab === "contractor" && <ContractorTab o={o} />}
        {tab === "landlord" && (
          <Side
            title="Margaret Hollis, the landlord"
            blurb="What she has been sent, newest last. She is rung first; the email is the written record and asks whether she wants to organise it herself."
            mail={emails.filter((e) => e.role === "landlord")}
            blank="Nothing yet. The landlord hears from us at the Tell the landlord step."
          />
        )}
        {tab === "tenant" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Side
              title="Chris Bennett, the tenant"
              blurb="Kept in the loop without having to chase: told we have it, told when somebody is found, told the date, then asked one question at the end."
              mail={emails.filter((e) => e.role === "tenant")}
              blank="Nothing yet."
            />
            {o?.tenantToken && o.completedAt && (
              <Phone label="The one question, on their phone">
                <iframe src={`/repair/${o.tenantToken}`} title="What the tenant sees" className="h-full w-full border-0" />
              </Phone>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-[11px] text-muted">
        Invented people on example.com, which cannot belong to anybody. Nothing on this page is on a real list, in a real
        figure, or in anybody&apos;s actual inbox.
      </p>
    </Frame>
  );
}

/* ── the pieces ─────────────────────────────────────────────────────────── */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-page px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}

function Card({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-4">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</p>
      <p className="mt-1 text-[13.5px]">{v}</p>
      {note && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-2xl border border-dashed border-line/80 bg-panel/60 p-3 text-[11.5px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

/** A line of narration for whoever is being walked through it. */
function hintFor(step: string): string {
  switch (step) {
    case "tell_landlord": return "The landlord comes before anything else. Ring them on the number, or send the report - either way the job records which, and only the email actually writes to them.";
    case "arranging": return "The fork in the road. If Margaret has her own plumber the job goes on a follow-up date and waits on her; if not, we carry on.";
    case "landlord_follow_up": return "Nothing to do until the follow-up date, and then a reminder appears on whoever raised it. You can resolve it, push it, or take it back off her.";
    case "pick_contractor": return "The trades are sorted by the job's trade first, then by how far they are from the house. Ring one, and mark them contacted - that emails them the report.";
    case "contractor_confirm": return "Once they say yes, one press sends the works order to them and tells the tenant somebody has been found. Check the other two tabs after this one.";
    case "booking": return "The contractor sets the date from their own page - see the contractor tab - or you type it in when they ring. Either way the tenant and the landlord are told.";
    case "visit": return "Nothing to do until the visit. The morning after, the contractor is asked whether it is done, so nobody has to chase.";
    case "aftercare": return "The tenant has one question, with a yes and a no in the email. A no comes straight back to the agent as something to sort.";
    case "payment": return "Whoever actually paid is the payee. An agent who paid out of their own pocket is reimbursed instead of the contractor.";
    case "invoice": return "The contractor's invoice goes on the job and to accounts with everything PayProp needs. Our invoice to the landlord is drafted from the same screen.";
    default: return "That is the whole run. Start again to walk it a different way - leave it with the landlord, or say the tenant is not happy.";
  }
}

function Start({ faults, busy, onStart, agent }: { faults: Fault[]; busy: boolean; onStart: (id: string) => void; agent: string }) {
  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-6">
      <h2 className="text-[17px]">The tenant has rung in. What is it?</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        Pick one and the job is raised at 18 Wellfield Terrace, as if {agent || "you"} had taken the call. The property fills in the
        rest - the landlord, the tenant, the access notes - the way it does on a real report.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {faults.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={busy}
            onClick={() => onStart(f.id)}
            className="block-pop rounded-2xl border border-line/80 bg-card p-4 text-left transition-colors hover:border-ink disabled:opacity-50"
          >
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${f.urgency === "emergency" ? "bg-accent-soft text-accent-dark" : "bg-line/50 text-muted"}`}>
              {f.urgency}
            </span>
            <span className="mt-2 block text-[14px] leading-snug">{f.title}</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-muted">{f.description}</span>
          </button>
        ))}
      </div>
      {busy && <p className="mt-3 text-[12px] text-muted">Raising it…</p>}
    </section>
  );
}

function ContractorTab({ o }: { o: WorksOrder | null }) {
  if (!o) return <Empty>Nothing raised yet. Start on the agent tab.</Empty>;
  if (!o.contractorId || !o.contractorToken) {
    return (
      <Empty>
        Nobody has the job yet. When a contractor is marked contacted and then confirmed, their works order carries a link
        to this page — no sign-in, because a plumber on a roof is not going to make an account.
      </Empty>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <Phone label={`${o.contractorName} opens the link in their works order`}>
        <iframe src={`/contractor/${o.contractorToken}`} title="What the contractor sees" className="h-full w-full border-0" />
      </Phone>
      <section className="rounded-2xl border border-line/80 bg-panel p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">What they can do here</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>Set the date they have agreed with the tenant. That tells the tenant and the landlord without anybody in the office typing it.</li>
          <li>Mark it done, with a line about what they did.</li>
          <li>Add photos of the work.</li>
          <li>Put their invoice on with the total and their number. It goes straight to accounts with our job reference on it.</li>
        </ul>
        <p className="mt-3 text-[11.5px] text-muted">
          It is live: press something in the frame and the agent tab moves on. That is the point — the contractor is doing
          the admin, not us.
        </p>
      </section>
    </div>
  );
}

function Phone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="m-0">
      <div className="mx-auto h-[720px] w-[390px] max-w-full overflow-hidden rounded-[34px] border-[10px] border-ink bg-page shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
        {children}
      </div>
      <figcaption className="mt-2 text-center text-[11px] text-muted">{label}</figcaption>
    </figure>
  );
}

function Side({ title, blurb, mail, blank }: { title: string; blurb: string; mail: Mail[]; blank: string }) {
  return (
    <section>
      <div className="rounded-2xl border border-line/80 bg-panel p-4">
        <h2 className="text-[15px]">{title}</h2>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">{blurb}</p>
      </div>
      <Post mail={mail} blank={blank} />
    </section>
  );
}

/** The post itself, rendered as it would arrive. */
function Post({ mail, blank, lead, compact = false }: { mail: Mail[]; blank: string; lead?: string; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (mail.length) setOpen((cur) => cur ?? mail[mail.length - 1].id); }, [mail]);
  if (mail.length === 0) {
    return compact
      ? <p className="mt-3 border-t border-line/50 pt-3 text-[11px] text-muted">{blank}</p>
      : <Empty>{blank}</Empty>;
  }
  return (
    <div className={compact ? "mt-3 border-t border-line/50 pt-3" : "mt-3 space-y-3"}>
      {lead && <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{lead}</p>}
      {mail.map((m) => (
        <article key={m.id} className={`overflow-hidden rounded-2xl border border-line/80 bg-card ${compact ? "mt-2" : ""}`}>
          <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-panel">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{m.subject}</span>
            <span className="text-[10.5px] text-muted">{m.address}</span>
            <span className="text-[10.5px] text-muted">{stamp(m.at)}</span>
            <span className="text-[10.5px] text-muted">{open === m.id ? "hide" : "read"}</span>
          </button>
          {open === m.id && (
            <iframe
              srcDoc={m.html}
              title={m.subject}
              sandbox=""
              className="h-[620px] w-full border-0 border-t border-line/60 bg-white"
            />
          )}
        </article>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-line/80 bg-panel p-8 text-center">
      <p className="mx-auto max-w-lg text-[12.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
