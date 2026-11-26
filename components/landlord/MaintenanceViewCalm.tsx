import PropertyPhoto from "@/components/PropertyPhoto";
import { CalmHead, Row, Tick } from "@/components/landlord/calm";
import ReportIssue from "@/components/landlord/ReportIssue";
import type { MaintJob, MaintView, MaintVisit } from "@/lib/landlord-maintenance-view";
import { isLet, type LandlordView } from "@/lib/landlord-view";

/**
 * THE MAINTENANCE PAGE, CALM (26 Nov 2026; the home is DashboardCalm). The
 * same view, words and working parts as the classic page (MaintenanceView);
 * drawn when the "portals" switch is on.
 *
 * The figures at a glance, on Dark Olive; beside them, reporting a problem.
 * Then the ledger: what is waiting on them (Terracotta, the only place it is
 * used), the open jobs with what is happening on each, the visits, what has
 * been done with what it cost, the homes this covers, and how it works. Every
 * job and visit is the real record, as before.
 *
 * Before there is a tenant: a lock and one sentence (James, 16 Sep 2026, kept).
 */
export default function MaintenanceViewCalm({ view: v, m, sample = false }: { view: LandlordView; m: MaintView; sample?: boolean }) {
  const first = v.agent?.name.split(/\s+/)[0] ?? "your agent";
  const upcoming = m.visits.filter((x) => x.state !== "done");
  if (!isLet(v) && m.properties.length === 0) return <Locked view={v} />;
  return (
    <div className="llh">
      <CalmHead v={v} title="Maintenance" intro="What is being fixed, what is booked, and what we have done on your property." />

      {m.unread && <p className="llp-notice">{m.unread}</p>}

      {/* ── the figures, and reporting a problem ── */}
      <div className="llp-split">
        <section className="llh-next" data-search>
          <p className="llh-label">At a glance</p>
          <dl className="llp-figs">
            <Figure label="Open jobs" value={String(m.open.length)} sub={m.needsYou.length ? `${m.needsYou.length} waiting on you` : m.open.length ? "All in hand" : "Nothing open"} flag={m.needsYou.length > 0} />
            <Figure label="Visits booked" value={String(upcoming.length)} sub={upcoming[0] ? upcoming[0].when : "None arranged"} />
            <Figure label={`Spent in ${m.spent.year}`} value={m.spent.figure} sub={`${m.spent.jobs} job${m.spent.jobs === 1 ? "" : "s"} done`} />
            <Figure label="Your authority" value={m.authority} sub="We go ahead up to this" />
          </dl>
        </section>

        <section className="llp-side" data-search>
          <p className="llh-label">Need something doing?</p>
          <h2 className="llp-big">Tell us, and we take it from there</h2>
          <p className="llh-note">
            Something you have noticed, or something your tenant has told you. Up to {m.authority} we get on with it; above that we ask you first.
          </p>
          <div className="llp-report">
            <ReportIssue properties={m.properties.map((p) => p.name)} sample={sample} agentFirst={first} />
          </div>
        </section>
      </div>

      {/* ── what needs them ── */}
      {m.needsYou.length > 0 && (
        <Row title="Waiting on you" meta={`${m.needsYou.length} to decide`} className="llp-needs">
          <ul className="llh-list">
            {m.needsYou.map((j) => (
              <li key={j.id}>
                <span className="llh-mark" data-state="missing" aria-hidden />
                <span className="llh-grow">
                  <b>{j.title}</b>
                  <small>{j.needsYou}</small>
                </span>
                <span className="llh-doc-sub">{first} will call, or message them</span>
              </li>
            ))}
          </ul>
        </Row>
      )}

      {/* ── open jobs ── */}
      <Row title="Open jobs" meta={m.open.length === 0 ? "Nothing open" : `${m.open.length} on the go`}>
        {m.open.length === 0 ? (
          <p className="llh-note">Nothing being worked on right now. Anything reported shows here the same day, with what is happening on it.</p>
        ) : (
          <ul className="llh-list llp-jobs">
            {m.open.map((j) => (
              <JobLine key={j.id} j={j} />
            ))}
          </ul>
        )}
      </Row>

      {/* ── visits ── */}
      <Row title="Property visits" meta={upcoming.length ? `${upcoming.length} to come` : undefined}>
        <p className="llh-note llp-before">We call round through the tenancy to see how the home is being kept. Your tenant agrees each date.</p>
        {m.visits.length === 0 ? (
          <p className="llh-note">None arranged yet.</p>
        ) : (
          <ul className="llh-list llp-jobs">
            {m.visits.map((x) => (
              <VisitLine key={x.id} x={x} />
            ))}
          </ul>
        )}
      </Row>

      {/* ── what has been done ── */}
      <Row title="Done" meta="Finished jobs, with what each one cost.">
        {m.done.length === 0 ? (
          <p className="llh-note">Nothing finished yet.</p>
        ) : (
          <ul className="llh-list llp-jobs">
            {m.done.map((j) => (
              <JobLine key={j.id} j={j} />
            ))}
          </ul>
        )}
      </Row>

      {/* ── the properties this covers ── */}
      {m.properties.length > 0 && (
        <Row title={m.properties.length === 1 ? "The property we look after" : "The properties we look after"}>
          <ul className="llh-list">
            {m.properties.map((p) => (
              <li key={p.name}>
                <span className="llp-thumb">
                  <PropertyPhoto src={p.image} className="llp-thumb-ph" />
                </span>
                <span className="llh-grow">
                  <b>{p.name}</b>
                  <small>{p.locality}</small>
                </span>
              </li>
            ))}
          </ul>
        </Row>
      )}

      {/* ── how it works ── */}
      <Row title="How maintenance works with us">
        <ul className="llh-ticks llp-first">
          {[
            "Your tenant reports to us, and we tell you the same day.",
            `Up to ${m.authority} we get on with it. Above that, we ask you first.`,
            "Every job, quote and invoice is on this page, and on your statement.",
          ].map((t) => (
            <li key={t}>
              <Tick />
              {t}
            </li>
          ))}
        </ul>
      </Row>
    </div>
  );
}

