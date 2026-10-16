import { Suspense } from "react";
import PlcWizard from "@/components/PlcWizard";
import { applicationIsIntroOnly, isIntroOnly } from "@/lib/intro-only";

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

  /* Intro only ends at the landlord's yes (lib/intro-only): there is no PLC. */
  if (listing ? await isIntroOnly(listing).catch(() => false) : await applicationIsIntroOnly(application)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl tracking-normal">Intro Only - Nothing More to Do</h1>
        <p className="mt-3 text-sm text-neutral-500">
          This let is intro only, so there is no PLC check. The landlord takes it from here - referencing, the agreement, the deposit and the move-in are theirs.
        </p>
        {application && (
          <a href={`/applications/${encodeURIComponent(application)}`} className="mt-6 inline-block rounded-full bg-[var(--brown)] px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90">
            Back to the application
          </a>
        )}
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <PlcWizard applicationId={application} listingId={listing} />
    </Suspense>
  );
}
