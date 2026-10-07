"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import Inspections from "../../../../(os)/inspections/page";

/**
 * Inspections for the Showroom's walkthroughs: the real screen
 * (app/(os)/inspections) on the sample book, with nothing booked, written or
 * sent. ?open=demo-visit opens 8 Recreation Terrace's visit.
 */
export default function DemoInspections() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/inspections">
        <Suspense fallback={null}>
          <Inspections />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
