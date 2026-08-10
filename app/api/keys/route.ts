import { NextRequest, NextResponse } from "next/server";
import { fetchKeys } from "@/lib/rex-keys";
import { rexConfigured } from "@/lib/rex";

/** Key sets for one or more properties. Read-only, like everything REX. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: true, keys: {} });
  const ids = (req.nextUrl.searchParams.get("propertyIds") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 60);
  if (!ids.length) return NextResponse.json({ ok: true, keys: {} });
  try {
    return NextResponse.json({ ok: true, keys: await fetchKeys(ids) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't read the key register." },
      { status: 502 }
    );
  }
}
