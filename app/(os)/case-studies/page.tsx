"use client";

import { Mast } from "@/components/new-look/Parts";
import CaseStudyList from "@/components/case-studies/CaseStudyList";

/* Case studies (James, 11 Nov 2026). Reached from Settings > Your page,
   where the same list sits; this address stays for links and Steve. */
export default function CaseStudies() {
  return (
    <div data-look="new" className="nl-page cs-list">
      <Mast
        eyebrow="Your page"
        title="Case Studies"
        blurb="Homes you have let, written up for the website. They show on the case studies page and on your own page. To start one, open a let home and choose Use as a case study from its three-dot menu."
      />
      <CaseStudyList />
    </div>
  );
}
