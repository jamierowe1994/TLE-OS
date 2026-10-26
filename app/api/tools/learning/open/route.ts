import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";

/**
 * GET /api/tools/learning/open?id=<library entry> - opening a guide from Tools >
 * Learning > Guides: written down (os_guide_opens, for "Most Opened"), then on
 * to the file itself at /library/<id>, the one route that serves them.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^library-[a-f0-9]{12}$/.test(id)) return new NextResponse("Not found.", { status: 404 });
  const { actor } = await whoIs(req);
  /* A relative address: behind Railway req.url's own host is the container's, not the site's. */
  const go = (to: string) => new NextResponse(null, { status: 302, headers: { Location: to } });
  if (!actor && hasDb()) return go("/login");
  if (actor && hasDb()) await q(`INSERT INTO os_guide_opens (entry_id, user_id) VALUES ($1, $2)`, [id, actor.id]).catch(() => null);
  return go(`/library/${id}${req.nextUrl.searchParams.get("save") === "1" ? "?save=1" : ""}`);
}
