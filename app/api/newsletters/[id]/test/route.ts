import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { NewsletterError, sendTest } from "@/lib/newsletters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Send me a test: one copy to the person pressing it, marked [Test]. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return new NextResponse(null, { status: 404 });
  try {
    await sendTest((await params).id, { email: me.email, name: me.name || "" });
    return NextResponse.json({ ok: true, message: `Test sent to ${me.email}.` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The test didn't send.";
    return NextResponse.json({ ok: false, error: e instanceof NewsletterError ? msg : `The test didn't send: ${msg}` }, { status: 400 });
  }
}
