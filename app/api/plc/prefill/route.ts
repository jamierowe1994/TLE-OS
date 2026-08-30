import { NextRequest, NextResponse } from "next/server";
import { prefillFor } from "@/lib/plc-prefill";
import { rexConfigured } from "@/lib/rex";

/**
 * GET /api/plc/prefill?application=<id>
 * GET /api/plc/prefill?listing=<id>
 *
 * What the wizard knows before it asks anything. Read-only, and it never
 * creates a case — the agent has not agreed to anything yet at this point,
 * and a half-started handover left behind by somebody who opened the screen
 * and closed it again would sit in the list forever looking like work.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json(
      { ok: false, error: "REX isn't connected here, so there is nothing to pull through." },
      { status: 503 }
    );
  }

  const applicationId = req.nextUrl.searchParams.get("application") ?? undefined;
  const listingId = req.nextUrl.searchParams.get("listing") ?? undefined;
  if (!applicationId && !listingId) {
    return NextResponse.json(
      { ok: false, error: "Say which application or listing this is for." },
      { status: 400 }
    );
  }

  try {
    const prefill = await prefillFor({ applicationId, listingId });
    if (!prefill) {
      return NextResponse.json(
        {
          ok: false,
          error: listingId
            ? "No application on that listing yet. A handover starts from an accepted application."
            : "No application with that reference.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, prefill });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't read the application." },
      { status: 502 }
    );
  }
}
