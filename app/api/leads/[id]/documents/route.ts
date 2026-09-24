import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { addDoc, docsFor, docToRex, updateDoc, type DocRexResult } from "@/lib/lead-documents";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";

/**
 * A lead's documents (lib/lead-documents): list, upload, rename or re-tag, and
 * send to REX again. Upload takes the same rules as every other piece of
 * evidence in the OS - the `document` scope's types and ceiling - and the file
 * is in R2 and on the lead before REX is asked for anything.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAGS = [
  "Right to Rent", "Proof of income", "Reference", "Tenancy agreement", "Bank statement", "Guarantor",
  "ID", "Proof of address", "Proof of ownership", "AML check", "EPC", "Gas safety", "EICR", "Other",
];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, docs: [] });
  return NextResponse.json({ ok: true, stored: true, docs: await docsFor(id) });
}

/** Viewing as somebody else, nothing goes to REX: it would carry the wrong name. */
async function toRex(
  who: { actorId: string; viewingAsOther: boolean },
  p: { leadId: string; docId: string; contactId: string | null }
): Promise<DocRexResult> {
  if (who.viewingAsOther) return { ok: false, why: "Not sent to REX while you are viewing as somebody else." };
  return docToRex({ ...p, byUserId: who.actorId });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be kept." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 });
  }
  const file = form.get("file");
  const tagRaw = String(form.get("tag") ?? "Other");
  const tag = TAGS.includes(tagRaw) ? tagRaw : "Other";
  const contactId = form.get("contactId") ? String(form.get("contactId")) : null;
  const scope = SCOPES.document;

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
  if (file.size > scope.maxBytes) {
    return NextResponse.json(
      { ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB - the limit is ${scope.maxBytes / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }
  if (!(scope.types as readonly string[]).includes(file.type)) {
    return NextResponse.json({ ok: false, error: "Only a PDF or a photo can go here." }, { status: 415 });
  }
  if (!r2Configured) {
    return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  }

  const key = `${scope.prefix}/lead-${safeName(id) || "unfiled"}/${Date.now()}-${safeName(file.name)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type,
          Metadata: { "original-name": encodeURIComponent(file.name) },
        })
      )
    );
  } catch (e) {
    console.error("[lead-documents] R2 upload failed", (e as Error)?.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }

  const who = subject ?? actor;
  const doc = await addDoc({
    leadId: id, name: file.name, tag, r2Key: key, mime: file.type, sizeBytes: file.size,
    byId: who.id, byName: who.name || who.email,
  });
  const rex = await toRex({ actorId: actor.id, viewingAsOther: !!subject && subject.id !== actor.id }, { leadId: id, docId: doc.id, contactId });
  const docs = await docsFor(id);
  return NextResponse.json({ ok: true, doc: docs.find((d) => d.id === doc.id) ?? doc, docs, rex });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    docId?: string; name?: string; tag?: string; sendToRex?: boolean; contactId?: string | null;
  };
  if (!body.docId) return NextResponse.json({ ok: false, error: "Which document?" }, { status: 400 });

  if (body.sendToRex) {
    const rex = await toRex(
      { actorId: actor.id, viewingAsOther: !!subject && subject.id !== actor.id },
      { leadId: id, docId: body.docId, contactId: body.contactId ? String(body.contactId) : null }
    );
    return NextResponse.json({ ok: true, rex, docs: await docsFor(id) });
  }

  const tag = body.tag !== undefined ? (TAGS.includes(body.tag) ? body.tag : null) : undefined;
  if (tag === null) return NextResponse.json({ ok: false, error: "That is not one of the document types." }, { status: 400 });
  const doc = await updateDoc(id, body.docId, { name: body.name, tag });
  if (!doc) return NextResponse.json({ ok: false, error: "That document is not on this lead." }, { status: 404 });
  return NextResponse.json({ ok: true, doc });
}
