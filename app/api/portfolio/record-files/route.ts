import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { homeContext, isRefusal, recordFiles } from "@/lib/home-send";

/**
 * GET ?listing=<id>&listings=<id,id>
 *
 * The clean sweep's papers for the home (documents/property-<os id>/...),
 * on its page beside everything else (Josel Banagua, 20 Oct 2026). The office
 * sees every paper. An agent, on a home in their own book (homeContext refuses
 * any other), sees the tenancy papers in lib/record-papers AGENT_HOME_PAPERS
 * only, the same list lib/r2-access opens for them (Lianna Denholm, ticket
 * 35aa0745, 20 Nov 2026: "I cant see any of the leases").
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const listings = (sp.get("listings") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ctx = await homeContext(req, (sp.get("listing") ?? "").trim(), listings);
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    return NextResponse.json({ ok: true, office: ctx.office, files: await recordFiles(ctx) }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The papers couldn't be read just now. Try again in a minute.") }, { status: 500 });
  }
}
