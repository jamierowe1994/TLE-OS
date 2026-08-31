import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import RexDino from "@/components/RexDino";

/**
 * The landing for the shareable preview: the two halves of joining, and what
 * each one is.
 *
 * Written for somebody who does not work here yet - Susan seeing it before a
 * presentation, a partner agent deciding whether to join the pilot. So it
 * says what it is showing and, plainly, that none of it is real. A demo that
 * does not say it is a demo is how a sample figure ends up quoted back at us.
 */

const CARDS = [
  {
    href: "setup",
    icon: "key",
    label: "Signing up",
    time: "five screens",
    blurb:
      "What happens the moment somebody follows the link in their invite. Choosing a password, connecting REX and their email, and picking how the OS should look.",
  },
  {
    href: "tour",
    icon: "magic-wand",
    label: "The walkthrough",
    time: "two minutes, or thirty seconds",
    blurb:
      "The tour that runs the first time an agent reaches the OS. Two lengths: the whole system top to bottom, or just the assistant and how to report a problem.",
  },
  {
    href: "passport",
    icon: "user",
    label: "The tenant passport",
    time: "six sections",
    blurb:
      "What a tenant fills in once and reuses for every application, instead of answering the same questions per property. The last few show what it looks like when an agent adds questions of their own.",
  },
  {
    href: "plc",
    icon: "shield",
    label: "The compliance handover",
    time: "both halves",
    blurb:
      "What happens when an application is accepted: the agent hands the pack over, and compliance reads it. Includes the part where the reader catches a certificate that runs out mid-tenancy, and then does not get to decide about it.",
  },
];

export default async function PreviewHome({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/brand/house.png" alt="" aria-hidden className="art h-8 w-8 object-contain" />
          <span className="hand text-[16px]">TLE OS</span>
        </div>

        <p className="hand text-center text-[11px] uppercase tracking-[0.2em] text-muted">
          A look at joining
        </p>
        <h1 className="hand mt-2 text-center text-[27px] leading-tight">
          What a new agent sees
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-[12.5px] leading-relaxed text-muted">
          Two parts, and you can walk through either as many times as you like.
          Nothing here is connected to anything: the figures are invented and
          none of the buttons reach the real system.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={`/preview/${token}/${c.href}`}
              className="block-pop rounded-2xl border border-line/80 bg-panel p-5"
            >
              <div className="flex items-baseline gap-2.5">
                <DoodleIcon name={c.icon} size={17} className="self-center text-accent-dark" />
                <span className="hand text-[16px]">{c.label}</span>
                <span className="text-[10.5px] text-muted">{c.time}</span>
                <span className="ml-auto text-muted">→</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{c.blurb}</p>
            </Link>
          ))}
        </div>

        <div className="mt-9 flex justify-center text-muted/50">
          <RexDino size={150} />
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">The Lettings Experts</p>
      </div>
    </main>
  );
}
