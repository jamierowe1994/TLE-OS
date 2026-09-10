import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { listKnowledge } from "@/lib/business/knowledge-store";
import { GUIDES } from "@/lib/guides";

/**
 * GET /api/knowledge/guides → Steve's Guides shelf.
 *
 * ── One shelf out of two ──────────────────────────────────────────────────
 *
 * There were two kinds of guide in this codebase and neither knew about the
 * other. `lib/guides.ts` holds the BUILT ones - a written page with real
 * screenshots, the dashboard walkthrough being the first and, until today, the
 * only finished guide in the product. The knowledge store holds the WRITTEN
 * ones, typed or pasted into /knowledge and ticked as a guide.
 *
 * The shelf only ever read the second, and the built one sat behind /admin,
 * which is owner-only - so the one guide that existed could not be opened by a
 * single person it was written for (James, 10 Sep 2026: "we need to be making
 * sure that we're uploading these consistently").
 *
 * So both come back from here, in the same shape, each carrying its own `href`.
 * Where a guide is stored stops being something the panel has to know, and a
 * guide written next month appears without either side being edited.
 *
 * Titles, sections and a first line only. The reader page has the rest.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface ShelfGuide {
  id: string;
  title: string;
  section: string;
  blurb: string;
  minutes: number;
  href: string;
  /** "Walkthrough" for a built page, "Written" for one typed into /knowledge. */
  form: "walkthrough" | "written";
  updatedAt: string | null;
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  /* Signed in, or no database at all - a developer's machine. Same guard, and
     the same reasoning, as the dock that calls this. */
  if (!actor && hasDb()) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  /* Anything not finished stays off the shelf. A guide that turns out to be a
     stub teaches somebody, on their first morning, that this product lists
     things it does not have. */
  const built: ShelfGuide[] = GUIDES.filter((g) => g.ready).map((g) => ({
    id: g.slug,
    title: g.title,
    section: g.section,
    blurb: g.blurb,
    minutes: g.minutes,
    href: `/guides/${g.slug}`,
    form: "walkthrough",
    updatedAt: null,
  }));

  const written: ShelfGuide[] = (await listKnowledge().catch(() => []))
    .filter((e) => e.guide)
    .map((e) => ({
      id: e.id,
      title: e.title,
      section: e.section,
      blurb: e.content.split(/\n/).find((l) => l.trim() && !/^#/.test(l))?.slice(0, 160) ?? "",
      minutes: Math.max(1, Math.round(e.content.split(/\s+/).length / 200)),
      href: `/knowledge/${e.id}`,
      form: "written",
      updatedAt: e.updatedAt,
    }));

  const guides = [...built, ...written].sort(
    (a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title)
  );
  return NextResponse.json({ ok: true, guides });
}
