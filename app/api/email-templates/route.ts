import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { SESSION_COOKIE, uid, verifySessionToken } from "@/lib/auth";
import { CAMPAIGNS } from "@/lib/campaigns";

/**
 * The copy behind a campaign step.
 *
 * An overlay, not a replacement. The campaign — its days, its channels, who it
 * is for — stays in code where it can be read in one screen; only the words
 * come from here. So DELETE is a real feature: it reverts a step to whatever
 * the code says, and is the only undo anyone actually needs.
 *
 * Writing is behind a session because these are the words that go out under
 * the company's name.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type StoredTemplate = {
  campaignId: string;
  stepIndex: number;
  subject: string;
  blocks: Record<string, unknown>[];
  updatedAt?: string;
};

const STEPS = new Map(CAMPAIGNS.map((c) => [c.id, c.steps.length]));

/** A step that exists, on a campaign that exists. Anything else is a typo or
 *  a stale tab, and storing copy against it would strand the copy. */
function knownStep(campaignId: unknown, stepIndex: unknown): boolean {
  const n = STEPS.get(String(campaignId));
  return n !== undefined && Number.isInteger(stepIndex) && (stepIndex as number) >= 0 && (stepIndex as number) < n;
}

function me(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ stored: false, templates: [] });
  const campaignId = new URL(req.url).searchParams.get("campaign");
  const rows = await q<{
    campaign_id: string;
    step_index: number;
    subject: string;
    blocks: Record<string, unknown>[];
    updated_at: string;
  }>(
    campaignId
      ? `SELECT campaign_id, step_index, subject, blocks, updated_at FROM os_email_templates WHERE campaign_id = $1`
      : `SELECT campaign_id, step_index, subject, blocks, updated_at FROM os_email_templates`,
    campaignId ? [campaignId] : undefined
  );
  return NextResponse.json({
    stored: true,
    templates: rows.map((r) => ({
      campaignId: r.campaign_id,
      stepIndex: r.step_index,
      subject: r.subject,
      blocks: Array.isArray(r.blocks) ? r.blocks : [],
      updatedAt: r.updated_at,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const userId = me(req);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Partial<StoredTemplate>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!knownStep(body.campaignId, body.stepIndex)) {
    return NextResponse.json({ error: "That campaign step doesn't exist." }, { status: 400 });
  }
  if (!Array.isArray(body.blocks)) {
    return NextResponse.json({ error: "Blocks must be a list." }, { status: 400 });
  }
  if (!hasDb()) {
    return NextResponse.json({ saved: false, reason: "No database on this environment." });
  }

  await q(
    `INSERT INTO os_email_templates (id, campaign_id, step_index, subject, blocks, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (campaign_id, step_index) DO UPDATE
       SET subject = EXCLUDED.subject,
           blocks = EXCLUDED.blocks,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
    [uid(), body.campaignId, body.stepIndex, body.subject ?? "", JSON.stringify(body.blocks), userId]
  );
  return NextResponse.json({ saved: true });
}

export async function DELETE(req: NextRequest) {
  if (!me(req)) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign") ?? "";
  const stepIndex = Number(url.searchParams.get("step"));
  if (!knownStep(campaignId, stepIndex)) {
    return NextResponse.json({ error: "That campaign step doesn't exist." }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ saved: false, reason: "No database on this environment." });
  await q(`DELETE FROM os_email_templates WHERE campaign_id = $1 AND step_index = $2`, [campaignId, stepIndex]);
  return NextResponse.json({ saved: true, reverted: true });
}
