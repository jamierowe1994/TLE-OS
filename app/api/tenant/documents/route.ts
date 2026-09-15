import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";
import { isTenantDocKind, recordTenantDocument, tenantDocuments } from "@/lib/tenant-documents";

/**
 * A TENANT SENDING US A DOCUMENT.
 *
 * Their Documents page has been outbound only - things they receive - and the
 * screen docs said the rest plainly: one file field on their profile and
 * nothing flowing into the OS. This is the way in. F1.12, the other half of J6.
 *
 * Written to mirror /api/landlord/documents exactly, because it is the same
 * job for the other customer and two different upload paths for one bucket is
 * how one of them ends up without a size limit.
 *
 * ── The prefix is the account, and the account is the session ────────────
 *
 * documents/tenant/<account>/... , taken from the signed-in tenant and never
 * from the request. A ref supplied by the browser would let one tenant write
 * into another's prefix, and the reading route would then hand it over quite
 * correctly, because it would be filed as theirs.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, documents: await tenantDocuments(me.id) });
}

export async function POST(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") ?? "other");
  const kind = isTenantDocKind(kindRaw) ? kindRaw : "other";

  /* The guards run BEFORE the storage check, deliberately - the same way round
     as /api/r2/upload, and for the reason written there: rules that can only
     be exercised in production are rules you are hoping about. */
  const scope = SCOPES.document;
  if (file.size > scope.maxBytes) {
    return NextResponse.json(
      { ok: false, error: `That file is too big. Up to ${Math.round(scope.maxBytes / 1024 / 1024)}MB, please.` },
      { status: 400 }
    );
  }
  if (!(scope.types as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { ok: false, error: `${file.type || "That kind of file"} isn't allowed here. A PDF or a photograph, please.` },
      { status: 400 }
    );
  }
  if (!r2Configured) {
    return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  }

  /* Their deal, read server side, so the agent's side of the file can show the
     document against the right tenancy. Null is fine and kept: somebody can
     send a reference in before the deal exists and it is still worth having. */
  const home = await loadTenantHome(me).catch(() => null);
  const dealId = home?.deal?.id ?? null;

  const clean = safeName(file.name) || "document";
  const key = `${scope.prefix}/tenant/${me.id}/${Date.now()}-${clean}`;
  const body = new Uint8Array(await file.arrayBuffer());

  try {
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.type,
          Metadata: { "original-name": encodeURIComponent(file.name), "tenant-account": me.id, kind },
        })
      )
    );
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("[tenant/documents] R2 upload failed", err.name, err.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }

  const document = await recordTenantDocument({
    accountId: me.id,
    dealId,
    kind,
    name: file.name,
    r2Key: key,
    bytes: file.size,
    contentType: file.type,
  });
  return NextResponse.json({ ok: true, document });
}
