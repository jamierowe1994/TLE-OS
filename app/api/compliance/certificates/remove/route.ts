import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { refreshComplianceBook } from "@/lib/compliance-cache";
import { REMOVE_REASONS, removeCertificate, type RemoveReason } from "@/lib/certificate-remove";

/**
 * POST /api/compliance/certificates/remove  { propertyId, key, reason }
 *
 * Take one certificate off a home: the wrong document, or one that is out of
 * date or replaced (lib/certificate-remove). Anyone who can file a
 * certificate can take one off, as filing is anyone's job; who did, and why,
 * is kept with the file.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { propertyId?: string; key?: string; reason?: string } | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  const key = String(b?.key ?? "").trim();
  const reason = String(b?.reason ?? "") as RemoveReason;
  if (!propertyId || !key) return NextResponse.json({ ok: false, error: "Which certificate?" }, { status: 400 });
  if (!(reason in REMOVE_REASONS)) return NextResponse.json({ ok: false, error: "Say why it is coming off." }, { status: 400 });

  const out = await removeCertificate({ propertyId, key, reason, by: actor.name || actor.email });
  if (!out.ok) return NextResponse.json(out, { status: 400 });
  /* Every screen that counts certificates reads the book: bring it up now. */
  void refreshComplianceBook().catch(() => null);
  return NextResponse.json({ ok: true, name: out.name });
}
