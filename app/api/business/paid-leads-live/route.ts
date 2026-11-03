import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/admin";
import { listUsers } from "@/lib/business/users-store";
import { getBusinessLeadsMTD, metaTokenSet, parseCampaignIds } from "@/lib/business/meta";
import { fetchLaunchPadFigures } from "@/lib/business/launchpad-figures";
import { currentMonth } from "@/lib/business/format";

// Live figures for the Paid Leads tab.
//   Launch Pad - the paid leads admin site. Leads that landed in each agent's
//                funnel, MAs, speed to lead, spend on the agents' campaigns,
//                per agent, by source, and what needs chasing. What the tab shows.
//   Meta       - the TLE ad account's own totals, kept for the Marketing hub.
//
// Susan Liles, 3 Nov 2026: Go High Level is gone from here. Its token has been
// refused (401) since GHL was retired, so referrals and MAs were dashes while
// Launch Pad held the real numbers. See lib/business/launchpad-figures.ts.

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

  const [mtd, launchpad] = await Promise.all([metaWork, fetchLaunchPadFigures(month)]);

  return NextResponse.json({
    configured: metaTokenSet(),
    month,
    ...(mtd ?? { leads: null }),
    launchpad: launchpad.ok ? launchpad.figures : null,
    launchpadError: launchpad.ok ? null : launchpad.reason,
    generatedAt: new Date().toISOString(),
  });
}
