import { NextRequest, NextResponse } from "next/server";
import { recordOpen } from "@/lib/newsletter-track";

/**
 * A newsletter was opened (lib/newsletter-track). The mail client fetches this
 * one-pixel picture; the token says whose copy. Always answers with the
 * picture, whatever happens, so an email never shows a broken image.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.gif$/i, "");
  await recordOpen(token).catch(() => null);
  return new NextResponse(new Uint8Array(GIF), {
    headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, private", "content-length": String(GIF.length) },
  });
}
