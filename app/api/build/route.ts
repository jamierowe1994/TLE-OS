import { NextResponse } from "next/server";

/**
 * Which build the server is running (ticket a38f4a95, 17 Nov 2026).
 *
 * A tab left open across a deploy still runs the old build's code, and the
 * first screen it opens afterwards asks for pieces the new build no longer
 * has. Safari says so as "e[a] is not a function", which filed itself as a
 * fault on Rhiannon's /viewings twenty minutes after a push. lib/auto-report
 * asks here before filing anything that looks like that: a different answer
 * from the tab's own NEXT_PUBLIC_BUILD means the OS was updated underneath
 * the page, not that the page is broken.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD ?? "dev" },
    { headers: { "cache-control": "no-store" } }
  );
}
