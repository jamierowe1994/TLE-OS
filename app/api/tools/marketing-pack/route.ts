import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { shelfFiles } from "@/lib/library-files";
import { folderOfKey, readFolderAccess, shelfViewer, visibilityOf, type FolderAccess, type Visibility } from "@/lib/shelf-access";

/**
 * GET /api/tools/marketing-pack - Tools > Marketing Pack (Francesca, 2 Nov
 * 2026: "how will pro agents get access to this?").
 *
 * The File Store as an agent sees it: every file in a folder they may see
 * (lib/shelf-access), and, for an agent who isn't Pro, the names of the Pro
 * folders that hold something - so the page can say what the Pro package
 * adds without handing any of it over. Office only folders are never named.
 *
 * Read for the person on screen, so an owner viewing as an agent sees that
 * agent's pack; the downloads themselves are checked again on /api/r2/file.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PackFile = { key: string; name: string; folder: string; size: number; uploadedAt: string | null; level: Visibility };

/** Every folder and the ones above it, with what each is set to. */
function folderLevels(folders: string[], access: FolderAccess): Record<string, Visibility> {
  const out: Record<string, Visibility> = {};
  for (const f of folders) for (let p = f; p; p = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") out[p] = visibilityOf(p, access);
  return out;
}

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    const [files, viewer, access] = await Promise.all([shelfFiles(), shelfViewer(subject ?? actor), readFolderAccess()]);
    const shown: PackFile[] = [];
    /** The top of each Pro area this agent can't open, with how much is in it. */
    const pro = new Map<string, number>();
    for (const f of files) {
      const folder = folderOfKey(f.key);
      const level = visibilityOf(folder, access);
      if (viewer.tier === "office" || level === "everyone" || (level === "pro" && viewer.tier === "pro")) {
        shown.push({ key: f.key, name: f.name, folder, size: f.size, uploadedAt: f.uploadedAt, level });
        continue;
      }
      if (level !== "pro") continue;
      /* Climb to the highest folder that is still Pro, and name that one. */
      const steps = folder.split("/");
      let top = folder;
      for (let n = steps.length - 1; n > 0; n--) {
        const up = steps.slice(0, n).join("/");
        if (visibilityOf(up, access) !== "pro") break;
        top = up;
      }
      pro.set(top, (pro.get(top) ?? 0) + 1);
    }
    return NextResponse.json({
      ok: true,
      tier: viewer.tier,
      /* Launch Pad couldn't be asked: a Pro agent may be seeing less than they have. */
      unchecked: viewer.unchecked,
      files: shown,
      proFolders: [...pro].map(([folder, files]) => ({ folder, files })).sort((a, b) => a.folder.localeCompare(b.folder)),
      /* The office sees each folder's setting beside it. */
      ...(viewer.tier === "office" ? { levels: folderLevels(shown.map((f) => f.folder), access) } : {}),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "The Marketing Pack couldn't be read just now. Try again in a minute." }, { status: 503 });
  }
}
