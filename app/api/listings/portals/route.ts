import { NextRequest, NextResponse } from "next/server";
import { portalLinksFor } from "@/lib/rex-portal-links";
import { rexConfigured } from "@/lib/rex";

/**
 * The public advert links for one listing — Rightmove, Zoopla, OnTheMarket.
 *
 * Read-only, through the office's service account, for the same reason as the
 * portal stats beside it: nobody needs to prove who they are to open a link
 * that any member of the public can already see.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "A listing id is required." }, { status: 400 });
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  }
  try {
    return NextResponse.json({ ok: true, listingId: id, portals: await portalLinksFor(id) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Portal links failed." },
      { status: 502 }
    );
  }
}
