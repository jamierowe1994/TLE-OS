import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { currentTenant, } from "@/lib/tenant-account";
import { tenantDocument } from "@/lib/tenant-documents";

/**
 * Handing one back to the tenant who sent it.
 *
 * The lookup is BY ACCOUNT AND ID TOGETHER (see lib/tenant-documents), so a
 * tenant guessing another's document id gets nothing rather than a signed URL.
 * The URL is short-lived and the response is marked private: a five-minute
 * link to somebody's passport scan should not sit in a shared cache.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const doc = await tenantDocument(me.id, id);
  if (!doc) return NextResponse.json({ ok: false, error: "No such document." }, { status: 404 });
  const url = await withR2((client) =>
    getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.r2Key }), { expiresIn: 300 })
  );
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=60" } });
}
