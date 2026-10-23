import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { byToken } from "@/lib/terms/store";

/** GET -> the landlord's signed copy, by their own link. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const hit = await byToken((await ctx.params).token);
  if (!hit?.terms.signedR2Key || !r2Configured) return NextResponse.json({ ok: false, error: "There's no signed copy yet." }, { status: 404 });
  const url = await withR2((client) => getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: hit.terms.signedR2Key! }), { expiresIn: 300 }));
  return NextResponse.redirect(url, { status: 302 });
}
