"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import Compliance from "../../../../(os)/compliance/page";

/**
 * Compliance for the Showroom's walkthroughs: the real screen
 * (app/(os)/compliance) on the sample book, with nothing saved or sent.
 * ?open=demo-home opens 8 Recreation Terrace's drawer, as the real ?open= does.
 */
export default function DemoCompliance() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/compliance">
        <Suspense fallback={null}>
          <Compliance />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
