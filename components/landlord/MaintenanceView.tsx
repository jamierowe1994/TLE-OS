import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import AgentCard from "@/components/landlord/AgentCard";
import AgentSheet from "@/components/landlord/AgentSheet";
import ReportIssue from "@/components/landlord/ReportIssue";
import type { MaintJob, MaintView, MaintVisit } from "@/lib/landlord-maintenance-view";
import { isLet, type LandlordView } from "@/lib/landlord-view";

/**
 * The Maintenance page (12 Sep 2026), in the home page's language, and the
 * first page of the portal to run on the palette's sage (James: "start
 * incorporating some more green"). Pink stays for the one thing that needs
 * the landlord; everything that is in hand, booked or done is green.
 *
 * The title and the agent. Then reporting a problem, on the sage card,
 * beside the figures at a glance. Then what needs them, the open jobs with
 * what is happening now on each, the visits we make, and what has been
 * done this year with what it cost. Every job and visit is the real record
 * from the maintenance board and the inspections book.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const SAGE_INK = "#56634a";
const SAGE_WASH = "#f1f4ec";
const SAGE = "#b3bea5";

export default function MaintenanceView({ view: v, m, sample = false }: { view: LandlordView; m: MaintView; sample?: boolean }) {
  const first = v.agent?.name.split(/\s+/)[0] ?? "your agent";
  const upcoming = m.visits.filter((x) => x.state !== "done");
  /* Locked until there is a tenant to maintain for (James, 12 Sep 2026):
     a landlord mid-journey with no managed property sees what this becomes
     and where they are, not an empty board. */
  if (!isLet(v) && m.properties.length === 0) return <Locked view={v} />;
  return (
    <div className="space-y-6">
      {/* ── title and the agent ── */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="pt-2">
          <h1 className="text-[44px] leading-[1.05]">Maintenance</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-muted">What is being fixed, what is booked, and what we have done on your property.</p>
        </div>
        <AgentCard v={v} />
      </div>

      {/* ── report a problem, and the figures ── */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-[22px] p-7" style={{ background: SAGE_WASH }} data-search>
          <span aria-hidden className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full" style={{ background: `${SAGE}33` }} />
          <span aria-hidden className="pointer-events-none absolute -bottom-40 right-28 h-72 w-72 rounded-full bg-white/50" />
          <div className="relative">
            <p className={eyebrow}>Need something doing?</p>
            <div className="mt-4 flex items-start gap-5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
                <DoodleIcon name="setting" size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[28px] leading-tight">Tell us, and we take it from there</h2>
                <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">
                  Something you have noticed, or something your tenant has told you. Up to {m.authority} we get on with it; above that we ask you first.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <ReportIssue properties={m.properties.map((p) => p.name)} sample={sample} agentFirst={first} />
            </div>
          </div>
        </section>

        <section className={`${card} p-6`} data-search>
          <h2 className="text-[18px]">At a glance</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Figure label="Open jobs" value={String(m.open.length)} sub={m.needsYou.length ? `${m.needsYou.length} waiting on you` : m.open.length ? "All in hand" : "Nothing open"} tone={m.needsYou.length ? "pink" : "sage"} />
            <Figure label="Visits booked" value={String(upcoming.length)} sub={upcoming[0] ? upcoming[0].when : "None arranged"} />
            <Figure label={`Spent in ${m.spent.year}`} value={m.spent.figure} sub={`${m.spent.jobs} job${m.spent.jobs === 1 ? "" : "s"} done`} />
            <Figure label="Your authority" value={m.authority} sub="We go ahead up to this" />
          </dl>
        </section>
      </div>

      {/* ── what needs them ── */}
      {m.needsYou.length > 0 && (
        <section className="rounded-[22px] bg-accent-soft/80 p-6" data-search>
          <p className={eyebrow}>Waiting on you</p>
          <ul className="mt-3 divide-y divide-accent-dark/10">
            {m.needsYou.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-4 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-accent-dark">
                  <DoodleIcon name="bell" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{j.title}</span>
                  <span className="block text-[12.5px] text-muted">{j.needsYou}</span>
                </span>
                <span className="text-[12px] text-muted">{first} will call, or message them</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── open jobs ── */}
      <section className={`${card} p-6`} data-search>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[18px]">Open jobs</h2>
          <span className="text-[11.5px] text-muted">{m.open.length === 0 ? "Nothing open" : `${m.open.length} on the go`}</span>
        </div>
        {m.open.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">Nothing being worked on right now. Anything reported shows here the same day, with what is happening on it.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line/50">
            {m.open.map((j) => (
              <JobRow key={j.id} j={j} />
            ))}
          </ul>
        )}
      </section>

      {/* ── visits, and what has been done ── */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`} data-search>
          <h2 className="text-[18px]">Property visits</h2>
          <p className="mt-1.5 text-[12.5px] text-muted">We call round through the tenancy to see how the home is being kept. Your tenant agrees each date.</p>
          {m.visits.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">None arranged yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line/50">
              {m.visits.map((x) => (
                <VisitRow key={x.id} x={x} />
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} p-6`} data-search>
          <h2 className="text-[18px]">Done</h2>
          <p className="mt-1.5 text-[12.5px] text-muted">Finished jobs, with what each one cost.</p>
          {m.done.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">Nothing finished yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line/50">
              {m.done.map((j) => (
                <JobRow key={j.id} j={j} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── the properties this covers ── */}
      {m.properties.length > 0 && (
        <section className={`${card} p-6`} data-search>
          <h2 className="text-[18px]">{m.properties.length === 1 ? "The property we look after" : "The properties we look after"}</h2>
          <ul className="mt-4 space-y-3">
            {m.properties.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center gap-4">
                <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line/60" style={{ background: SAGE_WASH }}>
                  <PropertyPhoto src={p.image} className="h-full w-full object-cover" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px]">{p.name}</h3>
                  <p className="text-[12px] text-muted">{p.locality}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── how it works, on sage ── */}
      <section className="relative overflow-hidden rounded-[22px] p-6" style={{ background: SAGE_WASH }} data-search>
        <div className="relative z-[1] flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
            <DoodleIcon name="shield" size={17} />
          </span>
          <h2 className="text-[18px] leading-snug">How maintenance works with us</h2>
        </div>
        <ul className="relative z-[1] mt-4 grid max-w-[60%] gap-2.5 sm:grid-cols-1">
          {[
            "Your tenant reports to us, and we tell you the same day.",
            `Up to ${m.authority} we get on with it. Above that, we ask you first.`,
            "Every job, quote and invoice is on this page, and on your statement.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[12.5px]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold" style={{ color: SAGE_INK }}>
                ✓
              </span>
              {t}
            </li>
          ))}
        </ul>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/art/family-home.png" alt="" className="pointer-events-none absolute -bottom-2 -right-3 w-[36%] max-w-[220px]" />
      </section>
    </div>
  );
}

function Figure({ label, value, sub, tone = "plain" }: { label: string; value: string; sub: string; tone?: "plain" | "sage" | "pink" }) {
  return (
    <div className="rounded-2xl p-4" style={tone === "sage" ? { background: SAGE_WASH } : tone === "pink" ? { background: "var(--accent-soft)" } : { background: "#f8f8f6" }}>
      <dt className={eyebrow}>{label}</dt>
      <dd className="figures mt-1.5 text-[26px] leading-none" style={tone === "sage" ? { color: SAGE_INK } : tone === "pink" ? { color: "var(--accent-dark)" } : undefined}>
        {value}
      </dd>
      <dd className="mt-1.5 text-[11.5px] text-muted">{sub}</dd>
    </div>
  );
}

/** One job: what it is, where it is up to, who is doing it, what it costs. */
function JobRow({ j }: { j: MaintJob }) {
  const done = j.state === "done";
  return (
    <li className="flex flex-wrap items-center gap-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: SAGE_WASH, color: SAGE_INK }}>
        <DoodleIcon name={j.kind === "planned" ? "calendar" : "setting"} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">
          {j.title}
          {j.urgency && !done && j.urgency !== "Routine" && (
            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">{j.urgency}</span>
          )}
        </span>
        <span className="block text-[12px] text-muted">
          {j.property}  •  {j.reported}
          {j.contractor ? `  •  ${j.contractor}` : ""}
        </span>
        {!done && (
          <span className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: j.needsYou ? "var(--accent-dark)" : SAGE_INK }}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: j.needsYou ? "var(--accent-dark)" : SAGE_INK }} />
            {j.needsYou ? "Waiting on you" : j.now}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {j.cost && <span className="figures text-[15px]">{j.cost}</span>}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${j.needsYou ? "bg-accent-soft text-accent-dark" : ""}`}
          style={!j.needsYou ? { background: SAGE_WASH, color: SAGE_INK } : undefined}
        >
          {done ? j.when ?? "Done" : j.needsYou ? "Needs you" : j.when ?? "In hand"}
        </span>
      </span>
    </li>
  );
}

function VisitRow({ x }: { x: MaintVisit }) {
  const done = x.state === "done";
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: done ? SAGE_WASH : "#f8f8f6", color: done ? SAGE_INK : "var(--muted)" }}>
        <DoodleIcon name={done ? "checklist" : "calendar"} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">
          {x.label}
          <span className="font-normal text-muted">  •  {x.when}</span>
        </span>
        <span className="block text-[12px] text-muted">{x.note}</span>
      </span>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={done ? { background: SAGE_WASH, color: SAGE_INK } : { background: "#f3f3f1", color: "var(--muted)" }}
      >
        {done ? "Done" : x.state === "upcoming" ? "Booked" : "Arranging"}
      </span>
    </li>
  );
}

/**
 * BEFORE THE LET: a lock, and nothing else.
 *
 * James, 16 Sep 2026: "when it's locked, it should just have the title. It
 * should just have the lock symbol icon and then unlock when your tenant moves
 * in. That can be the whole box, and we can literally just show that as a lock
 * section for now."
 *
 * What went: four bullets promising what the page will hold, and a second card
 * repeating the journey. Both were answering a question nobody asked - a
 * landlord who taps Maintenance before there is a tenant wants to know why it
 * is empty, which is one sentence, not a page of prospectus for a page they
 * cannot use yet. The journey has its own tab, three rows above this one.
 *
 * The one line kept under the heading is where they are, because "unlocks when
 * your tenant moves in" raises "so when is that?" and nothing else on the
 * screen answers it.
 */
function Locked({ view: v }: { view: LandlordView }) {
  const current = v.journey.find((s) => s.state === "current");
  return (
    <div className="space-y-6">
      {/* The same head as every other page: the agent as a pill on a phone,
          the full card where there is a column for it. Stripping the locked
          state was about the four bullets and the repeated journey, not about
          taking the agent off a desktop that has room for them. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start justify-between gap-4 pt-2 lg:block">
          <h1 className="text-[30px] leading-[1.08] sm:text-[44px] sm:leading-[1.05]">Maintenance</h1>
          <div className="lg:hidden">
            <AgentSheet v={v} trigger="inline" />
          </div>
        </div>
        <div className="hidden lg:block">
          <AgentCard v={v} />
        </div>
      </div>

      <section
        className="relative overflow-hidden rounded-[22px] p-7 sm:p-9"
        style={{ background: SAGE_WASH }}
        data-search
      >
        <span aria-hidden className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full" style={{ background: `${SAGE}33` }} />
        <div className="relative max-w-[70%] sm:max-w-[62%]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
            <DoodleIcon name="lock" size={22} />
          </span>
          <h2 className="mt-5 text-[24px] leading-tight sm:text-[28px]">Unlocks when your tenant moves in</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            {current ? `You are at ${current.label.toLowerCase()} just now.` : "Your let is under way."}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/art/family-home.png" alt="" className="pointer-events-none absolute -bottom-2 -right-3 w-[30%] max-w-[260px] sm:w-[34%]" />
      </section>
    </div>
  );
}
