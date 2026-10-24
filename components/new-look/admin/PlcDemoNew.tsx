import { Badge } from "@/components/new-look/Parts";
import CopyLink from "@/app/(os)/admin/onboarding/CopyLink";

/**
 * Process > PLC handover in the new look (lib/new-look "admin", 24 Oct 2026):
 * the one link that can be sent, the rule worth saying out loud, then the
 * doors in the order you would open them, each with what is safe to press.
 * The doors are the page's own (app/(os)/admin/plc-demo).
 */

export type Door = {
  href: string;
  label: string;
  /** The new look's heading, in Title Case. */
  title: string;
  who: string;
  blurb: string;
  /** What to press, and what not to. */
  safe?: string;
  care?: string;
};

export default function PlcDemoNew({ doors, token }: { doors: Door[]; token: string }) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <p className="nl-adm-lead">The moment an accepted application becomes compliance&apos;s problem. Here are the doors, in the order you would open them.</p>

      <div className="nl-adm-pcards">
        <section className="nl-adm-card">
          <h2 className="nl-adm-card-title">The One You Can Send</h2>
          <p className="nl-meta">
            Both halves of the handover, running the real screens against an invented pack: a made-up address, two people called Sample, and a gas certificate that expires eleven days after they move in. No sign-in, nothing real, nothing written. Send this to Susan.
          </p>
          <CopyLink path={`/preview/${token}/plc`} />
        </section>
        <section className="nl-adm-card">
          <h2 className="nl-adm-card-title">The Rule Worth Saying Out Loud</h2>
          <p className="nl-adm-say nl-adm-p-after">The scan never decides. It reads the documents and produces findings; a person presses the button. A case cannot leave review without somebody putting their name to it.</p>
          <p className="nl-meta nl-adm-p-after">That is the whole design, and it is the thing to lead with. Everything else on this page is the machinery underneath it.</p>
        </section>
      </div>

      <section className="nl-adm-block">
        <h2 className="nl-section-title">The Doors</h2>
        <ol className="nl-adm-p-steps nl-adm-p-after">
          {doors.map((d, i) => (
            <li key={d.href}>
              <span className="nl-adm-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="nl-adm-step-head">
                  <span className="nl-strong">{d.title}</span>
                  <Badge tone="info" bare>
                    {d.who}
                  </Badge>
                  <a href={d.href} className="nl-btn nl-btn--secondary nl-btn--sm">
                    Open
                  </a>
                </div>
                <p className="nl-adm-step-body">{d.blurb}</p>
                {d.safe && <p className="nl-adm-note">{d.safe}</p>}
                {d.care && <p className="nl-adm-note is-care">{d.care}</p>}
                <p className="nl-adm-step-path">{d.href}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="nl-adm-block">
        <h2 className="nl-section-title">A Demo That Leaves Nothing Behind</h2>
        <ol className="nl-adm-bullets">
          <li>Open the both-sides screen and start a handover with an invented address.</li>
          <li>Walk the agent&apos;s four steps and send it.</li>
          <li>Flip the switch to Kirstie. Skip the scan rather than running it, unless you want to show the reading.</li>
          <li>Approve it with a note, then show the numbers page.</li>
        </ol>
        <p className="nl-adm-note">One thing to know: there is no delete for a PLC case. Anything you start stays in the store and in the queue, so use an address that obviously is not real.</p>
      </section>
    </div>
  );
}
