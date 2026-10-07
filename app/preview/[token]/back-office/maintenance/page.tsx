"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import Maintenance from "../../../../(os)/maintenance/page";

/**
 * The Maintenance board for the Showroom's back office walkthroughs: the real
 * screen (app/(os)/maintenance), on the invented world, with nothing saved or
 * sent (components/showroom/demo/DemoNet). ?story=&at=&way= say which moment
 * of which walkthrough; ?open=<job> opens the job sheet, as on the real board.
 */
export default function DemoMaintenance() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/maintenance">
        <Suspense fallback={null}>
          <Maintenance />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
