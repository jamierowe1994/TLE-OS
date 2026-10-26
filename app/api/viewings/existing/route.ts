import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { upcomingHereFor } from "@/lib/person-viewings";

/**
 * POST /api/viewings/existing { listing, lead?, contact?, email?, name? }
 *   → { ok, viewings } - this person's viewings still to come on this listing.
 *
 * A POST, so their email and name stay out of the read log's addresses.
 *
 * Asked by the booker before it books (Stuart Roper, 26 Oct 2026: a second
 * booking made a second viewing and kept the first), so it can offer to move
 * the one there is instead. Reads only; a failure answers with nothing and
 * the booking goes ahead as before.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" || typeof b[k] === "number" ? String(b[k]).trim() : "");
  const listingId = str("listing");
  if (!/^-?\d+$/.test(listingId)) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  const viewings = await upcomingHereFor({
    listingId,
    leadId: str("lead"),
    contactId: str("contact"),
    email: str("email"),
    name: str("name"),
  }).catch(() => []);
  return NextResponse.json({ ok: true, viewings });
}
