import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { getKnowledge } from "@/lib/business/knowledge-store";
import { LIBRARY_SECTION } from "@/lib/marketing-library";

/**
 * GET /library/<entry id> - a marketing library file, for anybody with the
 * link (James, 13 Oct 2026: the tour's Steve hands out all 63 of them, and
 * the tour is public). Only a file that has a "Marketing library" knowledge
 * entry is served, by that entry's id - nothing else on the File Store, or
 * anywhere else in storage, can be reached through here. A five-minute
 * signed link to read it in the browser; ?save=1 downloads it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!r2Configured || !/^library-[a-f0-9]{12}$/.test(id)) return new NextResponse("Not found.", { status: 404 });
  const entry = await getKnowledge(id).catch(() => null);
  if (!entry || entry.section !== LIBRARY_SECTION) return new NextResponse("Not found.", { status: 404 });
  const key = entry.content.match(/^File key:\s*(library\/shelf\/[^\n]+)$/m)?.[1]?.trim();
  const name = entry.content.match(/^File:\s*(.+)$/m)?.[1]?.trim() ?? `${entry.title}.pdf`;
  if (!key) return new NextResponse("Not found.", { status: 404 });
  const save = req.nextUrl.searchParams.get("save") === "1";
  const url = await withR2((client) =>
    getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: `${save ? "attachment" : "inline"}; filename="${name.replace(/["\\]/g, "")}"`,
      }),
      { expiresIn: 300 }
    )
  );
  return NextResponse.redirect(url, 302);
}
