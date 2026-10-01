import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { duplicateNewsletter, NewsletterError } from "@/lib/newsletters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Duplicate: a new draft copied from this one. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json({ ok: true, newsletter: await duplicateNewsletter((await params).id, me.name || me.email) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof NewsletterError ? e.message : "It didn't duplicate." }, { status: 400 });
  }
}
