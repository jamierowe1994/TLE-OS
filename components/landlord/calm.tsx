import AgentSheet from "@/components/landlord/AgentSheet";
import MessageTile from "@/components/landlord/MessageTile";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * The pieces every calm page of the landlord's portal is made from (26 Nov
 * 2026; see DashboardCalm and app/landlord-calm.css): the page's head, the
 * agent as one line, and the ledger row - the section's name on the left,
 * what it holds on the right, a hairline between.
 */

export const Tick = () => (
  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const Arrow = () => (
  <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

/** The agent as one line: who they are, how to reach them, and Message. From a tablet up. */
export function AgentLine({ v }: { v: LandlordView }) {
  if (!v.agent) return null;
  const first = v.agent.name.split(/\s+/)[0] ?? "your agent";
  return (
    <div id="messages" className="llh-agent" data-search>
      {v.agent.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.agent.photo} alt="" className="llh-agent-pic" />
      ) : (
        <span className="llh-agent-pic" aria-hidden>{v.agent.name[0]}</span>
      )}
      <div className="llh-agent-tx">
        <p className="llh-label">Your letting agent</p>
        <p className="llh-agent-n">{v.agent.name}</p>
        <p className="llh-agent-c">
          {v.agent.phone && <a href={`tel:${v.agent.phone.replace(/\s+/g, "")}`}>{v.agent.phone}</a>}
          {v.agent.email && <a href={`mailto:${v.agent.email}`}>{v.agent.email}</a>}
        </p>
      </div>
      <MessageTile variant="button" appraisalId={v.appraisalId ?? null} agentName={v.agent.name} messages={v.messages ?? []} label={`Message ${first}`} sub="" icon="message" />
    </div>
  );
}

/** The page's head: its title, one line under it, and the agent (a line from a tablet up, one button on a phone). */
export function CalmHead({ v, title, intro, agent = true }: { v: LandlordView; title: string; intro?: React.ReactNode; agent?: boolean }) {
  return (
    <div className="llh-top">
      <div className="llh-hello">
        <h1>{title}</h1>
        {intro && <p className="llh-intro">{intro}</p>}
      </div>
      {agent && <AgentLine v={v} />}
      {agent && <AgentSheet v={v} trigger="inline" />}
    </div>
  );
}

/** One row of the ledger. */
export function Row({ id, title, meta, children, className = "" }: { id?: string; title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`llh-row ${className}`} data-search>
      <div className="llh-row-h">
        <h2>{title}</h2>
        {meta && <p className="llh-meta">{meta}</p>}
      </div>
      <div className="llh-row-b">{children}</div>
    </section>
  );
}
