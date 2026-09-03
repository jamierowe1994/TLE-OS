import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { currentLandlord, landlordDocument } from "@/lib/landlord-account";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/** Open one of the landlord's own uploads. Theirs only; a short-lived link to R2. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured." }, { status: 503 });

  const { id } = await ctx.params;
  const doc = await landlordDocument(me.id, id);
  if (!doc) return NextResponse.json({ ok: false, error: "No such document on your file." }, { status: 404 });

  try {
    const url = await withR2((client) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.r2Key }), { expiresIn: 300 })
    );
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    console.error("[landlord/documents] signing failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't open that file." }, { status: 502 });
  }
}
