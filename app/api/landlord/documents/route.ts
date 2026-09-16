import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, isDocKind, landlordOwnsAppraisal } from "@/lib/landlord-account";
import { storeLandlordPages } from "@/lib/landlord-upload";
import { hasDb } from "@/lib/db";

/**
 * A landlord sends us a document, from their own signed-in file.
 *
 * Their own route rather than /api/r2/upload, for two reasons: that one is
 * behind the staff sign-in, and it stores bytes without recording what they
 * are. This one requires the landlord's session, files the bytes under the
 * landlord's own prefix, and records the KIND - which is what lets the file
 * say "the EPC is in" and take the ask off their list.
 *
 * The filing itself lives in lib/landlord-upload, shared with the QR hand-off
 * route next door. What stays here is the only thing the two do differently:
 * deciding who is asking.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }
  /* getAll, not get: the camera sends a page at a time and a two-sided
     certificate arrives as two. */
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") ?? "other");
  const kind = isDocKind(kindRaw) ? kindRaw : "other";
  const appraisalId = String(form.get("appraisalId") ?? "").trim() || null;
  if (appraisalId && !(await landlordOwnsAppraisal(me, appraisalId))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  const out = await storeLandlordPages({
    accountId: me.id,
    appraisalId,
    kind,
    files,
    label: String(form.get("label") ?? "") || undefined,
    via: "portal",
  });
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, document: out.document });
}
