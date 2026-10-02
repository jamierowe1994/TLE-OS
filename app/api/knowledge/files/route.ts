import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { shelfFiles } from "@/lib/library-files";

/** GET /api/knowledge/files -> the File Store's shelf, for Marketing knowledge. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, files: await shelfFiles() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the File Store." }, { status: 502 });
  }
}
