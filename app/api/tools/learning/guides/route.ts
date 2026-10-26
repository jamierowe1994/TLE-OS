import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { libraryEntries } from "@/lib/marketing-library";

/**
 * GET /api/tools/learning/guides - Tools > Learning > Guides (James, 26 Oct
 * 2026: "an active library of all of the docs that we've got on the backend...
 * show them the top 10 guides"). Every file on Francesca's File Store that has
 * been read into the Marketing library (lib/marketing-library), with who it is
 * for, where it applies and its first lines, and the ten most opened in the
 * last 90 days - only once there are opens to count, never a made-up order.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type Guide = { id: string; title: string; what: string; audience: "you" | "landlords" | "tenants"; region: "UK" | "England and Wales" | "Scotland"; file: string | null };

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor && hasDb()) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    const [entries, top] = await Promise.all([
      libraryEntries(),
      hasDb()
        ? q<{ entry_id: string; n: string }>(
            `SELECT entry_id, COUNT(*) AS n FROM os_guide_opens WHERE opened_at > NOW() - INTERVAL '90 days' GROUP BY entry_id ORDER BY n DESC, MAX(opened_at) DESC LIMIT 10`
          )
        : Promise.resolve([]),
    ]);
    const guides: Guide[] = entries
      .filter((e) => /^library-[a-f0-9]{12}$/.test(e.id) && e.key)
      .map((e): Guide => {
        const [who, where] = e.audience.split("·").map((x) => x.trim());
        return {
          id: e.id,
          title: e.title,
          what: e.what,
          audience: /landlord/i.test(who ?? "") ? "landlords" : /tenant/i.test(who ?? "") ? "tenants" : "you",
          region: /scotland/i.test(where ?? "") ? "Scotland" : /england/i.test(where ?? "") ? "England and Wales" : "UK",
          file: e.file,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
    const known = new Set(guides.map((g) => g.id));
    return NextResponse.json({ ok: true, guides, top: top.filter((t) => known.has(t.entry_id)).map((t) => ({ id: t.entry_id, n: Number(t.n) })) });
  } catch {
    return NextResponse.json({ ok: false, error: "The guides couldn't be read just now." }, { status: 503 });
  }
}
