import { NextRequest, NextResponse } from "next/server";
import { readPhoto } from "@/lib/photos";

/**
 * An archived advert photo, from our bucket. Cached hard: the key is the
 * listing, and a listing's picture never changes once copied.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const photo = await readPhoto(decodeURIComponent(key));
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(photo.body), {
    status: 200,
    headers: { "content-type": photo.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}
