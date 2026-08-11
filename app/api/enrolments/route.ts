import { NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { CAMPAIGNS } from "@/lib/campaigns";

/**
 * Who is on which campaign.
 *
 * Enrolling is idempotent on purpose: re-picking the same campaign for the
 * same landlord must not start the drip twice, and an agent WILL re-pick — by
 * reopening a case, by changing their mind and changing it back. The unique
 * index does the enforcing; this route just doesn't fight it.
 *
 * Stopping keeps the row. A campaign that quietly deletes its leavers can
 * never answer the only question worth asking of it — did it work — because
 * the ones it recovered are exactly the ones it stops.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IDS = new Set(CAMPAIGNS.map((c) => c.id));

export async function GET(req: Request) {
  if (!hasDb()) return NextResponse.json({ stored: false, enrolments: [], counts: {} });
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign");
  const recordId = url.searchParams.get("recordId");

  try {
    if (recordId) {
      const rows = await q(
        `SELECT id, campaign_id, status, reason, enrolled_at, last_step_sent
           FROM os_campaign_enrolments WHERE record_id = $1 ORDER BY enrolled_at DESC`,
        [recordId]
      );
      return NextResponse.json({ stored: true, enrolments: rows });
    }
    if (campaignId) {
      const rows = await q(
        `SELECT id, record_id, name, email, reason, status, enrolled_at, last_step_sent
           FROM os_campaign_enrolments WHERE campaign_id = $1 ORDER BY enrolled_at DESC LIMIT 200`,
        [campaignId]
      );
      return NextResponse.json({ stored: true, enrolments: rows });
    }
    // The overview marketing actually wants: how many live on each campaign.
    const rows = await q<{ campaign_id: string; live: string; total: string }>(
      `SELECT campaign_id,
              COUNT(*) FILTER (WHERE status = 'active')::text AS live,
              COUNT(*)::text AS total
         FROM os_campaign_enrolments GROUP BY campaign_id`
    );
    const counts: Record<string, { live: number; total: number }> = {};
    for (const r of rows) counts[r.campaign_id] = { live: Number(r.live), total: Number(r.total) };
    return NextResponse.json({ stored: true, counts });
  } catch (e) {
    return NextResponse.json({ stored: false, counts: {}, enrolments: [], error: String(e) });
  }
}

export async function POST(req: Request) {
  let body: {
    campaignId?: string;
    recordId?: string;
    name?: string;
    email?: string;
    reason?: string;
    stop?: boolean;
    stopReason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const { campaignId, recordId } = body;
  if (!campaignId || !IDS.has(campaignId) || !recordId) {
    return NextResponse.json({ error: "A known campaign and a record are required." }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ saved: false, reason: "No database on this environment." });

  try {
    if (body.stop) {
      await q(
        `UPDATE os_campaign_enrolments
            SET status = 'stopped', stopped_at = NOW(), stopped_reason = $3
          WHERE campaign_id = $1 AND record_id = $2 AND status = 'active'`,
        [campaignId, recordId, body.stopReason ?? ""]
      );
      return NextResponse.json({ saved: true, stopped: true });
    }
    await q(
      `INSERT INTO os_campaign_enrolments (id, campaign_id, record_id, name, email, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        `${campaignId}:${recordId}:${Date.now()}`,
        campaignId,
        recordId,
        body.name ?? "",
        body.email ?? "",
        body.reason ?? "",
      ]
    );
    return NextResponse.json({ saved: true });
  } catch (e) {
    return NextResponse.json({ saved: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
