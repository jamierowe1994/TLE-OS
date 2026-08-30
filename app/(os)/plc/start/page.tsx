import { Suspense } from "react";
import PlcWizard from "@/components/PlcWizard";

/**
 * /plc/start?application=<id>  — from the application record
 * /plc/start?listing=<id>      — from the listing, which finds the application
 *
 * A page of its own rather than a drawer or a modal. The wizard takes the
 * whole screen and holds it for four steps; a panel over the top of the
 * record it came from would invite somebody to click away halfway through and
 * leave a pack half-assembled.
 */

export const dynamic = "force-dynamic";

export default async function StartPlc({
  searchParams,
}: {
  searchParams: Promise<{ application?: string; listing?: string }>;
}) {
  const { application, listing } = await searchParams;

  if (!application && !listing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl tracking-normal">Nothing to Hand Over</h1>
        <p className="mt-3 text-sm text-neutral-500">
          A PLC check starts from an accepted application. Open one and press Start the PLC check.
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <PlcWizard applicationId={application} listingId={listing} />
    </Suspense>
  );
}
