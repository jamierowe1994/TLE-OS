import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import FlatfairHandoff from "@/components/FlatfairHandoff";

/**
 * /applications/flatfair?deal=<propoly uuid>
 *
 * The step between the PLC check passing and Kirstie generating the
 * agreement, for a deal on Flatfair rather than a cash deposit. Reached from
 * the application's "Needs you" list once the pack is approved.
 */

export const dynamic = "force-dynamic";

export default async function FlatfairPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const { deal } = await searchParams;
  return (
    <>
      <PageHeader
        title="Set up in Flatfair"
        blurb="Every detail the Flatfair form asks for, ready to copy across. Tick it when it is submitted."
        actions={
          <Link
            href="/applications"
            className="flex items-center rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
          >
            Back to applications
          </Link>
        }
      />
      {deal ? (
        <FlatfairHandoff dealId={deal} />
      ) : (
        <p className="text-[13px] text-muted">Open this from an application once its PLC check has passed.</p>
      )}
    </>
  );
}
