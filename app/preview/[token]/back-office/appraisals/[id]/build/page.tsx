"use client";

import { Suspense, use, useMemo } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import BuildPage from "../../../../../../(os)/market-appraisals/[id]/build/page";

/**
 * The presentation builder for the valuation walkthrough: the real page
 * (app/(os)/market-appraisals/[id]/build, ?kind=post-appraisal for the deck with
 * the terms) on the invented book and its invented market, nothing saved or sent.
 */
export default function DemoBuild({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { id } = use(params);
  const inner = useMemo(() => Promise.resolve({ id }), [id]);
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/market-appraisals">
        <Suspense fallback={null}>
          <BuildPage params={inner} />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
