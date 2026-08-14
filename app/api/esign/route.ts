import { NextRequest, NextResponse } from "next/server";
import { esignFor, signedDocuments } from "@/lib/rex-esign";
import { rexConfigured } from "@/lib/rex";

/**
 * What has been sent for signature on a listing, and what has come back.
 *
 * Read-only and through the office account: a status is not personal work, and
 * nobody should have to sign into REX to see whether the terms came back.
 *
 * The signed documents are listed but their addresses are NOT returned — see
 * cdnUrlFor in lib/rex-esign for why. The browser gets an id it can ask this
 * server to stream; it never gets a URL it could paste to somebody else.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  }
  const listingId = req.nextUrl.searchParams.get("listingId") ?? "";
  if (!listingId) {
    return NextResponse.json({ ok: false, error: "listingId required" }, { status: 400 });
  }

  const [requests, docs] = await Promise.all([
    esignFor(listingId).catch(() => []),
    signedDocuments(listingId).catch(() => []),
  ]);

  return NextResponse.json({
    ok: true,
    requests,
    documents: docs.map((d) => ({
      id: d.id,
      name: d.name,
      sizeMb: d.sizeMb,
      createdAt: d.createdAt,
      /** Deliberately a route on us, not the CDN address. */
      open: `/api/esign/document?listingId=${encodeURIComponent(listingId)}&id=${d.id}`,
    })),
  });
}
