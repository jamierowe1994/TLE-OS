import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { listKnowledge } from "@/lib/business/knowledge-store";

/**
 * GET /api/knowledge/guides → the entries marked as guides, for Steve's
 * Guides shelf. Anyone signed in: these are written FOR agents. Titles,
 * sections and a first line only; the reader page has the rest.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const all = await listKnowledge().catch(() => []);
  const guides = all
    .filter((e) => e.guide)
    .sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title))
    .map((e) => ({
      id: e.id,
      title: e.title,
      section: e.section,
      blurb: e.content.split(/\n/).find((l) => l.trim() && !/^#/.test(l))?.slice(0, 160) ?? "",
      minutes: Math.max(1, Math.round(e.content.split(/\s+/).length / 200)),
      updatedAt: e.updatedAt,
    }));
  return NextResponse.json({ ok: true, guides });
}
