import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { DOC_MIME, isDocType, OTHER, docTypeLabel } from "@/lib/doc-types";
import { addFileDoc, docsForHome, isFromKind, removeFileDoc } from "@/lib/file-documents";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { isTestId } from "@/lib/test-overlay";
import { isTestFile, TEST_STREET } from "@/lib/test-guard";

/**
 * A home's documents, from whichever file is open (lib/file-documents).
 *
 *   GET    /api/documents?address=&property=        → every document for that home
 *   POST   /api/documents   multipart: file, type, name (for Other), address, property, from, fromId
 *   DELETE /api/documents?id=                         → off the file (its uploader, or the office)
 *
 * Anyone signed in to the OS: Kirstie on a deal, an agent on a listing. An
 * upload goes to the OS and nowhere else - no email, no REX.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const home = (req: NextRequest) => ({
  address: req.nextUrl.searchParams.get("address") ?? "",
  propertyId: req.nextUrl.searchParams.get("property"),
});

const officeOf = (role: string) => can(role as never, "see:everything");

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, docs: [] });
  const me = subject ?? actor;
  const docs = await docsForHome(home(req), { id: me.id, office: officeOf(me.role) });
  return NextResponse.json({ ok: true, stored: true, docs });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (subject && subject.id !== actor.id) {
    return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be kept." }, { status: 503 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 });
  }
  const file = form.get("file");
  const type = String(form.get("type") ?? "");
  const ownName = String(form.get("name") ?? "").trim();
  const address = String(form.get("address") ?? "").trim();
  const propertyId = String(form.get("property") ?? "").trim() || null;
  const fromKind = String(form.get("from") ?? "");
  const fromId = String(form.get("fromId") ?? "").trim();

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  if (!isDocType(type)) return NextResponse.json({ ok: false, error: "Pick what the document is first." }, { status: 400 });
  if (type === OTHER && !ownName) return NextResponse.json({ ok: false, error: "Give the document a name." }, { status: 400 });
  if (!isFromKind(fromKind) || !fromId) return NextResponse.json({ ok: false, error: "Which file is this for?" }, { status: 400 });
  if (!address && !propertyId) return NextResponse.json({ ok: false, error: "This file has no address, so there is nowhere to keep it." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
  /* Next cuts a request body off at about 10MB once middleware has seen it (lib/r2). */
  const max = Math.min(SCOPES.document.maxBytes, 10 * 1024 * 1024);
  if (file.size > max) {
    return NextResponse.json(
      { ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB - the limit is ${max / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }
  const word = /\.(docx?)$/i.test(file.name);
  if (!DOC_MIME.includes(file.type) && !word) {
    return NextResponse.json({ ok: false, error: "Only a PDF, a photo or a Word document can go here." }, { status: 415 });
  }

  const slug = safeName(address || `property-${propertyId}`).slice(0, 60) || "unfiled";
  const key = `${SCOPES.document.prefix}/file-${slug}/${Date.now()}-${safeName(file.name)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type || "application/octet-stream",
          Metadata: { "original-name": encodeURIComponent(file.name) },
        })
      )
    );
  } catch (e) {
    console.error("[file-documents] R2 upload failed", (e as Error)?.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }

  const isTest = TEST_STREET.test(address) || isTestId(fromId) || (await isTestFile({ address }).catch(() => false));
  await addFileDoc({
    home: { address, propertyId },
    from: { kind: fromKind, id: fromId },
    type,
    name: type === OTHER ? ownName : docTypeLabel(type),
    fileName: file.name,
    r2Key: key,
    mime: file.type,
    sizeBytes: file.size,
    by: { id: actor.id, name: actor.name || actor.email },
    isTest,
  });
  /* Marked Terms of Business: REX needs it as a compliance entry before the
     listing can go live, so it is filed there too (lib/terms-to-rex). */
  let note: string | undefined;
  if (type === "terms_of_business" && propertyId && /^\d+$/.test(propertyId) && !isTest) {
    const { fileTermsToRex } = await import("@/lib/terms-to-rex");
    note = (await fileTermsToRex({ propertyId, r2Key: key, fileName: file.name, byName: actor.name || actor.email })).note;
  }
  const docs = await docsForHome({ address, propertyId }, { id: actor.id, office: officeOf(actor.role) });
  return NextResponse.json({ ok: true, docs, note });
}

export async function DELETE(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (subject && subject.id !== actor.id) {
    return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const done = await removeFileDoc(id, { id: actor.id, name: actor.name || actor.email, office: officeOf(actor.role) });
  if (!done) return NextResponse.json({ ok: false, error: "Only the person who added it, or the office, can take it off." }, { status: 403 });
  const docs = await docsForHome(home(req), { id: actor.id, office: officeOf(actor.role) });
  return NextResponse.json({ ok: true, docs });
}
