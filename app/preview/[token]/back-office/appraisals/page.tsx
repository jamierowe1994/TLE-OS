"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import MarketAppraisals from "../../../../(os)/market-appraisals/page";

/**
 * Market Appraisals for the valuation walkthrough: the real board
 * (app/(os)/market-appraisals) on the invented book, with nothing saved or sent
 * (components/showroom/demo/DemoNet, lib/showroom/demo-appraisals).
 * ?story=appraisal&at=<moment> says where the story is; ?fresh=1 starts it again.
 */
export default function DemoAppraisals() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/market-appraisals">
        <Suspense fallback={null}>
          <MarketAppraisals />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
