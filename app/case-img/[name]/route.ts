import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { CASE_IMG_NAME, CASE_IMG_PREFIX } from "@/lib/case-images";

/**
 * A case study photo an agent added, public, for the website.
 *
 * Exempt from the sign-in door (middleware) like /mail-img, and safe for the
 * same reason: it only ever serves a name matching CASE_IMG_NAME from the
 * case-study-images prefix - a uuid we issued - so no other file in the
 * bucket is reachable through it.
 */
export const runtime = "nodejs";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!CASE_IMG_NAME.test(name) || !r2Configured) return new NextResponse(null, { status: 404 });
  try {
    const obj = await withR2((client) => client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: `${CASE_IMG_PREFIX}/${name}` })));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": TYPES[name.split(".").pop() as string] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
