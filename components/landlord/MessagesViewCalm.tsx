import { CalmHead, Row } from "@/components/landlord/calm";
import Thread from "@/components/landlord/Thread";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE MESSAGES PAGE, CALM (26 Nov 2026; the home is DashboardCalm). The same
 * view, words and working parts as the classic page (MessagesView); drawn
 * when the "portals" switch is on.
 *
 * The conversation with their agent is the page: the thread and its composer
 * on a white sheet. Beside it, on Dark Olive, who they are talking to and
 * how to reach them, and under that what we have sent them. Then how
 * messages work, as the last row.
 */
export default function MessagesViewCalm({ view: v, sample = false }: { view: LandlordView; sample?: boolean }) {
  const agent = v.agent;
  const first = agent?.name.split(/\s+/)[0] ?? "your agent";
  const messages = v.messages ?? [];
  const sent = v.activity.filter((a) => /shared|signed|received|sent/i.test(a.title));
  return (
    <div className="llh">
      <CalmHead v={v} title="Messages" intro={`Everything between you and ${first}, kept in one place.`} agent={false} />

      <div className="llp-split llp-wide">
        {/* ── the conversation ── */}
        <section className="llp-sheet" data-search>
          <div className="llp-sheet-h">
            <h2>Your conversation with {first}</h2>
            <span>{messages.length === 0 ? "Nothing yet" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}</span>
          </div>
          <Thread appraisalId={v.appraisalId ?? null} agentFirst={first} messages={messages} sample={sample} />
        </section>

        <div className="llp-stack">
          {/* ── who they are talking to ── */}
          <section className="llh-next llp-who" data-search>
            <p className="llh-label">Your letting agent</p>
            {agent ? (
              <>
                <div className="llp-who-top">
                  {agent.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agent.photo} alt="" />
                  ) : (
                    <span aria-hidden>{agent.name[0]}</span>
                  )}
                  <div>
                    <h2>{agent.name}</h2>
                    {agent.title && <p>{agent.title}</p>}
                  </div>
                </div>
                <ul className="llp-contact">
                  {agent.phone && (
                    <li>
                      <span className="llh-label">Call</span>
                      <a href={`tel:${agent.phone.replace(/\s+/g, "")}`}>{agent.phone}</a>
                    </li>
                  )}
                  {agent.email && (
                    <li>
                      <span className="llh-label">Email</span>
                      <a href={`mailto:${agent.email}`}>{agent.email}</a>
                    </li>
                  )}
                  <li>
                    <span className="llh-label">Replies</span>
                    <span>The same working day, Monday to Friday</span>
                  </li>
                </ul>
              </>
            ) : (
              <p className="llh-next-sub">Your agent appears here once your property is with us.</p>
            )}
          </section>

          {/* ── what has come from us ── */}
          <section className="llp-side" data-search>
            <h2>What we&rsquo;ve sent you</h2>
            {sent.length === 0 ? (
              <p className="llh-note">Presentations, terms and anything else from us show here as they are sent.</p>
            ) : (
              <ul className="llh-list">
                {sent.map((a, k) => (
                  <li key={k}>
                    <span className="llh-grow">
                      <b>{a.title}</b>
                      <small>
                        {a.sub}
                        {a.date ? `  ·  ${a.date}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ── the rules of the road ── */}
      <Row title="How messages work">
        <p className="llh-note">
          What you write here is kept on your file and lands in {first}&rsquo;s inbox straight away. For anything urgent - a leak, no heating, a lock - ring the office rather than write.
        </p>
      </Row>
    </div>
  );
}
