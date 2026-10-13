import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal, markTermsSent } from "@/lib/appraisal-store";
import { isTestFile } from "@/lib/test-guard";
import { fileTestSignature, TEST_SIGN_PREFIX } from "@/lib/test-terms";
import { signedFor } from "@/lib/signed-documents";

/**
 * A TEST FILE'S CONTRACT, SIGNED (James, 13 Oct 2026).
 *
 * POST { src: "demo:test:<appraisal id>", name } - pressed on the stand-in
 * signing sheet (components/landlord/DocusealEmbed) that a test file opens in
 * place of DocuSeal's. Files the one row every screen reads as "signed by
 * both sides" (lib/test-terms) and ticks Terms sent. Nothing reaches DocuSeal,
 * REX or an inbox. Refused for anything that is not a test file, so this can
 * never sign a real contract.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { src?: unknown };
  const src = typeof b.src === "string" ? b.src : "";
  if (!src.startsWith(TEST_SIGN_PREFIX)) return NextResponse.json({ ok: false, error: "Which contract?" }, { status: 400 });
  const id = src.slice(TEST_SIGN_PREFIX.length).trim();

  if (!(await isTestFile({ appraisalId: id }).catch(() => false))) {
    return NextResponse.json({ ok: false, error: "Only a test file's contract is signed here." }, { status: 409 });
  }
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  if (ma.valuation == null) return NextResponse.json({ ok: false, error: "Record the valuation first - the terms state the rent and the fee." }, { status: 409 });

  /* Once: pressing it twice files one signature, not two. */
  if (!(await signedFor(ma.id)).some((r) => r.completed_at)) {
    await fileTestSignature(ma.id, { name: ma.landlord, email: (ma.landlordEmail ?? "").trim() || me.email });
  }
  await markTermsSent(ma.id).catch(() => null);
  return NextResponse.json({ ok: true, test: true });
}
