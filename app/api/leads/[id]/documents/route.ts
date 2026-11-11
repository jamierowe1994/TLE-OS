import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { leadAccess } from "@/lib/lead-access";
import { hasDb } from "@/lib/db";
import { addDoc, docsFor, docToRex, updateDoc, type DocRexResult } from "@/lib/lead-documents";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { judgeFile } from "@/lib/upload-rules";
import { DOC_MIME, DOC_TYPES } from "@/lib/doc-types";

/**
 * A lead's documents (lib/lead-documents): list, upload, rename or re-tag, and
 * send to REX again. Upload takes the same rules as every other piece of
 * evidence in the OS - the `document` scope's types and ceiling - and the file
 * is in R2 and on the lead before REX is asked for anything.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* The tags a lead has always had, and since 5 Oct 2026 Kirstie's list
   (lib/doc-types), which the upload now asks for first. */
const TAGS = [
  "Right to Rent", "Proof of income", "Reference", "Tenancy agreement", "Bank statement", "Guarantor",
  "ID", "Proof of address", "Proof of ownership", "AML check", "EPC", "Gas safety", "EICR", "Other",
  ...DOC_TYPES.map((t) => t.label),
];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { denied } = await leadAccess(req, id);
  if (denied) return denied;
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
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { who: access, denied } = await leadAccess(req, id);
  if (denied) return denied;
  const { actor, subject } = access;
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
  /* An Other is named by whoever uploads it; anything else keeps the file's name. */
  const ownName = String(form.get("name") ?? "").trim();
  const scope = SCOPES.document;

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  /* One judge for every upload route (lib/upload-rules): a .jfif is kept as
     the JPEG it is, a file with no browser type goes by its extension, and a
     refusal names the file and what would be taken. */
  const judged = judgeFile(file, { types: DOC_MIME, maxBytes: scope.maxBytes });
  if (!judged.ok) return NextResponse.json({ ok: false, error: judged.error }, { status: judged.status });
  const fileName = judged.name;
  const mime = judged.type;
  if (!r2Configured) {
    return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  }

  const key = `${scope.prefix}/lead-${safeName(id) || "unfiled"}/${Date.now()}-${safeName(fileName)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET, Key: key, Body: body, ContentType: mime,
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
    leadId: id, name: ownName || fileName, tag, r2Key: key, mime, sizeBytes: file.size,
    byId: who.id, byName: who.name || who.email,
  });
  const rex = await toRex({ actorId: actor.id, viewingAsOther: !!subject && subject.id !== actor.id }, { leadId: id, docId: doc.id, contactId });
  const docs = await docsFor(id);
  return NextResponse.json({ ok: true, doc: docs.find((d) => d.id === doc.id) ?? doc, docs, rex });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { who: access, denied } = await leadAccess(req, id);
  if (denied) return denied;
  const { actor, subject } = access;
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
