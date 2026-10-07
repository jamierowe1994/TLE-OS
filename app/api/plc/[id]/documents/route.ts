import { NextRequest, NextResponse } from "next/server";
import { attachDocument, moveDocument, PlcRefused, removeDocument, setCovers } from "@/lib/plc-store";
import { checkById, COVERABLE, missingDocuments, PLC_CHECKS, type CheckId, type FileRead } from "@/lib/plc";
import { keyIsOurs, r2Configured } from "@/lib/r2";
import { actorName } from "@/lib/plc-actor";

/**
 * POST   /api/plc/<id>/documents  → file an already-uploaded document
 * PATCH  /api/plc/<id>/documents  → move one to another check ({ key, checkId })
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
  let body: { checkId?: string; name?: string; key?: string; placeholder?: boolean; read?: FileRead | null; hash?: string };
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
      read: cleanRead(body.read),
      hash: typeof body.hash === "string" && /^[0-9a-f]{64}$/.test(body.hash) ? body.hash : undefined,
      /* The reader saw a reference report pass Right to Rent: ticked, and the
         agent can untick it on the file. */
      covers: (cleanRead(body.read)?.alsoCovers ?? []).filter((x) => COVERABLE[checkId]?.includes(x)),
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

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { key?: string; checkId?: string; covers?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  /* What else this file answers ({ key, covers }): the tick on a reference
     report that it carries the Right to Rent check too. */
  if (body.key && Array.isArray(body.covers)) {
    try {
      const updated = await setCovers(id, body.key, body.covers.filter((x): x is CheckId => Boolean(checkById(x as CheckId))));
      return NextResponse.json({ ok: true, case: updated, missing: missingDocuments(updated).map((m) => m.id) });
    } catch (e) {
      return fail(e);
    }
  }
  const checkId = body.checkId as CheckId | undefined;
  if (!body.key || !checkId || !checkById(checkId)) {
    return NextResponse.json({ ok: false, error: "Which file, and which check?" }, { status: 400 });
  }
  try {
    const updated = await moveDocument(id, body.key, checkId);
    return NextResponse.json({ ok: true, case: updated, missing: missingDocuments(updated).map((m) => m.id) });
  } catch (e) {
    return fail(e);
  }
}

/** Only the fields we expect, so a caller cannot stuff the case with anything. */
function cleanRead(r: FileRead | null | undefined): FileRead | null {
  if (!r || typeof r !== "object") return null;
  const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const checkId = typeof r.checkId === "string" && checkById(r.checkId as CheckId) ? (r.checkId as CheckId) : null;
  return {
    checkId,
    what: String(r.what ?? "").slice(0, 80),
    issueDate: ymd(r.issueDate),
    expiryDate: ymd(r.expiryDate),
    ...(r.expiryDerived ? { expiryDerived: true } : {}),
    names: Array.isArray(r.names) ? r.names.map((n) => String(n).slice(0, 80)).slice(0, 8) : [],
    confidence: r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low",
    ...(r.note ? { note: String(r.note).slice(0, 240) } : {}),
    ...(Array.isArray(r.alsoCovers) ? { alsoCovers: r.alsoCovers.filter((x) => checkById(x as CheckId)) as CheckId[] } : {}),
    at: typeof r.at === "string" ? r.at.slice(0, 40) : new Date().toISOString(),
  };
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
