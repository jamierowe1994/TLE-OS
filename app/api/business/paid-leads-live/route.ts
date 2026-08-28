import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/business/auth";
import { requireCapability } from "@/lib/admin";
import { findById, listUsers } from "@/lib/business/users-store";
import { getBusinessLeadsMTD, metaTokenSet, parseCampaignIds } from "@/lib/business/meta";
import { getGhlPaidLeadsMtd } from "@/lib/business/ghl";
import { currentMonth } from "@/lib/business/format";

// Live figures for the Paid Leads tab, from both ends of the funnel:
//   Meta — leads generated + spend + CPL (the ads platform's own numbers).
//   GHL  — the CRM funnel: leads created, referred to agents (Initial Call
//          Booked), MAs booked (MA Booked stage / won). Cached in lib/ghl.ts.

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const admin = userId ? await findById(userId) : null;
  if (!admin || !(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const month = currentMonth();

  const metaWork = (async () => {
    if (!metaTokenSet()) return null;
    // Fallback pool: every campaign tagged on any agent profile.
    const users = await listUsers();
    const campaignIds = [
      ...new Set(users.flatMap((u) => parseCampaignIds(u.metaCampaignId))),
    ];
    return getBusinessLeadsMTD(campaignIds).catch(() => null);
  })();

  const [mtd, ghl] = await Promise.all([
    metaWork,
    getGhlPaidLeadsMtd(month).catch(() => null),
  ]);

  return NextResponse.json({
    configured: metaTokenSet(),
    ...(mtd ?? { leads: null }),
    ghl,
    generatedAt: new Date().toISOString(),
  });
}