function Figure({ label, value, sub, flag = false }: { label: string; value: string; sub: string; flag?: boolean }) {
  return (
    <div>
      <dt className="llh-label">{label}</dt>
      <dd className="figures">{value}</dd>
      <dd className="llp-fig-sub" data-flag={flag ? "yes" : undefined}>{sub}</dd>
    </div>
  );
}

/** One job: what it is, where it is up to, who is doing it, what it costs. */
function JobLine({ j }: { j: MaintJob }) {
  const done = j.state === "done";
  return (
    <li>
      <span className="llh-mark" data-state={done ? "uploaded" : j.needsYou ? "missing" : "waiting"} aria-hidden>{done ? <Tick /> : null}</span>
      <span className="llh-grow">
        <b>{j.title}</b>
        {j.urgency && !done && j.urgency !== "Routine" && <em className="llp-urgent">{j.urgency}</em>}
        <small>
          {j.property}  ·  {j.reported}
          {j.contractor ? `  ·  ${j.contractor}` : ""}
        </small>
        {!done && <small className="llp-now" data-needs={j.needsYou ? "you" : undefined}>{j.needsYou ? "Waiting on you" : j.now}</small>}
      </span>
      {j.cost && <span className="llp-cost figures">{j.cost}</span>}
      <span className="llh-state" data-state={done ? "done" : j.needsYou ? "due" : "done"}>{done ? j.when ?? "Done" : j.needsYou ? "Needs you" : j.when ?? "In hand"}</span>
    </li>
  );
}

function VisitLine({ x }: { x: MaintVisit }) {
  const done = x.state === "done";
  return (
    <li>
      <span className="llh-mark" data-state={done ? "uploaded" : "waiting"} aria-hidden>{done ? <Tick /> : null}</span>
      <span className="llh-grow">
        <b>{x.label}</b>
        <span className="llp-when">  ·  {x.when}</span>
        <small>{x.note}</small>
      </span>
      <span className="llh-state" data-state={done ? "done" : undefined}>{done ? "Done" : x.state === "upcoming" ? "Booked" : "Arranging"}</span>
    </li>
  );
}

/** Before the let: a lock, and one sentence saying where they are. */
function Locked({ view: v }: { view: LandlordView }) {
  const current = v.journey.find((s) => s.state === "current");
  return (
    <div className="llh">
      <CalmHead v={v} title="Maintenance" />
      <section className="llp-lock" data-search>
        <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <h2>Unlocks when your tenant moves in</h2>
        <p>{current ? `You are at ${current.label.toLowerCase()} just now.` : "Your let is under way."}</p>
      </section>
    </div>
  );
}
