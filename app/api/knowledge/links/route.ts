import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { readLinks } from "@/lib/knowledge-links";

/**
 * POST /api/knowledge/links { urls: string[] } -> { results }
 * Reads each link, writes it up and keeps it under "Law and news" (lib/knowledge-links).
 * The same gate as writing any knowledge entry.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "edit:knowledge");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours to edit." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { urls?: unknown };
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string") : [];
  if (!urls.length) return NextResponse.json({ ok: false, error: "Paste at least one link." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "Steve can't read links on this environment." }, { status: 503 });
  const results = await readLinks(urls, me.name || me.email);
  return NextResponse.json({ ok: true, results });
}
