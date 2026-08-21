import { NextRequest, NextResponse } from "next/server";
import { handoffFor, sendHandoff } from "@/lib/deal-handoff";
import { rexConfigured } from "@/lib/rex";

/**
 * GET  /api/handoff?application=37709 → the packet, and what's missing from it
 * POST /api/handoff { applicationId, force? } → fire Howard's flow
 *
 * The packet is always readable. Sending it needs POWER_AUTOMATE_ACCEPTED_URL,
 * which nobody has yet — so the GET half is the useful one today, and it is
 * useful on its own: it says what a deal is short of before it reaches Kirstie.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected here." }, { status: 503 });
  }
  const id = req.nextUrl.searchParams.get("application");
  if (!id) return NextResponse.json({ error: "application id is required" }, { status: 400 });

  try {
    const handoff = await handoffFor(id);
    if (!handoff) {
      return NextResponse.json({ error: `No application ${id}.` }, { status: 404 });
    }
    return NextResponse.json(handoff);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: { applicationId?: string; force?: boolean };
  try {
    body = (await req.json()) as { applicationId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  try {
    const handoff = await handoffFor(body.applicationId);
    if (!handoff) {
      return NextResponse.json({ error: `No application ${body.applicationId}.` }, { status: 404 });
    }
    const res = await sendHandoff(handoff, body.force === true);
    return NextResponse.json({ ok: res.status < 300, ...res });
  } catch (e) {
    // Either "no trigger URL" or "not ready" — both carry their own words.
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
