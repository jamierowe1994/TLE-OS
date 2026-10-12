import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";

/**
 * GET /api/m/face/<userId>?v=<hash> - a colleague's display photo as an image
 * (12 Oct 2026), for the chat screens' faces. The photo lives in os_users as
 * a data: URL; lib/chats hands out this address instead so a list of messages
 * is not a megabyte per face. ?v= changes with the photo, so the browser can
 * keep each one for a day without ever showing an old face.
 *
 * Signed-in colleagues only: these are the team's own photos, the same ones
 * Find Your Local Agents already shows.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return new NextResponse(null, { status: 401 });
  if (!hasDb()) return new NextResponse(null, { status: 404 });
  const rows = await q<{ photo: string | null }>(`SELECT photo FROM os_users WHERE id = $1`, [id]).catch(() => []);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(rows[0]?.photo ?? "");
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[2]!, "base64"), {
    headers: {
      "content-type": m[1]!,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
