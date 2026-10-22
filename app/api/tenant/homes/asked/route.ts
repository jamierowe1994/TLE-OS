import { NextRequest, NextResponse } from "next/server";
import { jsonObject } from "@/lib/json-body";
import { readMoreHomesToken, recordAsked } from "@/lib/let-notice";

/**
 * POST { guest }: somebody opened Show Me Other Homes from "it's been let"
 * (components/tenant/AskedPing). Their signed link says who; the first time
 * is a note on their lead and a line in the sending agent's bell.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = (await jsonObject(req)) as { guest?: string };
  const who = typeof b.guest === "string" ? readMoreHomesToken(b.guest) : null;
  if (!who) return NextResponse.json({ ok: false, error: "That link isn't valid." }, { status: 400 });
  await recordAsked(who.listingId, who.email).catch(() => null);
  return NextResponse.json({ ok: true });
}
