import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { createNewsletter, listNewsletters, sendingArmed, type NewsletterKind } from "@/lib/newsletters";

/**
 * Marketing's newsletters and event emails (lib/newsletters). Everything here
 * needs `see:marketing` - Francesca, Susan and James.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  return NextResponse.json({ ok: true, armed: await sendingArmed(), newsletters: await listNewsletters() });
}

/** Create email: a fresh draft on its starting layout. */
export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: string };
  const k: NewsletterKind = kind === "event" ? "event" : "newsletter";
  return NextResponse.json({ ok: true, newsletter: await createNewsletter(k, me.name || me.email) });
}
