"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import PlcQueue from "../../../../../(os)/pre-tenancy/plc/page";

/**
 * The PLC queue for the office walkthrough: the real queue and check panel
 * (app/(os)/pre-tenancy/plc, components/PlcReview) on the invented packs, with
 * nothing saved, sent or pushed to another system (lib/showroom/demo-pretenancy).
 * ?story=pretenancy&at=<moment>; ?case= opens a pack; ?fresh=1 starts again.
 */
export default function DemoPlcQueue() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/pre-tenancy/plc" rail="pretenancy">
        <Suspense fallback={null}>
          <PlcQueue />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
