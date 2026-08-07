import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { keyIsOurs, R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/**
 * Handing a file back.
 *
 * The bucket stays private and nothing is ever served from a public URL.
 * Instead this signs a link that works for five minutes and redirects to it,
 * so a link copied out of the address bar is worthless by the time anybody
 * else tries it.
 *
 * Five minutes is deliberate. Long enough for a slow phone on a train to
 * finish loading a certificate; short enough that a URL pasted into an email
 * has already expired.
 *
 * NOTE, and it matters: right now the only check is "does this key belong to
 * us". Everything sits behind the shared access code, which is fine for a
 * two-person preview and NOT fine once there are real users — at that point
 * this route has to ask whether THIS person may see THIS record's files. That
 * check goes here, before the signature.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_SECONDS = 300;

export async function GET(req: NextRequest) {
  if (!r2Configured) {
    return NextResponse.json({ ok: false, error: "Storage isn't configured." }, { status: 503 });
  }

  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!keyIsOurs(key)) {
    return NextResponse.json({ ok: false, error: "Not a valid file reference." }, { status: 400 });
  }

  try {
    const url = await withR2((client) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), {
        expiresIn: TTL_SECONDS,
      })
    );
    // 302 rather than proxying the bytes: R2 serves the file directly, so the
    // app never becomes the bottleneck for a 12MB photo.
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("R2 signing failed", err.name, err.message);
    return NextResponse.json({ ok: false, error: "Couldn't open that file." }, { status: 502 });
  }
}
