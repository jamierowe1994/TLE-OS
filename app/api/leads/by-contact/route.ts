import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { leadIdsByContact } from "@/lib/rex-viewings";

/**
 * GET /api/leads/by-contact?ids=12329355,11918937
 *
 * Which of these people already have a lead on the board, so a record that
 * knows a contact id can offer a way through to their file rather than
 * printing their name as dead text (James, 10 Sep 2026: "we can't actually
 * get to any of the stuff, which seems a bit weird").
 *
 * Reads the ledger, not REX - every lead the OS has ever seen is in os_leads
 * with its contact id, so this is one indexed query rather than a walk.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!ids.length) return NextResponse.json({ ok: true, leads: {} });

  const found = await leadIdsByContact(ids).catch(() => new Map<string, string>());
  return NextResponse.json({ ok: true, leads: Object.fromEntries(found) });
}
