import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { currentLandlord, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { hasDb, q } from "@/lib/db";

/**
 * Open a signed contract. The signed PDF is filed by the DocuSeal webhook
 * under the appraisal; a landlord may open it only if that appraisal is on
 * their file.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb() || !r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured." }, { status: 503 });

  const { id } = await ctx.params;
  const rows = await q<{ appraisal_id: string; r2_key: string }>(
    `SELECT appraisal_id, r2_key FROM os_signed_documents WHERE submitter_id = $1 AND completed_at IS NOT NULL`,
    [id]
  ).catch(() => []);
  const row = rows[0];
  if (!row || !row.r2_key || !(await landlordOwnsAppraisal(me, row.appraisal_id))) {
    return NextResponse.json({ ok: false, error: "No such document on your file." }, { status: 404 });
  }

  try {
    const url = await withR2((client) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key }), { expiresIn: 300 })
    );
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    console.error("[landlord/signed] signing failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't open that file." }, { status: 502 });
  }
}
