import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { whoIs } from "@/lib/admin";
import { readListingDetails } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { readEpcFile } from "@/lib/epc-read";
import { rexConfigured } from "@/lib/rex";

/**
 * GET ?id=<listing id> -> { band, current, potential } read off the EPC the
 * listing carries (lib/epc-read). Reads only; the Marketing tab fills its
 * boxes from it and the agent saves. Their own listings, for an agent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  const notTheirs = await listingIsTheirs(actor, id);
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  try {
    const details = await readListingDetails(id, { cached: true });
    if (!details.epc.fileUrl) return NextResponse.json({ ok: false, error: "There is no EPC on this listing to read. Add it on the Compliance tab." });
    const read = await readEpcFile(details.epc.fileUrl);
    return NextResponse.json({ ok: true, ...read }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The EPC could not be read.") }, { status: 502 });
  }
}
