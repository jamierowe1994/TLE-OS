import PageHeader from "@/components/PageHeader";
import CopyLink from "@/app/(os)/admin/onboarding/CopyLink";
import { rehearsalToken, REHEARSAL_HOUSE } from "@/lib/rehearsal";

/**
 * The door to the maintenance walkthrough.
 *
 * James, 7 Sep 2026: a process he can go through himself, and a URL he can
 * send to somebody so they can go through it too. The walkthrough itself
 * lives on the public route so that both of those are the SAME screen — a
 * demo that differs from what the recipient opens is a demo that will
 * eventually embarrass somebody.
 */

export const dynamic = "force-dynamic";

const SIDES = [
  { who: "The agent", what: "The real job sheet. One step at a time, and every button does what it does in Maintenance." },
  { who: "The contractor", what: "Their page in a phone, live. Set the date, mark it done, add photos and the invoice." },
  { who: "The landlord", what: "Every email she has been sent, rendered from the catalogue as it would arrive." },
  { who: "The tenant", what: "The same, plus the yes-or-no page he gets once the work is finished." },
];

export default function RehearsalDoor() {
  const token = rehearsalToken();
  return (
    <>
      <PageHeader
        title="Maintenance Walkthrough"
        blurb="A repair from the phone call to the invoice, on invented people, with every side of it on a tab. Yours to click through, and a link you can send to anybody."
      />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">The link</h2>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
          Holding this link is the permission — no account, no sign-in. It reaches the walkthrough and nothing else, and it
          stays the same string, so one you sent last week still opens today.
        </p>
        <CopyLink path={`/rehearsal/${token}`} />
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">The four tabs</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {SIDES.map((s) => (
            <li key={s.who} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line/40 pb-2.5 text-[12.5px] last:border-0 last:pb-0">
              <span className="w-32 shrink-0 font-semibold">{s.who}</span>
              <span className="min-w-0 flex-1 text-muted">{s.what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Before you show somebody</h2>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>
            It is the real workflow, not a drawing of one. The same steps, the same contractor page, the same emails — so it
            cannot drift out of date behind the product.
          </li>
          <li>
            The job is flagged as a walkthrough, which keeps it off every list and figure in Maintenance and away from every
            reminder. Nothing you press appears on anybody&apos;s screen.
          </li>
          <li>
            No email leaves the building. Each one is written in full and kept on the walkthrough, which is what the landlord
            and tenant tabs are reading. The people are invented and their addresses are on example.com, which cannot belong
            to anybody.
          </li>
          <li>
            One walkthrough runs at a time. Starting again clears the last one, so the link never opens onto somebody
            else&apos;s half-finished demonstration — worth knowing if two of you are in it at once.
          </li>
          <li>
            The house is {REHEARSAL_HOUSE.propertyName}, {REHEARSAL_HOUSE.locality}, with {REHEARSAL_HOUSE.landlord} as the
            landlord. The trades are four invented firms placed around Bristol, so the distance sorting has something to sort.
          </li>
        </ul>
      </section>
    </>
  );
}
