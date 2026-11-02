import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { whoIs } from "@/lib/admin";
import { shelfFiles } from "@/lib/library-files";
import { keyVisible, readFolderAccess, shelfViewer } from "@/lib/shelf-access";

/** GET /api/knowledge/files -> the File Store's shelf, for Marketing knowledge. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    /* Only the folders this person may see (lib/shelf-access). */
    const [files, viewer, access] = await Promise.all([shelfFiles(), shelfViewer(actor), readFolderAccess()]);
    return NextResponse.json({ ok: true, files: files.filter((f) => keyVisible(f.key, viewer.tier, access)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not read the File Store.") }, { status: 502 });
  }
}
