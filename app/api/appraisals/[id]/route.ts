import { NextResponse } from "next/server";
import { getAppraisal } from "@/lib/appraisal-store";
import { withLiveStages } from "@/lib/appraisal-stage";
import { hasDb, q } from "@/lib/db";

/**
 * ONE appraisal, with its live stage, the why line and the ticks (2 Oct 2026).
 *
 * The file page used to read the WHOLE list from /api/appraisals to show one
 * record, and read it again after every save - so every figure typed on a
 * file paid for the signals of sixty other files. This is the same record
 * the list would carry for this id (same store read, same staging, same
 * unread count), worked out for this one only.
 *
 * Read live, never from the list's 30-second copy: this is the screen a
 * person has just saved on, and the ticks must show what they just did.
 *
 * ?bare=1 skips the staging for callers that only want the stored figures
 * (the lead drawer's valuation box reads the figure and the fee, nothing
 * else).
 *
 * Same shape on failure as the list: a 404 for no such appraisal, an error
 * string rather than an invented record otherwise.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bare = new URL(req.url).searchParams.get("bare") === "1";
  try {
    const ma = await getAppraisal(id);
    if (!ma) return NextResponse.json({ appraisal: null, error: "No such appraisal." }, { status: 404 });
    if (bare) return NextResponse.json({ appraisal: ma });
    const [[staged], unread] = await Promise.all([
      withLiveStages([ma], new Date(), { fresh: true }),
      hasDb()
        ? q<{ n: number }>(
            `SELECT count(*)::int AS n FROM os_landlord_messages
              WHERE appraisal_id = $1 AND direction = 'landlord' AND read_at IS NULL`,
            [id]
          )
            .then((r) => r[0]?.n ?? 0)
            .catch(() => 0)
        : Promise.resolve(0),
    ]);
    return NextResponse.json({ appraisal: { ...staged, unreadMessages: unread } });
  } catch (e) {
    return NextResponse.json({ appraisal: null, error: e instanceof Error ? e.message : "read failed" }, { status: 500 });
  }
}
