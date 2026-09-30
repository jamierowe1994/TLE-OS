import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { MAIL_IMG_NAME, MAIL_IMG_PREFIX } from "@/lib/mail-images";

/**
 * A newsletter picture, public, for the mail client that opens the email.
 *
 * Exempt from the sign-in door (middleware) like /brand and /email, and safe
 * for the same reason: it can only ever serve a name matching MAIL_IMG_NAME
 * from the newsletter-images prefix - a uuid we issued - so no other file in
 * the bucket is reachable through it, however the address is edited.
 */
export const runtime = "nodejs";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!MAIL_IMG_NAME.test(name) || !r2Configured) return new NextResponse(null, { status: 404 });
  try {
    const obj = await withR2((client) => client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: `${MAIL_IMG_PREFIX}/${name}` })));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": TYPES[name.split(".").pop() as string] ?? "application/octet-stream",
        /* A picture never changes under its name, so it can be cached for good. */
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
