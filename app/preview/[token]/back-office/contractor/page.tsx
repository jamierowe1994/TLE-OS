"use client";

import DemoNet from "@/components/showroom/demo/DemoNet";
import ContractorPage from "../../../../contractor/[token]/page";

/**
 * The contractor's page for the Showroom's walkthroughs: the real one
 * (app/contractor/[token]), opened on the walkthrough's job, with nothing
 * saved or sent. No sign-in, as for a real contractor: their link is the key.
 */
export default function DemoContractor() {
  return (
    <>
      <DemoNet label="Sample contractor" />
      <ContractorPage />
    </>
  );
}
