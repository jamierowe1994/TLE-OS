import { NextResponse } from "next/server";
import { lookRows } from "@/lib/new-look-store";

/**
 * Which screens have the new look switched on for everyone. Nothing else: no
 * names, no who or when.
 *
 * Public on purpose. The demo copy (lib/demo/mode) runs on its own empty
 * database, where every look switch starts off, so it came up in the old
 * look (James, 18 Nov 2026: "you've pulled through the old version with the
 * house"). It reads this from the live system each morning and at each
 * deploy and matches it, so a screen James switches on for the team is on in
 * the demo the next day without anybody remembering to do it twice.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rows = await lookRows().catch(() => null);
  if (!rows) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json(
    { ok: true, everyone: rows.filter((r) => r.level === "everyone").map((r) => r.id) },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
