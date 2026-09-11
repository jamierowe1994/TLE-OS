import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { readEnquiry } from "@/lib/rex-enquiry";

export const dynamic = "force-dynamic";

/**
 * The tenant's enquiry in full, for the top of the lead page (11 Sep 2026).
 *
 * Kept on the lead's ledger row once read, so REX is asked once per lead,
 * the first time anybody opens it. READ-ONLY on REX: Leads/read and nothing
 * else. A lead the OS made itself has no REX email behind it and answers
 * with nothing.
 */
type Stored = { enquiryFull?: string; enquiryFields?: Array<[string, string]>; enquirySource?: string | null; receivedAt?: string };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!id.startsWith("rex-")) return NextResponse.json({ ok: true, enquiry: null });

  let stored: Stored | null = null;
  if (hasDb()) {
    const rows = await q<{ payload: Stored }>(`SELECT payload FROM os_leads WHERE id = $1`, [id]).catch(() => []);
    stored = rows[0]?.payload ?? null;
    if (stored?.enquiryFull !== undefined) {
      return NextResponse.json({
        ok: true,
        enquiry: { message: stored.enquiryFull, fields: stored.enquiryFields ?? [], receivedAt: stored.receivedAt ?? null, source: stored.enquirySource ?? null },
      });
    }
  }

  const e = await readEnquiry(id.slice(4)).catch(() => null);
  if (!e) return NextResponse.json({ ok: false, error: "REX did not answer for this enquiry." }, { status: 502 });

  if (hasDb()) {
    await q(
      `UPDATE os_leads SET payload = payload || jsonb_build_object('enquiryFull', $2::text, 'enquiryFields', $3::jsonb, 'enquirySource', $4::text) WHERE id = $1`,
      [id, e.message, JSON.stringify(e.fields), e.source]
    ).catch(() => {});
  }
  return NextResponse.json({ ok: true, enquiry: { ...e, receivedAt: e.receivedAt ?? stored?.receivedAt ?? null } });
}
