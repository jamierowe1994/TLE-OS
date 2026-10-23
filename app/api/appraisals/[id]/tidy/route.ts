import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { archiveAppraisal, deleteTestAppraisal, unarchiveAppraisal } from "@/lib/appraisal-tidy";

/**
 * POST /api/appraisals/<id>/tidy { action: "archive" | "unarchive" | "delete-test", why }
 *
 * The appraisal file's Tidy away (lib/appraisal-tidy). Deleting is only ever
 * a test file; everything else is archived and kept.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; why?: string };
  const why = typeof b.why === "string" ? b.why : "";
  const r =
    b.action === "archive"
      ? await archiveAppraisal(actor, id, why)
      : b.action === "unarchive"
        ? await unarchiveAppraisal(actor, id)
        : b.action === "delete-test"
          ? await deleteTestAppraisal(actor, id, why)
          : { ok: false, said: "Archive, bring back, or delete a test file." };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
