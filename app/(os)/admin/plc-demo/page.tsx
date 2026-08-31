import PageHeader from "@/components/PageHeader";
import { previewToken } from "@/lib/preview-token";
import CopyLink from "@/app/(os)/admin/onboarding/CopyLink";

/**
 * The PLC handover, for demonstrating.
 *
 * James: "show them how the PLC works... what the agent will say and then
 * what Kirstie will see."
 *
 * The PLC screens already exist and are already good. What did not exist was
 * a way to reach them on purpose: the agent wizard needs a REX application id
 * in the query string, Kirstie's queue is only reachable through her board,
 * and the one screen that shows both sides at once is in no navigation at
 * all. That is what this page is - a set of doors, in the order you would
 * open them in front of somebody, with a note on each about what is safe to
 * press.
 *
 * ── One sendable link, and the rest behind sign-in ────────────────────────
 *
 * The preview at the top runs the real wizard and the real review panel
 * against an invented pack, so it can be sent to anybody. Everything below it
 * reads live REX and can be clicked in front of people but never forwarded.
 */

export const dynamic = "force-dynamic";

type Door = {
  href: string;
  label: string;
  who: string;
  blurb: string;
  /** What to press, and what not to. */
  safe?: string;
  care?: string;
};

const DOORS: Door[] = [
  {
    href: "/plc",
    label: "Both sides, on one screen",
    who: "The one to demo with",
    blurb:
      "A switch at the top says whether you are the agent or Kirstie, so you can walk a case the whole way through without signing out and back in. Start a handover with a made-up reference and address, submit it, flip the switch, and decide it.",
    safe:
      "Nothing here touches REX and no email is sent. Anything you start is invented by you, so every button is safe to press.",
  },
  {
    href: "/plc/start",
    label: "What the agent does",
    who: "Agent",
    blurb:
      "The real handover wizard, as a partner agent meets it. It reads the application out of REX so they type almost nothing, then walks the documents and ends on a tick. Needs a real application on the end of the link.",
    care:
      "Add ?application=<id> or it will say there is nothing to hand over. It shows the real address and the real tenant names, so pick one you are happy for the room to see, and stop before Send.",
  },
  {
    href: "/pre-tenancy/plc",
    label: "What Kirstie sees",
    who: "Compliance",
    blurb:
      "The queue, oldest wait first, with the age going red past 48 hours. Opening one shows the pack, the findings, and the three decisions.",
    care:
      "Only ever decide on a case you started yourself. Approve and Decline are final - there is no way back from either - and the decision is recorded against your name. Run AI scan is real: it reads every document with the model, so it costs money and takes a while on a full pack.",
  },
  {
    href: "/admin/plc-checks",
    label: "Whether the scan can be trusted",
    who: "You",
    blurb:
      "How often the model agreed with the human, how long decisions take, and a list of the cases it got wrong with the reason each time. The argument for letting it run itself one day, or the argument against.",
    care:
      "The 'where it was wrong' list prints real addresses and the deciding person's own words. Good honesty in front of Susan, awkward in front of a landlord.",
  },
];

export default function PlcDemoPage() {
  const token = previewToken();

  return (
    <>
      <PageHeader
        title="PLC Handover"
        blurb="The moment an accepted application becomes compliance's problem. Here are the doors, in the order you would open them."
      />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">The one you can send</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Both halves of the handover, running the real screens against an
          invented pack: a made-up address, two people called Sample, and a gas
          certificate that expires eleven days after they move in. No sign-in,
          nothing real, nothing written. Send this to Susan.
        </p>
        <CopyLink path={`/preview/${token}/plc`} />
      </section>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">The rule worth saying out loud</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed">
          The scan never decides. It reads the documents and produces findings;
          a person presses the button. A case cannot leave review without
          somebody putting their name to it.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          That is the whole design, and it is the thing to lead with. Everything
          else on this page is the machinery underneath it.
        </p>
      </section>

      <div className="fade-up mt-3 flex flex-col gap-3">
        {DOORS.map((d) => (
          <section key={d.href} className="rounded-2xl border border-line/80 bg-panel p-5">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-[15px]">{d.label}</h2>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
                {d.who}
              </span>
              <a
                href={d.href}
                className="ml-auto shrink-0 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
              >
                Open
              </a>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{d.blurb}</p>
            {d.safe && (
              <p className="mt-2.5 rounded-xl border border-line/80 bg-box p-3 text-[11.5px] leading-relaxed text-muted">
                {d.safe}
              </p>
            )}
            {d.care && (
              <p className="mt-2.5 rounded-xl border border-accent-dark/30 bg-accent-soft/30 p-3 text-[11.5px] leading-relaxed">
                {d.care}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              <code className="rounded bg-box px-1 py-0.5">{d.href}</code>
            </p>
          </section>
        ))}
      </div>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">A demo that leaves nothing behind</h2>
        <ol className="mt-2.5 flex list-decimal flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>Open the both-sides screen and start a handover with an invented address.</li>
          <li>Walk the agent&apos;s four steps and send it.</li>
          <li>Flip the switch to Kirstie. Skip the scan rather than running it, unless you want to show the reading.</li>
          <li>Approve it with a note, then show the numbers page.</li>
        </ol>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          One thing to know: there is no delete for a PLC case. Anything you
          start stays in the store and in the queue, so use an address that
          obviously is not real.
        </p>
      </section>
    </>
  );
}
