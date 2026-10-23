import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { whoIs } from "@/lib/admin";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { getTerms } from "@/lib/terms/store";

/** GET -> the signed copy, for staff. A short-lived link to the OS's own copy in R2. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const t = await getTerms((await ctx.params).id);
  if (!t?.signedR2Key || !r2Configured) return NextResponse.json({ ok: false, error: "There's no signed copy on file yet." }, { status: 404 });
  const url = await withR2((client) => getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: t.signedR2Key! }), { expiresIn: 300 }));
  return NextResponse.redirect(url, { status: 302 });
}
