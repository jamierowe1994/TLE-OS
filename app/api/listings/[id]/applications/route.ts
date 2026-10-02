import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeForWho } from "@/lib/scope";
import { hasDb } from "@/lib/db";
import { assembled } from "@/lib/applications-board";
import { rexConfigured } from "@/lib/rex";
import { testApplicationsFor } from "@/lib/test-overlay";

/**
 * ONE LISTING'S APPLICATIONS (2 Oct 2026).
 *
 * The listing drawer used to fetch /api/applications?limit=300 - three
 * hundred applications with every applicant on them - and keep the two or
 * three for this listing, in the browser. This reads the same book through
 * the same reader (lib/applications getApplications, with the same 300 and
 * the same scope as the Applications board, so the two share one pull in
 * its one-minute cache) and sends back only this listing's.
 *
 * Whose: an owner the business, an agent their own (lib/scope), plus the
 * tester's own test offers, exactly as the board shows them. Same objects
 * as the board's, so the drawer only changes the address it asks.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!/^-?\d+$/.test(listingId)) return NextResponse.json({ error: "Which listing?", applications: [] }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ error: "Applications aren't connected here.", applications: [] }, { status: 503 });

  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ unlinked: true, applications: [] });

  try {
    const [{ held, stale }, tests] = await Promise.all([
      assembled(scope.rexUserId),
      testApplicationsFor(who?.actor?.email).catch(() => []),
    ]);
    const { applications, stages, closed } = held.value;
    const mine = (a: { listingId?: number | string | null }) => String(a.listingId ?? "") === listingId;
    return NextResponse.json({
      applications: [
        ...tests.filter(mine).map((a) => ({ ...a, stageLabel: a.stageLabel ?? a.statusLabel, test: true })),
        ...applications.filter(mine).map((a) => ({ ...a, stageLabel: stages.get(a.id) ?? a.statusLabel, closed: closed.get(a.id) ?? null })),
      ],
      scope: scope.label,
      ...(stale ? { stale: true } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The applications did not load.", applications: [] }, { status: 502 });
  }
}
