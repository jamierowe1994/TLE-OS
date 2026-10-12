import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { sendNewLeadWebhooks, sendTestWebhook, webhookStatus } from "@/lib/marketing-webhook";

/**
 * The new-lead ping to marketing's app (lib/marketing-webhook).
 *
 *   GET                     where it sends, how many have gone, the last error
 *   POST { test: true }     one "ping" with a made-up lead, for setting the app up
 *   POST                    send what is new now (the lead scan does this every five minutes)
 *
 * An owner signed in (manage:switches), or the cron key.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function allowed(req: NextRequest) {
  return cron(req) || Boolean(await requireCapability(req, "manage:switches"));
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await webhookStatus()) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { test?: unknown };
  if (b.test === true) return NextResponse.json(await sendTestWebhook());
  return NextResponse.json({ ok: true, ...(await sendNewLeadWebhooks()) });
}
