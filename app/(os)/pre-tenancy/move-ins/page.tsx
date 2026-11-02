"use client";

import FiguresPage from "@/components/business/FiguresPage";
import MoveInsTab from "@/app/(os)/company-figures/tabs/move-ins";

/** Susan's Move-ins & Pipeline, in Kirstie's workspace, read-only (Susan, 2 Nov 2026). */
export default function PreTenancyMoveIns() {
  return (
    <FiguresPage
      eyebrow="Pre-tenancy"
      title="Move-ins & Pipeline"
      blurb="Who has moved in, who is on the way, and the deals in progression - this month and the next two."
    >
      {(month) => <MoveInsTab month={month} office />}
    </FiguresPage>
  );
}
