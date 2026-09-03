import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { listCampaigns, listSends, queueSends, updateCampaign, updateStep } from "@/lib/bond-campaigns";

/**
 * Campaigns and their queue.
 *
 * GET   → campaigns with steps and counts, plus the queue (newest 300 sends)
 * PATCH { step: id, ...fields } or { campaign: id, ...fields }
 * POST  { queue: true } → build today's queue now (the morning run does this too)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  try {
    const [campaigns, sends] = await Promise.all([listCampaigns(), listSends()]);
    return NextResponse.json({ ok: true, campaigns, sends });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (typeof body.step === "number") await updateStep(body.step, body);
    else if (typeof body.campaign === "number") await updateCampaign(body.campaign, body);
    else return NextResponse.json({ ok: false, error: "Say which step or campaign." }, { status: 400 });
    return NextResponse.json({ ok: true, campaigns: await listCampaigns() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.queue) return NextResponse.json({ ok: false, error: "Nothing to do." }, { status: 400 });
  const r = await queueSends();
  return NextResponse.json({ ok: true, ...r, campaigns: await listCampaigns(), sends: await listSends() });
}
