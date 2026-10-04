import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireAnyCapability } from "@/lib/admin";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { idCheckFile } from "@/lib/id-checks";

/**
 * GET /api/id-checks/file?id=<check id> → the ID photos or the share code result.
 *
 * The office's viewer that os_id_checks was promised on 16 Sep and never got:
 * the files sit under right-to-rent/, which the general /api/r2/file refuses,
 * so a passport is never one guessed key away from any signed-in agent. Only
 * pre-tenancy, compliance and the owners get past here, and only by the
 * check's own id - never by a key.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireAnyCapability(req, ["see:pretenancy", "see:agent-compliance"]);
  if (!me) return NextResponse.json({ ok: false, error: "This is for the office." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Which check?" }, { status: 400 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "File storage isn't set up here." }, { status: 503 });
  const f = await idCheckFile(id).catch(() => null);
  if (!f || !f.key.startsWith("right-to-rent/")) return NextResponse.json({ ok: false, error: "That check has no file." }, { status: 404 });
  try {
    const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: f.key })));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) throw new Error("empty");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": f.type || "application/octet-stream",
        "content-disposition": `inline; filename="${f.key.split("/").pop()}"`,
        /* A passport is never cached anywhere on the way. */
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "The file could not be read just now." }, { status: 502 });
  }
}
