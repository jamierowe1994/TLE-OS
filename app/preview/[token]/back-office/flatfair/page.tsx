"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import FlatfairHandoff from "@/components/FlatfairHandoff";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";

/**
 * Set up in Flatfair for the Flatfair walkthrough: the real hand-off
 * (components/FlatfairHandoff) on Sophie's invented let, with nothing sent to
 * Flatfair (components/showroom/demo/DemoNet, lib/showroom/demo-flatfair).
 * The page around it is app/(os)/applications/flatfair's, a server page that
 * cannot be mounted here; keep the two in step.
 * ?story=flatfair&at=<moment>&deal=<id>; ?fresh=1 starts again.
 */
function Handoff() {
  const deal = useSearchParams().get("deal");
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

export default function DemoFlatfair() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/applications">
        <Suspense fallback={null}>
          <Handoff />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
