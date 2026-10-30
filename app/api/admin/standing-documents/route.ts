import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import { DOC_MIME } from "@/lib/doc-types";
import { isScottish } from "@/lib/property-flags";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { isStandingKind, STANDING_KINDS } from "@/lib/standing-document-kinds";
import { setStandingDoc, standingDocs } from "@/lib/standing-documents";

/**
 * The documents kept once and shown on every let they apply to
 * (lib/standing-documents): the Easy Read Notes on every Scottish let.
 *
 *   GET   → each kind, its file or null, and how many homes on the book carry it
 *   POST  multipart: kind, file → the new version, on every such let at once
 *
 * The office and owners (see:pretenancy). Uploading sends nothing to anybody.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function office(req: NextRequest) {
  const who = await whoIs(req).catch(() => null);
  const me = who?.actor;
  if (!me || !can(me.role, "see:pretenancy")) return { me: null, viewingAs: false };
  return { me, viewingAs: Boolean(who?.viewingAs) };
}

async function listing() {
  const held = await standingDocs();
  /* How many homes on the OS's book are Scottish, so the page can say how far one upload reaches. */
  const homes = await q<{ postcode: string | null; address: string; locality: string }>(
    `SELECT postcode, address, locality FROM os_properties WHERE active`
  ).catch(() => []);
  const scottish = homes.filter((h) => isScottish(h.postcode, h.address, h.locality)).length;
  return STANDING_KINDS.map((k) => ({ ...k, homes: k.where === "scotland" ? scottish : null, doc: held.get(k.kind) ?? null }));
}

export async function GET(req: NextRequest) {
  const { me } = await office(req);
  if (!me) return NextResponse.json({ ok: false, error: "Only the office can see this." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  return NextResponse.json({ ok: true, kinds: await listing() });
}

export async function POST(req: NextRequest) {
  const { me, viewingAs } = await office(req);
  if (!me) return NextResponse.json({ ok: false, error: "Only the office can upload these." }, { status: 403 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be kept." }, { status: 503 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 });
  }
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if (!isStandingKind(kind)) return NextResponse.json({ ok: false, error: "Which document is this?" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
  /* It goes out by email (Email docs) and into a Propoly deal, so the email cap, not storage's. */
  const max = 12 * 1024 * 1024;
  if (file.size > max) {
    return NextResponse.json({ ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB - the limit is 12MB, so it can still be emailed.` }, { status: 413 });
  }
  const word = /\.(docx?)$/i.test(file.name);
  if (!DOC_MIME.includes(file.type) && !word) {
    return NextResponse.json({ ok: false, error: "Only a PDF, a photo or a Word document can go here. A PDF is best: Propoly only takes PDF, JPG or PNG." }, { status: 415 });
  }

  const key = `${SCOPES.document.prefix}/standing-${kind}/${Date.now()}-${safeName(file.name)}`;
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
    console.error("[standing-documents] R2 upload failed", (e as Error)?.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }
  await setStandingDoc({ kind, fileName: file.name, r2Key: key, mime: file.type, sizeBytes: file.size, by: { id: me.id, name: me.name || me.email } });
  return NextResponse.json({ ok: true, kinds: await listing() });
}
