import { NextRequest, NextResponse } from "next/server";
import { isDocKind } from "@/lib/landlord-account";
import { storeLandlordPages } from "@/lib/landlord-upload";
import { useHandoff } from "@/lib/doc-handoff";
import { hasDb } from "@/lib/db";

/**
 * A document arriving from a phone that scanned the QR.
 *
 * The one route in the landlord surface with no session behind it, so what it
 * refuses matters more than what it does:
 *
 *   * the ACCOUNT comes from the token, never from the request. There is no
 *     accountId field to send and nothing a caller could put in one.
 *   * the APPRAISAL comes from the token too, fixed when the desktop minted
 *     it. The signed-in route has to check that a landlord owns the appraisal
 *     they named; here there is nothing to name.
 *   * an expired token is caught HERE as well as at render, because a phone
 *     can sit on the page long past the window.
 *
 * What is left it shares with the signed-in route, in lib/landlord-upload: the
 * same size and type checks, the same prefix, the same row. A file that came
 * in this way is identical on the file to one that did not, bar a line of
 * metadata saying how it arrived.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }

  const token = String(form.get("token") ?? "");
  const at = await useHandoff(token);
  if (!at) {
    return NextResponse.json(
      { ok: false, expired: true, error: "This link has run out. Scan the code again from your computer." },
      { status: 401 }
    );
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") ?? "other");
  const kind = isDocKind(kindRaw) ? kindRaw : "other";

  const out = await storeLandlordPages({
    accountId: at.accountId,
    appraisalId: at.appraisalId,
    kind,
    files,
    label: String(form.get("label") ?? "") || undefined,
    via: "handoff",
  });
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, name: out.document.name, kind: out.document.kind });
}
