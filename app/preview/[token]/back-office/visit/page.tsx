"use client";

import DemoNet from "@/components/showroom/demo/DemoNet";
import VisitPage from "../../../../visit/[token]/page";

/**
 * "May we come round?" for the Showroom's walkthroughs: the tenant's real
 * page (app/visit/[token]) from the visit email, on the sample visit, with
 * nothing booked or sent.
 */
export default function DemoVisit() {
  return (
    <>
      <DemoNet label="Sample tenant" />
      <VisitPage />
    </>
  );
}
