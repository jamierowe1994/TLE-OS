import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DealFeed from "@/components/DealFeed";

/**
 * /pre-tenancy/feed - what moved, for Kirstie.
 *
 * One list, newest first, refreshing on its own. The board is where she works
 * a deal; this is where she sees that she needs to. It replaces checking each
 * file in Propoly to find out whether references came back overnight.
 */

export const dynamic = "force-dynamic";

export default function PreTenancyFeedPage() {
  return (
    <div className="pb-8">
      <PageHeader
        illustration="/illustrations/people/happy-call.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="What moved"
        blurb="Every deal Propoly moved, as it happens. Leave it open."
        actions={
          <Link
            href="/pre-tenancy/dashboard"
            className="flex items-center rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
          >
            Back to the dashboard
          </Link>
        }
      />
      <div className="max-w-2xl rounded-2xl border border-line bg-card p-5">
        <DealFeed desktop />
      </div>
    </div>
  );
}
