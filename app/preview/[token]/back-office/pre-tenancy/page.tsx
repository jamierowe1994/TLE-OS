"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import PreTenancy from "../../../../(os)/pre-tenancy/page";

/**
 * The Pre-tenancy board for the office walkthrough: the real board
 * (app/(os)/pre-tenancy) on the invented book, with nothing saved or sent
 * (components/showroom/demo/DemoNet, lib/showroom/demo-pretenancy).
 * ?story=pretenancy&at=<moment> says where Sophie's let is; ?deal= opens a file;
 * ?fresh=1 starts it again.
 */
export default function DemoPreTenancy() {
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/pre-tenancy" rail="pretenancy">
        <Suspense fallback={null}>
          <PreTenancy />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
