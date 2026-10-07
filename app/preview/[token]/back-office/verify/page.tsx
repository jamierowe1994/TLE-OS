"use client";

import DemoNet from "@/components/showroom/demo/DemoNet";
import OfficeFrame from "@/components/showroom/demo/OfficeFrame";
import ToVerify from "../../../../(os)/compliance-desk/verify/page";

/**
 * To verify, the compliance desk's queue, for the Showroom's walkthroughs: the
 * real screen (app/(os)/compliance-desk/verify) on the sample certificates,
 * with nothing filed, verified or sent.
 */
export default function DemoVerify() {
  return (
    <>
      <DemoNet label="Sample compliance desk" />
      <OfficeFrame on="/compliance-desk/verify" desk>
        <ToVerify />
      </OfficeFrame>
    </>
  );
}
