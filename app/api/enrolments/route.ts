import { NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { campaignResults, campaignsById } from "@/lib/campaign-store";

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
 *
 * Any campaign that exists can be enrolled on - built in, overridden or
 * written on the Marketing screen. It used to be the built-in ids only,
 * which meant a campaign marketing wrote could be picked but never joined.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!hasDb()) return NextResponse.json({ stored: false, enrolments: [], counts: {} });
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign");
  const recordId = url.searchParams.get("recordId");

  try {
    if (recordId) {
      const rows = await q(
        `SELECT id, campaign_id, status, reason, enrolled_at, last_step_sent, stopped_reason
           FROM os_campaign_enrolments WHERE record_id = $1 ORDER BY enrolled_at DESC`,
        [recordId]
      );
      return NextResponse.json({ stored: true, enrolments: rows });
    }
    if (campaignId) {
      const rows = await q(
        `SELECT id, record_id, name, email, reason, status, stopped_reason, source, enrolled_at, last_step_sent
           FROM os_campaign_enrolments WHERE campaign_id = $1 ORDER BY enrolled_at DESC LIMIT 200`,
        [campaignId]
      );
      return NextResponse.json({ stored: true, enrolments: rows });
    }
    // The overview marketing actually wants: how many live on each campaign,
    // and what happened to the rest - replied, booked, ran to the end.
    return NextResponse.json({ stored: true, counts: await campaignResults() });
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
    rexContactId?: string | null;
    stop?: boolean;
    stopReason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const { campaignId, recordId } = body;
  if (!campaignId || !recordId) {
    return NextResponse.json({ error: "A campaign and a record are required." }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ saved: false, reason: "No database on this environment." });
  if (!(await campaignsById()).has(campaignId)) {
    return NextResponse.json({ error: "No such campaign." }, { status: 400 });
  }

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
    /* A REX contact id doubles as the send target when the record itself is
       one (the appraisal screens pass the contact as the record). */
    const rexContactId = body.rexContactId ?? (/^\d+$/.test(recordId) ? recordId : null);
    await q(
      `INSERT INTO os_campaign_enrolments (id, campaign_id, record_id, name, email, reason, rex_contact_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'appraisal')
       ON CONFLICT DO NOTHING`,
      [
        `${campaignId}:${recordId}:${Date.now()}`,
        campaignId,
        recordId,
        body.name ?? "",
        body.email ?? "",
        body.reason ?? "",
        rexContactId,
      ]
    );
    return NextResponse.json({ saved: true });
  } catch (e) {
    return NextResponse.json({ saved: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
