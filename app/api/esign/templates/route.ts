import { NextResponse } from "next/server";
import { esignTemplates } from "@/lib/rex-esign";
import { rexConfigured } from "@/lib/rex";

/**
 * TLE's contract templates, live from REX.
 *
 * Read rather than stored: a template's DocuSign id changes whenever the
 * document is re-uploaded, and a stale copy in our own database would send
 * last year's terms of business without anybody noticing. REX is the source.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, templates: await esignTemplates().catch(() => []) });
}
