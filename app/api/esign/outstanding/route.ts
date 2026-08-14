import { NextResponse } from "next/server";
import { rexConfigured } from "@/lib/rex";
import { outstandingTerms } from "@/lib/rex-esign";

/**
 * Every set of terms still waiting on a signature, across TLE's whole book.
 *
 * Scoped to TLE by template — see outstandingTerms for why the sender's email
 * domain is the wrong divider. Measured 14 Aug 2026: 32 outstanding on TLE's
 * three templates against 73 across the shared account, so the scoping is
 * doing real work rather than decorating the query.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
  }
  const rows = await outstandingTerms().catch(() => []);
  return NextResponse.json({
    ok: true,
    count: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      address: r.address,
      templateName: r.templateName,
      sentBy: r.sentBy,
      sentAt: r.sentAt,
      age: r.age,
      listingId: r.listingId,
      // Only the landlord — the Agent role is one of ours and is not who
      // anybody is waiting on.
      signers: r.signers.filter((s) => s.role.toLowerCase() !== "agent"),
    })),
  });
}
