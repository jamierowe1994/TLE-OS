"use client";

import { Suspense, use, useMemo } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import AppraisalFile from "../../../../../(os)/market-appraisals/[id]/page";

/**
 * One appraisal's file for the valuation walkthrough: the real page
 * (app/(os)/market-appraisals/[id]) on the invented book, nothing saved or sent.
 * The board's cards open it, as they open the real one (DemoNet maps the address).
 */
export default function DemoAppraisalFile({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { id } = use(params);
  /* One promise for the life of the page: a new one each render would suspend the file forever. */
  const inner = useMemo(() => Promise.resolve({ id }), [id]);
  return (
    <>
      <DemoNet label="Sample office" />
      <OfficeFrame on="/market-appraisals">
        <Suspense fallback={null}>
          <AppraisalFile params={inner} />
        </Suspense>
      </OfficeFrame>
    </>
  );
}
