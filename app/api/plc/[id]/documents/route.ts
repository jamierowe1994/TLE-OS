import { NextRequest, NextResponse } from "next/server";
import { attachDocument, PlcRefused, removeDocument } from "@/lib/plc-store";
import { checkById, missingDocuments, PLC_CHECKS, type CheckId } from "@/lib/plc";
import { keyIsOurs, r2Configured } from "@/lib/r2";
import { actorName } from "@/lib/plc-actor";

/**
 * POST   /api/plc/<id>/documents  → file an already-uploaded document
 * DELETE /api/plc/<id>/documents?key=... → take one back out
 *
 * The upload itself is /api/r2/upload, unchanged: it stores the bytes under
 * the `document` scope and hands back a key. This route only records that the
 * key belongs to this check on this case.
 *
 * Two steps rather than one on purpose. An upload that half-succeeded would
 * otherwise leave a case pointing at bytes that are not there, and the
 * document scope already refuses anything that is not a PDF or a photograph -
 * a rule that should stay in one place rather than be re-implemented here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { checkId?: string; name?: string; key?: string; placeholder?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  const checkId = body.checkId as CheckId | undefined;
  if (!checkId || !checkById(checkId)) {
    return NextResponse.json(
      { ok: false, error: `Unknown check. Expected one of: ${PLC_CHECKS.map((c) => c.id).join(", ")}.` },
      { status: 400 }
    );
  }

  /* ── A file with no bytes behind it ────────────────────────────────────

     On a laptop with no bucket attached the upload route refuses, and without
     this the wizard cannot be walked past its third screen — which is exactly
     when somebody stops reviewing it. So the caller may file a name instead of
     a file, and the case records that it did.

     Two things keep it honest. It is refused whenever storage IS configured,
     so the moment R2 is attached this path stops existing rather than becoming
     a way to fake a certificate. And the flag travels with the document, so
     every screen that lists a pack says "name only, not stored" rather than
     showing it as filed. */
  const placeholder = Boolean(body.placeholder);
  if (placeholder && r2Configured) {
    return NextResponse.json(
      { ok: false, error: "Storage is connected here, so upload the file itself." },
      { status: 400 }
    );
  }

  const key = (body.key ?? "").trim();
  /* The key has to be one we issued. Without this a caller could file an
     arbitrary bucket path against a case and the file route would happily
     sign it. */
  if (!keyIsOurs(key)) {
    return NextResponse.json({ ok: false, error: "That file reference isn't one of ours." }, { status: 400 });
  }

  try {
    const updated = await attachDocument(id, {
      checkId,
      name: (body.name ?? "").trim() || "Document",
      key,
      url: `/api/r2/file?key=${encodeURIComponent(key)}`,
      addedBy: await actorName(req, "Agent"),
      placeholder,
    });
    return NextResponse.json({
      ok: true,
      case: updated,
      missing: missingDocuments(updated).map((m) => m.id),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key) return NextResponse.json({ ok: false, error: "Which file?" }, { status: 400 });
  try {
    const updated = await removeDocument(id, key);
    /* The object itself is left in the bucket. Deleting it here would destroy
       evidence on the strength of one misclick, and the bucket is private and
       cheap. Unfiling is the reversible half; a real deletion is a separate,
       deliberate act. */
    return NextResponse.json({
      ok: true,
      case: updated,
      missing: missingDocuments(updated).map((m) => m.id),
    });
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown) {
  if (e instanceof PlcRefused) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
  }
  return NextResponse.json(
    { ok: false, error: e instanceof Error ? e.message : "That didn't work." },
    { status: 500 }
  );
}
