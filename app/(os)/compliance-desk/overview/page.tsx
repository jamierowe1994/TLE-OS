"use client";

import FiguresPage from "@/components/business/FiguresPage";
import ComplianceTab from "@/app/(os)/company-figures/tabs/compliance";

/** Susan's Compliance overview, on Michael's desk beside his task lists (Susan, 2 Nov 2026). */
export default function ComplianceDeskOverview() {
  return (
    <FiguresPage
      eyebrow="Compliance"
      title="Compliance Overview"
      blurb="Certificates on the homes we manage, by type: how much of the book is in date, and what needs attention."
    >
      {(month) => <ComplianceTab month={month} openHref="/compliance-desk/properties" />}
    </FiguresPage>
  );
}
