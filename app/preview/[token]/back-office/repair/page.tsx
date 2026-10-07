"use client";

import { Suspense } from "react";
import DemoNet from "@/components/showroom/demo/DemoNet";
import RepairPage from "../../../../repair/[token]/page";

/**
 * "Was it sorted?" for the Showroom's walkthroughs: the tenant's real page
 * (app/repair/[token]) from the are-you-happy email, on the walkthrough's job,
 * with nothing saved or sent.
 */
export default function DemoRepair() {
  return (
    <>
      <DemoNet label="Sample tenant" />
      <Suspense fallback={null}>
        <RepairPage />
      </Suspense>
    </>
  );
}
