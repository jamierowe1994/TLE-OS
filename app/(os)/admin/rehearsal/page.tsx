import PageHeader from "@/components/PageHeader";
import CopyLink from "@/app/(os)/admin/onboarding/CopyLink";
import { rehearsalToken } from "@/lib/rehearsal";

/**
 * The door to the maintenance views.
 *
 * James, 7 Sep 2026: "I just need the views... so if I need to make any edits
 * to it visually." So this page is a link and the two facts that matter, and
 * the screens themselves are behind it.
 */

export const dynamic = "force-dynamic";

export default function ViewsDoor() {
  const token = rehearsalToken();
  return (
    <>
      <PageHeader
        title="Maintenance Views"
        blurb="One repair, and what it looks like to the agent, the landlord, the tenant and the contractor. Four tabs, the real screens and the real emails."
      />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">The link</h2>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
          No account needed. It reaches these views and nothing else, and stays the same string.
        </p>
        <CopyLink path={`/rehearsal/${token}`} />
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>The job is flagged as a walkthrough, so it is off every list and figure in Maintenance and out of every reminder.</li>
          <li>No email leaves. Each is written in full and kept, which is what the landlord, tenant and contractor tabs read. The people are invented, on example.com.</li>
          <li>One runs at a time. Start again clears the last, so two of you in it at once will tread on each other.</li>
        </ul>
      </section>
    </>
  );
}
