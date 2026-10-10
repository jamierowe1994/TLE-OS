import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/admin";
import { findById, listUsers } from "@/lib/business/users-store";
import { getBusinessLeadsMTD, metaTokenSet, parseCampaignIds } from "@/lib/business/meta";
import { getGhlPaidLeadsMtd } from "@/lib/business/ghl";
import { currentMonth } from "@/lib/business/format";

// Live figures for the Paid Leads tab, from both ends of the funnel:
//   Meta - leads generated + spend + CPL (the ads platform's own numbers).
//   GHL  - the CRM funnel: leads created, referred to agents (Initial Call
//          Booked), MAs booked (MA Booked stage / won). Cached in lib/ghl.ts.

// Two audiences: Susan reads the spend and CPL as business performance,
// Francesca reads the same numbers as her own campaigns' results.
export async function GET(req: NextRequest) {
  if (!(await requireAnyCapability(req, ["see:business", "see:marketing"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  /* The month the tab's picker is on. Always this month until 10 Oct 2026
     (Rig P-018), so every month the picker offered showed this one's leads. */
  const asked = req.nextUrl.searchParams.get("month");
  const month = asked && /^\d{4}-\d{2}$/.test(asked) && asked <= currentMonth() ? asked : currentMonth();

  const metaWork = (async () => {
    if (!metaTokenSet()) return null;
    // Fallback pool: every campaign tagged on any agent profile.
    const users = await listUsers();
    const campaignIds = [
      ...new Set(users.flatMap((u) => parseCampaignIds(u.metaCampaignId))),
    ];
    return getBusinessLeadsMTD(campaignIds, month).catch(() => null);
  })();

  const [mtd, ghl] = await Promise.all([
    metaWork,
    getGhlPaidLeadsMtd(month).catch(() => null),
  ]);

  return NextResponse.json({
    configured: metaTokenSet(),
    month,
    ...(mtd ?? { leads: null }),
    ghl,
    generatedAt: new Date().toISOString(),
  });
}
